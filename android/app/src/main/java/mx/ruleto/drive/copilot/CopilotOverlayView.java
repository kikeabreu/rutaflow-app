package mx.ruleto.drive.copilot;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;

import java.util.ArrayList;
import java.util.List;

public class CopilotOverlayView extends View {
    public static class HighlightItem {
        final Rect bounds;
        final int color;
        final String label;

        public HighlightItem(Rect bounds, int color, String label) {
            this.bounds = bounds;
            this.color = color;
            this.label = label;
        }
    }

    private final WindowManager windowManager;
    private final WindowManager.LayoutParams params;
    private final List<HighlightItem> items = new ArrayList<>();
    private final Paint boxPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isAttached = false;
    private final Runnable hideRunnable = this::clearHighlights;

    public CopilotOverlayView(Context context) {
        super(context);
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;

        boxPaint.setStyle(Paint.Style.STROKE);
        boxPaint.setStrokeWidth(8f);

        textBgPaint.setStyle(Paint.Style.FILL);

        textPaint.setColor(0xFFFFFFFF);
        textPaint.setTextSize(36f);
        textPaint.setFakeBoldText(true);
    }

    public synchronized void showHighlights(List<HighlightItem> newItems) {
        mainHandler.post(() -> {
            items.clear();
            if (newItems != null) items.addAll(newItems);
            attachIfNeeded();
            invalidate();

            mainHandler.removeCallbacks(hideRunnable);
            mainHandler.postDelayed(hideRunnable, 4500);
        });
    }

    public synchronized void clearHighlights() {
        mainHandler.post(() -> {
            items.clear();
            invalidate();
            detachIfNeeded();
        });
    }

    private void attachIfNeeded() {
        if (!isAttached && windowManager != null) {
            try {
                windowManager.addView(this, params);
                isAttached = true;
            } catch (Exception ignored) {}
        }
    }

    private void detachIfNeeded() {
        if (isAttached && windowManager != null) {
            try {
                windowManager.removeView(this);
                isAttached = false;
            } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (HighlightItem item : items) {
            if (item.bounds == null) continue;
            boxPaint.setColor(item.color);
            RectF rectF = new RectF(item.bounds);
            // Draw highlight rounded box
            canvas.drawRoundRect(rectF, 16f, 16f, boxPaint);

            // Draw label pill above the box
            if (item.label != null && !item.label.isEmpty()) {
                textBgPaint.setColor(item.color);
                float textWidth = textPaint.measureText(item.label);
                float pillHeight = 44f;
                float top = Math.max(0, rectF.top - pillHeight - 6);
                RectF pill = new RectF(rectF.left, top, rectF.left + textWidth + 24f, top + pillHeight);
                canvas.drawRoundRect(pill, 10f, 10f, textBgPaint);
                canvas.drawText(item.label, pill.left + 12f, pill.bottom - 10f, textPaint);
            }
        }
    }
}
