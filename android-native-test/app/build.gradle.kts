import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// ---------------------------------------------------------------------------
// Build identity
//
// The native client is an isolated experiment beside the canonical Capacitor
// app. It owns a separate package, version scheme and signing identity so it
// can be installed in parallel and can never update or be updated by
// de.sidebyside.app or de.eimir.app.
// ---------------------------------------------------------------------------

val nativeTestVersionName = "0.1.0-native-test"
val nativeTestVersionCode = providers.gradleProperty("eimirNativeVersionCode")
    .orElse("1")
    .get()
    .toInt()

// The backend origin is a compile-time constant pinned to the eimir-test
// instance. Overriding it needs an explicit Gradle property, so a build can
// never switch to a production backend unnoticed; the active origin is also
// shown on the sign-in and About screens.
val defaultApiOrigin = "https://demo.eimir.ur-cloud.de"
val apiOrigin = providers.gradleProperty("eimirNativeApiOrigin").orElse(defaultApiOrigin).get()

fun validatedOrigin(value: String): String {
    val uri = runCatching { URI(value) }.getOrNull()
        ?: throw GradleException("eimirNativeApiOrigin is not a valid URI.")
    val isLocalEmulatorHost = uri.host == "10.0.2.2" || uri.host == "localhost"
    if (uri.scheme != "https" && !(uri.scheme == "http" && isLocalEmulatorHost)) {
        throw GradleException("eimirNativeApiOrigin must use https.")
    }
    if (uri.host.isNullOrBlank() || !uri.rawPath.isNullOrEmpty() && uri.rawPath != "/" ||
        uri.rawQuery != null || uri.rawFragment != null || uri.rawUserInfo != null
    ) {
        throw GradleException("eimirNativeApiOrigin must be a bare origin without path, query or credentials.")
    }
    return value.removeSuffix("/")
}

val pinnedOrigin = validatedOrigin(apiOrigin)
val sourceRevision = providers.gradleProperty("eimirNativeSourceRevision").orElse("local").get()

// Signing material never lives in this repository. Without it the release
// build stays unsigned instead of silently falling back to the debug key.
fun secret(property: String, environmentVariable: String): String? =
    providers.gradleProperty(property).orElse(providers.environmentVariable(environmentVariable)).orNull

val nativeTestKeystore = secret("eimirNativeKeystore", "EIMIR_NATIVE_KEYSTORE")

// ---------------------------------------------------------------------------
// Design tokens: design/tokens.json stays the single source of truth.
// ---------------------------------------------------------------------------

abstract class GenerateDesignTokens : DefaultTask() {
    @get:InputFile
    abstract val tokensFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    // The design-token format names its payload key "$value".
    private val valueKey = "\$value"

    @TaskAction
    fun generate() {
        val tokens = groovy.json.JsonSlurper().parse(tokensFile.get().asFile).asMap()
        val color = tokens.getValue("color").asMap()
        val scheme = color.getValue("scheme").asMap()
        val semantic = color.getValue("semantic").asMap()

        val text = buildString {
            appendLine("package de.eimir.nativetest.ui.theme")
            appendLine()
            appendLine("// Generated from design/tokens.json by the generateDesignTokens task.")
            appendLine("// Do not edit; change the token file instead.")
            appendLine()
            appendLine("internal object GeneratedColorTokens {")
            appendColorObject("Light", resolveScheme(scheme, semantic, "light"))
            appendColorObject("Dark", resolveScheme(scheme, semantic, "dark"))
            appendLine("}")
            appendLine()
            appendLine("internal object GeneratedDimensionTokens {")
            appendScale(tokens.getValue("spacing").asMap(), "SPACING_")
            appendScale(tokens.getValue("radius").asMap(), "RADIUS_")
            appendLine("}")
            appendLine()
            appendTypography(tokens)
            appendLine()
            appendLayout(tokens)
            appendLine()
            appendMotion(tokens)
            appendLine()
            appendLine("internal object GeneratedMediaPrivacyTokens {")
            val blur = tokens.getValue("mediaPrivacy").asMap().getValue("concealmentBlur").asMap()
                .getValue(valueKey) as String
            appendLine("    const val CONCEALMENT_BLUR: Float = " + blur.removeSuffix("px") + "f")
            appendLine("}")
        }

        val target = outputDirectory.get().asFile.resolve("de/eimir/nativetest/ui/theme")
        target.mkdirs()
        target.resolve("GeneratedDesignTokens.kt").writeText(text)
    }

