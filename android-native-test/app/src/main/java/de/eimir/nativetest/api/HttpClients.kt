package de.eimir.nativetest.api

import de.eimir.nativetest.auth.RefreshOutcome
import de.eimir.nativetest.auth.SessionManager
import de.eimir.nativetest.core.ApiJson
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

/**
 * Builds the HTTP stack once per process.
 *
 * Nothing here logs request or response bodies, headers or URLs: tokens, signed
 * media URLs and personal content must never reach logcat.
 */
class HttpClients(
    origin: String,
    userAgent: String,
    private val sessions: SessionManager,
) {
    val baseUrl: HttpUrl = "$origin/".toHttpUrl()

    /** Shared connection pool and dispatcher for API, media and upload traffic. */
    private val root: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .followSslRedirects(false)
        .followRedirects(false)
        .addInterceptor { chain ->
            chain.proceed(chain.request().newBuilder().header("User-Agent", userAgent).build())
        }
        .build()

    /** Session endpoints: no authenticator, otherwise a refresh could recurse. */
    val sessionApi: SessionApi = retrofit(root).create(SessionApi::class.java)

    /** Authenticated API traffic with proactive and reactive token refresh. */
    val authenticated: OkHttpClient = root.newBuilder()
        .addInterceptor(BearerInterceptor(baseUrl, sessions))
        .authenticator(RefreshingAuthenticator(baseUrl, sessions))
        .build()

    /** Byte transfers (uploads, media) may legitimately take longer. */
    val transfer: OkHttpClient = authenticated.newBuilder()
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .build()

    /** Signed third-party storage URLs must never receive the bearer token. */
    val unauthenticatedTransfer: OkHttpClient = root.newBuilder()
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .build()

    val api: EimirApi = retrofit(authenticated).create(EimirApi::class.java)

    private fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(ApiJson.json.asConverterFactory("application/json".toMediaType()))
        .build()
}

internal fun HttpUrl.isSameOrigin(other: HttpUrl): Boolean =
    scheme == other.scheme && host == other.host && port == other.port

/** Adds the bearer token to same-origin requests and refreshes it shortly before expiry. */
private class BearerInterceptor(
    private val baseUrl: HttpUrl,
    private val sessions: SessionManager,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (!request.url.isSameOrigin(baseUrl) || request.header("Authorization") != null) {
            return chain.proceed(request)
        }
        if (sessions.accessTokenExpiresSoon()) {
            // A failed proactive refresh is not fatal: the request still goes
            // out and the authenticator decides on an actual 401.
            runBlocking { sessions.refresh(sessions.accessToken()) }
        }
        val token = sessions.accessToken() ?: return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
    }
}

/** Retries a rejected request exactly once with a rotated token. */
private class RefreshingAuthenticator(
    private val baseUrl: HttpUrl,
    private val sessions: SessionManager,
) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        val request = response.request
        if (!request.url.isSameOrigin(baseUrl) || response.priorResponse != null) return null
        val failed = request.header("Authorization")?.removePrefix("Bearer ") ?: return null
        return when (val outcome = runBlocking { sessions.refresh(failed) }) {
            is RefreshOutcome.Valid -> request.newBuilder().header("Authorization", "Bearer ${outcome.accessToken}").build()
            RefreshOutcome.Rejected -> null
            // Keep the session: report a connectivity failure rather than a sign-out.
            RefreshOutcome.Unavailable -> throw IOException("Session refresh unavailable.")
        }
    }
}

/** Builds a request for an absolute or origin-relative URL returned by the API. */
internal fun Request.Builder.urlFrom(baseUrl: HttpUrl, value: String): Request.Builder =
    url(baseUrl.resolve(value) ?: throw IOException("Unusable media URL."))
