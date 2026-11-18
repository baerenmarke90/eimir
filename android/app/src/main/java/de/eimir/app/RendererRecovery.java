package de.eimir.app;

/** One recovery per background return; a fresh foreground frame rearms the next visit. */
final class RendererRecovery {
    enum Action { NONE, RECREATE, PROMPT }

    private boolean backgrounded;
    private boolean foregroundFrame;
    private boolean attempted;
    private Action pending = Action.NONE;

    RendererRecovery(boolean attempted) {
        this.attempted = attempted;
    }

    void stopped() {
        backgrounded = true;
        if (foregroundFrame) attempted = false;
        foregroundFrame = false;
    }

    void rendered() {
        backgrounded = false;
        foregroundFrame = true;
    }

    void lost(boolean crashed, boolean selectingMedia) {
        pending = !crashed && backgrounded && !attempted && !selectingMedia
            ? Action.RECREATE : Action.PROMPT;
        if (pending == Action.RECREATE) attempted = true;
        foregroundFrame = false;
    }

    boolean attempted() {
        return attempted;
    }

    Action take() {
        Action action = pending;
        pending = Action.NONE;
        return action;
    }
}
