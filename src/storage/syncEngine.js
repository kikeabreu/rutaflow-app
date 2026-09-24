// src/storage/syncEngine.js
//
// FRONTERA DELIBERADA — leer antes de agregar acciones aquí.
//
// Esta cola Dexie existe SOLO para los tickets de soporte. Los viajes y eventos
// operativos NO pasan por aquí: usan src/offlineStore.js, que ya tiene su propio
// outbox, snapshots, contador de pendientes y reintentos cableados en App.js
// (ver syncPendingFor). Tener dos colas para lo mismo fue la causa de que los
// reportes de soporte se perdieran en silencio durante días.
//
// Si necesitas encolar otra mutación, decide primero a cuál de los dos sistemas
// pertenece. No agregues un tercero.
import { db } from './db';
import { supabase } from '../supabaseClient';

export const SUPPORT_TICKET = 'SUPPORT_TICKET';

// RLS verifica estos límites en la base; si no se respetan, el insert rebota.
const SUBJECT_FALLBACK = 'Sugerencia o reporte de conductor';
const SUBJECT_MIN = 4;
const SUBJECT_MAX = 160;
const BODY_MAX = 5000;

export function normalizeSubject(subject) {
  const clean = (subject || '').trim();
  return clean.length >= SUBJECT_MIN ? clean.slice(0, SUBJECT_MAX) : SUBJECT_FALLBACK;
}

export function normalizeBody(message, deviceInfo) {
  const clean = (message || '').trim();
  if (!clean) throw new Error('El reporte de soporte llegó vacío.');
  const footer = deviceInfo ? `\n\n---\nDispositivo: ${JSON.stringify(deviceInfo)}` : '';
  return `${clean}${footer}`.slice(0, BODY_MAX);
}

/**
 * Envía un ticket a la nube. El ticket y su primer mensaje son dos tablas
 * distintas, así que se insertan en orden y el mensaje hereda el id del ticket.
 */
export async function syncSupportTicket(payload) {
  const body = normalizeBody(payload.message, payload.device_info);
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      user_id: payload.user_id,
      subject: normalizeSubject(payload.subject),
      category: 'other',
      priority: 'normal',
    })
    .select('id')
    .single();
  if (ticketError) throw ticketError;

  const { error: messageError } = await supabase.from('support_messages').insert({
    ticket_id: ticket.id,
    author_id: payload.user_id,
    author_kind: 'user',
    body,
  });
  if (messageError) throw messageError;
  return ticket.id;
}

/**
 * Guarda el ticket localmente para reintentarlo. Se usa cuando no hay conexión
 * o cuando el insert directo falla; syncOutbox lo drena después.
 */
export async function queueSupportTicket(payload) {
  if (!payload?.user_id) {
    // Sin dueño autenticado, RLS rechazará el insert para siempre. Se guarda
    // igual para no perder el texto del conductor, pero no se podrá enviar.
    console.warn('Ticket de soporte sin usuario: queda local y no se sincronizará.');
  }
  await db.outbox.add({
    id: crypto.randomUUID(),
    user_id: payload?.user_id || 'anonymous',
    action: SUPPORT_TICKET,
    payload,
    created_at: Date.now(),
  });
}

let isSyncing = false;

/**
 * Drena la cola. Lo llama App.js al entrar, al volver la conexión y al volver
 * el foco. Un fallo deja el registro en la cola para el siguiente intento.
 */
export async function syncOutbox(userId) {
  if (!userId || !navigator.onLine || isSyncing) return;

  isSyncing = true;
  try {
    const pending = await db.outbox.where('user_id').equals(userId).sortBy('created_at');
    for (const item of pending) {
      try {
        if (item.action === SUPPORT_TICKET) {
          await syncSupportTicket(item.payload || {});
        } else {
          // No se descarta: hacerlo en silencio fue justo el bug original.
          throw new Error(`Acción de outbox desconocida: ${item.action}`);
        }
        await db.outbox.delete(item.id);
      } catch (err) {
        console.error(`Sync error for ${item.action}:`, err);
        await db.sync_errors.add({
          user_id: userId,
          outbox_id: item.id,
          error_message: err.message || JSON.stringify(err),
        });
        break; // Se preserva el orden: se reintenta desde aquí la próxima vez.
      }
    }
  } finally {
    isSyncing = false;
  }
}
