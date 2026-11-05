package de.eimir.nativetest.ui.planning

import de.eimir.nativetest.ui.common.confirmHaptic
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewmodel.compose.viewModel
import de.eimir.nativetest.R
import de.eimir.nativetest.ui.common.ConfirmDelete
import de.eimir.nativetest.ui.common.ContextPill
import de.eimir.nativetest.ui.common.DatePickerSheet
import de.eimir.nativetest.ui.common.Dates
import de.eimir.nativetest.ui.common.ErrorState
import de.eimir.nativetest.ui.common.FullScreenLoading
import de.eimir.nativetest.ui.common.Load
import de.eimir.nativetest.ui.common.OnReturn
import de.eimir.nativetest.ui.common.PageSkeleton
import de.eimir.nativetest.ui.common.PrimaryButton
import de.eimir.nativetest.ui.common.ReadingColumn
import de.eimir.nativetest.ui.common.SecondaryButton
import de.eimir.nativetest.ui.common.SectionTitle
import de.eimir.nativetest.ui.common.StaleBanner
import de.eimir.nativetest.ui.common.StateMessage
import de.eimir.nativetest.ui.common.TaskScaffold
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.common.currentLocale
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.common.message
import de.eimir.nativetest.ui.common.relativeDay
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.shell.AppNavigator
import de.eimir.nativetest.ui.story.DetailTopBar
import de.eimir.nativetest.ui.story.authorName
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import eimir.api.models.PlanDetail
import eimir.api.models.PlanStatus
import eimir.api.models.WishDetail
import eimir.api.models.WishStatus

