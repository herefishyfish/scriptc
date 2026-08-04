# scriptc Android

This directory owns the Android host package and runnable JavaScript example.

- `template/` is the Gradle/JNI host copied by `scriptc build --target android`.
- `metadata/` contains NativeScript's generated Android API streams consumed
  by the compiler for overload and JVM-descriptor resolution.
- `scripts/generate-metadata.mjs` regenerates those streams from a NativeScript
  metadata-generator JAR and an Android platform JAR.
- `scripts/stage-metadata-inputs.mjs` assembles the jar set that generator
  reads and calls it — see "Refreshing the metadata" below.
- `node_modules/@nativescript/core` supplies the real NativeScript Core
  JavaScript implementation and its published TypeScript declarations.
- `tsconfig.json` loads `@nativescript/types`, so editors and standalone
  TypeScript checks see the generated Android and NativeScript globals used by
  `app.ts`; ScriptC selects the same bundle for Android builds.
- `app.ts` is a compiled TypeScript counter app using `Button`, `Color`,
  `GridLayout`, `Image`, and `StackLayout` from `@nativescript/core`, plus a
  reset button, a button that opens an `android.app.AlertDialog`, and a
  `fib(30)` button that compares scriptc against Kotlin.
- `fib.d.ts` declares the template's Kotlin class for TypeScript; the JNI
  descriptors themselves come from `metadata/`.

`widgets-release.aar` is consumed as a local file dependency, so Gradle does
not resolve its transitive requirements — the template declares them by hand
in `template/app/build.gradle.kts`. `Image` needs two of them:
`androidx.exifinterface` (`image.Fetcher` reads EXIF on every decode; without
it any image load dies with `NoClassDefFoundError`) and
`androidx.documentfile` (`Utils`/`FileHelper`). Remote `Image.src` values also
need the `android.permission.INTERNET` the template manifest declares.

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
counter starts at `0 beers on the wall`; each tap invokes the retained
compiled JavaScript closure, increments the count, and updates the button.
The `Show alert` button builds an
`AlertDialog.Builder` through metadata-resolved JNI calls and shows the
current count plus the battery percentage; its `OK` handler rides the same
generic listener proxy as the counter's click listener. The battery reading
registers a null receiver against the sticky `ACTION_BATTERY_CHANGED`
broadcast — `getSystemService` returns `any`, which scriptc cannot check-cast
to a native type yet (`SC1090`).

## The fib(30) comparison

`fib(30)` runs the same naive recursion twice: once as TypeScript compiled to
native code by scriptc, once as JVM bytecode in
`template/app/src/main/kotlin/org/scriptc/demo/Fib.kt`, reached over JNI.

Neither number includes the boundary. The TypeScript side never crosses it,
and `Fib.timeMillis` brackets only its own recursion with `System.nanoTime`,
returning the elapsed milliseconds; the result is read back separately through
`Fib.result()`. On an x86_64 emulator scriptc lands around 3.5-5ms per tap.
The Kotlin side is the noisier of the two — roughly 6-14ms, highest on the
first tap and settling as the JIT warms — so read a few taps, not one.

`Fib` is an instance class rather than an `object` with `@JvmStatic` because
the metadata bridge resolves constructors and instance methods but has no
lowering for static method calls yet.

## Refreshing the metadata

`stage-metadata-inputs.mjs` extracts each AAR's `classes.jar` under a name that
records where it came from, then calls `generate-metadata.mjs`:

```console
$ node android/scripts/stage-metadata-inputs.mjs \
    --generator <android-metadata-generator.jar> \
    --android-jar <sdk>/platforms/android-35/android.jar
```

Its coordinate list mirrors `template/app/build.gradle.kts`; when a dependency
version changes in one, change it in the other. The jars are resolved from the
local Gradle module cache, so build a generated project once first.

Pass `--jar path/to/library.jar` repeatedly to add application or plugin Java
APIs. The app's own Kotlin is one of these — anything callable from `app.ts`
has to be on the input list, so changing `Fib.kt`'s signatures means compiling
it (`gradle :app:compileDebugKotlin`), jarring
`app/build/tmp/kotlin-classes/debug`, and regenerating with that jar before
`app.ts` will compile against the new methods.

`metadata/manifest.json` records SHA-256 hashes for the generator, inputs, and
resulting streams.

The generated program embeds and executes the installed NativeScript Core
JavaScript. Android builds select `.android.js` and expose the platform globals
that the package expects. Scriptc's Android host implements the NativeScript
runtime boundary—metadata-backed Java access and callbacks—but does not
reimplement Core views or application behavior.
