import { supabase } from './supabaseClient';

export const EMAIL_CONSENT_VERSION = '2026-10-07';
export const EMAIL_CONSENT_LABEL = 'Quiero recibir consejos, novedades y ofertas de Ruleto Drive por correo (opcional).';
export const EMAIL_CONSENT_HELP = 'Recibe consejos para aprovechar Pro, recordatorios de tu prueba y novedades de Ruleto Drive. Puedes darte de baja fácilmente en cualquier momento desde el enlace de cualquier correo o en Configuración. No afecta tu cuenta ni tu plan.';

export const registrationEmailPreference = enabled => ({
  lifecycle_email_enabled: enabled === true,
  lifecycle_email_consent_version: EMAIL_CONSENT_VERSION,
});

export async function loadEmailPreference() {
  const { data, error } = await supabase.rpc('get_lifecycle_email_preference');
  if (error) throw new Error('No pudimos consultar tu preferencia de correo. Reintenta cuando tengas conexión.');
  return data?.email_enabled === true;
}

export async function saveEmailPreference(enabled) {
  const { error } = await supabase.rpc('set_lifecycle_email_preference', { p_enabled: enabled === true });
  if (error) throw new Error('No pudimos guardar el cambio. Tu preferencia anterior se conserva; inténtalo de nuevo.');
}
