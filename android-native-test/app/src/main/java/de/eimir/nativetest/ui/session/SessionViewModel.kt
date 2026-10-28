package de.eimir.nativetest.ui.session

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.auth.AuthState
import de.eimir.nativetest.auth.EntryLink
import de.eimir.nativetest.auth.EntryLinkParser
import de.eimir.nativetest.auth.SignOutReason
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.core.attempt
import eimir.api.models.AcceptRequest
import eimir.api.models.AccountMembershipView
import eimir.api.models.EmailRequest
import eimir.api.models.MagicLinkConsumeRequest
import eimir.api.models.SignupConsumeRequest
import eimir.api.models.SpaceView
import eimir.api.models.TokenOnlyRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What the root of the app shows. */
sealed interface Gate {
    data object Restoring : Gate
    data class SignIn(val reason: SignOutReason?) : Gate
    data object ResolvingSpace : Gate
    data class ChooseSpace(val spaces: List<SpaceView>) : Gate
    data object AwaitingSpace : Gate
    data class SpaceProblem(val error: AppError) : Gate
    data class Ready(val spaceId: String, val loginId: String) : Gate
}

/** Sign-in task state; the e-mail address stays in memory only. */
data class SignInUi(
    val email: String = "",
    val sending: Boolean = false,
    val sentTo: String? = null,
    val consuming: Boolean = false,
    val error: AppError? = null,
    val linkError: Boolean = false,
)

/** A delivered proof that needs the person's confirmation before it is used. */
sealed interface PendingEntry {
    /** A Magic Link while another login is active would replace that login. */
    data class ReplaceLogin(val link: EntryLink.MagicLink) : PendingEntry
    /** A signup proof that creates a new Account asks for a display name. */
    data class SignupName(val link: EntryLink.Signup) : PendingEntry
}

class SessionViewModel(private val graph: AppGraph) : ViewModel() {
    private val sessions = graph.sessions
    private val api = graph.http.api

    private val _gate = MutableStateFlow<Gate>(Gate.Restoring)
    val gate: StateFlow<Gate> = _gate.asStateFlow()

    private val _signIn = MutableStateFlow(SignInUi())
    val signIn: StateFlow<SignInUi> = _signIn.asStateFlow()

    private val _pending = MutableStateFlow<PendingEntry?>(null)
    val pending: StateFlow<PendingEntry?> = _pending.asStateFlow()

    /** An invitation that arrived before sign-in; accepted right after it. */
    private var pendingInvitation: EntryLink.Invitation? = null
    private var lastLoginId: String? = null
    private var lastSpaceId: String? = null

    init {
        viewModelScope.launch {
            sessions.state.collect { state ->
                when (state) {
                    AuthState.Restoring -> _gate.value = Gate.Restoring
                    is AuthState.SignedOut -> {
                        resetPrivateState()
                        _gate.value = Gate.SignIn(state.reason)
                    }
                    is AuthState.SignedIn -> onSignedIn(state.session.loginId, state.session.activeSpaceId)
                }
            }
        }
    }

    private fun resetPrivateState() {
        lastLoginId = null
        lastSpaceId = null
        graph.clearPrivateCaches()
    }

    private fun onSignedIn(loginId: String, activeSpaceId: String?) {
        // Token rotation re-emits the same login and Space; only a real transition matters.
        val changed = loginId != lastLoginId || activeSpaceId != lastSpaceId
        if (changed) {
            // Any login or Space transition starts from empty private caches.
            graph.clearPrivateCaches()
        }
        lastLoginId = loginId
        lastSpaceId = activeSpaceId
        pendingInvitation?.let { invitation ->
            pendingInvitation = null
            acceptInvitation(invitation)
            return
        }
        if (activeSpaceId != null) {
            _gate.value = Gate.Ready(activeSpaceId, loginId)
            if (changed) revalidateMemberships(activeSpaceId)
        } else if (changed) {
            resolveSpace()
        }
    }

    fun resolveSpace() {
        _gate.value = Gate.ResolvingSpace
        viewModelScope.launch {
            attempt { api.memberships() }
                .onSuccess { memberships -> chooseFrom(memberships.filter { it.status == "ACTIVE" }) }
                .onFailure { _gate.value = Gate.SpaceProblem(it.appError) }
        }
    }

    private suspend fun chooseFrom(memberships: List<AccountMembershipView>) {
        when (memberships.size) {
            0 -> _gate.value = Gate.AwaitingSpace
            1 -> sessions.selectSpace(memberships.single().spaceId.toString())
            else -> attempt { memberships.map { api.space(it.spaceId.toString()) } }
                .onSuccess { _gate.value = Gate.ChooseSpace(it) }
                .onFailure { _gate.value = Gate.SpaceProblem(it.appError) }
        }
    }

