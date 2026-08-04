/**
 * Declares the Kotlin class the Android template ships in
 * `template/app/src/main/kotlin/org/scriptc/demo/Fib.kt`.
 *
 * The JNI descriptors come from `metadata/`, which is regenerated with the
 * app's compiled Kotlin on the input list; this file only gives TypeScript the
 * matching surface. It is global (no imports/exports) so the `org` namespace
 * merges with the one `@nativescript/types-android` declares.
 */
declare namespace org.scriptc.demo {
  class Fib {
    constructor();
    /** Runs `compute(n)` and returns the elapsed milliseconds measured inside
     * the JVM, so the JNI round-trip is excluded from the number. */
    timeMillis(n: number): number;
    /** The value the last `timeMillis` call produced. */
    result(): number;
    /** Naive recursive Fibonacci, running as JVM bytecode. */
    compute(n: number): number;
  }
}
