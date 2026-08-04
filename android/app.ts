/// <reference path="./fib.d.ts" />
import { performance } from "node:perf_hooks";
import { Application, Button, Color, FlexboxLayout, GridLayout, Image, ScrollView, StackLayout } from "@nativescript/core";

const activity = Application.android.foregroundActivity as android.app.Activity;
const button = new Button();
const resetButton = new Button();
const alertButton = new Button();
const benchButton = new Button();
let count = 0;

function render(): void {
  button.text = `${count} beers on the wall`;
}

render();
button.on(Button.tapEvent, () => {
  count += 1;
  render();
});

resetButton.text = "Reset";
resetButton.on(Button.tapEvent, () => {
  count = 0;
  render();
});

// The generated Android declarations type every system service as `any`, so
// the cast is how the BatteryManager gets its type back.
function batteryPercent(): number {
  const batteryManager = activity.getSystemService(
    android.content.Context.BATTERY_SERVICE,
  ) as android.os.BatteryManager;
  return batteryManager.getIntProperty(
    android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY,
  );
}

alertButton.text = "Show alert";
alertButton.on(Button.tapEvent, () => {
  const builder = new android.app.AlertDialog.Builder(activity);
  builder.setTitle("NativeScriptC");
  builder.setMessage(
    `The count is ${count}. Battery is at ${batteryPercent()}%.`,
  );
  builder.setPositiveButton(
    "Hello ScriptC",
    (() => {}) as unknown as android.content.DialogInterface.OnClickListener,
  );
  builder.show();
});

// Same naive algorithm on both sides: this one is compiled to native code by
// scriptc, org.scriptc.demo.Fib runs as JVM bytecode reached over JNI.
function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

const FIB_N = 30;

benchButton.text = `fib(${FIB_N})`;
benchButton.on(Button.tapEvent, () => {
  // Neither side counts the boundary: this one never crosses it, and the
  // Kotlin side brackets its own recursion with System.nanoTime.
  const tsStart = performance.now();
  const tsResult = fib(FIB_N);
  const tsMs = performance.now() - tsStart;

  const kotlinFib = new org.scriptc.demo.Fib();
  const kotlinMs = kotlinFib.timeMillis(FIB_N);
  const kotlinResult = kotlinFib.result();

  const kotlinWithBoundsStart = performance.now();
  const kotlinWithBounds = kotlinFib.compute(FIB_N);
  const kotlinWithBoundsMs = performance.now() - kotlinWithBoundsStart;

  const builder = new android.app.AlertDialog.Builder(activity);
  builder.setTitle(`fib(${FIB_N})`);
  builder.setMessage(
    `scriptc (native): ${tsResult} in ${tsMs.toFixed(1)}ms\n` +
      `Kotlin (JVM): ${kotlinResult} in ${kotlinMs.toFixed(1)}ms` +
      `\nKotlin (JVM, w/ bounds): ${kotlinWithBounds} in ${kotlinWithBoundsMs.toFixed(1)}ms`,
  );
  builder.setPositiveButton(
    "OK",
    (() => {}) as unknown as android.content.DialogInterface.OnClickListener,
  );
  builder.show();
});

const gridLayout = new GridLayout();
gridLayout.columns = "*, *, *, *";
gridLayout.height = 64;
gridLayout.addChildAtCell(button, 0, 0);
gridLayout.addChildAtCell(resetButton, 0, 1);
gridLayout.addChildAtCell(alertButton, 0, 2);
gridLayout.addChildAtCell(benchButton, 0, 3);

const flexbox = new FlexboxLayout();
flexbox.flexDirection = "row";
flexbox.flexWrap = "wrap";
for (let i = 0; i < 40; i++) {
  const view = new StackLayout();
  view.width = 64;
  view.height = 64;
  // toString(16) drops leading zeros, so pad — a short string reaches Color as
  // an invalid literal and throws.
  const bgColor = new Color(
    `#${Math.floor(Math.random() * 16777216).toString(16).padStart(6, "0")}`,
  );
  view.backgroundColor = bgColor;
  flexbox.addChild(view);
}

const logos = new GridLayout();
logos.columns = "*, *";
logos.height = 160;

const nativeScriptLogo = new Image();
nativeScriptLogo.src = "https://art.nativescript.org/logo/export/NativeScript_Logo_Blue_White.png";
nativeScriptLogo.stretch = "aspectFit";
logos.addChildAtCell(nativeScriptLogo, 0, 0);

const vercelLogo = new Image();
vercelLogo.src = "https://assets.vercel.com/image/upload/front/favicon/vercel/180x180.png";
vercelLogo.stretch = "aspectFit";
logos.addChildAtCell(vercelLogo, 0, 1);

const scrollView = new ScrollView();
const view = new StackLayout();

view.paddingTop = 160;
view.addChild(gridLayout);
view.addChild(logos);
view.addChild(flexbox);

// ContentView.content is the slot ScrollView measures and lays out. _addView
// only attaches to the logical tree, leaving _content null, so layoutView and
// onMeasure/onLayout see no child and nothing is ever sized.
scrollView.content = view;

// The ScrollView is the root view. Wrapping it in a StackLayout would stop it
// scrolling: a vertical StackLayout measures children with an unconstrained
// height, so the ScrollView would adopt its full content height instead of the
// screen's and never overflow.
const bgColor = new Color("#8591ff");
scrollView.backgroundColor = bgColor;
scrollView._setupAsRootView(activity);

activity.setContentView(
  scrollView.nativeViewProtected!,
  new org.nativescript.widgets.CommonLayoutParams(),
);
scrollView.callLoaded();
