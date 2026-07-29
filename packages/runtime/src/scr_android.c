#include "scr_android.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct ScrAndroidMethod {
  char *owner;
  char *name;
  char *descriptor;
  jclass clazz;
  jmethodID id;
  struct ScrAndroidMethod *next;
} ScrAndroidMethod;

typedef struct ScrAndroidCallback {
  ScrClosure *closure;
  struct ScrAndroidCallback *next;
} ScrAndroidCallback;

typedef struct ScrAndroidField {
  char *owner;
  char *name;
  char *descriptor;
  jclass clazz;
  jfieldID id;
  struct ScrAndroidField *next;
} ScrAndroidField;

static JNIEnv *scr_android_env;
static ScrAndroidRef *scr_android_activity;
static jclass scr_runtime_cls;
static jmethodID scr_runtime_proxy_id;
static ScrAndroidMethod *scr_android_methods;
static ScrAndroidField *scr_android_fields;
static ScrAndroidCallback *scr_android_callbacks;

static void scr_android_throw(const char *operation) {
  const char prefix[] = "Android JNI exception in ";
  size_t a = sizeof(prefix) - 1;
  size_t b = strlen(operation);
  char *message = malloc(a + b + 1);
  if (!message) scr_trap("scriptc: out of memory\n");
  memcpy(message, prefix, a);
  memcpy(message + a, operation, b + 1);
  scr_throw_error_msg(SCR_ERR_ERROR, message, a + b);
  free(message);
}

static bool scr_android_jni_ok(const char *operation) {
  JNIEnv *env = scr_android_env;
  if (!(*env)->ExceptionCheck(env)) return true;
  (*env)->ExceptionClear(env);
  scr_android_throw(operation);
  return false;
}

static char *scr_android_cstr(const ScrStr *value) {
  char *result = malloc(value->len + 1);
  if (!result) scr_trap("scriptc: out of memory\n");
  memcpy(result, value->data, value->len);
  result[value->len] = '\0';
  return result;
}

static ScrAndroidRef *scr_android_wrap(jobject local) {
  if (!local) return NULL;
  JNIEnv *env = scr_android_env;
  jobject global = (*env)->NewGlobalRef(env, local);
  if (!scr_android_jni_ok("NewGlobalRef") || !global) return NULL;
  ScrAndroidRef *ref = calloc(1, sizeof *ref);
  if (!ref) scr_trap("scriptc: out of memory\n");
  ref->rc = 1;
  ref->value = global;
  scr_obj_alloc_note();
  return ref;
}

ScrAndroidRef *scr_android_ref_retain(ScrAndroidRef *ref) {
  if (ref) ref->rc++;
  return ref;
}

void scr_android_ref_release(ScrAndroidRef *ref) {
  if (!ref || --ref->rc != 0) return;
  if (ref->value && scr_android_env) {
    (*scr_android_env)->DeleteGlobalRef(scr_android_env, ref->value);
  }
  scr_obj_free_note();
  free(ref);
}

void *scr_android_ref_retain_v(void *ref) {
  return scr_android_ref_retain((ScrAndroidRef *)ref);
}

void scr_android_ref_release_v(void *ref) {
  scr_android_ref_release((ScrAndroidRef *)ref);
}

static jclass scr_android_global_class(const char *name) {
  JNIEnv *env = scr_android_env;
  jclass local = (*env)->FindClass(env, name);
  if (!scr_android_jni_ok(name) || !local) return NULL;
  jclass global = (jclass)(*env)->NewGlobalRef(env, local);
  (*env)->DeleteLocalRef(env, local);
  if (!scr_android_jni_ok("class NewGlobalRef") || !global) return NULL;
  return global;
}

