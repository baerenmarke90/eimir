plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

val eimirApiBaseUrl = providers.gradleProperty("eimirApiBaseUrl")
    .orElse(providers.gradleProperty("sbsApiBaseUrl"))
    .orElse("")
    .get()

// Release identity, per #194.
//
// `versionName` is the product's version and is edited by hand when the
// product moves. `versionCode` is the monotonic integer Android orders updates
// by; it carries no meaning beyond "later than the last one" and is supplied by
// whatever publishes the build, so a rebuild of the same source can be
// republished without inventing a new product version.
val eimirVersionName = "0.1.0"
val eimirVersionCode = providers.gradleProperty("eimirVersionCode")
    .orElse(providers.gradleProperty("sbsVersionCode"))
    .orElse("1")
    .get()
    .toInt()

// Release signing material never lives in this repository. It is supplied by
// the publishing environment, and when it is absent the release build stays
// unsigned rather than silently falling back to the debug key — an artifact
// signed with the debug key looks releasable and can never be updated by a
// properly signed one.
val releaseKeystore = providers.gradleProperty("eimirReleaseKeystore")
    .orElse(providers.environmentVariable("EIMIR_RELEASE_KEYSTORE"))
    .orElse(providers.gradleProperty("sbsReleaseKeystore"))
    .orElse(providers.environmentVariable("SBS_RELEASE_KEYSTORE"))
    .orNull
// The Material 3 scheme and the semantic scale are derived from the shared
// token set instead of restating its values. `design/tokens.json` stays the
// single source of truth, exactly as `backend/openapi.json` is for the API
// client. Gradle bundles Groovy, so parsing needs no additional dependency.
abstract class GenerateDesignTokens : DefaultTask() {
    @get:InputFile
    abstract val tokensFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    // The design-token format names its payload key "$value".
    private val valueKey = "\u0024value"

    @TaskAction
    fun generate() {
        val parsed = groovy.json.JsonSlurper().parse(tokensFile.get().asFile)
        val tokens = parsed.asMap()
        val color = tokens.getValue("color").asMap()
        val scheme = color.getValue("scheme").asMap()
        val semantic = color.getValue("semantic").asMap()

        val text = buildString {
            appendLine("package de.eimir.app.design")
            appendLine()
            appendLine("// Generated from design/tokens.json by the generateDesignTokens task.")
            appendLine("// Do not edit; change the token file instead.")
            appendLine()
            appendLine("internal object GeneratedColorTokens {")
            appendColorObject("Light", resolveScheme(scheme, semantic, "light"))
            appendColorObject("Dark", resolveScheme(scheme, semantic, "dark"))
            appendLine("}")
            appendLine()
            appendDimensionObject(tokens)
            appendLine()
            appendTypographyObject(tokens)
            appendLine()
            appendLayoutObject(tokens)
            appendLine()
            appendMotionObject(tokens)
        }

        val target = outputDirectory.get().asFile.resolve("de/eimir/app/design")
        target.mkdirs()
        target.resolve("GeneratedDesignTokens.kt").writeText(text)
    }

    /** Scheme entries are aliases such as `{color.semantic.background}`. */
    private fun resolveScheme(
        scheme: Map<String, Any?>,
        semantic: Map<String, Any?>,
        name: String,
    ): Map<String, String> {
        val entries = scheme.getValue(name).asMap()
        val resolved = LinkedHashMap<String, String>()
        for ((key, raw) in entries) {
            val value = raw.asMap().getValue(valueKey) as String
            resolved[key] = if (value.startsWith("{")) {
                val alias = value.trim('{', '}').substringAfterLast('.')
                val target = semantic[alias]
                    ?: throw GradleException("Token alias cannot be resolved: " + value)
                target.asMap().getValue(valueKey) as String
            } else {
                value
            }
        }
        return resolved
    }

    private fun StringBuilder.appendColorObject(name: String, entries: Map<String, String>) {
        appendLine("    object " + name + " {")
        for ((key, hex) in entries) {
            appendLine("        const val " + constantName(key) + ": Long = 0x" + argb(hex))
        }
        appendLine("    }")
        appendLine()
    }

