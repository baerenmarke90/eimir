package de.eimir.app.story

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import de.eimir.app.design.EimirReadingWidth
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.MemoryTaskPhase
import de.eimir.app.reference.R
import de.eimir.app.reference.ReferenceFlowScreen
import de.eimir.app.reference.ReferenceUiState

/** A task page around the existing capture inputs; payload remains owned by the ViewModel. */
@Composable
fun MemoryCreateScreen(
    state: ReferenceUiState,
    onDraftChange: (String, String, String) -> Unit,
    onPickImage: () -> Unit,
    onRetryImage: (Long) -> Unit,
    onRemoveImage: (Long) -> Unit,
    onSave: () -> Unit,
    onRetryAttachments: () -> Unit,
    onViewPartialResult: () -> Unit,
    onExit: () -> Unit,
) {
    val task = state.memoryTask ?: return
    var confirmExit by remember(task.generation) { mutableStateOf(false) }
    var explainPending by remember(task.generation) { mutableStateOf(false) }
    val closeFocus = remember { FocusRequester() }
    val requestExit = {
        when {
            task.pending -> explainPending = true
            task.hasText || state.draftImages.isNotEmpty() -> confirmExit = true
            else -> onExit()
        }
    }
    BackHandler(onBack = requestExit)
    LaunchedEffect(task.generation) { closeFocus.requestFocus() }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        ReferenceFlowScreen(
            state = state, onLogin = { _, _ -> }, onLogout = {}, onPickImage = onPickImage,
            onCreateMemory = { _, _, _ -> onSave() }, onRefreshStory = {},
            modifier = Modifier.widthIn(max = EimirReadingWidth),
            onRetryImage = onRetryImage, onRemoveImage = onRemoveImage,
            onCancelCapture = requestExit, task = task, onDraftChange = onDraftChange,
            onRetryAttachments = onRetryAttachments, onViewPartialResult = onViewPartialResult,
            cancelModifier = Modifier.focusRequester(closeFocus),
        )
    }
    if (confirmExit) {
        val uncertain = task.phase == MemoryTaskPhase.UNCERTAIN
        val partial = task.phase == MemoryTaskPhase.ATTACHMENT_RECOVERY
        AlertDialog(
            onDismissRequest = { confirmExit = false },
            title = { Text(stringResource(R.string.memory_task_exit_title)) },
            text = { Text(stringResource(when {
                uncertain -> R.string.memory_task_uncertain_exit
                partial -> R.string.memory_task_partial_exit
                else -> R.string.memory_task_discard_body
            })) },
            confirmButton = { TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { confirmExit = false; onExit() }) {
                Text(stringResource(if (uncertain || partial) R.string.memory_task_leave else R.string.memory_task_discard))
            } },
            dismissButton = { TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { confirmExit = false }) { Text(stringResource(R.string.memory_task_keep)) } },
            containerColor = EimirTheme.colors.surfaceRaised,
        )
    }
    if (explainPending && task.pending) AlertDialog(
        onDismissRequest = { explainPending = false },
        title = { Text(stringResource(R.string.ref_memory_saving)) },
        text = { Text(stringResource(R.string.memory_task_pending)) },
        confirmButton = { TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { explainPending = false }) { Text(stringResource(R.string.memory_task_wait)) } },
        containerColor = EimirTheme.colors.surfaceRaised,
    )
}
