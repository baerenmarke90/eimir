package de.eimir.app.story

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.eimir.app.design.EimirDisplayFamily
import de.eimir.app.design.EimirTheme
import de.eimir.app.design.VisibilityBadge
import de.eimir.app.reference.R
import java.time.LocalDate
import java.util.UUID
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import eimir.api.models.StoryItem

/** Keeps a long title readable rather than letting it run the window's width. */
private val ReadingMeasure: Dp = 560.dp

/**
 * The shared history.
 *
 * Entries are grouped under the day they belong to, in the order the server
 * gave them. Memories, Milestones and HeartMoments sit in one stream because
 * that is how a couple lived them; the kind is named on the entry rather than
 * splitting the history into three lists.
 */
@Composable
fun StoryScreen(
    items: List<StoryItem>,
    imageStore: StoryImageStore,
    generation: Long,
    modifier: Modifier = Modifier,
    /** Opens one entry. Every kind now has a screen of its own. */
    onOpenMemory: ((UUID) -> Unit)? = null,
    onOpenMilestone: ((UUID) -> Unit)? = null,
    onOpenHeartMoment: ((UUID) -> Unit)? = null,
    /** Null where there is no more Story to load. */
    onLoadMore: (() -> Unit)? = null,
    loadingMore: Boolean = false,
    /** Non-null only while [items] is a stale M2-D18 cache fallback. */
    cachedAt: java.time.Instant? = null,
    listState: LazyListState = rememberLazyListState(),
    scope: TimelineScope = TimelineScope(),
    loaded: Boolean = true,
    loading: Boolean = false,
    problem: de.eimir.app.shell.UiProblem? = null,
    onRetry: (() -> Unit)? = null,
    header: (@Composable () -> Unit)? = null,
) {
    val days = items.toStoryDays()

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxWidth().testTag("timeline-scroll"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            EimirTheme.spacing.pageMargin,
        ),
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step6),
    ) {
        header?.let { item(key = "header") { it() } }

        cachedAt?.let { item(key = "cached-banner") { de.eimir.app.shell.CachedContentBanner(it) } }

        if (loading) item(key = "loading") { Text(stringResource(R.string.story_loading), color = EimirTheme.colors.textSecondary) }
        problem?.let { current -> item(key = "problem") { de.eimir.app.shell.UiStatePanel(current, onRetry = onRetry) } }
        if (days.isEmpty() && loaded && !loading && problem == null) {
            item(key = "empty") {
                if (scope.isDefault) StoryEmpty()
                else Text(stringResource(R.string.timeline_no_match), color = EimirTheme.colors.textPrimary)
            }
        }

        for (day in days) {
            item(key = "day-${day.date}") { DayHeading(day.date) }
            items(
                count = day.entries.size,
                key = { index -> day.entries[index].id.toString() },
            ) { index ->
                val entry = day.entries[index]
                StoryEntryCard(
                    entry = entry,
                    imageStore = imageStore,
                    generation = generation,
                    onOpen = when (entry.kind) {
                        StoryEntryKind.MEMORY -> onOpenMemory
                        StoryEntryKind.MILESTONE -> onOpenMilestone
                        StoryEntryKind.HEART_MOMENT -> onOpenHeartMoment
                    }?.let { open -> { open(entry.id) } },
                )
            }
        }

        // A Story that simply stopped after one page would lose history with
        // nothing on screen to say so.
        onLoadMore?.let { more ->
            item(key = "load-more") {
                TextButton(colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText), onClick = more, enabled = !loadingMore) {
                    Text(
                        stringResource(
                            if (loadingMore) R.string.load_more_busy else R.string.load_more,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun DayHeading(date: LocalDate) {
    // Read from the composition rather than from the process: the date has to
    // be rewritten when the device language changes, not at next launch.
    val locale: Locale = LocalConfiguration.current.locales[0]
    Text(
        text = date.format(
            DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale),
        ),
        style = EimirTheme.typography.titleSmall.copy(
            fontFamily = EimirDisplayFamily,
            fontWeight = FontWeight.SemiBold,
        ),
        color = EimirTheme.colors.linkText,
        modifier = Modifier
            .padding(top = EimirTheme.spacing.step2)
            .semantics { heading() },
    )
}

@Composable
private fun StoryEntryCard(
    entry: StoryEntry,
    imageStore: StoryImageStore,
    generation: Long,
    onOpen: (() -> Unit)? = null,
) {
    when (entry.kind) {
        StoryEntryKind.MEMORY -> MemoryCard(
            entry = entry,
            imageStore = imageStore,
            generation = generation,
            onOpen = onOpen,
        )
        StoryEntryKind.MILESTONE -> MilestoneCard(
            entry = entry,
            onOpen = onOpen,
        )
        StoryEntryKind.HEART_MOMENT -> HeartMomentCard(
            entry = entry,
            imageStore = imageStore,
            generation = generation,
            onOpen = onOpen,
        )
    }
}

@Composable
private fun MemoryCard(
    entry: StoryEntry,
    imageStore: StoryImageStore,
    generation: Long,
    onOpen: (() -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(EimirTheme.radii.card),
        color = EimirTheme.colors.surface,
        border = BorderStroke(1.dp, EimirTheme.colors.borderSubtle),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("story-memory-${entry.id}")
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(entry.kind.labelRes()),
                    style = MaterialTheme.typography.labelSmall,
                    color = EimirTheme.colors.shared,
                )
                VisibilityBadge(isShared = true)
            }

            Text(
                text = entry.text,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontWeight = FontWeight.SemiBold,
                ),
                color = EimirTheme.colors.textPrimary,
                // A long title wraps rather than being cut: the words are the
                // record, and truncation would hide part of it for good.
                modifier = Modifier.widthIn(max = ReadingMeasure),
            )

            Text(
                text = stringResource(R.string.story_by_author, entry.presentedAuthorName()),
                style = MaterialTheme.typography.bodySmall,
                color = EimirTheme.colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            if (entry.images.isNotEmpty()) {
                val primaryImage = entry.images.first()
                val additionalImages = entry.images.drop(1).take(MAX_IMAGES_PER_ENTRY - 1)

                StoryImage(
                    image = primaryImage,
                    store = imageStore,
                    generation = generation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 10f)
                        .clip(RoundedCornerShape(EimirTheme.radii.card)),
                )

                if (additionalImages.isNotEmpty()) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(
                            EimirTheme.spacing.step2,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        for (image in additionalImages) {
                            StoryImage(
                                image = image,
                                store = imageStore,
                                generation = generation,
                                modifier = Modifier
                                    .weight(1f)
                                    .aspectRatio(1f)
                                    .clip(RoundedCornerShape(EimirTheme.radii.card)),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MilestoneCard(
    entry: StoryEntry,
    onOpen: (() -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(EimirTheme.radii.card),
        color = EimirTheme.colors.surface,
        border = BorderStroke(1.dp, EimirTheme.colors.discovery.copy(alpha = 0.35f)),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(entry.kind.labelRes()),
                    style = MaterialTheme.typography.labelSmall,
                    color = EimirTheme.colors.discovery,
                )
                VisibilityBadge(isShared = true)
            }

            Text(
                text = entry.text,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontWeight = FontWeight.SemiBold,
                ),
                color = EimirTheme.colors.textPrimary,
                modifier = Modifier.widthIn(max = ReadingMeasure),
            )

            Text(
                text = stringResource(R.string.story_by_author, entry.presentedAuthorName()),
                style = MaterialTheme.typography.bodySmall,
                color = EimirTheme.colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun HeartMomentCard(
    entry: StoryEntry,
    imageStore: StoryImageStore,
    generation: Long,
    onOpen: (() -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(EimirTheme.radii.card),
        color = EimirTheme.colors.brandSurface,
        border = BorderStroke(1.dp, EimirTheme.colors.brand.copy(alpha = 0.25f)),
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "♥",
                        color = EimirTheme.colors.brand,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(entry.kind.labelRes()),
                        style = MaterialTheme.typography.labelSmall,
                        color = EimirTheme.colors.brandStrong,
                    )
                }
                VisibilityBadge(isShared = true)
            }

            Text(
                text = entry.text,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontStyle = FontStyle.Italic,
                ),
                color = EimirTheme.colors.textPrimary,
                modifier = Modifier.widthIn(max = ReadingMeasure),
            )

            Text(
                text = stringResource(R.string.story_by_author, entry.presentedAuthorName()),
                style = MaterialTheme.typography.bodySmall,
                color = EimirTheme.colors.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            if (entry.images.isNotEmpty()) {
                StoryImage(
                    image = entry.images[0],
                    store = imageStore,
                    generation = generation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 10f)
                        .clip(RoundedCornerShape(EimirTheme.radii.card)),
                )
            }
        }
    }
}

@Composable
private fun StoryEmpty() {
    Column(
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
        modifier = Modifier.widthIn(max = ReadingMeasure),
    ) {
        Text(
            text = stringResource(R.string.story_empty_title),
            style = MaterialTheme.typography.titleMedium,
            color = EimirTheme.colors.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.story_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = EimirTheme.colors.textSecondary,
        )
    }
}

/**
 * A row shows at most this many photographs side by side before each becomes
 * too small to recognise. The rest belong to the Memory's own screen.
 */
private const val MAX_IMAGES_PER_ENTRY = 3

@Composable
private fun StoryEntry.presentedAuthorName(): String =
    if (authorIsFormerMember) stringResource(R.string.author_former_member) else authorName

private fun StoryEntryKind.labelRes(): Int = when (this) {
    StoryEntryKind.MEMORY -> R.string.story_kind_memory
    StoryEntryKind.MILESTONE -> R.string.story_kind_milestone
    StoryEntryKind.HEART_MOMENT -> R.string.story_kind_heart_moment
}

@Composable
private fun StoryEntryKind.accent() = when (this) {
    StoryEntryKind.MEMORY -> EimirTheme.colors.shared
    StoryEntryKind.MILESTONE -> EimirTheme.colors.discovery
    StoryEntryKind.HEART_MOMENT -> EimirTheme.colors.brand
}
