# kotlinx.serialization: keep generated serializers of the OpenAPI models and routes.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class eimir.api.models.**$$serializer { *; }
-keepclassmembers class eimir.api.models.** { *** Companion; }
-keepclasseswithmembers class eimir.api.models.** { kotlinx.serialization.KSerializer serializer(...); }

# Retrofit service interfaces are reflected at runtime.
-keep,allowobfuscation interface de.eimir.nativetest.api.EimirApi
-keep,allowobfuscation interface de.eimir.nativetest.api.SessionApi
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-dontwarn org.openjsse.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
