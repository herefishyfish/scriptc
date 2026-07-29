/* Android application artifact.
 *
 * The Android lane emits a conventional Gradle project instead of invoking
 * the host clang driver. AGP owns ABI fan-out, NDK sysroots, APK/AAB
 * packaging, signing, and deployment. scriptc supplies one generated C
 * translation unit plus its C runtime; the Java shell owns Activity
 * lifecycle and enters the program through a fixed JNI contract.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { runtimeSrcDir } from "../backend/cc.js";

export interface AndroidProjectOptions {
  outDir: string;
  generatedC: string;
  applicationId?: string;
  appName?: string;
  minSdk?: number;
  targetSdk?: number;
  compileSdk?: number;
}

export interface AndroidProjectResult {
  projectDir: string;
  nativeSourcePath: string;
}

function javaString(value: string): string {
  return JSON.stringify(value);
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validateApplicationId(value: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+$/.test(value)) {
    throw new Error(
      `invalid Android application id '${value}' (expected a dotted Java package name)`,
    );
  }
}

const require = createRequire(import.meta.url);
const ANDROID_TEMPLATE_DIR = join(
  dirname(require.resolve("@scriptc/android/package.json")),
  "template",
);

async function renderTemplateTree(
  sourceDir: string,
  outDir: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const relativePath = relative(ANDROID_TEMPLATE_DIR, sourcePath).replace(
      "__APPLICATION_ID_PATH__",
      replacements.get("__APPLICATION_ID_PATH__")!,
    );
    const outPath = join(outDir, relativePath);
    if (entry.isDirectory()) {
      await renderTemplateTree(sourcePath, outDir, replacements);
      continue;
    }
    let contents = await readFile(sourcePath, "utf8");
    for (const [token, value] of replacements) {
      contents = contents.replaceAll(token, value);
    }
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, contents);
  }
}

/** Write a self-contained Android Studio/Gradle project. */
export async function emitAndroidProject(
  options: AndroidProjectOptions,
): Promise<AndroidProjectResult> {
  const applicationId = options.applicationId ?? "org.scriptc.app";
  const appName = options.appName ?? "scriptc";
  const minSdk = options.minSdk ?? 23;
  const targetSdk = options.targetSdk ?? 36;
  const compileSdk = options.compileSdk ?? 36;
  validateApplicationId(applicationId);
  if (minSdk < 23 || minSdk > targetSdk || targetSdk > compileSdk) {
    throw new Error(
      `invalid Android SDK range min=${minSdk}, target=${targetSdk}, compile=${compileSdk}`,
    );
  }

  const projectDir = options.outDir;
  const mainDir = join(projectDir, "app", "src", "main");
  const cppDir = join(mainDir, "cpp");
  // Remove host files retired by newer templates when regenerating into an
  // existing output directory. The rest of the project remains incremental.
  await rm(
    join(mainDir, "java", "org", "scriptc", "runtime", "ScriptcClickListener.java"),
    { force: true },
  );
  await renderTemplateTree(
    ANDROID_TEMPLATE_DIR,
    projectDir,
    new Map([
      ["__APPLICATION_ID_PATH__", applicationId.split(".").join(sep)],
      ["__APPLICATION_ID_JSON__", javaString(applicationId)],
      ["__APPLICATION_ID__", applicationId],
      ["__APP_NAME_JSON__", javaString(appName)],
      ["__APP_NAME_XML__", xmlText(appName)],
      ["__APP_NAME__", appName],
      ["__MIN_SDK__", String(minSdk)],
      ["__TARGET_SDK__", String(targetSdk)],
      ["__COMPILE_SDK__", String(compileSdk)],
    ]),
  );

  const nativeSourcePath = join(cppDir, "scriptc_app.c");
  await writeFile(nativeSourcePath, options.generatedC);
  // Keep the artifact independent from the npm installation that produced
  // it. CMake only compiles the selected units, but all headers/helpers are
  // copied so their relative includes remain exact.
  const runtimeDir = runtimeSrcDir();
  await Promise.all([
    cp(runtimeDir, join(cppDir, "runtime"), { recursive: true }),
    cp(
      join(dirname(runtimeDir), "vendor", "ryu"),
      join(cppDir, "vendor", "ryu"),
      { recursive: true },
    ),
  ]);

  return { projectDir, nativeSourcePath };
}
