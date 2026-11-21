package in.krewzo.partner;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static volatile boolean visible;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(KrewzoNative.class);
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
    }

    // "Accept" on the job notification opens the app and accepts natively.
    private void handle(Intent i) {
        String id = i == null ? null : i.getStringExtra("krewzo_accept");
        if (id != null) { i.removeExtra("krewzo_accept"); JobAlerts.accept(this, id); }
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
        JobAlerts.dismiss(this, null); // app is open: the in-app alert takes over
    }

    @Override
    public void onPause() {
        super.onPause();
        visible = false;
    }
}
