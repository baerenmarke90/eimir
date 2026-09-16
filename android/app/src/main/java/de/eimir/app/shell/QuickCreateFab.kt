package de.eimir.app.shell

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.design.EimirTheme
import de.eimir.app.reference.R

/** The global choice sheet enters the selected task without refocusing an obsolete trigger. */
@Composable
fun QuickCreateFab(
    onCreateMemory: () -> Unit,
    onCreateHeartMoment: () -> Unit,
    onCreateMilestone: () -> Unit,
    onCreatePrivateNote: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    var restoreFocus by remember { mutableStateOf(false) }
    val triggerFocus = remember { FocusRequester() }
    LaunchedEffect(open, restoreFocus) {
        if (!open && restoreFocus) {
            triggerFocus.requestFocus()
            restoreFocus = false
        }
    }
    val cancel = { restoreFocus = true; open = false }

    val triggerLabel = stringResource(R.string.quick_create_trigger)
    FloatingActionButton(
        onClick = { open = true },
        modifier = modifier.focusRequester(triggerFocus).testTag("quick-create-trigger").semantics { contentDescription = triggerLabel },
    ) {
        PlusGlyph(tint = MaterialTheme.colorScheme.onPrimaryContainer)
    }

    if (open) {
        ShortTaskSheet(title = triggerLabel, onDismiss = cancel) {
            Column(
                modifier = Modifier.fillMaxWidth(),
            ) {
                QuickCreateGroupLabel(R.string.quick_create_shared_group)
                QuickCreateItem(R.string.quick_create_memory) {
                    open = false
                    onCreateMemory()
                }
                QuickCreateItem(R.string.quick_create_heart_moment) {
                    open = false
                    onCreateHeartMoment()
                }
                QuickCreateItem(R.string.quick_create_milestone) {
                    open = false
                    onCreateMilestone()
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = EimirTheme.spacing.step3))

                QuickCreateGroupLabel(R.string.quick_create_private_group)
                QuickCreateItem(R.string.quick_create_private_note) {
                    open = false
                    onCreatePrivateNote()
                }
            }
        }
    }
}

/**
 * A plus sign, drawn rather than pulled from an icon dependency — the same
 * reasoning [DestinationGlyph] already gives for the destination icons, and
 * the same shape Web's own `DestinationIcon` "add" case draws.
 */
@Composable
private fun PlusGlyph(tint: Color) {
    Canvas(modifier = Modifier.size(24.dp)) {
        val stroke = Stroke(width = this.size.minDimension * 0.08f)
        drawLine(
            color = tint,
            start = Offset(size.width / 2f, size.height * 0.2f),
            end = Offset(size.width / 2f, size.height * 0.8f),
            strokeWidth = stroke.width,
        )
        drawLine(
            color = tint,
            start = Offset(size.width * 0.2f, size.height / 2f),
            end = Offset(size.width * 0.8f, size.height / 2f),
            strokeWidth = stroke.width,
        )
    }
}

@Composable
private fun QuickCreateGroupLabel(labelRes: Int) {
    Text(
        text = stringResource(labelRes),
        style = MaterialTheme.typography.labelLarge,
        color = EimirTheme.colors.textSecondary,
        modifier = Modifier.padding(bottom = EimirTheme.spacing.step2),
    )
}

@Composable
private fun QuickCreateItem(labelRes: Int, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = MinimumTouchTarget),
        color = EimirTheme.colors.surface,
    ) {
        Text(
            text = stringResource(labelRes),
            style = MaterialTheme.typography.bodyLarge,
            color = EimirTheme.colors.textPrimary,
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
        )
    }
}
