import { Button, StackLayout } from "@nativescript/core";

const activity = Application.android.foregroundActivity;
const button = new Button();
const alertButton = new Button();
let count = 0;

function render(): void {
  button.text = `Count: ${count}`;
}

render();
button.on(Button.tapEvent, () => {
  count += 2;
  render();
});

alertButton.text = "Show alert";
alertButton.on(Button.tapEvent, () => {
  const builder = new android.app.AlertDialog.Builder(activity);
  builder.setTitle("scriptc");
  builder.setMessage(`The count is ${count}.`);
  builder.setPositiveButton("OK", () => {});
  builder.show();
});

const view = new StackLayout();
view.paddingTop = 160;
view.addChild(button);
view.addChild(alertButton);
view.backgroundColor = 'red';
view._setupAsRootView(activity);

activity.setContentView(view.nativeViewProtected!);
