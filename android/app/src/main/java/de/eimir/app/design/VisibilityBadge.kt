package de.eimir.app.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.eimir.app.reference.R

enum class VisibilityBadgeType {
    SHARED,
    PRIVATE,
    TEMPORARY,
}

/**
 * Explicit visual badge for relationship privacy and access scope.
 *
 * Renders custom vector iconography for shared, private, and temporary states
 * without relying on system emoji fonts.
 */
@Composable
fun VisibilityBadge(
    isShared: Boolean,
    modifier: Modifier = Modifier,
    customLabel: String? = null,
    showLabel: Boolean = true,
) {
    val badgeType = if (isShared) VisibilityBadgeType.SHARED else VisibilityBadgeType.PRIVATE
    VisibilityBadge(
        type = badgeType,
        modifier = modifier,
        customLabel = customLabel,
        showLabel = showLabel,
    )
}

@Composable
fun VisibilityBadge(
    type: VisibilityBadgeType,
    modifier: Modifier = Modifier,
    customLabel: String? = null,
    showLabel: Boolean = true,
) {
    val label = customLabel ?: when (type) {
        VisibilityBadgeType.SHARED -> stringResource(R.string.relationship_visibility_shared)
        VisibilityBadgeType.PRIVATE -> stringResource(R.string.relationship_visibility_private)
        VisibilityBadgeType.TEMPORARY -> stringResource(R.string.relationship_visibility_temporary)
    }

    val (bgColor, textColor, borderColor) = when (type) {
        VisibilityBadgeType.SHARED -> Triple(
            EimirTheme.colors.sharedSurface,
            EimirTheme.colors.shared,
            EimirTheme.colors.shared,
        )
        VisibilityBadgeType.PRIVATE -> Triple(
            EimirTheme.colors.brandSurface,
            EimirTheme.colors.private,
            EimirTheme.colors.private,
        )
        VisibilityBadgeType.TEMPORARY -> Triple(
            EimirTheme.colors.discoverySurface,
            EimirTheme.colors.discovery,
            EimirTheme.colors.discovery,
        )
    }

    Box(
        modifier = modifier
            .clip(CircleShape)
            .background(bgColor)
            .border(1.dp, borderColor, CircleShape)
            .semantics { contentDescription = label }
            .padding(horizontal = if (showLabel) 8.dp else 6.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            VisibilityGlyph(
                type = type,
                color = textColor,
                modifier = Modifier.size(14.dp),
            )

            if (showLabel) {
                Spacer(modifier = Modifier.width(5.dp))
                Text(
                    text = label,
                    color = textColor,
                    style = EimirTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

/**
 * The bare visibility symbol without the pill, for compact metadata rows
 * where a full badge would compete with the content. It carries no semantics
 * of its own; the caller names it.
 */
@Composable
fun VisibilityGlyph(
    type: VisibilityBadgeType,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val stroke = (w * 0.12f).coerceAtLeast(1.5f)

        when (type) {
            VisibilityBadgeType.SHARED -> {
                // Two interlocking rings
                val r = w * 0.28f
                val cy = h / 2f
                val offset = r * 0.65f
                drawCircle(
                    color = color,
                    radius = r,
                    center = Offset(w / 2f - offset, cy),
                    style = Stroke(width = stroke),
                )
                drawCircle(
                    color = color,
                    radius = r,
                    center = Offset(w / 2f + offset, cy),
                    style = Stroke(width = stroke),
                )
            }
            VisibilityBadgeType.PRIVATE -> {
                // Padlock body + shackle
                val bodyW = w * 0.7f
                val bodyH = h * 0.5f
                val bodyX = (w - bodyW) / 2f
                val bodyY = h * 0.45f
                drawRoundRect(
                    color = color,
                    topLeft = Offset(bodyX, bodyY),
                    size = Size(bodyW, bodyH),
                    cornerRadius = CornerRadius(2.dp.toPx()),
                    style = Stroke(width = stroke),
                )
                // Shackle
                val shackleR = w * 0.22f
                drawArc(
                    color = color,
                    startAngle = 180f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(w / 2f - shackleR, h * 0.15f),
                    size = Size(shackleR * 2, shackleR * 2),
                    style = Stroke(width = stroke),
                )
            }
            VisibilityBadgeType.TEMPORARY -> {
                // Clock circle + hands
                val r = w * 0.42f
                drawCircle(
                    color = color,
                    radius = r,
                    center = Offset(w / 2f, h / 2f),
                    style = Stroke(width = stroke),
                )
                // Hour hand
                drawLine(
                    color = color,
                    start = Offset(w / 2f, h / 2f),
                    end = Offset(w / 2f, h * 0.28f),
                    strokeWidth = stroke,
                )
                // Minute hand
                drawLine(
                    color = color,
                    start = Offset(w / 2f, h / 2f),
                    end = Offset(w * 0.72f, h / 2f),
                    strokeWidth = stroke,
                )
            }
        }
    }
}
