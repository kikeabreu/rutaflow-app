package mx.ruleto.drive.copilot;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.util.DisplayMetrics;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import mx.ruleto.drive.MainActivity;
import mx.ruleto.drive.R;

public class CopilotCaptureService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_START = "mx.ruleto.drive.copilot.START";
    public static final String ACTION_STOP = "mx.ruleto.drive.copilot.STOP";
    public static final String ACTION_DUMP = "mx.ruleto.drive.copilot.DUMP";
    public static final String ACTION_EVENT = "mx.ruleto.drive.copilot.EVENT";
    public static final String EXTRA_EVENT = "event";
    public static final String EXTRA_PAYLOAD = "payload";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String PREFS = "rutaflow_copilot";
    public static final String PREF_CONFIG = "config";
    public static final String PREF_LAST_OFFER = "lastOffer";
    public static final String PREF_DESIRED = "desired";
    public static final String PREF_CAPTURE_ACTIVE = "captureActive";
    public static final String PREF_NEEDS_CONSENT = "needsConsent";
    public static final String PREF_STOP_REASON = "stopReason";

    private static final String CHANNEL_ID = "rutaflow_copilot";
    private static final String CHANNEL_ALERTS_ID = "rutaflow_copilot_alerts";
    private static final int NOTIFICATION_ID = 7401;
    private static final int ALERT_NOTIFICATION_ID = 7402;
    private static final long OCR_INTERVAL_MS = 650;
    private static final long DUPLICATE_WINDOW_MS = 45_000;
    // Ventana de diagnostico: volcamos el OCR crudo con geometria mientras este armado.
    private static final long DUMP_WINDOW_MS = 180_000;

    private final AtomicBoolean processing = new AtomicBoolean(false);
    private MediaProjection projection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private TextRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady;
    private long lastFrameAt;
    private long lastOfferAt;
    private String lastSignature = "";
    private long dumpArmedUntil;
    private int dumpCount;
    private int captureWidth;
    private int captureHeight;
    private CopilotConfig config = CopilotConfig.defaults();
    private boolean explicitShutdown;
    private CopilotOverlayView overlayView;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        tts = new TextToSpeech(this, this);
        captureThread = new HandlerThread("RuletoCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
        if (android.provider.Settings.canDrawOverlays(this)) {
            overlayView = new CopilotOverlayView(this);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // MediaProjection grants are single-use capabilities. Android may recreate a
        // sticky service without the grant Intent, so this service must never be sticky.
        if (intent == null) {
            recordStopped("missing_consent", true, "Se necesita autorizar nuevamente la captura.");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(intent.getAction())) {
            explicitShutdown = true;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_DESIRED, false).apply();
            recordStopped("user_stopped", false, "Copiloto apagado");
            announce("Copiloto apagado.");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_DUMP.equals(intent.getAction())) {
            armDump();
            return START_NOT_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_NOT_STICKY;

        config = CopilotConfig.fromJson(getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(PREF_CONFIG, "{}"));
        if (overlayView == null && android.provider.Settings.canDrawOverlays(this)) {
            overlayView = new CopilotOverlayView(this);
        }
        startAsForeground("Escuchando ofertas", "Ruleto analiza únicamente mientras este aviso esté activo.");

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData;
        if (Build.VERSION.SDK_INT >= 33) {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        } else {
            //noinspection deprecation
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        }
        if (resultCode == 0 || resultData == null) {
            recordStopped("missing_consent", true, "No recibimos permiso de captura.");
            stopSelf();
            return START_NOT_STICKY;
        }
        startProjection(resultCode, resultData);
        return START_NOT_STICKY;
    }

    private void startAsForeground(String title, String body) {
        Notification notification = notification(title, body, false);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startProjection(int resultCode, Intent resultData) {
        explicitShutdown = true;
        stopProjection();
        explicitShutdown = false;
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        try {
            projection = manager == null ? null : manager.getMediaProjection(resultCode, resultData);
        } catch (RuntimeException error) {
            projection = null;
        }
        if (projection == null) {
            recordStopped("invalid_consent", true, "No fue posible iniciar la captura. Autorízala nuevamente.");
            stopSelf();
            return;
        }
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                if (explicitShutdown) return;
                recordStopped("android_stopped_capture", true, "Android detuvo la captura. Toca iniciar para autorizarla otra vez.");
                stopSelf();
            }
        }, captureHandler);

        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int width = Math.max(720, metrics.widthPixels);
        int height = Math.max(1280, metrics.heightPixels);
        int density = metrics.densityDpi;
        captureWidth = width;
        captureHeight = height;
        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
        imageReader.setOnImageAvailableListener(this::onImageAvailable, captureHandler);
        try {
            virtualDisplay = projection.createVirtualDisplay(
                "RuletoCopilot", width, height, density,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(), null, captureHandler
            );
        } catch (RuntimeException error) {
            recordStopped("capture_start_failed", true, "La captura no pudo iniciar. Autorízala nuevamente.");
            explicitShutdown = true;
            stopSelf();
            return;
        }
        if (virtualDisplay == null) {
            recordStopped("capture_start_failed", true, "La captura no pudo iniciar. Autorízala nuevamente.");
            explicitShutdown = true;
            stopSelf();
            return;
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putBoolean(PREF_CAPTURE_ACTIVE, true)
            .putBoolean(PREF_NEEDS_CONSENT, false)
            .putString(PREF_STOP_REASON, "")
            .apply();
        sendStatus(true, false, "", "Copiloto escuchando ofertas");
        announce("Copiloto activado. Puedes regresar a tu aplicación de viajes.");
    }

    private void onImageAvailable(ImageReader reader) {
        Image image = null;
        try {
            image = reader.acquireLatestImage();
            if (image == null) return;
            long now = System.currentTimeMillis();
            if (now - lastFrameAt < OCR_INTERVAL_MS || !processing.compareAndSet(false, true)) {
                image.close();
                return;
            }
            if (isRuletoForeground()) {
                image.close();
                processing.set(false);
                return;
            }
            lastFrameAt = now;
            Bitmap bitmap = bitmapFrom(image);
            image.close();
            if (bitmap == null) {
                processing.set(false);
                return;
            }
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener(this::handleRecognized)
                .addOnFailureListener(error -> sendStatus(true, "No pude leer esta pantalla; sigo escuchando."))
                .addOnCompleteListener(task -> {
                    bitmap.recycle();
                    processing.set(false);
                });
        } catch (Exception e) {
            if (image != null) {
                try { image.close(); } catch (Exception ignored) {}
            }
            processing.set(false);
        }
    }

    private Bitmap bitmapFrom(Image image) {
        try {
            Image.Plane plane = image.getPlanes()[0];
            ByteBuffer buffer = plane.getBuffer();
            int pixelStride = plane.getPixelStride();
            int rowStride = plane.getRowStride();
            int rowPadding = rowStride - pixelStride * image.getWidth();
            int paddedWidth = image.getWidth() + rowPadding / pixelStride;
            Bitmap padded = Bitmap.createBitmap(paddedWidth, image.getHeight(), Bitmap.Config.ARGB_8888);
            padded.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
            if (padded != cropped) padded.recycle();
            return cropped;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private boolean isRuletoScreen(String text) {
        if (text == null || text.trim().isEmpty()) return false;
        String lower = text.toLowerCase(Locale.ROOT);
        return lower.contains("ruleto")
            || lower.contains("copiloto de ofertas")
            || lower.contains("ganancia estimada")
            || lower.contains("iniciar jornada")
            || lower.contains("terminar jornada")
            || lower.contains("jornada activos")
            || lower.contains("resumen del día")
            || lower.contains("sin pasaje")
            || lower.contains("registrar viaje")
            || lower.contains("foto ia")
            || lower.contains("utilidad operativa")
            || lower.contains("nivel registrado");
    }

    private void handleRecognized(Text result) {
        maybeDump(result);
        handleRecognizedText(result);
    }

    /**
     * Escribe el OCR crudo con cajas cuando el diagnostico esta armado. Solo volcamos
     * pantallas que traen un importe: una pantalla de mapa sin ofertas no aporta nada
     * y llenaria la carpeta antes de capturar una oferta real.
     */
    private void maybeDump(Text result) {
        if (System.currentTimeMillis() > dumpArmedUntil) return;
        String text = result.getText();
        if (text == null || !text.contains("$")) return;
        String path = OcrDump.write(this, result, captureWidth, captureHeight);
        if (path == null) return;
        dumpCount += 1;
        updateNotification("Diagnóstico activo", dumpCount + " pantalla(s) guardada(s) para análisis.", false);
    }

    private void armDump() {
        dumpArmedUntil = System.currentTimeMillis() + DUMP_WINDOW_MS;
        dumpCount = 0;
        announce("Diagnóstico activado por tres minutos. Deja que lleguen ofertas.");
        updateNotification("Diagnóstico activo", "Guardando pantallas con ofertas durante 3 minutos.", false);
    }

    private void handleRecognizedText(Text textResult) {
        String text = textResult.getText();
        if (isRuletoScreen(text)) return;
        config = CopilotConfig.fromJson(getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(PREF_CONFIG, "{}"));

        List<OfferParser.Block> blocks = new ArrayList<>();
        for (Text.TextBlock block : textResult.getTextBlocks()) {
            Rect bounds = block.getBoundingBox();
            blocks.add(bounds != null
                ? new OfferParser.Block(block.getText(), bounds.left, bounds.top, bounds.right, bounds.bottom)
                : new OfferParser.Block(block.getText(), 0, 0, 0, 0));
        }
        List<OfferParser.DetectedOffer> offers = OfferParser.parseBlocks(blocks, config);
        if (offers.isEmpty()) return;
        // Con varias ofertas en pantalla (una lista), solo se sombrean todas: la voz y la
        // alerta de una por una saturarian al conductor. Con una sola oferta, se anuncia normal.
        boolean multiple = offers.size() > 1;

        if (overlayView != null) {
            List<CopilotOverlayView.HighlightItem> highlights = new ArrayList<>();
            for (OfferParser.DetectedOffer detected : offers) {
                if (!detected.hasBounds()) continue;
                Rect bounds = new Rect(detected.left, detected.top, detected.right, detected.bottom);
                String label = String.format(Locale.forLanguageTag("es-MX"),
                    "$%.0f · %s", detected.offer.fare, metricLabel(detected.offer));
                highlights.add(new CopilotOverlayView.HighlightItem(bounds, colorFor(detected.offer.verdict), label));
            }
            if (!highlights.isEmpty()) overlayView.showHighlights(highlights);
        }

        long now = System.currentTimeMillis();
        for (OfferParser.DetectedOffer detected : offers) {
            OfferAnalysis offer = detected.offer;
            if (offer.signature().equals(lastSignature) && now - lastOfferAt < DUPLICATE_WINDOW_MS) continue;
            lastSignature = offer.signature();
            lastOfferAt = now;

            JSONObject json = offer.toJson();
            getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                .putString(PREF_LAST_OFFER, json.toString()).apply();
            sendEvent("offer", json);
            if (!multiple) announce(offer.spokenText(config.perKmGoal));

            String icon = iconFor(offer.verdict);
            String verdictTitle = verdictTitleFor(offer.verdict);

            // Veredicto primero (es la decision), luego la tarifa ofrecida para confirmar que
            // hablamos del viaje que esta en pantalla, y al final el rendimiento contra la meta
            // activa (por hora o por km). Sin la palabra "Ofrecen" en el titulo: cabe entero.
            String title = String.format(Locale.forLanguageTag("es-MX"),
                "%s %s · $%.0f · %s", icon, verdictTitle, offer.fare, metricLabel(offer));
            String body = String.format(Locale.forLanguageTag("es-MX"),
                "$%.0f netos · %.0f min", offer.net, (offer.pickupMin + offer.tripMin));

            if (multiple) {
                String multiTitle = String.format(Locale.forLanguageTag("es-MX"),
                    "%d ofertas en pantalla", offers.size());
                updateNotification(multiTitle, title + " · " + body, false);
            } else {
                String detail = String.format(Locale.forLanguageTag("es-MX"),
                    "Ofrecen $%.0f · %s%n$%.0f netos · %.1f km · %.0f min%n%s",
                    offer.fare, String.valueOf(offer.platform).toUpperCase(), offer.net,
                    (offer.pickupKm + offer.tripKm), (offer.pickupMin + offer.tripMin), offer.explanation);
                sendAlertNotification(title, body, detail);
                updateNotification(title, body);
            }
            // Solo se procesa una oferta nueva por cuadro para no encimar voces/alertas; el
            // resto ya quedo sombreado arriba y se registrara en el siguiente cuadro (~650ms).
            break;
        }
    }

    private static int colorFor(String verdict) {
        return "good".equals(verdict) ? 0xFF00C9A7 : "maybe".equals(verdict) ? 0xFFF0A500 : 0xFFFF4055;
    }

    private static String iconFor(String verdict) {
        return "good".equals(verdict) ? "🟢" : "maybe".equals(verdict) ? "🟡" : "🔴";
    }

    private static String verdictTitleFor(String verdict) {
        return "good".equals(verdict) ? "BUEN VIAJE" : "maybe".equals(verdict) ? "VIAJE ACEPTABLE" : "NO CONVIENE";
    }

    // Muestra $/h o $/km segun cual de las dos metas eligio el conductor en Config.
    private String metricLabel(OfferAnalysis offer) {
        return config.perKmGoal
            ? String.format(Locale.forLanguageTag("es-MX"), "$%.1f/km", offer.perKm)
            : String.format(Locale.forLanguageTag("es-MX"), "$%.0f/h", offer.hourly);
    }

    private void sendStatus(boolean running, String message) {
        sendStatus(running, false, "", message);
    }

    private void sendStatus(boolean running, boolean needsConsent, String stopReason, String message) {
        JSONObject json = new JSONObject();
        try {
            json.put("running", running);
            json.put("needs_consent", needsConsent);
            json.put("stop_reason", stopReason);
            json.put("message", message);
        } catch (JSONException ignored) {}
        sendEvent("status", json);
    }

    private void recordStopped(String reason, boolean needsConsent, String message) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putBoolean(PREF_CAPTURE_ACTIVE, false)
            .putBoolean(PREF_NEEDS_CONSENT, needsConsent)
            .putString(PREF_STOP_REASON, reason)
            .apply();
        sendStatus(false, needsConsent, reason, message);
    }

    private void sendEvent(String event, JSONObject payload) {
        Intent broadcast = new Intent(ACTION_EVENT);
        broadcast.setPackage(getPackageName());
        broadcast.putExtra(EXTRA_EVENT, event);
        broadcast.putExtra(EXTRA_PAYLOAD, payload.toString());
        sendBroadcast(broadcast);
    }

    private void announce(String message) {
        if (!ttsReady || message == null || message.isEmpty()) return;
        tts.speak(message, TextToSpeech.QUEUE_FLUSH, null, "ruleto-copilot");
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
        if (ttsReady) {
            int result = tts.setLanguage(Locale.forLanguageTag("es-MX"));
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale("es"));
            }
            tts.setSpeechRate(1.45f);
        }
    }

    private Notification notification(String title, String body, boolean alert) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop = new Intent(this, CopilotCaptureService.class).setAction(ACTION_STOP);
        PendingIntent stopIntent = PendingIntent.getService(this, 1, stop,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent dump = new Intent(this, CopilotCaptureService.class).setAction(ACTION_DUMP);
        PendingIntent dumpIntent = PendingIntent.getService(this, 2, dump,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_copilot)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(!alert)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(0, "Apagar", stopIntent)
            .addAction(0, "Diagnóstico", dumpIntent)
            .build();
    }

    private void updateNotification(String title, String body) {
        updateNotification(title, body, true);
    }

    private void updateNotification(String title, String body, boolean alert) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(title, body, alert));
    }

    private void sendAlertNotification(String title, String body, String detail) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        Intent open = new Intent(this, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(this, 0, open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ALERTS_ID)
            .setSmallIcon(R.drawable.ic_stat_copilot)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(detail))
            .setContentIntent(openIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE | NotificationCompat.DEFAULT_LIGHTS);

        manager.notify(ALERT_NOTIFICATION_ID, builder.build());
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Copiloto de ofertas", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Muestra el estado de Ruleto IA.");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);

        NotificationChannel alertsChannel = new NotificationChannel(
            CHANNEL_ALERTS_ID, "Alertas de ofertas del Copiloto", NotificationManager.IMPORTANCE_HIGH);
        alertsChannel.setDescription("Notificaciones emergentes visuales para ofertas de viajes evaluadas.");
        alertsChannel.enableVibration(true);
        alertsChannel.enableLights(true);
        manager.createNotificationChannel(alertsChannel);
    }

    private void stopProjection() {
        if (imageReader != null) {
            imageReader.setOnImageAvailableListener(null, null);
            imageReader.close();
            imageReader = null;
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (projection != null) {
            projection.stop();
            projection = null;
        }
    }

    @Override
    public void onDestroy() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (prefs.getBoolean(PREF_CAPTURE_ACTIVE, false)) {
            boolean desired = prefs.getBoolean(PREF_DESIRED, false);
            recordStopped(desired ? "service_destroyed" : "user_stopped", desired,
                desired ? "La captura terminó. Toca iniciar para autorizarla otra vez." : "Copiloto apagado");
        }
        explicitShutdown = true;
        stopProjection();
        if (recognizer != null) recognizer.close();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (overlayView != null) {
            overlayView.clearHighlights();
            overlayView = null;
        }
        if (captureThread != null) captureThread.quitSafely();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private boolean isRuletoForeground() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null) {
            List<ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
            if (processes != null) {
                for (ActivityManager.RunningAppProcessInfo processInfo : processes) {
                    if (processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                        for (String pkg : processInfo.pkgList) {
                            if (pkg.equals(getPackageName())) return true;
                        }
                    }
                }
            }
        }
        return false;
    }
}
