package de.eimir.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class RendererRecoveryTest {
    @Test
    public void aColdOrConfirmedForegroundLossRequiresAnExplicitDecision() {
        RendererRecovery cold = new RendererRecovery(false);
        cold.lost(false, false);
        assertEquals(RendererRecovery.Action.PROMPT, cold.take());
        RendererRecovery returned = new RendererRecovery(false);
        returned.stopped();
        returned.rendered();
        returned.lost(false, false);
        assertEquals(RendererRecovery.Action.PROMPT, returned.take());
    }

    @Test
    public void backgroundReclamationCanRecoverUntilTheReturningRendererConfirmsAFrame() {
        RendererRecovery state = new RendererRecovery(false);
        state.rendered();
        state.stopped();
        // Lifecycle resume alone cannot establish renderer health.
        state.lost(false, false);
        assertEquals(RendererRecovery.Action.RECREATE, state.take());
        assertTrue(state.attempted());
        assertEquals(RendererRecovery.Action.NONE, state.take());
    }

    @Test
    public void realCrashesAndInterruptedSelectionsRemainExplicitEvenInTheBackground() {
        for (boolean crash : new boolean[] {false, true}) {
            RendererRecovery state = new RendererRecovery(false);
            state.stopped();
            state.lost(crash, !crash);
            assertEquals(RendererRecovery.Action.PROMPT, state.take());
            assertFalse(state.attempted());
        }
    }

    @Test
    public void recreationCarriesItsBudgetAndCannotRearmBeforeAHealthyVisit() {
        RendererRecovery first = new RendererRecovery(false);
        first.stopped();
        first.lost(false, false);
        assertEquals(RendererRecovery.Action.RECREATE, first.take());
        RendererRecovery next = new RendererRecovery(first.attempted());
        next.stopped();
        next.lost(false, false);
        assertEquals(RendererRecovery.Action.PROMPT, next.take());
    }

    @Test
    public void aLaterHealthyBackgroundVisitCanRecoverAgain() {
        RendererRecovery state = new RendererRecovery(true);
        state.rendered();
        state.stopped();
        state.lost(false, false);
        assertEquals(RendererRecovery.Action.RECREATE, state.take());
    }
}
