package com.base6985959ce9aaceadb8b7cc41.app;

/**
 * The pull-to-refresh honeycomb's shape, ripple and colours (Alvin, 8 Nov 2026), without any
 * Android code so it can be checked on its own (verification/native-pull/PullChecks.java).
 *
 * From the "socket" loader on Uiverse.io by PhyoTP (MIT): hexagons 30 units across, 2 apart,
 * whose rings shrink and grow outward from the middle every 2 s. Sellio's version keeps the
 * middle and two rings (19 hexagons), turns the whole by 30° so a tip of the honeycomb is at
 * 12 o'clock, shrinks each hexagon to 35% rather than to nothing, and colours each ring by its
 * size along Sellio's gradient: orange at full size, pink, then purple at its smallest.
 */
final class HoneycombMath {

    private HoneycombMath() {}

    /** x, y (units, from the middle) and ring of each hexagon. */
    static final int[][] CELLS = {
        { 0, 0, 0 },
        { -32, 0, 1 }, { -16, -28, 1 }, { 16, -28, 1 }, { 32, 0, 1 }, { -16, 28, 1 }, { 16, 28, 1 },
        { -48, -28, 2 }, { 48, -28, 2 }, { 0, 56, 2 }, { -48, 28, 2 }, { 48, 28, 2 }, { 0, -56, 2 },
        { -32, -56, 2 }, { 32, -56, 2 }, { -32, 56, 2 }, { 32, 56, 2 }, { -64, 0, 2 }, { 64, 0, 2 },
    };
    static final int RINGS = 3;
    /** The honeycomb fits in a square this many units across. */
    static final float SPAN = 168f;
    /** Turned so a tip is at 12 o'clock. */
    static final float TURN_DEGREES = 30f;
    static final float SMALLEST = 0.35f;
    static final long CYCLE_MS = 2000;
    static final long STAGGER_MS = 200;
    /** One hexagon, pointy at top and bottom, 30 units across its flat sides. */
    static final float[] HEXAGON = hexagon(30f);

    static final int ORANGE = 0xFFFB923C;
    static final int PINK = 0xFFE0449A;
    static final int PURPLE = 0xFF8B2FC9;

    private static float[] hexagon(float across) {
        float side = (float) (across / Math.sqrt(3));
        float half = across / 2f;
        return new float[] { 0, -side, half, -side / 2, half, side / 2, 0, side, -half, side / 2, -half, -side / 2 };
    }

    /** A ring's size while pulling: each ring grows in its third of the pull, from the middle out. */
    static float buildScale(float progress, int ring) {
        return clamp((progress - ring / (float) RINGS) * RINGS, 0f, 1f);
    }

    /** A ring's size while refreshing, ms after it started: 100% to 35% and back every 2 s, CSS's "ease". */
    static float rippleScale(long ms, int ring) {
        long t = ms - ring * STAGGER_MS;
        if (t <= 0) return 1f;
        float k = (t % CYCLE_MS) / (float) CYCLE_MS;
        if (k < 0.5f) return 1f + (SMALLEST - 1f) * ease(k / 0.5f);
        return SMALLEST + (1f - SMALLEST) * ease((k - 0.5f) / 0.5f);
    }

    /** A ring's colour from its size: orange at full size, pink, purple at its smallest (or the other way round). */
    static int colourFor(float scale, boolean orangeWhenBig) {
        float f = clamp((1f - scale) / (1f - SMALLEST), 0f, 1f);
        if (!orangeWhenBig) f = 1f - f;
        return f <= 0.5f ? mix(ORANGE, PINK, f * 2f) : mix(PINK, PURPLE, (f - 0.5f) * 2f);
    }

    /** CSS's "ease", cubic-bezier(0.25, 0.1, 0.25, 1). */
    static float ease(float u) {
        if (u <= 0f) return 0f;
        if (u >= 1f) return 1f;
        final double cx = 3 * 0.25, bx = 3 * (0.25 - 0.25) - cx, ax = 1 - cx - bx;
        final double cy = 3 * 0.1, by = 3 * (1 - 0.1) - cy, ay = 1 - cy - by;
        double t = u;
        for (int i = 0; i < 8; i++) {
            double x = ((ax * t + bx) * t + cx) * t - u;
            double dx = (3 * ax * t + 2 * bx) * t + cx;
            if (Math.abs(x) < 1e-7 || Math.abs(dx) < 1e-6) break;
            t -= x / dx;
        }
        t = Math.max(0, Math.min(1, t));
        return (float) (((ay * t + by) * t + cy) * t);
    }

    static int mix(int from, int to, float t) {
        int r = Math.round(((from >> 16) & 0xFF) + (((to >> 16) & 0xFF) - ((from >> 16) & 0xFF)) * t);
        int g = Math.round(((from >> 8) & 0xFF) + (((to >> 8) & 0xFF) - ((from >> 8) & 0xFF)) * t);
        int b = Math.round((from & 0xFF) + ((to & 0xFF) - (from & 0xFF)) * t);
        return 0xFF000000 | (r << 16) | (g << 8) | b;
    }

    static float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }
}
