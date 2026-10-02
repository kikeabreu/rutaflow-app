import { supabase } from "./supabaseClient";
import { apiUrl } from "./apiClient";

// Sube la fecha cuando cambie el Aviso de Privacidad o los Términos: todos los
// usuarios volverán a ver la pantalla de consentimiento una sola vez.
export const PRIVACY_VERSION = "2026-10-01";

// null = aún no se sabe (se permite); false = el usuario no consintió ubicación.
let locationConsent = null;
export const setLocationConsent = value => { locationConsent = value; };
export function assertLocationConsent() {
  if (locationConsent === false) throw new Error("Activa el consentimiento de ubicación en Configuración para usar el GPS.");
}
export const locationConsentGranted = () => locationConsent !== false;

// Devuelve el consentimiento vigente, null si nunca aceptó, o undefined si la
// migración aún no existe (no se bloquea a nadie hasta aplicarla).
export async function loadConsent(userId) {
  const { data, error } = await supabase.from("privacy_consents").select("*")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return undefined;
  return data || null;
}

export async function saveConsent({ location, source = "app" }) {
  const { data, error } = await supabase.rpc("record_privacy_consent", {
    p_notice_version: PRIVACY_VERSION, p_accepted_location: Boolean(location), p_source: source,
  });
  if (error) throw new Error("No pudimos guardar tu consentimiento. Revisa tu conexión e inténtalo de nuevo.");
  return data;
}

export const consentIsCurrent = consent => consent === undefined || Boolean(consent && consent.notice_version === PRIVACY_VERSION && consent.accepted_terms && consent.accepted_financial);

export async function deleteAccount(session) {
  const token = session?.access_token;
  if (!token) throw new Error("Sesión no válida. Recarga la página.");
  const res = await fetch(apiUrl("/api/account/delete"), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ confirm: "ELIMINAR" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.deleted) throw new Error(data.error || "No se pudo eliminar tu cuenta. Escríbenos a privacidad@ruleto.mx.");
}
