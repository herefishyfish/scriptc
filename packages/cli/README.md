# scriptc

Compile ordinary TypeScript and JavaScript to small, fast native executables — no Node, no V8, no JavaScript engine in the binary. What compiles behaves byte-for-byte like Node.

```console
$ cat fib.ts
function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}
console.log(fib(30));

$ scriptc run fib.ts
832040

$ scriptc build fib.ts -o fib && ./fib
832040
```

## Install

```console
$ npm install -g scriptc
```

Requires clang on the PATH (Xcode Command Line Tools on macOS, `clang` package on Linux).

Builds use a bounded persistent cache by default. Unchanged executables and library archives skip native code generation and linking after fresh compiler metadata probes, while edited builds reuse stable runtime objects. The compiler remains required so dependency selection is rediscovered on every invocation. FFI builds with archive/object inputs or ambient `system_libraries` relink every time but still reuse runtime objects. Mutable compiler input paths such as `CPATH` and `SDKROOT`, and compiler wrappers, bypass persistent artifacts and objects so same-path dependency edits cannot go stale. Opaque archiver wrappers rebuild library program members and archives while retaining runtime-object reuse. Direct Clang, Apple's system Clang shim, `zig cc`, trusted platform archivers, and `zig ar` retain their applicable persistent tiers. Set `SCRIPTC_NO_CACHE=1` to bypass the cache or `SCRIPTC_CACHE_DIR` to choose its location; an existing POSIX override must already be private, otherwise caching is bypassed without changing its permissions.

## Commands

- `scriptc build <file.ts>` — compile to a native executable
- `scriptc build <file.ts> --target android` — emit a Gradle/NDK Android project
- `scriptc run <file.ts>` — compile and run
- `scriptc coverage <file.ts>` — what compiles statically, and why the rest doesn't

For embedder-hosted modules that are not installed npm packages, coverage can
map an exact bare specifier to a local declaration with repeatable
`--external-types <specifier=file.d.ts>` options. This is analysis-only: the
types unblock application measurement, while runtime module uses remain
reported as blockers.

No annotations, no dialect, no special stdlib: the same TypeScript you run on Node, type-checked by the real TypeScript compiler. Programs outside the static tier can opt into `--dynamic`, which embeds a small JavaScript engine (~620KB) for the parts that can't be static; everything else fails the build with a specific error code and usually a rewrite hint.

Native code can be called through an explicit, link-time C ABI manifest: declare the function signature in TypeScript, bind it to a C symbol, and build with `--ffi <manifest.json>`. See the [Native FFI guide](https://scriptc.dev/ffi).

Docs: [scriptc.dev](https://scriptc.dev)
