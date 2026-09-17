package de.eimir.app.story

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import de.eimir.app.design.EimirTheme
import de.eimir.app.design.VisibilityBadgeType
import de.eimir.app.design.VisibilityGlyph
import de.eimir.app.profile.personInitials
import de.eimir.app.reference.R
import kotlin.math.cos
import kotlin.math.sin

/**
 * The Timeline card's secondary information (#969): who wrote it, whether it
 * is shared and how many photos it holds, as one quiet row after the content.
 *
 * It wraps into further rows on a narrow window or with a large font instead
 * of truncating, and every icon is named for TalkBack through the card's
 * merged semantics. Visibility is shown only where it is a per-entry choice:
 * only shared Heart Moments enter the Story, while Memories and Milestones are
 * shared by construction, so repeating it on them would be chrome.
 */
@Composable
internal fun StoryEntryMeta(
    entry: StoryEntry,
    modifier: Modifier = Modifier,
) {
    val authorName = entry.presentedAuthorName()
    FlowRow(
        modifier = modifier.testTag("story-entry-meta-${entry.id}"),
        horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step1),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            StoryAuthorMark(authorName)
            // Wraps rather than ellipsizes: a name is never cut.
            Text(
                text = authorName,
                style = MaterialTheme.typography.bodySmall,
                color = EimirTheme.colors.textSecondary,
            )
        }

        entry.visibility()?.let { visibility ->
            val label = stringResource(
                when (visibility) {
                    VisibilityBadgeType.PRIVATE -> R.string.relationship_visibility_private
                    else -> R.string.story_visibility_shared
                },
            )
            VisibilityGlyph(
                type = visibility,
                color = EimirTheme.colors.textSecondary,
                modifier = Modifier
                    .size(metaIconSize())
                    .testTag("story-entry-visibility-${entry.id}")
                    .semantics { contentDescription = label },
            )
        }

        if (entry.photoCount > 0) {
            val label = pluralStringResource(
                R.plurals.story_photo_count,
                entry.photoCount,
                entry.photoCount,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step1),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .testTag("story-entry-photos-${entry.id}")
                    .clearAndSetSemantics { contentDescription = label },
            ) {
                PhotoGlyph(
                    color = EimirTheme.colors.textSecondary,
                    modifier = Modifier.size(metaIconSize()),
                )
                Text(
                    text = entry.photoCount.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = EimirTheme.colors.textSecondary,
                )
            }
        }
    }
}

/**
 * A quiet kind marker beside a Heart Moment's or Milestone's words: a heart,
 * or a star in a ring. It differs in shape, not only colour, and names the
 * kind for TalkBack. A Memory is the default entry and has none.
 */
@Composable
internal fun StoryKindGlyph(
    kind: StoryEntryKind,
    lineHeight: TextUnit,
    modifier: Modifier = Modifier,
) {
    if (kind == StoryEntryKind.MEMORY) return
    val label = stringResource(
        if (kind == StoryEntryKind.MILESTONE) R.string.story_kind_milestone else R.string.story_kind_heart_moment,
    )
    val size = with(LocalDensity.current) { 16.sp.toDp() }
    // Centre the glyph on the first line of the text it precedes.
    val line = if (lineHeight.isSpecified) lineHeight else 22.sp
    val lineCentre = with(LocalDensity.current) { (line.toDp() - size) / 2 }
    val color = if (kind == StoryEntryKind.MILESTONE) EimirTheme.colors.discovery else EimirTheme.colors.brand
    Canvas(
        modifier = modifier
            .padding(top = lineCentre.coerceAtLeast(0.dp))
            .size(size)
            .testTag("story-kind-glyph-${kind.name.lowercase()}")
            .semantics { contentDescription = label },
    ) {
        val w = this.size.width
        val h = this.size.height
        if (kind == StoryEntryKind.MILESTONE) {
            drawCircle(color = color, radius = w * 0.44f, style = Stroke(width = w * 0.1f))
            val star = Path()
            val outer = w * 0.27f
            val inner = outer * 0.45f
            for (point in 0 until 10) {
                val radius = if (point % 2 == 0) outer else inner
                val angle = Math.toRadians(-90.0 + point * 36.0)
                val x = w / 2f + (radius * cos(angle)).toFloat()
                val y = h / 2f + (radius * sin(angle)).toFloat()
                if (point == 0) star.moveTo(x, y) else star.lineTo(x, y)
            }
            star.close()
            drawPath(star, color = color)
        } else {
            val heart = Path().apply {
                moveTo(w * 0.5f, h * 0.88f)
                cubicTo(w * 0.05f, h * 0.6f, w * 0.02f, h * 0.2f, w * 0.28f, h * 0.14f)
                cubicTo(w * 0.4f, h * 0.11f, w * 0.48f, h * 0.2f, w * 0.5f, h * 0.28f)
                cubicTo(w * 0.52f, h * 0.2f, w * 0.6f, h * 0.11f, w * 0.72f, h * 0.14f)
                cubicTo(w * 0.98f, h * 0.2f, w * 0.95f, h * 0.6f, w * 0.5f, h * 0.88f)
                close()
            }
            drawPath(heart, color = color)
        }
    }
}

/** Initials in a small circle; decorative, because the name follows it. */
@Composable
private fun StoryAuthorMark(name: String) {
    val size = with(LocalDensity.current) { 22.sp.toDp() }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(EimirTheme.colors.surfaceSubtle)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = personInitials(name),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, lineHeight = 9.sp),
            fontWeight = FontWeight.Bold,
            color = EimirTheme.colors.textPrimary,
        )
    }
}

/** A framed landscape: the same photo symbol the Web Timeline uses. */
@Composable
private fun PhotoGlyph(color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val stroke = w * 0.1f
        drawRoundRect(
            color = color,
            topLeft = Offset(w * 0.12f, h * 0.12f),
            size = Size(w * 0.76f, h * 0.76f),
            cornerRadius = CornerRadius(w * 0.1f),
            style = Stroke(width = stroke),
        )
        drawCircle(color = color, radius = w * 0.07f, center = Offset(w * 0.36f, h * 0.36f))
        val mountain = Path().apply {
            moveTo(w * 0.2f, h * 0.84f)
            lineTo(w * 0.62f, h * 0.44f)
            lineTo(w * 0.86f, h * 0.66f)
        }
        drawPath(mountain, color = color, style = Stroke(width = stroke))
    }
}

/** Scales with the font like the text beside it. */
@Composable
private fun metaIconSize(): Dp = with(LocalDensity.current) { 14.sp.toDp() }

/** Photos the card can actually show; matches the images it renders. */
private val StoryEntry.photoCount: Int get() = images.size

private fun StoryEntry.visibility(): VisibilityBadgeType? =
    if (kind == StoryEntryKind.HEART_MOMENT) VisibilityBadgeType.SHARED else null

@Composable
internal fun StoryEntry.presentedAuthorName(): String =
    if (authorIsFormerMember) stringResource(R.string.author_former_member) else authorName
