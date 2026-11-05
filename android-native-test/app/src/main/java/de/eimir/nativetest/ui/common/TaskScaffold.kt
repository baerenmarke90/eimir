package de.eimir.nativetest.ui.common

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Space
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * A focused create/edit task: Close with a dirty-exit choice, the content,
 * and one completion action that stays reachable above the keyboard.
 */
@Composable
fun TaskScaffold(
    title: String,
    saveLabel: String,
    dirty: Boolean,
    saving: Boolean,
    saveEnabled: Boolean,
    error: AppError?,
    onClose: () -> Unit,
    onSave: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    var confirmDiscard by rememberSaveable { mutableStateOf(false) }
    val close = { if (dirty) confirmDiscard = true else onClose() }
    BackHandler(enabled = dirty) { close() }
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Space.xxs).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BackButton(close, close = true)
            Text(title, style = EimirType.title, modifier = Modifier.weight(1f).semantics { heading() })
        }
        ReadingColumn(Modifier.weight(1f)) { gutter ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = gutter, vertical = Space.sm),
                verticalArrangement = Arrangement.spacedBy(Space.md),
                content = content,
            )
        }
        Column(Modifier.fillMaxWidth().background(Eimir.colors.headerSurface).navigationBarsPadding().imePadding()) {
            HorizontalDivider(color = Eimir.colors.borderSubtle)
            if (error != null) {
                Text(
                    error.message(),
                    style = EimirType.bodySmall,
                    color = Eimir.colors.error,
                    modifier = Modifier.padding(horizontal = Space.lg, vertical = Space.xs).semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            Row(Modifier.padding(horizontal = Space.lg, vertical = Space.sm)) {
                Spacer(Modifier.weight(1f))
                PrimaryButton(saveLabel, onSave, pending = saving, enabled = saveEnabled)
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
                    onClose()
                }) { Text(stringResource(R.string.action_discard), color = Eimir.colors.error) }
            },
            dismissButton = { TextButton(onClick = { confirmDiscard = false }) { Text(stringResource(R.string.action_keep_editing)) } },
        )
    }
}

/** Native Material date picker; the domain date has no time zone, so UTC midnight is the carrier. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerSheet(initial: LocalDate?, onDismiss: () -> Unit, onPick: (LocalDate) -> Unit) {
    val state = rememberDatePickerState(
        initialSelectedDateMillis = (initial ?: Dates.today()).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                onDismiss()
            }) { Text(stringResource(R.string.action_done)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    ) { DatePicker(state) }
}

/** Confirmation for an irreversible delete; the consequence is stated before confirming. */
@Composable
fun ConfirmDelete(title: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(stringResource(R.string.delete_confirm_body)) },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onConfirm()
            }) { Text(stringResource(R.string.action_delete), color = Eimir.colors.error) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } },
    )
}
