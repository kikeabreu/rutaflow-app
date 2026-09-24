// src/storage/db.js
import Dexie from 'dexie';

export const db = new Dexie('RutaFlowOfflineDB');

db.version(1).stores({
    ui_state: 'key',             // Stores tabs, active modals, time/km counters
    drafts: 'id, user_id, type', // Unsaved trips, expenses, shifts
    entities: 'id, user_id, type', // Cached data (active days, etc)
    outbox: 'id, user_id, created_at', // Pending mutations for Supabase
    sync_errors: '++id, user_id, outbox_id, error_message', // Sync logs
    onboarding_state: 'user_id' // Onboarding progress
});

// Helper for UI State
export const UIStateStore = {
    async set(key, value) {
        return await db.ui_state.put({ key, value });
    },
    async get(key, defaultValue = null) {
        const row = await db.ui_state.get(key);
        return row ? row.value : defaultValue;
    }
};
