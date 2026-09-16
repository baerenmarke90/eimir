package de.eimir.app.story

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.eimir.app.design.EimirDisplayFamily
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.R
import de.eimir.app.shell.UiProblem
import de.eimir.app.shell.UiStatePanel
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import eimir.api.models.AttachmentReadRequest
import eimir.api.models.MediaType
import eimir.api.models.MemoryDetail

private val ReadingMeasure: Dp = 560.dp

/**
 * One memory, in full.
 *
 * The Story shows a summary and the first few photographs; this is where the
 * whole text and every photograph live, and the only place a memory can be
 * changed or removed.
 */
@Composable
fun MemoryScreen(
    memory: MemoryDetail?,
    imageStore: StoryImageStore,
    generation: Long,
    busy: Boolean,
    problem: UiProblem?,
    gone: Boolean,
    editing: Boolean,
    savedMessage: String?,
    onBack: () -> Unit,
    onBeginEditing: () -> Unit,
    onCancelEditing: () -> Unit,
    onSave: (title: String, body: String, happenedOn: String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    /** Non-null only while [memory] is a stale M2-D18 cache fallback. */
    cachedAt: java.time.Instant? = null,
    /** Rendered below the memory; absent while it is being edited. */
    comments: (@Composable () -> Unit)? = null,
) {
    if (gone || memory == null) {
        Column(modifier.fillMaxWidth().padding(EimirTheme.spacing.pageMargin)) {
            TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onBack, modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("memory-detail-back")) {
                Text(stringResource(R.string.memory_task_back))
            }
        if (gone) UiStatePanel(
            problem = UiProblem(
                kind = de.eimir.app.shell.UiStateKind.Empty,
                titleRes = R.string.memory_gone_title,
                bodyRes = R.string.memory_gone_body,
                retryable = false,
            ),
            onRetry = null,
            modifier = modifier,
        ) else if (problem != null) UiStatePanel(problem = problem, onRetry = null)
        else Text(stringResource(R.string.memory_task_loading), color = EimirTheme.colors.textSecondary)
        }
        return
    }

    // Keyed by the memory, not by its version: a conflict reloads the memory,
    // and resetting the fields then would throw away exactly the text the
    // conflict is about.
    var title by rememberSaveable(memory.id) { mutableStateOf(memory.title) }
    var body by rememberSaveable(memory.id) { mutableStateOf(memory.body) }
    var happenedOn by rememberSaveable(memory.id) {
        mutableStateOf(memory.happenedOn?.toString().orEmpty())
    }
    var confirmingDelete by rememberSaveable(memory.id) { mutableStateOf(false) }

    LazyColumn(
        modifier = modifier.fillMaxWidth().testTag("memory-detail"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            EimirTheme.spacing.pageMargin,
        ),
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step5),
    ) {
        item {
            TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onBack, modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("memory-detail-back")) {
                Text(stringResource(R.string.memory_task_back))
            }
        }

        problem?.let { current ->
            // A conflict needs no retry button of its own: the memory has been
            // reloaded with the version the partner left, the typed text is
            // still in the form, and saving again is the recovery.
            item { UiStatePanel(problem = current) }
        }

        cachedAt?.let { item { de.eimir.app.shell.CachedContentBanner(it) } }

        savedMessage?.let { text ->
            item {
                Text(
                    text = text,
                    style = MaterialTheme.typography.bodyMedium,
                    color = EimirTheme.colors.success,
                    // Announced once: a save that only shows its result by the
                    // title quietly changing is no confirmation at all.
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }

        if (editing) {
            item {
                Column(
                    verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
                ) {
                    OutlinedTextField(
                        value = title,
                        onValueChange = { title = it.take(200) },
                        label = { Text(stringResource(R.string.ref_title)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = body,
                        onValueChange = { body = it },
                        label = { Text(stringResource(R.string.ref_memory)) },
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = happenedOn,
                        onValueChange = { happenedOn = it },
                        label = { Text(stringResource(R.string.ref_date_optional)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(
                            EimirTheme.spacing.step3,
                        ),
                    ) {
                        Button(
                            onClick = { onSave(title, body, happenedOn) },
                            enabled = !busy && title.isNotBlank(),
                            modifier = Modifier.heightIn(min = MinimumTouchTarget),
                        ) {
                            Text(stringResource(R.string.memory_save))
                        }
                        TextButton(
                            onClick = {
                                onCancelEditing()
                                title = memory.title
                                body = memory.body
                                happenedOn = memory.happenedOn?.toString().orEmpty()
                            },
                            enabled = !busy,
                        ) {
                            Text(stringResource(R.string.memory_cancel))
                        }
                    }
                }
            }
        } else {
            item { MemoryHeader(memory) }
            item {
                Text(
                    text = memory.body,
                    style = MaterialTheme.typography.bodyLarge,
                    color = EimirTheme.colors.textPrimary,
                    modifier = Modifier.widthIn(max = ReadingMeasure),
                )
            }

            // Offered only where the server grants it. A client guess about who
            // may change what would either hide an action someone has, or offer
            // one the server will refuse.
            if (memory.capabilities.canEdit || memory.capabilities.canDelete) {
                item {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(
                            EimirTheme.spacing.step3,
                        ),
                    ) {
                        if (memory.capabilities.canEdit) {
                            Button(
                                onClick = onBeginEditing,
                                enabled = !busy,
                                modifier = Modifier.heightIn(min = MinimumTouchTarget),
                            ) {
                                Text(stringResource(R.string.memory_edit))
                            }
                        }
                        if (memory.capabilities.canDelete) {
                            TextButton(
                                onClick = { confirmingDelete = true },
                                enabled = !busy,
                                modifier = Modifier.heightIn(min = MinimumTouchTarget),
                            ) {
                                Text(stringResource(R.string.memory_delete))
                            }
                        }
                    }
                }
            }
        }

        if (!editing) {
            comments?.let { thread -> item { thread() } }
        }

        items(
            count = memory.imageRefs().size,
            key = { index -> memory.imageRefs()[index].attachmentId.toString() },
        ) { index ->
            StoryImage(
                image = memory.imageRefs()[index],
                store = imageStore,
                generation = generation,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 3f),
            )
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.memory_delete_confirm_title)) },
            text = { Text(stringResource(R.string.memory_delete_confirm_body)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmingDelete = false
                        onDelete()
                    },
                ) {
                    Text(stringResource(R.string.memory_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) {
                    Text(stringResource(R.string.memory_cancel))
                }
            },
        )
    }
}

