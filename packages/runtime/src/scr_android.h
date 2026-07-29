#ifndef SCR_ANDROID_H
#define SCR_ANDROID_H

#include "scr_runtime.h"
#include <jni.h>

/** Owned JNI global reference. */
typedef struct ScrAndroidRef {
  size_t rc;
  jobject value;
} ScrAndroidRef;

typedef enum ScrAndroidArgTag {
  SCR_ANDROID_ARG_OBJECT,
  SCR_ANDROID_ARG_STRING,
  SCR_ANDROID_ARG_BOOL,
  SCR_ANDROID_ARG_NUMBER,
  SCR_ANDROID_ARG_CALLBACK
} ScrAndroidArgTag;

typedef struct ScrAndroidArg {
  ScrAndroidArgTag tag;
  union {
    ScrAndroidRef *object;
    const ScrStr *string;
    bool boolean;
    double number;
    ScrClosure *callback;
  } value;
} ScrAndroidArg;

bool scr_android_init(JNIEnv *env, jobject activity);
void scr_android_shutdown(void);

ScrAndroidRef *scr_android_ref_retain(ScrAndroidRef *ref);
void scr_android_ref_release(ScrAndroidRef *ref);
void *scr_android_ref_retain_v(void *ref);
void scr_android_ref_release_v(void *ref);

ScrAndroidRef *scr_android_current_activity(void);
ScrAndroidRef *scr_android_static_object(
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor
);
ScrStr *scr_android_static_string(
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor
);
bool scr_android_static_bool(
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor
);
double scr_android_static_number(
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor
);
ScrAndroidRef *scr_android_construct(
  const ScrStr *owner,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);
void scr_android_call_void(
  ScrAndroidRef *receiver,
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);
ScrAndroidRef *scr_android_call_object(
  ScrAndroidRef *receiver,
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);
ScrStr *scr_android_call_string(
  ScrAndroidRef *receiver,
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);
bool scr_android_call_bool(
  ScrAndroidRef *receiver,
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);
double scr_android_call_number(
  ScrAndroidRef *receiver,
  const ScrStr *owner,
  const ScrStr *name,
  const ScrStr *descriptor,
  size_t argc,
  const ScrAndroidArg *args
);

#endif
