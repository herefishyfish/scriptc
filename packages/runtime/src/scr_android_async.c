#ifdef __ANDROID__

#include "scr_runtime.h"

#include <stdlib.h>
#include <time.h>

/*
 * Android runs scriptc on the Activity UI thread and does not provide the
 * obsolete POSIX ucontext API used by the desktop stackful-fiber runtime.
 * This adapter is intentionally small: it drains the embedded engine's
 * job queue synchronously during bootstrap. NativeScript callbacks re-enter
 * the same engine directly from Java/JNI.
 */
static bool (*android_io_pending)(void);
static void (*android_io_poll)(double);
static bool (*android_island_rejections)(bool);
static int (*android_island_drain_jobs)(void);
static double (*android_island_deadline)(void);

double scr_now_ms(void) {
  struct timespec now;
  clock_gettime(CLOCK_MONOTONIC, &now);
  return (double)now.tv_sec * 1000.0 + (double)now.tv_nsec / 1000000.0;
}

void scr_loop_set_io(bool (*pending)(void), void (*poll)(double)) {
  android_io_pending = pending;
  android_io_poll = poll;
}

void scr_loop_set_island_rejections(bool (*fn)(bool),
                                    int (*drain_jobs)(void)) {
  android_island_rejections = fn;
  android_island_drain_jobs = drain_jobs;
}

void scr_loop_set_island_deadline(double (*fn)(void)) {
  android_island_deadline = fn;
}

bool scr_loop_run(ScrPromise *top_level) {
  (void)top_level;
  (void)android_island_deadline;
  if (android_island_drain_jobs) android_island_drain_jobs();
  while (android_io_pending && android_io_pending()) {
    android_io_poll(0.0);
  }
  return scr_report_unhandled_rejections();
}

bool scr_report_unhandled_rejections(void) {
  return android_island_rejections && android_island_rejections(true);
}

void scr_discard_unhandled_rejections(void) {
  if (android_island_rejections) android_island_rejections(false);
}

void *scr_fiber_self(void) { return NULL; }
bool scr_on_fiber(void) { return false; }
long scr_abandoned_fiber_count(void) { return 0; }

static void android_async_unsupported(void) {
  scr_trap("scriptc: stackful async is unavailable on Android\n");
}

ScrPromise *scr_promise_new(void) {
  android_async_unsupported();
  return NULL;
}
ScrPromise *scr_promise_retain(ScrPromise *p) { return p; }
void scr_promise_release(ScrPromise *p) { (void)p; }
void *scr_promise_retain_v(void *p) { return p; }
void scr_promise_release_v(void *p) { (void)p; }
ScrPromise *scr_async_spawn(void (*entry)(ScrFiber *, void *), void *argpack) {
  (void)entry;
  (void)argpack;
  android_async_unsupported();
  return NULL;
}
double scr_await_f64(ScrPromise *p) { (void)p; android_async_unsupported(); return 0; }
bool scr_await_bool(ScrPromise *p) { (void)p; android_async_unsupported(); return false; }
ScrStr *scr_await_str(ScrPromise *p) { (void)p; android_async_unsupported(); return NULL; }
void *scr_await_ref(ScrPromise *p) { (void)p; android_async_unsupported(); return NULL; }
void scr_await_void(ScrPromise *p) { (void)p; android_async_unsupported(); }
void scr_await_hop(void) { android_async_unsupported(); }
void scr_promise_fulfill_void(ScrPromise *p) { (void)p; }
void scr_promise_fulfill_ref(ScrPromise *p, void *v,
                             void *(*retain)(void *), void (*release)(void *),
                             ScrTraceFn trace) {
  (void)p; (void)retain; (void)trace;
  if (v && release) release(v);
}
void scr_promise_reject_pending(ScrPromise *p) { (void)p; scr_exc_clear(); }
ScrPromise *scr_promise_settled_ref(void *v, void *(*retain)(void *),
                                    void (*release)(void *), ScrTraceFn trace) {
  (void)retain; (void)trace;
  if (v && release) release(v);
  android_async_unsupported();
  return NULL;
}
ScrPromise *scr_promise_settled_void(void) {
  android_async_unsupported();
  return NULL;
}
void scr_set_timeout(ScrClosure *cb, double ms) {
  (void)ms;
  scr_closure_release(cb);
  android_async_unsupported();
}
static double android_timer_id = 1.0;
double scr_set_interval(ScrClosure *cb, double ms) {
  (void)ms;
  scr_closure_release(cb);
  return android_timer_id++;
}
double scr_set_timeout_handle(ScrClosure *cb, double ms) {
  (void)ms;
  scr_closure_release(cb);
  return android_timer_id++;
}
void scr_clear_interval(double handle) { (void)handle; }
void scr_timers_teardown(void) {}

#endif
