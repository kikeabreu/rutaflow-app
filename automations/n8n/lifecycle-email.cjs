'use strict';

function renderEmail(data, config) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const secureUrl = value => {
    const url = String(value || '');
    if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?(?:\/[a-z0-9/_%.-]*)?$/i.test(url)) throw new Error('Configura una URL HTTPS sin credenciales ni parámetros');
    return url;
  };
  const appUrl = secureUrl(config.appUrl);
  const unsubscribeUrl = secureUrl(config.unsubscribeUrl);
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.unsubscribe_token)) throw new Error('Token de baja inválido');
  const unsubscribeLink = unsubscribeUrl + '?token=' + encodeURIComponent(data.unsubscribe_token);
  const trialCampaign = ['welcome','activation','midpoint','ending','expired','return'].includes(data.campaign);
  const dateText = (value, label) => {
    const date = new Date(value ?? NaN);
    if (value === null || value === '' || !Number.isFinite(date.getTime())) throw new Error(label + ' inválido');
    return date.toLocaleString('es-MX', {timeZone:'America/Mexico_City',dateStyle:'long',timeStyle:'short'}) + ' (hora de Ciudad de México)';
  };
  const deadline = trialCampaign ? dateText(data.trial_until, 'Vencimiento') : '';
  const renewal = ['pro_renewal','pro_canceling'].includes(data.campaign) ? dateText(data.period_end, 'Fin de periodo') : '';
  const count30 = Number(data.trips_30d ?? 0);
  if (!Number.isSafeInteger(count30) || count30 < 0) throw new Error('Número de viajes inválido');
  const count = Number(data.trips_count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Número de viajes inválido');
  const copy = {
    welcome: ['Tus 14 días de Ruleto Drive Pro ya empezaron', `Tu prueba Pro vence el ${deadline}. Registra tu primer viaje para empezar a conocer tus costos y tu rendimiento.`, 'Registrar un viaje'],
    activation: ['Prueba Ruleto Drive con tu primer viaje', 'Todavía no tienes viajes registrados. Empieza con uno: captura la tarifa, distancia y tiempo para ver el cálculo de tu rendimiento.', 'Registrar mi primer viaje'],
    midpoint: ['Así va tu prueba de Ruleto Drive Pro', count > 0 ? `Ya registraste ${count} viaje${count===1?'':'s'} desde que comenzó tu prueba. Abre tu historial y consulta al asesor con tus propios datos. Tu prueba vence el ${deadline}.` : `Aún puedes aprovechar tu prueba: registra un viaje y prueba las funciones Pro. Tu acceso gratuito Pro vence el ${deadline}.`, 'Abrir Ruleto Drive'],
    ending: ['Tu prueba de Ruleto Drive Pro está por terminar', `Tu prueba vence el ${deadline}. ${count > 0 ? `Ya registraste ${count} viaje${count===1?'':'s'} durante este periodo. ` : ''}Revisa las opciones de Pro en la app si quieres seguir usando sus funciones.`, 'Ver opciones de Pro'],
    expired: ['Terminó tu prueba de Ruleto Drive Pro', 'Tu prueba gratuita terminó. Puedes seguir usando Ruleto Drive Free o consultar las opciones para continuar con Pro.', 'Abrir Ruleto Drive'],
    return: ['Retoma tus viajes con Ruleto Drive', 'Hace varios días que no registras viajes. Vuelve a Ruleto Drive y retoma el seguimiento de tus costos y rendimiento con Free. Las opciones de Pro siguen disponibles en la app.', 'Volver a Ruleto Drive'],
    pro_renewal: ['Tu suscripción de Ruleto Drive Pro se renueva pronto', `Tu suscripción Pro se renueva el ${renewal}. Si quieres revisar o cambiar tu plan, entra a Configuración y abre la sección Suscripción.`, 'Abrir Ruleto Drive'],
    pro_canceling: ['Tu Ruleto Drive Pro termina pronto', `Tu suscripción Pro no se renovará y tu acceso Pro termina el ${renewal}. Después tu cuenta seguirá en Free. Si quieres continuar con Pro, puedes reactivar tu suscripción en Configuración, sección Suscripción.`, 'Abrir Ruleto Drive'],
    free_recap: ['Tu cuenta de Ruleto Drive sigue activa', `Tu cuenta sigue activa en Free. ${count30 > 0 ? `En los últimos 30 días registraste ${count30} viaje${count30===1?'':'s'}. ` : ''}Puedes seguir registrando tus viajes cuando quieras; las opciones de Pro siguen disponibles en la app.`, 'Abrir Ruleto Drive'],
    free_offer: ['Ruleto Drive Pro sigue disponible para ti', 'Ya llevas un tiempo con Ruleto Drive Free. Si quieres volver a las funciones Pro, revisa las opciones en la app cuando te convenga.', 'Ver opciones de Pro'],
  }[data.campaign];
  if (!copy) throw new Error('Campaña desconocida');
  const name = String(data.name || 'conductor').trim().slice(0,80);
  return {
    ...data, subject:copy[0],
    text:`Hola, ${name}.\n\n${copy[1]}\n\n${copy[2]}: ${appUrl}\n\nDejar de recibir estos correos: ${unsubscribeLink}`,
    html:`<!doctype html><html lang="es"><body style="font-family:Arial,sans-serif;color:#172129;max-width:600px;margin:auto;padding:24px"><h1 style="font-size:22px">Ruleto Drive</h1><p>Hola, ${escape(name)}.</p><p>${escape(copy[1])}</p><p><a href="${escape(appUrl)}" style="display:inline-block;background:#146b50;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">${escape(copy[2])}</a></p><hr><p style="font-size:12px">Recibes este mensaje porque activaste los correos de acompañamiento de Ruleto Drive. <a href="${escape(unsubscribeLink)}">Dejar de recibirlos</a>.</p></body></html>`,
  };
}
module.exports = {renderEmail};
