package de.eimir.app.story

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import de.eimir.app.design.EimirTheme
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.reference.R
import de.eimir.app.shell.ShortTaskSheet

@Composable
fun TimelineScopeControls(scope: TimelineScope, availableYears: List<Int>, onApply: (TimelineScope) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var restoreFocus by remember { mutableStateOf(false) }
    val trigger = remember { FocusRequester() }
    LaunchedEffect(open, restoreFocus) {
        if (!open && restoreFocus) { trigger.requestFocus(); restoreFocus = false }
    }
    val dismiss = { open = false; restoreFocus = true }
    Column(verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2)) {
        Text(stringResource(R.string.timeline_filter_scope,
            scope.year?.toString() ?: stringResource(R.string.timeline_filter_all_years), kindLabel(scope.kind)),
            color = EimirTheme.colors.textSecondary, modifier = Modifier.testTag("timeline-applied-scope"))
        // The default newest-first ordering stays quiet, but once a person deliberately
        // applies the alternate order it remains visible without reopening the sheet.
        // This completes R2's "visible current scope" contract for year / type / order.
        if (scope.order != StoryOrder.NEWEST_FIRST) {
            Text(
                orderLabel(scope.order),
                color = EimirTheme.colors.textSecondary,
                modifier = Modifier.testTag("timeline-applied-order"),
            )
        }
        TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { open = true }, modifier = Modifier.focusRequester(trigger)
            .heightIn(min = MinimumTouchTarget).testTag("timeline-filter")) {
            Text(stringResource(R.string.timeline_filter))
        }
        if (!scope.isDefault) TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { onApply(TimelineScope()) }, modifier = Modifier.heightIn(min = MinimumTouchTarget)) {
            Text(stringResource(R.string.timeline_filter_reset))
        }
    }
    if (open) {
        var draft by remember { mutableStateOf(scope) }
        var yearMenu by remember { mutableStateOf(false) }
        ShortTaskSheet(stringResource(R.string.timeline_filter), dismiss) {
            Text(stringResource(R.string.timeline_filter_year), color = EimirTheme.colors.textPrimary)
            Column {
                TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = { yearMenu = true }, modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("timeline-year")) {
                    Text(draft.year?.toString() ?: stringResource(R.string.timeline_filter_all_years))
                }
                DropdownMenu(expanded = yearMenu, onDismissRequest = { yearMenu = false }) {
                    DropdownMenuItem(text = { Text(stringResource(R.string.timeline_filter_all_years)) },
                        onClick = { draft = draft.copy(year = null); yearMenu = false })
                    (availableYears + listOfNotNull(scope.year)).distinct().sortedDescending().forEach { year ->
                        DropdownMenuItem(text = { Text(year.toString()) }, onClick = { draft = draft.copy(year = year); yearMenu = false })
                    }
                }
            }
            Text(stringResource(R.string.timeline_filter_kind), color = EimirTheme.colors.textPrimary)
            Column(Modifier.selectableGroup()) {
                (listOf(null) + StoryEntryKind.entries).forEach { kind ->
                    Row(Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)
                        .selectable(selected = draft.kind == kind, role = Role.RadioButton, onClick = { draft = draft.copy(kind = kind) }),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2)) {
                        RadioButton(selected = draft.kind == kind, onClick = null,
                            colors = RadioButtonDefaults.colors(selectedColor = EimirTheme.colors.linkText))
                        Text(kindLabel(kind), color = EimirTheme.colors.textPrimary)
                    }
                }
            }
            Text(stringResource(R.string.timeline_filter_order), color = EimirTheme.colors.textPrimary)
            Column(Modifier.selectableGroup()) {
                StoryOrder.entries.forEach { order ->
                    Row(Modifier.fillMaxWidth().heightIn(min = MinimumTouchTarget)
                        .selectable(selected = draft.order == order, role = Role.RadioButton, onClick = { draft = draft.copy(order = order) })
                        .testTag(if (order == StoryOrder.OLDEST_FIRST) "timeline-order-oldest" else "timeline-order-newest"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2)) {
                        RadioButton(selected = draft.order == order, onClick = null,
                            colors = RadioButtonDefaults.colors(selectedColor = EimirTheme.colors.linkText))
                        Text(orderLabel(order), color = EimirTheme.colors.textPrimary)
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
            ) {
                TextButton(
                    colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.textSecondary),
                    onClick = dismiss,
                    modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("timeline-cancel"),
                ) {
                    Text(stringResource(R.string.timeline_filter_cancel))
                }
                Button(onClick = { onApply(draft); dismiss() }, modifier = Modifier.weight(1f).heightIn(min = MinimumTouchTarget).testTag("timeline-apply")) {
                    Text(stringResource(R.string.timeline_filter_apply))
                }
            }
        }
    }
}

@Composable
private fun orderLabel(order: StoryOrder): String = stringResource(
    if (order == StoryOrder.OLDEST_FIRST) R.string.timeline_filter_order_oldest else R.string.timeline_filter_order_newest,
)

@Composable
private fun kindLabel(kind: StoryEntryKind?): String = stringResource(when (kind) {
    StoryEntryKind.MEMORY -> R.string.story_kind_memory
    StoryEntryKind.MILESTONE -> R.string.story_kind_milestone
    StoryEntryKind.HEART_MOMENT -> R.string.story_kind_heart_moment
    null -> R.string.timeline_filter_all_kinds
})
