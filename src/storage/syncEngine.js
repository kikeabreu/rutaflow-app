// src/storage/syncEngine.js
import { db } from './db';
import supabase from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Pushes a mutation to the local outbox. It will be synced when online.
 * @param {string} userId - The user's ID
 * @param {string} action - e.g., 'INSERT_TRIP', 'CLOSE_SHIFT'
 * @param {Object} payload - The data to send
 */
export async function pushToOutbox(userId, action, payload) {
    if (!userId) return;
    const mutationId = uuidv4();
    await db.outbox.add({
        id: mutationId,
        user_id: userId,
        action,
        payload,
        created_at: Date.now()
    });
    // Attempt sync immediately if online
    if (navigator.onLine) {
        syncOutbox(userId);
    }
}

let isSyncing = false;

/**
 * Processes the outbox queue and sends mutations to Supabase.
 */
export async function syncOutbox(userId) {
    if (!userId || !navigator.onLine || isSyncing) return;
    
    isSyncing = true;
    try {
        const pending = await db.outbox.where('user_id').equals(userId).sortBy('created_at');
        if (pending.length === 0) return;

        for (const item of pending) {
            let success = false;
            let errorMsg = null;

            try {
                // Determine action
                if (item.action === 'INSERT_TRIP') {
                    const { error } = await supabase.from('trips').insert(item.payload);
                    if (error) throw error;
                    success = true;
                } else if (item.action === 'INSERT_MOVEMENT') {
                    const { error } = await supabase.from('movements').insert(item.payload);
                    if (error) throw error;
                    success = true;
                } else if (item.action === 'CLOSE_SHIFT') {
                    // Assuming an RPC exists, or we do a manual closure
                    const { error } = await supabase.rpc('close_shift', item.payload);
                    if (error) throw error;
                    success = true;
                } else {
                    console.warn('Unknown outbox action', item.action);
                    success = true; // Mark success to dequeue unknown actions
                }
            } catch (err) {
                console.error(`Sync error for ${item.action}:`, err);
                errorMsg = err.message || JSON.stringify(err);
            }

            if (success) {
                await db.outbox.delete(item.id);
            } else if (errorMsg) {
                // Log error but keep in outbox to retry later
                await db.sync_errors.add({
                    user_id: userId,
                    outbox_id: item.id,
                    error_message: errorMsg
                });
                break; // Stop syncing this batch if one fails, to preserve order
            }
        }
    } finally {
        isSyncing = false;
    }
}

// Global listener for online events to trigger sync
window.addEventListener('online', () => {
    // We don't have the user object here directly, so we could broadcast an event
    // or rely on components calling syncOutbox when they detect online state.
    const event = new CustomEvent('rutaflow-online-sync');
    window.dispatchEvent(event);
});
