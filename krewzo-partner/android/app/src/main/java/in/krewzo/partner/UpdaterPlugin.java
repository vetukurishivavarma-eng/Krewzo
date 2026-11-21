package in.krewzo.partner;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

// Self-update (see shared/update.js). The APK downloads through Android's DownloadManager, so it keeps going
// while the user leaves the app (progress in the notification bar). A finished file is reused: backing out of
// the installer and tapping Install again opens it instantly.
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/vetukurishivavarma-eng/Krewzo/releases/download/";

    private File apk(String url) {
        return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update-" + Integer.toHexString(url.hashCode()) + ".apk");
    }
    private SharedPreferences prefs() { return getContext().getSharedPreferences("krewzo_update", Context.MODE_PRIVATE); }
    private DownloadManager dm() { return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE); }

    // {status: RUNNING | DONE | FAILED | NONE, pct}
    private JSObject state(String url) {
        JSObject r = new JSObject();
        long id = prefs().getLong(url, -1);
        if (id >= 0) {
            try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
                if (c != null && c.moveToFirst()) {
                    int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    r.put("pct", total > 0 ? (int) (done * 100 / total) : 0);
                    r.put("status", st == DownloadManager.STATUS_SUCCESSFUL ? "DONE" : st == DownloadManager.STATUS_FAILED ? "FAILED" : "RUNNING");
                    return r;
                }
            }
        }
        r.put("pct", 0);
        r.put("status", "NONE");
        return r;
    }

    private void start(String url, String title) {
        JSObject s = state(url);
        if (!"NONE".equals(s.getString("status")) && !"FAILED".equals(s.getString("status"))) return; // already running / done
        File dir = apk(url).getParentFile();
        File[] old = dir == null ? null : dir.listFiles((d, n) -> n.startsWith("update-"));
        if (old != null) for (File f : old) f.delete(); // earlier releases / failed attempts
        long prev = prefs().getLong(url, -1);
        if (prev >= 0) dm().remove(prev);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle(title)
                .setDescription("Downloading update")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, apk(url).getName());
        prefs().edit().clear().putLong(url, dm().enqueue(req)).apply();
    }

    private void openInstaller(String url) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk(url));
        getContext().startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
    }

    @PluginMethod
    public void status(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED)) { call.reject("Update URL not allowed"); return; }
        JSObject s = state(url);
        if ("DONE".equals(s.getString("status")) && !apk(url).exists()) { s.put("status", "NONE"); s.put("pct", 0); } // file cleared by the system
        call.resolve(s);
    }

    // Starts (or joins) the background download, reports progress, opens the installer when done.
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED)) { call.reject("Update URL not allowed"); return; }
        if ("DONE".equals(state(url).getString("status")) && apk(url).exists()) { openInstaller(url); call.resolve(); return; }
        try { start(url, call.getString("title", "Krewzo update")); } catch (Exception e) { call.reject("Download failed: " + e.getMessage()); return; }
        new Thread(() -> {
            int last = -1;
            try {
                while (true) {
                    JSObject s = state(url);
                    String st = s.getString("status");
                    int pct = s.getInteger("pct", 0);
                    if (pct != last) { last = pct; JSObject e = new JSObject(); e.put("pct", pct); notifyListeners("progress", e); }
                    if ("DONE".equals(st)) { openInstaller(url); call.resolve(); return; }
                    if (!"RUNNING".equals(st)) { call.reject("Download failed. Check your internet and try again."); return; }
                    Thread.sleep(500);
                }
            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage());
            }
        }).start();
    }
}
