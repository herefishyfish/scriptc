import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { compileAndroid } from "@scriptc/compiler";

const root = mkdtempSync(join(tmpdir(), "scriptc-android-"));
const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "android-target",
);
const repositoryRoot = join(fixtures, "..", "..", "..");

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Android target", () => {
  test("emits a self-contained Gradle/NDK application project", async () => {
    const entry = join(fixtures, "hello.ts");
    const projectDir = join(root, "project");

    const result = await compileAndroid(entry, {
      outDir: projectDir,
      applicationId: "dev.scriptc.hello",
      appName: "Hello & <scriptc>",
      emitIr: true,
    });
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    }

    const generatedC = readFileSync(result.cPath, "utf8");
    expect(generatedC).toContain(
      "Java_org_scriptc_runtime_ScriptcRuntime_start",
    );
    expect(generatedC).toContain("scr_android_construct");
    expect(generatedC).toContain("scr_android_call_void");
    expect(generatedC).toContain('"(Ljava/lang/CharSequence;)V"');
    expect(generatedC).toContain('"(Landroid/view/View;)V"');
    expect(generatedC).not.toContain("scr_android_text_view_new");
    expect(generatedC).toContain("if (scr_exc_pending())");
    expect(generatedC).not.toMatch(/\bint main\s*\(/);
    expect(
      readFileSync(
        join(
          projectDir,
          "app/src/main/java/org/scriptc/runtime/ScriptcRuntime.java",
        ),
        "utf8",
      ),
    ).toContain("static native int start(Activity activity)");
    expect(
      readFileSync(
        join(
          projectDir,
          "app/src/main/java/dev/scriptc/hello/MainActivity.java",
        ),
        "utf8",
      ),
    ).toContain("ScriptcRuntime.start(this)");
    const cmake = readFileSync(
      join(projectDir, "app/src/main/cpp/CMakeLists.txt"),
      "utf8",
    );
    expect(cmake).toContain("runtime/scr_console.c");
    expect(cmake).toContain("max-page-size=16384");
    expect(
      readFileSync(
        join(projectDir, "app/src/main/cpp/runtime/scr_android.c"),
        "utf8",
      ),
    ).toContain("ExceptionCheck");
    expect(
      readFileSync(
        join(projectDir, "app/src/main/cpp/vendor/ryu/d2s.c"),
        "utf8",
      ),
    ).toContain("d2d");
    expect(
      readFileSync(
        join(projectDir, "app/src/main/res/values/strings.xml"),
        "utf8",
      ),
    ).toContain("Hello &amp; &lt;scriptc&gt;");
    expect(readFileSync(join(projectDir, "settings.gradle.kts"), "utf8")).toContain(
      'rootProject.name = "Hello & <scriptc>"',
    );
    expect(readFileSync(result.irPath!, "utf8")).toContain('"irVersion"');
  });

  test("refuses async graphs until the Android event-loop bridge exists", async () => {
    const result = await compileAndroid(join(fixtures, "async.ts"), {
      outDir: join(root, "async-project"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.some((d) => d.code === "SC6001")).toBe(true);
    }
  });

  test("folds NativeScript platform globals for Android", async () => {
    const result = await compileAndroid(join(fixtures, "platform.ts"), {
      outDir: join(root, "platform-project"),
    });
    if (!result.ok) {
      throw new Error(
        result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"),
      );
    }
    const generatedC = readFileSync(result.cPath, "utf8");
    expect(generatedC).not.toContain("global.undefRead");
    expect(generatedC).not.toContain("binding form with no lowering");
  });

  test("recognizes metadata-known classes from NativeScript-style declarations", async () => {
    const result = await compileAndroid(join(fixtures, "metadata-namespace.ts"), {
      outDir: join(root, "metadata-namespace-project"),
    });
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    }
    const generatedC = readFileSync(result.cPath, "utf8");
    expect(generatedC).toContain('"java/lang/StringBuilder"');
    expect(generatedC).toContain('"(Ljava/lang/String;)Ljava/lang/StringBuilder;"');
    expect(generatedC).toContain('"()Ljava/lang/String;"');
  });

  test("keeps JS state alive for an Android Button click callback", async () => {
    const projectDir = join(root, "counter-project");
    const result = await compileAndroid(join(fixtures, "counter.ts"), {
      outDir: projectDir,
      applicationId: "dev.scriptc.counter",
      appName: "JS Counter",
    });
    if (!result.ok) {
      throw new Error(result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    }

    const generatedC = readFileSync(result.cPath, "utf8");
    expect(generatedC).toContain("scr_android_construct");
    expect(generatedC).toContain("SCR_ANDROID_ARG_CALLBACK");
    expect(generatedC).toContain('"setAllCaps"');
    expect(generatedC).toContain('"(Z)V"');
    expect(generatedC).toContain("scr_android_static_number");
    expect(generatedC).toContain('"VERTICAL"');
    expect(generatedC).toContain('"setOrientation"');
    expect(generatedC).toContain('"setPadding"');
    expect(generatedC).toContain('"(IIII)V"');
    expect(generatedC).toContain('"addView"');
    expect(generatedC).toContain(
      '"(Landroid/view/View$OnClickListener;)V"',
    );
    expect(generatedC).not.toContain("scr_android_button_new");
    expect(generatedC).toContain("sc_android_started = true");
    expect(generatedC).toContain(
      "Java_org_scriptc_runtime_ScriptcRuntime_shutdown",
    );
    expect(generatedC).toMatch(/sc_g_.*loaded = false/);
    expect(
      readFileSync(
        join(
          projectDir,
          "app/src/main/java/org/scriptc/runtime/ScriptcInvocationHandler.java",
        ),
        "utf8",
      ),
    ).toContain("ScriptcRuntime.invokeCallback(callback)");
    expect(
      readFileSync(
        join(projectDir, "app/src/main/java/org/scriptc/runtime/ScriptcRuntime.java"),
        "utf8",
      ),
    ).toContain("Proxy.newProxyInstance");
    expect(
      readFileSync(
        join(
          projectDir,
          "app/src/main/java/dev/scriptc/counter/MainActivity.java",
        ),
        "utf8",
      ),
    ).toContain("ScriptcRuntime.shutdown()");
  });

  test("compiles NativeScript Core Button and StackLayout views", async () => {
    const result = await compileAndroid(
      join(repositoryRoot, "android", "app.ts"),
      {
        outDir: join(root, "nativescript-core-project"),
        applicationId: "dev.scriptc.coreviews",
      },
    );
    if (!result.ok) {
      throw new Error(
        result.diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"),
      );
    }

    const generatedC = readFileSync(result.cPath, "utf8");
    expect(generatedC).toContain('"android/widget/Button"');
    expect(generatedC).toContain('"android/widget/LinearLayout"');
    expect(generatedC).toContain('"setOnClickListener"');
    expect(generatedC).toContain('"addView"');
    // The alert button resolves the nested Builder type and the dialog
    // listener through metadata, without any dialog-specific binding.
    expect(generatedC).toContain('"android/app/AlertDialog$Builder"');
    expect(generatedC).toContain('"setPositiveButton"');
    expect(generatedC).toContain(
      '"(Ljava/lang/CharSequence;Landroid/content/DialogInterface$OnClickListener;)Landroid/app/AlertDialog$Builder;"',
    );
    expect(generatedC).not.toContain("__ANDROID__");
    expect(generatedC).not.toContain("scr_throw_error_msg_code");
  });
});
