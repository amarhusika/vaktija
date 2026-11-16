plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.amar.vaktija"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "com.amar.vaktija"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

// No libraries: only the Android framework and the Kotlin standard library.
