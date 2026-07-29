cmake_minimum_required(VERSION 3.22.1)
project(scriptc_app C)

add_library(scriptc_app SHARED
    scriptc_app.c
    runtime/scr_android.c
    runtime/scr_number.c
    runtime/scr_string.c
    runtime/scr_array.c
    runtime/scr_bytes.c
    runtime/scr_map.c
    runtime/scr_closure.c
    runtime/scr_object.c
    runtime/scr_union.c
    runtime/scr_exception.c
    runtime/scr_error.c
    runtime/scr_console.c
    runtime/scr_json.c
    runtime/scr_cycle.c
)
target_compile_features(scriptc_app PRIVATE c_std_11)
target_compile_options(scriptc_app PRIVATE
    -O2
    -fno-math-errno
    -fno-strict-aliasing
    -Wno-deprecated-declarations
)
target_include_directories(scriptc_app PRIVATE runtime)
target_link_options(scriptc_app PRIVATE
    -Wl,-z,max-page-size=16384
)
target_link_libraries(scriptc_app PRIVATE m)
