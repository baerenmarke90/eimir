package de.eimir.nativetest.ui.story

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.MomentKind
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.media.MediaVariant
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.BackButton
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.MediaRef
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.ContentVisibility
import eimir.api.models.HeartMomentDetail
import eimir.api.models.MilestoneDetail
import eimir.api.models.PhotoParentType
import eimir.api.models.SharedPhoto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Loads one read-only projection; shared by the heart moment and milestone details. */
class DetailViewModel<T>(private val loader: suspend () -> Result<T>) : ViewModel() {
    private val _state = MutableStateFlow<Load<T>>(Load.Loading)
    val state: StateFlow<Load<T>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            loader().onSuccess { _state.value = Load.Ready(it) }.onFailure { failure -> _state.update { it.failedWith(failure.appError) } }
        }
    }
}

@Composable
private fun SimpleTopBar(onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { BackButton(onBack) }
}

@Composable
fun HeartMomentScreen(nav: AppNavigator, heartMomentId: String) {
    val model = graphViewModel(key = "heart-$heartMomentId") { graph ->
        DetailViewModel<HeartMomentDetail> { graph.repository.heartMoment(heartMomentId) }
    }
    val load by model.state.collectAsStateWithLifecycle()
    val reveals = rememberSensitiveReveals("heart-$heartMomentId")
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        SimpleTopBar(nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> {
                val heart = state.value
                ReadingColumn { gutter ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding()
                            .padding(horizontal = gutter, vertical = Space.sm),
                        verticalArrangement = Arrangement.spacedBy(Space.md),
                    ) {
                        Box(Modifier.fillMaxWidth().background(Eimir.colors.pageTintBrand, Radii.card).padding(Space.lg)) {
                            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                                    EimirIcon(EimirIcons.Moments, size = 24.dp)
                                    Text(emotionLabel(heart.emotion), style = EimirType.label, color = Eimir.colors.private)
                                }
                                Text(heart.text, style = EimirType.editorial, color = Eimir.colors.textPrimary, modifier = Modifier.semantics { heading() })
                                Text(
                                    Dates.long(heart.happenedOn, locale) + " · " + stringResource(R.string.story_by, authorName(heart.author)),
                                    style = EimirType.bodySmall,
                                    color = Eimir.colors.textSecondary,
                                )
                            }
                        }
                        heart.attachment?.let { photo ->
                            AttachmentPhoto(
                                ref = MediaRef(photo.id, MediaParent.HEART_MOMENT, heart.id, photo.isSensitive, photo.hasThumbnail, photo.width, photo.height),
                                variant = MediaVariant.ORIGINAL,
                                reveals = reveals,
                                modifier = Modifier.fillMaxWidth().aspectRatio(previewRatio(photo.width, photo.height)).background(Eimir.colors.surface, Radii.card),
                            )
                        }
                        if (heart.visibility == ContentVisibility.PRIVATE) {
                            ContextPill(stringResource(R.string.audience_private), icon = EimirIcons.Private)
                        } else {
                            ContextPill(stringResource(R.string.audience_shared), icon = EimirIcons.Shared)
                        }
                        if (heart.tags.isNotEmpty()) {
                            @OptIn(ExperimentalLayoutApi::class)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs)) { heart.tags.forEach { ContextPill(it) } }
                        }
                        MomentPlacesSection(MomentKind.HEART_MOMENT, heart.id.toString())
                        if (heart.visibility == ContentVisibility.SHARED) {
                            CommentsSection(MomentKind.HEART_MOMENT, heart.id.toString(), heart.capabilities.canComment)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun MilestoneScreen(nav: AppNavigator, milestoneId: String) {
    val model = graphViewModel(key = "milestone-$milestoneId") { graph ->
        DetailViewModel<MilestoneDetail> { graph.repository.milestone(milestoneId) }
    }
    val load by model.state.collectAsStateWithLifecycle()
    val locale = currentLocale()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        SimpleTopBar(nav::back)
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> {
                val milestone = state.value
                ReadingColumn { gutter ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding()
                            .padding(horizontal = gutter, vertical = Space.sm),
                        verticalArrangement = Arrangement.spacedBy(Space.md),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                            EimirIcon(EimirIcons.Milestones, size = 24.dp, tint = Eimir.colors.discovery)
                            Text(stringResource(R.string.story_milestone_label), style = EimirType.label, color = Eimir.colors.discovery)
                        }
                        Text(milestone.title, style = EimirType.editorialLarge, modifier = Modifier.semantics { heading() })
                        Text(
                            Dates.long(milestone.happenedOn, locale) + " · " + stringResource(R.string.story_by, authorName(milestone.author)),
                            style = EimirType.bodySmall,
                            color = Eimir.colors.textSecondary,
                        )
                        milestone.body?.takeIf { it.isNotBlank() }?.let { Text(it, style = EimirType.reading) }
                        CommentsSection(MomentKind.MILESTONE, milestone.id.toString(), milestone.capabilities.canComment)
                    }
                }
            }
        }
    }
}