    /** Token colours are `#RRGGBB` or `#RRGGBBAA`; Compose expects `AARRGGBB`. */
    private fun argb(hex: String): String {
        val value = hex.removePrefix("#").uppercase()
        return when (value.length) {
            6 -> "FF" + value
            8 -> value.substring(6, 8) + value.substring(0, 6)
            else -> throw GradleException("Unsupported colour token: " + hex)
        }
    }

    private fun StringBuilder.appendDimensionObject(tokens: Map<String, Any?>) {
        appendLine("internal object GeneratedDimensionTokens {")
        appendScale(tokens.getValue("spacing").asMap(), "SPACING_")
        appendScale(tokens.getValue("radius").asMap(), "RADIUS_")
        appendLine("}")
    }

    private fun StringBuilder.appendScale(entries: Map<String, Any?>, prefix: String) {
        for ((key, raw) in entries) {
            if (!raw.isTokenValue()) continue
            val size = (raw.asMap().getValue(valueKey) as String).removeSuffix("px")
            appendLine("    const val " + prefix + constantName(key) + ": Float = " + size + "f")
        }
    }

    private fun StringBuilder.appendTypographyObject(tokens: Map<String, Any?>) {
        appendLine("internal object GeneratedTypographyTokens {")
        val semibold = tokens.getValue("font").asMap().getValue("weight").asMap()
            .getValue("semibold").asMap().getValue(valueKey)
        appendLine("    const val SEMIBOLD_WEIGHT: Int = " + semibold)
        for ((key, raw) in tokens.getValue("typography").asMap()) {
            if (!raw.isTokenValue()) continue
            val value = raw.asMap().getValue(valueKey).asMap()
            val fontSize = (value.getValue("fontSize") as String).removeSuffix("px")
            val lineHeight = (value.getValue("lineHeight") as Number).toFloat()
            val fontWeight = (value.getValue("fontWeight") as Number).toInt()
            val letterSpacing = (value.getValue("letterSpacing") as String).removeSuffix("em")
            appendLine("    object " + key.replaceFirstChar { it.uppercaseChar() } + " {")
            appendLine("        const val FONT_SIZE_SP: Float = " + fontSize + "f")
            appendLine("        const val LINE_HEIGHT_RATIO: Float = " + lineHeight + "f")
            appendLine("        const val FONT_WEIGHT: Int = " + fontWeight)
            appendLine("        const val LETTER_SPACING_EM: Float = " + letterSpacing + "f")
            appendLine("    }")
        }
        appendLine("}")
    }

