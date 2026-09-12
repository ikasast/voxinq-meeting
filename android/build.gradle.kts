// Kotlin is built into the Android Gradle plugin from 9.0, so there is no Kotlin plugin to apply.
plugins {
    alias(libs.plugins.android.application) apply false
}
