package mx.rutaflow.app.copilot;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "RutaFlowCopilot")
public class CopilotPlugin extends Plugin {
    private BroadcastReceiver eventReceiver;

    @Override
    public void load() {
        eventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String event = intent.getStringExtra(CopilotCaptureService.EXTRA_EVENT);
                String payload = intent.getStringExtra(CopilotCaptureService.EXTRA_PAYLOAD);
                JSObject data = new JSObject();
                try {
                    if (payload != null) data = new JSObject(payload);
                } catch (Exception ignored) {
                    data.put("message", payload == null ? "" : payload);
                }
                notifyListeners(event == null ? "status" : event, data);
            }
        };
        ContextCompat.registerReceiver(
            getContext(), eventReceiver,
            new IntentFilter(CopilotCaptureService.ACTION_EVENT),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (eventReceiver != null) {
            try { getContext().unregisterReceiver(eventReceiver); }
            catch (IllegalArgumentException ignored) {}
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("platform", "android");
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("running", isServiceRunning());
        result.put("message", isServiceRunning() ? "Copiloto escuchando ofertas" : "Copiloto apagado");
        String lastOffer = getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .getString(CopilotCaptureService.PREF_LAST_OFFER, "");
        if (lastOffer != null && !lastOffer.isEmpty()) {
            try { result.put("lastOffer", new JSObject(lastOffer)); }
            catch (Exception ignored) {}
        }
        call.resolve(result);
    }

    @PluginMethod
    public void updateConfig(PluginCall call) {
        String config = call.getString("config", "{}");
        getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .edit().putString(CopilotCaptureService.PREF_CONFIG, config).apply();
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        String config = call.getString("config", "{}");
        getContext().getSharedPreferences(CopilotCaptureService.PREFS, Context.MODE_PRIVATE)
            .edit().putString(CopilotCaptureService.PREF_CONFIG, config).apply();
        MediaProjectionManager manager = (MediaProjectionManager)
            getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            call.reject("Este teléfono no permite compartir la pantalla.");
            return;
        }
        startActivityForResult(call, manager.createScreenCaptureIntent(), "capturePermissionResult");
    }

    @ActivityCallback
    private void capturePermissionResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Necesitamos permiso de captura para leer las ofertas.");
            return;
        }
        Intent service = new Intent(getContext(), CopilotCaptureService.class);
        service.setAction(CopilotCaptureService.ACTION_START);
        service.putExtra(CopilotCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        service.putExtra(CopilotCaptureService.EXTRA_RESULT_DATA, result.getData());
        ContextCompat.startForegroundService(getContext(), service);
        JSObject response = new JSObject();
        response.put("running", true);
        response.put("message", "Copiloto iniciado. Regresa a tu app de viajes.");
        call.resolve(response);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent service = new Intent(getContext(), CopilotCaptureService.class);
        service.setAction(CopilotCaptureService.ACTION_STOP);
        getContext().startService(service);
        JSObject response = new JSObject();
        response.put("running", false);
        response.put("message", "Copiloto apagado");
        call.resolve(response);
    }

    private boolean isServiceRunning() {
        ActivityManager manager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) return false;
        for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
            if (CopilotCaptureService.class.getName().equals(service.service.getClassName())) return true;
        }
        return false;
    }
}
