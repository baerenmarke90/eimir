package de.eimir.nativetest.ui.story

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import de.eimir.nativetest.R
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.MediaRef
import de.eimir.nativetest.ui.common.SensitiveReveals
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.AuthorSummary
import eimir.api.models.HeartEmotion
import eimir.api.models.MemoryAttachmentSummary
import eimir.api.models.StoryItem

/** Preview aspect ratio: keep the photo's shape within album-friendly bounds. */
internal fun previewRatio(width: Int?, height: Int?): Float {
    if (width == null || height == null || width <= 0 || height <= 0) return 4f / 3f
    return (width.toFloat() / height).coerceIn(4f / 5f, 16f / 9f)
}

internal fun MemoryAttachmentSummary.toRef(memoryId: java.util.UUID) = MediaRef(
    attachmentId = id,
    parent = MediaParent.MEMORY,
    parentId = memoryId,
    isSensitive = isSensitive,
    hasThumbnail = hasThumbnail,
    width = width,
    height = height,
)

@Composable
fun authorName(author: AuthorSummary): String =
    if (author.isFormerMember == true) stringResource(R.string.story_former_member) else author.displayName

@Composable
fun emotionLabel(emotion: HeartEmotion): String = stringResource(
    when (emotion) {
        HeartEmotion.LOVED -> R.string.emotion_loved
        HeartEmotion.SEEN -> R.string.emotion_seen
        HeartEmotion.APPRECIATED -> R.string.emotion_appreciated
        HeartEmotion.SUPPORTED -> R.string.emotion_supported
        HeartEmotion.GRATEFUL -> R.string.emotion_grateful
        HeartEmotion.HAPPY -> R.string.emotion_happy
    },
)

/**
 * One Timeline entry in its natural shape (R2): photo with caption, short
 * thought with editorial emphasis, compact milestone event. No uniform card
 * wall; only heart moments get a tinted surface because they are a distinct,
 * emotionally emphasised unit.
 */
@Composable
fun StoryEntry(item: StoryItem, reveals: SensitiveReveals, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    when (item) {
        is StoryItem.MemoryWrapper -> MemoryEntry(item, reveals, onOpen, modifier)
        is StoryItem.HeartMomentWrapper -> HeartEntry(item, reveals, onOpen, modifier)
        is StoryItem.MilestoneWrapper -> MilestoneEntry(item, onOpen, modifier)
    }
}

@Composable
private fun MemoryEntry(item: StoryItem.MemoryWrapper, reveals: SensitiveReveals, onOpen: () -> Unit, modifier: Modifier) {
    val memory = item.value.memory
    val locale = currentLocale()
    val photos = memory.attachments.sortedBy { it.position }
    Column(
        modifier
            .fillMaxWidth()
            .clip(Radii.card)
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(vertical = Space.sm),
    ) {
        val lead = photos.firstOrNull()
        if (lead != null) {
            Box {
                AttachmentPhoto(
                    ref = lead.toRef(memory.id),
                    reveals = reveals,
                    contentDescription = memory.title.ifBlank { null },
                    modifier = Modifier.fillMaxWidth().aspectRatio(previewRatio(lead.width, lead.height)).clip(Radii.card),
                )
                if (photos.size > 1) {
                    Surface(
                        shape = Radii.pill,
                        color = Eimir.colors.scrim.copy(alpha = 0.55f),
                        modifier = Modifier.align(Alignment.BottomEnd).padding(Space.sm),
                    ) {
                        Text(
                            stringResource(R.string.story_photo_count, photos.size),
                            style = EimirType.meta,
                            color = Eimir.colors.onAccent,
                            modifier = Modifier.padding(horizontal = Space.xs, vertical = 2.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.height(Space.xs))
        }
        if (memory.title.isNotBlank()) {
            Text(
                memory.title,
                style = if (lead == null) EimirType.editorial else EimirType.editorialSmall,
                color = Eimir.colors.textPrimary,
                maxLines = if (lead == null) 4 else 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            Dates.long(item.value.effectiveDate, locale) + " · " + authorName(memory.author),
            style = EimirType.meta,
            color = Eimir.colors.textSecondary,
        )
    }
}

@Composable
private fun HeartEntry(item: StoryItem.HeartMomentWrapper, reveals: SensitiveReveals, onOpen: () -> Unit, modifier: Modifier) {
    val heart = item.value.heartMoment
    Surface(
        onClick = onOpen,
        shape = Radii.card,
        color = Eimir.colors.pageTintBrand,
        modifier = modifier.fillMaxWidth().padding(vertical = Space.xs),
    ) {
        Column(Modifier.padding(Space.md), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                EimirIcon(EimirIcons.Moments, size = 20.dp)
                Spacer(Modifier.width(Space.xs))
                Text(
                    stringResource(R.string.story_heart_label) + " · " + emotionLabel(heart.emotion),
                    style = EimirType.label,
                    color = Eimir.colors.private,
                )
            }
            heart.attachment?.let { photo ->
                AttachmentPhoto(
                    ref = MediaRef(photo.id, MediaParent.HEART_MOMENT, heart.id, photo.isSensitive, photo.hasThumbnail, photo.width, photo.height),
                    reveals = reveals,
                    modifier = Modifier.fillMaxWidth().aspectRatio(previewRatio(photo.width, photo.height)).clip(Radii.large),
                )
            }
            if (heart.text.isNotBlank()) {
                Text(heart.text, style = EimirType.editorialSmall, color = Eimir.colors.textPrimary, maxLines = 5, overflow = TextOverflow.Ellipsis)
            }
            Text(
                Dates.long(item.value.effectiveDate, currentLocale()) + " · " + authorName(heart.author),
                style = EimirType.meta,
                color = Eimir.colors.textSecondary,
            )
        }
    }
}

@Composable
private fun MilestoneEntry(item: StoryItem.MilestoneWrapper, onOpen: () -> Unit, modifier: Modifier) {
    val milestone = item.value.milestone
    Row(
        modifier
            .fillMaxWidth()
            .clip(Radii.medium)
            .clickable(role = Role.Button, onClick = onOpen)
            .heightIn(min = 56.dp)
            .padding(vertical = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(40.dp).clip(Radii.pill).background(Eimir.colors.discoverySurface),
            contentAlignment = Alignment.Center,
        ) { EimirIcon(EimirIcons.Milestones, size = 22.dp, tint = Eimir.colors.discovery) }
        Column(Modifier.padding(start = Space.sm)) {
            Text(stringResource(R.string.story_milestone_label), style = EimirType.meta, color = Eimir.colors.discovery)
            Text(milestone.title, style = EimirType.title, color = Eimir.colors.textPrimary)
            Text(Dates.long(item.value.effectiveDate, currentLocale()), style = EimirType.meta, color = Eimir.colors.textSecondary)
        }
    }
}
