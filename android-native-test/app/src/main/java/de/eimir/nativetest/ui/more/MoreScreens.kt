package de.eimir.nativetest.ui.more

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.ui.common.BackButton
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.PersonAvatar
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SectionTitle
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.refreshing
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.story.authorName
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.ActivityItem
import eimir.api.models.ActivityKind
import eimir.api.models.EngagementTarget
import eimir.api.models.NotificationItem
import eimir.api.models.NotificationKind
import eimir.api.models.SearchKind
import eimir.api.models.SearchResult
import eimir.api.models.SearchScope
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Composable
fun PageTopBar(title: String, onBack: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().background(Eimir.colors.background).statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BackButton(onBack)
        Text(title, style = EimirType.title, modifier = Modifier.weight(1f).semantics { heading() }, maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing?.invoke()
    }
}

/** A named, predictable destination row (R5): icon, title, optional subtitle. */
@Composable
fun DestinationRow(icon: EimirIcons, title: String, subtitle: String? = null, private: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(Radii.medium).clickable(onClick = onClick).heightIn(min = 56.dp).padding(vertical = Space.xs, horizontal = Space.xxs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(Radii.medium).background(if (private) Eimir.colors.privateSurface else Eimir.colors.surfaceSubtle),
            contentAlignment = Alignment.Center,
        ) { EimirIcon(icon, size = 22.dp) }
        Column(Modifier.padding(start = Space.sm).weight(1f)) {
            Text(title, style = EimirType.title)
            if (subtitle != null) Text(subtitle, style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
        }
    }
}

/** R5 Mehr: profile entry → private area → shared destinations → named utilities. */
@Composable
fun MoreScreen(nav: AppNavigator) {
    val graph = appGraph()
    val session = graph.sessions.session
    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Eimir.colors.headerSurface).statusBarsPadding().padding(horizontal = Space.lg).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.nav_more), style = EimirType.heading3, modifier = Modifier.semantics { heading() })
        }
        ReadingColumn { gutter ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = gutter, vertical = Space.sm)) {
                Surface(onClick = nav::openProfile, shape = Radii.card, color = Eimir.colors.surfaceRaised, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(Space.md), verticalAlignment = Alignment.CenterVertically) {
                        PersonAvatar(session?.displayName.orEmpty(), session?.accountId?.let(UUID::fromString), null, size = 52.dp)
                        Column(Modifier.padding(start = Space.sm)) {
                            Text(session?.displayName.orEmpty(), style = EimirType.editorialSmall)
                            Text(stringResource(R.string.more_profile), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
                        }
                    }
                }
                SectionTitle(stringResource(R.string.more_personal))
                DestinationRow(EimirIcons.Private, stringResource(R.string.more_private), stringResource(R.string.more_private_sub), private = true, onClick = nav::openPrivateNotes)
                SectionTitle(stringResource(R.string.more_shared))
                DestinationRow(EimirIcons.Photo, stringResource(R.string.more_photos), onClick = nav::openPhotos)
                DestinationRow(EimirIcons.Places, stringResource(R.string.more_places), onClick = nav::openPlaces)
                DestinationRow(EimirIcons.Together, stringResource(R.string.more_people), onClick = nav::openPeople)
                SectionTitle(stringResource(R.string.more_utility))
                DestinationRow(EimirIcons.Search, stringResource(R.string.more_search), onClick = nav::openSearch)
                DestinationRow(EimirIcons.Notifications, stringResource(R.string.more_notifications), onClick = nav::openNotifications)
                DestinationRow(EimirIcons.Activity, stringResource(R.string.more_activity), onClick = nav::openActivity)
                DestinationRow(EimirIcons.Settings, stringResource(R.string.more_settings), onClick = nav::openSettings)
                DestinationRow(EimirIcons.Help, stringResource(R.string.more_about), onClick = nav::openAbout)
                Spacer(Modifier.height(Space.xxl))
            }
        }
    }
}

// ---- Notifications ---------------------------------------------------------------------------------

class PagedViewModel<T>(
    private val graph: AppGraph,
    private val loader: suspend (cursor: String?) -> Result<Pair<List<T>, String?>>,
    private val refreshOn: (Change) -> Boolean = { false },
) : ViewModel() {
    private val _state = MutableStateFlow<Load<List<T>>>(Load.Loading)
    val state: StateFlow<Load<List<T>>> = _state.asStateFlow()
    private var cursor: String? = null
    private var loadingMore = false

    init {
        load()
        viewModelScope.launch { graph.changes.events.collect { if (refreshOn(it)) load() } }
    }

    fun load() {
        _state.update { it.refreshing() }
        viewModelScope.launch {
            loader(null)
                .onSuccess { (items, next) ->
                    cursor = next
                    _state.value = Load.Ready(items)
                }
                .onFailure { failure -> _state.update { it.failedWith(failure.appError) } }
        }
    }

    fun loadMore() {
        val current = _state.value.valueOrNull ?: return
        val next = cursor ?: return
        if (loadingMore) return
        loadingMore = true
        viewModelScope.launch {
            loader(next).onSuccess { (items, following) ->
                cursor = following.takeIf { it != next }
                _state.value = Load.Ready(current + items)
            }
            loadingMore = false
        }
    }

    val hasMore: Boolean get() = cursor != null
}

