import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

let sourcePlatform: string | null = null;
const require = createRequire(import.meta.url);
const androidPackageRoot = dirname(
  require.resolve("@scriptc/android/package.json"),
);

/** Selects the platform-specific source-file convention for one frontend
 * load. NativeScript packages use sibling names such as index.android.js;
 * the public import remains "./button" / "./button/index.js". */
export function setSourcePlatform(platform: string | null): void {
  sourcePlatform = platform;
}

/** Returns the real platform sibling whose contents should back `path`.
 * The caller deliberately keeps `path` as the module identity so the
 * checker and scriptc's resolver agree even when the generic file does not
 * physically exist (NativeScript view directories commonly have only
 * index.android.js and index.ios.js). */
export function platformSourceSibling(path: string): string | null {
  if (sourcePlatform === null) return null;
  const normalized = path.split("\\").join("/");
  if (
    sourcePlatform === "android" &&
    (normalized.endsWith("/node_modules/@nativescript/core/index.js") ||
      normalized.endsWith(
        "/node_modules/@nativescript/core/ui/button/index.js",
      ) ||
      normalized.endsWith(
        "/node_modules/@nativescript/core/ui/layouts/stack-layout/index.js",
      ))
  ) {
    return join(androidPackageRoot, "compat", "nativescript-core", "index.js");
  }
  const match = /^(.*)(\.(?:js|mjs|cjs|jsx))$/.exec(path);
  if (!match) return null;
  const sibling = `${match[1]}.${sourcePlatform}${match[2]}`;
  return existsSync(sibling) ? sibling : null;
}
