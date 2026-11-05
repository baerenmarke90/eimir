package de.eimir.nativetest.media

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.ext.SdkExtensions
import android.provider.DocumentsContract
import android.provider.MediaStore
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

/**
 * The system Photo Picker for picking personal photos.
 *
 * Ports the Capacitor wrapper's `PhotoFileChooser` decision to Kotlin: on
 * devices whose picker can grant location metadata itself, it is asked to; on
 * older devices the original (EXIF-complete) MediaStore item is opened only
 * when the person granted ACCESS_MEDIA_LOCATION. The backend then applies the
 * person's photo-location preference. No storage permission is ever needed.
 */
class PickPhotos(private val maxItems: Int) : ActivityResultContract<Unit, List<Uri>>() {
    override fun createIntent(context: Context, input: Unit): Intent {
        val request = PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly)
            .build()
        val intent = ActivityResultContracts.PickMultipleVisualMedia(maxItems.coerceAtLeast(2)).createIntent(context, request)
        if (PhotoLocation.pickerGrantsMetadata()) {
            intent.putExtra(REQUEST_LOCATION_METADATA, true).putExtra(FALLBACK_REQUEST_LOCATION_METADATA, true)
        }
        return intent
    }

    override fun parseResult(resultCode: Int, intent: Intent?): List<Uri> =
        ActivityResultContracts.PickMultipleVisualMedia().parseResult(resultCode, intent)
            .filter { it.scheme == "content" && !it.authority.isNullOrEmpty() }
            .distinct()

    private companion object {
        // Documented Intent protocol; avoids adopting the alpha photopicker artifact.
        const val REQUEST_LOCATION_METADATA = "android.provider.extra.REQUEST_LOCATION_METADATA_ACCESS"
        const val FALLBACK_REQUEST_LOCATION_METADATA =
            "androidx.activity.result.contract.extra.PICK_IMAGES_REQUEST_LOCATION_METADATA_ACCESS"
    }
}

object PhotoLocation {
    /** The modern picker owns its metadata consent; its grant is never upgraded with ACCESS_MEDIA_LOCATION. */
    fun pickerGrantsMetadata(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            SdkExtensions.getExtensionVersion(Build.VERSION_CODES.TIRAMISU) >= 23

    fun needsPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !pickerGrantsMetadata() && !hasPermission(context)

    fun hasPermission(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED

    /**
     * The URI whose bytes are uploaded. Falls back to the picked URI whenever
     * the original is not obtainable; provider errors never surface details.
     */
    fun uploadUri(context: Context, picked: Uri): Uri {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || pickerGrantsMetadata() || !hasPermission(context)) return picked
        return try {
            val media = if (DocumentsContract.isDocumentUri(context, picked)) MediaStore.getMediaUri(context, picked) else picked
            if (media == null || media.authority != MediaStore.AUTHORITY) return picked
            val original = MediaStore.setRequireOriginal(media)
            context.contentResolver.openAssetFileDescriptor(original, "r")?.use { original } ?: picked
        } catch (_: Exception) {
            picked
        }
    }
}