static ScrAndroidMethod *scr_android_method(
  const ScrStr *owner_value,
  const ScrStr *name_value,
  const ScrStr *descriptor_value
) {
  char *owner = scr_android_cstr(owner_value);
  char *name = scr_android_cstr(name_value);
  char *descriptor = scr_android_cstr(descriptor_value);
  for (ScrAndroidMethod *it = scr_android_methods; it; it = it->next) {
    if (!strcmp(it->owner, owner) && !strcmp(it->name, name) &&
        !strcmp(it->descriptor, descriptor)) {
      free(owner);
      free(name);
      free(descriptor);
      return it->id ? it : NULL;
    }
  }
  ScrAndroidMethod *entry = calloc(1, sizeof *entry);
  if (!entry) scr_trap("scriptc: out of memory\n");
  entry->owner = owner;
  entry->name = name;
  entry->descriptor = descriptor;
  entry->clazz = scr_android_global_class(owner);
  if (entry->clazz) {
    entry->id = (*scr_android_env)->GetMethodID(
      scr_android_env, entry->clazz, name, descriptor
    );
    (void)scr_android_jni_ok(name);
  }
  entry->next = scr_android_methods;
  scr_android_methods = entry;
  return entry->id ? entry : NULL;
}

static ScrAndroidField *scr_android_field(
  const ScrStr *owner_value,
  const ScrStr *name_value,
  const ScrStr *descriptor_value
) {
  char *owner = scr_android_cstr(owner_value);
  char *name = scr_android_cstr(name_value);
  char *descriptor = scr_android_cstr(descriptor_value);
  for (ScrAndroidField *it = scr_android_fields; it; it = it->next) {
    if (!strcmp(it->owner, owner) && !strcmp(it->name, name) &&
        !strcmp(it->descriptor, descriptor)) {
      free(owner);
      free(name);
      free(descriptor);
      return it->id ? it : NULL;
    }
  }
  ScrAndroidField *entry = calloc(1, sizeof *entry);
  if (!entry) scr_trap("scriptc: out of memory\n");
  entry->owner = owner;
  entry->name = name;
  entry->descriptor = descriptor;
  entry->clazz = scr_android_global_class(owner);
  if (entry->clazz) {
    entry->id = (*scr_android_env)->GetStaticFieldID(
      scr_android_env, entry->clazz, name, descriptor
    );
    (void)scr_android_jni_ok(name);
  }
  entry->next = scr_android_fields;
  scr_android_fields = entry;
  return entry->id ? entry : NULL;
}

/** Convert scriptc's standard UTF-8 into a JNI UTF-16 string. */
static jstring scr_android_string(const ScrStr *text) {
  JNIEnv *env = scr_android_env;
  size_t cap = text->len + 1;
  jchar *units = malloc(cap * sizeof *units);
  if (!units) scr_trap("scriptc: out of memory\n");
  size_t n = 0;
  for (size_t i = 0; i < text->len;) {
    unsigned char b0 = (unsigned char)text->data[i++];
    uint32_t cp;
    if (b0 < 0x80) cp = b0;
    else if ((b0 & 0xe0) == 0xc0) {
      cp = (uint32_t)(b0 & 0x1f) << 6;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f);
    } else if ((b0 & 0xf0) == 0xe0) {
      cp = (uint32_t)(b0 & 0x0f) << 12;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f) << 6;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f);
    } else {
      cp = (uint32_t)(b0 & 0x07) << 18;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f) << 12;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f) << 6;
      cp |= (uint32_t)((unsigned char)text->data[i++] & 0x3f);
    }
    if (cp <= 0xffff) units[n++] = (jchar)cp;
    else {
      cp -= 0x10000;
      units[n++] = (jchar)(0xd800 + (cp >> 10));
      units[n++] = (jchar)(0xdc00 + (cp & 0x3ff));
    }
  }
  jstring result = (*env)->NewString(env, units, (jsize)n);
  free(units);
  if (!scr_android_jni_ok("NewString")) return NULL;
  return result;
}

