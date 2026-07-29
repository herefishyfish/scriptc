# scriptc Android

This directory owns the Android host package and runnable JavaScript example.

- `template/` is the Gradle/JNI host copied by `scriptc build --target android`.
- `metadata/` contains NativeScript's generated Android API streams consumed
  by the compiler for overload and JVM-descriptor resolution.
- `scripts/generate-metadata.mjs` regenerates those streams from a NativeScript
  metadata-generator JAR and an Android platform JAR.
- `app.ts` is a compiled JavaScript counter app used for device smoke tests.

From the repository root:

```console
$ scriptc build android/app.ts --target android -o android/build/counter
```

Open `android/build/counter` in Android Studio or build it with Gradle. The
button starts at `Count: 0`; each Android click invokes the retained compiled
JavaScript closure and updates the label.

To refresh the platform metadata, run
`node android/scripts/generate-metadata.mjs --generator <generator.jar>
--android-jar <android.jar>`.

Pass `--jar path/to/library.jar` repeatedly to include application or plugin
Java APIs. `metadata/manifest.json` records SHA-256 hashes for the generator,
inputs, and resulting streams.

The generated program does not embed the NativeScript JavaScript runtime.
scriptc consumes NativeScript's metadata at compile time and emits resolved
calls for its generic JNI binding engine.
