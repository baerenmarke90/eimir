package de.eimir.nativetest.ui.planning

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.refreshing
import eimir.api.models.PlanCreate
import eimir.api.models.PlanDetail
import eimir.api.models.PlanSchedule
import eimir.api.models.PlanUpdate
import eimir.api.models.WishDetail
import eimir.api.models.WishToPlan
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Calendar day a plan starts on, from either schedule form. */
fun PlanDetail.startDate(): LocalDate? =
    plannedOn ?: plannedStart?.atZoneSameInstant(ZoneId.systemDefault())?.toLocalDate()

fun PlanDetail.endDate(): LocalDate? = plannedEnd?.atZoneSameInstant(ZoneId.systemDefault())?.toLocalDate()

data class PlanningData(val plans: List<PlanDetail>, val wishes: List<WishDetail>)

class PlanningViewModel(private val graph: AppGraph) : ViewModel() {
    private val _state = MutableStateFlow<Load<PlanningData>>(Load.Loading)
    val state: StateFlow<Load<PlanningData>> = _state.asStateFlow()
    private var lastLoad = 0L

    init {
        load()
        viewModelScope.launch { graph.changes.events.collect { if (it == Change.Planning) load() } }
    }

    fun refreshQuietly() {
        if (System.currentTimeMillis() - lastLoad > 60_000) load()
    }

    fun load() {
        _state.update { it.refreshing() }
        viewModelScope.launch {
            val plans = async { graph.repository.plans() }
            val wishes = async { graph.repository.wishes() }
            val planResult = plans.await()
            val wishResult = wishes.await()
            val failure = planResult.exceptionOrNull() ?: wishResult.exceptionOrNull()
            if (failure != null) {
                _state.update { it.failedWith(failure.appError) }
            } else {
                lastLoad = System.currentTimeMillis()
                _state.value = Load.Ready(PlanningData(planResult.getOrThrow(), wishResult.getOrThrow()))
            }
        }
    }
}

/** Result of a detail action, so the screen can confirm it or explain the failure. */
sealed interface ActionState {
    data object Idle : ActionState
    data object Running : ActionState
    data class Failed(val error: AppError) : ActionState
}

class PlanDetailViewModel(private val graph: AppGraph, private val planId: String) : ViewModel() {
    private val repository = graph.repository
    private val _plan = MutableStateFlow<Load<PlanDetail>>(Load.Loading)
    val plan: StateFlow<Load<PlanDetail>> = _plan.asStateFlow()
    private val _action = MutableStateFlow<ActionState>(ActionState.Idle)
    val action: StateFlow<ActionState> = _action.asStateFlow()
    private val _closed = MutableStateFlow<String?>(null)

    /** Set after delete ("") or return-to-wish (wish id): the screen leaves. */
    val closed: StateFlow<String?> = _closed.asStateFlow()

    init {
        load()
        viewModelScope.launch { graph.changes.events.collect { if (it == Change.Planning && _action.value != ActionState.Running) load() } }
    }

    fun load() {
        viewModelScope.launch {
            repository.plan(planId)
                .onSuccess { _plan.value = Load.Ready(it) }
                .onFailure { failure -> _plan.update { it.failedWith(failure.appError) } }
        }
    }

    private fun run(block: suspend (PlanDetail) -> Result<*>) {
        val plan = _plan.value.valueOrNull ?: return
        if (_action.value == ActionState.Running) return
        _action.value = ActionState.Running
        viewModelScope.launch {
            block(plan)
                .onSuccess { result ->
                    _action.value = ActionState.Idle
                    if (result is PlanDetail) _plan.value = Load.Ready(result)
                }
                .onFailure { failure ->
                    _action.value = ActionState.Failed(failure.appError)
                    if (failure.appError == AppError.Conflict) load()
                }
        }
    }

    fun schedule(date: LocalDate) = run { repository.schedulePlan(it, PlanSchedule(plannedOn = date)) }
    fun unschedule() = run { repository.unschedulePlan(it) }
    fun complete(on: LocalDate) = run { repository.completePlan(it, on) }
    fun returnToWish() = run { plan ->
        repository.returnPlanToWish(plan).onSuccess { _closed.value = it.wish.id.toString() }
    }
    fun delete() = run { plan -> repository.deletePlan(plan).onSuccess { _closed.value = "" } }
    fun dismissError() {
        _action.value = ActionState.Idle
    }
}

