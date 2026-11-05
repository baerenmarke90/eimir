package de.eimir.nativetest.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * Calls [onResume] whenever the screen becomes visible again (return from
 * another app or another screen), but not on its first composition. Screens
 * use it to revalidate quietly while keeping their current content.
 */
@Composable
fun OnReturn(onResume: () -> Unit) {
    val current = rememberUpdatedState(onResume)
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        var first = true
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) {
                if (first) first = false else current.value()
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}
