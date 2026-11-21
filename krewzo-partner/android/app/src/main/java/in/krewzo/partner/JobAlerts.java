package in.krewzo.partner;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

// One job offer at a time: rings, shows the full-screen alert (phone locked) or the island (phone in use),
// and accepts / skips natively so the worker never has to open the app first.
final class JobAlerts {
    static final String CH_RING = "job_ring", CH_QUIET = "job_quiet";
    static final int NOTIF_ID = 4242;
    static final long RING_MS = 30_000;
    static final Handler main = new Handler(Looper.getMainLooper());

    static Map<String, String> current;
    static long shownAt;
    private static MediaPlayer player;
    private static Vibrator vib;
    private static final Runnable timeout = () -> { stopRinging(); IslandOverlay.hide(); JobAlertActivity.close(); };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("krewzo_native", Context.MODE_PRIVATE); }
    // Text in the worker's language, saved by the web layer through the Krewzo plugin.
    static String s(Context c, String key, String def) { return prefs(c).getString("s_" + key, def); }

    static String trade(Context c, Map<String, String> d) { return s(c, "trade_" + d.get("trade_tag"), d.get("trade_tag")); }
    static String icon(Map<String, String> d) {
        String t = d.get("trade_tag");
        if (t == null) return "🧰";
        switch (t) {
            case "LOADING": return "📦";
            case "CLEANING": return "🧹";
            case "GARDEN": return "🌱";
            case "MASON": return "🧱";
            case "PAINTER": return "🎨";
            case "PLUMBER": return "🔧";
            case "ELECTRICIAN": return "⚡";
            case "CARPENTER": return "🪚";
            default: return "🧰";
        }
    }
    static String hours(Map<String, String> d) { String x = d.get("duration"); return x == null ? "" : x.replace("H", ""); }
    static String or(String v, String def) { return v == null || v.isEmpty() ? def : v; }
    static long msLeft() { return Math.max(0, RING_MS - (System.currentTimeMillis() - shownAt)); }

    static void show(Context ctx, Map<String, String> data) {
        Context c = ctx.getApplicationContext();
        main.post(() -> {
            IslandOverlay.hide();
            current = new HashMap<>(data);
            shownAt = System.currentTimeMillis();
            channels(c);
            boolean inUse = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isInteractive()
                    && !((KeyguardManager) c.getSystemService(Context.KEYGUARD_SERVICE)).isKeyguardLocked();
            boolean island = inUse && Settings.canDrawOverlays(c);
            notifyOffer(c, island);
            if (island) IslandOverlay.show(c, current);
            startRinging(c);
            main.removeCallbacks(timeout);
            main.postDelayed(timeout, RING_MS);
        });
    }

    // bookingId null = whatever is showing.
    static void dismiss(Context ctx, String bookingId) {
        Context c = ctx.getApplicationContext();
        main.post(() -> {
            if (current == null || (bookingId != null && !bookingId.equals(current.get("booking_id")))) return;
            current = null;
            main.removeCallbacks(timeout);
            stopRinging();
            IslandOverlay.hide();
            JobAlertActivity.close();
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIF_ID);
        });
    }

    static void accept(Context ctx, String id) {
        Context c = ctx.getApplicationContext();
        dismiss(c, id);
        post(c, "/api/bookings/" + id + "/accept", (ok) -> {
            if (ok) {
                c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
                KrewzoNative.refresh();
            } else Toast.makeText(c, s(c, "taken", "Job already taken"), Toast.LENGTH_LONG).show();
        });
    }

    static void skip(Context ctx, String id) {
        Context c = ctx.getApplicationContext();
        dismiss(c, id);
        post(c, "/api/bookings/" + id + "/skip", (ok) -> KrewzoNative.refresh());
    }

    interface Done { void run(boolean ok); }

    private static void post(Context c, String path, Done done) {
        SharedPreferences p = prefs(c);
        String server = p.getString("server", ""), token = p.getString("token", "");
        new Thread(() -> {
            boolean ok = false;
            try {
                HttpURLConnection h = (HttpURLConnection) new URL(server + path).openConnection();
                h.setRequestMethod("POST");
                h.setConnectTimeout(15000);
                h.setReadTimeout(20000);
                h.setRequestProperty("content-type", "application/json");
                h.setRequestProperty("authorization", "Bearer " + token);
                h.setDoOutput(true);
                try (OutputStream os = h.getOutputStream()) { os.write("{}".getBytes()); }
                ok = h.getResponseCode() < 300;
            } catch (Exception ignored) {}
            boolean r = ok;
            main.post(() -> done.run(r));
        }).start();
    }

    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        // We ring and vibrate ourselves (looping until the worker decides), so both channels are silent.
        NotificationChannel ring = new NotificationChannel(CH_RING, "Incoming jobs (full screen)", NotificationManager.IMPORTANCE_HIGH);
        ring.setSound(null, null);
        ring.enableVibration(false);
        ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationChannel quiet = new NotificationChannel(CH_QUIET, "Incoming jobs (island)", NotificationManager.IMPORTANCE_LOW);
        quiet.setSound(null, null);
        nm.createNotificationChannel(ring);
        nm.createNotificationChannel(quiet);
    }

    private static PendingIntent activity(Context c, int code, Intent i) {
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void notifyOffer(Context c, boolean island) {
        Map<String, String> d = current;
        String id = d.get("booking_id");
        Intent full = new Intent(c, JobAlertActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        // Accept goes through an activity: Android 12+ blocks opening the app from a broadcast "trampoline".
        Intent acc = new Intent(c, MainActivity.class).putExtra("krewzo_accept", id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Intent skp = new Intent(c, JobActionReceiver.class).setAction("SKIP").putExtra("id", id);
        String area = or(d.get("area"), "");
        String title = "₹" + d.get("payout") + " · " + trade(c, d);
        String body = icon(d) + " " + d.get("distance_km") + " " + s(c, "km", "km") + " · " + hours(d) + " " + s(c, "hours", "hours")
                + (area.isEmpty() ? "" : " · " + area);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, island ? CH_QUIET : CH_RING)
                .setSmallIcon(R.drawable.ic_stat_krewzo)
                .setColor(0xFFC8F031)
                .setContentTitle(title)
                .setContentText(body)
                .setSubText(s(c, "new_job", "New job"))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(island ? NotificationCompat.PRIORITY_LOW : NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setTimeoutAfter(RING_MS + 5000)
                .setContentIntent(activity(c, 1, full))
                .addAction(0, s(c, "skip", "Skip"), PendingIntent.getBroadcast(c, 2, skp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE))
                .addAction(0, s(c, "accept", "Accept"), activity(c, 3, acc));
        if (!island) b.setFullScreenIntent(activity(c, 4, full), true);
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIF_ID, b.build());
    }

    private static void startRinging(Context c) {
        stopRinging();
        try {
            Uri u = RingtoneManager.getActualDefaultRingtoneUri(c, RingtoneManager.TYPE_RINGTONE);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(c, u);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) { player = null; }
        try {
            vib = (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
            long[] pattern = {0, 600, 400, 600, 1200};
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
            else vib.vibrate(pattern, 0);
        } catch (Exception ignored) {}
    }

    static void stopRinging() {
        try { if (player != null) { player.stop(); player.release(); } } catch (Exception ignored) {}
        player = null;
        try { if (vib != null) vib.cancel(); } catch (Exception ignored) {}
    }
}
