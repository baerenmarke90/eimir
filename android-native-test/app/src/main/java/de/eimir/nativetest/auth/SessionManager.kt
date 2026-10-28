package de.eimir.nativetest.auth

import eimir.api.models.AccountView
import eimir.api.models.TokenView
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.HttpException

sealed interface AuthState {
    data object Restoring : AuthState
    data class SignedOut(val reason: SignOutReason? = null) : AuthState
    data class SignedIn(val session: StoredSession) : AuthState
}

enum class SignOutReason { UserRequested, SessionEnded }

/** Outcome of a refresh attempt; only [Rejected] ends the session. */
sealed interface RefreshOutcome {
    data class Valid(val accessToken: String) : RefreshOutcome
    data object Rejected : RefreshOutcome
    data object Unavailable : RefreshOutcome
}

/** Network seam for the two session endpoints that run without the authenticator. */
interface SessionTransport {
    suspend fun refresh(refreshToken: String): TokenView
    suspend fun signOut(accessToken: String)
}

/**
 * Owns the device session and its rotation.
 *
 * The backend rotates both tokens on every refresh and revokes the whole token
 * family when any consumed generation is presented again. Two concurrent
 * refreshes would therefore sign the person out. All refreshes run under one
 * [Mutex], the rotated pair is persisted before it is used, and a caller whose
 * failed token was already replaced simply receives the current one.
 *
 * Only an explicit authentication rejection ends the session. Network and
 * server failures keep the stored session so a temporary outage never forces
 * a new sign-in.
 */
class SessionManager(
    private val persistence: SessionPersistence,
    private val transport: SessionTransport,
    private val origin: String,
    private val nowEpochSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow<AuthState>(AuthState.Restoring)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    @Volatile
    private var current: StoredSession? = null

    val session: StoredSession? get() = current

    fun restore() {
        val stored = persistence.read()?.takeIf { it.origin == origin }
        if (stored == null || stored.refreshExpiresAtEpochSeconds <= nowEpochSeconds()) {
            persistence.clear()
            current = null
            _state.value = AuthState.SignedOut()
        } else {
            current = stored
            _state.value = AuthState.SignedIn(stored)
        }
    }

    suspend fun signIn(account: AccountView, tokens: TokenView, spaceId: String? = null) = mutex.withLock {
        val previous = current
        val session = StoredSession(
            origin = origin,
            accountId = account.id.toString(),
            displayName = account.displayName,
            accessToken = tokens.accessToken,
            accessExpiresAtEpochSeconds = tokens.accessExpiresAt.toEpochSecond(),
            refreshToken = tokens.refreshToken,
            refreshExpiresAtEpochSeconds = tokens.refreshExpiresAt.toEpochSecond(),
            // A Space is only carried over for the same Account; a different
            // Account must never inherit the previous Space context.
            activeSpaceId = spaceId ?: previous?.activeSpaceId?.takeIf { previous.accountId == account.id.toString() },
            loginId = UUID.randomUUID().toString(),
        )
        persistence.write(session)
        current = session
        _state.value = AuthState.SignedIn(session)
    }

    suspend fun selectSpace(spaceId: String?) = mutex.withLock {
        val session = current ?: return@withLock
        if (session.activeSpaceId == spaceId) return@withLock
        val updated = session.copy(activeSpaceId = spaceId)
        persistence.write(updated)
        current = updated
        _state.value = AuthState.SignedIn(updated)
    }

    fun accessToken(): String? = current?.accessToken

    /** True when the access token expires within [marginSeconds]. */
    fun accessTokenExpiresSoon(marginSeconds: Long = 60): Boolean {
        val session = current ?: return false
        return session.accessExpiresAtEpochSeconds - marginSeconds <= nowEpochSeconds()
    }

    /**
     * Refreshes the session once. [failedAccessToken] is the token a request
     * was rejected with; when it has already been rotated by another caller
     * the current token is returned without a second refresh.
     */
    suspend fun refresh(failedAccessToken: String? = null): RefreshOutcome = mutex.withLock {
        val session = current ?: return@withLock RefreshOutcome.Rejected
        if (failedAccessToken != null && failedAccessToken != session.accessToken) {
            return@withLock RefreshOutcome.Valid(session.accessToken)
        }
        if (session.refreshExpiresAtEpochSeconds <= nowEpochSeconds()) {
            endSession(SignOutReason.SessionEnded)
            return@withLock RefreshOutcome.Rejected
        }
        try {
            val tokens = transport.refresh(session.refreshToken)
            val rotated = session.copy(
                accessToken = tokens.accessToken,
                accessExpiresAtEpochSeconds = tokens.accessExpiresAt.toEpochSecond(),
                refreshToken = tokens.refreshToken,
                refreshExpiresAtEpochSeconds = tokens.refreshExpiresAt.toEpochSecond(),
            )
            persistence.write(rotated)
            current = rotated
            _state.value = AuthState.SignedIn(rotated)
            RefreshOutcome.Valid(rotated.accessToken)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (http: HttpException) {
            if (http.code() == 401 || http.code() == 403) {
                endSession(SignOutReason.SessionEnded)
                RefreshOutcome.Rejected
            } else {
                RefreshOutcome.Unavailable
            }
        } catch (_: IOException) {
            RefreshOutcome.Unavailable
        }
    }

    /** Signs out locally in every case; server revocation is best effort. */
    suspend fun signOut() {
        val token = mutex.withLock {
            val token = current?.accessToken
            endSession(SignOutReason.UserRequested)
            token
        }
        if (token != null) runCatching { transport.signOut(token) }.onFailure { if (it is CancellationException) throw it }
    }

    /** Called when the server rejected an authenticated request after a refresh. */
    suspend fun sessionRejected() = mutex.withLock { endSession(SignOutReason.SessionEnded) }

    private fun endSession(reason: SignOutReason) {
        persistence.clear()
        current = null
        _state.value = AuthState.SignedOut(reason)
    }
}