static ScrStr *scr_android_from_string(jstring value) {
  if (!value) return NULL;
  JNIEnv *env = scr_android_env;
  const jchar *units = (*env)->GetStringChars(env, value, NULL);
  jsize count = (*env)->GetStringLength(env, value);
  if (!units || !scr_android_jni_ok("GetStringChars")) return NULL;
  size_t cap = (size_t)count * 3 + 1;
  char *bytes = malloc(cap);
  if (!bytes) scr_trap("scriptc: out of memory\n");
  size_t n = 0;
  for (jsize i = 0; i < count; i++) {
    uint32_t cp = units[i];
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < count) {
      uint32_t low = units[++i];
      cp = 0x10000 + ((cp - 0xd800) << 10) + (low - 0xdc00);
    }
    if (cp < 0x80) bytes[n++] = (char)cp;
    else if (cp < 0x800) {
      bytes[n++] = (char)(0xc0 | (cp >> 6));
      bytes[n++] = (char)(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes[n++] = (char)(0xe0 | (cp >> 12));
      bytes[n++] = (char)(0x80 | ((cp >> 6) & 0x3f));
      bytes[n++] = (char)(0x80 | (cp & 0x3f));
    } else {
      bytes[n++] = (char)(0xf0 | (cp >> 18));
      bytes[n++] = (char)(0x80 | ((cp >> 12) & 0x3f));
      bytes[n++] = (char)(0x80 | ((cp >> 6) & 0x3f));
      bytes[n++] = (char)(0x80 | (cp & 0x3f));
    }
  }
  (*env)->ReleaseStringChars(env, value, units);
  ScrStr *result = scr_str_new(bytes, n);
  free(bytes);
  return result;
}

static jobject scr_android_proxy(const char *interface_name, ScrClosure *callback) {
  JNIEnv *env = scr_android_env;
  ScrClosure *owned = scr_closure_retain(callback);
  ScrAndroidCallback *binding = calloc(1, sizeof *binding);
  if (!binding) scr_trap("scriptc: out of memory\n");
  binding->closure = owned;
  binding->next = scr_android_callbacks;
  scr_android_callbacks = binding;
  jstring name = (*env)->NewStringUTF(env, interface_name);
  jobject proxy = (*env)->CallStaticObjectMethod(
    env, scr_runtime_cls, scr_runtime_proxy_id, name, (jlong)(intptr_t)owned
  );
  (*env)->DeleteLocalRef(env, name);
  if (!scr_android_jni_ok("ScriptcRuntime.createProxy") || !proxy) return NULL;
  return proxy;
}

static const char *scr_android_next_descriptor(const char *at, char **object_name) {
  *object_name = NULL;
  while (*at == '[') at++;
  if (*at == 'L') {
    const char *end = strchr(at, ';');
    if (!end) return NULL;
    size_t len = (size_t)(end - at - 1);
    *object_name = malloc(len + 1);
    if (!*object_name) scr_trap("scriptc: out of memory\n");
    memcpy(*object_name, at + 1, len);
    (*object_name)[len] = '\0';
    return end + 1;
  }
  return *at ? at + 1 : NULL;
}

static bool scr_android_args(
  const char *descriptor,
  size_t argc,
  const ScrAndroidArg *args,
  jvalue *values,
  jobject *locals
) {
  JNIEnv *env = scr_android_env;
  const char *at = descriptor;
  if (*at++ != '(') return false;
  for (size_t i = 0; i < argc; i++) {
    char *object_name;
    const char *next = scr_android_next_descriptor(at, &object_name);
    if (!next || *at == ')') {
      free(object_name);
      scr_android_throw("metadata descriptor argument count");
      return false;
    }
    char kind = *at;
    switch (args[i].tag) {
      case SCR_ANDROID_ARG_OBJECT:
        values[i].l = args[i].value.object ? args[i].value.object->value : NULL;
        break;
      case SCR_ANDROID_ARG_STRING:
        locals[i] = scr_android_string(args[i].value.string);
        values[i].l = locals[i];
        break;
      case SCR_ANDROID_ARG_BOOL:
        values[i].z = args[i].value.boolean ? JNI_TRUE : JNI_FALSE;
        break;
      case SCR_ANDROID_ARG_NUMBER:
        if (kind == 'D') values[i].d = args[i].value.number;
        else if (kind == 'F') values[i].f = (jfloat)args[i].value.number;
        else if (kind == 'J') values[i].j = (jlong)args[i].value.number;
        else if (kind == 'S') values[i].s = (jshort)args[i].value.number;
        else if (kind == 'B') values[i].b = (jbyte)args[i].value.number;
        else if (kind == 'C') values[i].c = (jchar)args[i].value.number;
        else values[i].i = (jint)args[i].value.number;
        break;
      case SCR_ANDROID_ARG_CALLBACK:
        if (!object_name) {
          scr_android_throw("callback metadata descriptor");
          return false;
        }
        locals[i] = scr_android_proxy(object_name, args[i].value.callback);
        values[i].l = locals[i];
        break;
    }
    free(object_name);
    if (scr_exc_pending()) return false;
    at = next;
  }
  if (*at != ')') {
    scr_android_throw("metadata descriptor argument count");
    return false;
  }
  (void)env;
  return true;
}

