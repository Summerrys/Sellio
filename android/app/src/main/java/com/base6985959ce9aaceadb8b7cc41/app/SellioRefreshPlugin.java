package com.base6985959ce9aaceadb8b7cc41.app;

import android.view.ViewParent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Sellio's pull to refresh, the honeycomb (SellioRefreshLayout), and the page
 * (src/lib/nativeRefresh.js, PullToRefresh.jsx):
 * - touch({allowed, x, y}): the page's answer, at each touch, for the finger that just landed.
 * - "refresh": a pull was let go; the page refreshes.
 * - finish(): the page has refreshed; the circle goes.
 */
@CapacitorPlugin(name = "SellioRefresh")
public class SellioRefreshPlugin extends Plugin {

    private static final String TAG = "SellioRefresh";
    // A refresh the page never says is done stops after this long.
    private static final long GIVE_UP_MS = 20000;

    private SellioRefreshLayout layout;
    private final Runnable giveUp = () -> stop("the page did not finish in time");

    @Override
    public void load() {
        ViewParent parent = getBridge().getWebView().getParent();
        if (!(parent instanceof SellioRefreshLayout)) {
            Logger.warn(TAG, "the web view is not in SellioRefreshLayout: no pull to refresh");
            return;
        }
        layout = (SellioRefreshLayout) parent;
        layout.setOnRefreshListener(() -> {
            if (!hasListeners("refresh")) {
                stop("the page is not listening");
                return;
            }
            Logger.info(TAG, "pulled: refreshing");
            layout.removeCallbacks(giveUp);
            layout.postDelayed(giveUp, GIVE_UP_MS);
            notifyListeners("refresh", new JSObject());
        });
    }

    @PluginMethod
    public void touch(PluginCall call) {
        Float x = call.getFloat("x");
        Float y = call.getFloat("y");
        if (layout != null && x != null && y != null) {
            layout.setTouchVerdict(Boolean.TRUE.equals(call.getBoolean("allowed", false)), x, y);
        }
        call.resolve();
    }

    @PluginMethod
    public void finish(PluginCall call) {
        if (layout != null) layout.post(() -> stop(null));
        call.resolve();
    }

    private void stop(String why) {
        if (layout == null) return;
        layout.removeCallbacks(giveUp);
        if (why != null && layout.isRefreshing()) Logger.warn(TAG, "stopped: " + why);
        layout.setRefreshing(false);
    }
}