class WishDetailViewModel(private val graph: AppGraph, private val wishId: String) : ViewModel() {
    private val repository = graph.repository
    private val _wish = MutableStateFlow<Load<WishDetail>>(Load.Loading)
    val wish: StateFlow<Load<WishDetail>> = _wish.asStateFlow()
    private val _linkedPlans = MutableStateFlow<List<PlanDetail>>(emptyList())
    val linkedPlans: StateFlow<List<PlanDetail>> = _linkedPlans.asStateFlow()
    private val _action = MutableStateFlow<ActionState>(ActionState.Idle)
    val action: StateFlow<ActionState> = _action.asStateFlow()
    private val _deleted = MutableStateFlow(false)
    val deleted: StateFlow<Boolean> = _deleted.asStateFlow()

    init {
        load()
        viewModelScope.launch { graph.changes.events.collect { if (it == Change.Planning && _action.value != ActionState.Running) load() } }
    }

    fun load() {
        viewModelScope.launch {
            repository.wish(wishId)
                .onSuccess { _wish.value = Load.Ready(it) }
                .onFailure { failure -> _wish.update { it.failedWith(failure.appError) } }
            // The wish/plan relation is read from the plans' sourceWishId.
            repository.plans().onSuccess { plans -> _linkedPlans.value = plans.filter { it.sourceWishId?.toString() == wishId } }
        }
    }

    private fun run(block: suspend (WishDetail) -> Result<*>) {
        val wish = _wish.value.valueOrNull ?: return
        if (_action.value == ActionState.Running) return
        _action.value = ActionState.Running
        viewModelScope.launch {
            block(wish)
                .onSuccess { result ->
                    _action.value = ActionState.Idle
                    if (result is WishDetail) _wish.value = Load.Ready(result)
                }
                .onFailure { failure ->
                    _action.value = ActionState.Failed(failure.appError)
                    if (failure.appError == AppError.Conflict) load()
                }
        }
    }

    fun complete() = run { repository.completeWish(it) }
    fun delete() = run { wish -> repository.deleteWish(wish).onSuccess { _deleted.value = true } }
    fun dismissError() {
        _action.value = ActionState.Idle
    }
}

data class PlanEditorUi(
    val loading: Boolean = false,
    val loadError: AppError? = null,
    val title: String = "",
    val description: String = "",
    val date: LocalDate? = null,
    val saving: Boolean = false,
    val saveError: AppError? = null,
    val savedPlanId: String? = null,
    val dirty: Boolean = false,
)

/**
 * Create, edit or "plan this wish". Text lives in saved state so a process
 * death keeps the draft; the create key is stable for retries of one draft.
 */
