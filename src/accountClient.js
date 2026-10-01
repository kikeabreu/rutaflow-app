import { supabase } from "./supabaseClient";
import { getDeviceIdentity } from "./deviceIdentity";

// Errores de red o una base sin la migración no deben dejar al conductor
// fuera de la app: solo bloqueamos cuando el servidor responde que no.
const missingFunction = error => ["PGRST202", "42883"].includes(error?.code);

export async function claimDevice({ takeover = false } = {}) {
  const device = await getDeviceIdentity();
  const { data, error } = await supabase.rpc("ruleto_claim_device", {
    p_device_id: device.id, p_platform: device.platform, p_label: device.label, p_takeover: takeover,
  });
  if (error) {
    if (missingFunction(error)) return { active: true, unavailable: true };
    throw error;
  }
  if (data?.active && data?.switched) {
    // Revoca las sesiones del otro equipo: aunque alguien ignore la pantalla
    // de bloqueo, su sesión deja de renovarse.
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});
  }
  return data || { active: true };
}

export async function releaseDevice() {
  try {
    const device = await getDeviceIdentity();
    await supabase.rpc("ruleto_release_device", { p_device_id: device.id });
  } catch (error) {
    console.warn("No se pudo liberar el dispositivo", error?.message || error);
  }
}

const PHONE_ERRORS = {
  phone_invalid: "Ese número no es válido.",
  phone_taken: "Ese número ya está registrado en otra cuenta de Ruleto. Inicia sesión con esa cuenta o escríbenos a soporte.",
};

export const TRIAL_REASONS = {
  already_used: "Esta cuenta ya usó su prueba gratis.",
  subscribed: "Tu cuenta ya tiene una suscripción.",
  device_used: "Este celular ya usó la prueba gratis de Ruleto con otra cuenta.",
  phone_used: "Este número ya usó la prueba gratis de Ruleto.",
  no_device: "No pudimos identificar este dispositivo.",
};

export async function registerPhone(phone, country) {
  const device = await getDeviceIdentity();
  const { data, error } = await supabase.rpc("ruleto_register_phone", {
    p_phone: phone, p_country: country, p_device_id: device.id,
  });
  if (error) {
    if (missingFunction(error)) throw new Error("El registro de celular aún no está disponible. Intenta más tarde.");
    throw new Error(error.message || "No se pudo guardar tu número.");
  }
  if (!data?.ok) throw new Error(PHONE_ERRORS[data?.error] || "No se pudo guardar tu número.");
  return data;
}

export async function deviceHeader() {
  const device = await getDeviceIdentity();
  return { "X-Ruleto-Device": device.id };
}
