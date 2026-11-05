package de.eimir.nativetest.core

import android.app.Application
import android.os.Build
import coil3.ImageLoader
import coil3.disk.DiskCache
import coil3.key.Keyer
import coil3.memory.MemoryCache
import coil3.request.CachePolicy
import coil3.request.Options
import coil3.request.crossfade
import de.eimir.nativetest.BuildConfig
import de.eimir.nativetest.api.HttpClients
import de.eimir.nativetest.auth.KeystoreSessionPersistence
import de.eimir.nativetest.auth.SessionManager
import de.eimir.nativetest.auth.SessionPersistence
import de.eimir.nativetest.auth.SessionTransport
import de.eimir.nativetest.data.ChangeBus
import de.eimir.nativetest.data.EimirRepository
import de.eimir.nativetest.media.AttachmentFetcher
import de.eimir.nativetest.media.AttachmentImage
import de.eimir.nativetest.media.AttachmentUploader
import de.eimir.nativetest.media.AvatarFetcher
import de.eimir.nativetest.media.PhotoSharing
import de.eimir.nativetest.media.ProfileAvatar
import eimir.api.models.RefreshRequest
import eimir.api.models.TokenView

/**
 * Process-wide object graph, created once by the Application.
 *
 * Constructor injection keeps every dependency explicit and testable without a
 * DI framework; the graph is small enough that a container is not worth the
 * build-time cost.
 */
class AppGraph(
    application: Application,
    val origin: String = BuildConfig.API_ORIGIN,
    persistence: SessionPersistence = KeystoreSessionPersistence(application),
) {
    val userAgent: String =
        "eimir-native-test/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE}; ${BuildConfig.SOURCE_REVISION})"

    private lateinit var clients: HttpClients

    val sessions: SessionManager = SessionManager(
        persistence = persistence,
        transport = object : SessionTransport {
            override suspend fun refresh(refreshToken: String): TokenView =
                clients.sessionApi.refresh(RefreshRequest(refreshToken))

            override suspend fun signOut(accessToken: String) =
                clients.sessionApi.signOut("Bearer $accessToken")
        },
        origin = origin,
    )

    init {
        clients = HttpClients(origin, userAgent, sessions)
    }

    val http: HttpClients get() = clients
    val connectivity = ConnectivityMonitor(application)
    val changes = ChangeBus()
    val repository = EimirRepository(clients.api, sessions, changes)
    val uploader = AttachmentUploader(application.contentResolver, clients.api, clients)

    /**
     * Memory-only image pipeline. Personal media is never written to disk
     * (Web rule M2-D18 / #1384); the bounded memory cache is cleared on every
     * sign-out and Space change through [clearPrivateCaches].
     */
    val imageLoader: ImageLoader = ImageLoader.Builder(application)
        .components {
            add(AttachmentFetcher.Factory(clients.api, clients.baseUrl, clients.transfer, clients.unauthenticatedTransfer))
            add(AvatarFetcher.Factory(clients.baseUrl, clients.transfer))
            add(Keyer<AttachmentImage> { data, _: Options -> data.cacheKey })
            add(Keyer<ProfileAvatar> { data, _: Options -> data.cacheKey })
        }
        .memoryCache {
            MemoryCache.Builder().maxSizePercent(application, 0.20).build()
        }
        .diskCache(null as DiskCache?)
        .diskCachePolicy(CachePolicy.DISABLED)
        .crossfade(false)
        .build()

    private val context: Application = application

    fun clearPrivateCaches() {
        imageLoader.memoryCache?.clear()
        repository.clear()
        PhotoSharing.clear(context)
    }
}
