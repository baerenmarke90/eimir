package de.eimir.nativetest.auth

import eimir.api.models.AccountView
import eimir.api.models.TokenView
import java.io.IOException
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class InMemoryPersistence(var stored: StoredSession? = null) : SessionPersistence {
    var writes = 0
    override fun read() = stored
    override fun write(session: StoredSession) {
        writes++
        stored = session
    }
    override fun clear() {
        stored = null
    }
}

class FakeTransport : SessionTransport {
    val refreshes = AtomicInteger()
    var failure: Throwable? = null
    var signedOut: String? = null
    private var generation = 0

    override suspend fun refresh(refreshToken: String): TokenView {
        refreshes.incrementAndGet()
        delay(10)
        failure?.let { throw it }
        generation++
        return tokens("access-$generation", "refresh-$generation")
    }

    override suspend fun signOut(accessToken: String) {
        signedOut = accessToken
    }
}

private val NOW = OffsetDateTime.of(2026, 10, 28, 12, 0, 0, 0, ZoneOffset.UTC)

fun tokens(access: String, refresh: String) = TokenView(
    accessExpiresAt = NOW.plusMinutes(15),
    accessToken = access,
    refreshExpiresAt = NOW.plusDays(60),
    refreshToken = refresh,
)

class SessionManagerTest {
    private val origin = "https://demo.eimir.ur-cloud.de"
    private val account = AccountView(displayName = "Alex", id = UUID.fromString("018f0000-0000-7000-8000-000000000001"))
    private val now = { NOW.toEpochSecond() }

    private fun manager(persistence: InMemoryPersistence = InMemoryPersistence(), transport: FakeTransport = FakeTransport()) =
        SessionManager(persistence, transport, origin, now)

    @Test
    fun `restoring without a stored session signs out`() {
        val sessions = manager()
        sessions.restore()
        assertEquals(AuthState.SignedOut(), sessions.state.value)
    }

    @Test
    fun `a session issued for another origin is never reused`() = runTest {
        val persistence = InMemoryPersistence()
        val first = manager(persistence)
        first.signIn(account, tokens("a", "r"))
        val other = SessionManager(persistence, FakeTransport(), "https://other.example", now)
        other.restore()
        assertTrue(other.state.value is AuthState.SignedOut)
        assertNull(persistence.stored)
    }

    @Test
    fun `concurrent refreshes rotate exactly once`() = runTest {
        val transport = FakeTransport()
        val sessions = manager(transport = transport)
        sessions.signIn(account, tokens("a0", "r0"))
        val results = (1..5).map { async { sessions.refresh("a0") } }.awaitAll()
        assertEquals(1, transport.refreshes.get())
        assertTrue(results.all { it == RefreshOutcome.Valid("access-1") })
        assertEquals("refresh-1", sessions.session?.refreshToken)
    }

    @Test
    fun `a network failure keeps the stored session`() = runTest {
        val transport = FakeTransport().apply { failure = IOException("offline") }
        val persistence = InMemoryPersistence()
        val sessions = manager(persistence, transport)
        sessions.signIn(account, tokens("a0", "r0"))
        assertEquals(RefreshOutcome.Unavailable, sessions.refresh("a0"))
        assertTrue(sessions.state.value is AuthState.SignedIn)
        assertEquals("r0", persistence.stored?.refreshToken)
    }

    @Test
    fun `a server failure keeps the stored session`() = runTest {
        val transport = FakeTransport().apply { failure = HttpException(Response.error<Any>(503, "".toResponseBody())) }
        val sessions = manager(transport = transport)
        sessions.signIn(account, tokens("a0", "r0"))
        assertEquals(RefreshOutcome.Unavailable, sessions.refresh("a0"))
        assertTrue(sessions.state.value is AuthState.SignedIn)
    }

    @Test
    fun `an authentication rejection ends the session`() = runTest {
        val transport = FakeTransport().apply { failure = HttpException(Response.error<Any>(401, "".toResponseBody())) }
        val persistence = InMemoryPersistence()
        val sessions = manager(persistence, transport)
        sessions.signIn(account, tokens("a0", "r0"))
        assertEquals(RefreshOutcome.Rejected, sessions.refresh("a0"))
        assertEquals(AuthState.SignedOut(SignOutReason.SessionEnded), sessions.state.value)
        assertNull(persistence.stored)
    }

    @Test
    fun `sign out clears locally even when the server call fails`() = runTest {
        val persistence = InMemoryPersistence()
        val transport = object : SessionTransport {
            override suspend fun refresh(refreshToken: String) = error("unused")
            override suspend fun signOut(accessToken: String) = throw IOException("offline")
        }
        val sessions = SessionManager(persistence, transport, origin, now)
        sessions.signIn(account, tokens("a0", "r0"))
        sessions.signOut()
        assertNull(persistence.stored)
        assertEquals(AuthState.SignedOut(SignOutReason.UserRequested), sessions.state.value)
    }

    @Test
    fun `every sign-in gets a new login identity and another account never inherits a space`() = runTest {
        val sessions = manager()
        sessions.signIn(account, tokens("a0", "r0"), spaceId = "space-1")
        val firstLogin = sessions.session?.loginId
        sessions.signIn(account, tokens("a1", "r1"))
        assertNotEquals(firstLogin, sessions.session?.loginId)
        assertEquals("space-1", sessions.session?.activeSpaceId)
        val other = AccountView(displayName = "Lea", id = UUID.fromString("018f0000-0000-7000-8000-000000000002"))
        sessions.signIn(other, tokens("a2", "r2"))
        assertNull(sessions.session?.activeSpaceId)
    }

    @Test
    fun `token rotation keeps the login identity`() = runTest {
        val sessions = manager()
        sessions.signIn(account, tokens("a0", "r0"))
        val login = sessions.session?.loginId
        sessions.refresh("a0")
        assertEquals(login, sessions.session?.loginId)
    }

    @Test
    fun `an expired refresh window is not restored`() {
        val persistence = InMemoryPersistence(
            StoredSession(origin, "id", "Alex", "a", 0, "r", NOW.minusDays(1).toEpochSecond()),
        )
        val sessions = manager(persistence)
        sessions.restore()
        assertTrue(sessions.state.value is AuthState.SignedOut)
    }
}
