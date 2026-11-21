package in.krewzo.partner;

import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

// Krewzo native look (matches the web app tokens): warm black, hi-vis lime, mint for money.
final class Ui {
    static final int BG = 0xFF0E0D0B, SURFACE = 0xFF1A1814, LINE = 0xFF2B2822, LIME = 0xFFC8F031, TEXT = 0xFFF4F1EA, MUTED = 0xFF9C978C, MINT = 0xFF3DDC97;

    static int dp(Context c, float v) { return Math.round(v * c.getResources().getDisplayMetrics().density); }

    static GradientDrawable round(int color, float radiusPx, int strokeColor, int strokePx) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radiusPx);
        if (strokePx > 0) g.setStroke(strokePx, strokeColor);
        return g;
    }

    static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setIncludeFontPadding(false);
        if (bold) t.setTypeface(Typeface.create("sans-serif-black", Typeface.NORMAL));
        return t;
    }

    static TextView chip(Context c, String s, int fg, int bg) {
        TextView t = text(c, s, 12, fg, true);
        t.setLetterSpacing(0.12f);
        t.setPadding(dp(c, 10), dp(c, 5), dp(c, 10), dp(c, 5));
        t.setBackground(round(bg, dp(c, 99), 0, 0));
        return t;
    }

    static TextView button(Context c, String s, int fg, int bg, View.OnClickListener l) {
        TextView b = text(c, s, 17, fg, true);
        b.setGravity(Gravity.CENTER);
        b.setBackground(round(bg, dp(c, 18), 0, 0));
        b.setOnClickListener(l);
        return b;
    }

    static LinearLayout.LayoutParams lp(int w, int h, float weight) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(w, h);
        p.weight = weight;
        return p;
    }

    // Ring that drains as the offer runs out.
    static final class Countdown extends View {
        private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), arc = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF box = new RectF();
        private float frac = 1f;

        Countdown(Context c, float strokeDp) {
            super(c);
            for (Paint p : new Paint[]{track, arc}) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dp(c, strokeDp)); p.setStrokeCap(Paint.Cap.ROUND); }
            track.setColor(LINE);
            arc.setColor(LIME);
        }

        void run(long leftMs, long totalMs) {
            ValueAnimator a = ValueAnimator.ofFloat(leftMs / (float) totalMs, 0f);
            a.setDuration(leftMs);
            a.setInterpolator(null);
            a.addUpdateListener((v) -> { frac = (float) v.getAnimatedValue(); invalidate(); });
            a.start();
        }

        @Override
        protected void onDraw(Canvas cv) {
            float s = track.getStrokeWidth() / 2;
            box.set(s, s, getWidth() - s, getHeight() - s);
            cv.drawArc(box, 0, 360, false, track);
            cv.drawArc(box, -90, 360 * frac, false, arc);
        }
    }

    // Drag the knob to the end to accept. Harder to hit by accident in a pocket than a tap.
    static final class Slide extends FrameLayout {
        interface Done { void run(); }
        private final TextView knob;
        private float startX;
        private boolean done;

        @SuppressLint("ClickableViewAccessibility")
        Slide(Context c, String label, Done onDone) {
            super(c);
            setBackground(round(0x33C8F031, dp(c, 99), 0x66C8F031, dp(c, 1)));
            TextView l = text(c, label + "  ›››", 17, LIME, true);
            l.setGravity(Gravity.CENTER);
            l.setLetterSpacing(0.04f);
            addView(l, new LayoutParams(-1, -1));
            knob = text(c, "→", 26, Color.BLACK, true);
            knob.setGravity(Gravity.CENTER);
            knob.setBackground(round(LIME, dp(c, 99), 0, 0));
            int k = dp(c, 60);
            LayoutParams kp = new LayoutParams(k, k);
            kp.gravity = Gravity.CENTER_VERTICAL;
            kp.leftMargin = dp(c, 6);
            addView(knob, kp);
            setContentDescription(label);
            setOnClickListener((v) -> {}); // accessibility: a double-tap on the track also accepts
            setAccessibilityDelegate(new AccessibilityDelegate() {
                @Override
                public boolean performAccessibilityAction(View host, int action, android.os.Bundle args) {
                    if (action == android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK && !done) { done = true; onDone.run(); return true; }
                    return super.performAccessibilityAction(host, action, args);
                }
            });
            setOnTouchListener((v, e) -> {
                if (done) return true;
                float max = getWidth() - knob.getWidth() - dp(c, 12);
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN: startX = e.getX() - knob.getTranslationX(); return true;
                    case MotionEvent.ACTION_MOVE:
                        knob.setTranslationX(Math.max(0, Math.min(max, e.getX() - startX)));
                        l.setAlpha(1 - knob.getTranslationX() / max);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (knob.getTranslationX() > max * 0.8f) { done = true; knob.animate().translationX(max).setDuration(120).start(); onDone.run(); }
                        else { knob.animate().translationX(0).setDuration(220).start(); l.animate().alpha(1).start(); }
                        return true;
                }
                return false;
            });
        }
    }
}
