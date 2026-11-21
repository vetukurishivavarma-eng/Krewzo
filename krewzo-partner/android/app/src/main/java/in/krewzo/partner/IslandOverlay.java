package in.krewzo.partner;

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Map;

// The "Krewzo island": a black pill that drops from the camera notch over any app, then grows into a job card.
// Tap the pill to open the card, tap the card header to shrink it. Needs "Display over other apps".
final class IslandOverlay {
    private static FrameLayout root;
    private static View pill, card;
    private static WindowManager.LayoutParams lp;
    private static final Runnable COLLAPSE = IslandOverlay::collapse;

    static void show(Context c, Map<String, String> d) {
        hide();
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        WindowManager.LayoutParams p = lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP;
        if (Build.VERSION.SDK_INT >= 28) p.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        p.y = Ui.dp(c, 8);

        root = new FrameLayout(c);
        pill = pill(c, d);
        card = card(c, d);
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(-2, Ui.dp(c, 38));
        pl.gravity = Gravity.CENTER_HORIZONTAL;
        root.addView(pill, pl);
        FrameLayout.LayoutParams cl = new FrameLayout.LayoutParams(-1, -2);
        cl.leftMargin = cl.rightMargin = Ui.dp(c, 10);
        root.addView(card, cl);
        pill.setVisibility(View.GONE);
        try { wm.addView(root, p); } catch (Exception e) { root = null; return; }
        expand();
        JobAlerts.main.postDelayed(COLLAPSE, 9000); // stays as a live pill after that
    }

    static void hide() {
        if (root == null) return;
        View r = root;
        root = null;
        JobAlerts.main.removeCallbacks(COLLAPSE);
        r.animate().alpha(0).translationY(-Ui.dp(r.getContext(), 30)).setDuration(180).withEndAction(() -> {
            try { ((WindowManager) r.getContext().getSystemService(Context.WINDOW_SERVICE)).removeView(r); } catch (Exception ignored) {}
        }).start();
    }

    private static void expand() {
        if (root == null) return;
        resize(WindowManager.LayoutParams.MATCH_PARENT);
        pill.setVisibility(View.GONE);
        card.setVisibility(View.VISIBLE);
        card.setPivotY(0);
        card.post(() -> card.setPivotX(card.getWidth() / 2f));
        card.setScaleX(0.35f); card.setScaleY(0.15f); card.setAlpha(0f);
        card.animate().scaleX(1).scaleY(1).alpha(1).setDuration(380).setInterpolator(new OvershootInterpolator(0.9f)).start();
    }

    private static void collapse() {
        if (root == null || card.getVisibility() != View.VISIBLE) return;
        card.animate().scaleX(0.35f).scaleY(0.15f).alpha(0).setDuration(220).withEndAction(() -> {
            card.setVisibility(View.GONE);
            pill.setVisibility(View.VISIBLE);
            resize(WindowManager.LayoutParams.WRAP_CONTENT); // only the pill takes touches; the rest of the status bar stays usable
            pill.setScaleX(0.6f); pill.setAlpha(0);
            pill.animate().scaleX(1).alpha(1).setDuration(260).setInterpolator(new OvershootInterpolator(1.4f)).start();
        }).start();
    }

    private static void resize(int width) {
        if (root == null || lp.width == width) return;
        lp.width = width;
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        try { ((WindowManager) root.getContext().getSystemService(Context.WINDOW_SERVICE)).updateViewLayout(root, lp); } catch (Exception ignored) {}
    }

    private static View pill(Context c, Map<String, String> d) {
        LinearLayout p = new LinearLayout(c);
        p.setGravity(Gravity.CENTER_VERTICAL);
        p.setPadding(Ui.dp(c, 12), 0, Ui.dp(c, 16), 0);
        p.setBackground(Ui.round(0xFF000000, Ui.dp(c, 99), 0, 0));
        View dot = new View(c);
        dot.setBackground(Ui.round(Ui.LIME, Ui.dp(c, 99), 0, 0));
        p.addView(dot, new LinearLayout.LayoutParams(Ui.dp(c, 9), Ui.dp(c, 9)));
        ObjectAnimator a = ObjectAnimator.ofFloat(dot, "alpha", 1f, 0.2f);
        a.setDuration(600); a.setRepeatMode(ValueAnimator.REVERSE); a.setRepeatCount(ValueAnimator.INFINITE); a.start();
        TextView t = Ui.text(c, "  " + JobAlerts.icon(d) + "  ₹" + d.get("payout"), 15, Ui.MINT, true);
        p.addView(t);
        p.addView(Ui.text(c, "  ·  " + d.get("distance_km") + " " + JobAlerts.s(c, "km", "km"), 14, 0xFFCFCAC0, true));
        p.setOnClickListener((v) -> expand());
        return p;
    }

