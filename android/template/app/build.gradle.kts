plugins { id("com.android.application") }

android {
    namespace = __APPLICATION_ID_JSON__
    compileSdk = __COMPILE_SDK__

    defaultConfig {
        applicationId = __APPLICATION_ID_JSON__
        minSdk = __MIN_SDK__
        targetSdk = __TARGET_SDK__
        versionCode = 1
        versionName = "1.0"
        externalNativeBuild {
            cmake { arguments += "-DANDROID_STL=none" }
        }
    }

    externalNativeBuild {
        cmake { path = file("src/main/cpp/CMakeLists.txt") }
    }
}
