package de.eimir.nativetest.ui.story

import de.eimir.nativetest.ui.common.confirmHaptic
import android.Manifest
import android.view.HapticFeedbackConstants
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import de.eimir.nativetest.R
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.media.PhotoLocation
import de.eimir.nativetest.media.PickPhotos
import de.eimir.nativetest.media.UploadPhase
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.BackButton
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.FullScreenLoading
import de.eimir.nativetest.ui.common.MediaRef
import de.eimir.nativetest.ui.common.PrimaryButton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import java.time.Instant
import java.time.ZoneOffset

/**
 * R1 capture/edit: photos or words first, optional enrichment after, one safe
 * completion action above the keyboard. The page itself is the composer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemoryEditorScreen(nav: AppNavigator, memoryId: String?) {
    val graph = appGraph()
    val context = LocalContext.current.applicationContext
    val model: MemoryEditorViewModel = viewModel(key = "editor-${memoryId ?: "new"}") {
        MemoryEditorViewModel(graph, createSavedStateHandle(), context, memoryId)
    }
    val ui by model.ui.collectAsStateWithLifecycle()
    val view = LocalView.current
    var confirmDiscard by rememberSaveable { mutableStateOf(false) }
    var pickDate by rememberSaveable { mutableStateOf(false) }
    var askLocation by rememberSaveable { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(PickPhotos(MemoryEditorViewModel.MAX_PHOTOS)) { uris ->
        if (uris.isNotEmpty()) model.addPhotos(uris)
    }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        // A declined optional permission still opens the picker; photos are kept without place.
        picker.launch(Unit)
    }
    val activityContext = LocalContext.current
    fun pickPhotos() {
        if (PhotoLocation.needsPermission(activityContext)) askLocation = true else picker.launch(Unit)
    }

    LaunchedEffect(ui.save) {
        val saved = ui.save as? SaveState.Saved ?: return@LaunchedEffect
        view.confirmHaptic()
        if (memoryId == null) nav.replaceWithMemory(saved.memoryId) else nav.back()
    }

    fun close() {
        if (ui.dirty && ui.save !is SaveState.Saved) confirmDiscard = true else {
            model.discard()
            nav.back()
        }
    }
    BackHandler(enabled = ui.dirty) { close() }

    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BackButton(::close, close = true)
            Text(
                stringResource(if (memoryId == null) R.string.editor_new_memory else R.string.editor_edit_memory),
                style = EimirType.title,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
        }
        when {
            ui.loading -> FullScreenLoading()
            ui.loadError != null -> ErrorState(ui.loadError!!, model::load)
            else -> {
                ReadingColumn(Modifier.weight(1f)) { gutter ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = gutter, vertical = Space.sm),
                        verticalArrangement = Arrangement.spacedBy(Space.md),
                    ) {
                        PhotoStrip(ui, memoryId, onAdd = ::pickPhotos, model = model)
                        OutlinedTextField(
                            value = ui.body,
                            onValueChange = model::setBody,
                            label = { Text(stringResource(R.string.editor_story_label)) },
                            placeholder = { Text(stringResource(R.string.editor_story_placeholder)) },
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                            minLines = 4,
                            textStyle = EimirType.reading,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = ui.title,
                            onValueChange = model::setTitle,
                            label = { Text(stringResource(R.string.editor_title_label)) },
                            placeholder = { Text(stringResource(R.string.editor_title_placeholder)) },
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.editor_date), style = EimirType.label, color = Eimir.colors.textSecondary)
                                Text(Dates.long(ui.date, currentLocale()), style = EimirType.body)
                            }
                            TextButton(onClick = { pickDate = true }) { Text(stringResource(R.string.editor_date_change)) }
                        }
                        ContextPill(stringResource(R.string.editor_audience), icon = EimirIcons.Shared)
                        OutlinedTextField(
                            value = ui.tags,
                            onValueChange = model::setTags,
                            label = { Text(stringResource(R.string.editor_tags_label)) },
                            placeholder = { Text(stringResource(R.string.editor_tags_placeholder)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Spacer(Modifier.height(Space.lg))
                    }
                }
                SaveBar(ui, onSave = model::save)
            }
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text(stringResource(R.string.discard_title)) },
            text = { Text(stringResource(R.string.discard_body)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmDiscard = false
                    model.discard()
                    nav.back()
                }) { Text(stringResource(R.string.action_discard), color = Eimir.colors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text(stringResource(R.string.action_keep_editing)) } },
        )
    }
    if (askLocation) {
        AlertDialog(
            onDismissRequest = { askLocation = false },
            title = { Text(stringResource(R.string.editor_location_permission_title)) },
            text = { Text(stringResource(R.string.editor_location_permission_body)) },
            confirmButton = {
                TextButton(onClick = {
                    askLocation = false
                    locationPermission.launch(Manifest.permission.ACCESS_MEDIA_LOCATION)
                }) { Text(stringResource(R.string.editor_location_permission_allow)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    askLocation = false
                    picker.launch(Unit)
                }) { Text(stringResource(R.string.editor_location_permission_skip)) }
            },
        )
    }
    if (pickDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = ui.date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { model.setDate(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    pickDate = false
                }) { Text(stringResource(R.string.action_done)) }
            },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text(stringResource(R.string.action_cancel)) } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun PhotoStrip(ui: EditorUi, memoryId: String?, onAdd: () -> Unit, model: MemoryEditorViewModel) {
    if (ui.photos.isEmpty()) {
        // Neutral photo-or-text entry: a large, obvious photo action, no keyboard yet.
        Surface(
            onClick = onAdd,
            shape = Radii.card,
            color = Eimir.colors.pageTintShared,
            modifier = Modifier.fillMaxWidth().heightIn(min = 160.dp),
        ) {
            Column(
                Modifier.padding(Space.lg),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Space.xs, Alignment.CenterVertically),
            ) {
                EimirIcon(EimirIcons.Photo, size = 40.dp)
                Text(stringResource(R.string.editor_add_photos), style = EimirType.title)
                Text(
                    stringResource(R.string.editor_photo_location_hint),
                    style = EimirType.meta,
                    color = Eimir.colors.textSecondary,
                )
            }
        }
        return
    }
    val reveals = de.eimir.nativetest.ui.common.rememberSensitiveReveals("editor-${memoryId ?: "new"}")
    Column(verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(Space.xs), contentPadding = PaddingValues(vertical = Space.xxs)) {
            itemsIndexed(ui.photos, key = { _, photo -> photo.key }) { index, photo ->
                DraftThumb(
                    photo = photo,
                    index = index,
                    count = ui.photos.size,
                    memoryId = memoryId,
                    model = model,
                    reveals = reveals,
                    modifier = Modifier.animateItem(),
                )
            }
            if (ui.photos.size < MemoryEditorViewModel.MAX_PHOTOS) {
                item(key = "add") {
                    val label = stringResource(R.string.editor_add_more_photos)
                    Surface(
                        onClick = onAdd,
                        shape = Radii.large,
                        color = Eimir.colors.surfaceSubtle,
                        modifier = Modifier.size(140.dp).semantics { contentDescription = label },
                    ) {
                        Box(contentAlignment = Alignment.Center) { EimirIcon(EimirIcons.Add, size = 32.dp) }
                    }
                }
            }
        }
        if (ui.photos.size > 1) {
            Text(stringResource(R.string.editor_photos_reorder_hint), style = EimirType.meta, color = Eimir.colors.textSecondary)
        }
        if (ui.photos.any { it.sensitive }) {
            Text(stringResource(R.string.sensitive_help), style = EimirType.meta, color = Eimir.colors.private)
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun DraftThumb(
    photo: DraftPhoto,
    index: Int,
    count: Int,
    memoryId: String?,
    model: MemoryEditorViewModel,
    reveals: de.eimir.nativetest.ui.common.SensitiveReveals,
    modifier: Modifier,
) {
    var menu by remember { mutableStateOf(false) }
    val view = LocalView.current
    val sensitiveState = if (photo.sensitive) stringResource(R.string.sensitive_label) else ""
    Box(modifier.size(140.dp)) {
        Box(
            Modifier
                .fillMaxSize()
                .clip(Radii.large)
                .border(if (photo.sensitive) 2.dp else 0.dp, Eimir.colors.private, Radii.large)
                .combinedClickable(
                    onClick = { menu = true },
                    onLongClick = {
                        view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                        menu = true
                    },
                    onClickLabel = stringResource(R.string.action_more),
                )
                .semantics { stateDescription = sensitiveState },
        ) {
            val uri = photo.localUri
            if (uri != null) {
                // A local preview of the person's own pick: decoded by Coil with
                // EXIF orientation applied, never uploaded twice.
                coil3.compose.AsyncImage(
                    model = uri,
                    contentDescription = null,
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } else if (photo.attachmentId != null && memoryId != null) {
                // Already bound photos keep their classification; a sensitive
                // one stays covered here too until explicitly revealed.
                AttachmentPhoto(
                    ref = MediaRef(
                        photo.attachmentId,
                        MediaParent.MEMORY,
                        java.util.UUID.fromString(memoryId),
                        isSensitive = photo.sensitive,
                        hasThumbnail = photo.hasThumbnail,
                    ),
                    reveals = reveals,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            when (val state = photo.state) {
                is DraftPhotoState.Uploading -> Column(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Eimir.colors.scrim.copy(alpha = 0.55f)).padding(Space.xs)
                        .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                ) {
                    Text(
                        if (state.phase == UploadPhase.Validating) {
                            stringResource(R.string.editor_photo_validating)
                        } else {
                            stringResource(R.string.editor_photo_uploading, (state.progress * 100).toInt())
                        },
                        style = EimirType.meta,
                        color = Eimir.colors.onAccent,
                    )
                    LinearProgressIndicator(
                        progress = { if (state.phase == UploadPhase.Validating) 1f else state.progress },
                        modifier = Modifier.fillMaxWidth(),
                        color = Eimir.colors.onAccent,
                    )
                }
                is DraftPhotoState.Failed -> Box(
                    Modifier.fillMaxSize().background(Eimir.colors.scrim.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(stringResource(R.string.editor_photo_failed), style = EimirType.meta, color = Eimir.colors.onAccent)
                        if (photo.localUri != null) {
                            IconButton(onClick = { model.retryUpload(photo.key) }) {
                                Icon(Icons.Rounded.Refresh, contentDescription = stringResource(R.string.editor_photo_retry), tint = Eimir.colors.onAccent)
                            }
                        }
                    }
                }
                DraftPhotoState.Ready -> if (photo.sensitive) {
                    Surface(
                        shape = Radii.pill,
                        color = Eimir.colors.private,
                        modifier = Modifier.align(Alignment.BottomStart).padding(Space.xs),
                    ) {
                        Text(
                            stringResource(R.string.sensitive_label),
                            style = EimirType.meta,
                            color = Eimir.colors.onAccent,
                            modifier = Modifier.padding(horizontal = Space.xs, vertical = 2.dp),
                        )
                    }
                }
            }
        }
        Surface(
            onClick = { model.removePhoto(photo.key) },
            shape = Radii.pill,
            color = Eimir.colors.scrim.copy(alpha = 0.6f),
            modifier = Modifier.align(Alignment.TopEnd).padding(Space.xxs).size(Space.touchTarget - 8.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Close, contentDescription = stringResource(R.string.editor_photo_remove), tint = Eimir.colors.onAccent, modifier = Modifier.size(18.dp))
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(if (photo.sensitive) R.string.sensitive_hide else R.string.sensitive_mark)) },
                onClick = {
                    menu = false
                    model.toggleSensitive(photo.key)
                },
            )
            if (index > 0) {
                DropdownMenuItem(text = { Text(stringResource(R.string.editor_move_earlier)) }, onClick = {
                    menu = false
                    model.move(photo.key, -1)
                })
            }
            if (index < count - 1) {
                DropdownMenuItem(text = { Text(stringResource(R.string.editor_move_later)) }, onClick = {
                    menu = false
                    model.move(photo.key, +1)
                })
            }
            DropdownMenuItem(text = { Text(stringResource(R.string.editor_photo_remove)) }, onClick = {
                menu = false
                model.removePhoto(photo.key)
            })
        }
    }
}

@Composable
private fun SaveBar(ui: EditorUi, onSave: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Eimir.colors.headerSurface).navigationBarsPadding().imePadding()) {
        HorizontalDivider(color = Eimir.colors.borderSubtle)
        val message = when (val save = ui.save) {
            is SaveState.Failed -> save.error.message()
            is SaveState.Partial -> stringResource(R.string.editor_partial) + " " + save.error.message()
            else -> ui.validation?.let { stringResource(it) }
        }
        if (message != null) {
            Text(
                message,
                style = EimirType.bodySmall,
                color = Eimir.colors.error,
                modifier = Modifier.padding(horizontal = Space.lg, vertical = Space.xs).semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }
        Row(Modifier.padding(horizontal = Space.lg, vertical = Space.sm), verticalAlignment = Alignment.CenterVertically) {
            if (ui.uploading) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(Space.xs))
                Text(stringResource(R.string.editor_wait_uploads), style = EimirType.meta, color = Eimir.colors.textSecondary, modifier = Modifier.weight(1f))
            } else {
                Spacer(Modifier.weight(1f))
            }
            PrimaryButton(
                text = stringResource(
                    when (ui.save) {
                        SaveState.Saving -> R.string.editor_saving
                        is SaveState.Partial -> R.string.editor_partial_retry
                        else -> R.string.editor_save
                    },
                ),
                onClick = onSave,
                pending = ui.save == SaveState.Saving,
                enabled = !ui.uploading,
            )
        }
    }
}
