package com.base6985959ce9aaceadb8b7cc41.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Sellio's pull to refresh, the honeycomb (SellioRefreshLayout, around the web view in
        // res/layout/capacitor_bridge_layout_main.xml).
        registerPlugin(SellioRefreshPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
