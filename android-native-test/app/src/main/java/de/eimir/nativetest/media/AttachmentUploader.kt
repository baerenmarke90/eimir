package de.eimir.nativetest.media

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import de.eimir.nativetest.api.EimirApi
import de.eimir.nativetest.api.HttpClients
import de.eimir.nativetest.api.isSameOrigin
import de.eimir.nativetest.api.urlFrom
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppException
import eimir.api.models.AttachmentUploadCreate
import eimir.api.models.MediaType
import eimir.api.models.UploadDescriptor
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.coroutines.executeAsync
import okio.BufferedSink
import okio.source

enum class UploadPhase { Uploading, Validating }

/**
 * Uploads one picked photo through the backend's attachment contract:
 * create → transfer bytes → finalize → wait until READY.
 *
 * The original bytes are sent unchanged. Orientation, thumbnails and the
 * optional photo-place association (GPS) are derived by the backend under the
 * person's own photo-location preference; the client never parses or forwards
 * coordinates itself. Cancelling the coroutine deletes the pending attachment.
 */
class AttachmentUploader(
    private val resolver: ContentResolver,
    private val api: EimirApi,
    private val clients: HttpClients,
) {
    suspend fun upload(spaceId: String, uri: Uri, onProgress: (UploadPhase, Float) -> Unit): UUID {
        val info = withContext(Dispatchers.IO) { describe(uri) }
        if (!info.mimeType.startsWith("image/")) throw AppException(AppError.Invalid)
        if (info.size <= 0L) throw AppException(AppError.Invalid)

        var created: UploadDescriptor? = null
        try {
            onProgress(UploadPhase.Uploading, 0f)
            val descriptor = api.createAttachmentUpload(
                spaceId,
                AttachmentUploadCreate(
                    expectedMimeType = info.mimeType,
                    expectedSize = info.size.toInt(),
                    mediaType = MediaType.IMAGE,
                    originalName = info.name,
                ),
            )
            created = descriptor
            transfer(descriptor, uri, info) { onProgress(UploadPhase.Uploading, it) }
            onProgress(UploadPhase.Validating, 1f)
            api.finalizeAttachment(spaceId, descriptor.attachment.id.toString())
            awaitReady(spaceId, descriptor.attachment.id)
            return descriptor.attachment.id
        } catch (cancelled: CancellationException) {
            created?.let { discard(spaceId, it) }
            throw cancelled
        }
    }

    private suspend fun discard(spaceId: String, descriptor: UploadDescriptor) = withContext(NonCancellable) {
        // Best effort; the backend's pending-upload cleanup remains the fallback.
        runCatching {
            api.deleteAttachment(spaceId, descriptor.attachment.id.toString(), descriptor.attachment.version.toString())
        }
    }

    private suspend fun transfer(descriptor: UploadDescriptor, uri: Uri, info: PickedFile, progress: (Float) -> Unit) {
        val body = object : RequestBody() {
            override fun contentType() =
                (descriptor.requiredHeaders["Content-Type"] ?: info.mimeType).toMediaTypeOrNull()

            override fun contentLength(): Long = info.size

            override fun writeTo(sink: BufferedSink) {
                val stream = resolver.openInputStream(uri) ?: throw IOException("Photo is no longer readable.")
                stream.source().use { source ->
                    var written = 0L
                    while (true) {
                        val read = source.read(sink.buffer, 64 * 1024L)
                        if (read == -1L) break
                        written += read
                        sink.emitCompleteSegments()
                        progress((written.toFloat() / info.size).coerceIn(0f, 1f))
                    }
                }
            }
        }
        val builder = Request.Builder().urlFrom(clients.baseUrl, descriptor.uploadUrl).put(body)
        descriptor.requiredHeaders.forEach { (name, value) -> builder.header(name, value) }
        val request = builder.build()
        // STREAM goes through the API with the bearer token; a signed storage
        // URL must never receive it.
        val client = if (descriptor.method == UploadDescriptor.Method.STREAM && request.url.isSameOrigin(clients.baseUrl)) {
            clients.transfer
        } else {
            clients.unauthenticatedTransfer
        }
        client.newCall(request).executeAsync().use { response ->
            if (!response.isSuccessful) {
                throw AppException(
                    when (response.code) {
                        413, 415, 422 -> AppError.Invalid
                        401 -> AppError.SessionEnded
                        else -> AppError.Server
                    },
                )
            }
        }
    }

    private suspend fun awaitReady(spaceId: String, id: UUID) {
        var interval = 400L
        repeat(60) {
            val attachment = api.attachment(spaceId, id.toString())
            when (attachment.status) {
                "READY" -> return
                "FAILED", "DELETE_FAILED", "DELETING" -> throw AppException(AppError.Invalid)
            }
            delay(interval)
            interval = (interval * 3 / 2).coerceAtMost(2_000L)
        }
        throw AppException(AppError.Server)
    }

    private data class PickedFile(val mimeType: String, val size: Long, val name: String)

    private fun describe(uri: Uri): PickedFile {
        val mime = resolver.getType(uri).orEmpty()
        var size = -1L
        var name = "photo"
        resolver.query(uri, arrayOf(OpenableColumns.SIZE, OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex)
            }
        }
        if (size <= 0) {
            size = runCatching { resolver.openAssetFileDescriptor(uri, "r")?.use { it.length } }.getOrNull() ?: -1L
        }
        return PickedFile(mime, size, name.take(200))
    }
}