    private static View card(Context c, Map<String, String> d) {
        String id = d.get("booking_id");
        LinearLayout k = new LinearLayout(c);
        k.setOrientation(LinearLayout.VERTICAL);
        int pad = Ui.dp(c, 16);
        k.setPadding(pad, Ui.dp(c, 14), pad, pad);
        k.setBackground(Ui.round(0xFF000000, Ui.dp(c, 30), Ui.LINE, Ui.dp(c, 1)));
        k.setElevation(Ui.dp(c, 12));

        LinearLayout head = new LinearLayout(c);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.addView(Ui.chip(c, "● " + JobAlerts.s(c, "new_job", "New job").toUpperCase(), 0xFF000000, Ui.LIME));
        head.addView(new View(c), Ui.lp(0, 1, 1));
        TextView secs = Ui.text(c, "", 13, Ui.MUTED, true);
        head.addView(secs);
        head.addView(Ui.text(c, "   ⌃", 16, Ui.MUTED, true));
        head.setOnClickListener((v) -> collapse());
        k.addView(head);
        Runnable tick = new Runnable() {
            @Override public void run() { if (root == null) return; secs.setText((JobAlerts.msLeft() / 1000) + "s"); JobAlerts.main.postDelayed(this, 500); }
        };
        tick.run();

        LinearLayout mid = new LinearLayout(c);
        mid.setGravity(Gravity.CENTER_VERTICAL);
        TextView ic = Ui.text(c, JobAlerts.icon(d), 30, Ui.TEXT, false);
        ic.setGravity(Gravity.CENTER);
        ic.setBackground(Ui.round(Ui.SURFACE, Ui.dp(c, 16), 0, 0));
        mid.addView(ic, new LinearLayout.LayoutParams(Ui.dp(c, 56), Ui.dp(c, 56)));
        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(Ui.dp(c, 14), 0, 0, 0);
        col.addView(Ui.text(c, "₹" + d.get("payout"), 30, Ui.MINT, true));
        TextView sub = Ui.text(c, JobAlerts.trade(c, d) + "  ·  " + JobAlerts.hours(d) + " " + JobAlerts.s(c, "hours", "hours"), 14, Ui.TEXT, true);
        sub.setPadding(0, Ui.dp(c, 4), 0, 0);
        col.addView(sub);
        mid.addView(col, Ui.lp(0, -2, 1));
        LinearLayout.LayoutParams mp = new LinearLayout.LayoutParams(-1, -2);
        mp.topMargin = Ui.dp(c, 14);
        k.addView(mid, mp);

        String who = JobAlerts.or(d.get("customer_name"), ""), area = JobAlerts.or(d.get("area"), "");
        TextView where = Ui.text(c, "📍 " + d.get("distance_km") + " " + JobAlerts.s(c, "km", "km")
                + (area.isEmpty() ? "" : " · " + area) + (who.isEmpty() ? "" : "   👤 " + who), 13, Ui.MUTED, false);
        where.setSingleLine(true);
        where.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, -2);
        wp.topMargin = Ui.dp(c, 12);
        k.addView(where, wp);

        LinearLayout btns = new LinearLayout(c);
        btns.addView(Ui.button(c, "✕  " + JobAlerts.s(c, "skip", "Skip"), Ui.TEXT, Ui.SURFACE, (v) -> JobAlerts.skip(c, id)), Ui.lp(0, Ui.dp(c, 52), 1));
        View gap = new View(c);
        btns.addView(gap, new LinearLayout.LayoutParams(Ui.dp(c, 10), 1));
        btns.addView(Ui.button(c, "✓  " + JobAlerts.s(c, "accept", "Accept"), 0xFF000000, Ui.LIME, (v) -> JobAlerts.accept(c, id)), Ui.lp(0, Ui.dp(c, 52), 2));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, -2);
        bp.topMargin = Ui.dp(c, 14);
        k.addView(btns, bp);
        return k;
    }
}
