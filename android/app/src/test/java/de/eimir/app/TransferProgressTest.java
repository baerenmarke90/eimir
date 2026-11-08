package de.eimir.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class TransferProgressTest {
    @Test public void firstAndFinalProgressAreImmediateDuringAFastTransfer() {
        TransferProgress progress = new TransferProgress();
        assertFalse(progress.advance(0, 0));
        assertTrue(progress.advance(1, 0));
        for (int percent = 2; percent < 99; percent++)
            assertFalse(progress.advance(percent, percent));
        assertTrue(progress.advance(99, 99));
        assertFalse(progress.advance(99, 100));
    }

    @Test public void sustainedProgressPublishesAtMostOncePerSecondWithoutRepeats() {
        TransferProgress progress = new TransferProgress();
        assertTrue(progress.advance(2, 100));
        assertFalse(progress.advance(3, 1099));
        assertTrue(progress.advance(7, 1100));
        assertFalse(progress.advance(7, 2100));
        assertTrue(progress.advance(8, 2100));
        assertTrue(progress.advance(99, 2101));
    }
}
