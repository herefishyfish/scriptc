package org.scriptc.demo

/**
 * Naive recursive Fibonacci, used by the sample app to compare JVM bytecode
 * against the same algorithm compiled to native code by scriptc.
 *
 * The timing happens on this side of the boundary: `timeMillis` brackets only
 * the recursion, so the JNI round-trip and argument marshalling that reaching
 * this method costs are not part of the reported number. The result is kept in
 * [lastResult] rather than returned, so reading it is a separate call outside
 * the measured region.
 *
 * This is an instance class rather than an `object` with `@JvmStatic` because
 * scriptc's NativeScript metadata bridge resolves constructors and instance
 * methods, but has no lowering for static method calls yet.
 */
class Fib {
    private var lastResult: Long = 0

    /** Elapsed milliseconds for `compute(n)`, measured inside the JVM. */
    fun timeMillis(n: Int): Double {
        val start = System.nanoTime()
        lastResult = compute(n)
        return (System.nanoTime() - start) / 1_000_000.0
    }

    /** The value the last [timeMillis] call produced. */
    fun result(): Double = lastResult.toDouble()

    fun compute(n: Int): Long = if (n < 2) n.toLong() else compute(n - 1) + compute(n - 2)
}
