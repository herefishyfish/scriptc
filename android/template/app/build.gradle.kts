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

dependencies {
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation(files("libs/widgets-release.aar"))
    implementation(files("libs/winter_tc-release.aar"))
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment:1.8.5")
    implementation("androidx.transition:transition:1.5.1")
    implementation("androidx.viewpager:viewpager:1.1.0")
}