/** R3 Planen: anticipation first — the next shared intention leads, management stays contextual. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlanScreen(nav: AppNavigator) {
    val model = graphViewModel { PlanningViewModel(it) }
    val load by model.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(0) }
    var showCompleted by rememberSaveable { mutableStateOf(false) }
    val plansList = rememberLazyListState()
    val wishesList = rememberLazyListState()
    OnReturn(model::refreshQuietly)

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().background(Eimir.colors.headerSurface).statusBarsPadding().padding(horizontal = Space.lg).height(56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.nav_plan), style = EimirType.heading3, modifier = Modifier.weight(1f).semantics { heading() })
        }
        SecondaryTabRow(
            selectedTabIndex = tab,
            containerColor = Eimir.colors.headerSurface,
            contentColor = Eimir.colors.textPrimary,
            indicator = { TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(tab), color = Eimir.colors.brandStrong) },
        ) {
            listOf(R.string.plan_plans, R.string.plan_wishes).forEachIndexed { index, label ->
                Tab(selected = tab == index, onClick = { tab = index }, text = { Text(stringResource(label), style = EimirType.label) })
            }
        }
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = model::load, modifier = Modifier.fillMaxSize()) {
                ReadingColumn { gutter ->
                    if (tab == 0) {
                        PlansList(state.value.plans, showCompleted, { showCompleted = !showCompleted }, nav, gutter, plansList, state.refreshError, model::load)
                    } else {
                        WishesList(state.value.wishes, showCompleted, { showCompleted = !showCompleted }, nav, gutter, wishesList)
                    }
                }
            }
        }
    }
}

@Composable
private fun PlansList(
    plans: List<PlanDetail>,
    showCompleted: Boolean,
    toggleCompleted: () -> Unit,
    nav: AppNavigator,
    gutter: androidx.compose.ui.unit.Dp,
    listState: androidx.compose.foundation.lazy.LazyListState,
    refreshError: de.eimir.nativetest.core.AppError?,
    retry: () -> Unit,
) {
    val open = plans.filter { it.status != PlanStatus.COMPLETED }
    val dated = open.filter { it.startDate() != null }.sortedBy { it.startDate() }
    val undated = open.filter { it.startDate() == null }.sortedByDescending { it.createdAt }
    val completed = plans.filter { it.status == PlanStatus.COMPLETED }.sortedByDescending { it.experiencedOn ?: it.startDate() }
    LazyColumn(state = listState, contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl), modifier = Modifier.fillMaxSize()) {
        refreshError?.let { item(key = "stale") { StaleBanner(it, retry, Modifier.padding(vertical = Space.xs)) } }
        item(key = "add") {
            Row(Modifier.fillMaxWidth().padding(vertical = Space.sm)) {
                SecondaryButton(stringResource(R.string.plan_add_plan), nav::createPlan)
            }
        }
        if (open.isEmpty()) {
            item(key = "empty") {
                StateMessage(
                    title = stringResource(R.string.plan_empty_title),
                    body = stringResource(R.string.plan_empty_body),
                    icon = EimirIcons.Calendar,
                )
            }
        }
        dated.firstOrNull()?.let { next ->
            item(key = "next-title") { SectionTitle(stringResource(R.string.plan_next)) }
            item(key = "p-" + next.id) { NextPlan(next) { nav.openPlan(next.id.toString()) } }
        }
        if (dated.size > 1) {
            item(key = "later-title") { SectionTitle(stringResource(R.string.plan_later)) }
            items(dated.size - 1, key = { "p-" + dated[it + 1].id }) { index -> PlanRow(dated[index + 1]) { nav.openPlan(dated[index + 1].id.toString()) } }
        }
        if (undated.isNotEmpty()) {
            item(key = "undated-title") { SectionTitle(stringResource(R.string.plan_undated)) }
            items(undated.size, key = { "p-" + undated[it].id }) { index -> PlanRow(undated[index]) { nav.openPlan(undated[index].id.toString()) } }
        }
        if (completed.isNotEmpty()) {
            item(key = "completed-toggle") {
                TextButton(onClick = toggleCompleted, modifier = Modifier.padding(top = Space.md)) {
                    Text(stringResource(if (showCompleted) R.string.plan_hide_completed else R.string.plan_show_completed) + " (${completed.size})")
                }
            }
            if (showCompleted) {
                items(completed.size, key = { "p-" + completed[it].id }) { index -> PlanRow(completed[index]) { nav.openPlan(completed[index].id.toString()) } }
            }
        }
    }
}

@Composable
private fun NextPlan(plan: PlanDetail, onOpen: () -> Unit) {
    val locale = currentLocale()
    Surface(onClick = onOpen, shape = Radii.card, color = Eimir.colors.pageTintShared, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(Space.lg), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
            plan.startDate()?.let {
                Text(relativeDay(it), style = EimirType.label, color = Eimir.colors.shared)
            }
            Text(plan.title, style = EimirType.editorial, color = Eimir.colors.textPrimary)
            plan.startDate()?.let { start ->
                val end = plan.endDate()
                Text(
                    Dates.long(start, locale) + if (end != null && end != start) " – " + Dates.long(end, locale) else "",
                    style = EimirType.bodySmall,
                    color = Eimir.colors.textSecondary,
                )
            }
            plan.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = EimirType.bodySmall, color = Eimir.colors.textSecondary, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun PlanRow(plan: PlanDetail, onOpen: () -> Unit) {
    val locale = currentLocale()
    val date = if (plan.status == PlanStatus.COMPLETED) plan.experiencedOn ?: plan.startDate() else plan.startDate()
    Row(
        Modifier.fillMaxWidth().clip(Radii.medium).clickable(onClick = onOpen).heightIn(min = 60.dp).padding(vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(52.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (date != null) {
                Text(Dates.weekday(date, locale), style = EimirType.meta, color = Eimir.colors.textSecondary)
                Text(date.dayOfMonth.toString(), style = EimirType.heading3, color = Eimir.colors.textPrimary)
            } else {
                EimirIcon(EimirIcons.Plan, size = 22.dp, tint = Eimir.colors.textSecondary)
            }
        }
        Column(Modifier.weight(1f).padding(start = Space.sm)) {
            Text(plan.title, style = EimirType.title, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                when {
                    plan.status == PlanStatus.COMPLETED && date != null -> stringResource(R.string.plan_completed_on, Dates.medium(date, locale))
                    date != null -> Dates.monthYear(date, locale)
                    else -> stringResource(R.string.plan_date_none)
                },
                style = EimirType.meta,
                color = Eimir.colors.textSecondary,
            )
        }
    }
}

@Composable
private fun WishesList(
    wishes: List<WishDetail>,
    showCompleted: Boolean,
    toggleCompleted: () -> Unit,
    nav: AppNavigator,
    gutter: androidx.compose.ui.unit.Dp,
    listState: androidx.compose.foundation.lazy.LazyListState,
) {
    val open = wishes.filter { it.status == WishStatus.OPEN }.sortedByDescending { it.createdAt }
    val done = wishes.filter { it.status != WishStatus.OPEN }.sortedByDescending { it.updatedAt }
    LazyColumn(state = listState, contentPadding = PaddingValues(start = gutter, end = gutter, bottom = Space.xxl), modifier = Modifier.fillMaxSize()) {
        item(key = "add") {
            Row(Modifier.fillMaxWidth().padding(vertical = Space.sm)) { SecondaryButton(stringResource(R.string.plan_add_wish), nav::createWish) }
        }
        if (open.isEmpty()) {
            item(key = "empty") {
                StateMessage(title = stringResource(R.string.wish_empty_title), body = stringResource(R.string.wish_empty_body), icon = EimirIcons.Wishes)
            }
        }
        items(open.size, key = { "w-" + open[it].id }) { index ->
            val wish = open[index]
            Surface(
                onClick = { nav.openWish(wish.id.toString()) },
                shape = Radii.card,
                color = Eimir.colors.discoverySurface,
                modifier = Modifier.fillMaxWidth().padding(vertical = Space.xs),
            ) {
                Row(Modifier.padding(Space.md).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
                    EimirIcon(EimirIcons.Wishes, size = 24.dp, tint = Eimir.colors.discovery)
                    Spacer(Modifier.width(Space.sm))
                    Text(wish.title, style = EimirType.editorialSmall, color = Eimir.colors.textPrimary)
                }
            }
        }
        if (done.isNotEmpty()) {
            item(key = "done-toggle") {
                TextButton(onClick = toggleCompleted, modifier = Modifier.padding(top = Space.md)) {
                    Text(stringResource(if (showCompleted) R.string.plan_hide_completed else R.string.plan_show_completed) + " (${done.size})")
                }
            }
            if (showCompleted) {
                items(done.size, key = { "w-" + done[it].id }) { index ->
                    val wish = done[index]
                    Row(
                        Modifier.fillMaxWidth().clip(Radii.medium).clickable { nav.openWish(wish.id.toString()) }.heightIn(min = 52.dp).padding(vertical = Space.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(wish.title, style = EimirType.body, modifier = Modifier.weight(1f))
                        ContextPill(stringResource(if (wish.status == WishStatus.PLANNED) R.string.wish_planned else R.string.wish_completed))
                    }
                }
            }
        }
    }
}

// ---- Details -------------------------------------------------------------------------------------

@Composable
fun PlanDetailScreen(nav: AppNavigator, planId: String) {
    val model = graphViewModel(key = "plan-$planId") { PlanDetailViewModel(it, planId) }
    val load by model.plan.collectAsStateWithLifecycle()
    val action by model.action.collectAsStateWithLifecycle()
    val closed by model.closed.collectAsStateWithLifecycle()
    var pickDate by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    val view = LocalView.current
    val locale = currentLocale()
    LaunchedEffect(closed) {
        val target = closed ?: return@LaunchedEffect
        nav.back()
        if (target.isNotEmpty()) nav.openWish(target)
    }
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        val plan = load.valueOrNull
        DetailTopBar(
            onBack = nav::back,
            canEdit = plan?.capabilities?.canEdit == true && plan.status != PlanStatus.COMPLETED,
            canDelete = plan?.capabilities?.canDelete == true,
            onEdit = { nav.editPlan(planId) },
            onDelete = { confirmDelete = true },
        )
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> {
                val current = state.value
                ReadingColumn { gutter ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = gutter, vertical = Space.sm),
                        verticalArrangement = Arrangement.spacedBy(Space.md),
                    ) {
                        val start = current.startDate()
                        if (current.status == PlanStatus.COMPLETED) {
                            ContextPill(stringResource(R.string.plan_completed), icon = EimirIcons.Highlights)
                        } else if (start != null) {
                            Text(relativeDay(start), style = EimirType.label, color = Eimir.colors.shared)
                        }
                        Text(current.title, style = EimirType.editorialLarge, modifier = Modifier.semantics { heading() })
                        Text(
                            when {
                                current.status == PlanStatus.COMPLETED && current.experiencedOn != null ->
                                    stringResource(R.string.plan_completed_on, Dates.long(current.experiencedOn!!, locale))
                                start != null -> Dates.long(start, locale) + (current.endDate()?.takeIf { it != start }?.let { " – " + Dates.long(it, locale) } ?: "")
                                else -> stringResource(R.string.plan_date_none)
                            },
                            style = EimirType.body,
                            color = Eimir.colors.textSecondary,
                        )
                        current.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = EimirType.reading) }
                        Text(stringResource(R.string.plan_created_by, authorName(current.creator)), style = EimirType.meta, color = Eimir.colors.textMuted)
                        if (current.sourceWishId != null) {
                            TextButton(onClick = { nav.openWish(current.sourceWishId.toString()) }) { Text(stringResource(R.string.plan_from_wish)) }
                        }
                        (action as? ActionState.Failed)?.let { Text(it.error.message(), style = EimirType.bodySmall, color = Eimir.colors.error) }
                        if (current.status != PlanStatus.COMPLETED && current.capabilities.canEdit) {
                            Spacer(Modifier.height(Space.sm))
                            PrimaryButton(
                                stringResource(R.string.plan_complete),
                                onClick = {
                                    view.confirmHaptic()
                                    model.complete(start?.takeIf { !it.isAfter(Dates.today()) } ?: Dates.today())
                                },
                                pending = action == ActionState.Running,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                                SecondaryButton(stringResource(if (start == null) R.string.plan_schedule else R.string.plan_date_set), { pickDate = true })
                                if (start != null) SecondaryButton(stringResource(R.string.plan_unschedule), model::unschedule)
                            }
                            if (current.sourceWishId != null) {
                                TextButton(onClick = model::returnToWish) { Text(stringResource(R.string.plan_return_to_wish)) }
                            }
                        }
                    }
                }
            }
        }
    }
    if (pickDate) DatePickerSheet(load.valueOrNull?.startDate(), onDismiss = { pickDate = false }, onPick = model::schedule)
    if (confirmDelete) ConfirmDelete(stringResource(R.string.plan_delete_title), { confirmDelete = false }, model::delete)
}

@Composable
fun WishDetailScreen(nav: AppNavigator, wishId: String) {
    val model = graphViewModel(key = "wish-$wishId") { WishDetailViewModel(it, wishId) }
    val load by model.wish.collectAsStateWithLifecycle()
    val linked by model.linkedPlans.collectAsStateWithLifecycle()
    val action by model.action.collectAsStateWithLifecycle()
    val deleted by model.deleted.collectAsStateWithLifecycle()
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(deleted) { if (deleted) nav.back() }
    Column(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        val wish = load.valueOrNull
        DetailTopBar(
            onBack = nav::back,
            canEdit = wish?.capabilities?.canEdit == true,
            canDelete = wish?.capabilities?.canDelete == true,
            onEdit = { nav.editWish(wishId) },
            onDelete = { confirmDelete = true },
        )
        when (val state = load) {
            Load.Loading -> PageSkeleton()
            is Load.Failed -> ErrorState(state.error, model::load)
            is Load.Ready -> {
                val current = state.value
                ReadingColumn { gutter ->
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = gutter, vertical = Space.sm),
                        verticalArrangement = Arrangement.spacedBy(Space.md),
                    ) {
                        Box(Modifier.fillMaxWidth().background(Eimir.colors.discoverySurface, Radii.card).padding(Space.lg)) {
                            Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
                                EimirIcon(EimirIcons.Wishes, size = 28.dp, tint = Eimir.colors.discovery)
                                Text(current.title, style = EimirType.editorialLarge, modifier = Modifier.semantics { heading() })
                                Text(stringResource(R.string.plan_created_by, authorName(current.creator)), style = EimirType.meta, color = Eimir.colors.textSecondary)
                            }
                        }
                        when (current.status) {
                            WishStatus.PLANNED -> ContextPill(stringResource(R.string.wish_planned), icon = EimirIcons.Calendar)
                            WishStatus.COMPLETED -> ContextPill(stringResource(R.string.wish_completed), icon = EimirIcons.Highlights)
                            WishStatus.OPEN -> Unit
                        }
                        linked.forEach { plan ->
                            SecondaryButton(plan.title, { nav.openPlan(plan.id.toString()) })
                        }
                        (action as? ActionState.Failed)?.let { Text(it.error.message(), style = EimirType.bodySmall, color = Eimir.colors.error) }
                        if (current.status == WishStatus.OPEN && current.capabilities.canEdit) {
                            PrimaryButton(stringResource(R.string.wish_make_plan), { nav.planFromWish(wishId) }, modifier = Modifier.fillMaxWidth())
                            SecondaryButton(stringResource(R.string.wish_complete), model::complete)
                        }
                    }
                }
            }
        }
    }
    if (confirmDelete) ConfirmDelete(stringResource(R.string.wish_delete_title), { confirmDelete = false }, model::delete)
}

// ---- Editors --------------------------------------------------------------------------------------

@Composable
fun PlanEditorScreen(nav: AppNavigator, planId: String?, fromWishId: String?) {
    val graph = appGraph()
    val model: PlanEditorViewModel = viewModel(key = "plan-editor-${planId ?: fromWishId ?: "new"}") {
        PlanEditorViewModel(graph, createSavedStateHandle(), planId, fromWishId)
    }
    val ui by model.ui.collectAsStateWithLifecycle()
    var pickDate by rememberSaveable { mutableStateOf(false) }
    val locale = currentLocale()
    LaunchedEffect(ui.savedPlanId) {
        val id = ui.savedPlanId ?: return@LaunchedEffect
        if (planId != null) nav.back() else nav.replaceWithPlan(id)
    }
    if (ui.loading) return FullScreenLoading()
    ui.loadError?.let { return ErrorState(it, model::load) }
    TaskScaffold(
        title = stringResource(if (planId == null) R.string.plan_new else R.string.plan_edit),
        saveLabel = stringResource(R.string.plan_save),
        dirty = ui.dirty,
        saving = ui.saving,
        saveEnabled = ui.title.isNotBlank(),
        error = ui.saveError,
        onClose = nav::back,
        onSave = model::save,
    ) {
        OutlinedTextField(
            value = ui.title,
            onValueChange = model::setTitle,
            label = { Text(stringResource(R.string.plan_title_label)) },
            placeholder = { Text(stringResource(R.string.plan_title_placeholder)) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.plan_date_label), style = EimirType.label, color = Eimir.colors.textSecondary)
                Text(ui.date?.let { Dates.long(it, locale) } ?: stringResource(R.string.plan_date_none), style = EimirType.body)
            }
            if (ui.date != null) TextButton(onClick = { model.setDate(null) }) { Text(stringResource(R.string.plan_date_clear)) }
            TextButton(onClick = { pickDate = true }) { Text(stringResource(R.string.plan_date_set)) }
        }
        OutlinedTextField(
            value = ui.description,
            onValueChange = model::setDescription,
            label = { Text(stringResource(R.string.plan_description_label)) },
            placeholder = { Text(stringResource(R.string.plan_description_placeholder)) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            minLines = 4,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    if (pickDate) DatePickerSheet(ui.date, onDismiss = { pickDate = false }, onPick = { model.setDate(it) })
}

@Composable
fun WishEditorScreen(nav: AppNavigator, wishId: String?) {
    val graph = appGraph()
    val model: WishEditorViewModel = viewModel(key = "wish-editor-${wishId ?: "new"}") {
        WishEditorViewModel(graph, createSavedStateHandle(), wishId)
    }
    val ui by model.ui.collectAsStateWithLifecycle()
    LaunchedEffect(ui.savedWishId) {
        val id = ui.savedWishId ?: return@LaunchedEffect
        if (wishId != null) nav.back() else nav.replaceWithWish(id)
    }
    if (ui.loading) return FullScreenLoading()
    ui.loadError?.let { return ErrorState(it, nav::back) }
    TaskScaffold(
        title = stringResource(if (wishId == null) R.string.wish_new else R.string.wish_edit),
        saveLabel = stringResource(R.string.wish_save),
        dirty = ui.dirty,
        saving = ui.saving,
        saveEnabled = ui.title.isNotBlank(),
        error = ui.saveError,
        onClose = nav::back,
        onSave = model::save,
    ) {
        OutlinedTextField(
            value = ui.title,
            onValueChange = model::setTitle,
            label = { Text(stringResource(R.string.wish_title_label)) },
            placeholder = { Text(stringResource(R.string.wish_title_placeholder)) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
            minLines = 2,
            textStyle = EimirType.editorialSmall,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
