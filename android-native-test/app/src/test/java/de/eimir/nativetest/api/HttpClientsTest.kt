package de.eimir.nativetest.api

import de.eimir.nativetest.auth.AuthState
import de.eimir.nativetest.auth.InMemoryPersistence
import de.eimir.nativetest.auth.SessionManager
import de.eimir.nativetest.auth.SessionTransport
import de.eimir.nativetest.auth.tokens
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.attempt
import de.eimir.nativetest.core.appError
import eimir.api.models.AccountView
import eimir.api.models.RefreshRequest
import eimir.api.models.TokenView
import java.util.UUID
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The real OkHttp stack against a local server: bearer, rotation and outage behaviour. */
class HttpClientsTest {
    private val server = MockWebServer()
    private lateinit var sessions: SessionManager
    private lateinit var clients: HttpClients

    @Before
    fun setUp() {
        server.start()
        val origin = server.url("/").toString().removeSuffix("/")
        lateinit var holder: HttpClients
        sessions = SessionManager(
            InMemoryPersistence(),
            object : SessionTransport {
                override suspend fun refresh(refreshToken: String): TokenView = holder.sessionApi.refresh(RefreshRequest(refreshToken))
                override suspend fun signOut(accessToken: String) = holder.sessionApi.signOut("Bearer $accessToken")
            },
            origin,
            nowEpochSeconds = { java.time.OffsetDateTime.parse("2026-10-28T12:00:00Z").toEpochSecond() },
        )
        holder = HttpClients(origin, "test", sessions)
        clients = holder
        runBlocking {
            sessions.signIn(AccountView(displayName = "Alex", id = UUID.randomUUID()), tokens("access-0", "refresh-0"))
        }
    }

    @After
    fun tearDown() = server.close()

    private fun json(body: String, code: Int = 200) =
        MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build()

    private val accountJson = """{"id":"018f0000-0000-7000-8000-000000000001","displayName":"Alex"}"""
    private val refreshedJson = """{"accessToken":"access-1","refreshToken":"refresh-1",
        "accessExpiresAt":"2026-10-28T12:15:00Z","refreshExpiresAt":"2026-12-28T12:00:00Z"}"""

    @Test
    fun `requests carry the bearer token`() = runBlocking {
        server.enqueue(json(accountJson))
        clients.api.me()
        assertEquals("Bearer access-0", server.takeRequest().headers["Authorization"])
    }

    @Test
    fun `a rejected token is rotated once and the request retried`() = runBlocking {
        server.enqueue(json("""{"title":"Unauthorized"}""", 401))
        server.enqueue(json(refreshedJson))
        server.enqueue(json(accountJson))
        clients.api.me()
        assertEquals("Bearer access-0", server.takeRequest().headers["Authorization"])
        val refresh = server.takeRequest()
        assertEquals("/api/v1/auth/refresh", refresh.url.encodedPath)
        assertEquals(null, refresh.headers["Authorization"])
        assertEquals("Bearer access-1", server.takeRequest().headers["Authorization"])
        assertEquals("refresh-1", sessions.session?.refreshToken)
    }

    @Test
    fun `a server outage during refresh keeps the session and reports offline`() = runBlocking {
        server.enqueue(json("""{"title":"Unauthorized"}""", 401))
        server.enqueue(json("""{"title":"Unavailable"}""", 503))
        val result = attempt { clients.api.me() }
        assertEquals(AppError.Offline, result.exceptionOrNull()?.appError)
        assertTrue(sessions.state.value is AuthState.SignedIn)
        assertEquals("refresh-0", sessions.session?.refreshToken)
    }

    @Test
    fun `a rejected refresh signs out`() = runBlocking {
        server.enqueue(json("""{"title":"Unauthorized"}""", 401))
        server.enqueue(json("""{"title":"Unauthorized"}""", 401))
        val result = attempt { clients.api.me() }
        assertEquals(AppError.SessionEnded, result.exceptionOrNull()?.appError)
        assertTrue(sessions.state.value is AuthState.SignedOut)
    }

    @Test
    fun `forbidden and missing resources share one unavailable state`() = runBlocking {
        server.enqueue(json("""{"title":"Not found"}""", 404))
        server.enqueue(json("""{"title":"Forbidden"}""", 403))
        assertEquals(AppError.Unavailable, attempt { clients.api.memory("s", "m") }.exceptionOrNull()?.appError)
        assertEquals(AppError.Unavailable, attempt { clients.api.memory("s", "m") }.exceptionOrNull()?.appError)
    }

    @Test
    fun `premium entitlement errors are explained as premium`() = runBlocking {
        server.enqueue(json("""{"title":"Forbidden","code":"PREMIUM_ENTITLEMENT_REQUIRED"}""", 403))
        assertEquals(AppError.PremiumRequired, attempt { clients.api.memory("s", "m") }.exceptionOrNull()?.appError)
    }

    @Test
    fun `version conflicts are reported as conflicts`() = runBlocking {
        server.enqueue(json("""{"title":"Conflict"}""", 409))
        val result = attempt { clients.api.deleteMemory("s", "m", "3") }
        assertEquals(AppError.Conflict, result.exceptionOrNull()?.appError)
        assertEquals("3", server.takeRequest().headers["If-Match"])
    }
}
