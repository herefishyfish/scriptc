#!/usr/bin/env node
// Stage the jars that NativeScript's metadata generator reads, then hand them
// to generate-metadata.mjs.
//
// The generator takes plain jars, but most of what the compiled app can call
// ships as AARs, so each AAR's classes.jar is extracted into a staging
// directory under a name that says where it came from — manifest.json records
// those basenames, and opaque names make the recorded input set impossible to
// reproduce later.
//
// The androidx coordinates below are resolved out of the local Gradle module
// cache, so run a `gradle :app:assembleDebug` on a generated project at least
// once first. They mirror `template/app/build.gradle.kts`; when a dependency
// there changes version, change it here too and regenerate.

import { execFileSync, spawn } from "node:child_process";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";

/** AAR/jar coordinates whose APIs the compiled JavaScript may call. */
const COORDINATES = [
  { group: "androidx.core", name: "core", version: "1.13.0", packaging: "aar" },
  { group: "androidx.appcompat", name: "appcompat", version: "1.7.0", packaging: "aar" },
  { group: "androidx.appcompat", name: "appcompat-resources", version: "1.7.0", packaging: "aar" },
  { group: "androidx.fragment", name: "fragment", version: "1.8.5", packaging: "aar" },
  { group: "androidx.transition", name: "transition", version: "1.5.1", packaging: "aar" },
  { group: "androidx.viewpager", name: "viewpager", version: "1.1.0", packaging: "aar" },
  { group: "androidx.activity", name: "activity", version: "1.8.1", packaging: "aar" },
  { group: "androidx.lifecycle", name: "lifecycle-runtime", version: "2.6.2", packaging: "aar" },
  { group: "androidx.lifecycle", name: "lifecycle-common", version: "2.6.2", packaging: "jar" },
];

/** NativeScript's own AARs, which ship inside @nativescript/core. */
const CORE_AARS = ["widgets-release.aar", "winter_tc-release.aar"];

function usage(message) {
  if (message) console.error(message);
  console.error(
    "Usage: node android/scripts/stage-metadata-inputs.mjs " +
      "--generator <android-metadata-generator.jar> " +
      "--android-jar <android.jar> [--jar <extra.jar>]... [--out <directory>]\n\n" +
      "--jar adds application or plugin classes (for example the app's own " +
      "compiled Kotlin) on top of the staged platform set.",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const values = new Map();
  const extraJars = [];
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i];
    const value = argv[i + 1];
    if (!name?.startsWith("--") || value === undefined) usage();
    const key = name.slice(2);
    if (key === "jar") extraJars.push(resolve(value));
    else values.set(key, value);
  }
  if (!values.get("generator") || !values.get("android-jar")) {
    usage("Both --generator and --android-jar are required.");
  }
  return {
    generator: resolve(values.get("generator")),
    androidJar: resolve(values.get("android-jar")),
    extraJars,
    out: values.get("out"),
  };
}

function run(command, args, cwd) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${basename(command)} exited with ${code}`)),
    );
  });
}

const CACHE_ROOT = join(homedir(), ".gradle", "caches", "modules-2", "files-2.1");

/** Gradle stores each artifact under a per-file sha1 directory, so the exact
 * leaf name is not predictable — scan the version directory instead. */
async function findInGradleCache({ group, name, version, packaging }) {
  const versionDir = join(CACHE_ROOT, group, name, version);
  const wanted = `${name}-${version}.${packaging}`;
  let hashDirs;
  try {
    hashDirs = await readdir(versionDir, { withFileTypes: true });
  } catch {
    throw new Error(
      `${group}:${name}:${version} is not in the Gradle cache (${versionDir}). ` +
        "Build a generated Android project once so Gradle downloads it.",
    );
  }
  for (const dir of hashDirs) {
    if (!dir.isDirectory()) continue;
    const files = await readdir(join(versionDir, dir.name));
    if (files.includes(wanted)) return join(versionDir, dir.name, wanted);
  }
  throw new Error(`${wanted} not found under ${versionDir}`);
}

/** Pull classes.jar out of an AAR without assuming a particular unzip binary
 * is on PATH. */
async function extractClassesJar(archive, destination) {
  execFileSync(
    process.platform === "win32" ? "powershell" : "sh",
    process.platform === "win32"
      ? [
        "-NoProfile",
        "-Command",
        `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
          `$zip=[System.IO.Compression.ZipFile]::OpenRead('${archive}'); ` +
          `$entry=$zip.GetEntry('classes.jar'); ` +
          `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry,'${destination}',$true); ` +
          `$zip.Dispose()`,
      ]
      : ["-c", `unzip -o -q -j "${archive}" classes.jar -d "$(dirname "${destination}")"`],
    { stdio: "ignore" },
  );
}

const options = parseArgs(process.argv.slice(2));
const scriptDir = dirname(process.argv[1]);
const androidDir = join(scriptDir, "..");
const staging = await mkdtemp(join(tmpdir(), "scriptc-metadata-inputs-"));
try {
  const staged = [];
  for (const coordinate of COORDINATES) {
    const source = await findInGradleCache(coordinate);
    const target = join(staging, `${coordinate.name}-${coordinate.version}.jar`);
    if (coordinate.packaging === "jar") await cp(source, target);
    else await extractClassesJar(source, target);
    staged.push(target);
  }
  const coreAndroid = join(
    androidDir,
    "node_modules",
    "@nativescript",
    "core",
    "platforms",
    "android",
  );
  for (const aar of CORE_AARS) {
    const target = join(staging, aar.replace(/-release\.aar$/, "-classes.jar"));
    await extractClassesJar(join(coreAndroid, aar), target);
    staged.push(target);
  }

  const args = [
    join(scriptDir, "generate-metadata.mjs"),
    "--generator",
    options.generator,
    "--android-jar",
    options.androidJar,
  ];
  for (const jar of [...staged, ...options.extraJars]) args.push("--jar", jar);
  if (options.out) args.push("--out", resolve(options.out));
  await run(process.execPath, args, androidDir);
} finally {
  await rm(staging, { recursive: true, force: true });
}
