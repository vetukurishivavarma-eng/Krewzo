package in.krewzo.partner;

import android.app.Activity;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.ref.WeakReference;
import java.util.Map;

// Full-screen incoming job, over the lock screen: countdown ring, pay, task, distance, slide to accept.
public class JobAlertActivity extends Activity {
    private static WeakReference<JobAlertActivity> live = new WeakReference<>(null);

    static void close() { JobAlertActivity a = live.get(); if (a != null) a.finish(); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Map<String, String> d = JobAlerts.current;
        if (d == null) { finish(); return; }
        live = new WeakReference<>(this);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.BG);
        setContentView(build(d));
    }

    private View build(Map<String, String> d) {
        String id = d.get("booking_id");
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        int pad = Ui.dp(this, 24);
        root.setPadding(pad, Ui.dp(this, 36), pad, Ui.dp(this, 28));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(Ui.chip(this, "● " + JobAlerts.s(this, "new_job", "New job").toUpperCase(), 0xFF000000, Ui.LIME));
        top.addView(new View(this), Ui.lp(0, 1, 1));
        top.addView(Ui.text(this, "KREWZO", 13, Ui.MUTED, true));
        root.addView(top);

        // Ring + icon
        FrameLayout ring = new FrameLayout(this);
        Ui.Countdown cd = new Ui.Countdown(this, 6);
        ring.addView(cd, new FrameLayout.LayoutParams(-1, -1));
        TextView ic = Ui.text(this, JobAlerts.icon(d), 64, Ui.TEXT, false);
        ic.setGravity(Gravity.CENTER);
        ring.addView(ic, new FrameLayout.LayoutParams(-1, -1));
        int rs = Ui.dp(this, 168);
        LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(rs, rs);
        rp.gravity = Gravity.CENTER_HORIZONTAL;
        rp.topMargin = Ui.dp(this, 40);
        root.addView(ring, rp);
        cd.run(JobAlerts.msLeft(), JobAlerts.RING_MS);
        ic.animate().scaleX(1.08f).scaleY(1.08f).setDuration(700).withEndAction(new Runnable() {
            boolean up = true;
            @Override public void run() { up = !up; ic.animate().scaleX(up ? 1.08f : 1f).scaleY(up ? 1.08f : 1f).setDuration(700).withEndAction(this).start(); }
        }).start();

        TextView earn = Ui.text(this, JobAlerts.s(this, "you_earn", "You earn").toUpperCase(), 13, Ui.MUTED, true);
        earn.setLetterSpacing(0.15f);
        earn.setGravity(Gravity.CENTER);
        root.addView(earn, centered(28));
        TextView pay = Ui.text(this, "₹" + d.get("payout"), 64, Ui.MINT, true);
        pay.setGravity(Gravity.CENTER);
        root.addView(pay, centered(6));
        TextView trade = Ui.text(this, JobAlerts.trade(this, d), 22, Ui.TEXT, true);
        trade.setGravity(Gravity.CENTER);
        root.addView(trade, centered(6));

        // Facts row
        LinearLayout facts = new LinearLayout(this);
        facts.setGravity(Gravity.CENTER);
        facts.addView(fact("📍", d.get("distance_km") + " " + JobAlerts.s(this, "km", "km")));
        facts.addView(fact("⏱", JobAlerts.hours(d) + " " + JobAlerts.s(this, "hours", "hours")));
        String who = JobAlerts.or(d.get("customer_name"), "");
        if (!who.isEmpty()) facts.addView(fact("👤", who));
        root.addView(facts, centered(24));
        String area = JobAlerts.or(d.get("area"), "");
        if (!area.isEmpty()) {
            TextView a = Ui.text(this, area, 15, Ui.MUTED, false);
            a.setGravity(Gravity.CENTER);
            root.addView(a, centered(12));
        }

        root.addView(new View(this), Ui.lp(1, 0, 1));
        root.addView(new Ui.Slide(this, JobAlerts.s(this, "slide", "Slide to accept"), () -> {
            unlockThen();
            JobAlerts.accept(this, id);
        }), new LinearLayout.LayoutParams(-1, Ui.dp(this, 72)));
        TextView skip = Ui.button(this, "✕  " + JobAlerts.s(this, "skip", "Skip"), Ui.MUTED, Ui.SURFACE, (v) -> JobAlerts.skip(this, id));
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, Ui.dp(this, 56));
        sp.topMargin = Ui.dp(this, 12);
        root.addView(skip, sp);
        return root;
    }

    private void unlockThen() {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && km.isKeyguardLocked()) km.requestDismissKeyguard(this, null);
    }

    private LinearLayout.LayoutParams centered(int topDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
        p.topMargin = Ui.dp(this, topDp);
        return p;
    }

    private View fact(String icon, String s) {
        TextView t = Ui.text(this, icon + "  " + s, 16, Ui.TEXT, true);
        t.setPadding(Ui.dp(this, 14), Ui.dp(this, 10), Ui.dp(this, 14), Ui.dp(this, 10));
        t.setBackground(Ui.round(Ui.SURFACE, Ui.dp(this, 14), Ui.LINE, Ui.dp(this, 1)));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2);
        p.leftMargin = p.rightMargin = Ui.dp(this, 4);
        t.setLayoutParams(p);
        return t;
    }

    @Override
    public void onBackPressed() { /* decide with the buttons; the ring times out on its own */ }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (live.get() == this) live = new WeakReference<>(null);
    }
}