    private fun StringBuilder.appendLayoutObject(tokens: Map<String, Any?>) {
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
            "READING_MAX" to "layout.readingMax",
        )) {
            appendLine("    const val " + name + ": Float = " + dimension(path) + "f")
        }
        appendLine("}")
    }

    private fun StringBuilder.appendMotionObject(tokens: Map<String, Any?>) {
        val motion = tokens.getValue("motion").asMap()
        appendLine("internal object GeneratedMotionTokens {")
        for ((key, raw) in motion.getValue("duration").asMap()) {
            if (!raw.isTokenValue()) continue
            val value = (raw.asMap().getValue(valueKey) as String).removeSuffix("ms")
            appendLine("    const val " + constantName(key) + "_MILLIS: Int = " + value)
        }
        val curve = motion.getValue("easing").asMap().getValue("standard").asMap().getValue(valueKey) as List<*>
        for ((index, value) in curve.withIndex()) {
            appendLine("    const val STANDARD_EASING_" + index + ": Float = " + (value as Number).toFloat() + "f")
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

val generatedDesignTokens = layout.buildDirectory.dir("generated/designTokens")
val generateDesignTokens by tasks.registering(GenerateDesignTokens::class) {
    tokensFile.set(layout.projectDirectory.file("../../design/tokens.json"))
    outputDirectory.set(generatedDesignTokens)
}

// One existing approved photograph is available only to the internal debug proof.
abstract class PrepareVisualProofAssets : DefaultTask() {
    @get:InputFile
    abstract val sourceFile: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun copyPhoto() {
        val target = outputDirectory.get().asFile
        target.mkdirs()
        sourceFile.get().asFile.copyTo(target.resolve("cabin-lake.jpg"), overwrite = true)
    }
}

val prepareVisualProofAssets by tasks.registering(PrepareVisualProofAssets::class) {
    sourceFile.set(layout.projectDirectory.file("../../backend/demo_assets/images/cabin-lake.jpg"))
}

val preparedGeneratedModels = layout.buildDirectory.dir("generated/s8ApiModels")
val prepareS8GeneratedModels by tasks.registering(org.gradle.api.tasks.Sync::class) {
    from(layout.projectDirectory.dir("../api/generated"))
    into(preparedGeneratedModels)
}

fun quotedBuildConfig(value: String): String = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

/**
 * One piece of signing material, from a Gradle property or the environment.
 *
 * Missing material fails the configuration rather than producing a signing
 * config with an empty password, which fails much later and less clearly.
 */
fun Project.secret(
    property: String,
    environmentVariable: String,
    legacyProperty: String,
    legacyEnvironmentVariable: String,
): String =
    providers.gradleProperty(property)
        .orElse(providers.environmentVariable(environmentVariable))
        .orElse(providers.gradleProperty(legacyProperty))
        .orElse(providers.environmentVariable(legacyEnvironmentVariable))
        .orNull
        ?: error(
            "Release signing needs $property or $environmentVariable. " +
                "Supply it from the publishing environment; it must never be committed.",
        )

android {
    namespace = "de.eimir.app.reference"
    compileSdk = 37
    compileSdkMinor = 1

    defaultConfig {
        // Frozen by #194. Google Play binds an application ID and deep-link
        // scheme to installed upgrades. The legacy value is therefore a
        // deliberate compatibility identifier, not the current product name.
        applicationId = "de.sidebyside.app"
        minSdk = 26
        targetSdk = 36
        versionCode = eimirVersionCode
        versionName = eimirVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "EIMIR_API_BASE_URL", quotedBuildConfig(eimirApiBaseUrl))
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = secret(
                    "eimirReleaseKeystorePassword",
                    "EIMIR_RELEASE_KEYSTORE_PASSWORD",
                    "sbsReleaseKeystorePassword",
                    "SBS_RELEASE_KEYSTORE_PASSWORD",
                )
                keyAlias = secret(
                    "eimirReleaseKeyAlias",
                    "EIMIR_RELEASE_KEY_ALIAS",
                    "sbsReleaseKeyAlias",
                    "SBS_RELEASE_KEY_ALIAS",
                )
                keyPassword = secret(
                    "eimirReleaseKeyPassword",
                    "EIMIR_RELEASE_KEY_PASSWORD",
                    "sbsReleaseKeyPassword",
                    "SBS_RELEASE_KEY_PASSWORD",
                )
            }
        }
    }

    buildTypes {
        debug {
            // A debug build is a different application to Android, so a
            // developer's own installation cannot be replaced by, or replace,
            // the one from the store.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }

        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        // Keeps AndroidX and Material from bringing roughly eighty of their own
        // translations into the package. Without it a device set to any other
        // language resolves library strings — dialog buttons, content
        // descriptions, the text a screen reader announces — to that language
        // while every string this app owns stays German.
        localeFilters += "de"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

android.sourceSets.named("main") {
    kotlin.directories += preparedGeneratedModels.get().asFile.path
    kotlin.directories += generatedDesignTokens.get().asFile.path
}

androidComponents.onVariants(androidComponents.selector().withBuildType("debug")) { variant ->
    variant.sources.assets?.addGeneratedSourceDirectory(prepareVisualProofAssets, PrepareVisualProofAssets::outputDirectory)
}

tasks.named("preBuild").configure {
    dependsOn(prepareS8GeneratedModels, generateDesignTokens)
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2026.08.00")

    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.10.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("com.squareup.okhttp3:okhttp:5.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.room:room-ktx:2.8.4")
    ksp("androidx.room:room-compiler:2.8.4")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation(composeBom)
    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("androidx.compose.ui:ui-test-junit4")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("androidx.room:room-testing:2.8.4")
}
