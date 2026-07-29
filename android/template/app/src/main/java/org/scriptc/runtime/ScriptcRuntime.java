package org.scriptc.runtime;

import android.app.Activity;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;

public final class ScriptcRuntime {
    static {
        System.loadLibrary("scriptc_app");
    }

    private ScriptcRuntime() {}

    public static native int start(Activity activity);
    public static native void shutdown();

    private static int toInt32(Number value) {
        double number = value.doubleValue();
        if (!Double.isFinite(number) || number == 0) return 0;
        double integer = number < 0 ? Math.ceil(number) : Math.floor(number);
        double modulo = integer % 4294967296.0;
        if (modulo < 0) modulo += 4294967296.0;
        return modulo >= 2147483648.0
                ? (int) (modulo - 4294967296.0)
                : (int) modulo;
    }

    public static boolean classExists(String name) {
        try {
            Class.forName(name);
            return true;
        } catch (ClassNotFoundException error) {
            return false;
        }
    }

    private static Object coerce(Object value, Class<?> target) {
        if (value == null || target.isInstance(value)) return value;
        if (value instanceof Number) {
            Number n = (Number) value;
            if (target == int.class || target == Integer.class) return toInt32(n);
            if (target == long.class || target == Long.class) return n.longValue();
            if (target == float.class || target == Float.class) return n.floatValue();
            if (target == double.class || target == Double.class) return n.doubleValue();
            if (target == short.class || target == Short.class) return n.shortValue();
            if (target == byte.class || target == Byte.class) return n.byteValue();
        }
        return value;
    }

    private static boolean accepts(Class<?>[] types, Object[] args) {
        if (types.length != args.length) return false;
        for (int i = 0; i < types.length; i++) {
            Object value = args[i];
            if (value == null) {
                if (types[i].isPrimitive()) return false;
                continue;
            }
            if (types[i].isInstance(value) || value instanceof Number && types[i].isPrimitive()) continue;
            if (types[i] == boolean.class && value instanceof Boolean) continue;
            return false;
        }
        return true;
    }

    private static Object[] coerced(Class<?>[] types, Object[] args) {
        Object[] out = new Object[args.length];
        for (int i = 0; i < args.length; i++) out[i] = coerce(args[i], types[i]);
        return out;
    }

    /** Two-element result: [found, value]. */
    public static Object[] getStatic(String className, String name) throws Exception {
        Class<?> type = Class.forName(className);
        if (name.equals("class")) return new Object[] { true, type };
        try {
            Field field = type.getField(name);
            if (Modifier.isStatic(field.getModifiers())) return new Object[] { true, field.get(null) };
        } catch (NoSuchFieldException ignored) {}
        return new Object[] { false, null };
    }

    /** Two-element result: [found, value]. */
    public static Object[] getProperty(Object receiver, String name) throws Exception {
        Class<?> type = receiver.getClass();
        try {
            return new Object[] { true, type.getField(name).get(receiver) };
        } catch (NoSuchFieldException ignored) {}
        String suffix = Character.toUpperCase(name.charAt(0)) + name.substring(1);
        for (String getter : new String[] { "get" + suffix, "is" + suffix }) {
            try {
                Method method = type.getMethod(getter);
                if (method.getParameterTypes().length == 0) {
                    return new Object[] { true, method.invoke(receiver) };
                }
            } catch (NoSuchMethodException ignored) {}
        }
        return new Object[] { false, null };
    }

    public static boolean hasMethod(Object receiver, String name) {
        for (Method method : receiver.getClass().getMethods()) {
            if (method.getName().equals(name)) return true;
        }
        return false;
    }

    public static boolean hasStaticMethod(String className, String name)
            throws ClassNotFoundException {
        for (Method method : Class.forName(className).getMethods()) {
            if (Modifier.isStatic(method.getModifiers()) && method.getName().equals(name)) {
                return true;
            }
        }
        return false;
    }

    public static Object construct(String className, Object[] args) throws Exception {
        Class<?> type = Class.forName(className);
        for (Constructor<?> ctor : type.getConstructors()) {
            if (accepts(ctor.getParameterTypes(), args)) {
                return ctor.newInstance(coerced(ctor.getParameterTypes(), args));
            }
        }
        throw new NoSuchMethodException(className + " constructor with " + args.length + " argument(s)");
    }

    public static Object invoke(Object receiver, String name, Object[] args) throws Exception {
        for (Method method : receiver.getClass().getMethods()) {
            if (method.getName().equals(name) && accepts(method.getParameterTypes(), args)) {
                return method.invoke(receiver, coerced(method.getParameterTypes(), args));
            }
        }
        throw new NoSuchMethodException(receiver.getClass().getName() + "." + name);
    }

    public static Object invokeStatic(String className, String name, Object[] args)
            throws Exception {
        Class<?> type = Class.forName(className);
        for (Method method : type.getMethods()) {
            if (Modifier.isStatic(method.getModifiers())
                    && method.getName().equals(name)
                    && accepts(method.getParameterTypes(), args)) {
                return method.invoke(null, coerced(method.getParameterTypes(), args));
            }
        }
        throw new NoSuchMethodException(className + "." + name);
    }

    static Object createProxy(String interfaceName, long callback)
            throws ClassNotFoundException {
        Class<?> type = Class.forName(interfaceName.replace('/', '.'));
        return Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[] { type },
                new ScriptcInvocationHandler(callback));
    }

    static Object createJsProxy(String interfaceName, long callback)
            throws ClassNotFoundException {
        Class<?> type = Class.forName(interfaceName.replace('/', '.'));
        return Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[] { type },
                new ScriptcJsInvocationHandler(callback));
    }

    static native void invokeCallback(long callback);
    static native Object invokeJsProxy(long callback, String method, Object[] args);
}
