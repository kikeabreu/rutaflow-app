package mx.rutaflow.app.location;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import java.util.UUID;

import mx.rutaflow.app.MainActivity;
import mx.rutaflow.app.R;

public class NativeTrackingService extends Service implements LocationListener {
    static final String ACTION_START_SESSION="mx.rutaflow.tracking.START_SESSION", ACTION_START_SEGMENT="mx.rutaflow.tracking.START_SEGMENT", ACTION_END_SEGMENT="mx.rutaflow.tracking.END_SEGMENT", ACTION_STOP_SESSION="mx.rutaflow.tracking.STOP_SESSION";
    static final String EXTRA_USER_ID="userId",EXTRA_SESSION_ID="sessionId", EXTRA_SEGMENT_ID="segmentId", EXTRA_SEGMENT_TYPE="segmentType";
    static final String PREFS="rutaflow_tracking", PREF_RUNNING="running", PREF_USER="userId", PREF_SESSION="sessionId", PREF_SEGMENT="segmentId", PREF_SEGMENT_TYPE="segmentType", PREF_STATE="state", PREF_MESSAGE="message", PREF_STATE_AT="stateAt";
    private static final String CHANNEL="rutaflow_tracking"; private static final int NOTIFICATION_ID=7501;
    private LocationManager locationManager; private TrackingStore store; private final LocationFilter filter=new LocationFilter();
    private String userId="",sessionId="", segmentId="", segmentType="", continuityId="";

    @Nullable @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onCreate(){super.onCreate();store=new TrackingStore(this);locationManager=(LocationManager)getSystemService(Context.LOCATION_SERVICE);createChannel();}

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        String action=intent.getAction();
        if(ACTION_STOP_SESSION.equals(action)){clearState("stopped","Jornada detenida");stopLocations();stopSelf();return START_NOT_STICKY;}
        if(ACTION_END_SEGMENT.equals(action)){segmentId="";segmentType="";continuityId="";filter.reset();persist("waiting_segment","Jornada activa; sin tramo en curso");updateNotification();return START_NOT_STICKY;}
        if(ACTION_START_SESSION.equals(action)){
            userId=intent.getStringExtra(EXTRA_USER_ID);sessionId=intent.getStringExtra(EXTRA_SESSION_ID);segmentId="";segmentType="";continuityId="";filter.reset();
            startForegroundLocation();persist("waiting_segment","Jornada activa; inicia un tramo");requestLocations();return START_NOT_STICKY;
        }
        if(ACTION_START_SEGMENT.equals(action)){
            restore(); if(sessionId.isEmpty()){stopSelf();return START_NOT_STICKY;}
            segmentId=intent.getStringExtra(EXTRA_SEGMENT_ID);segmentType=intent.getStringExtra(EXTRA_SEGMENT_TYPE);continuityId=UUID.randomUUID().toString();filter.reset();
            persist("tracking","Registrando "+segmentLabel(segmentType));updateNotification();requestLocations();return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    private void requestLocations(){
        if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED&&ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_COARSE_LOCATION)!=PackageManager.PERMISSION_GRANTED){clearState("permission_required","Permiso de ubicación requerido");stopSelf();return;}
        stopLocations();
        if(locationManager!=null){
            boolean enabled=false;
            if(locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)){locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER,3000L,0f,this);enabled=true;}
            if(locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)){locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,5000L,0f,this);enabled=true;}
            if(!enabled){persist("location_disabled","Activa la ubicación del teléfono");updateNotification();}
        }
    }

    @Override public void onLocationChanged(Location location){
        if(userId.isEmpty()||sessionId.isEmpty()||segmentId.isEmpty())return;
        LocationFilter.Decision decision=filter.evaluate(location,System.currentTimeMillis()); if(!decision.accepted)return;
        if(decision.startsContinuity)continuityId=UUID.randomUUID().toString();
        store.insert(userId,sessionId,segmentId,segmentType,continuityId,location);
    }
    @Override public void onProviderDisabled(String provider){}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}

    private void startForegroundLocation(){Notification notification=notification();if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION_ID,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(NOTIFICATION_ID,notification);}
    private Notification notification(){
        Intent open=new Intent(this,MainActivity.class);PendingIntent openIntent=PendingIntent.getActivity(this,10,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop=new Intent(this,NativeTrackingService.class).setAction(ACTION_STOP_SESSION);PendingIntent stopIntent=PendingIntent.getService(this,11,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        String text=segmentId.isEmpty()?"Jornada activa · sin tramo":("Registrando "+segmentLabel(segmentType));
        return new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_stat_copilot).setContentTitle("RutaFlow · ubicación activa").setContentText(text).setContentIntent(openIntent).setOngoing(true).setCategory(NotificationCompat.CATEGORY_SERVICE).addAction(0,"Detener",stopIntent).build();
    }
    private void updateNotification(){NotificationManager manager=getSystemService(NotificationManager.class);if(manager!=null)manager.notify(NOTIFICATION_ID,notification());}
    private String segmentLabel(String type){if("trip".equals(type))return "viaje";if("dead_km".equals(type))return "sin pasaje";return "jornada";}
    private void createChannel(){if(Build.VERSION.SDK_INT>=26){NotificationManager manager=getSystemService(NotificationManager.class);if(manager!=null){NotificationChannel channel=new NotificationChannel(CHANNEL,"Rastreo de jornada",NotificationManager.IMPORTANCE_LOW);channel.setDescription("Ubicación durante una jornada iniciada por el conductor.");manager.createNotificationChannel(channel);}}}
    private void persist(String state,String message){getSharedPreferences(PREFS,MODE_PRIVATE).edit().putBoolean(PREF_RUNNING,!sessionId.isEmpty()).putString(PREF_USER,userId).putString(PREF_SESSION,sessionId).putString(PREF_SEGMENT,segmentId).putString(PREF_SEGMENT_TYPE,segmentType).putString(PREF_STATE,state).putString(PREF_MESSAGE,message).putLong(PREF_STATE_AT,System.currentTimeMillis()).apply();}
    private void restore(){SharedPreferences p=getSharedPreferences(PREFS,MODE_PRIVATE);userId=p.getString(PREF_USER,"");sessionId=p.getString(PREF_SESSION,"");segmentId=p.getString(PREF_SEGMENT,"");segmentType=p.getString(PREF_SEGMENT_TYPE,"");}
    private void clearState(String state,String message){userId="";sessionId="";segmentId="";segmentType="";continuityId="";filter.reset();persist(state,message);}
    private void stopLocations(){if(locationManager!=null)locationManager.removeUpdates(this);}
    @Override public void onDestroy(){stopLocations();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
}
