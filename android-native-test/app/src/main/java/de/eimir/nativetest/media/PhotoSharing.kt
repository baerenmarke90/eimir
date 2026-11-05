package de.eimir.nativetest.media

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.core.content.FileProvider
import coil3.ImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Shares one authorized photo through the Android share sheet.
 *
 * The decoded image is re-encoded as JPEG, which drops all EXIF metadata
 * (including GPS) so sharing never leaks the original capture location. The
 * temporary file lives in the app's cache, is exposed only through a
 * read-granting FileProvider URI, and every earlier shared file is deleted
 * first, so at most one shared copy exists at a time.
 */
object PhotoSharing {
    private const val DIRECTORY = "shared-photos"

    suspend fun share(context: Context, loader: ImageLoader, image: AttachmentImage): Boolean {
        val file = withContext(Dispatchers.IO) {
            val result = loader.execute(
                ImageRequest.Builder(context).data(image).memoryCacheKey(image.cacheKey).allowHardware(false).build(),
            ) as? SuccessResult ?: return@withContext null
            val directory = File(context.cacheDir, DIRECTORY).apply { mkdirs() }
            clear(directory)
            val target = File(directory, "eimir-${UUID.randomUUID()}.jpg")
            target.outputStream().use { result.image.toBitmap().compress(Bitmap.CompressFormat.JPEG, 92, it) }
            target
        } ?: return false
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.shares", file)
        val send = Intent(Intent.ACTION_SEND)
            .setType("image/jpeg")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        send.clipData = ClipData.newRawUri(null, uri)
        context.startActivity(Intent.createChooser(send, null))
        return true
    }

    /** Removes leftovers, e.g. at sign-out or app start. */
    fun clear(context: Context) = clear(File(context.cacheDir, DIRECTORY))

    private fun clear(directory: File) {
        directory.listFiles()?.forEach { it.delete() }
    }
}
