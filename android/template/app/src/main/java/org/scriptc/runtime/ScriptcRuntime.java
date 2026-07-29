package org.scriptc.runtime;

import android.app.Activity;
import java.lang.reflect.Proxy;

public final class ScriptcRuntime {
    static {
        System.loadLibrary("scriptc_app");
    }

    private ScriptcRuntime() {}

    public static native int start(Activity activity);
    public static native void shutdown();
    static Object createProxy(String interfaceName, long callback)
            throws ClassNotFoundException {
        Class<?> type = Class.forName(interfaceName.replace('/', '.'));
        return Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[] { type },
                new ScriptcInvocationHandler(callback));
    }

    static native void invokeCallback(long callback);
}
