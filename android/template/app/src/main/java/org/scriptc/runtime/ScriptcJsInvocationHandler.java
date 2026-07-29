package org.scriptc.runtime;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

final class ScriptcJsInvocationHandler implements InvocationHandler {
    private final long callback;

    ScriptcJsInvocationHandler(long callback) {
        this.callback = callback;
    }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) {
        if (method.getDeclaringClass() == Object.class) {
            String name = method.getName();
            if ("toString".equals(name)) return "scriptc JavaScript proxy";
            if ("hashCode".equals(name)) return System.identityHashCode(proxy);
            if ("equals".equals(name)) return proxy == args[0];
            return null;
        }
        return ScriptcRuntime.invokeJsProxy(
                callback,
                method.getName(),
                args == null ? new Object[0] : args);
    }
}
