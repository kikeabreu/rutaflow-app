// src/storage/repositories.js
import { db } from './db';
import { pushToOutbox } from './syncEngine';
import { v4 as uuidv4 } from 'uuid';

export const DraftsRepo = {
    async save(userId, type, payload) {
        if (!userId) return;
        await db.drafts.put({ id: `${userId}_${type}`, user_id: userId, type, payload });
    },
    async get(userId, type) {
        if (!userId) return null;
        const draft = await db.drafts.get(`${userId}_${type}`);
        return draft ? draft.payload : null;
    },
    async delete(userId, type) {
        if (!userId) return;
        await db.drafts.delete(`${userId}_${type}`);
    }
};

export const EntitiesRepo = {
    async saveActiveDay(userId, dayPayload) {
        if (!userId) return;
        await db.entities.put({ id: `active_day_${userId}`, user_id: userId, type: 'active_day', payload: dayPayload });
    },
    async getActiveDay(userId) {
        if (!userId) return null;
        const entity = await db.entities.get(`active_day_${userId}`);
        return entity ? entity.payload : null;
    },
    async clearActiveDay(userId) {
        if (!userId) return;
        await db.entities.delete(`active_day_${userId}`);
    }
};

export const MovementsRepo = {
    async addMovementOffline(userId, action, payload) {
        // Optimistically save via outbox
        await pushToOutbox(userId, action, payload);
    }
};
