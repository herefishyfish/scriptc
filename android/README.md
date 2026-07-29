# scriptc Android

This directory owns the Android host package and runnable JavaScript example.

- `template/` is the Gradle/JNI host copied by `scriptc build --target android`.
- `metadata/` contains NativeScript's generated Android API streams consumed
  by the compiler for overload and JVM-descriptor resolution.
- `scripts/generate-metadata.mjs` regenerates those streams from a NativeScript
  metadata-generator JAR and an Android platform JAR.
- `compat/` is the first NativeScript Core view compatibility slice.
- `app.ts` is a compiled TypeScript counter app using `Button` and
  `StackLayout` from `@nativescript/core`, plus a second button that opens
  an `android.app.AlertDialog`.

From the repository root:

```console
$ scriptc build android/app.ts --target android --android-package dev.scriptc.counter -o android/build/counter
```

On Windows, the helper script rebuilds scriptc, generates the project, builds
the debug APK, selects the sole connected device/emulator, installs, and
launches it:

```powershell
.\android\run.ps1
```

Pass `-Serial <adb-serial>` when multiple devices or emulators are connected.
Use `-SkipToolBuild` for faster app-only rebuilds.

Open `android/build/counter` in Android Studio or build it with Gradle. The
button starts at `Count: 0`; each Android click invokes the retained compiled
JavaScript closure and updates the label. The `Show alert` button builds an
`AlertDialog.Builder` through metadata-resolved JNI calls and shows the
current count; its `OK` handler rides the same generic listener proxy as the
counter's click listener.

To refresh the platform metadata, run
`node android/scripts/generate-metadata.mjs --generator <generator.jar>
--android-jar <android.jar>`.

Pass `--jar path/to/library.jar` repeatedly to include application or plugin
Java APIs. `metadata/manifest.json` records SHA-256 hashes for the generator,
inputs, and resulting streams.

The generated program does not embed the NativeScript JavaScript runtime.
Android builds select `.android.js`, fold `__ANDROID__` to true (and the Apple
platform flags to false), and statically provide the supported NativeScript
Core view slice. NativeScript metadata still resolves every platform call
through scriptc's generic JNI binding engine.
