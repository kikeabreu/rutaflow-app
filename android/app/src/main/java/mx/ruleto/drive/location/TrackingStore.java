package mx.ruleto.drive.location;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.List;
import java.util.UUID;

final class TrackingStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "rutaflow_tracking.db";
    private static final int DB_VERSION = 2;

    TrackingStore(Context context) { super(context, DB_NAME, null, DB_VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("create table points (id integer primary key autoincrement, sample_id text not null unique, user_id text not null, session_id text not null, segment_id text not null, segment_type text not null, continuity_id text not null, latitude real not null, longitude real not null, accuracy_m real not null, captured_at integer not null, elapsed_ms integer not null, acknowledged integer not null default 0)");
        db.execSQL("create index points_pending on points(acknowledged,id)");
        db.execSQL("create index points_user_pending on points(user_id,acknowledged,id)");
        db.execSQL("create index points_session on points(session_id,segment_id,id)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if(oldVersion<2){
            db.execSQL("alter table points add column user_id text not null default ''");
            db.execSQL("create index points_user_pending on points(user_id,acknowledged,id)");
        }
    }

    void insert(String userId, String sessionId, String segmentId, String segmentType, String continuityId, Location location) {
        ContentValues values = new ContentValues();
        values.put("sample_id", UUID.randomUUID().toString()); values.put("session_id", sessionId);
        values.put("user_id",userId);
        values.put("segment_id", segmentId); values.put("segment_type", segmentType); values.put("continuity_id", continuityId);
        values.put("latitude", location.getLatitude()); values.put("longitude", location.getLongitude()); values.put("accuracy_m", location.getAccuracy());
        values.put("captured_at", location.getTime()); values.put("elapsed_ms", location.getElapsedRealtimeNanos() / 1_000_000L);
        getWritableDatabase().insertOrThrow("points", null, values);
    }

    JSArray readPending(String userId,int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, 1000));
        JSArray result = new JSArray();
        try (Cursor cursor = getReadableDatabase().query("points", null, "acknowledged=0 and user_id=?", new String[]{userId}, null, null, "id asc", String.valueOf(limit))) {
            while (cursor.moveToNext()) {
                JSObject point = new JSObject();
                point.put("id", cursor.getLong(cursor.getColumnIndexOrThrow("id")));
                point.put("sampleId", cursor.getString(cursor.getColumnIndexOrThrow("sample_id")));
                point.put("sessionId", cursor.getString(cursor.getColumnIndexOrThrow("session_id")));
                point.put("segmentId", cursor.getString(cursor.getColumnIndexOrThrow("segment_id")));
                point.put("segmentType", cursor.getString(cursor.getColumnIndexOrThrow("segment_type")));
                point.put("continuityId", cursor.getString(cursor.getColumnIndexOrThrow("continuity_id")));
                point.put("latitude", cursor.getDouble(cursor.getColumnIndexOrThrow("latitude")));
                point.put("longitude", cursor.getDouble(cursor.getColumnIndexOrThrow("longitude")));
                point.put("accuracyM", cursor.getDouble(cursor.getColumnIndexOrThrow("accuracy_m")));
                point.put("capturedAt", cursor.getLong(cursor.getColumnIndexOrThrow("captured_at")));
                result.put(point);
            }
        }
        return result;
    }

    int acknowledge(String userId,List<String> sampleIds) {
        if (sampleIds == null || sampleIds.isEmpty()) return 0;
        int changed = 0;
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            ContentValues values = new ContentValues(); values.put("acknowledged", 1);
            for (String id : sampleIds) if (id != null && !id.isEmpty()) changed += db.update("points", values, "sample_id=? and user_id=?", new String[]{id,userId});
            db.delete("points", "acknowledged=1 and user_id=?", new String[]{userId});
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
        return changed;
    }
}
