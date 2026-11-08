package com.base6985959ce9aaceadb8b7cc41.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.view.View;

/**
 * The pull-to-refresh honeycomb (HoneycombMath): built ring by ring and turned while pulling,
 * rippling while refreshing, each ring coloured by its size. Nothing behind it.
 */
final class HoneycombView extends View {

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path hexagon = new Path();
    private final float[] ringScale = new float[HoneycombMath.RINGS];
    private float progress;
    private boolean rippling;
    private long rippleStart;
    // X: orange at full size, purple at its smallest (Y would be the other way round).
    private static final boolean ORANGE_WHEN_BIG = true;

    HoneycombView(Context context) {
        super(context);
        float[] p = HoneycombMath.HEXAGON;
        hexagon.moveTo(p[0], p[1]);
        for (int i = 2; i < p.length; i += 2) hexagon.lineTo(p[i], p[i + 1]);
        hexagon.close();
        paint.setStyle(Paint.Style.FILL);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    /** While pulling: how much of the honeycomb is built (0 to 1). */
    void setProgress(float progress) {
        this.progress = HoneycombMath.clamp(progress, 0f, 1f);
        invalidate();
    }

    void startRipple() {
        progress = 1f;
        rippling = true;
        rippleStart = SystemClock.uptimeMillis();
        postInvalidateOnAnimation();
    }

    void stopRipple() {
        rippling = false;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        long now = SystemClock.uptimeMillis();
        for (int ring = 0; ring < HoneycombMath.RINGS; ring++) {
            ringScale[ring] = rippling
                ? HoneycombMath.rippleScale(now - rippleStart, ring)
                : HoneycombMath.buildScale(progress, ring);
        }
        float units = Math.min(getWidth(), getHeight()) / HoneycombMath.SPAN;
        canvas.save();
        canvas.translate(getWidth() / 2f, getHeight() / 2f);
        canvas.rotate(HoneycombMath.TURN_DEGREES * (rippling ? 1f : progress));
        canvas.scale(units, units);
        for (int[] cell : HoneycombMath.CELLS) {
            float scale = ringScale[cell[2]];
            if (scale <= 0.01f) continue;
            paint.setColor(HoneycombMath.colourFor(scale, ORANGE_WHEN_BIG));
            canvas.save();
            canvas.translate(cell[0], cell[1]);
            canvas.scale(scale, scale);
            canvas.drawPath(hexagon, paint);
            canvas.restore();
        }
        canvas.restore();
        if (rippling) postInvalidateOnAnimation();
    }
}
