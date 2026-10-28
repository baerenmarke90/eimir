package de.eimir.nativetest.ui.story

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph
import de.eimir.nativetest.core.appError
import de.eimir.nativetest.data.Change
import de.eimir.nativetest.data.MomentKind
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.BackButton
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.OnReturn
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SensitiveReveals
import de.eimir.nativetest.ui.common.StaleBanner
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.failedWith
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.common.refreshing
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.MemoryDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class MemoryViewModel(private val graph: AppGraph, val memoryId: String) : ViewModel() {
    private val repository = graph.repository
    private val _memory = MutableStateFlow<Load<MemoryDetail>>(
        // A projection the app already holds is shown at once and revalidated.
        repository.cachedMemory(memoryId)?.let { Load.Ready(it, refreshing = true) } ?: Load.Loading,
    )
    val memory: StateFlow<Load<MemoryDetail>> = _memory.asStateFlow()
    private val _deleteError = MutableStateFlow<AppError?>(null)
    val deleteError: StateFlow<AppError?> = _deleteError.asStateFlow()
    private val _deleted = MutableStateFlow(false)
    val deleted: StateFlow<Boolean> = _deleted.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            graph.changes.events.collect { if (it is Change.Memory && it.id == memoryId && !it.deleted) load() }
        }
    }

    fun load() {
        _memory.update { it.refreshing() }
        viewModelScope.launch {
            repository.memory(memoryId)
                .onSuccess { _memory.value = Load.Ready(it) }
                .onFailure { failure ->
                    // An authoritative "unavailable" must not keep showing old content.
                    _memory.update { if (failure.appError == AppError.Unavailable) Load.Failed(AppError.Unavailable) else it.failedWith(failure.appError) }
                }
        }
    }

    fun delete() {
        val memory = _memory.value.valueOrNull ?: return
        viewModelScope.launch {
            repository.deleteMemory(memory)
                .onSuccess { _deleted.value = true }
                .onFailure { _deleteError.value = it.appError }
        }
    }
}

