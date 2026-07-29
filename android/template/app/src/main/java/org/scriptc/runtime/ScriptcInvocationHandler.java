package org.scriptc.runtime;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

final class ScriptcInvocationHandler implements InvocationHandler {
    private final long callback;

    ScriptcInvocationHandler(long callback) {
        this.callback = callback;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) {
        if (method.getDeclaringClass() == Object.class) {
            String name = method.getName();
            if ("toString".equals(name)) return "scriptc proxy";
            if ("hashCode".equals(name)) return System.identityHashCode(proxy);
            if ("equals".equals(name)) return proxy == args[0];
            return null;
        }
        ScriptcRuntime.invokeCallback(callback);
        return null;
    }
}
