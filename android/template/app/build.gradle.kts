plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

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

    // Java and Kotlin must agree on a JVM target or the Kotlin plugin fails
    // the build; 17 also retires AGP's "source value 8 is obsolete" warnings.
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
    implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
    implementation(files("libs/widgets-release.aar"))
    implementation(files("libs/winter_tc-release.aar"))
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment:1.8.5")
    implementation("androidx.transition:transition:1.5.1")
    implementation("androidx.viewpager:viewpager:1.1.0")
    // widgets-release.aar is a local file dependency, so its transitive
    // requirements are not resolved: org.nativescript.widgets.image.Fetcher
    // needs exifinterface, and Utils/FileHelper need documentfile.
    implementation("androidx.exifinterface:exifinterface:1.3.7")
    implementation("androidx.documentfile:documentfile:1.0.1")
}
