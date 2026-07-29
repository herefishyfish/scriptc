const activity = Application.android.foregroundActivity;
const button = new android.widget.Button(activity);
button.setAllCaps(false);
let count = 0;

button.setText(`Count: ${count}`);
button.setOnClickListener(
  (() => {
    count += 2;
    button.setText(`Count: ${count}`);
  }) as unknown as android.view.View.OnClickListener,
);
const view = new android.widget.LinearLayout(activity);
view.setOrientation(android.widget.LinearLayout.VERTICAL);
view.setPadding(0, 160, 0, 0);
view.addView(button);
activity.setContentView(view);
