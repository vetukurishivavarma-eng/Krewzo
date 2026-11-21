package in.krewzo.partner;

import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;

// Bridge for the native job alerts: session (server, token, worker-language strings) + the two permissions they use.
@CapacitorPlugin(name = "Krewzo")
public class KrewzoNative extends Plugin {
    private static KrewzoNative instance;

    @Override
    public void load() { instance = this; }

    // Native accept/skip happened: tell the web layer to reload (kept until a listener picks it up).
    static void refresh() { if (instance != null) instance.notifyListeners("refresh", new JSObject(), true); }

    @PluginMethod
    public void setSession(PluginCall call) {
        SharedPreferences.Editor e = JobAlerts.prefs(getContext()).edit().clear();
        String token = call.getString("token");
        if (token != null) {
            e.putString("server", call.getString("server", "")).putString("token", token);
            JSObject s = call.getObject("strings", new JSObject());
            for (Iterator<String> it = s.keys(); it.hasNext(); ) { String k = it.next(); e.putString("s_" + k, s.optString(k)); }
        }
        e.apply();
        call.resolve();
    }

    @PluginMethod
    public void alertStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("overlay", Settings.canDrawOverlays(getContext()));
        r.put("fullScreen", Build.VERSION.SDK_INT < 34 || getContext().getSystemService(NotificationManager.class).canUseFullScreenIntent());
        call.resolve(r);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        open(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) open(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName())));
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        open(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
        call.resolve();
    }

    private void open(Intent i) {
        try { getActivity().startActivity(i); }
        catch (Exception ex) { getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()))); }
    }
}
