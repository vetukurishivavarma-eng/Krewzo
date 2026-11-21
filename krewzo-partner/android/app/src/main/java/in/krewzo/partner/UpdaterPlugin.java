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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Self-update (see shared/update.js). First choice: Android's DownloadManager, which keeps going while the
// user leaves the app. Some phones park it forever (VPN, "waiting for network"), so if it makes no progress
// for STALL_MS we cancel it and download directly in the app instead. A finished file is always reused.
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String ALLOWED = "https://github.com/vetukurishivavarma-eng/Krewzo/releases/download/";
    private static final long STALL_MS = 15_000;

    private File apk(String url) {
        return new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update-" + Integer.toHexString(url.hashCode()) + ".apk");
    }
    private SharedPreferences prefs() { return getContext().getSharedPreferences("krewzo_update", Context.MODE_PRIVATE); }
    private DownloadManager dm() { return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE); }

    // {status: RUNNING | DONE | FAILED | NONE, pct, bytes, reason}
    private JSObject state(String url) {
        JSObject r = new JSObject();
        long id = prefs().getLong(url, -1);
        if (id >= 0) {
            try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
                if (c != null && c.moveToFirst()) {
                    int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    long done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    r.put("pct", total > 0 ? (int) (done * 100 / total) : 0);
                    r.put("bytes", done);
                    r.put("status", st == DownloadManager.STATUS_SUCCESSFUL ? "DONE" : st == DownloadManager.STATUS_FAILED ? "FAILED" : "RUNNING");
                    if (st == DownloadManager.STATUS_PAUSED) r.put("reason", reason == DownloadManager.PAUSED_WAITING_FOR_NETWORK ? "Waiting for network"
                            : reason == DownloadManager.PAUSED_QUEUED_FOR_WIFI ? "Waiting for Wi-Fi" : "Paused by Android, retrying");
                    else if (st == DownloadManager.STATUS_PENDING) r.put("reason", "Queued by Android");
                    return r;
                }
            }
        }
        // No system download on record: a file here was finished by the direct download (it renames only when complete).
        boolean have = apk(url).exists();
        r.put("pct", have ? 100 : 0);
        r.put("bytes", 0);
        r.put("status", have ? "DONE" : "NONE");
        return r;
    }

    private void forgetSystemDownload(String url) {
        long id = prefs().getLong(url, -1);
        if (id >= 0) dm().remove(id); // also deletes its partial file
        prefs().edit().remove(url).apply();
    }

    private void startSystemDownload(String url, String title) {
        File dir = apk(url).getParentFile();
        File[] old = dir == null ? null : dir.listFiles((d, n) -> n.startsWith("update-"));
        if (old != null) for (File f : old) f.delete(); // earlier releases / failed attempts
        forgetSystemDownload(url);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle(title)
                .setDescription("Downloading update")
                .setMimeType("application/vnd.android.package-archive")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, apk(url).getName());
        prefs().edit().clear().putLong(url, dm().enqueue(req)).apply();
    }

    private void progress(int pct, String reason) {
        JSObject e = new JSObject();
        e.put("pct", pct);
        if (reason != null) e.put("reason", reason);
        notifyListeners("progress", e);
    }

    // Plain HTTPS download inside the app (.part, renamed only when complete).
    private void directDownload(String url) throws Exception {
        File out = apk(url), part = new File(out.getPath() + ".part");
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection(); // follows GitHub's https redirect
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        long total = c.getContentLengthLong(), done = 0; int last = -1;
        try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(part)) {
            byte[] buf = new byte[65536];
            for (int n; (n = in.read(buf)) > 0; ) {
                os.write(buf, 0, n); done += n;
                int pct = total > 0 ? (int) (done * 100 / total) : 0;
                if (pct != last) { last = pct; progress(pct, null); }
            }
        }
        if (total > 0 && done != total) throw new Exception("incomplete download");
        if (!part.renameTo(out)) throw new Exception("could not save update");
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

    // Starts (or joins) the download, reports progress, opens the installer when done.
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith(ALLOWED)) { call.reject("Update URL not allowed"); return; }
        String title = call.getString("title", "Krewzo update");
        new Thread(() -> {
            try {
                JSObject s = state(url);
                if ("DONE".equals(s.getString("status")) && apk(url).exists()) { openInstaller(url); call.resolve(); return; }
                if (!"RUNNING".equals(s.getString("status"))) startSystemDownload(url, title);
                long lastBytes = -1, lastMove = System.currentTimeMillis();
                int lastPct = -1;
                while (true) {
                    s = state(url);
                    String st = s.getString("status");
                    long bytes = s.optLong("bytes", 0L);
                    int pct = s.getInteger("pct", 0);
                    if (pct != lastPct || s.has("reason")) { lastPct = pct; progress(pct, s.getString("reason")); }
                    if ("DONE".equals(st)) break;
                    if (bytes != lastBytes) { lastBytes = bytes; lastMove = System.currentTimeMillis(); }
                    if (!"RUNNING".equals(st) || System.currentTimeMillis() - lastMove > STALL_MS) {
                        forgetSystemDownload(url); // stuck or failed: do it ourselves
                        progress(0, "Downloading directly, keep the app open");
                        directDownload(url);
                        break;
                    }
                    Thread.sleep(500);
                }
                openInstaller(url);
                call.resolve();
            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage() + ". Check your internet and try again.");
            }
        }).start();
    }
}
