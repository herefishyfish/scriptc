/**
 * The first scriptc-compatible NativeScript Core view slice.
 *
 * It intentionally implements the public Core API used by the Android
 * counter while the compiler grows support for Core's full JS runtime
 * graph. Native views still come exclusively from metadata-resolved Android
 * APIs; there are no widget-specific JNI entry points here.
 */

export class Button {
  static tapEvent = "tap";

  constructor() {
    this._text = "";
    this._tap = () => {};
  }

  get text() {
    return this._text;
  }

  set text(value) {
    this._text = value;
  }

  /**
   * @param {string} eventName
   * @param {() => void} callback
   */
  on(eventName, callback) {
    if (eventName === Button.tapEvent) {
      this._tap = callback;
    }
  }

  /** @param {android.app.Activity} context */
  _setupUI(context) {
    const nativeView = new android.widget.Button(context);
    nativeView.setAllCaps(false);
    nativeView.setText(this._text);
    nativeView.setOnClickListener(() => {
      this._tap();
      nativeView.setText(this._text);
    });
    this.nativeViewProtected = nativeView;
  }
}

export class StackLayout {
  constructor() {
    this.orientation = "vertical";
    this.paddingTop = 0;
    this._backgroundColor = "";
    /** @type {Button[]} */
    this._children = [];
  }

  get backgroundColor() {
    return this._backgroundColor;
  }

  set backgroundColor(value) {
    this._backgroundColor = value;
    const nativeView = this.nativeViewProtected;
    if (nativeView !== undefined && value === "red") {
      nativeView.setBackgroundColor(-65536);
    }
  }

  /** @param {Button} child */
  addChild(child) {
    this._children.push(child);
  }

  /** @param {android.app.Activity} context */
  _setupAsRootView(context) {
    const nativeView = new android.widget.LinearLayout(context);
    if (this.orientation === "vertical") {
      nativeView.setOrientation(android.widget.LinearLayout.VERTICAL);
    }
    nativeView.setPadding(0, this.paddingTop, 0, 0);
    if (this._backgroundColor === "red") {
      nativeView.setBackgroundColor(-65536);
    }
    for (const child of this._children) {
      child._setupUI(context);
      const childNativeView = child.nativeViewProtected;
      if (childNativeView !== undefined) {
        nativeView.addView(childNativeView);
      }
    }
    this.nativeViewProtected = nativeView;
  }
}
