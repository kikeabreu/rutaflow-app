package mx.rutaflow.app.copilot;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
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
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import mx.rutaflow.app.MainActivity;
import mx.rutaflow.app.R;

public class CopilotCaptureService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_START = "mx.rutaflow.app.copilot.START";
    public static final String ACTION_STOP = "mx.rutaflow.app.copilot.STOP";
    public static final String ACTION_DUMP = "mx.rutaflow.app.copilot.DUMP";
    public static final String ACTION_EVENT = "mx.rutaflow.app.copilot.EVENT";
    public static final String EXTRA_EVENT = "event";
    public static final String EXTRA_PAYLOAD = "payload";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String PREFS = "rutaflow_copilot";
    public static final String PREF_CONFIG = "config";
    public static final String PREF_LAST_OFFER = "lastOffer";

    private static final String CHANNEL_ID = "rutaflow_copilot";
    private static final String CHANNEL_ALERTS_ID = "rutaflow_copilot_alerts";
    private static final int NOTIFICATION_ID = 7401;
    private static final int ALERT_NOTIFICATION_ID = 7402;
    private static final long OCR_INTERVAL_MS = 1100;
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
        captureThread = new HandlerThread("RutaFlowCapture");
        captureThread.start();
        captureHandler = new Handler(captureThread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;
        if (ACTION_STOP.equals(intent.getAction())) {
            announce("Copiloto apagado.");
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_DUMP.equals(intent.getAction())) {
            armDump();
            return START_STICKY;
        }
        if (!ACTION_START.equals(intent.getAction())) return START_STICKY;

        config = CopilotConfig.fromJson(getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(PREF_CONFIG, "{}"));
        startAsForeground("Escuchando ofertas", "RutaFlow analiza únicamente mientras este aviso esté activo.");

        int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
        Intent resultData;
        if (Build.VERSION.SDK_INT >= 33) {
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent.class);
        } else {
            //noinspection deprecation
            resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
        }
        if (resultCode == 0 || resultData == null) {
            sendStatus(false, "No recibimos permiso de captura.");
            stopSelf();
            return START_NOT_STICKY;
        }
        startProjection(resultCode, resultData);
        return START_STICKY;
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
        stopProjection();
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        projection = manager == null ? null : manager.getMediaProjection(resultCode, resultData);
        if (projection == null) {
            sendStatus(false, "No fue posible iniciar la captura.");
            stopSelf();
            return;
        }
        projection.registerCallback(new MediaProjection.Callback() {
            @Override
            public void onStop() {
                sendStatus(false, "Android detuvo la captura de pantalla.");
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
        virtualDisplay = projection.createVirtualDisplay(
            "RutaFlowCopilot", width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(), null, captureHandler
        );
        sendStatus(true, "Copiloto escuchando ofertas");
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
            if (isRutaFlowForeground()) {
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

    private boolean isRutaFlowScreen(String text) {
        if (text == null || text.trim().isEmpty()) return false;
        String lower = text.toLowerCase(Locale.ROOT);
        return lower.contains("rutaflow")
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
        handleRecognizedText(result.getText());
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

    private void handleRecognizedText(String text) {
        if (isRutaFlowScreen(text)) return;
        config = CopilotConfig.fromJson(getSharedPreferences(PREFS, MODE_PRIVATE)
            .getString(PREF_CONFIG, "{}"));
        OfferAnalysis offer = OfferParser.parse(text, config);
        if (offer == null || offer.confidence < 0.60) return;
        long now = System.currentTimeMillis();
        if (offer.signature().equals(lastSignature) && now - lastOfferAt < DUPLICATE_WINDOW_MS) return;
        lastSignature = offer.signature();
        lastOfferAt = now;
        JSONObject json = offer.toJson();
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString(PREF_LAST_OFFER, json.toString()).apply();
        sendEvent("offer", json);
        announce(offer.spokenText());

        String icon = "good".equals(offer.verdict) ? "🟢" : "maybe".equals(offer.verdict) ? "🟡" : "🔴";
        String verdictTitle = "good".equals(offer.verdict) ? "BUEN VIAJE"
            : "maybe".equals(offer.verdict) ? "VIAJE ACEPTABLE" : "NO CONVIENE";

        // Veredicto primero (es la decision), luego la tarifa ofrecida para confirmar que
        // hablamos del viaje que esta en pantalla, y al final el rendimiento por hora.
        // Sin la palabra "Ofrecen" en el titulo: cabe entero y no se corta el $/h.
        String title = String.format(Locale.forLanguageTag("es-MX"),
            "%s %s · $%.0f · $%.0f/h", icon, verdictTitle, offer.fare, offer.hourly);
        String body = String.format(Locale.forLanguageTag("es-MX"),
            "$%.0f netos · %.0f min", offer.net, (offer.pickupMin + offer.tripMin));
        String detail = String.format(Locale.forLanguageTag("es-MX"),
            "Ofrecen $%.0f · %s%n$%.0f netos · %.1f km · %.0f min%n%s",
            offer.fare, String.valueOf(offer.platform).toUpperCase(), offer.net,
            (offer.pickupKm + offer.tripKm), (offer.pickupMin + offer.tripMin), offer.explanation);

        sendAlertNotification(title, body, detail);
        updateNotification(title, body);
    }

    private void sendStatus(boolean running, String message) {
        JSONObject json = new JSONObject();
        try {
            json.put("running", running);
            json.put("message", message);
        } catch (JSONException ignored) {}
        sendEvent("status", json);
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
        tts.speak(message, TextToSpeech.QUEUE_FLUSH, null, "rutaflow-copilot");
    }

    @Override
    public void onInit(int status) {
        ttsReady = status == TextToSpeech.SUCCESS;
        if (ttsReady) {
            int result = tts.setLanguage(Locale.forLanguageTag("es-MX"));
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(new Locale("es"));
            }
            tts.setSpeechRate(1.08f);
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
        channel.setDescription("Muestra el estado del copiloto RutaFlow.");
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
        sendStatus(false, "Copiloto apagado");
        stopProjection();
        if (recognizer != null) recognizer.close();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (captureThread != null) captureThread.quitSafely();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    private boolean isRutaFlowForeground() {
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
