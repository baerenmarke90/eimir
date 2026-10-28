package de.eimir.nativetest.ui.shell

import android.net.Uri
import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.navigation
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import de.eimir.nativetest.MainActivity
import de.eimir.nativetest.R
import de.eimir.nativetest.ui.common.appGraph
import de.eimir.nativetest.ui.icons.EimirIcon
import de.eimir.nativetest.ui.icons.EimirIcons
import de.eimir.nativetest.ui.more.AboutScreen
import de.eimir.nativetest.ui.more.ActivityScreen
import de.eimir.nativetest.ui.more.MoreScreen
import de.eimir.nativetest.ui.more.NotificationsScreen
import de.eimir.nativetest.ui.more.PeopleScreen
import de.eimir.nativetest.ui.more.PlaceScreen
import de.eimir.nativetest.ui.more.PlacesScreen
import de.eimir.nativetest.ui.more.PrivateNoteEditorScreen
import de.eimir.nativetest.ui.more.PrivateNotesScreen
import de.eimir.nativetest.ui.more.ProfileScreen
import de.eimir.nativetest.ui.more.SearchScreen
import de.eimir.nativetest.ui.more.SettingsScreen
import de.eimir.nativetest.ui.navigation.AboutRoute
import de.eimir.nativetest.ui.navigation.ActivityRoute
import de.eimir.nativetest.ui.navigation.GalleryRoute
import de.eimir.nativetest.ui.navigation.HeartMomentRoute
import de.eimir.nativetest.ui.navigation.MemoryEditorRoute
import de.eimir.nativetest.ui.navigation.MemoryRoute
import de.eimir.nativetest.ui.navigation.MilestoneRoute
import de.eimir.nativetest.ui.navigation.MoreGraph
import de.eimir.nativetest.ui.navigation.MoreRoute
import de.eimir.nativetest.ui.navigation.NotificationsRoute
import de.eimir.nativetest.ui.navigation.PeopleRoute
import de.eimir.nativetest.ui.navigation.PhotosRoute
import de.eimir.nativetest.ui.navigation.PlaceRoute
import de.eimir.nativetest.ui.navigation.PlacesRoute
import de.eimir.nativetest.ui.navigation.PlanDetailRoute
import de.eimir.nativetest.ui.navigation.PlanEditorRoute
import de.eimir.nativetest.ui.navigation.PlanGraph
import de.eimir.nativetest.ui.navigation.PlanRoute
import de.eimir.nativetest.ui.navigation.PrivateNoteEditorRoute
import de.eimir.nativetest.ui.navigation.PrivateNotesRoute
import de.eimir.nativetest.ui.navigation.ProfileRoute
import de.eimir.nativetest.ui.navigation.SearchRoute
import de.eimir.nativetest.ui.navigation.SettingsRoute
import de.eimir.nativetest.ui.navigation.StoryGraph
import de.eimir.nativetest.ui.navigation.StoryRoute
import de.eimir.nativetest.ui.navigation.TodayGraph
import de.eimir.nativetest.ui.navigation.TodayRoute
import de.eimir.nativetest.ui.navigation.TopLevel
import de.eimir.nativetest.ui.navigation.WishDetailRoute
import de.eimir.nativetest.ui.navigation.WishEditorRoute
import de.eimir.nativetest.ui.planning.PlanDetailScreen
import de.eimir.nativetest.ui.planning.PlanEditorScreen
import de.eimir.nativetest.ui.planning.PlanScreen
import de.eimir.nativetest.ui.planning.WishDetailScreen
import de.eimir.nativetest.ui.planning.WishEditorScreen
import de.eimir.nativetest.ui.story.GalleryScreen
import de.eimir.nativetest.ui.story.HeartMomentScreen
import de.eimir.nativetest.ui.story.MemoryEditorScreen
import de.eimir.nativetest.ui.story.MemoryScreen
import de.eimir.nativetest.ui.story.MilestoneScreen
import de.eimir.nativetest.ui.story.PhotosScreen
import de.eimir.nativetest.ui.story.StoryScreen
import de.eimir.nativetest.ui.theme.Eimir
import de.eimir.nativetest.ui.theme.EimirType
import de.eimir.nativetest.ui.theme.Radii
import de.eimir.nativetest.ui.theme.Space
import de.eimir.nativetest.ui.today.TodayScreen
import kotlinx.coroutines.launch

