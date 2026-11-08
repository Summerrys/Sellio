package com.base6985959ce9aaceadb8b7cc41.app;

/**
 * The Android pull to refresh's own logic, without Android: the honeycomb (HoneycombMath) and
 * when a finger becomes a pull (PullGesture). Run by verification/native-refresh.test.mjs:
 * javac -d <dir> HoneycombMath.java PullGesture.java PullChecks.java; java -cp <dir> ...PullChecks
 */
public final class PullChecks {

    private static int passes = 0;

    private static void check(boolean ok, String what) {
        if (!ok) throw new AssertionError(what);
    }

    private static void near(double actual, double expected, double within, String what) {
        if (Math.abs(actual - expected) > within) throw new AssertionError(what + ": " + actual + ", expected " + expected);
    }

    private static void passed(String what) {
        passes++;
        System.out.println("PASS " + what);
    }

    public static void main(String[] args) {
        // ── The honeycomb ──────────────────────────────────────────────────────────────
        int[][] cells = HoneycombMath.CELLS;
        check(cells.length == 19, "19 hexagons");
        int[] perRing = new int[3];
        double farthest = 0;
        for (int[] c : cells) {
            perRing[c[2]]++;
            int row = Math.round(c[1] / 28f);
            check(c[1] == row * 28, "on a row: " + c[0] + "," + c[1]);
            float column = (c[0] - row * 16) / 32f;
            check(column == Math.round(column), "on a column: " + c[0] + "," + c[1]);
            int q = Math.round(column);
            int s = -q - row;
            check(Math.max(Math.abs(q), Math.max(Math.abs(row), Math.abs(s))) == c[2], "in its ring: " + c[0] + "," + c[1]);
            farthest = Math.max(farthest, Math.hypot(c[0], c[1]));
        }
        check(perRing[0] == 1 && perRing[1] == 6 && perRing[2] == 12, "the middle, then rings of 6 and 12 (the loader's outer ring gone)");
        float[] hex = HoneycombMath.HEXAGON;
        near(hex[2] - hex[10], 30, 1e-4, "each hexagon 30 units across its flat sides, as the loader's");
        check(farthest + Math.hypot(hex[0], hex[1]) <= HoneycombMath.SPAN / 2, "the whole honeycomb fits its square");
        // Turned 30° (clockwise, as Android's canvas turns), one corner hexagon of the honeycomb
        // is the highest, straight up at 12 o'clock, clear of the rest.
        double turn = Math.toRadians(HoneycombMath.TURN_DEGREES), topX = 0, topY = Double.MAX_VALUE, nextY = Double.MAX_VALUE;
        for (int[] c : cells) {
            double tx = c[0] * Math.cos(turn) - c[1] * Math.sin(turn), ty = c[0] * Math.sin(turn) + c[1] * Math.cos(turn);
            if (ty < topY) { nextY = topY; topY = ty; topX = tx; } else if (ty < nextY) nextY = ty;
        }
        near(topX, 0, 0.5, "after the turn a tip of the honeycomb is at 12 o'clock");
        check(nextY - topY > 10, "a tip: one hexagon clearly highest");
        passed("The honeycomb: 19 hexagons in the loader's grid, turned so a tip is at 12 o'clock");

        // ── The ripple: 100% -> 35% -> 100% every 2 s, CSS "ease", rings 0.2 s apart ──────
        near(HoneycombMath.rippleScale(0, 0), 1, 1e-6, "starts at full size");
        near(HoneycombMath.rippleScale(1000, 0), 0.35, 1e-4, "smallest half way through");
        near(HoneycombMath.rippleScale(2000, 0), 1, 1e-4, "back to full size after 2 s");
        near(HoneycombMath.rippleScale(500, 0), 1 - 0.65 * 0.802403387584857, 1e-3, "CSS's ease, a quarter of the way through");
        near(HoneycombMath.rippleScale(1500, 0), 0.35 + 0.65 * 0.802403387584857, 1e-3, "and three quarters");
        near(HoneycombMath.rippleScale(150, 1), 1, 1e-6, "the first ring waits 0.2 s");
        near(HoneycombMath.rippleScale(1200, 1), 0.35, 1e-4, "then follows 0.2 s behind");
        near(HoneycombMath.rippleScale(1400, 2), 0.35, 1e-4, "the outer ring 0.4 s behind");
        near(HoneycombMath.rippleScale(1000 + 2000 * 7, 0), 0.35, 1e-4, "and keeps going");
        passed("The ripple: your loader's timing, shrinking to 35%");

        // ── The colours follow each ring's size (X: orange when big) ──────────────────────
        check(HoneycombMath.colourFor(1f, true) == 0xFFFB923C, "orange at full size");
        check(HoneycombMath.colourFor(0.675f, true) == 0xFFE0449A, "pink half way down");
        check(HoneycombMath.colourFor(0.35f, true) == 0xFF8B2FC9, "purple at its smallest");
        check(HoneycombMath.colourFor(0.1f, true) == 0xFF8B2FC9, "purple while still growing in");
        check(HoneycombMath.colourFor(1f, false) == 0xFF8B2FC9, "Y would be the other way round");
        int midway = HoneycombMath.colourFor(0.8375f, true);
        check(midway != 0xFFFB923C && midway != 0xFFE0449A, "between orange and pink, a blend");
        passed("The colours follow each ring's size: orange at full size, pink, purple at its smallest");

        // ── While pulling it builds from the middle out ──────────────────────────────────
        near(HoneycombMath.buildScale(0f, 0), 0, 1e-6, "nothing at first");
        near(HoneycombMath.buildScale(1f / 6, 0), 0.5, 1e-4, "the middle grows first");
        near(HoneycombMath.buildScale(1f / 3, 0), 1, 1e-4, "the middle is whole a third of the way");
        near(HoneycombMath.buildScale(1f / 3, 1), 0, 1e-4, "before the first ring starts");
        near(HoneycombMath.buildScale(0.5f, 1), 0.5, 1e-4, "the first ring half grown half way");
        near(HoneycombMath.buildScale(0.9f, 2), 0.7, 1e-4, "the outer ring last");
        near(HoneycombMath.buildScale(1.4f, 2), 1, 1e-6, "never past full size");
        passed("While pulling it builds from the middle out, ring by ring");

        // ── When a finger becomes a pull ─────────────────────────────────────────────────
        float density = 2.625f, slop = 8 * density, trigger = 64 * density;
        PullGesture g = new PullGesture(slop, density);
        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(!g.starts(540, 300 + slop, true), "not before the touch slop");
        check(g.starts(540, 300 + slop + 1, true), "the pull starts past the touch slop");
        near(g.pullTo(300 + slop + 100), 50, 1e-3, "it counts half the finger's travel");
        near(g.pullTo(300), 0, 1e-6, "never below nothing");
        g.pullTo(300 + slop + 2 * trigger - 2);
        check(!g.release(), "let go short of 64 dp: no refresh");
        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(g.starts(540, 330, true), "starts");
        g.pullTo(300 + slop + 2 * trigger + 2);
        check(g.release(), "let go past 64 dp: refresh");
        check(!g.pulling(), "and it's over");
        passed("A pull starts past the touch slop, counts half the travel, and refreshes past 64 dp");

        g.down(540, 300, true);
        check(!g.starts(540, 400, true), "no answer from the page yet: no pull");
        g.answer(true, 540, 300);
        check(g.starts(540, 410, true), "once the page allows it, the next move pulls");
        g.down(540, 300, true);
        g.answer(false, 540, 300);
        check(!g.starts(540, 450, true), "the page said no (a text box, a window, a scrolled list...)");
        g.answer(true, 540, 300);
        check(!g.starts(540, 460, true), "the first answer stands");
        g.down(540, 300, true);
        g.answer(true, 100, 900);
        check(!g.starts(540, 450, true), "a late answer for an earlier finger elsewhere doesn't count");
        g.answer(true, 541, 302);
        check(g.starts(540, 460, true), "the answer for this finger does");
        passed("Only the page's answer for this finger lets it pull; the first answer stands; late ones for other fingers don't count");

        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(!g.starts(610, 320, true), "a sideways swipe");
        check(!g.starts(610, 500, true), "never becomes a pull");
        g.down(540, 300, true);
        g.answer(true, 540, 300);
        g.secondFinger();
        check(!g.starts(540, 500, true), "two fingers never pull");
        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(g.starts(540, 330, true), "starts");
        g.secondFinger();
        check(g.pulling(), "a second finger after the pull started doesn't stop it");
        g.down(540, 300, false);
        g.answer(true, 540, 300);
        check(!g.starts(540, 500, true), "the page wasn't at its top when the finger landed");
        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(!g.starts(540, 500, false), "the page scrolled since");
        passed("Sideways swipes, second fingers and a page that isn't at its top never pull");

        g.down(540, 300, true);
        g.answer(true, 540, 300);
        check(g.starts(540, 330, true), "starts");
        float pulled = g.pullTo(600);
        g.carryOn(200);
        near(g.pullTo(200), pulled, 1e-3, "when the pulling finger lifts, another carries on from the same pull");
        g.cancel();
        check(!g.pulling() && !g.release(), "a cancelled pull doesn't refresh");
        passed("Another finger carries on a pull; a cancelled pull doesn't refresh");

        System.out.println(passes + " pull checks passed");
    }
}
