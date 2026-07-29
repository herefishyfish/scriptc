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

## Commands

- `scriptc build <file.ts>` — compile to a native executable
- `scriptc build <file.ts> --target android` — emit a Gradle/NDK Android project
- `scriptc run <file.ts>` — compile and run
- `scriptc coverage <file.ts>` — what compiles statically, and why the rest doesn't

No annotations, no dialect, no special stdlib: the same TypeScript you run on Node, type-checked by the real TypeScript compiler. Programs outside the static tier can opt into `--dynamic`, which embeds a small JavaScript engine (~620KB) for the parts that can't be static; everything else fails the build with a specific error code and usually a rewrite hint.

Native code can be called through an explicit, link-time C ABI manifest: declare the function signature in TypeScript, bind it to a C symbol, and build with `--ffi <manifest.json>`. See the [Native FFI guide](https://scriptc.dev/ffi).

Docs: [scriptc.dev](https://scriptc.dev)
