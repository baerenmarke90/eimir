package de.eimir.app.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemColors
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import de.eimir.app.design.EimirTheme

/**
 * Window size classes from `docs/SCREEN-TEMPLATES.md` section 1.
 *
 * Derived from the available width rather than from a device category, which is
 * what the document requires and what keeps a folded and an unfolded device
 * correct without the app knowing which is which.
 */
enum class WindowWidthClass { Compact, Medium, Expanded }

val MediumWidthThreshold: Dp = 600.dp
val ExpandedWidthThreshold: Dp = 840.dp

fun windowWidthClassFor(width: Dp): WindowWidthClass = when {
    width < MediumWidthThreshold -> WindowWidthClass.Compact
    width < ExpandedWidthThreshold -> WindowWidthClass.Medium
    else -> WindowWidthClass.Expanded
}

/**
 * Applies the window insets and the token background to a surface that has no
 * navigation.
 *
 * The entry screen is shown before there is anything to navigate between, but
 * it still draws edge to edge and still has a status bar and a display cutout
 * above it. Routing it around [AppShell] is what put the brand lockup
 * underneath the clock.
 *
 * Unlike [AppShell], which gets its background for free from [Scaffold]'s
 * default `containerColor`, this surface is a plain [Box] and previously drew
 * nothing behind its content — so the window's default background showed
 * through instead of the token background, most visibly in Dark Mode where it
 * left a neutral system grey instead of `EimirColors.background`.
 */
@Composable
fun ShellSurface(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(EimirTheme.colors.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
    ) {
        content()
    }
}

/**
 * The application shell.
 *
 * It owns the two things every screen would otherwise get wrong on its own.
 *
 * **Window insets.** `targetSdk` 36 means the system draws the app edge to edge
 * and hands back responsibility for the status bar, the navigation bar, the
 * display cutout and the keyboard. Content laid out without them ends up
 * underneath the clock, which is exactly what happened before this slice.
 *
 * **The navigation surface.** Bottom navigation at every window size. A rail or
 * sidebar spends horizontal space on a handful of destinations that the content
 * needs more, and on a foldable it changes where the user reaches every time
 * the device opens or closes. See ADR 0004.
 *
 * [widthClass] stays in the signature because later slices choose their content
 * composition by it — list versus list-plus-detail — even though the navigation
 * surface no longer varies.
 */
@Composable
fun AppShell(
    widthClass: WindowWidthClass,
    destinations: List<AppDestination>,
    currentDestination: AppDestination,
    onSelectDestination: (AppDestination) -> Unit,
    modifier: Modifier = Modifier,
    /**
     * Shown once, above [content], regardless of which destination is open —
     * the M2-D18 application-level connectivity state, or any later shell-wide
     * notice that shouldn't repeat itself per screen. `null` shows nothing,
     * same as every caller before this parameter existed.
     */
    banner: (@Composable () -> Unit)? = null,
    /**
     * The M2/G2 `docs/COMPONENT-CONTRACTS.md` §9.2 Snackbar surface, shared
     * across every destination the same way [banner] is — a brief,
     * non-critical confirmation belongs to the shell, not to whichever
     * screen happened to trigger it, since the screen the user lands on
     * after an action is often not the one that started it.
     */
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() },
    /**
     * The shell-wide quick-create trigger (`docs/m5/ANDROID-DELIVERY-PLAN.md`
     * quick-actions gap), shown once regardless of which destination is
     * open — matching Web's `QuickCreateMenu`, which is likewise part of the
     * shell rather than any one screen. `null` shows nothing, same as every
     * caller before this parameter existed.
     */
    floatingActionButton: (@Composable () -> Unit)? = null,
    showPrimaryNavigation: Boolean = true,
    content: @Composable () -> Unit,
) {
    // A single destination is not a choice, so no navigation surface is drawn
    // for it. This also keeps the shell honest while later slices are still
    // filling their areas.
    val navigable = showPrimaryNavigation && destinations.size > 1

    Scaffold(
        modifier = modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets.safeDrawing,
        bottomBar = {
            if (navigable) {
                BottomNavigation(destinations, currentDestination, onSelectDestination)
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = { floatingActionButton?.invoke() },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                // The content area must not apply the same insets again.
                .consumeWindowInsets(padding),
        ) {
            banner?.invoke()
            Box(modifier = Modifier.weight(1f)) {
                content()
            }
        }
    }
}

/*
 * Material fills the selection indicator from `secondaryContainer`, which this
 * product maps to the shared mint. Mint means shared and confirmed
 * (`docs/DESIGN-PRINCIPLES.md` 3.1), so an active destination must not borrow
 * it; brand purple is the product's own active state, as on the Web client.
 */
@Composable
private fun navigationBarItemColors(): NavigationBarItemColors =
    NavigationBarItemDefaults.colors(
        selectedIconColor = EimirTheme.colors.brandStrong,
        selectedTextColor = EimirTheme.colors.brandStrong,
        indicatorColor = EimirTheme.colors.brandSurface,
        unselectedIconColor = EimirTheme.colors.textSecondary,
        unselectedTextColor = EimirTheme.colors.textSecondary,
    )

@Composable
private fun BottomNavigation(
    destinations: List<AppDestination>,
    currentDestination: AppDestination,
    onSelectDestination: (AppDestination) -> Unit,
) {
    NavigationBar(containerColor = EimirTheme.colors.surface) {
        val colors = navigationBarItemColors()
        for (destination in destinations) {
            NavigationBarItem(
                selected = destination == currentDestination,
                onClick = { onSelectDestination(destination) },
                icon = { DestinationGlyph(destination.icon, LocalContentColor.current) },
                label = { Text(stringResource(destination.labelRes)) },
                alwaysShowLabel = true,
                colors = colors,
            )
        }
    }
}
