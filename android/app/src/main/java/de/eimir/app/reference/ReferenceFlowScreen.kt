package de.eimir.app.reference

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.eimir.app.demo.DemoPersona
import de.eimir.app.entry.EntryScreen
import de.eimir.app.design.EimirTheme
import de.eimir.app.design.MinimumTouchTarget
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import eimir.api.models.StoryItem

@Composable
fun ReferenceFlowScreen(
    state: ReferenceUiState,
    onLogin: (String, String) -> Unit,
    onLogout: () -> Unit,
    onPickImage: () -> Unit,
    onCreateMemory: (String, String, String) -> Unit,
    onRefreshStory: () -> Unit,
    modifier: Modifier = Modifier,
    onRetryImage: (Long) -> Unit = { _ -> },
    onRemoveImage: (Long) -> Unit = { _ -> },
    onEnterDemo: ((DemoPersona) -> Unit)? = null,
    /**
     * Set where this screen is the Story's capture step rather than the whole
     * M2 reference flow.
     *
     * Being non-null both provides the way back and marks the screen as
     * embedded: the technical M2 heading, the session row and the Story
     * summary all belong to the standalone flow, and inside the product they
     * would be a second identity, a second sign-out and a second Story.
     */
    onCancelCapture: (() -> Unit)? = null,
    task: MemoryTask? = null,
    onDraftChange: (String, String, String) -> Unit = { _, _, _ -> },
    onRetryAttachments: () -> Unit = {},
    onViewPartialResult: () -> Unit = {},
    cancelModifier: Modifier = Modifier,
) {
    val embedded = onCancelCapture != null
    var localTitle by remember { mutableStateOf("") }
    var localBody by remember { mutableStateOf("") }
    var localHappenedOn by remember { mutableStateOf("") }
    val title = task?.title ?: localTitle
    val body = task?.body ?: localBody
    val happenedOn = task?.happenedOn ?: localHappenedOn
    val editable = task?.editable ?: !state.busy

    // Signed out, the product entry surface is the whole screen. It scrolls
    // itself, so it must not be nested inside the lazy list below.
    if (!state.loggedIn) {
        val entryNotice = when {
            !state.configured -> stringResource(R.string.ref_not_configured)
            state.instanceAvailability == InstanceAvailability.MAINTENANCE ->
                stringResource(R.string.ref_maintenance_mode)
            state.instanceAvailability == InstanceAvailability.REGISTRATION_DISABLED ->
                stringResource(R.string.ref_registration_disabled)
            state.instanceAvailability == InstanceAvailability.UNREACHABLE ->
                stringResource(R.string.ref_instance_status_unreachable)
            else -> null
        }
        EntryScreen(
            onSignIn = onLogin,
            busy = state.busy,
            signInEnabled = state.configured,
            notice = entryNotice,
            onEnterDemo = onEnterDemo,
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    LazyColumn(
        modifier = modifier.fillMaxSize().imePadding().testTag("memory-create-scroll"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(EimirTheme.spacing.pageMargin),
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step4),
    ) {
        run {
            if (onCancelCapture != null) {
                item {
                    TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onCancelCapture, modifier = cancelModifier.heightIn(min = MinimumTouchTarget).testTag("memory-create-close")) {
                        Text(stringResource(if (task != null) R.string.task_sheet_close else R.string.story_capture_cancel))
                    }
                }
            }

            if (!embedded) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = stringResource(R.string.app_name),
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            text = stringResource(R.string.ref_flow_subtitle),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Text(stringResource(R.string.ref_flow_intro))
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(stringResource(R.string.ref_authenticated))
                        TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onLogout, enabled = !state.busy) {
                            Text(stringResource(R.string.ref_logout))
                        }
                    }
                }
            }

            item {
                Column(verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3)) {
                    Text(
                        text = stringResource(R.string.ref_memory_heading),
                        style = EimirTheme.contentTypography.utilityHeading,
                        color = EimirTheme.colors.textPrimary,
                        modifier = Modifier.semantics { heading() },
                    )
                    if (embedded) {
                        // R1 content-first order: photo action / selected media, then the
                        // always-visible narrative, then a demoted optional title, then the
                        // local-date summary with its own change action, then audience.
                        MemoryPhotoPicker(state, editable, onPickImage)
                        MemoryDraftImagesList(state, editable, onRetryImage, onRemoveImage)
                        OutlinedTextField(
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = EimirTheme.colors.focus,
                                focusedLabelColor = EimirTheme.colors.linkText,
                                cursorColor = EimirTheme.colors.linkText,
                                disabledTextColor = EimirTheme.colors.textPrimary,
                                disabledLabelColor = EimirTheme.colors.textSecondary,
                            ),
                            value = body,
                            onValueChange = { if (task == null) localBody = it else onDraftChange(title, it, happenedOn) },
                            enabled = editable,
                            label = { Text(stringResource(R.string.ref_memory)) },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth().testTag("memory-create-body"),
                        )
                        OutlinedTextField(
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = EimirTheme.colors.focus,
                                focusedLabelColor = EimirTheme.colors.linkText,
                                cursorColor = EimirTheme.colors.linkText,
                                disabledTextColor = EimirTheme.colors.textPrimary,
                                disabledLabelColor = EimirTheme.colors.textSecondary,
                            ),
                            value = title,
                            onValueChange = { if (task == null) localTitle = it.take(200) else onDraftChange(it, body, happenedOn) },
                            enabled = editable,
                            label = { Text(stringResource(R.string.ref_title_optional)) },
                            modifier = Modifier.fillMaxWidth().testTag("memory-create-title"),
                        )
                        MemoryDateField(
                            happenedOn = happenedOn,
                            editable = editable,
                            autoOpen = task?.problem?.resourceId == R.string.ref_error_date_format,
                            onValueChange = { if (task == null) localHappenedOn = it else onDraftChange(title, body, it) },
                        )
                        de.eimir.app.design.VisibilityBadge(isShared = true)
                    } else {
                        OutlinedTextField(
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = EimirTheme.colors.focus,
                                focusedLabelColor = EimirTheme.colors.linkText,
                                cursorColor = EimirTheme.colors.linkText,
                                disabledTextColor = EimirTheme.colors.textPrimary,
                                disabledLabelColor = EimirTheme.colors.textSecondary,
                            ),
                            value = title,
                            onValueChange = { if (task == null) localTitle = it.take(200) else onDraftChange(it, body, happenedOn) },
                            enabled = editable,
                            label = { Text(stringResource(R.string.ref_title)) },
                            modifier = Modifier.fillMaxWidth().testTag("memory-create-title"),
                        )
                        OutlinedTextField(
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = EimirTheme.colors.focus,
                                focusedLabelColor = EimirTheme.colors.linkText,
                                cursorColor = EimirTheme.colors.linkText,
                                disabledTextColor = EimirTheme.colors.textPrimary,
                                disabledLabelColor = EimirTheme.colors.textSecondary,
                            ),
                            value = body,
                            onValueChange = { if (task == null) localBody = it else onDraftChange(title, it, happenedOn) },
                            enabled = editable,
                            label = { Text(stringResource(R.string.ref_memory)) },
                            minLines = 3,
                            modifier = Modifier.fillMaxWidth().testTag("memory-create-body"),
                        )
                        OutlinedTextField(
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = EimirTheme.colors.focus,
                                focusedLabelColor = EimirTheme.colors.linkText,
                                cursorColor = EimirTheme.colors.linkText,
                                disabledTextColor = EimirTheme.colors.textPrimary,
                                disabledLabelColor = EimirTheme.colors.textSecondary,
                            ),
                            value = happenedOn,
                            onValueChange = { if (task == null) localHappenedOn = it else onDraftChange(title, body, it) },
                            enabled = editable,
                            label = { Text(stringResource(R.string.ref_date_optional)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        MemoryPhotoPicker(state, editable, onPickImage)
                        MemoryDraftImagesList(state, editable, onRetryImage, onRemoveImage)
                    }

                    val imagesReadyToSave = state.draftImages.all {
                        it.uploadState == DraftUploadState.READY
                    }
                    if (task?.pending == true) {
                        Text(stringResource(R.string.memory_task_pending), color = EimirTheme.colors.textPrimary,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("memory-create-pending"))
                    }
                    task?.problem?.let { problem ->
                        Text(stringResource(problem.resourceId, *problem.args.toTypedArray()),
                            color = EimirTheme.colors.error,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }.testTag("memory-create-problem"))
                    }
                    if (task?.phase == MemoryTaskPhase.ATTACHMENT_RECOVERY) {
                        Button(onClick = onRetryAttachments, modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)) {
                            Text(stringResource(R.string.memory_task_retry_photos))
                        }
                        TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onViewPartialResult, modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)) {
                            Text(stringResource(R.string.memory_task_open_saved))
                        }
                    }
                    if (task == null || task.editable || task.pending) Button(
                        onClick = { onCreateMemory(title, body, happenedOn) },
                        enabled = editable && (embedded || title.isNotBlank()) && imagesReadyToSave,
                        modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget).testTag("memory-create-save"),
                    ) {
                        Text(
                            stringResource(
                                if (state.busy) R.string.ref_memory_saving else R.string.ref_memory_save,
                            ),
                        )
                    }
                }
            }

            if (!embedded && state.lastMemoryTitle != null) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = stringResource(R.string.ref_last_saved),
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.semantics { heading() },
                        )
                        state.lastImageBytes?.let { imageBytes ->
                            val bitmap = remember(imageBytes) {
                                BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
                            }
                            if (bitmap != null) {
                                Image(
                                    bitmap = bitmap.asImageBitmap(),
                                    contentDescription = stringResource(R.string.ref_last_saved_image_description),
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                        Text(state.lastMemoryTitle, style = MaterialTheme.typography.titleMedium)
                        state.lastMemoryBody?.let { Text(it) }
                    }
                }
            }

            if (!embedded) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = stringResource(R.string.ref_story_heading),
                            style = MaterialTheme.typography.headlineSmall,
                            modifier = Modifier.semantics { heading() },
                        )
                        TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onRefreshStory, enabled = !state.busy) {
                            Text(stringResource(R.string.ref_refresh))
                        }
                    }
                }

                if (state.storyItems.isEmpty()) {
                    item { Text(stringResource(R.string.ref_story_empty)) }
                } else {
                    itemsIndexed(state.storyItems) { _, storyItem ->
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(storyItemLabel(storyItem).resolve(), style = MaterialTheme.typography.titleSmall)
                            Text(storyItemDate(storyItem))
                        }
                    }
                }
            }
        }

        state.status?.takeIf { task == null }?.let { message ->
            item {
                Text(
                    text = message.resolve(),
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        state.error?.takeIf { task?.problem == null }?.let { message ->
            item {
                Text(
                    text = message.resolve(),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
        }
    }
}

@Composable
internal fun UiMessage.resolve(): String = stringResource(resourceId, *args.toTypedArray())

internal fun storyItemLabel(item: StoryItem): UiMessage = when (item) {
    is StoryItem.MemoryWrapper -> UiMessage(R.string.ref_story_memory, listOf(item.value.memory.title))
    is StoryItem.HeartMomentWrapper -> UiMessage(R.string.ref_story_heart_moment)
    is StoryItem.MilestoneWrapper -> UiMessage(R.string.ref_story_milestone, listOf(item.value.milestone.title))
}

internal fun storyItemDate(item: StoryItem, locale: Locale = Locale.getDefault()): String {
    val date = when (item) {
        is StoryItem.MemoryWrapper -> item.value.effectiveDate
        is StoryItem.HeartMomentWrapper -> item.value.effectiveDate
        is StoryItem.MilestoneWrapper -> item.value.effectiveDate
    }
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(date)
}

@Composable
private fun MemoryPhotoPicker(state: ReferenceUiState, editable: Boolean, onPickImage: () -> Unit) {
    Button(
        onClick = onPickImage,
        enabled = editable,
        modifier = Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget).testTag("memory-create-photos"),
    ) {
        Text(
            stringResource(
                if (state.draftImages.isEmpty()) R.string.ref_images_select else R.string.ref_images_add,
            ),
        )
    }
}

@Composable
private fun MemoryDraftImagesList(
    state: ReferenceUiState,
    editable: Boolean,
    onRetryImage: (Long) -> Unit,
    onRemoveImage: (Long) -> Unit,
) {
    if (state.draftImages.isEmpty()) return
    Text(stringResource(R.string.ref_images_selected_count, state.draftImages.size))
    Text(stringResource(R.string.ref_image_preview_notice))
    state.draftImages.forEachIndexed { index, draft ->
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.ref_image_item_title, index + 1, draft.displayName),
                style = MaterialTheme.typography.titleSmall,
            )
            val selectedBitmap = remember(draft.id, draft.bytes) {
                BitmapFactory.decodeByteArray(draft.bytes, 0, draft.bytes.size)
            }
            if (selectedBitmap != null) {
                Image(
                    bitmap = selectedBitmap.asImageBitmap(),
                    contentDescription = stringResource(R.string.ref_image_preview_description, draft.displayName),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Text(
                text = stringResource(
                    when (draft.uploadState) {
                        DraftUploadState.UPLOADING -> R.string.ref_image_uploading
                        DraftUploadState.VALIDATING -> R.string.ref_image_validating
                        DraftUploadState.READY -> R.string.ref_image_ready
                        DraftUploadState.FAILED -> R.string.ref_image_failed
                    },
                ),
                color = if (draft.uploadState == DraftUploadState.FAILED) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (draft.uploadState == DraftUploadState.FAILED) {
                    TextButton(
                        colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                        onClick = { onRetryImage(draft.id) },
                        enabled = editable,
                    ) {
                        Text(stringResource(R.string.ref_image_retry))
                    }
                }
                TextButton(
                    colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
                    onClick = { onRemoveImage(draft.id) },
                    enabled = editable,
                ) {
                    Text(stringResource(R.string.ref_image_remove))
                }
            }
        }
    }
}

/**
 * R1's local-date summary with a discoverable change action (#964). Closed, it shows
 * a persistent "Datum" label plus the formatted current value and an "Ändern" action
 * as one accessible target; tapping it reveals the actual editable field. [autoOpen]
 * keeps/opens the editor when the task's own date validation rejected the value, so
 * the person sees the field that needs correcting rather than only its error text.
 */
@Composable
private fun MemoryDateField(
    happenedOn: String,
    editable: Boolean,
    autoOpen: Boolean,
    onValueChange: (String) -> Unit,
) {
    var editorOpen by rememberSaveable { mutableStateOf(autoOpen) }
    LaunchedEffect(autoOpen) {
        if (autoOpen) editorOpen = true
    }
    Text(
        text = stringResource(R.string.ref_date_label),
        style = MaterialTheme.typography.labelLarge,
        color = EimirTheme.colors.textSecondary,
    )
    if (editorOpen) {
        OutlinedTextField(
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = EimirTheme.colors.focus,
                focusedLabelColor = EimirTheme.colors.linkText,
                cursorColor = EimirTheme.colors.linkText,
                disabledTextColor = EimirTheme.colors.textPrimary,
                disabledLabelColor = EimirTheme.colors.textSecondary,
            ),
            value = happenedOn,
            onValueChange = onValueChange,
            enabled = editable,
            label = { Text(stringResource(R.string.ref_date_optional)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("memory-create-date"),
        )
    } else {
        val summary = memoryDateSummary(happenedOn)
        val changeLabel = stringResource(R.string.ref_date_change)
        val dateLabel = stringResource(R.string.ref_date_label)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = MinimumTouchTarget)
                .border(1.dp, EimirTheme.colors.border, RoundedCornerShape(8.dp))
                .clickable(enabled = editable, onClickLabel = changeLabel) { editorOpen = true }
                .padding(horizontal = 16.dp)
                .semantics(mergeDescendants = true) {
                    contentDescription = "$dateLabel, $summary, $changeLabel"
                    role = Role.Button
                }
                .testTag("memory-create-date-summary"),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(summary, color = EimirTheme.colors.textPrimary, modifier = Modifier.align(Alignment.CenterVertically))
            Text(changeLabel, color = EimirTheme.colors.linkText, modifier = Modifier.align(Alignment.CenterVertically))
        }
    }
}

@Composable
private fun memoryDateSummary(happenedOn: String, locale: Locale = Locale.getDefault()): String {
    val date = happenedOn.takeIf { it.isNotBlank() }
        ?.let { runCatching { LocalDate.parse(it.trim()) }.getOrNull() }
        ?: LocalDate.now()
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale).format(date)
}

/** Same localized fallback shape as the Web client's memoryProduct.createFallbackTitle. */
@Composable
internal fun memoryFallbackTitle(happenedOn: String, locale: Locale = Locale.getDefault()): String {
    val date = happenedOn.takeIf { it.isNotBlank() }
        ?.let { runCatching { LocalDate.parse(it.trim()) }.getOrNull() }
        ?: LocalDate.now()
    val formatted = DateTimeFormatter.ofLocalizedDate(FormatStyle.SHORT).withLocale(locale).format(date)
    return stringResource(R.string.ref_memory_fallback_title, formatted)
}
