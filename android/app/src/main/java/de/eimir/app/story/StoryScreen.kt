package de.eimir.app.story

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import de.eimir.app.design.MinimumTouchTarget
import de.eimir.app.design.EimirDisplayFamily
import de.eimir.app.design.EimirTheme
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
    val months = items.toStoryDays().toStoryMonths()

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
        if (months.isEmpty() && loaded && !loading && problem == null) {
            item(key = "empty") {
                if (scope.isDefault) StoryEmpty()
                else Text(stringResource(R.string.timeline_no_match), color = EimirTheme.colors.textPrimary)
            }
        }

        for (month in months) {
            item(key = "month-${month.month}") { MonthHeading(month.month) }
            for (day in month.days) {
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
                        onOpen = entry.openCallback(onOpenMemory, onOpenMilestone, onOpenHeartMoment),
                    )
                }
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

/**
 * Discover and Timeline as real peer modes: proper tab semantics and a clear
 * selected state, not two buttons that happen to look alike. Discover keeps
 * its own independent unfiltered context regardless of what scope Timeline
 * currently has applied — switching tabs never mutates the other mode.
 */
@Composable
fun StoryViewTabs(view: StoryView, onSelect: (StoryView) -> Unit) {
    val tabs = listOf(
        StoryView.DISCOVER to R.string.momente_tab_discover,
        StoryView.TIMELINE to R.string.momente_tab_timeline,
    )
    SecondaryTabRow(selectedTabIndex = tabs.indexOfFirst { it.first == view }) {
        tabs.forEach { (tabView, labelRes) ->
            Tab(
                selected = tabView == view,
                onClick = { onSelect(tabView) },
                text = { Text(stringResource(labelRes)) },
                modifier = Modifier
                    .heightIn(min = MinimumTouchTarget)
                    .testTag(if (tabView == StoryView.DISCOVER) "momente-tab-discover" else "momente-tab-timeline"),
            )
        }
    }
}

/** A quiet continuation from Discover's bounded slice into the full Timeline. */
@Composable
fun DiscoverContinuation(onOpen: () -> Unit) {
    TextButton(
        colors = ButtonDefaults.textButtonColors(contentColor = EimirTheme.colors.linkText),
        onClick = onOpen,
        modifier = Modifier.heightIn(min = MinimumTouchTarget).testTag("momente-discover-continue"),
    ) {
        Text(stringResource(R.string.momente_discover_continue))
    }
}

/** Resolves which of the three open callbacks an entry's kind actually uses. */
private fun StoryEntry.openCallback(
    onOpenMemory: ((UUID) -> Unit)?,
    onOpenMilestone: ((UUID) -> Unit)?,
    onOpenHeartMoment: ((UUID) -> Unit)?,
): (() -> Unit)? = when (kind) {
    StoryEntryKind.MEMORY -> onOpenMemory
    StoryEntryKind.MILESTONE -> onOpenMilestone
    StoryEntryKind.HEART_MOMENT -> onOpenHeartMoment
}?.let { open -> { open(id) } }

/** Items shown below the featured pick, honestly bounded — never the whole history. */
private const val DISCOVER_BOUNDED_LIMIT = 12

/**
 * Discover as a real peer mode, not a second unfiltered Timeline: one
 * featured item (excluded below so it is never shown twice), early year
 * entrances into Timeline where the fetched page supports them, and a
 * bounded real month/day selection with an explicit continuation into the
 * full Timeline — never presented as if it were all of shared history.
 * Reuses [MonthHeading]/[DayHeading]/[StoryEntryCard]/[StoryEmpty] and the
 * existing day/month grouping rather than a new generic renderer.
 */