/** Navigation actions shared by all screens; arguments are identifiers only. */
class AppNavigator(val controller: NavHostController) {
    fun back() {
        controller.navigateUp()
    }

    fun openMemory(id: String) = controller.navigate(MemoryRoute(id)) { launchSingleTop = true }
    fun openHeartMoment(id: String) = controller.navigate(HeartMomentRoute(id)) { launchSingleTop = true }
    fun openMilestone(id: String) = controller.navigate(MilestoneRoute(id)) { launchSingleTop = true }
    fun openGallery(memoryId: String, index: Int) = controller.navigate(GalleryRoute(memoryId, index))
    fun createMemory() = controller.navigate(MemoryEditorRoute()) { launchSingleTop = true }
    fun editMemory(id: String) = controller.navigate(MemoryEditorRoute(id)) { launchSingleTop = true }
    fun openPhotos() = controller.navigate(PhotosRoute) { launchSingleTop = true }
    fun openPlan(id: String) = controller.navigate(PlanDetailRoute(id)) { launchSingleTop = true }
    fun openWish(id: String) = controller.navigate(WishDetailRoute(id)) { launchSingleTop = true }
    fun createPlan() = controller.navigate(PlanEditorRoute()) { launchSingleTop = true }
    fun editPlan(id: String) = controller.navigate(PlanEditorRoute(planId = id)) { launchSingleTop = true }
    fun planFromWish(wishId: String) = controller.navigate(PlanEditorRoute(fromWishId = wishId)) { launchSingleTop = true }
    fun createWish() = controller.navigate(WishEditorRoute()) { launchSingleTop = true }
    fun editWish(id: String) = controller.navigate(WishEditorRoute(id)) { launchSingleTop = true }
    fun openSearch() = controller.navigate(SearchRoute) { launchSingleTop = true }
    fun openNotifications() = controller.navigate(NotificationsRoute) { launchSingleTop = true }
    fun openActivity() = controller.navigate(ActivityRoute) { launchSingleTop = true }
    fun openProfile() = controller.navigate(ProfileRoute) { launchSingleTop = true }
    fun openPlaces() = controller.navigate(PlacesRoute) { launchSingleTop = true }
    fun openPlace(id: String) = controller.navigate(PlaceRoute(id)) { launchSingleTop = true }
    fun openPeople() = controller.navigate(PeopleRoute) { launchSingleTop = true }
    fun openPrivateNotes() = controller.navigate(PrivateNotesRoute) { launchSingleTop = true }
    fun createPrivateNote() = controller.navigate(PrivateNoteEditorRoute()) { launchSingleTop = true }
    fun editPrivateNote(id: String) = controller.navigate(PrivateNoteEditorRoute(id)) { launchSingleTop = true }
    fun openSettings() = controller.navigate(SettingsRoute) { launchSingleTop = true }
    fun openAbout() = controller.navigate(AboutRoute) { launchSingleTop = true }

    /** Replaces the current editor with the saved result, so Back returns to the origin. */
    fun replaceWithMemory(id: String) = controller.navigate(MemoryRoute(id)) {
        popUpTo<MemoryEditorRoute> { inclusive = true }
        launchSingleTop = true
    }

    fun replaceWithPlan(id: String) = controller.navigate(PlanDetailRoute(id)) {
        popUpTo<PlanEditorRoute> { inclusive = true }
        launchSingleTop = true
    }

    fun replaceWithWish(id: String) = controller.navigate(WishDetailRoute(id)) {
        popUpTo<WishEditorRoute> { inclusive = true }
        launchSingleTop = true
    }

