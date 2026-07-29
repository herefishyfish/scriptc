import { Button, Color, StackLayout } from "@nativescript/core";

const activity = Application.android.foregroundActivity;
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
  builder.setPositiveButton("OK", () => {});
  builder.show();
});

const view = new StackLayout();
view.paddingTop = 160;
view.addChild(button);
view.addChild(resetButton);
view.addChild(alertButton);
const bgColor = new Color("#8591ff");
view.backgroundColor = bgColor;
view._setupAsRootView(activity);

activity.setContentView(view.nativeViewProtected!);
view.callLoaded();
