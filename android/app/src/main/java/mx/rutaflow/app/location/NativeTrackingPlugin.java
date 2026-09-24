package mx.rutaflow.app.location;

import android.Manifest;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(name="RutaFlowTracking",permissions={@Permission(alias="location",strings={Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION})})
public class NativeTrackingPlugin extends Plugin {
    @PluginMethod public void supported(PluginCall call){JSObject out=new JSObject();out.put("supported",true);out.put("platform","android");call.resolve(out);}

    @PluginMethod public void startSession(PluginCall call){
        if(getPermissionState("location")!=PermissionState.GRANTED){requestPermissionForAlias("location",call,"locationPermissionResult");return;}
        beginSession(call);
    }
    @PermissionCallback private void locationPermissionResult(PluginCall call){if(getPermissionState("location")!=PermissionState.GRANTED){call.reject("Permiso de ubicación requerido");return;}beginSession(call);}
    private void beginSession(PluginCall call){
        SharedPreferences prefs=prefs();if(prefs.getBoolean(NativeTrackingService.PREF_RUNNING,false)){call.reject("Ya existe una jornada de ubicación activa");return;}
        String userId=call.getString("userId","");
        try{UUID.fromString(userId);}catch(Exception error){call.reject("userId inválido");return;}
        String sessionId=call.getString("sessionId",UUID.randomUUID().toString());
        if(sessionId.trim().isEmpty()||sessionId.length()>128){call.reject("sessionId inválido");return;}
        prefs.edit().putBoolean(NativeTrackingService.PREF_RUNNING,true).putString(NativeTrackingService.PREF_USER,userId).putString(NativeTrackingService.PREF_SESSION,sessionId).putString(NativeTrackingService.PREF_SEGMENT,"").putString(NativeTrackingService.PREF_SEGMENT_TYPE,"").putString(NativeTrackingService.PREF_STATE,"starting").putString(NativeTrackingService.PREF_MESSAGE,"Iniciando ubicación").putLong(NativeTrackingService.PREF_STATE_AT,System.currentTimeMillis()).commit();
        Intent intent=new Intent(getContext(),NativeTrackingService.class).setAction(NativeTrackingService.ACTION_START_SESSION).putExtra(NativeTrackingService.EXTRA_USER_ID,userId).putExtra(NativeTrackingService.EXTRA_SESSION_ID,sessionId);
        ContextCompat.startForegroundService(getContext(),intent);JSObject out=new JSObject();out.put("running",true);out.put("state","waiting_segment");out.put("sessionId",sessionId);out.put("message","Jornada de ubicación iniciada");call.resolve(out);
    }
    @PluginMethod public void startSegment(PluginCall call){
        if(!prefs().getBoolean(NativeTrackingService.PREF_RUNNING,false)){call.reject("No hay una jornada activa");return;}
        String type=call.getString("type","");if(!("shift".equals(type)||"dead_km".equals(type)||"trip".equals(type))){call.reject("Tipo de tramo inválido");return;}
        String id=call.getString("segmentId",UUID.randomUUID().toString());
        if(id.trim().isEmpty()||id.length()>128){call.reject("segmentId inválido");return;}
        Intent intent=new Intent(getContext(),NativeTrackingService.class).setAction(NativeTrackingService.ACTION_START_SEGMENT).putExtra(NativeTrackingService.EXTRA_SEGMENT_ID,id).putExtra(NativeTrackingService.EXTRA_SEGMENT_TYPE,type);getContext().startService(intent);
        JSObject out=statusObject();out.put("segmentId",id);out.put("segmentType",type);out.put("state","tracking");out.put("message","Tramo iniciado");call.resolve(out);
    }
    @PluginMethod public void endSegment(PluginCall call){if(!prefs().getBoolean(NativeTrackingService.PREF_RUNNING,false)){call.reject("No hay una jornada activa");return;}getContext().startService(new Intent(getContext(),NativeTrackingService.class).setAction(NativeTrackingService.ACTION_END_SEGMENT));JSObject out=statusObject();out.put("segmentId","");out.put("segmentType","");out.put("state","waiting_segment");out.put("message","Tramo terminado");call.resolve(out);}
    @PluginMethod public void stopSession(PluginCall call){getContext().startService(new Intent(getContext(),NativeTrackingService.class).setAction(NativeTrackingService.ACTION_STOP_SESSION));JSObject out=new JSObject();out.put("running",false);out.put("state","stopped");out.put("message","Jornada de ubicación detenida");call.resolve(out);}
    @PluginMethod public void status(PluginCall call){
        SharedPreferences p=prefs();String state=p.getString(NativeTrackingService.PREF_STATE,"stopped");
        boolean inStartupGrace="starting".equals(state)&&System.currentTimeMillis()-p.getLong(NativeTrackingService.PREF_STATE_AT,0)<10_000L;
        if(p.getBoolean(NativeTrackingService.PREF_RUNNING,false)&&!inStartupGrace&&!isServiceRunning())p.edit().putBoolean(NativeTrackingService.PREF_RUNNING,false).putString(NativeTrackingService.PREF_SEGMENT,"").putString(NativeTrackingService.PREF_SEGMENT_TYPE,"").putString(NativeTrackingService.PREF_STATE,"interrupted").putString(NativeTrackingService.PREF_MESSAGE,"Android detuvo el rastreo; vuelve a abrir RutaFlow para reanudar la ubicación").putLong(NativeTrackingService.PREF_STATE_AT,System.currentTimeMillis()).commit();
        call.resolve(statusObject());
    }
    @PluginMethod public void readPending(PluginCall call){String userId=call.getString("userId","");if(userId.isEmpty()){call.reject("Falta userId");return;}TrackingStore store=new TrackingStore(getContext());JSObject out=new JSObject();out.put("points",store.readPending(userId,call.getInt("limit",500)));store.close();call.resolve(out);}
    @PluginMethod public void ack(PluginCall call){String userId=call.getString("userId","");if(userId.isEmpty()){call.reject("Falta userId");return;}JSArray ids=call.getArray("sampleIds");if(ids==null){call.reject("Faltan sampleIds");return;}List<String> values=new ArrayList<>();try{for(int i=0;i<ids.length();i++)values.add(ids.getString(i));}catch(JSONException error){call.reject("sampleIds inválidos");return;}TrackingStore store=new TrackingStore(getContext());int count=store.acknowledge(userId,values);store.close();JSObject out=new JSObject();out.put("acknowledged",count);call.resolve(out);}
    private SharedPreferences prefs(){return getContext().getSharedPreferences(NativeTrackingService.PREFS,Context.MODE_PRIVATE);}
    private boolean isServiceRunning(){ActivityManager manager=(ActivityManager)getContext().getSystemService(Context.ACTIVITY_SERVICE);if(manager==null)return false;for(ActivityManager.RunningServiceInfo info:manager.getRunningServices(Integer.MAX_VALUE))if(NativeTrackingService.class.getName().equals(info.service.getClassName()))return true;return false;}
    private JSObject statusObject(){SharedPreferences p=prefs();JSObject out=new JSObject();out.put("supported",true);out.put("running",p.getBoolean(NativeTrackingService.PREF_RUNNING,false));out.put("state",p.getString(NativeTrackingService.PREF_STATE,"stopped"));out.put("message",p.getString(NativeTrackingService.PREF_MESSAGE,"Rastreo apagado"));out.put("userId",p.getString(NativeTrackingService.PREF_USER,""));out.put("sessionId",p.getString(NativeTrackingService.PREF_SESSION,""));out.put("segmentId",p.getString(NativeTrackingService.PREF_SEGMENT,""));out.put("segmentType",p.getString(NativeTrackingService.PREF_SEGMENT_TYPE,""));return out;}
}