    /** Scheme entries are literal colours or aliases such as `{color.semantic.scrim}`. */
    private fun resolveScheme(
        scheme: Map<String, Any?>,
        semantic: Map<String, Any?>,
        name: String,
    ): Map<String, String> {
        val resolved = LinkedHashMap<String, String>()
        for ((key, raw) in scheme.getValue(name).asMap()) {
            val value = raw.asMap().getValue(valueKey) as String
            resolved[key] = if (value.startsWith("{")) {
                val alias = value.trim('{', '}').substringAfterLast('.')
                val target = semantic[alias] ?: throw GradleException("Token alias cannot be resolved: $value")
                target.asMap().getValue(valueKey) as String
            } else {
                value
            }
        }
        return resolved
    }

    private fun StringBuilder.appendColorObject(name: String, entries: Map<String, String>) {
        appendLine("    object $name {")
        for ((key, hex) in entries) {
            appendLine("        const val " + constantName(key) + ": Long = 0x" + argb(hex))
        }
        appendLine("    }")
    }

    /** Token colours are `#RRGGBB` or `#RRGGBBAA`; Compose expects `AARRGGBB`. */
    private fun argb(hex: String): String {
        val value = hex.removePrefix("#").uppercase()
        return when (value.length) {
            6 -> "FF$value"
            8 -> value.substring(6, 8) + value.substring(0, 6)
            else -> throw GradleException("Unsupported colour token: $hex")
        }
    }

    private fun StringBuilder.appendScale(entries: Map<String, Any?>, prefix: String) {
        for ((key, raw) in entries) {
            if (!raw.isTokenValue()) continue
            val size = (raw.asMap().getValue(valueKey) as String).removeSuffix("px")
            appendLine("    const val " + prefix + constantName(key) + ": Float = " + size + "f")
        }
    }

    private fun StringBuilder.appendTypography(tokens: Map<String, Any?>) {
        appendLine("internal object GeneratedTypographyTokens {")
        for ((key, raw) in tokens.getValue("typography").asMap()) {
            if (!raw.isTokenValue()) continue
            val value = raw.asMap().getValue(valueKey).asMap()
            val family = (value.getValue("fontFamily") as List<*>).first() as String
            appendLine("    object " + key.replaceFirstChar { it.uppercaseChar() } + " {")
            appendLine("        const val DISPLAY_FAMILY: Boolean = " + (family == "Literata"))
            appendLine("        const val FONT_SIZE_SP: Float = " + (value.getValue("fontSize") as String).removeSuffix("px") + "f")
            appendLine("        const val LINE_HEIGHT_RATIO: Float = " + (value.getValue("lineHeight") as Number).toFloat() + "f")
            appendLine("        const val FONT_WEIGHT: Int = " + (value.getValue("fontWeight") as Number).toInt())
            appendLine("        const val LETTER_SPACING_EM: Float = " + (value.getValue("letterSpacing") as String).removeSuffix("em") + "f")
            appendLine("    }")
        }
        appendLine("}")
    }

    private fun StringBuilder.appendLayout(tokens: Map<String, Any?>) {
        fun dimension(path: String): String {
            val entry = path.split('.').fold(tokens as Any?) { node, key -> node.asMap().getValue(key) }
            val value = entry.asMap().getValue(valueKey) as String
            return if (value.startsWith("{")) dimension(value.trim('{', '}')) else value.removeSuffix("px")
        }
        appendLine("internal object GeneratedLayoutTokens {")
        for ((name, path) in mapOf(
            "MOBILE_GUTTER" to "layout.mobileGutter",
            "MOBILE_GUTTER_NARROW" to "layout.mobileGutterNarrow",
            "COMPACT_COMFORTABLE_MIN" to "layout.breakpoint.compactComfortableMin",
            "EXPANDED_MIN" to "layout.breakpoint.expandedMin",
            "READING_MAX" to "layout.readingMax",
            "CONTENT_MAX" to "layout.contentMax",
            "APP_TOUCH_TARGET" to "size.touchTarget.appMinimum",
        )) {
            appendLine("    const val $name: Float = " + dimension(path) + "f")
        }
        appendLine("}")
    }

