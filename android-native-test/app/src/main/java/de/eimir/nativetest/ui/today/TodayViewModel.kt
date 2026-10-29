package de.eimir.nativetest.ui.today

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.refreshing
import eimir.api.models.DashboardView
import eimir.api.models.DurationDisplayMode
import eimir.api.models.PartnerPresenceView
import java.time.OffsetDateTime
import java.time.Period
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ImpulseState {
    data object Idle : ImpulseState
    data object Sending : ImpulseState
    data object Sent : ImpulseState
    data class Failed(val error: AppError) : ImpulseState
}

data class RelationshipDuration(val displayMode: DurationDisplayMode, val daysTogether: Int, val years: Int, val months: Int)

data class TodayState(
    val dashboard: Load<DashboardView> = Load.Loading,
    val ownName: String = "",
    val ownAccountId: UUID? = null,
    val ownAvatarId: UUID? = null,
    val partnerAccountId: UUID? = null,
    val partnerAvatarId: UUID? = null,
    val presence: PartnerPresenceView.State? = null,
    val duration: RelationshipDuration? = null,
    val unread: Int = 0,
    val thinking: ImpulseState = ImpulseState.Idle,
    val thinkingAvailableAt: OffsetDateTime? = null,
)

class TodayViewModel(private val graph: AppGraph) : ViewModel() {
    private val repository = graph.repository
    private val _state = MutableStateFlow(TodayState())
    val state: StateFlow<TodayState> = _state.asStateFlow()
    private var loading: Job? = null
    private var lastLoad = 0L

    /** One logical send; a retry of the same tap reuses it so the partner is notified once. */
    private var thinkingRequestId: UUID? = null

    init {
        val session = graph.sessions.session
        _state.update {
            it.copy(ownName = session?.displayName.orEmpty(), ownAccountId = session?.accountId?.let(UUID::fromString))
        }
        refresh()
        viewModelScope.launch {
            graph.changes.events.collect { change ->
                when (change) {
                    is Change.Memory, Change.Planning -> refresh()
                    Change.Notifications -> loadUnread()
                    else -> Unit
                }
            }
        }
        viewModelScope.launch {
            // Revalidate after a reconnect without discarding what is shown.
            var wasOnline = graph.connectivity.online.value
            graph.connectivity.online.collect { online ->
                if (online && !wasOnline) refresh()
                wasOnline = online
            }
        }
    }

    fun refreshQuietly() {
        if (System.currentTimeMillis() - lastLoad > 30_000) refresh()
        loadUnread()
    }

    fun refresh() {
        loading?.cancel()
        _state.update { it.copy(dashboard = it.dashboard.refreshing()) }
        loading = viewModelScope.launch {
            val dashboardCall = async { repository.dashboard() }
            val presenceCall = async { repository.presence() }
            launch { loadUnread() }
            dashboardCall.await()
                .onSuccess { dashboard ->
                    lastLoad = System.currentTimeMillis()
                    _state.update { it.copy(dashboard = Load.Ready(dashboard), partnerAccountId = dashboard.space.partner?.id) }
                    loadAvatars(dashboard)
                    val duration = dashboard.relationshipDuration
                    if (duration != null) {
                        val period = Period.between(duration.startedOn, dashboard.viewerLocalDate ?: java.time.LocalDate.now())
                        _state.update {
                            it.copy(duration = RelationshipDuration(duration.displayMode, duration.daysTogether, period.years, period.months))
                        }
                    }
                }
                .onFailure { failure -> _state.update { it.copy(dashboard = it.dashboard.failedWith(failure.appError)) } }
            presenceCall.await().onSuccess { presence -> _state.update { it.copy(presence = presence.state) } }
        }
    }

    private fun loadAvatars(dashboard: DashboardView) {
        viewModelScope.launch {
            val own = _state.value.ownAccountId
            if (own != null) {
                repository.personProfile(own.toString()).onSuccess { profile ->
                    _state.update { it.copy(ownAvatarId = profile.profileAttachmentId, ownName = profile.displayName) }
                }
            }
            dashboard.space.partner?.let { partner ->
                repository.personProfile(partner.id.toString()).onSuccess { profile ->
                    _state.update { it.copy(partnerAvatarId = profile.profileAttachmentId) }
                }
            }
        }
    }

    private fun loadUnread() {
        viewModelScope.launch {
            repository.unreadNotifications().onSuccess { count -> _state.update { it.copy(unread = count) } }
        }
    }

    /** Sends only on an explicit tap and reports success only after the server accepted it. */
    fun sendThinkingOfYou() {
        if (_state.value.thinking == ImpulseState.Sending) return
        val requestId = thinkingRequestId ?: UUID.randomUUID().also { thinkingRequestId = it }
        _state.update { it.copy(thinking = ImpulseState.Sending) }
        viewModelScope.launch {
            repository.thinkingOfYou(requestId)
                .onSuccess { accepted ->
                    thinkingRequestId = null
                    _state.update { it.copy(thinking = ImpulseState.Sent, thinkingAvailableAt = accepted.thinkingOfYouAvailableAt) }
                }
                .onFailure { failure -> _state.update { it.copy(thinking = ImpulseState.Failed(failure.appError)) } }
        }
    }
}
