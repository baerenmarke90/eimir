package de.eimir.nativetest.ui.common

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.eimir.nativetest.R
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space

/** Localized, non-technical message for a failure category. */
@Composable
fun AppError.message(): String = stringResource(
    when (this) {
        AppError.Offline -> R.string.error_offline
        AppError.SessionEnded -> R.string.error_session_ended
        AppError.Unavailable -> R.string.error_unavailable
        AppError.Conflict -> R.string.error_conflict
        AppError.PremiumRequired -> R.string.error_premium
        AppError.RateLimited -> R.string.error_rate_limited
        AppError.Maintenance -> R.string.error_maintenance
        AppError.Invalid -> R.string.error_invalid
        AppError.Server -> R.string.error_server
        AppError.Unexpected -> R.string.error_unexpected
    },
)

/** Centered state for loading failures with an explicit recovery action. */
@Composable
fun StateMessage(
    title: String,
    modifier: Modifier = Modifier,
    body: String? = null,
    icon: EimirIcons? = null,
    action: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Space.xl, vertical = Space.xxxl)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Space.sm),
    ) {
        if (icon != null) EimirIcon(icon, size = 40.dp, tint = Eimir.colors.textSecondary)
        Text(title, style = EimirType.editorialSmall, color = Eimir.colors.textPrimary, textAlign = TextAlign.Center)
        if (body != null) {
            Text(body, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, textAlign = TextAlign.Center)
        }
        if (action != null && onAction != null) {
            Spacer(Modifier.height(Space.xs))
            SecondaryButton(action, onAction)
        }
    }
}

@Composable
fun ErrorState(error: AppError, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    StateMessage(
        title = error.message(),
        modifier = modifier,
        icon = if (error == AppError.Offline) null else EimirIcons.Help,
        action = stringResource(R.string.action_retry),
        onAction = onRetry,
    )
}

/** Quiet banner that keeps cached content visible while explaining a failed refresh. */
@Composable
fun StaleBanner(error: AppError, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = if (error == AppError.Offline) Eimir.colors.warningSurface else Eimir.colors.errorSurface,
        shape = Radii.medium,
    ) {
        Row(
            Modifier.padding(start = Space.md, end = Space.xs).heightIn(min = Space.touchTarget),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (error == AppError.Offline) {
                Icon(Icons.Rounded.CloudOff, null, tint = Eimir.colors.warning, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.xs))
            }
            Text(
                stringResource(R.string.state_stale, error.message()),
                style = EimirType.bodySmall,
                color = Eimir.colors.textPrimary,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry)) }
        }
    }
}

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    pending: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !pending,
        modifier = modifier.heightIn(min = Space.touchTarget),
        shape = Radii.pill,
        colors = ButtonDefaults.buttonColors(containerColor = Eimir.colors.brandStrong, contentColor = Eimir.colors.onAccent),
        contentPadding = PaddingValues(horizontal = Space.xl, vertical = Space.sm),
    ) {
        if (pending) {
            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Eimir.colors.onAccent)
            Spacer(Modifier.width(Space.xs))
        }
        Text(text, style = EimirType.label)
    }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Surface(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.heightIn(min = Space.touchTarget),
        shape = Radii.pill,
        color = Eimir.colors.surfaceRaised,
        border = androidx.compose.foundation.BorderStroke(1.dp, Eimir.colors.border),
    ) {
        Box(Modifier.padding(horizontal = Space.lg, vertical = Space.sm), contentAlignment = Alignment.Center) {
            Text(text, style = EimirType.label, color = if (enabled) Eimir.colors.textPrimary else Eimir.colors.textMuted)
        }
    }
}

/** Section title inside a page: quiet utility text, not a card header. */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(top = Space.lg, bottom = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            style = EimirType.label,
            color = Eimir.colors.textSecondary,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing?.invoke()
    }
}

@Composable
fun BackButton(onBack: () -> Unit, close: Boolean = false) {
    IconButton(onClick = onBack) {
        Icon(
            if (close) Icons.Rounded.Close else Icons.AutoMirrored.Rounded.ArrowBack,
            contentDescription = stringResource(if (close) R.string.action_close else R.string.action_back),
            tint = Eimir.colors.textPrimary,
        )
    }
}

/** Loading placeholder with the size of the content it stands in for, so nothing shifts on arrival. */
@Composable
fun Skeleton(modifier: Modifier = Modifier, shape: Shape = Radii.medium) {
    val reduced = Eimir.motion.reduced
    val base = Eimir.colors.skeletonBase
    val highlight = Eimir.colors.skeletonHighlight
    val alpha = if (reduced) {
        0.7f
    } else {
        val transition = rememberInfiniteTransition(label = "skeleton")
        val value by transition.animateFloat(0.55f, 1f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "skeleton-alpha")
        value
    }
    Box(modifier.clip(shape).background(base.copy(alpha = alpha)).border(0.dp, highlight, shape))
}

@Composable
fun PageSkeleton(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(Space.lg), verticalArrangement = Arrangement.spacedBy(Space.md)) {
        Skeleton(Modifier.fillMaxWidth().height(220.dp), Radii.card)
        Skeleton(Modifier.fillMaxWidth(0.7f).height(24.dp))
        Skeleton(Modifier.fillMaxWidth(0.5f).height(16.dp))
        Skeleton(Modifier.fillMaxWidth().height(120.dp), Radii.card)
    }
}

/** Centers content and caps its width on Expanded windows (reading measure). */
@Composable
fun ReadingColumn(
    modifier: Modifier = Modifier,
    maxWidth: Dp = Space.readingMax,
    content: @Composable (gutter: Dp) -> Unit,
) {
    BoxWithConstraints(modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        val gutter = Space.gutter(this.maxWidth)
        Box(Modifier.widthIn(max = maxWidth).fillMaxWidth()) { content(gutter) }
    }
}

/** Small pill used for quiet context such as audience or status. */
@Composable
fun ContextPill(text: String, modifier: Modifier = Modifier, icon: EimirIcons? = null) {
    Row(
        modifier
            .clip(Radii.pill)
            .background(Eimir.colors.surfaceSubtle)
            .padding(horizontal = Space.sm, vertical = Space.xxs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            EimirIcon(icon, size = 14.dp, tint = Eimir.colors.textSecondary)
            Spacer(Modifier.width(Space.xxs))
        }
        Text(text, style = EimirType.meta, color = Eimir.colors.textSecondary)
    }
}

@Composable
fun Dot(modifier: Modifier = Modifier) {
    Box(modifier.size(8.dp).clip(CircleShape).background(Eimir.colors.private))
}

@Composable
fun FullScreenLoading() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Eimir.colors.brand)
    }
}