class PlanEditorViewModel(
    private val graph: AppGraph,
    private val saved: SavedStateHandle,
    private val planId: String?,
    private val fromWishId: String?,
) : ViewModel() {
    private val repository = graph.repository
    private val _ui = MutableStateFlow(
        PlanEditorUi(
            loading = planId != null || fromWishId != null,
            title = saved["title"] ?: "",
            description = saved["description"] ?: "",
            date = saved.get<String>("date")?.let(LocalDate::parse),
        ),
    )
    val ui: StateFlow<PlanEditorUi> = _ui.asStateFlow()
    private var original: PlanDetail? = null
    private var wish: WishDetail? = null
    private val createKey: String = saved["key"] ?: UUID.randomUUID().toString().also { saved["key"] = it }

    init {
        load()
    }

    fun load() {
        val restored = saved.contains("title")
        viewModelScope.launch {
            if (planId != null) {
                repository.plan(planId)
                    .onSuccess { plan ->
                        original = plan
                        _ui.update {
                            if (restored) {
                                it.copy(loading = false, dirty = true)
                            } else {
                                it.copy(loading = false, title = plan.title, description = plan.description.orEmpty(), date = plan.startDate())
                            }
                        }
                    }
                    .onFailure { failure -> _ui.update { it.copy(loading = false, loadError = failure.appError) } }
            } else if (fromWishId != null) {
                repository.wish(fromWishId)
                    .onSuccess { loaded ->
                        wish = loaded
                        _ui.update { if (restored) it.copy(loading = false) else it.copy(loading = false, title = loaded.title) }
                    }
                    .onFailure { failure -> _ui.update { it.copy(loading = false, loadError = failure.appError) } }
            }
        }
    }

    private fun edit(block: (PlanEditorUi) -> PlanEditorUi) {
        _ui.update { block(it).copy(dirty = true, saveError = null) }
        val ui = _ui.value
        saved["title"] = ui.title
        saved["description"] = ui.description
        saved["date"] = ui.date?.toString()
    }

    fun setTitle(value: String) = edit { it.copy(title = value.take(200)) }
    fun setDescription(value: String) = edit { it.copy(description = value.take(5000)) }
    fun setDate(value: LocalDate?) = edit { it.copy(date = value) }

    fun save() {
        val ui = _ui.value
        if (ui.saving || ui.title.isBlank()) return
        _ui.update { it.copy(saving = true, saveError = null) }
        val schedule = ui.date?.let { PlanSchedule(plannedOn = it) }
        viewModelScope.launch {
            val existing = original
            val sourceWish = wish
            val result: Result<PlanDetail> = when {
                existing != null -> repository.updatePlan(existing, PlanUpdate(title = ui.title.trim(), description = ui.description.trim()))
                    .mapCatching { updated ->
                        // Scheduling is its own command in the contract.
                        when {
                            ui.date == updated.startDate() -> updated
                            ui.date == null -> repository.unschedulePlan(updated).getOrThrow()
                            else -> repository.schedulePlan(updated, PlanSchedule(plannedOn = ui.date)).getOrThrow()
                        }
                    }
                sourceWish != null -> repository.planWish(
                    sourceWish,
                    WishToPlan(title = ui.title.trim(), description = ui.description.trim().ifEmpty { null }, schedule = schedule),
                ).map { it.plan }
                else -> repository.createPlan(
                    createKey,
                    PlanCreate(title = ui.title.trim(), description = ui.description.trim().ifEmpty { null }, schedule = schedule),
                )
            }
            result
                .onSuccess { plan ->
                    listOf("title", "description", "date", "key").forEach { saved.remove<Any>(it) }
                    _ui.update { it.copy(saving = false, savedPlanId = plan.id.toString(), dirty = false) }
                }
                .onFailure { failure -> _ui.update { it.copy(saving = false, saveError = failure.appError) } }
        }
    }
}

data class WishEditorUi(
    val loading: Boolean = false,
    val loadError: AppError? = null,
    val title: String = "",
    val saving: Boolean = false,
    val saveError: AppError? = null,
    val savedWishId: String? = null,
    val dirty: Boolean = false,
)

class WishEditorViewModel(private val graph: AppGraph, private val saved: SavedStateHandle, private val wishId: String?) : ViewModel() {
    private val repository = graph.repository
    private val _ui = MutableStateFlow(WishEditorUi(loading = wishId != null, title = saved["title"] ?: ""))
    val ui: StateFlow<WishEditorUi> = _ui.asStateFlow()
    private var original: WishDetail? = null
    private val createKey: String = saved["key"] ?: UUID.randomUUID().toString().also { saved["key"] = it }

    init {
        if (wishId != null) {
            viewModelScope.launch {
                repository.wish(wishId)
                    .onSuccess { wish ->
                        original = wish
                        _ui.update { if (saved.contains("title")) it.copy(loading = false, dirty = true) else it.copy(loading = false, title = wish.title) }
                    }
                    .onFailure { failure -> _ui.update { it.copy(loading = false, loadError = failure.appError) } }
            }
        }
    }

    fun setTitle(value: String) {
        _ui.update { it.copy(title = value.take(200), dirty = true, saveError = null) }
        saved["title"] = _ui.value.title
    }

    fun save() {
        val ui = _ui.value
        if (ui.saving || ui.title.isBlank()) return
        _ui.update { it.copy(saving = true, saveError = null) }
        viewModelScope.launch {
            val existing = original
            val result = if (existing != null) repository.updateWish(existing, ui.title.trim()) else repository.createWish(createKey, ui.title.trim())
            result
                .onSuccess { wish ->
                    listOf("title", "key").forEach { saved.remove<Any>(it) }
                    _ui.update { it.copy(saving = false, savedWishId = wish.id.toString(), dirty = false) }
                }
                .onFailure { failure -> _ui.update { it.copy(saving = false, saveError = failure.appError) } }
        }
    }
}