    /**
     * Confirms in the background that the stored Space is still authorized.
     * A transient failure keeps the visible product; an authoritative answer
     * without the Space leaves it immediately (fail closed).
     */
    private fun revalidateMemberships(spaceId: String) {
        viewModelScope.launch {
            attempt { api.memberships() }.onSuccess { memberships ->
                val active = memberships.filter { it.status == "ACTIVE" }
                if (active.none { it.spaceId.toString() == spaceId }) {
                    sessions.selectSpace(null)
                }
            }
        }
    }

    fun selectSpace(spaceId: String) {
        viewModelScope.launch { sessions.selectSpace(spaceId) }
    }

    fun switchSpace() {
        viewModelScope.launch {
            sessions.selectSpace(null)
        }
    }

    // ---- Magic Link sign-in --------------------------------------------------------
    fun updateEmail(value: String) = _signIn.update { it.copy(email = value, error = null) }

    fun requestLink() {
        val email = _signIn.value.email.trim()
        if (!email.contains('@') || email.length < 3) {
            _signIn.update { it.copy(error = AppError.Invalid) }
            return
        }
        _signIn.update { it.copy(sending = true, error = null) }
        viewModelScope.launch {
            attempt { api.requestMagicLink(EmailRequest(email)) }
                // The backend answers identically for known and unknown
                // addresses; the UI must not suggest otherwise.
                .onSuccess { _signIn.update { it.copy(sending = false, sentTo = email) } }
                .onFailure { failure -> _signIn.update { it.copy(sending = false, error = failure.appError) } }
        }
    }

    fun editEmail() = _signIn.update { it.copy(sentTo = null, error = null, linkError = false) }

    /** Text pasted or shared by the person; only links from this instance are used. */
    fun submitLinkText(text: String?): Boolean {
        val link = EntryLinkParser.parse(text, graph.origin)
        if (link == null) {
            _signIn.update { it.copy(linkError = true) }
            return false
        }
        _signIn.update { it.copy(linkError = false) }
        handleEntry(link)
        return true
    }

    fun handleEntry(link: EntryLink) {
        val signedIn = sessions.session != null
        when (link) {
            is EntryLink.MagicLink ->
                if (signedIn) _pending.value = PendingEntry.ReplaceLogin(link) else consumeMagicLink(link)
            is EntryLink.Signup -> _pending.value = PendingEntry.SignupName(link)
            is EntryLink.Invitation ->
                if (signedIn) acceptInvitation(link) else pendingInvitation = link
            is EntryLink.EmailVerification -> viewModelScope.launch {
                attempt { api.confirmEmailVerification(TokenOnlyRequest(link.token)) }
            }
        }
    }

    fun dismissPending() {
        _pending.value = null
    }

    fun confirmReplaceLogin() {
        val pending = _pending.value as? PendingEntry.ReplaceLogin ?: return
        _pending.value = null
        consumeMagicLink(pending.link)
    }

    fun confirmSignup(displayName: String) {
        val pending = _pending.value as? PendingEntry.SignupName ?: return
        _pending.value = null
        _signIn.update { it.copy(consuming = true, error = null) }
        viewModelScope.launch {
            attempt {
                api.consumeSignup(
                    SignupConsumeRequest(
                        token = pending.link.token,
                        deviceName = deviceName(),
                        displayName = displayName.trim().ifEmpty { null },
                        platform = PLATFORM,
                    ),
                )
            }.onSuccess { result ->
                pending.link.invitationToken?.let { pendingInvitation = EntryLink.Invitation(it) }
                sessions.signIn(result.account, result.tokens, result.spaceId?.toString())
                _signIn.value = SignInUi()
            }.onFailure { failure -> _signIn.update { it.copy(consuming = false, error = failure.appError) } }
        }
    }

    private fun consumeMagicLink(link: EntryLink.MagicLink) {
        _signIn.update { it.copy(consuming = true, error = null) }
        viewModelScope.launch {
            attempt {
                api.consumeMagicLink(MagicLinkConsumeRequest(token = link.token, deviceName = deviceName(), platform = PLATFORM))
            }.onSuccess { session ->
                sessions.signIn(session.account, session.tokens)
                _signIn.value = SignInUi()
            }.onFailure { failure -> _signIn.update { it.copy(consuming = false, error = failure.appError) } }
        }
    }

    private fun acceptInvitation(link: EntryLink.Invitation) {
        _gate.value = Gate.ResolvingSpace
        viewModelScope.launch {
            attempt { api.acceptInvitation(AcceptRequest(link.token)) }
                .onSuccess { membership -> sessions.selectSpace(membership.spaceId.toString()) }
                .onFailure { _gate.value = Gate.SpaceProblem(it.appError) }
        }
    }

    fun signOut() {
        viewModelScope.launch { sessions.signOut() }
    }

    private fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(120)

    private companion object {
        /** Separates these device sessions from the Web/Capacitor ones in session management. */
        const val PLATFORM = "android-native"
    }
}
