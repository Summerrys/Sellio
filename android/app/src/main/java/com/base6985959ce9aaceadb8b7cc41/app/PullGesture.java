package com.base6985959ce9aaceadb8b7cc41.app;

/**
 * When a finger on the page becomes a pull to refresh (SellioRefreshLayout), without any
 * Android code so it can be checked on its own (verification/native-pull/PullChecks.java).
 *
 * Only the page knows where a pull may start (not in an open window, a text box, a map, a list
 * that is scrolled down...), so it answers for each finger as it lands (answer); until it has,
 * that finger can't pull. A late answer for an earlier finger elsewhere is ignored, and the
 * first answer stands. The page must be at its top; sideways swipes and second fingers never
 * pull. As in Android's own pull: the pull starts past the touch slop, counts half the finger's
 * travel, and refreshes when let go past 64 dp.
 */
final class PullGesture {

    static final float DRAG_RATE = 0.5f;
    static final float TRIGGER_DP = 64f;

    private static final int UNKNOWN = 0;
    private static final int ALLOWED = 1;
    private static final int BLOCKED = 2;

    private final float touchSlop;
    private final float near;
    private final float trigger;

    private volatile int answer = UNKNOWN;
    private volatile float downX;
    private volatile float downY;
    private boolean atTopOnDown;
    private boolean sideways;
    private boolean twoFingers;
    private boolean pulling;
    private float startY;
    private float pull;

    PullGesture(float touchSlop, float density) {
        this.touchSlop = touchSlop;
        this.near = 4 * density;
        this.trigger = TRIGGER_DP * density;
    }

    /** A finger lands at (x, y). */
    void down(float x, float y, boolean pageAtTop) {
        answer = UNKNOWN;
        downX = x;
        downY = y;
        atTopOnDown = pageAtTop;
        sideways = false;
        twoFingers = false;
        pulling = false;
        pull = 0;
    }

    /** Another finger lands. */
    void secondFinger() {
        if (!pulling) twoFingers = true;
    }

    /** The page's answer for the finger that landed at (x, y). */
    void answer(boolean allowed, float x, float y) {
        if (answer == UNKNOWN && Math.abs(x - downX) <= near && Math.abs(y - downY) <= near) {
            answer = allowed ? ALLOWED : BLOCKED;
        }
    }

    /** The finger moves to (x, y) before a pull has started: true when the pull starts now. */
    boolean starts(float x, float y, boolean pageAtTop) {
        if (pulling) return true;
        if (!sideways) {
            float dx = Math.abs(x - downX);
            float dy = Math.abs(y - downY);
            if (dx > touchSlop && dx > dy) sideways = true;
        }
        if (!atTopOnDown || !pageAtTop || sideways || twoFingers || answer != ALLOWED) return false;
        if (y - downY > touchSlop) {
            pulling = true;
            startY = downY + touchSlop;
            return true;
        }
        return false;
    }

    /** While pulling, the finger is at y: how far it has pulled (half the travel, never below 0). */
    float pullTo(float y) {
        pull = Math.max(0, (y - startY) * DRAG_RATE);
        return pull;
    }

    /** The pulling finger lifted and another one carries on at y: the pull stays where it was. */
    void carryOn(float y) {
        startY = y - pull / DRAG_RATE;
    }

    float pull() {
        return pull;
    }

    float trigger() {
        return trigger;
    }

    boolean pulling() {
        return pulling;
    }

    /** The finger lifted: true when it was pulled far enough to refresh. */
    boolean release() {
        boolean refresh = pulling && pull > trigger;
        pulling = false;
        return refresh;
    }

    void cancel() {
        pulling = false;
    }
}
