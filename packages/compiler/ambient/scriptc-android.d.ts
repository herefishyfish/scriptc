/** ScriptC Android host bootstrap. Platform API declarations come from the
 * installed @nativescript/types-android package; this file only exposes the
 * Activity instance supplied by ScriptC's generated host to low-level tests.
 * Applications should normally import Application from @nativescript/core. */
declare const Application: {
  readonly android: {
    readonly foregroundActivity: android.app.Activity;
  };
};