@Composable
private fun MemoryHeader(memory: MemoryDetail) {
    val locale: Locale = LocalConfiguration.current.locales[0]
    Column(
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
        modifier = Modifier.padding(top = EimirTheme.spacing.step2),
    ) {
        memory.happenedOn?.let { day ->
            Text(
                text = day.format(
                    DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale),
                ),
                style = MaterialTheme.typography.labelLarge,
                color = EimirTheme.colors.brandStrong,
            )
        }
        Text(
            text = memory.title,
            // A memory's own title is the other editorial moment.
            style = MaterialTheme.typography.headlineMedium
                .copy(fontFamily = EimirDisplayFamily),
            color = EimirTheme.colors.textPrimary,
            modifier = Modifier
                .widthIn(max = ReadingMeasure)
                .semantics { heading() },
        )
        Text(
            text = stringResource(R.string.memory_written_by, memory.author.displayNameForUi(stringResource(R.string.author_former_member))),
            style = MaterialTheme.typography.bodySmall,
            color = EimirTheme.colors.textSecondary,
        )
    }
}

/** Every readable photograph on this memory, in the order it was arranged. */
private fun MemoryDetail.imageRefs(): List<StoryImageRef> = attachments
    .filter { it.mediaType == MediaType.IMAGE && it.status == "READY" }
    .sortedBy { it.position }
    .map {
        StoryImageRef(
            attachmentId = it.id,
            parentId = id,
            parentType = AttachmentReadRequest.ParentType.MEMORY,
        )
    }
