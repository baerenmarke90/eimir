package de.eimir.nativetest.ui.story

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
import eimir.api.models.DiscoverSelection
import eimir.api.models.StoryItem
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Visible Timeline scope (R2): type, year and order are always shown outside the sheet. */
data class TimelineScope(
    val kinds: Set<String> = emptySet(),
    val year: Int? = null,
    val ascending: Boolean = false,
) {
    val isDefault: Boolean get() = kinds.isEmpty() && year == null && !ascending
}

data class TimelinePage(
    val items: List<StoryItem>,
    val nextCursor: String?,
    val hasMore: Boolean,
    val availableYears: List<Int>,
    val loadingMore: Boolean = false,
    val loadMoreError: AppError? = null,
)

class StoryViewModel(private val graph: AppGraph, private val saved: SavedStateHandle) : ViewModel() {
    private val repository = graph.repository

    private val _scope = MutableStateFlow(
        TimelineScope(
            kinds = saved.get<ArrayList<String>>(KEY_KINDS)?.toSet().orEmpty(),
            year = saved.get<Int>(KEY_YEAR),
            ascending = saved.get<Boolean>(KEY_ASC) ?: false,
        ),
    )
    val scope: StateFlow<TimelineScope> = _scope.asStateFlow()

    private val _timeline = MutableStateFlow<Load<TimelinePage>>(Load.Loading)
    val timeline: StateFlow<Load<TimelinePage>> = _timeline.asStateFlow()

    /** Discover keeps its own scope; it never inherits Timeline filters (R2). */
    private val _discover = MutableStateFlow<Load<DiscoverSelection>>(Load.Loading)
    val discover: StateFlow<Load<DiscoverSelection>> = _discover.asStateFlow()
    private var discoverRequested = false

    private var timelineJob: Job? = null
    private var lastLoad = 0L

    init {
        loadTimeline()
        viewModelScope.launch {
            graph.changes.events.collect { change ->
                if (change is Change.Memory) {
                    if (change.deleted) removeItem(change.id) else reloadLoadedRange()
                    if (discoverRequested) loadDiscover()
                }
            }
        }
    }

    fun applyScope(scope: TimelineScope) {
        if (scope == _scope.value) return
        _scope.value = scope
        saved[KEY_KINDS] = ArrayList(scope.kinds)
        saved[KEY_YEAR] = scope.year
        saved[KEY_ASC] = scope.ascending
        _timeline.value = Load.Loading
        loadTimeline()
    }

    fun refreshQuietly() {
        if (System.currentTimeMillis() - lastLoad > 60_000) reloadLoadedRange()
    }

    fun loadTimeline() {
        timelineJob?.cancel()
        _timeline.update { it.refreshing() }
        val scope = _scope.value
        timelineJob = viewModelScope.launch {
            repository.timeline(scope.kinds.toList(), scope.year, scope.ascending, null)
                .onSuccess { page ->
                    lastLoad = System.currentTimeMillis()
                    _timeline.value = Load.Ready(TimelinePage(page.items, page.nextCursor, page.hasMore, page.availableYears.orEmpty()))
                }
                .onFailure { failure -> _timeline.update { it.failedWith(failure.appError) } }
        }
    }

    /**
     * Re-reads everything already loaded in one request so a change elsewhere
     * updates the list in place: keys stay stable, so the scroll position does
     * not jump and loaded older pages are not dropped.
     */
    private fun reloadLoadedRange() {
        val current = _timeline.value.valueOrNull ?: return loadTimeline()
        val scope = _scope.value
        viewModelScope.launch {
            var items = mutableListOf<StoryItem>()
            var cursor: String? = null
            var hasMore = true
            var years = current.availableYears
            while (hasMore && items.size < current.items.size.coerceAtLeast(30)) {
                val page = repository.timeline(scope.kinds.toList(), scope.year, scope.ascending, cursor).getOrNull() ?: return@launch
                items += page.items
                cursor = page.nextCursor
                hasMore = page.hasMore && cursor != null
                years = page.availableYears ?: years
            }
            lastLoad = System.currentTimeMillis()
            _timeline.value = Load.Ready(TimelinePage(items, cursor, hasMore, years))
        }
    }

    fun loadMore() {
        val current = (_timeline.value as? Load.Ready)?.value ?: return
        if (!current.hasMore || current.loadingMore || current.nextCursor == null) return
        val scope = _scope.value
        _timeline.value = Load.Ready(current.copy(loadingMore = true, loadMoreError = null))
        viewModelScope.launch {
            repository.timeline(scope.kinds.toList(), scope.year, scope.ascending, current.nextCursor)
                .onSuccess { page ->
                    val known = current.items.map(::storyKey).toHashSet()
                    _timeline.value = Load.Ready(
                        current.copy(
                            items = current.items + page.items.filter { storyKey(it) !in known },
                            nextCursor = page.nextCursor,
                            hasMore = page.hasMore && page.nextCursor != null && page.nextCursor != current.nextCursor,
                            loadingMore = false,
                        ),
                    )
                }
                .onFailure { failure ->
                    _timeline.value = Load.Ready(current.copy(loadingMore = false, loadMoreError = failure.appError))
                }
        }
    }

    private fun removeItem(id: String) {
        val current = (_timeline.value as? Load.Ready)?.value ?: return
        _timeline.value = Load.Ready(current.copy(items = current.items.filterNot { storyId(it) == id }))
    }

    fun ensureDiscover() {
        if (discoverRequested) return
        discoverRequested = true
        loadDiscover()
    }

    fun loadDiscover() {
        _discover.update { it.refreshing() }
        viewModelScope.launch {
            repository.discover()
                .onSuccess { _discover.value = Load.Ready(it) }
                .onFailure { failure -> _discover.update { it.failedWith(failure.appError) } }
        }
    }

    private companion object {
        const val KEY_KINDS = "timeline.kinds"
        const val KEY_YEAR = "timeline.year"
        const val KEY_ASC = "timeline.ascending"
    }
}

fun storyId(item: StoryItem): String = when (item) {
    is StoryItem.MemoryWrapper -> item.value.memory.id.toString()
    is StoryItem.HeartMomentWrapper -> item.value.heartMoment.id.toString()
    is StoryItem.MilestoneWrapper -> item.value.milestone.id.toString()
}

/** Stable LazyColumn key; kind prefix keeps ids of different types apart. */
fun storyKey(item: StoryItem): String = when (item) {
    is StoryItem.MemoryWrapper -> "m-"
    is StoryItem.HeartMomentWrapper -> "h-"
    is StoryItem.MilestoneWrapper -> "s-"
} + storyId(item)

fun storyDate(item: StoryItem): java.time.LocalDate = when (item) {
    is StoryItem.MemoryWrapper -> item.value.effectiveDate
    is StoryItem.HeartMomentWrapper -> item.value.effectiveDate
    is StoryItem.MilestoneWrapper -> item.value.effectiveDate
}