static void scr_android_delete_locals(size_t argc, jobject *locals) {
  JNIEnv *env = scr_android_env;
  for (size_t i = 0; i < argc; i++) {
    if (locals[i]) (*env)->DeleteLocalRef(env, locals[i]);
  }
}

bool scr_android_init(JNIEnv *env, jobject activity) {
  scr_android_env = env;
  scr_runtime_cls = scr_android_global_class("org/scriptc/runtime/ScriptcRuntime");
  if (!scr_runtime_cls) return false;
  scr_runtime_proxy_id = (*env)->GetStaticMethodID(
    env, scr_runtime_cls, "createProxy", "(Ljava/lang/String;J)Ljava/lang/Object;"
  );
  if (!scr_android_jni_ok("ScriptcRuntime.createProxy method") ||
      !scr_runtime_proxy_id) return false;
  scr_android_activity = scr_android_wrap(activity);
  return scr_android_activity != NULL;
}

void scr_android_shutdown(void) {
  JNIEnv *env = scr_android_env;
  while (scr_android_callbacks) {
    ScrAndroidCallback *next = scr_android_callbacks->next;
    scr_closure_release(scr_android_callbacks->closure);
    free(scr_android_callbacks);
    scr_android_callbacks = next;
  }
  scr_android_ref_release(scr_android_activity);
  scr_android_activity = NULL;
  while (scr_android_methods) {
    ScrAndroidMethod *next = scr_android_methods->next;
    if (env && scr_android_methods->clazz) {
      (*env)->DeleteGlobalRef(env, scr_android_methods->clazz);
    }
    free(scr_android_methods->owner);
    free(scr_android_methods->name);
    free(scr_android_methods->descriptor);
    free(scr_android_methods);
    scr_android_methods = next;
  }
  while (scr_android_fields) {
    ScrAndroidField *next = scr_android_fields->next;
    if (env && scr_android_fields->clazz) {
      (*env)->DeleteGlobalRef(env, scr_android_fields->clazz);
    }
    free(scr_android_fields->owner);
    free(scr_android_fields->name);
    free(scr_android_fields->descriptor);
    free(scr_android_fields);
    scr_android_fields = next;
  }
  if (env && scr_runtime_cls) (*env)->DeleteGlobalRef(env, scr_runtime_cls);
  scr_runtime_cls = NULL;
  scr_runtime_proxy_id = NULL;
  scr_android_env = NULL;
}

ScrAndroidRef *scr_android_current_activity(void) {
  if (!scr_android_activity) {
    static const char msg[] = "Android Activity is not initialized";
    scr_throw_error_msg(SCR_ERR_ERROR, msg, sizeof(msg) - 1);
    return NULL;
  }
  return scr_android_ref_retain(scr_android_activity);
}

#define SCR_ANDROID_FIELD_PARAMS \
  const ScrStr *owner, const ScrStr *name, const ScrStr *descriptor

ScrAndroidRef *scr_android_static_object(SCR_ANDROID_FIELD_PARAMS) {
  ScrAndroidField *field = scr_android_field(owner, name, descriptor);
  if (!field) return NULL;
  jobject local = (*scr_android_env)->GetStaticObjectField(
    scr_android_env, field->clazz, field->id
  );
  if (!scr_android_jni_ok(field->name) || !local) return NULL;
  ScrAndroidRef *result = scr_android_wrap(local);
  (*scr_android_env)->DeleteLocalRef(scr_android_env, local);
  return result;
}

