pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// Deliberately a separate Gradle build: the Capacitor wrapper in ../android
// stays the canonical Android delivery (ADR 0011) and is never touched by this
// experimental native client.
rootProject.name = "eimir-android-native-test"
include(":app")
