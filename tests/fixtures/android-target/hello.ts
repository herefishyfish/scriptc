const activity = Application.android.foregroundActivity;
const label = new android.widget.TextView(activity);
label.setText("hello from Android");
activity.setContentView(label);
