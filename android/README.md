# scriptc Android

This directory owns the Android host package and runnable JavaScript example.

- `template/` is the Gradle/JNI host copied by `scriptc build --target android`.
- `metadata/` contains NativeScript's generated Android API streams consumed
  by the compiler for overload and JVM-descriptor resolution.
- `scripts/generate-metadata.mjs` regenerates those streams from a NativeScript
  metadata-generator JAR and an Android platform JAR.
- `node_modules/@nativescript/core` supplies the real NativeScript Core
  JavaScript implementation and its published TypeScript declarations.
- `app.ts` is a compiled TypeScript counter app using `Button`, `Color`, and
  `StackLayout` from `@nativescript/core`, plus a reset button and a third
  button that opens an `android.app.AlertDialog`.

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

The generated program embeds and executes the installed NativeScript Core
JavaScript. Android builds select `.android.js` and expose the platform globals
that the package expects. Scriptc's Android host implements the NativeScript
runtime boundary—metadata-backed Java access and callbacks—but does not
reimplement Core views or application behavior.