@Composable
fun DiscoverScreen(
    items: List<StoryItem>,
    availableYears: List<Int>,
    imageStore: StoryImageStore,
    generation: Long,
    modifier: Modifier = Modifier,
    onOpenMemory: ((UUID) -> Unit)? = null,
    onOpenMilestone: ((UUID) -> Unit)? = null,
    onOpenHeartMoment: ((UUID) -> Unit)? = null,
    onSelectYear: (Int) -> Unit = {},
    onContinueToTimeline: () -> Unit = {},
    cachedAt: java.time.Instant? = null,
    listState: LazyListState = rememberLazyListState(),
    loaded: Boolean = true,
    loading: Boolean = false,
    problem: de.eimir.app.shell.UiProblem? = null,
    onRetry: (() -> Unit)? = null,
    header: (@Composable () -> Unit)? = null,
) {
    val featured = remember(items) { items.selectFeaturedStoryItem() }
    val featuredEntry = remember(featured) { featured?.toEntry() }
    val bounded = remember(items, featured) {
        items.filter { it !== featured }.take(DISCOVER_BOUNDED_LIMIT)
    }
    val months = remember(bounded) { bounded.toStoryDays().toStoryMonths() }

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxWidth().testTag("discover-scroll"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            EimirTheme.spacing.pageMargin,
        ),
        verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step6),
    ) {
        header?.let { item(key = "header") { it() } }

        cachedAt?.let { item(key = "cached-banner") { de.eimir.app.shell.CachedContentBanner(it) } }

        if (loading) item(key = "loading") { Text(stringResource(R.string.story_loading), color = EimirTheme.colors.textSecondary) }
        problem?.let { current -> item(key = "problem") { de.eimir.app.shell.UiStatePanel(current, onRetry = onRetry) } }

        if (items.isEmpty() && loaded && !loading && problem == null) {
            item(key = "empty") { StoryEmpty() }
        } else {
            featuredEntry?.let { entry ->
                item(key = "featured") {
                    DiscoverFeatured(
                        entry = entry,
                        imageStore = imageStore,
                        generation = generation,
                        onOpen = entry.openCallback(onOpenMemory, onOpenMilestone, onOpenHeartMoment),
                    )
                }
            }

            if (availableYears.isNotEmpty()) {
                item(key = "years") { DiscoverYearEntrances(availableYears, onSelectYear) }
            }

            for (month in months) {
                item(key = "month-${month.month}") { MonthHeading(month.month) }
                for (day in month.days) {
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
                            onOpen = entry.openCallback(onOpenMemory, onOpenMilestone, onOpenHeartMoment),
                        )
                    }
                }
            }

            item(key = "continue") { DiscoverContinuation(onOpen = onContinueToTimeline) }
        }
    }
}

/**
 * The one featured item Discover leads with — a real recognizable moment,
 * not a fabricated hero, and excluded from the bounded list below it so it
 * is never shown twice in the same curated sequence.
 */
@Composable
private fun DiscoverFeatured(
    entry: StoryEntry,
    imageStore: StoryImageStore,
    generation: Long,
    onOpen: (() -> Unit)? = null,
) {
    Surface(
        shape = RoundedCornerShape(EimirTheme.radii.hero),
        color = EimirTheme.colors.surface,
        border = BorderStroke(1.dp, entry.kind.accent().copy(alpha = 0.3f)),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("discover-featured")
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            Text(
                text = stringResource(R.string.momente_discover_featured_kicker),
                style = MaterialTheme.typography.labelSmall,
                color = EimirTheme.colors.brand,
            )
            if (entry.images.isNotEmpty()) {
                StoryImage(
                    image = entry.images.first(),
                    store = imageStore,
                    generation = generation,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 10f)
                        .clip(RoundedCornerShape(EimirTheme.radii.large)),
                )
            }
            Text(
                text = entry.text,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontFamily = EimirDisplayFamily,
                    fontWeight = if (entry.kind == StoryEntryKind.HEART_MOMENT) {
                        FontWeight.Medium
                    } else {
                        FontWeight.SemiBold
                    },
                    fontStyle = if (entry.kind == StoryEntryKind.HEART_MOMENT) {
                        FontStyle.Italic
                    } else {
                        FontStyle.Normal
                    },
                ),
                color = EimirTheme.colors.textPrimary,
                modifier = Modifier
                    .widthIn(max = ReadingMeasure)
                    .semantics { heading() },
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

/**
 * Early year entrances into Timeline. Reuses the existing applied-scope
 * mechanism ([de.eimir.app.reference.ReferenceViewModel.selectDiscoverYear])
 * rather than a new navigation primitive or a native year-index screen —
 * the latter is not currently supported by an existing native contract.
 */
@Composable
private fun DiscoverYearEntrances(years: List<Int>, onSelectYear: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2)) {
        Text(
            text = stringResource(R.string.momente_discover_years_heading),
            style = EimirTheme.contentTypography.sectionHeading,
            color = EimirTheme.colors.textPrimary,
            modifier = Modifier.semantics { heading() },
        )
        androidx.compose.foundation.layout.FlowRow(
            horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
        ) {
            years.sortedDescending().take(4).forEach { year ->
                Surface(
                    shape = RoundedCornerShape(EimirTheme.radii.pill),
                    color = EimirTheme.colors.surfaceRaised,
                    border = BorderStroke(1.dp, EimirTheme.colors.borderSubtle),
                    modifier = Modifier
                        .heightIn(min = MinimumTouchTarget)
                        .clickable(onClickLabel = stringResource(R.string.momente_discover_open_year, year)) {
                            onSelectYear(year)
                        }
                        .testTag("discover-year-$year"),
                ) {
                    Row(
                        modifier = Modifier.padding(
                            horizontal = EimirTheme.spacing.step4,
                            vertical = EimirTheme.spacing.step2,
                        ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = year.toString(),
                            style = MaterialTheme.typography.labelLarge,
                            color = EimirTheme.colors.textPrimary,
                        )
                    }
                }
            }
        }
    }
}

