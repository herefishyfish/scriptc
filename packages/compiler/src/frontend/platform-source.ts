import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

let sourcePlatform: string | null = null;
let sourceRoot: string | null = null;

/** Selects the platform-specific source-file convention for one frontend
 * load. NativeScript source packages use sibling names such as
 * index.android.ts, while published packages contain index.android.js; the
 * public import remains "./button" / "./button/index". */
export function setSourcePlatform(
  platform: string | null,
  entryPath?: string,
): void {
  sourcePlatform = platform;
  sourceRoot =
    platform !== null && entryPath !== undefined
      ? dirname(resolve(entryPath))
      : null;
}

export function sourcePlatformName(): string | null {
  return sourcePlatform;
}

/** NativeScript's `~/path` application-root convention. The platform
 * bundler resolves this independently of the importing package, including
 * imports inside @nativescript/core itself. */
export function platformProjectSource(specifier: string): string | null {
  if (
    sourcePlatform !== "android" ||
    sourceRoot === null ||
    !specifier.startsWith("~/")
  ) {
    return null;
  }
  const path = join(sourceRoot, specifier.slice(2));
  return existsSync(path) ? path : null;
}

/** Returns the real platform sibling whose contents should back `path`.
 * The caller deliberately keeps `path` as the module identity so the
 * checker and scriptc's resolver agree even when the generic file does not
 * physically exist (NativeScript view directories commonly have only a
 * platform-specific implementation). */
export function platformSourceSibling(path: string): string | null {
  if (sourcePlatform === null) return null;
  const match = /^(.*)(\.(?:d\.ts|ts|tsx|mts|cts|js|mjs|cjs|jsx))$/.exec(path);
  if (!match) return null;
  const sibling = `${match[1]}.${sourcePlatform}${match[2]}`;
  return existsSync(sibling) ? sibling : null;
}
