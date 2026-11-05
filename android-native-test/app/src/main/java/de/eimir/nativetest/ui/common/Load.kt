package de.eimir.nativetest.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import de.eimir.nativetest.EimirNativeApplication
import de.eimir.nativetest.core.AppError
import de.eimir.nativetest.core.AppGraph

/**
 * Screen data state.
 *
 * A failed refresh keeps the last confirmed value ([Ready.refreshError]) so a
 * transient outage never replaces usable content with an error page, and a
 * failure is never presented as an empty collection.
 */
sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Failed(val error: AppError) : Load<Nothing>
    data class Ready<T>(val value: T, val refreshing: Boolean = false, val refreshError: AppError? = null) : Load<T>

    val valueOrNull: T? get() = (this as? Ready<T>)?.value
}

fun <T> Load<T>.refreshing(): Load<T> = when (this) {
    is Load.Ready -> copy(refreshing = true, refreshError = null)
    else -> Load.Loading
}

fun <T> Load<T>.failedWith(error: AppError): Load<T> = when (this) {
    is Load.Ready -> copy(refreshing = false, refreshError = error)
    else -> Load.Failed(error)
}

@Composable
fun appGraph(): AppGraph = (LocalContext.current.applicationContext as EimirNativeApplication).graph

/** ViewModel construction with the app graph; the lambda also receives the saved-state extras. */
@Composable
inline fun <reified VM : ViewModel> graphViewModel(
    key: String? = null,
    crossinline create: CreationExtras.(AppGraph) -> VM,
): VM {
    val graph = appGraph()
    return viewModel(key = key) { create(graph) }
}
