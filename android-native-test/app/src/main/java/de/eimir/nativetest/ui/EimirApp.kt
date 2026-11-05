package de.eimir.nativetest.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.eimir.nativetest.MainActivity
import de.eimir.nativetest.ui.common.FullScreenLoading
import de.eimir.nativetest.ui.common.graphViewModel
import de.eimir.nativetest.ui.session.AwaitingSpaceScreen
import de.eimir.nativetest.ui.session.ChooseSpaceScreen
import de.eimir.nativetest.ui.session.Gate
import de.eimir.nativetest.ui.session.PendingEntryDialogs
import de.eimir.nativetest.ui.session.SessionViewModel
import de.eimir.nativetest.ui.session.SignInScreen
import de.eimir.nativetest.ui.session.SpaceProblemScreen
import de.eimir.nativetest.ui.shell.AppShell
import de.eimir.nativetest.ui.theme.Eimir

/** Root: decides between sign-in, Space selection and the product shell. */
@Composable
fun EimirApp(activity: MainActivity) {
    val session = graphViewModel { SessionViewModel(it) }
    val gate by session.gate.collectAsStateWithLifecycle()
    val entryText by activity.pendingEntryText.collectAsStateWithLifecycle()

    LaunchedEffect(entryText) {
        val text = entryText ?: return@LaunchedEffect
        activity.pendingEntryText.value = null
        session.submitLinkText(text)
    }

    val motion = Eimir.motion
    Box(Modifier.fillMaxSize().background(Eimir.colors.background)) {
        AnimatedContent(
            targetState = gate,
            contentKey = { it::class },
            transitionSpec = {
                fadeIn(tween(motion.standardMillis)) togetherWith fadeOut(tween(motion.fastMillis))
            },
            label = "gate",
        ) { state ->
            when (state) {
                Gate.Restoring -> Box(Modifier.fillMaxSize())
                is Gate.SignIn -> SignInScreen(session, state.reason)
                Gate.ResolvingSpace -> FullScreenLoading()
                is Gate.ChooseSpace -> ChooseSpaceScreen(state.spaces, session::selectSpace, session::signOut)
                Gate.AwaitingSpace -> AwaitingSpaceScreen(session::resolveSpace, session::signOut)
                is Gate.SpaceProblem -> SpaceProblemScreen(state.error, session::resolveSpace, session::signOut)
                is Gate.Ready -> AppShell(
                    // A new login or Space starts a fresh navigation state.
                    key = "${state.loginId}:${state.spaceId}",
                    activity = activity,
                    onSignOut = session::signOut,
                    onSwitchSpace = session::switchSpace,
                )
            }
        }
        PendingEntryDialogs(session)
    }
}
