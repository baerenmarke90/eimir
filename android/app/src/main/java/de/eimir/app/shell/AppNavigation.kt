package de.eimir.app.shell

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

/**
 * The navigation host.
 *
 * Navigation Compose owns the back stack rather than a hand-written one. Its
 * back stack survives process death through saved state, and it integrates with
 * the system back gesture, which `docs/INFORMATION-ARCHITECTURE.md` section 9
 * requires to behave like browser back. Both are exactly the kind of commodity
 * behaviour `docs/REUSE-BEFORE-BUILD.md` says not to reimplement.
 */
@Composable
fun AppNavigation(
    destinations: List<AppDestination>,
    modifier: Modifier = Modifier,
    navController: NavHostController = rememberNavController(),
    /**
     * Routes below a primary destination, such as a single memory.
     *
     * They live in the same host so the system back gesture unwinds them, and
     * so the bottom navigation keeps showing the destination they belong under
     * rather than losing its selection on the way into a detail.
     */
    detailRoutes: NavGraphBuilder.(NavHostController) -> Unit = {},
    /**
     * Which routes are owner-only and need [SecureWindowNavigationEffect]. Left to the
     * caller because the shell itself does not know the app's domain routes;
     * defaults to never-secure so existing callers are unaffected.
     */
    secureWhen: (route: String?) -> Boolean = { false },
    /** Forwarded to [AppShell] as-is; see there for what it is for. */
    banner: (@Composable () -> Unit)? = null,
    /**
     * Forwarded to [AppShell] as-is. Hoisted up to this parameter — rather
     * than left at [AppShell]'s own default — so a caller that needs to
     * trigger a Snackbar (e.g. from a `LaunchedEffect` reacting to a
     * ViewModel event) can share the exact instance [AppShell] renders.
     */
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() },
    /** Forwarded to [AppShell] as-is; see there for what it is for. */
    floatingActionButton: (@Composable () -> Unit)? = null,
    focusedTaskWhen: (String?) -> Boolean = { false },
    destinationContent: @Composable (AppDestination) -> Unit,
) {
    require(destinations.isNotEmpty()) { "The shell needs at least one destination." }
    val start = destinations.first()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val currentDestination = destinationForRoute(currentRoute, destinations)
    SecureWindowNavigationEffect(navController = navController, secureWhen = secureWhen)

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        AppShell(
            widthClass = windowWidthClassFor(maxWidth),
            destinations = destinations,
            currentDestination = currentDestination,
            onSelectDestination = { destination ->
                navController.navigateToPrimary(destination)
            },
            banner = banner,
            snackbarHostState = snackbarHostState,
            floatingActionButton = floatingActionButton.takeUnless { focusedTaskWhen(currentRoute) },
            showPrimaryNavigation = !focusedTaskWhen(currentRoute),
        ) {
            NavHost(
                navController = navController,
                startDestination = start.route,
                modifier = Modifier.fillMaxSize(),
            ) {
                for (destination in destinations) {
                    composable(destination.route) { destinationContent(destination) }
                }
                detailRoutes(navController)
            }
        }
    }
}

/**
 * Switching primary navigation must not stack history, per
 * `docs/INFORMATION-ARCHITECTURE.md` section 9. Each destination keeps its own
 * state so returning to it does not reset what the user was looking at.
 */
fun NavHostController.navigateToPrimary(destination: AppDestination) {
    navigate(destination.route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

/**
 * Falls back to the first available destination for an unknown route, which is
 * what a route removed between app versions looks like after a state restore.
 */
fun destinationForRoute(
    route: String?,
    destinations: List<AppDestination> = declaredDestinations,
): AppDestination =
    destinations.firstOrNull { it.route == route }
        // A detail route sits under the destination it belongs to, so opening
        // a memory keeps Story selected instead of dropping the selection.
        ?: destinations.firstOrNull { route != null && route.startsWith("${it.route}/") }
        ?: destinations.first()