private fun AppNavigator.openTarget(type: EngagementTarget?, id: UUID?) {
    val target = id?.toString() ?: return
    when (type) {
        EngagementTarget.MEMORY -> openMemory(target)
        EngagementTarget.HEART_MOMENT -> openHeartMoment(target)
        EngagementTarget.MILESTONE -> openMilestone(target)
        EngagementTarget.PLAN -> openPlan(target)
        EngagementTarget.WISH -> openWish(target)
        EngagementTarget.PLACE -> openPlace(target)
        else -> Unit
    }
}

@Composable
fun NotificationsScreen(nav: AppNavigator) {
    val graph = appGraph()
    val model = graphViewModel(key = "notifications") { g ->
        PagedViewModel<NotificationItem>(g, { cursor -> g.repository.notifications(cursor).map { it.items to it.nextCursor } }, { it == Change.Notifications })
    }
    val load by model.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.notifications_title), nav::back) {
            TextButton(onClick = { scope.launch { graph.repository.markAllNotificationsRead() } }) {
                Text(stringResource(R.string.notifications_mark_all))
            }
        }
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                if (state.value.isEmpty()) {
                    StateMessage(stringResource(R.string.notifications_empty), icon = EimirIcons.Notifications)
                } else {
                    LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                        items(state.value.size, key = { state.value[it].id.toString() }) { index ->
                            val item = state.value[index]
                            if (index == state.value.lastIndex && model.hasMore) LaunchedEffect(Unit) { model.loadMore() }
                            val actor = item.actor?.let { authorName(it) } ?: stringResource(R.string.notification_someone)
                            val text = when (item.kind) {
                                NotificationKind.COMMENT_CREATED -> stringResource(R.string.notification_comment, actor)
                                NotificationKind.THINKING_OF_YOU -> stringResource(R.string.notification_thinking, actor)
                                NotificationKind.PARTNER_KISS -> stringResource(R.string.notification_kiss, actor)
                                NotificationKind.PARTNER_CHECK_IN -> stringResource(R.string.notification_check_in, actor)
                                NotificationKind.REMINDER_DUE -> stringResource(R.string.notification_reminder)
                            }
                            Row(
                                Modifier.fillMaxWidth().clip(Radii.medium).clickable {
                                    if (item.readAt == null) scope.launch { graph.repository.markNotificationRead(item.id.toString()) }
                                    nav.openTarget(item.targetType, item.targetId)
                                }.heightIn(min = 64.dp).padding(vertical = Space.xs),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PersonAvatar(actor, item.actor?.id, item.actor?.profileAttachmentId, size = 40.dp)
                                Column(Modifier.weight(1f).padding(start = Space.sm)) {
                                    Text(text, style = if (item.readAt == null) EimirType.title else EimirType.body)
                                    item.target?.title?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                    Text(Dates.dateTime(item.createdAt, locale), style = EimirType.meta, color = Eimir.colors.textMuted)
                                }
                                if (item.readAt == null) de.eimir.nativetest.ui.common.Dot(Modifier.padding(start = Space.xs))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ActivityScreen(nav: AppNavigator) {
    val model = graphViewModel(key = "activity") { g ->
        PagedViewModel<ActivityItem>(g, { cursor -> g.repository.activity(cursor).map { it.items to it.nextCursor } })
    }
    val load by model.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        PageTopBar(stringResource(R.string.activity_title), nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> ReadingColumn { gutter ->
                if (state.value.isEmpty()) {
                    StateMessage(stringResource(R.string.activity_empty), icon = EimirIcons.Activity)
                } else {
                    LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl)) {
                        items(state.value.size, key = { state.value[it].id.toString() }) { index ->
                            val item = state.value[index]
                            if (index == state.value.lastIndex && model.hasMore) LaunchedEffect(Unit) { model.loadMore() }
                            val actor = item.actor?.let { authorName(it) } ?: stringResource(R.string.notification_someone)
                            val text = stringResource(
                                when (item.kind) {
                                    ActivityKind.MEMORY_CREATED -> R.string.activity_memory_created
                                    ActivityKind.MILESTONE_CREATED -> R.string.activity_milestone_created
                                    ActivityKind.HEART_MOMENT_CREATED -> R.string.activity_heart_created
                                    ActivityKind.WISH_CREATED -> R.string.activity_wish_created
                                    ActivityKind.PLAN_CREATED -> R.string.activity_plan_created
                                    ActivityKind.PLAN_COMPLETED -> R.string.activity_plan_completed
                                    ActivityKind.PLACE_CREATED -> R.string.activity_place_created
                                    ActivityKind.CHAPTER_CREATED -> R.string.activity_chapter_created
                                    ActivityKind.COLLECTION_CREATED -> R.string.activity_collection_created
                                    ActivityKind.COMMENT_CREATED -> R.string.activity_comment_created
                                },
                                actor,
                            )
                            Row(
                                Modifier.fillMaxWidth().clip(Radii.medium).clickable { nav.openTarget(item.targetType, item.targetId) }
                                    .heightIn(min = 60.dp).padding(vertical = Space.xs),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                PersonAvatar(actor, item.actor?.id, item.actor?.profileAttachmentId, size = 36.dp)
                                Column(Modifier.padding(start = Space.sm)) {
                                    Text(text, style = EimirType.body)
                                    item.target?.title?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    }
                                    Text(Dates.dateTime(item.occurredAt, locale), style = EimirType.meta, color = Eimir.colors.textMuted)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---- Search ---------------------------------------------------------------------------------------------

class SearchViewModel(private val graph: AppGraph) : ViewModel() {
    private val _results = MutableStateFlow<Load<List<SearchResult>>?>(null)
    val results: StateFlow<Load<List<SearchResult>>?> = _results.asStateFlow()
    private var job: Job? = null

    /** Debounced; the query stays in memory and is never part of a route or log. */
    fun query(text: String) {
        job?.cancel()
        if (text.trim().length < 2) {
            _results.value = null
            return
        }
        job = viewModelScope.launch {
            delay(300)
            _results.value = Load.Loading
            graph.repository.search(text.trim())
                .onSuccess { _results.value = Load.Ready(it.items) }
                .onFailure { _results.value = Load.Failed(it.appError) }
        }
    }
}

@Composable
fun SearchScreen(nav: AppNavigator) {
    val model = graphViewModel { SearchViewModel(it) }
    val results by model.results.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val locale = currentLocale()
    LaunchedEffect(Unit) { focus.requestFocus() }
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.xxs, vertical = Space.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BackButton(nav::back)
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it.take(200)
                    model.query(query)
                },
                placeholder = { Text(stringResource(R.string.search_placeholder)) },
                singleLine = true,
                shape = Radii.pill,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { model.query(query) }),
                modifier = Modifier.weight(1f).padding(end = Space.sm).focusRequester(focus),
            )
        }
        ReadingColumn { gutter ->
            when (val state = results) {
                null -> Text(
                    stringResource(R.string.search_hint),
                    style = EimirType.bodySmall,
                    color = Eimir.colors.textSecondary,
                    modifier = Modifier.padding(horizontal = gutter, vertical = Space.md),
                )
                Load.Loading -> PageSkeleton()
                is Load.Failed -> ErrorState(state.error, { model.query(query) })
                is Load.Ready -> if (state.value.isEmpty()) {
                    StateMessage(stringResource(R.string.search_empty))
                } else {
                    LazyColumn(contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl), modifier = Modifier.navigationBarsPadding()) {
                        items(state.value.size, key = { "${state.value[it].type}-${state.value[it].id}" }) { index ->
                            val result = state.value[index]
                            Row(
                                Modifier.fillMaxWidth().clip(Radii.medium).clickable { nav.openSearchResult(result) }
                                    .heightIn(min = 60.dp).padding(vertical = Space.xs),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                EimirIcon(searchIcon(result.type), size = 24.dp)
                                Column(Modifier.weight(1f).padding(start = Space.sm)) {
                                    Text(result.title ?: result.excerpt.orEmpty(), style = EimirType.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    result.excerpt?.takeIf { result.title != null }?.let {
                                        Text(it, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    }
                                    result.occurredOn?.let { Text(Dates.medium(it, locale), style = EimirType.meta, color = Eimir.colors.textMuted) }
                                }
                                if (result.scope == SearchScope.PRIVATE) ContextPill(stringResource(R.string.search_private), icon = EimirIcons.Private)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun searchIcon(kind: SearchKind): EimirIcons = when (kind) {
    SearchKind.MEMORY -> EimirIcons.Memories
    SearchKind.HEART_MOMENT -> EimirIcons.Moments
    SearchKind.MILESTONE -> EimirIcons.Milestones
    SearchKind.WISH -> EimirIcons.Wishes
    SearchKind.PLAN -> EimirIcons.Calendar
    SearchKind.PLACE -> EimirIcons.Places
    SearchKind.CHAPTER -> EimirIcons.Chapters
    SearchKind.PRIVATE_NOTE -> EimirIcons.Notes
    SearchKind.GIFT_IDEA -> EimirIcons.Gift
    else -> EimirIcons.Lists
}

private fun AppNavigator.openSearchResult(result: SearchResult) {
    val id = result.id.toString()
    when (result.type) {
        SearchKind.MEMORY -> openMemory(id)
        SearchKind.HEART_MOMENT -> openHeartMoment(id)
        SearchKind.MILESTONE -> openMilestone(id)
        SearchKind.WISH -> openWish(id)
        SearchKind.PLAN -> openPlan(id)
        SearchKind.PLACE -> openPlace(id)
        SearchKind.PRIVATE_NOTE -> editPrivateNote(id)
        else -> Unit
    }
}
