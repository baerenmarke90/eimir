package de.eimir.app.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import de.eimir.app.design.EimirTheme
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.reference.R

/** Platform modality owns the inactive background, focus containment and innermost Back. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShortTaskSheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val initialFocus = remember { FocusRequester() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = EimirTheme.colors.surfaceRaised,
        contentColor = EimirTheme.colors.textPrimary,
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = EimirTheme.spacing.pageMargin)
                .padding(bottom = EimirTheme.spacing.step6).imePadding(),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Text(title, style = EimirTheme.contentTypography.sectionHeading,
                color = EimirTheme.colors.textPrimary, modifier = Modifier.semantics { heading() })
            TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = onDismiss,
                modifier = Modifier.focusRequester(initialFocus).heightIn(min = MinimumTouchTarget).testTag("task-sheet-close")) {
                Text(stringResource(R.string.task_sheet_close))
            }
            content()
        }
        LaunchedEffect(Unit) { initialFocus.requestFocus() }
    }
}