ScrStr *scr_android_static_string(SCR_ANDROID_FIELD_PARAMS) {
  ScrAndroidField *field = scr_android_field(owner, name, descriptor);
  if (!field) return NULL;
  jstring local = (jstring)(*scr_android_env)->GetStaticObjectField(
    scr_android_env, field->clazz, field->id
  );
  if (!scr_android_jni_ok(field->name) || !local) return NULL;
  ScrStr *result = scr_android_from_string(local);
  (*scr_android_env)->DeleteLocalRef(scr_android_env, local);
  return result;
}

bool scr_android_static_bool(SCR_ANDROID_FIELD_PARAMS) {
  ScrAndroidField *field = scr_android_field(owner, name, descriptor);
  if (!field) return false;
  jboolean result = (*scr_android_env)->GetStaticBooleanField(
    scr_android_env, field->clazz, field->id
  );
  return scr_android_jni_ok(field->name) && result == JNI_TRUE;
}

double scr_android_static_number(SCR_ANDROID_FIELD_PARAMS) {
  ScrAndroidField *field = scr_android_field(owner, name, descriptor);
  if (!field) return 0;
  double result;
  switch (field->descriptor[0]) {
    case 'D':
      result = (*scr_android_env)->GetStaticDoubleField(
        scr_android_env, field->clazz, field->id
      );
      break;
    case 'F':
      result = (*scr_android_env)->GetStaticFloatField(
        scr_android_env, field->clazz, field->id
      );
      break;
    case 'J':
      result = (double)(*scr_android_env)->GetStaticLongField(
        scr_android_env, field->clazz, field->id
      );
      break;
    case 'S':
      result = (*scr_android_env)->GetStaticShortField(
        scr_android_env, field->clazz, field->id
      );
      break;
    case 'B':
      result = (*scr_android_env)->GetStaticByteField(
        scr_android_env, field->clazz, field->id
      );
      break;
    case 'C':
      result = (*scr_android_env)->GetStaticCharField(
        scr_android_env, field->clazz, field->id
      );
      break;
    default:
      result = (*scr_android_env)->GetStaticIntField(
        scr_android_env, field->clazz, field->id
      );
      break;
  }
  return scr_android_jni_ok(field->name) ? result : 0;
}

ScrAndroidRef *scr_android_construct(
  const ScrStr *owner,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
) {
  ScrStr *ctor = scr_str_new("<init>", 6);
  ScrAndroidMethod *method = scr_android_method(owner, ctor, descriptor);
  scr_str_release(ctor);
  if (!method) return NULL;
  jvalue *values = calloc(argc ? argc : 1, sizeof *values);
  jobject *locals = calloc(argc ? argc : 1, sizeof *locals);
  if (!values || !locals) scr_trap("scriptc: out of memory\n");
  if (!scr_android_args(method->descriptor, argc, args, values, locals)) {
    scr_android_delete_locals(argc, locals);
    free(values);
    free(locals);
    return NULL;
  }
  jobject local = (*scr_android_env)->NewObjectA(
    scr_android_env, method->clazz, method->id, values
  );
  scr_android_delete_locals(argc, locals);
  free(values);
  free(locals);
  if (!scr_android_jni_ok(method->name) || !local) return NULL;
  ScrAndroidRef *result = scr_android_wrap(local);
  (*scr_android_env)->DeleteLocalRef(scr_android_env, local);
  return result;
}

typedef struct ScrAndroidInvocation {
  ScrAndroidMethod *method;
  jvalue *values;
  jobject *locals;
  size_t argc;
} ScrAndroidInvocation;

static bool scr_android_prepare(
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args,
  ScrAndroidInvocation *out
) {
  memset(out, 0, sizeof *out);
  out->method = scr_android_method(owner, name, descriptor);
  if (!out->method) return false;
  out->argc = argc;
  out->values = calloc(argc ? argc : 1, sizeof *out->values);
  out->locals = calloc(argc ? argc : 1, sizeof *out->locals);
  if (!out->values || !out->locals) scr_trap("scriptc: out of memory\n");
  bool ok = scr_android_args(
    out->method->descriptor, argc, args, out->values, out->locals
  );
  if (!ok) {
    scr_android_delete_locals(argc, out->locals);
    free(out->values);
    free(out->locals);
    out->values = NULL;
    out->locals = NULL;
  }
  return ok;
}

