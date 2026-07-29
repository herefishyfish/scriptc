import {
  Application,
  Button,
  Color,
  GridLayout,
  StackLayout,
} from "@nativescript/core";

const activity =
  Application.android.foregroundActivity as android.app.Activity;
const button = new Button();
const resetButton = new Button();
const alertButton = new Button();
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

alertButton.text = "Show alert";
alertButton.on(Button.tapEvent, () => {
  const builder = new android.app.AlertDialog.Builder(activity);
  builder.setTitle("NativeScriptC");
  builder.setMessage(`The count is ${count}.`);
  builder.setPositiveButton(
    "OK",
    (() => {}) as unknown as android.content.DialogInterface.OnClickListener,
  );
  builder.show();
});

const gridLayout = new GridLayout();
gridLayout.columns = "*, *, *";
gridLayout.height = 64;
gridLayout.addChildAtCell(button, 0, 0);
gridLayout.addChildAtCell(resetButton, 0, 1);
gridLayout.addChildAtCell(alertButton, 0, 2);

const view = new StackLayout();
view.paddingTop = 160;
view.addChild(gridLayout);
const bgColor = new Color("#8591ff");
view.backgroundColor = bgColor;
view._setupAsRootView(activity);

activity.setContentView(
  view.nativeViewProtected!,
  new org.nativescript.widgets.CommonLayoutParams(),
);
view.callLoaded();