    private fun StringBuilder.appendMotion(tokens: Map<String, Any?>) {
        val motion = tokens.getValue("motion").asMap()
        appendLine("internal object GeneratedMotionTokens {")
        for ((key, raw) in motion.getValue("duration").asMap()) {
            if (!raw.isTokenValue()) continue
            val value = (raw.asMap().getValue(valueKey) as String).removeSuffix("ms")
            appendLine("    const val " + constantName(key) + "_MILLIS: Int = " + value)
        }
        for ((key, raw) in motion.getValue("easing").asMap()) {
            if (!raw.isTokenValue()) continue
            val curve = raw.asMap().getValue(valueKey) as List<*>
            appendLine(
                "    val " + constantName(key) + "_EASING: FloatArray = floatArrayOf(" +
                    curve.joinToString { (it as Number).toFloat().toString() + "f" } + ")",
            )
        }
        appendLine("}")
    }

    @Suppress("UNCHECKED_CAST")
    private fun Any?.asMap(): Map<String, Any?> =
        this as? Map<String, Any?> ?: throw GradleException("Expected a token object.")

    private fun Any?.isTokenValue(): Boolean = this is Map<*, *> && containsKey(valueKey)

    private fun constantName(key: String): String =
        key.replace(Regex("([a-z0-9])([A-Z])"), "$1_$2").uppercase()
}

val generateDesignTokens = tasks.register<GenerateDesignTokens>("generateDesignTokens") {
    tokensFile.set(layout.projectDirectory.file("../../design/tokens.json"))
    outputDirectory.set(layout.buildDirectory.dir("generated/designTokens"))
}

android {
    namespace = "de.eimir.nativetest"
    compileSdk = 37

    defaultConfig {
        applicationId = "de.eimir.nativetest"
        minSdk = 26
        targetSdk = 36
        versionCode = nativeTestVersionCode
        versionName = "$nativeTestVersionName.$nativeTestVersionCode"
        buildConfigField("String", "API_ORIGIN", "\"$pinnedOrigin\"")
        manifestPlaceholders["apiHost"] = URI(pinnedOrigin).host
        buildConfigField("String", "SOURCE_REVISION", "\"${sourceRevision.replace("\"", "")}\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (!nativeTestKeystore.isNullOrBlank()) {
            create("nativeTest") {
                storeFile = file(nativeTestKeystore)
                storePassword = secret("eimirNativeKeystorePassword", "EIMIR_NATIVE_KEYSTORE_PASSWORD")
                    ?: throw GradleException("Signing needs eimirNativeKeystorePassword.")
                keyAlias = secret("eimirNativeKeyAlias", "EIMIR_NATIVE_KEY_ALIAS")
                    ?: throw GradleException("Signing needs eimirNativeKeyAlias.")
                keyPassword = secret("eimirNativeKeyPassword", "EIMIR_NATIVE_KEY_PASSWORD")
                    ?: throw GradleException("Signing needs eimirNativeKeyPassword.")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            signingConfig = signingConfigs.findByName("nativeTest")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/versions/9/OSGI-INF/MANIFEST.MF")
    }

    // Reproducible artifacts: no VCS info or build timestamps in the APK.
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

androidComponents {
    onVariants { variant ->
        variant.sources.kotlin?.addGeneratedSourceDirectory(generateDesignTokens, GenerateDesignTokens::outputDirectory)
        variant.sources.kotlin?.addStaticSourceDirectory(layout.projectDirectory.dir("../api/generated").asFile.path)
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        freeCompilerArgs.add("-opt-in=kotlinx.serialization.ExperimentalSerializationApi")
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.adaptive)
    implementation(libs.compose.material.icons)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.coroutines)
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.telephoto.zoomable.image.coil3)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.compose.ui.test.junit4)
}
