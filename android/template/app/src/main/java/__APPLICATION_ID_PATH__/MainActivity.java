package __APPLICATION_ID__;

import android.app.Activity;
import android.os.Bundle;
import org.scriptc.runtime.ScriptcRuntime;

public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        int status = ScriptcRuntime.start(this);
        if (status != 0) {
            throw new IllegalStateException("scriptc application initialization failed (" + status + ")");
        }
    }

    @Override
    protected void onDestroy() {
        ScriptcRuntime.shutdown();
        super.onDestroy();
    }
}