static void scr_android_finish(ScrAndroidInvocation *call) {
  scr_android_delete_locals(call->argc, call->locals);
  free(call->values);
  free(call->locals);
}

#define SCR_ANDROID_CALL_PARAMS \
  ScrAndroidRef *receiver, const ScrStr *owner, const ScrStr *name, \
  const ScrStr *descriptor, size_t argc, const ScrAndroidArg *args

void scr_android_call_void(SCR_ANDROID_CALL_PARAMS) {
  ScrAndroidInvocation call;
  if (!scr_android_prepare(owner, name, descriptor, argc, args, &call)) return;
  (*scr_android_env)->CallVoidMethodA(
    scr_android_env, receiver->value, call.method->id, call.values
  );
  scr_android_finish(&call);
  (void)scr_android_jni_ok(call.method->name);
}

ScrAndroidRef *scr_android_call_object(SCR_ANDROID_CALL_PARAMS) {
  ScrAndroidInvocation call;
  if (!scr_android_prepare(owner, name, descriptor, argc, args, &call)) return NULL;
  jobject local = (*scr_android_env)->CallObjectMethodA(
    scr_android_env, receiver->value, call.method->id, call.values
  );
  scr_android_finish(&call);
  if (!scr_android_jni_ok(call.method->name) || !local) return NULL;
  ScrAndroidRef *result = scr_android_wrap(local);
  (*scr_android_env)->DeleteLocalRef(scr_android_env, local);
  return result;
}

ScrStr *scr_android_call_string(SCR_ANDROID_CALL_PARAMS) {
  ScrAndroidInvocation call;
  if (!scr_android_prepare(owner, name, descriptor, argc, args, &call)) return NULL;
  jstring local = (jstring)(*scr_android_env)->CallObjectMethodA(
    scr_android_env, receiver->value, call.method->id, call.values
  );
  scr_android_finish(&call);
  if (!scr_android_jni_ok(call.method->name) || !local) return NULL;
  ScrStr *result = scr_android_from_string(local);
  (*scr_android_env)->DeleteLocalRef(scr_android_env, local);
  return result;
}

bool scr_android_call_bool(SCR_ANDROID_CALL_PARAMS) {
  ScrAndroidInvocation call;
  if (!scr_android_prepare(owner, name, descriptor, argc, args, &call)) return false;
  jboolean result = (*scr_android_env)->CallBooleanMethodA(
    scr_android_env, receiver->value, call.method->id, call.values
  );
  scr_android_finish(&call);
  return scr_android_jni_ok(call.method->name) && result == JNI_TRUE;
}

double scr_android_call_number(SCR_ANDROID_CALL_PARAMS) {
  ScrAndroidInvocation call;
  if (!scr_android_prepare(owner, name, descriptor, argc, args, &call)) return 0;
  const char *ret = strchr(call.method->descriptor, ')');
  double result;
  switch (ret ? ret[1] : '\0') {
    case 'D':
      result = (*scr_android_env)->CallDoubleMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    case 'F':
      result = (*scr_android_env)->CallFloatMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    case 'J':
      result = (double)(*scr_android_env)->CallLongMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    case 'S':
      result = (*scr_android_env)->CallShortMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    case 'B':
      result = (*scr_android_env)->CallByteMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    case 'C':
      result = (*scr_android_env)->CallCharMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
    default:
      result = (*scr_android_env)->CallIntMethodA(
        scr_android_env, receiver->value, call.method->id, call.values
      );
      break;
  }
  scr_android_finish(&call);
  return scr_android_jni_ok(call.method->name) ? result : 0;
}

JNIEXPORT void JNICALL
Java_org_scriptc_runtime_ScriptcRuntime_invokeCallback(
  JNIEnv *env,
  jclass cls,
  jlong callback_token
) {
  (void)env;
  (void)cls;
  ScrClosure *callback = (ScrClosure *)(intptr_t)callback_token;
  bool registered = false;
  for (ScrAndroidCallback *it = scr_android_callbacks; it; it = it->next) {
    if (it->closure == callback) {
      registered = true;
      break;
    }
  }
  if (!registered) return;
  ((void (*)(ScrClosure *))callback->fn)(callback);
  if (scr_exc_pending()) scr_exc_print_uncaught();
}
