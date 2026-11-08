package com.base6985959ce9aaceadb8b7cc41.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * Sellio's pull to refresh around the web view (Alvin, 8 Nov 2026), in
 * res/layout/capacitor_bridge_layout_main.xml: the honeycomb (HoneycombView) comes out from
 * under Sellio's top bar over the page, with nothing behind it; the page stays still. While you
 * pull it builds ring by ring and turns until a tip is at 12 o'clock; let go past 64 dp and it
 * ripples until the page has refreshed (SellioRefreshPlugin), then shrinks away.
 *
 * Where a pull may start is the page's to say (PullGesture): at each touch it answers for the
 * finger that just landed (setTouchVerdict); until it has, that finger can't pull.
 */
public class SellioRefreshLayout extends FrameLayout {

    /** A pull was let go far enough: the page should refresh. */
    public interface OnRefreshListener {
        void onRefresh();
    }

    private static final int SIZE_DP = 48;
    // The honeycomb's top, from the top bar's bottom: where it starts and where it rests.
    private static final int START_DP = -8;
    private static final int REST_DP = 14;
    private static final long SETTLE_MS = 200;
    private static final long LEAVE_MS = 180;

    private final float density;
    private final PullGesture gesture;
    private final DecelerateInterpolator decelerate = new DecelerateInterpolator(2f);
    private HoneycombView honeycomb;
    private WebView page;
    private OnRefreshListener listener;
    private boolean refreshing;
    private boolean busy; // the honeycomb is settling, leaving or going back
    private int activePointer = -1;
    private int topBar = Integer.MIN_VALUE;

    public SellioRefreshLayout(@NonNull Context context) {
        this(context, null);
    }

    public SellioRefreshLayout(@NonNull Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        density = context.getResources().getDisplayMetrics().density;
        gesture = new PullGesture(ViewConfiguration.get(context).getScaledTouchSlop(), density);
    }

    @Override
    protected void onFinishInflate() {
        super.onFinishInflate();
        int size = dp(SIZE_DP);
        honeycomb = new HoneycombView(getContext());
        honeycomb.setVisibility(INVISIBLE);
        addView(honeycomb, new LayoutParams(size, size, Gravity.TOP | Gravity.CENTER_HORIZONTAL));
    }

    public void setOnRefreshListener(@Nullable OnRefreshListener listener) {
        this.listener = listener;
    }

    public boolean isRefreshing() {
        return refreshing;
    }

    /** Only to stop: the page has refreshed, so the honeycomb shrinks away. */
    public void setRefreshing(boolean on) {
        if (on || !refreshing) return;
        refreshing = false;
        leave();
    }

    /** The page's answer for the finger that landed at (x, y), in this view's pixels. */
    void setTouchVerdict(boolean allowed, float x, float y) {
        gesture.answer(allowed, x, y);
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        int action = event.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) {
            gesture.down(event.getX(), event.getY(), pageAtTop());
            activePointer = event.getPointerId(0);
        } else if (action == MotionEvent.ACTION_POINTER_DOWN) {
            gesture.secondFinger();
        }
        return super.dispatchTouchEvent(event);
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent event) {
        if (!isEnabled() || refreshing || busy) return false;
        if (event.getActionMasked() != MotionEvent.ACTION_MOVE) return false;
        int index = event.findPointerIndex(activePointer);
        if (index < 0) return false;
        return gesture.starts(event.getX(index), event.getY(index), pageAtTop());
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (!gesture.pulling()) return false;
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_MOVE: {
                int index = event.findPointerIndex(activePointer);
                if (index >= 0) showPull(gesture.pullTo(event.getY(index)));
                return true;
            }
            case MotionEvent.ACTION_POINTER_UP: {
                int lifted = event.getActionIndex();
                if (event.getPointerId(lifted) == activePointer) {
                    int next = lifted == 0 ? 1 : 0;
                    activePointer = event.getPointerId(next);
                    gesture.carryOn(event.getY(next));
                }
                return true;
            }
            case MotionEvent.ACTION_UP:
                if (gesture.release()) startRefreshing();
                else goBack();
                return true;
            case MotionEvent.ACTION_CANCEL:
                gesture.cancel();
                goBack();
                return true;
            default:
                return true;
        }
    }

    // The page decides where pulls start (the page's answers); its own requests to keep the
    // gesture from this view would stop pulls that the page has already allowed.
    @Override
    public void requestDisallowInterceptTouchEvent(boolean disallow) {}

    @Override
    protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        super.onLayout(changed, left, top, right, bottom);
        placeTopBar();
    }

    @Override
    protected void onDetachedFromWindow() {
        if (honeycomb != null) {
            honeycomb.animate().cancel();
            honeycomb.stopRipple();
        }
        super.onDetachedFromWindow();
    }

    private void showPull(float pull) {
        float trigger = gesture.trigger();
        float progress = Math.min(1f, pull / trigger);
        float extra = Math.min(pull - trigger, 2 * trigger);
        float y = topBar + dp(START_DP) + (dp(REST_DP) - dp(START_DP)) * progress + Math.max(0f, extra) * 0.25f;
        honeycomb.animate().cancel();
        honeycomb.setVisibility(VISIBLE);
        honeycomb.setTranslationY(y);
        float scale = 0.4f + 0.6f * progress;
        honeycomb.setScaleX(scale);
        honeycomb.setScaleY(scale);
        honeycomb.setProgress(progress);
    }

    private void startRefreshing() {
        refreshing = true;
        busy = true;
        honeycomb.startRipple();
        honeycomb.animate().translationY(topBar + dp(REST_DP)).scaleX(1f).scaleY(1f)
            .setDuration(SETTLE_MS).setInterpolator(decelerate)
            .withEndAction(() -> busy = false).start();
        if (listener != null) listener.onRefresh();
    }

    private void leave() {
        busy = true;
        honeycomb.animate().cancel();
        honeycomb.animate().scaleX(0f).scaleY(0f).setDuration(LEAVE_MS).setInterpolator(decelerate)
            .withEndAction(this::hide).start();
    }

    private void goBack() {
        busy = true;
        honeycomb.animate().cancel();
        honeycomb.animate().translationY(topBar + dp(START_DP)).scaleX(0f).scaleY(0f)
            .setDuration(LEAVE_MS).setInterpolator(decelerate)
            .withEndAction(this::hide).start();
    }

    private void hide() {
        honeycomb.stopRipple();
        honeycomb.setProgress(0f);
        honeycomb.setVisibility(INVISIBLE);
        busy = false;
    }

    private boolean pageAtTop() {
        WebView web = page();
        return web != null && !web.canScrollVertically(-1);
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
     * The bottom of Sellio's top bar: 56 dp (64 on wide screens, the website's desktop bar),
     * below the status bar when the page is drawn under it.
     */
    private void placeTopBar() {
        int statusBar = 0;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(this);
        if (insets != null) {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout());
            statusBar = bars.top;
        }
        int[] at = new int[2];
        getLocationInWindow(at);
        int under = Math.max(0, statusBar - at[1]);
        topBar = under + dp(getWidth() / density >= 1024 ? 64 : 56);
    }

    private int dp(float value) {
        return Math.round(value * density);
    }
}
