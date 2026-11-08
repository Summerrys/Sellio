package com.base6985959ce9aaceadb8b7cc41.app;

import android.content.Context;
import android.graphics.Color;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Android's own pull to refresh around Sellio's web view (Alvin, 8 Nov 2026), in
 * res/layout/capacitor_bridge_layout_main.xml. SellioRefreshPlugin tells the page when a pull
 * was let go and stops the circle when the page has refreshed.
 *
 * Only the page knows where a pull may start (not in an open window, a text box, a map, a list
 * that is scrolled down...), so at each touch it answers for the finger that just landed
 * (setTouchVerdict). Until it has, that finger can't start a pull. Sideways swipes and two
 * fingers never start one either.
 */
public class SellioRefreshLayout extends SwipeRefreshLayout {

    private static final int UNKNOWN = 0;
    private static final int ALLOWED = 1;
    private static final int BLOCKED = 2;
    // Sellio's loading dots: orange, pink, purple.
    private static final int[] SELLIO_COLOURS = { 0xFFFB923C, 0xFFE0449A, 0xFF8B2FC9 };

    private final int touchSlop;
    private final float density;
    private volatile int verdict = UNKNOWN;
    private volatile float downX;
    private volatile float downY;
    private boolean atDown;
    private boolean pulling;
    private boolean sideways;
    private boolean twoFingers;
    private int circleStart = Integer.MIN_VALUE;
    private WebView page;

    public SellioRefreshLayout(@NonNull Context context) {
        this(context, null);
    }

    public SellioRefreshLayout(@NonNull Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        touchSlop = ViewConfiguration.get(context).getScaledTouchSlop();
        density = context.getResources().getDisplayMetrics().density;
        setColorSchemeColors(SELLIO_COLOURS);
        setProgressBackgroundColorSchemeColor(Color.WHITE);
    }

    /**
     * The page's answer for the finger that landed at (x, y), in this view's pixels. An answer
     * that arrives late, for an earlier finger elsewhere, is ignored; the first answer stands.
     */
    void setTouchVerdict(boolean allowed, float x, float y) {
        float near = 4 * density;
        if (verdict == UNKNOWN && Math.abs(x - downX) <= near && Math.abs(y - downY) <= near) {
            verdict = allowed ? ALLOWED : BLOCKED;
        }
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            verdict = UNKNOWN;
            downX = event.getX();
            downY = event.getY();
            pulling = false;
            sideways = false;
            twoFingers = false;
        } else if (action == MotionEvent.ACTION_POINTER_DOWN && !pulling) {
            twoFingers = true;
        } else if (action == MotionEvent.ACTION_MOVE && !pulling && !sideways) {
            float dx = Math.abs(event.getX() - downX);
            float dy = Math.abs(event.getY() - downY);
            if (dx > touchSlop && dx > dy) sideways = true;
        }
        atDown = action == MotionEvent.ACTION_DOWN;
        try {
            return super.dispatchTouchEvent(event);
        } finally {
            atDown = false;
        }
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        boolean intercept = super.onInterceptTouchEvent(event);
        if (intercept) pulling = true;
        return intercept;
    }

    @Override
    public boolean canChildScrollUp() {
        if (pulling) return false; // this pull has started: let it finish
        WebView web = page();
        if (web == null) return true;
        if (web.canScrollVertically(-1)) return true; // scrolled down: the page scrolls up first
        if (atDown) return false; // note where the finger landed
        return verdict != ALLOWED || sideways || twoFingers;
    }

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        placeCircle();
        super.onLayout(changed, left, top, right, bottom);
    }

    private WebView page() {
        if (page == null) {
            for (int i = 0; i < getChildCount(); i++) {
                View child = getChildAt(i);
                if (child instanceof WebView) {
                    page = (WebView) child;
                    break;
                }
            }
        }
        return page;
    }

    /**
     * The circle comes out just under Sellio's top bar: 56 dp (64 on wide screens, the website's
     * desktop bar), below the status bar when the page is drawn under it. It grows as it comes.
     */
    private void placeCircle() {
        if (pulling || isRefreshing()) return;
        int statusBar = 0;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(this);
        if (insets != null) {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            statusBar = bars.top;
        }
        int[] at = new int[2];
        getLocationInWindow(at);
        int under = Math.max(0, statusBar - at[1]);
        int topBar = Math.round((getWidth() / density >= 1024 ? 64 : 56) * density);
        int start = under + topBar - Math.round(8 * density);
        if (start == circleStart) return;
        circleStart = start;
        setProgressViewOffset(true, start, start + Math.round(24 * density));
    }
}
