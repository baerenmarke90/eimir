package de.eimir.nativetest

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import de.eimir.nativetest.auth.AuthState
import de.eimir.nativetest.auth.EntryLinkParser
import de.eimir.nativetest.ui.EimirApp
import de.eimir.nativetest.ui.theme.EimirTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * The single Activity. It is `singleTask`, so a link delivered while the app
 * is running arrives through [onNewIntent] in the existing task instead of a
 * second copy of the app.
 */
class MainActivity : ComponentActivity() {
    /** Internal navigation requests (shortcuts, deep links) for the shell. */
    val pendingNavigation = MutableStateFlow<Uri?>(null)

    /** Mailbox proofs extracted from an intent; consumed by the session layer. */
    val pendingEntryText = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val graph = (application as EimirNativeApplication).graph
        splash.setKeepOnScreenCondition { graph.sessions.state.value == AuthState.Restoring }
        // A recreated Activity has already handled its launch intent.
        if (savedInstanceState == null) route(intent)
        setContent {
            EimirTheme {
                EimirApp(activity = this)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        route(intent)
    }

    private fun route(intent: Intent?) {
        intent ?: return
        val graph = (application as EimirNativeApplication).graph
        when (intent.action) {
            Intent.ACTION_SEND -> pendingEntryText.value = intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_VIEW -> {
                val data = intent.data ?: return
                if (data.scheme == "https" && EntryLinkParser.parse(data.toString(), graph.origin) != null) {
                    pendingEntryText.value = data.toString()
                } else if (data.scheme == BuildConfig.APPLICATION_ID.removeSuffix(".debug")) {
                    lifecycleScope.launch {
                        graph.sessions.state.first { it != AuthState.Restoring }
                        pendingNavigation.value = data
                    }
                }
            }
        }
        // The proof must not survive in the retained intent (e.g. after recreation).
        intent.data = null
        intent.removeExtra(Intent.EXTRA_TEXT)
    }
}