// ---- All photos -------------------------------------------------------------------------------

data class PhotosPage(val items: List<SharedPhoto>, val cursor: String?, val hasMore: Boolean, val total: Int, val loadingMore: Boolean = false)

class PhotosViewModel(private val graph: AppGraph) : ViewModel() {
    private val _state = MutableStateFlow<Load<PhotosPage>>(Load.Loading)
    val state: StateFlow<Load<PhotosPage>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            graph.repository.photos(null)
                .onSuccess { _state.value = Load.Ready(PhotosPage(it.items, it.nextCursor, it.hasMore, it.totalCount)) }
                .onFailure { failure -> _state.update { it.failedWith(failure.appError) } }
        }
    }

    fun loadMore() {
        val current = _state.value.valueOrNull ?: return
        if (!current.hasMore || current.loadingMore || current.cursor == null) return
        _state.value = Load.Ready(current.copy(loadingMore = true))
        viewModelScope.launch {
            graph.repository.photos(current.cursor)
                .onSuccess { page ->
                    val known = current.items.map { it.attachment.id }.toHashSet()
                    _state.value = Load.Ready(
                        PhotosPage(current.items + page.items.filter { it.attachment.id !in known }, page.nextCursor, page.hasMore, page.totalCount),
                    )
                }
                .onFailure { _state.value = Load.Ready(current.copy(loadingMore = false)) }
        }
    }
}

/** Google-Photos-like grid of all shared photos, opening the owning moment. */
@Composable
fun PhotosScreen(nav: AppNavigator) {
    val model = graphViewModel { PhotosViewModel(it) }
    val load by model.state.collectAsStateWithLifecycle()
    val grid = rememberLazyGridState()
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BackButton(nav::back)
            Text(stringResource(R.string.story_photos), style = EimirType.title, modifier = Modifier.weight(1f).semantics { heading() })
            load.valueOrNull?.let {
                Text(stringResource(R.string.story_photos_count, it.total), style = EimirType.meta, color = Eimir.colors.textSecondary, modifier = Modifier.padding(end = Space.md))
            }
        }
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> {
                val page = state.value
                if (page.items.isEmpty()) {
                    StateMessage(title = stringResource(R.string.story_empty_title), body = stringResource(R.string.story_empty_body), icon = EimirIcons.Photo)
                    return@Column
                }
                LaunchedEffect(grid, page.items.size) {
                    snapshotFlow { grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }
                        .distinctUntilChanged()
                        .collect { if (it >= page.items.size - 12) model.loadMore() }
                }
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 108.dp),
                    state = grid,
                    contentPadding = PaddingValues(2.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(page.items.size, key = { page.items[it].attachment.id.toString() }) { index ->
                        val photo = page.items[index]
                        val parent = if (photo.parentType == PhotoParentType.HEART_MOMENT) MediaParent.HEART_MOMENT else MediaParent.MEMORY
                        AttachmentPhoto(
                            ref = MediaRef(photo.attachment.id, parent, photo.parentId, photo.attachment.isSensitive, photo.attachment.hasThumbnail),
                            reveals = null,
                            modifier = Modifier
                                .aspectRatio(1f)
                                .clickable(role = Role.Image) {
                                    if (parent == MediaParent.HEART_MOMENT) nav.openHeartMoment(photo.parentId.toString()) else nav.openMemory(photo.parentId.toString())
                                },
                        )
                    }
                    if (page.loadingMore) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Box(Modifier.fillMaxWidth().padding(Space.md), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(Modifier.height(24.dp), strokeWidth = 2.dp)
                            }
                        }
                    }
                }
            }
        }
    }
}
