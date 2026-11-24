package de.eimir.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class AutofillFocusGateTest {
    @Test public void focusChangesPassThroughWithoutSuggestions() {
        AutofillFocusGate gate = new AutofillFocusGate();
        assertTrue(gate.shouldForward(false));
        assertTrue(gate.shouldForward(true));
    }

    @Test public void aFocusLossBehindOpenSuggestionsIsHeldBack() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        assertFalse(gate.shouldForward(false));
    }

    @Test public void gainingFocusIsAlwaysForwarded() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        assertTrue(gate.shouldForward(true));
    }

    @Test public void closingSuggestionsReplaysAHeldLossOnce() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        gate.shouldForward(false);
        assertTrue(gate.onSuggestions(false));
        assertFalse(gate.onSuggestions(false));
    }

    @Test public void aRegainedFocusNeedsNoReplay() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        gate.shouldForward(false);
        gate.shouldForward(true);
        assertFalse(gate.onSuggestions(false));
    }

    @Test public void closingSuggestionsWithoutALossReplaysNothing() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        assertFalse(gate.onSuggestions(false));
    }

    @Test public void aLossAfterTheSuggestionsClosedIsForwarded() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        gate.onSuggestions(false);
        assertTrue(gate.shouldForward(false));
    }

    @Test public void resetForgetsHeldState() {
        AutofillFocusGate gate = new AutofillFocusGate();
        gate.onSuggestions(true);
        gate.shouldForward(false);
        gate.reset();
        assertTrue(gate.shouldForward(false));
        assertFalse(gate.onSuggestions(false));
    }
}
