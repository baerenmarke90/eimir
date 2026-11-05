package de.eimir.nativetest.ui

import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import de.eimir.nativetest.EimirNativeApplication
import de.eimir.nativetest.auth.SignOutReason
import de.eimir.nativetest.ui.session.Gate
import de.eimir.nativetest.ui.session.PendingEntry
import de.eimir.nativetest.ui.session.SessionViewModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** Root gate transitions: restore, Space switch, link handling and sign-out. */
@RunWith(RobolectricTestRunner::class)
@Config(application = FixtureApplication::class)
class SessionGateTest {
    private val graph = ApplicationProvider.getApplicationContext<EimirNativeApplication>().graph

    private fun settle(condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            shadowOf(Looper.getMainLooper()).idle()
            if (condition()) return
            Thread.sleep(20)
        }
        shadowOf(Looper.getMainLooper()).idle()
    }

    @Test
    fun `a restored session with a Space opens the product directly`() {
        val model = SessionViewModel(graph)
        settle { model.gate.value is Gate.Ready }
        assertEquals(Gate.Ready(FixtureBackend.SPACE, "fixture-login"), model.gate.value)
    }

    @Test
    fun `switching Space re-resolves it from the server memberships`() {
        val model = SessionViewModel(graph)
        settle { model.gate.value is Gate.Ready }
        model.switchSpace()
        settle { graph.sessions.session?.activeSpaceId == FixtureBackend.SPACE && model.gate.value is Gate.Ready }
        assertTrue(model.gate.value is Gate.Ready)
        assertTrue(FixtureBackend.requests.any { it.url.encodedPath == "/api/v1/auth/memberships" })
    }

    @Test
    fun `a magic link while signed in asks before replacing the login`() {
        val model = SessionViewModel(graph)
        settle { model.gate.value is Gate.Ready }
        val origin = graph.origin
        assertTrue(model.submitLinkText("$origin/auth/magic-link?token=abc"))
        assertTrue(model.pending.value is PendingEntry.ReplaceLogin)
        model.dismissPending()
        assertEquals(null, model.pending.value)
        assertTrue(model.gate.value is Gate.Ready)
    }

    @Test
    fun `foreign links are rejected without side effects`() {
        val model = SessionViewModel(graph)
        settle { model.gate.value is Gate.Ready }
        assertEquals(false, model.submitLinkText("https://evil.example/auth/magic-link?token=abc"))
        assertTrue(model.signIn.value.linkError)
        assertEquals(null, model.pending.value)
    }

    @Test
    fun `sign-out returns to sign-in and clears the stored session`() {
        val model = SessionViewModel(graph)
        settle { model.gate.value is Gate.Ready }
        model.signOut()
        settle { model.gate.value is Gate.SignIn }
        assertEquals(Gate.SignIn(SignOutReason.UserRequested), model.gate.value)
        assertEquals(null, graph.sessions.session)
    }
}
