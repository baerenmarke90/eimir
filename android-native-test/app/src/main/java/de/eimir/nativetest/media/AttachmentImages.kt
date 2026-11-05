package de.eimir.nativetest.media

import coil3.ImageLoader
import coil3.decode.DataSource
import coil3.decode.ImageSource
import coil3.fetch.FetchResult
import coil3.fetch.Fetcher
import coil3.fetch.SourceFetchResult
import coil3.request.Options
import de.eimir.nativetest.api.EimirApi
import de.eimir.nativetest.api.isSameOrigin
import de.eimir.nativetest.api.urlFrom
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.ReadDescriptor
import java.io.IOException
import java.util.UUID
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.Buffer
import okio.FileSystem
import okhttp3.coroutines.executeAsync

/** Which projection authorizes an attachment read. */
enum class MediaParent { MEMORY, HEART_MOMENT, RELATED_PERSON, NONE }

enum class MediaVariant { ORIGINAL, THUMBNAIL }

/**
 * Coil model for one authorized attachment read.
 *
 * Equality includes the login, Space, parent and variant, which are exactly
 * the dimensions of the Web media-cache key (#1384): a cached bitmap can never
 * be served to another login, another Space or through another parent.
 */
data class AttachmentImage(
    val loginId: String,
    val spaceId: String,
    val attachmentId: UUID,
    val parent: MediaParent,
    val parentId: UUID?,
    val variant: MediaVariant,
) {
    val cacheKey: String get() = "att:$loginId:$spaceId:$parent:$parentId:$attachmentId:$variant"
}

/** Coil model for a profile photo, served by the avatar endpoint. */
data class ProfileAvatar(
    val loginId: String,
    val spaceId: String,
    val accountId: UUID,
    val attachmentId: UUID,
) {
    val cacheKey: String get() = "avatar:$loginId:$spaceId:$accountId:$attachmentId"
}

/**
 * Fetches attachment bytes through the backend's read-access contract.
 *
 * Every network delivery first asks for a fresh read descriptor, so the
 * backend authorizes each read. Bytes are never written to disk: the
 * [ImageLoader] is configured memory-only, matching the Web rule that private
 * media is not persisted on the device.
 */
class AttachmentFetcher(
    private val data: AttachmentImage,
    private val api: EimirApi,
    private val baseUrl: HttpUrl,
    private val authenticated: OkHttpClient,
    private val unauthenticated: OkHttpClient,
) : Fetcher {
    override suspend fun fetch(): FetchResult {
        val descriptor = api.attachmentReadAccess(
            data.spaceId,
            data.attachmentId.toString(),
            AttachmentReadRequest(
                parentId = data.parentId,
                parentType = AttachmentReadRequest.ParentType.valueOf(data.parent.name),
                variant = if (data.variant == MediaVariant.THUMBNAIL) {
                    AttachmentReadRequest.Variant.thumbnail
                } else {
                    AttachmentReadRequest.Variant.original
                },
            ),
        )
        val request = Request.Builder().urlFrom(baseUrl, descriptor.url).build()
        // STREAM URLs are served by the API and need the bearer token; signed
        // URLs point at storage and must not receive it.
        val client = if (descriptor.method == ReadDescriptor.Method.STREAM && request.url.isSameOrigin(baseUrl)) {
            authenticated
        } else {
            unauthenticated
        }
        return download(client, request)
    }

    class Factory(
        private val api: EimirApi,
        private val baseUrl: HttpUrl,
        private val authenticated: OkHttpClient,
        private val unauthenticated: OkHttpClient,
    ) : Fetcher.Factory<AttachmentImage> {
        override fun create(data: AttachmentImage, options: Options, imageLoader: ImageLoader): Fetcher =
            AttachmentFetcher(data, api, baseUrl, authenticated, unauthenticated)
    }
}

class AvatarFetcher(
    private val data: ProfileAvatar,
    private val baseUrl: HttpUrl,
    private val authenticated: OkHttpClient,
) : Fetcher {
    override suspend fun fetch(): FetchResult {
        val url = baseUrl.newBuilder()
            .addPathSegments("api/v1/spaces/${data.spaceId}/profiles/${data.accountId}/avatar/content")
            .build()
        return download(authenticated, Request.Builder().url(url).build())
    }

    class Factory(private val baseUrl: HttpUrl, private val authenticated: OkHttpClient) : Fetcher.Factory<ProfileAvatar> {
        override fun create(data: ProfileAvatar, options: Options, imageLoader: ImageLoader): Fetcher =
            AvatarFetcher(data, baseUrl, authenticated)
    }
}

private suspend fun download(client: OkHttpClient, request: Request): FetchResult {
    val response = client.newCall(request).executeAsync()
    response.use {
        if (!it.isSuccessful) throw IOException("Media unavailable (${it.code}).")
        val body = it.body
        val buffer = Buffer()
        body.source().readAll(buffer)
        return SourceFetchResult(
            source = ImageSource(buffer, FileSystem.SYSTEM),
            mimeType = body.contentType()?.toString(),
            dataSource = DataSource.NETWORK,
        )
    }
}