/**
 * A real chronological month heading, not another surrounding card — the
 * coarser grouping the Product Reference asks for above the existing day
 * headings. It uses the shared section-heading role (already used for e.g.
 * `ShortTaskSheet`'s own title) rather than a bespoke style.
 */
@Composable
private fun MonthHeading(month: java.time.YearMonth) {
    val locale: Locale = LocalConfiguration.current.locales[0]
    Text(
        text = DateTimeFormatter.ofPattern("MMMM yyyy", locale).format(month),
        style = EimirTheme.contentTypography.sectionHeading,
        color = EimirTheme.colors.textPrimary,
        modifier = Modifier
            .padding(top = EimirTheme.spacing.step2)
            .semantics { heading() },
    )
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

/**
 * Title or words of an entry, led by the quiet kind glyph where the kind is
 * not the default Memory (#969). No kind label or visibility pill precedes
 * the content any more.
 */
@Composable
private fun StoryEntryText(
    entry: StoryEntry,
    style: androidx.compose.ui.text.TextStyle,
) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step2),
        verticalAlignment = Alignment.Top,
    ) {
        StoryKindGlyph(kind = entry.kind, lineHeight = style.lineHeight)
        Text(
            text = entry.text,
            style = style,
            color = EimirTheme.colors.textPrimary,
            // A long title wraps rather than being cut: the words are the
            // record, and truncation would hide part of it for good.
            modifier = Modifier.widthIn(max = ReadingMeasure),
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
            // Content first: the photographs, then the title, then who and how.
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

            StoryEntryText(
                entry = entry,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontWeight = FontWeight.SemiBold,
                ),
            )

            StoryEntryMeta(entry)
        }
    }
}

/**
 * A Milestone keeps its restrained accent border; the star glyph, not a
 * label or stripe, says this is a special point in time.
 */
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
            .testTag("story-milestone-${entry.id}")
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
            StoryEntryText(
                entry = entry,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontWeight = FontWeight.SemiBold,
                ),
            )

            StoryEntryMeta(entry)
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
            .testTag("story-heart-moment-${entry.id}")
            .then(if (onOpen != null) Modifier.clickable(onClick = onOpen) else Modifier),
    ) {
        Column(
            modifier = Modifier.padding(EimirTheme.spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(EimirTheme.spacing.step3),
        ) {
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

            StoryEntryText(
                entry = entry,
                style = EimirTheme.typography.titleMedium.copy(
                    fontFamily = EimirDisplayFamily,
                    fontStyle = FontStyle.Italic,
                ),
            )

            StoryEntryMeta(entry)
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
private fun StoryEntryKind.accent() = when (this) {
    StoryEntryKind.MEMORY -> EimirTheme.colors.shared
    StoryEntryKind.MILESTONE -> EimirTheme.colors.discovery
    StoryEntryKind.HEART_MOMENT -> EimirTheme.colors.brand
}
