package de.eimir.nativetest.ui.today

import de.eimir.nativetest.ui.common.confirmHaptic
import android.view.HapticFeedbackConstants
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.eimir.nativetest.R
import de.eimir.nativetest.media.MediaParent
import de.eimir.nativetest.media.MediaVariant
import de.eimir.nativetest.ui.common.AttachmentPhoto
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.MediaRef
import de.eimir.nativetest.ui.common.OnReturn
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.PersonAvatar
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SectionTitle
import de.eimir.nativetest.ui.common.StaleBanner
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.relativeDay
import de.eimir.nativetest.ui.common.rememberSensitiveReveals
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Literata
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.DashboardItem
import eimir.api.models.DashboardItemType
import eimir.api.models.DurationDisplayMode
import eimir.api.models.PartnerPresenceView
import java.text.NumberFormat
import java.time.LocalDate

/**
 * R4 Wir/Today: the emotional entry point. Order follows the reference
 * experience — quiet header, couple context, relationship impulse, one real
 * keepsake as the focal point, upcoming, recent, story summary. Modules
 * without content disappear instead of rendering empty tiles.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TodayScreen(nav: AppNavigator) {
    val model = graphViewModel { TodayViewModel(it) }
    val state by model.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    OnReturn(model::refreshQuietly)

    Column(Modifier.fillMaxSize()) {
        TodayHeader(state.unread, onSearch = nav::openSearch, onNotifications = nav::openNotifications)
        when (val load = state.dashboard) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(load.error, model::refresh)
            is Load.Ready -> PullToRefreshBox(
                isRefreshing = load.refreshing,
                onRefresh = model::refresh,
                modifier = Modifier.fillMaxSize(),
            ) {
                val dashboard = load.value
                val reveals = rememberSensitiveReveals("today")
                ReadingColumn { gutter ->
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        load.refreshError?.let { error ->
                            item(key = "stale") { StaleBanner(error, model::refresh, Modifier.padding(bottom = Space.sm)) }
                        }
                        item(key = "couple") {
                            CoupleContext(state, dashboard.space.partner?.displayName)
                        }
                        val partner = dashboard.space.partner
                        if (partner != null) {
                            item(key = "impulse") {
                                ThinkingOfYou(
                                    partnerName = partner.displayName,
                                    state = state.thinking,
                                    availableAt = state.thinkingAvailableAt ?: dashboard.thinkingOfYouAvailableAt,
                                    onSend = model::sendThinkingOfYou,
                                )
                            }
                        }
                        val keepsake = dashboard.keepsake ?: dashboard.retrospective
                        if (keepsake != null) {
                            item(key = "keepsake") {
                                SectionTitle(stringResource(if (dashboard.keepsake != null) R.string.today_keepsake else R.string.today_retrospective))
                                Keepsake(keepsake, reveals = reveals, onOpen = { open(nav, keepsake) })
                            }
                        }
                        if (dashboard.upcoming.isNotEmpty()) {
                            item(key = "upcoming-title") { SectionTitle(stringResource(R.string.today_upcoming)) }
                            items(dashboard.upcoming.size, key = { "up-" + dashboard.upcoming[it].id }) { index ->
                                UpcomingRow(dashboard.upcoming[index]) { open(nav, dashboard.upcoming[index]) }
                            }
                        }
                        if (dashboard.recentShared.isNotEmpty()) {
                            item(key = "recent-title") { SectionTitle(stringResource(R.string.today_recent)) }
                            items(dashboard.recentShared.size, key = { "recent-" + dashboard.recentShared[it].id }) { index ->
                                RecentRow(dashboard.recentShared[index]) { open(nav, dashboard.recentShared[index]) }
                            }
                        }
                        val summary = dashboard.sharedStorySummary
                        val total = summary.memories + summary.heartMoments + summary.milestones
                        item(key = "story") {
                            if (total == 0 && keepsake == null) {
                                StateMessage(
                                    title = stringResource(R.string.today_empty_title),
                                    body = stringResource(R.string.today_empty_body),
                                    icon = EimirIcons.Memories,
                                    action = stringResource(R.string.create_memory),
                                    onAction = nav::createMemory,
                                )
                            } else {
                                StorySummary(summary.memories, summary.heartMoments, summary.milestones) {
                                    nav.selectTab(de.eimir.nativetest.ui.navigation.TopLevel.Story)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun open(nav: AppNavigator, item: DashboardItem) {
    val id = item.id.toString()
    when (item.type) {
        DashboardItemType.MEMORY -> nav.openMemory(id)
        DashboardItemType.HEART_MOMENT -> nav.openHeartMoment(id)
        DashboardItemType.MILESTONE -> nav.openMilestone(id)
        DashboardItemType.PLAN -> nav.openPlan(id)
        DashboardItemType.WISH -> nav.openWish(id)
        DashboardItemType.PLACE -> nav.openPlace(id)
        else -> Unit
    }
}

@Composable
private fun TodayHeader(unread: Int, onSearch: () -> Unit, onNotifications: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Eimir.colors.headerSurface)
            .statusBarsPadding()
            .padding(start = Space.lg, end = Space.xs)
            .height(56.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.brand_name),
            style = EimirType.heading3.copy(fontFamily = Literata),
            color = Eimir.colors.textPrimary,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        val searchLabel = stringResource(R.string.nav_search)
        IconButton(onClick = onSearch, modifier = Modifier.semantics { contentDescription = searchLabel }) {
            EimirIcon(EimirIcons.Search)
        }
        val notificationsLabel = if (unread > 0) {
            stringResource(R.string.nav_notifications_unread, unread)
        } else {
            stringResource(R.string.nav_notifications)
        }
        IconButton(onClick = onNotifications, modifier = Modifier.semantics { contentDescription = notificationsLabel }) {
            BadgedBox(badge = { if (unread > 0) Badge(containerColor = Eimir.colors.private) { Text(if (unread > 9) "9+" else "$unread") } }) {
                EimirIcon(EimirIcons.Notifications)
            }
        }
    }
}

@Composable
private fun CoupleContext(state: TodayState, partnerName: String?) {
    val locale = currentLocale()
    Row(
        Modifier.fillMaxWidth().padding(top = Space.lg, bottom = Space.sm).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            PersonAvatar(state.ownName, state.ownAccountId, state.ownAvatarId, size = 52.dp)
            if (partnerName != null) {
                PersonAvatar(
                    partnerName,
                    state.partnerAccountId,
                    state.partnerAvatarId,
                    size = 52.dp,
                    modifier = Modifier.offset(x = 36.dp).background(Eimir.colors.background, CircleShape).padding(2.dp),
                )
            }
        }
        Spacer(Modifier.width(if (partnerName != null) 48.dp else Space.sm))
        Column(Modifier.weight(1f)) {
            Text(
                if (partnerName != null) "${state.ownName} & $partnerName" else state.ownName,
                style = EimirType.editorial,
                color = Eimir.colors.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val duration = state.duration
            if (duration != null) {
                val text = when {
                    duration.displayMode == DurationDisplayMode.DAYS ->
                        stringResource(R.string.today_together_days, NumberFormat.getIntegerInstance(locale).format(duration.daysTogether))
                    duration.years > 0 -> stringResource(R.string.today_together_years, duration.years, duration.months)
                    else -> stringResource(R.string.today_together_months, duration.months)
                }
                Text(text, style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
            }
            when (state.presence) {
                PartnerPresenceView.State.ACTIVE -> PresenceLine(stringResource(R.string.today_partner_active), active = true)
                PartnerPresenceView.State.RECENT -> PresenceLine(stringResource(R.string.today_partner_recent), active = false)
                null -> if (partnerName == null) Text(stringResource(R.string.today_alone), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
            }
        }
    }
}

@Composable
private fun PresenceLine(text: String, active: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (active) Eimir.colors.success else Eimir.colors.textMuted))
        Spacer(Modifier.width(Space.xxs))
        Text(text, style = EimirType.meta, color = Eimir.colors.textSecondary)
    }
}

@Composable
private fun ThinkingOfYou(
    partnerName: String,
    state: ImpulseState,
    availableAt: java.time.OffsetDateTime?,
    onSend: () -> Unit,
) {
    val view = LocalView.current
    val locale = currentLocale()
    val waiting = availableAt != null && availableAt.isAfter(java.time.OffsetDateTime.now())
    Surface(
        onClick = {
            view.confirmHaptic()
            onSend()
        },
        enabled = state != ImpulseState.Sending && !waiting,
        shape = Radii.card,
        color = Eimir.colors.pageTintBrand,
        modifier = Modifier.fillMaxWidth().padding(vertical = Space.xs).animateContentSize(),
    ) {
        Row(Modifier.padding(Space.md).heightIn(min = Space.touchTarget), verticalAlignment = Alignment.CenterVertically) {
            EimirIcon(EimirIcons.Thinking, size = 28.dp)
            Spacer(Modifier.width(Space.sm))
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        state == ImpulseState.Sent -> stringResource(R.string.today_thinking_sent, partnerName)
                        else -> stringResource(R.string.today_thinking_action, partnerName)
                    },
                    style = EimirType.title,
                    color = Eimir.colors.textPrimary,
                )
                if (waiting && state != ImpulseState.Sent) {
                    Text(
                        stringResource(R.string.today_thinking_wait, Dates.time(availableAt!!, locale)),
                        style = EimirType.meta,
                        color = Eimir.colors.textSecondary,
                    )
                }
                if (state is ImpulseState.Failed) {
                    Text(state.error.message(), style = EimirType.meta, color = Eimir.colors.error)
                }
            }
        }
    }
}

@Composable
private fun Keepsake(item: DashboardItem, reveals: de.eimir.nativetest.ui.common.SensitiveReveals, onOpen: () -> Unit) {
    val locale = currentLocale()
    val photoId = item.previewAttachmentId
    Column(
        Modifier
            .fillMaxWidth()
            .clip(Radii.card)
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(bottom = Space.sm),
    ) {
        if (photoId != null) {
            AttachmentPhoto(
                ref = MediaRef(
                    attachmentId = photoId,
                    parent = if (item.type == DashboardItemType.HEART_MOMENT) MediaParent.HEART_MOMENT else MediaParent.MEMORY,
                    parentId = item.id,
                    isSensitive = item.previewIsSensitive,
                ),
                variant = MediaVariant.ORIGINAL,
                reveals = reveals,
                contentDescription = item.titleOrText,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 5f).clip(Radii.card),
            )
            Spacer(Modifier.height(Space.sm))
        }
        val text = item.titleOrText
        if (!text.isNullOrBlank()) {
            Text(
                text,
                style = if (photoId == null) EimirType.editorialLarge else EimirType.editorial,
                color = Eimir.colors.textPrimary,
                maxLines = if (photoId == null) 6 else 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        item.occurredOn?.let {
            Text(Dates.long(it, locale), style = EimirType.meta, color = Eimir.colors.textSecondary)
        }
    }
}

@Composable
private fun UpcomingRow(item: DashboardItem, onOpen: () -> Unit) {
    val date: LocalDate? = item.scheduledOn ?: item.scheduledAt?.toLocalDate() ?: item.occurredOn
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radii.medium)
            .clickable(onClick = onOpen)
            .heightIn(min = 56.dp)
            .padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).clip(Radii.medium).background(Eimir.colors.sharedSurface),
            contentAlignment = Alignment.Center,
        ) {
            EimirIcon(
                when (item.type) {
                    DashboardItemType.BIRTHDAY -> EimirIcons.Birthday
                    DashboardItemType.ANNIVERSARY, DashboardItemType.IMPORTANT_DATE -> EimirIcons.Anniversary
                    DashboardItemType.WISH -> EimirIcons.Wishes
                    else -> EimirIcons.Calendar
                },
                size = 22.dp,
            )
        }
        Column(Modifier.padding(start = Space.sm).weight(1f)) {
            Text(item.titleOrText.orEmpty(), style = EimirType.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (date != null) Text(relativeDay(date), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
        }
    }
}

@Composable
private fun RecentRow(item: DashboardItem, onOpen: () -> Unit) {
    val locale = currentLocale()
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Radii.medium)
            .clickable(onClick = onOpen)
            .heightIn(min = 64.dp)
            .padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val photo = item.previewAttachmentId
        if (photo != null) {
            AttachmentPhoto(
                ref = MediaRef(
                    photo,
                    if (item.type == DashboardItemType.HEART_MOMENT) MediaParent.HEART_MOMENT else MediaParent.MEMORY,
                    item.id,
                    item.previewIsSensitive,
                ),
                reveals = null,
                modifier = Modifier.size(56.dp).clip(Radii.medium),
            )
        } else {
            Box(Modifier.size(56.dp).clip(Radii.medium).background(Eimir.colors.pageTintShared), contentAlignment = Alignment.Center) {
                EimirIcon(
                    when (item.type) {
                        DashboardItemType.HEART_MOMENT -> EimirIcons.Moments
                        DashboardItemType.MILESTONE -> EimirIcons.Milestones
                        else -> EimirIcons.Memories
                    },
                    size = 22.dp,
                )
            }
        }
        Column(Modifier.padding(start = Space.sm).weight(1f)) {
            Text(
                item.titleOrText.orEmpty().ifBlank { stringResource(R.string.memory_title_untitled) },
                style = EimirType.title,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            (item.occurredOn ?: item.createdAt?.toLocalDate())?.let {
                Text(Dates.medium(it, locale), style = EimirType.meta, color = Eimir.colors.textSecondary)
            }
        }
    }
}

@Composable
private fun StorySummary(memories: Int, hearts: Int, milestones: Int, onOpen: () -> Unit) {
    Surface(
        onClick = onOpen,
        shape = Radii.card,
        color = Eimir.colors.pageTintShared,
        modifier = Modifier.fillMaxWidth().padding(top = Space.xl),
    ) {
        Column(Modifier.padding(Space.lg)) {
            Text(stringResource(R.string.today_story), style = EimirType.editorialSmall, color = Eimir.colors.textPrimary)
            Spacer(Modifier.height(Space.xxs))
            Text(
                stringResource(R.string.today_story_counts, memories, hearts, milestones),
                style = EimirType.bodySmall,
                color = Eimir.colors.textSecondary,
            )
        }
    }
}
