package de.eimir.nativetest.ui.story

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import de.eimir.nativetest.R
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.OnReturn
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SecondaryButton
import de.eimir.nativetest.ui.common.SensitiveReveals
import de.eimir.nativetest.ui.common.StaleBanner
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.StoryItem
import eimir.api.models.StoryKind
import java.time.YearMonth
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

fun AppNavigator.openStoryItem(item: StoryItem) = when (item) {
    is StoryItem.MemoryWrapper -> openMemory(storyId(item))
    is StoryItem.HeartMomentWrapper -> openHeartMoment(storyId(item))
    is StoryItem.MilestoneWrapper -> openMilestone(storyId(item))
}

/** R2 Momente: one context header, Timeline/Discover peer modes, visible scope, month groups. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoryScreen(nav: AppNavigator) {
    val graph = appGraph()
    val model: StoryViewModel = viewModel { StoryViewModel(graph, createSavedStateHandle()) }
    val scope by model.scope.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(0) }
    var filterOpen by rememberSaveable { mutableStateOf(false) }
    val timelineList = rememberLazyListState()
    val discoverList = rememberLazyListState()
    val coroutines = rememberCoroutineScope()
    val reveals = rememberSensitiveReveals("story")
    OnReturn(model::refreshQuietly)

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Eimir.colors.headerSurface).statusBarsPadding().padding(start = Space.lg, end = Space.xs).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.nav_moments),
                style = EimirType.heading3,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            val photosLabel = stringResource(R.string.story_photos)
            IconButton(onClick = nav::openPhotos, modifier = Modifier.semantics { contentDescription = photosLabel }) {
                EimirIcon(EimirIcons.Photo)
            }
            val searchLabel = stringResource(R.string.nav_search)
            IconButton(onClick = nav::openSearch, modifier = Modifier.semantics { contentDescription = searchLabel }) {
                EimirIcon(EimirIcons.Search)
            }
        }
        SecondaryTabRow(
            selectedTabIndex = tab,
            containerColor = Eimir.colors.headerSurface,
            contentColor = Eimir.colors.textPrimary,
            indicator = {
                TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(tab), color = Eimir.colors.brandStrong)
            },
        ) {
            listOf(R.string.story_timeline, R.string.story_discover).forEachIndexed { index, label ->
                Tab(
                    selected = tab == index,
                    onClick = {
                        if (tab == index) {
                            coroutines.launch { (if (index == 0) timelineList else discoverList).animateScrollToItem(0) }
                        }
                        tab = index
                    },
                    text = { Text(stringResource(label), style = EimirType.label) },
                )
            }
        }
        if (tab == 0) {
            Timeline(model, nav, timelineList, reveals, onFilter = { filterOpen = true })
        } else {
            LaunchedEffect(Unit) { model.ensureDiscover() }
            Discover(model, nav, discoverList, reveals) { tab = 0 }
        }
    }

    if (filterOpen) {
        val years = model.timeline.collectAsStateWithLifecycle().value.valueOrNull?.availableYears.orEmpty()
        FilterSheet(scope, years, onDismiss = { filterOpen = false }, onApply = {
            filterOpen = false
            model.applyScope(it)
        })
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun Timeline(
    model: StoryViewModel,
    nav: AppNavigator,
    listState: LazyListState,
    reveals: SensitiveReveals,
    onFilter: () -> Unit,
) {
    val load by model.timeline.collectAsStateWithLifecycle()
    val scope by model.scope.collectAsStateWithLifecycle()
    val locale = currentLocale()

    ScopeRow(scope, onFilter, onReset = { model.applyScope(TimelineScope()) })
    when (val state = load) {
        Load.Loading -> PageSkeleton()
        is Load.Failed -> ErrorState(state.error, model::loadTimeline)
        is Load.Ready -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = model::loadTimeline, modifier = Modifier.fillMaxSize()) {
            val page = state.value
            // Load the next page well before the end so scrolling never stalls.
            LaunchedEffect(listState, page.items.size) {
                snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
                    .distinctUntilChanged()
                    .filter { it >= listState.layoutInfo.totalItemsCount - 6 }
                    .collect { model.loadMore() }
            }
            val groups = remember(page.items) { page.items.groupBy { YearMonth.from(storyDate(it)) } }
            ReadingColumn { gutter ->
                LazyColumn(state = listState, contentPadding = PaddingValues(bottom = Space.xxl), modifier = Modifier.fillMaxSize()) {
                    state.refreshError?.let { error ->
                        item(key = "stale") { StaleBanner(error, model::loadTimeline, Modifier.padding(horizontal = gutter, vertical = Space.xs)) }
                    }
                    if (page.items.isEmpty()) {
                        item(key = "empty") {
                            if (scope.isDefault) {
                                StateMessage(
                                    title = stringResource(R.string.story_empty_title),
                                    body = stringResource(R.string.story_empty_body),
                                    icon = EimirIcons.Moments,
                                    action = stringResource(R.string.create_memory),
                                    onAction = nav::createMemory,
                                )
                            } else {
                                StateMessage(
                                    title = stringResource(R.string.story_no_match),
                                    action = stringResource(R.string.story_filter_reset),
                                    onAction = { model.applyScope(TimelineScope()) },
                                )
                            }
                        }
                    }
                    groups.forEach { (month, items) ->
                        stickyHeader(key = "month-$month") {
                            Text(
                                Dates.monthYear(month.atDay(1), locale),
                                style = EimirType.label,
                                color = Eimir.colors.textSecondary,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Eimir.colors.background.copy(alpha = 0.96f))
                                    .padding(horizontal = gutter, vertical = Space.xs)
                                    .semantics { heading() },
                            )
                        }
                        items(items.size, key = { storyKey(items[it]) }, contentType = { items[it]::class }) { index ->
                            val item = items[index]
                            StoryEntry(
                                item = item,
                                reveals = reveals,
                                onOpen = { nav.openStoryItem(item) },
                                modifier = Modifier.padding(horizontal = gutter).animateItem(),
                            )
                        }
                    }
                    item(key = "footer") {
                        Box(Modifier.fillMaxWidth().padding(Space.lg), contentAlignment = Alignment.Center) {
                            when {
                                page.loadingMore -> CircularProgressIndicator(Modifier.height(24.dp), strokeWidth = 2.dp)
                                page.loadMoreError != null -> SecondaryButton(stringResource(R.string.action_retry), model::loadMore)
                                !page.hasMore && page.items.isNotEmpty() && scope.isDefault && !scope.ascending ->
                                    Text(stringResource(R.string.story_end), style = EimirType.meta, color = Eimir.colors.textMuted)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ScopeRow(scope: TimelineScope, onFilter: () -> Unit, onReset: () -> Unit) {
    val labels = buildList {
        if (scope.kinds.isEmpty()) add(stringResource(R.string.story_scope_all)) else scope.kinds.forEach { add(kindLabel(it)) }
        scope.year?.let { add(it.toString()) }
        if (scope.ascending) add(stringResource(R.string.story_filter_oldest))
    }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Space.md, vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            labels.joinToString(" · "),
            style = EimirType.bodySmall,
            color = Eimir.colors.textSecondary,
            modifier = Modifier.weight(1f).padding(start = Space.xxs),
        )
        if (!scope.isDefault) TextButton(onClick = onReset) { Text(stringResource(R.string.story_filter_reset)) }
        SecondaryButton(stringResource(R.string.story_filter), onFilter)
    }
}

@Composable
private fun kindLabel(kind: String): String = stringResource(
    when (kind) {
        StoryKind.HEART_MOMENT.value -> R.string.story_kind_heart
        StoryKind.MILESTONE.value -> R.string.story_kind_milestone
        else -> R.string.story_kind_memory
    },
)

/** Filter changes are staged in the sheet and applied explicitly (no accidental intermediate scope). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun FilterSheet(current: TimelineScope, years: List<Int>, onDismiss: () -> Unit, onApply: (TimelineScope) -> Unit) {
    var draft by remember { mutableStateOf(current) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Eimir.colors.surfaceRaised,
    ) {
        Column(Modifier.padding(horizontal = Space.lg).padding(bottom = Space.xl), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
            Text(stringResource(R.string.story_filter_title), style = EimirType.editorial)
            Text(stringResource(R.string.story_filter_types), style = EimirType.label, color = Eimir.colors.textSecondary)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                listOf(StoryKind.MEMORY, StoryKind.HEART_MOMENT, StoryKind.MILESTONE).forEach { kind ->
                    val selected = kind.value in draft.kinds
                    FilterChip(
                        selected = selected,
                        onClick = { draft = draft.copy(kinds = if (selected) draft.kinds - kind.value else draft.kinds + kind.value) },
                        label = { Text(kindLabel(kind.value)) },
                    )
                }
            }
            if (years.isNotEmpty()) {
                Text(stringResource(R.string.editor_date), style = EimirType.label, color = Eimir.colors.textSecondary)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                    FilterChip(selected = draft.year == null, onClick = { draft = draft.copy(year = null) }, label = { Text(stringResource(R.string.story_filter_all_years)) })
                    years.sortedDescending().forEach { year ->
                        FilterChip(selected = draft.year == year, onClick = { draft = draft.copy(year = year) }, label = { Text(year.toString()) })
                    }
                }
            }
            Text(stringResource(R.string.story_filter_order), style = EimirType.label, color = Eimir.colors.textSecondary)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                FilterChip(selected = !draft.ascending, onClick = { draft = draft.copy(ascending = false) }, label = { Text(stringResource(R.string.story_filter_newest)) })
                FilterChip(selected = draft.ascending, onClick = { draft = draft.copy(ascending = true) }, label = { Text(stringResource(R.string.story_filter_oldest)) })
            }
            Row(Modifier.fillMaxWidth().padding(top = Space.sm), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                TextButton(onClick = { draft = TimelineScope() }) { Text(stringResource(R.string.story_filter_reset)) }
                Spacer(Modifier.weight(1f))
                de.eimir.nativetest.ui.common.PrimaryButton(stringResource(R.string.story_filter_apply), { onApply(draft) })
            }
        }
    }
}

@Composable
private fun Discover(model: StoryViewModel, nav: AppNavigator, listState: LazyListState, reveals: SensitiveReveals, onTimeline: () -> Unit) {
    val load by model.discover.collectAsStateWithLifecycle()
    when (val state = load) {
        Load.Loading -> PageSkeleton()
        is Load.Failed -> ErrorState(state.error, model::loadDiscover)
        is Load.Ready -> {
            val selection = state.value
            ReadingColumn { gutter ->
                LazyColumn(state = listState, contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                    val lead = selection.lead
                    if (lead != null) {
                        item(key = "lead") {
                            val context = selection.leadContext
                            if (context != null && context.yearsAgo > 0) {
                                Text(
                                    stringResource(R.string.story_years_ago, context.yearsAgo),
                                    style = EimirType.label,
                                    color = Eimir.colors.discovery,
                                    modifier = Modifier.padding(top = Space.md),
                                )
                            }
                            StoryEntry(lead, reveals, onOpen = { nav.openStoryItem(lead) })
                        }
                    }
                    val rest = selection.items.filterNot { lead != null && storyKey(it) == storyKey(lead) }
                    items(rest.size, key = { "d-" + storyKey(rest[it]) }) { index ->
                        StoryEntry(rest[index], reveals, onOpen = { nav.openStoryItem(rest[index]) })
                    }
                    if (lead == null && rest.isEmpty()) {
                        item(key = "empty") {
                            StateMessage(title = stringResource(R.string.story_empty_title), body = stringResource(R.string.story_empty_body))
                        }
                    }
                    item(key = "to-timeline") {
                        Box(Modifier.fillMaxWidth().padding(Space.lg), contentAlignment = Alignment.Center) {
                            SecondaryButton(stringResource(R.string.story_discover_more), onTimeline)
                        }
                    }
                }
            }
            state.refreshError?.let { StaleBanner(it, model::loadDiscover) }
        }
    }
}