    fun selectTab(tab: TopLevel) {
        val graph: Any = when (tab) {
            TopLevel.Today -> TodayGraph
            TopLevel.Story -> StoryGraph
            TopLevel.Plan -> PlanGraph
            TopLevel.More -> MoreGraph
        }
        controller.navigate(graph) {
            // Each tab keeps its own back stack and scroll position (native
            // bottom-navigation behaviour); reselecting restores it.
            popUpTo(controller.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    /** Reselecting the active tab returns to its root. */
    fun resetTab(tab: TopLevel) {
        val root: Any = when (tab) {
            TopLevel.Today -> TodayRoute
            TopLevel.Story -> StoryRoute
            TopLevel.Plan -> PlanRoute
            TopLevel.More -> MoreRoute
        }
        controller.popBackStack(root, inclusive = false)
    }

    /** App-internal `de.eimir.nativetest://` links from shortcuts. */
    fun handleInternalLink(uri: Uri) {
        val segments = listOfNotNull(uri.host) + uri.pathSegments
        when {
            segments == listOf("create", "memory") -> createMemory()
            segments.firstOrNull() == "story" && segments.size == 3 && segments[1] == "memories" -> openMemory(segments[2])
            segments.firstOrNull() == "story" -> selectTab(TopLevel.Story)
            segments.firstOrNull() == "plan" -> selectTab(TopLevel.Plan)
            segments.firstOrNull() == "more" -> selectTab(TopLevel.More)
            else -> selectTab(TopLevel.Today)
        }
    }
}

private fun NavDestination?.topLevel(): TopLevel? = this?.hierarchy?.firstNotNullOfOrNull { destination ->
    when {
        destination.hasRoute(TodayGraph::class) -> TopLevel.Today
        destination.hasRoute(StoryGraph::class) -> TopLevel.Story
        destination.hasRoute(PlanGraph::class) -> TopLevel.Plan
        destination.hasRoute(MoreGraph::class) -> TopLevel.More
        else -> null
    }
}

/** Focused tasks hide root navigation so it never competes with saving or viewing. */
private fun NavDestination?.isFocusedTask(): Boolean = this != null && (
    hasRoute(MemoryEditorRoute::class) || hasRoute(GalleryRoute::class) || hasRoute(PlanEditorRoute::class) ||
        hasRoute(WishEditorRoute::class) || hasRoute(PrivateNoteEditorRoute::class) || hasRoute(SearchRoute::class)
    )

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppShell(key: String, activity: MainActivity, onSignOut: () -> Unit, onSwitchSpace: () -> Unit) = key(key) {
    val controller = rememberNavController()
    val navigator = remember(controller) { AppNavigator(controller) }
    val entry by controller.currentBackStackEntryAsState()
    val destination = entry?.destination
    var selectedTab by rememberSaveable { mutableStateOf(TopLevel.Today) }
    destination.topLevel()?.let { if (it != selectedTab) selectedTab = it }
    var showCreate by rememberSaveable { mutableStateOf(false) }
    val pendingNavigation by activity.pendingNavigation.collectAsStateWithLifecycle()

    LaunchedEffect(pendingNavigation, entry != null) {
        val uri = pendingNavigation ?: return@LaunchedEffect
        if (entry == null) return@LaunchedEffect
        activity.pendingNavigation.value = null
        navigator.handleInternalLink(uri)
    }

    val online by appGraph().connectivity.online.collectAsStateWithLifecycle()
    val motion = Eimir.motion
    Scaffold(
        containerColor = Eimir.colors.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        bottomBar = {
            Column {
                // Offline is explained once, app-wide; loaded content stays visible and writes fail visibly.
                AnimatedVisibility(visible = !online, enter = fadeIn(tween(motion.standardMillis)), exit = fadeOut(tween(motion.standardMillis))) {
                    Text(
                        stringResource(R.string.state_offline_banner),
                        style = EimirType.bodySmall,
                        color = Eimir.colors.textPrimary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Eimir.colors.warningSurface)
                            .then(if (destination.isFocusedTask()) Modifier.navigationBarsPadding() else Modifier)
                            .padding(horizontal = Space.lg, vertical = Space.xs)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                AnimatedVisibility(
                    visible = !destination.isFocusedTask(),
                    enter = slideInVertically(tween(motion.standardMillis)) { it } + fadeIn(tween(motion.standardMillis)),
                    exit = slideOutVertically(tween(motion.fastMillis)) { it } + fadeOut(tween(motion.fastMillis)),
                ) {
                    BottomBar(
                        selected = selectedTab,
                        onSelect = { tab -> if (tab == selectedTab) navigator.resetTab(tab) else navigator.selectTab(tab) },
                        onCreate = { showCreate = true },
                    )
                }
            }
        },
    ) { padding ->
        val push = motion.standardMillis
        NavHost(
            navController = controller,
            startDestination = TodayGraph,
            modifier = Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding()),
            enterTransition = { slideInHorizontally(tween(push, easing = motion.standard)) { it / 6 } + fadeIn(tween(push)) },
            exitTransition = { fadeOut(tween(motion.fastMillis)) },
            popEnterTransition = { fadeIn(tween(push)) },
            popExitTransition = { slideOutHorizontally(tween(push, easing = motion.standard)) { it / 6 } + fadeOut(tween(push)) },
        ) {
            val tabEnter: () -> EnterTransition = { fadeIn(tween(motion.standardMillis)) }
            val tabExit: () -> ExitTransition = { fadeOut(tween(motion.fastMillis)) }
            navigation<TodayGraph>(startDestination = TodayRoute) {
                composable<TodayRoute>(enterTransition = { tabEnter() }, exitTransition = { tabExit() }) { TodayScreen(navigator) }
            }
            navigation<StoryGraph>(startDestination = StoryRoute) {
                composable<StoryRoute>(enterTransition = { tabEnter() }, exitTransition = { tabExit() }) { StoryScreen(navigator) }
            }
            navigation<PlanGraph>(startDestination = PlanRoute) {
                composable<PlanRoute>(enterTransition = { tabEnter() }, exitTransition = { tabExit() }) { PlanScreen(navigator) }
            }
            navigation<MoreGraph>(startDestination = MoreRoute) {
                composable<MoreRoute>(enterTransition = { tabEnter() }, exitTransition = { tabExit() }) { MoreScreen(navigator) }
            }
            composable<MemoryRoute> { MemoryScreen(navigator, it.toRoute<MemoryRoute>().memoryId) }
            composable<MemoryEditorRoute>(
                enterTransition = { slideInVertically(tween(motion.emphasizedMillis, easing = motion.enter)) { it / 4 } + fadeIn(tween(push)) },
                popExitTransition = { slideOutVertically(tween(push, easing = motion.exit)) { it / 4 } + fadeOut(tween(push)) },
            ) { MemoryEditorScreen(navigator, it.toRoute<MemoryEditorRoute>().memoryId) }
            composable<GalleryRoute>(
                enterTransition = { fadeIn(tween(push)) },
                popExitTransition = { fadeOut(tween(push)) },
            ) {
                val route = it.toRoute<GalleryRoute>()
                GalleryScreen(navigator, route.memoryId, route.startIndex)
            }
            composable<HeartMomentRoute> { HeartMomentScreen(navigator, it.toRoute<HeartMomentRoute>().heartMomentId) }
            composable<MilestoneRoute> { MilestoneScreen(navigator, it.toRoute<MilestoneRoute>().milestoneId) }
            composable<PhotosRoute> { PhotosScreen(navigator) }
            composable<PlanDetailRoute> { PlanDetailScreen(navigator, it.toRoute<PlanDetailRoute>().planId) }
            composable<WishDetailRoute> { WishDetailScreen(navigator, it.toRoute<WishDetailRoute>().wishId) }
            composable<PlanEditorRoute> {
                val route = it.toRoute<PlanEditorRoute>()
                PlanEditorScreen(navigator, route.planId, route.fromWishId)
            }
            composable<WishEditorRoute> { WishEditorScreen(navigator, it.toRoute<WishEditorRoute>().wishId) }
            composable<SearchRoute> { SearchScreen(navigator) }
            composable<NotificationsRoute> { NotificationsScreen(navigator) }
            composable<ActivityRoute> { ActivityScreen(navigator) }
            composable<ProfileRoute> { ProfileScreen(navigator) }
            composable<PlacesRoute> { PlacesScreen(navigator) }
            composable<PlaceRoute> { PlaceScreen(navigator, it.toRoute<PlaceRoute>().placeId) }
            composable<PeopleRoute> { PeopleScreen(navigator) }
            composable<PrivateNotesRoute> { PrivateNotesScreen(navigator) }
            composable<PrivateNoteEditorRoute> { PrivateNoteEditorScreen(navigator, it.toRoute<PrivateNoteEditorRoute>().noteId) }
            composable<SettingsRoute> { SettingsScreen(navigator, onSignOut, onSwitchSpace) }
            composable<AboutRoute> { AboutScreen(navigator) }
        }
    }

    if (showCreate) {
        QuickCreateSheet(
            onDismiss = { showCreate = false },
            onMemory = navigator::createMemory,
            onWish = navigator::createWish,
            onPlan = navigator::createPlan,
            onPrivateNote = navigator::createPrivateNote,
        )
    }
}

@Composable
private fun BottomBar(selected: TopLevel, onSelect: (TopLevel) -> Unit, onCreate: () -> Unit) {
    val view = LocalView.current
    Column(Modifier.fillMaxWidth().background(Eimir.colors.headerSurface)) {
        HorizontalDivider(color = Eimir.colors.borderSubtle, thickness = 1.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .height(72.dp)
                .padding(horizontal = Space.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavItem(TopLevel.Today, EimirIcons.Wir, R.string.nav_today, selected, onSelect, Modifier.weight(1f))
            NavItem(TopLevel.Story, EimirIcons.Moments, R.string.nav_moments, selected, onSelect, Modifier.weight(1f))
            val createLabel = stringResource(R.string.nav_create)
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Surface(
                    onClick = {
                        view.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                        onCreate()
                    },
                    shape = CircleShape,
                    color = Eimir.colors.brandStrong,
                    shadowElevation = 4.dp,
                    modifier = Modifier.size(52.dp).semantics { contentDescription = createLabel },
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        EimirIcon(EimirIcons.Add, size = 26.dp, tint = Eimir.colors.onAccent, strokeWidth = 2f)
                    }
                }
            }
            NavItem(TopLevel.Plan, EimirIcons.Plan, R.string.nav_plan, selected, onSelect, Modifier.weight(1f))
            NavItem(TopLevel.More, EimirIcons.More, R.string.nav_more, selected, onSelect, Modifier.weight(1f))
        }
    }
}

@Composable
private fun NavItem(
    tab: TopLevel,
    icon: EimirIcons,
    label: Int,
    selected: TopLevel,
    onSelect: (TopLevel) -> Unit,
    modifier: Modifier,
) {
    val active = tab == selected
    val view = LocalView.current
    Column(
        modifier
            .heightIn(min = Space.touchTarget)
            .clip(Radii.medium)
            .selectable(selected = active, role = Role.Tab) {
                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                onSelect(tab)
            }
            .padding(vertical = Space.xxs),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier
                .clip(Radii.pill)
                .background(if (active) Eimir.colors.brandSurface else androidx.compose.ui.graphics.Color.Transparent)
                .padding(horizontal = Space.md, vertical = Space.xxs),
        ) {
            EimirIcon(icon, size = 24.dp, tint = if (active) Eimir.colors.brandStrong else Eimir.colors.textSecondary)
        }
        Text(
            stringResource(label),
            style = EimirType.meta,
            color = if (active) Eimir.colors.textPrimary else Eimir.colors.textSecondary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QuickCreateSheet(
    onDismiss: () -> Unit,
    onMemory: () -> Unit,
    onWish: () -> Unit,
    onPlan: () -> Unit,
    onPrivateNote: () -> Unit,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    fun choose(action: () -> Unit) {
        scope.launch { state.hide() }.invokeOnCompletion {
            onDismiss()
            action()
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = Eimir.colors.surfaceRaised) {
        Column(Modifier.padding(horizontal = Space.lg).padding(bottom = Space.xl).widthIn(max = 560.dp)) {
            Text(stringResource(R.string.create_title), style = EimirType.editorial, modifier = Modifier.padding(bottom = Space.md))
            CreateGroup(R.string.create_group_moments)
            CreateRow(EimirIcons.Memories, R.string.create_memory, R.string.create_memory_sub) { choose(onMemory) }
            CreateGroup(R.string.create_group_planning)
            CreateRow(EimirIcons.Wishes, R.string.create_wish, R.string.create_wish_sub) { choose(onWish) }
            CreateRow(EimirIcons.Calendar, R.string.create_plan, R.string.create_plan_sub) { choose(onPlan) }
            CreateGroup(R.string.create_group_private)
            CreateRow(EimirIcons.Notes, R.string.create_private_note, R.string.create_private_note_sub, private = true) { choose(onPrivateNote) }
        }
    }
}

@Composable
private fun CreateGroup(label: Int) {
    Text(
        stringResource(label).uppercase(),
        style = EimirType.meta,
        color = Eimir.colors.textSecondary,
        modifier = Modifier.padding(top = Space.sm, bottom = Space.xxs),
    )
}

@Composable
private fun CreateRow(icon: EimirIcons, title: Int, subtitle: Int, private: Boolean = false, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = Radii.medium, color = androidx.compose.ui.graphics.Color.Transparent) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = Space.xs, horizontal = Space.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(40.dp).clip(Radii.medium).background(if (private) Eimir.colors.privateSurface else Eimir.colors.sharedSurface),
                contentAlignment = Alignment.Center,
            ) { EimirIcon(icon, size = 22.dp) }
            Column(Modifier.padding(start = Space.sm)) {
                Text(stringResource(title), style = EimirType.title)
                Text(stringResource(subtitle), style = EimirType.bodySmall, color = Eimir.colors.textSecondary)
            }
        }
    }
}