/** Memory detail: an album page — photos lead, then the words, then context and conversation. */
@Composable
fun MemoryScreen(nav: AppNavigator, memoryId: String) {
    val model = graphViewModel(key = "memory-$memoryId") { MemoryViewModel(it, memoryId) }
    val load by model.memory.collectAsStateWithLifecycle()
    val deleted by model.deleted.collectAsStateWithLifecycle()
    val deleteError by model.deleteError.collectAsStateWithLifecycle()
    val reveals = rememberSensitiveReveals("memory-$memoryId")
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    OnReturn(model::load)
    if (deleted) {
        androidx.compose.runtime.LaunchedEffect(Unit) { nav.back() }
        return
    }

    Column(Modifier.fillMaxSize()) {
        val memory = load.valueOrNull
        DetailTopBar(
            onBack = nav::back,
            canEdit = memory?.capabilities?.canEdit == true,
            canDelete = memory?.capabilities?.canDelete == true,
            onEdit = { nav.editMemory(memoryId) },
            onDelete = { confirmDelete = true },
        )
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> MemoryContent(state.value, state.refreshError, reveals, nav, model::load)
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(stringResource(R.string.memory_delete_title)) },
            text = { Text(stringResource(R.string.delete_confirm_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDelete = false
                    model.delete()
                }) { Text(stringResource(R.string.action_delete), color = Eimir.colors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
    deleteError?.let { error ->
        AlertDialog(
            onDismissRequest = model::load,
            text = { Text(error.message()) },
            confirmButton = { TextButton(onClick = model::load) { Text(stringResource(R.string.action_done)) } },
        )
    }
}

@Composable
fun DetailTopBar(
    onBack: () -> Unit,
    canEdit: Boolean,
    canDelete: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    extra: (@Composable () -> Unit)? = null,
) {
    var menu by remember { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().background(Eimir.colors.background).statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BackButton(onBack)
        Spacer(Modifier.weight(1f))
        extra?.invoke()
        if (canEdit) TextButton(onClick = onEdit) { Text(stringResource(R.string.action_edit)) }
        if (canDelete) {
            Box {
                IconButton(onClick = { menu = true }) {
                    Icon(Icons.Rounded.MoreVert, contentDescription = stringResource(R.string.action_more), tint = Eimir.colors.textPrimary)
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.action_delete), color = Eimir.colors.error) },
                        onClick = {
                            menu = false
                            onDelete()
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MemoryContent(
    memory: MemoryDetail,
    refreshError: AppError?,
    reveals: SensitiveReveals,
    nav: AppNavigator,
    onRetry: () -> Unit,
) {
    val locale = currentLocale()
    val photos = remember(memory.attachments) { memory.attachments.sortedBy { it.position } }
    ReadingColumn { gutter ->
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().imePadding().padding(bottom = Space.xxl),
        ) {
            refreshError?.let { StaleBanner(it, onRetry, Modifier.padding(horizontal = gutter, vertical = Space.xs)) }
            if (photos.isNotEmpty()) {
                PhotoPager(memory, photos.size, reveals, onOpen = { nav.openGallery(memory.id.toString(), it) })
            }
            Column(Modifier.padding(horizontal = gutter, vertical = Space.md), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (memory.title.isNotBlank()) {
                    Text(memory.title, style = EimirType.editorialLarge, color = Eimir.colors.textPrimary, modifier = Modifier.semantics { heading() })
                }
                Text(
                    listOfNotNull(memory.happenedOn?.let { Dates.long(it, locale) }, stringResource(R.string.story_by, authorName(memory.author)))
                        .joinToString(" · "),
                    style = EimirType.bodySmall,
                    color = Eimir.colors.textSecondary,
                )
                ContextPill(stringResource(R.string.audience_shared), icon = EimirIcons.Shared)
                if (memory.body.isNotBlank()) {
                    Spacer(Modifier.height(Space.xs))
                    Text(memory.body, style = EimirType.reading, color = Eimir.colors.textPrimary)
                }
                if (memory.tags.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Space.xs), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
                        memory.tags.forEach { ContextPill(it) }
                    }
                }
                MomentPlacesSection(MomentKind.MEMORY, memory.id.toString())
                CommentsSection(MomentKind.MEMORY, memory.id.toString(), canComment = memory.capabilities.canComment)
            }
        }
    }
}

@Composable
private fun PhotoPager(memory: MemoryDetail, count: Int, reveals: SensitiveReveals, onOpen: (Int) -> Unit) {
    val photos = remember(memory.attachments) { memory.attachments.sortedBy { it.position } }
    val pager = rememberPagerState { count }
    // One stable frame for all pages: the tallest photo within bounds, so
    // swiping never resizes the page.
    val ratio = remember(photos) { photos.minOf { previewRatio(it.width, it.height) } }
    Box {
        HorizontalPager(
            state = pager,
            key = { photos[it].id },
            beyondViewportPageCount = 1,
            modifier = Modifier.fillMaxWidth().aspectRatio(ratio),
        ) { page ->
            val photo = photos[page]
            val openLabel = stringResource(R.string.memory_open_gallery, page + 1, count)
            AttachmentPhoto(
                ref = photo.toRef(memory.id),
                variant = de.eimir.nativetest.media.MediaVariant.ORIGINAL,
                reveals = reveals,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .clickable(role = Role.Image, onClickLabel = openLabel) { onOpen(page) },
            )
        }
        if (count > 1) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(Space.sm).clip(Radii.pill).background(Eimir.colors.scrim.copy(alpha = 0.4f)).padding(horizontal = Space.xs, vertical = Space.xxs),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                repeat(count) { index ->
                    Box(
                        Modifier.size(if (index == pager.currentPage) 8.dp else 6.dp).clip(CircleShape)
                            .background(if (index == pager.currentPage) Eimir.colors.onAccent else Eimir.colors.onAccent.copy(alpha = 0.5f)),
                    )
                }
            }
        }
    }
}
