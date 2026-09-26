import java.util.Properties

// The app's version is the project's: `package.json` is the one place a release number is
// written, and two numbers to bump is one number to forget. 3.8.0 becomes versionName "3.8.0"
// and versionCode 30800 — increasing, which is what the installer requires of an update.
val projectVersion: String = run {
    val json = rootProject.file("../package.json").readText()
    Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(json)?.groupValues?.get(1)
        ?: throw GradleException("no version in package.json")
}

val projectVersionCode: Int = run {
    val parts = projectVersion.split("-")[0].split(".").map { it.toIntOrNull() ?: 0 }
    val (major, minor, patch) = listOf(parts.getOrElse(0) { 0 }, parts.getOrElse(1) { 0 }, parts.getOrElse(2) { 0 })
    major * 10_000 + minor * 100 + patch
}

/**
 * Where the signing key is described, in the order it is looked for.
 *
 * Outside the repository by default: a signing key that lives in the working tree is one
 * `git clean` from gone, and an update can never be installed over the app again without it.
 * The file holds `storeFile`, `storePassword`, `keyAlias` and `keyPassword`.
 */
val signingProperties: File? = listOfNotNull(
    System.getenv("VOXINQ_KEYSTORE_PROPERTIES")?.let { File(it) },
    File(System.getProperty("user.home"), ".voxinq/android-signing/keystore.properties"),
    rootProject.file("keystore.properties"),
).firstOrNull { it.isFile }

plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "io.github.ikasast.voxinq"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "io.github.ikasast.voxinq"
        minSdk = 29
        targetSdk = 36
        versionCode = projectVersionCode
        versionName = projectVersion
    }

    if (signingProperties != null) {
        val props = Properties().apply { signingProperties.inputStream().use { load(it) } }
        signingConfigs.create("release") {
            storeFile = File(props.getProperty("storeFile"))
            storePassword = props.getProperty("storePassword")
            keyAlias = props.getProperty("keyAlias")
            keyPassword = props.getProperty("keyPassword")
            // v1 is for Android 6 and older, which this app does not reach. v3 is what ends up
            // verifying — it is supported from Android 9, and this app starts at 10 — and it is
            // the scheme that carries the proof a key rotation needs, which is worth having
            // before it is wished for.
            enableV1Signing = false
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the app's own key when it can be found. Without it the build stops
            // below rather than producing an APK that cannot update the installed one.
            signingConfig = signingConfigs.findByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}

// A release build with no key would produce an unsigned APK, or one signed with the debug key —
// either way something that cannot be installed over the app anybody is running. Better to stop
// with the reason than to hand over an APK that fails on the phone.
if (signingProperties == null &&
    gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
) {
    throw GradleException(
        "No signing key: put keystore.properties in ~/.voxinq/android-signing/ (or point " +
            "VOXINQ_KEYSTORE_PROPERTIES at it). android/README.md says how to make one. " +
            "Debug builds need none.",
    )
}
