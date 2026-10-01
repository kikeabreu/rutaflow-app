import React, { useEffect, useState } from 'react';
import { authorized } from '../updateClient';
import { C } from '../theme';

const states = { draft: 'Borrador', published: 'Publicada', withdrawn: 'Retirada', queued: 'En espera', sending: 'Enviando', completed: 'Terminada', cancelled: 'Cancelada' };
const initialDraft = { platform: 'android', version_label: '', build_number: '', minimum_build: 0, notes: '' };

export function UpdatePanel({ onClose }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(initialDraft);
  const [preview, setPreview] = useState(null);
  const [minimum, setMinimum] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function load() {
    try { setData(await authorized('/api/updates/admin')); setError(''); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function fillWebBuild() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/build-info.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo leer la compilación web publicada');
      const info = await response.json();
      if (!Number.isSafeInteger(Number(info.build_number)) || !info.version_label) throw new Error('Los datos de la compilación web están incompletos');
      setDraft(p => ({ ...p, platform: 'web', build_number: String(info.build_number), version_label: String(info.version_label) }));
      setFeedback('Completé versión y número con la PWA que está publicada ahora. Revisa el mínimo y las novedades antes de guardar.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function act(action, details = {}) {
    setBusy(true); setError(''); setFeedback('');
    try {
      const result = await authorized('/api/updates/admin', { method: 'POST', body: JSON.stringify({ action, ...details }) });
      if (action === 'preview') setPreview({ release: details.release_id, count: result.eligible });
      else {
        if (action === 'draft') setDraft(initialDraft);
        if (action === 'minimum') setMinimum(null);
        setFeedback(action === 'send' ? (result.eligible
          ? `${details.test ? 'Prueba' : 'Aviso'} en cola para ${result.eligible} ${result.eligible === 1 ? 'instalación' : 'instalaciones'}. Consulta el resultado en Campañas.`
          : 'No hay instalaciones elegibles. No se enviará ninguna notificación.')
          : ({ draft: 'Borrador guardado.', publish: 'Versión publicada.', minimum: 'Mínimo actualizado.', withdraw: 'Versión retirada.', cancel: 'Envíos pendientes cancelados.' }[action] || 'Cambios guardados.'));
        await load();
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 18 };
  const hint = { color: C.muted, fontSize: 12, lineHeight: 1.55, marginTop: 5 };
  const input = { display: 'block', width: '100%', background: C.card2, color: C.text, border: `1px solid ${C.bord2}`, borderRadius: 9, padding: '11px 12px', marginTop: 7, fontSize: 16 };
  const primary = { background: C.teal, color: '#fff', borderRadius: 9, padding: '11px 14px', fontSize: 13, fontWeight: 800 };
  const secondary = { color: C.teal, border: `1px solid ${C.teal}`, borderRadius: 9, padding: '10px 12px', fontSize: 12, fontWeight: 700 };
  const row = { display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 };
  const field = (key, label, help, type = 'text') => <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>
    {label}<input style={input} type={type} min={type === 'number' ? 0 : undefined} value={draft[key]} onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))} />
    <span style={{ ...hint, display: 'block', fontWeight: 400 }}>{help}</span>
  </label>;

  return <div style={{ minHeight: '100%', paddingBottom: 36 }}>
    <header style={{ position: 'sticky', top: 0, zIndex: 2, background: C.bg, borderBottom: `1px solid ${C.border}`, padding: 'calc(10px + env(safe-area-inset-top)) 16px 12px' }}>
      <div style={{ maxWidth: 760, margin: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div><div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>Administración</div><h1 style={{ fontSize: 22, lineHeight: 1.2, marginTop: 3 }}>Versiones y avisos</h1></div>
        <button type="button" onClick={onClose} aria-label="Volver a Configuración" style={{ ...secondary, flexShrink: 0, minHeight: 44 }}>← Configuración</button>
      </div>
    </header>
    <main style={{ maxWidth: 760, margin: 'auto', padding: '20px 16px' }}>
      <div style={{ ...card, background: C.card2 }}><h2 style={{ fontSize: 17 }}>Cómo funciona</h2>
        <ol style={{ paddingLeft: 20, marginTop: 9, color: C.text, fontSize: 13, lineHeight: 1.7 }}>
          <li>Publica primero la PWA o la APK. Después crea aquí un borrador con el mismo número de compilación.</li>
          <li>Revisa el texto y publica la versión. Esto activa el aviso dentro de la app, aunque no envíes push.</li>
          <li>Cuenta los destinatarios, envía una prueba a tus dispositivos y comprueba que llega. Luego envía el aviso general.</li>
        </ol><p style={hint}>El envío push es opcional. “Mínimo admitido” controla si se puede iniciar otra jornada; déjalo en 0 para una actualización opcional.</p>
      </div>
      {error && <p role="alert" style={{ ...card, borderColor: C.danger, color: C.danger }}>{error}</p>}
      {feedback && <p role="status" style={{ ...card, borderColor: C.teal }}>{feedback}</p>}
      <section style={card} aria-labelledby="draft-title"><h2 id="draft-title" style={{ fontSize: 19 }}>Nuevo borrador</h2><p style={hint}>Guardar no publica ni envía nada. Puedes comprobar los datos antes de activar la versión.</p>
        <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>Plataforma
          <select style={input} value={draft.platform} onChange={e => setDraft(p => ({ ...p, platform: e.target.value }))}><option value="android">Android (APK)</option><option value="web">PWA (web, iPhone y computadoras)</option></select>
          <span style={{ ...hint, display: 'block', fontWeight: 400 }}>Elige dónde se instaló esta compilación. Cada plataforma tiene su propio catálogo.</span>
        </label>
        {draft.platform === 'web' ? <p style={hint}><button type="button" className="text-link" disabled={busy} onClick={fillWebBuild}>Usar versión web publicada</button> · <a href="/build-info.json" target="_blank" rel="noopener noreferrer">Ver datos de compilación</a></p>
          : <p style={hint}>Última versión Android publicada: {data?.releases?.find(r => r.platform === 'android' && r.status === 'published')?.version_label || 'ninguna'}. Usa el versionCode y versionName de la nueva APK, después de subirla a GitHub Releases.</p>}
        {field('version_label', 'Versión visible', 'Android: versionName de la APK, por ejemplo 1.4.8-beta. PWA: version_label de build-info.json.')}
        {field('build_number', 'Número de compilación', 'Android: versionCode de la APK. PWA: build_number de build-info.json. Debe aumentar en cada publicación.', 'number')}
        {field('minimum_build', 'Mínimo admitido', '0 significa actualización opcional. Un número mayor impide iniciar otra jornada a las compilaciones inferiores.', 'number')}
        <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>Novedades
          <textarea style={{ ...input, minHeight: 86, resize: 'vertical' }} value={draft.notes} onChange={e => setDraft(p => ({ ...p, notes: e.target.value }))} />
          <span style={{ ...hint, display: 'block', fontWeight: 400 }}>Texto del aviso dentro de la app; los primeros 120 caracteres también aparecen en el push.</span>
        </label><div style={row}><button disabled={busy} onClick={() => act('draft', draft)} style={primary}>Guardar borrador</button></div>
      </section>
      <section aria-labelledby="releases-title"><h2 id="releases-title" style={{ fontSize: 19, margin: '24px 0 10px' }}>Versiones</h2>{!data && <p style={hint}>Cargando versiones…</p>}
        {data?.releases?.map(r => <article key={r.id} style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}><strong style={{ fontSize: 16 }}>{r.platform === 'web' ? 'PWA' : 'Android'} · {r.version_label}</strong><span style={{ color: r.status === 'published' ? C.teal : C.muted, fontWeight: 800, fontSize: 12 }}>{states[r.status] || r.status}</span></div>
          <p style={{ marginTop: 9, whiteSpace: 'pre-wrap', fontSize: 13 }}>{r.notes || 'Sin novedades'}</p><p style={hint}>Compilación {r.build_number} · Mínimo {r.minimum_build} · Actualizaciones observadas {r.observed || 0}</p>
          {r.status === 'draft' && <><p style={hint}>Publicar activa el aviso dentro de la app. Se comprobará que la PWA ya está desplegada o que la APK está disponible en la ruta pública.</p><div style={row}><button disabled={busy} onClick={() => act('publish', { release_id: r.id })} style={primary}>Publicar versión</button></div></>}
          {r.status === 'published' && <>
            <div style={row}><button disabled={busy} onClick={() => act('preview', { release_id: r.id })} style={secondary}>Vista previa y destinatarios</button></div>
            {preview?.release === r.id && <div style={{ ...card, marginTop: 12, marginBottom: 0, background: C.card2 }}><small style={{ color: C.muted }}>Así se verá la notificación</small><strong style={{ display: 'block', marginTop: 7 }}>Nueva versión de Ruleto Drive</strong><p style={{ fontSize: 13, marginTop: 5 }}>{r.notes?.slice(0, 120) || `Actualiza a ${r.version_label}`}</p><p style={{ ...hint, marginTop: 10 }}>{preview.count} {preview.count === 1 ? 'instalación' : 'instalaciones'} con permiso push y una compilación anterior.</p></div>}
            <p style={{ ...hint, marginTop: 16 }}><strong>Enviar prueba:</strong> solo a tus dispositivos elegibles. Si el total es 0, activa avisos en Configuración desde esta cuenta y una compilación anterior.</p>
            <div style={row}><button disabled={busy} onClick={() => act('send', { release_id: r.id, test: true })} style={secondary}>Enviar prueba a mis dispositivos</button></div>
            <p style={{ ...hint, marginTop: 16 }}><strong>Enviar aviso:</strong> agrega a la cola todas las instalaciones elegibles. Solo puede enviarse una campaña general por versión; comprueba primero la prueba.</p>
            <div style={row}><button disabled={busy} onClick={() => { if (window.confirm(`¿Enviar aviso de ${r.version_label} a todos los dispositivos elegibles?`)) act('send', { release_id: r.id }); }} style={primary}>Enviar aviso general</button></div>
            <p style={{ ...hint, marginTop: 16 }}><strong>Cambiar mínimo:</strong> 0 deja la actualización opcional. Un valor mayor bloquea el inicio de otra jornada a quien tenga una compilación inferior; puede terminar y guardar la actual. Puedes reducirlo después.</p>
            {minimum?.release === r.id ? <div style={row}><input aria-label="Nuevo mínimo admitido" type="number" min="0" max={r.build_number} value={minimum.value} onChange={e => setMinimum({ release: r.id, value: e.target.value })} style={{ ...input, width: 170, marginTop: 0 }} /><button disabled={busy} onClick={() => act('minimum', { release_id: r.id, minimum_build: Number(minimum.value) })} style={secondary}>Guardar mínimo</button><button onClick={() => setMinimum(null)} className="text-link">Cancelar</button></div> : <div style={row}><button disabled={busy} onClick={() => setMinimum({ release: r.id, value: r.minimum_build })} style={secondary}>Cambiar mínimo</button></div>}
            <p style={{ ...hint, marginTop: 16 }}><strong>Retirar:</strong> deja de recomendar esta versión. La APK publicada sigue disponible en GitHub hasta que se retire por separado.</p>
            <div style={row}><button disabled={busy} onClick={() => { if (window.confirm(`¿Retirar ${r.version_label}? Dejará de aparecer como versión disponible.`)) act('withdraw', { release_id: r.id }); }} style={{ ...secondary, color: C.danger, borderColor: C.danger }}>Retirar versión</button></div>
          </>}
          {r.status === 'withdrawn' && <p style={hint}>Esta versión ya no aparece como actualización vigente.</p>}
        </article>)}
      </section>
      <section aria-labelledby="campaigns-title"><h2 id="campaigns-title" style={{ fontSize: 19, margin: '24px 0 8px' }}>Campañas</h2><p style={hint}>“Aceptados” significa que el proveedor recibió la solicitud; no confirma entrega ni lectura. Una campaña con 0 pendientes y 0 aceptados no envió nada.</p>
        {!data?.campaigns?.length && <p style={{ ...card, marginTop: 12 }}>Aún no hay campañas.</p>}
        {data?.campaigns?.map(c => <div key={c.id} style={{ ...card, marginTop: 12 }}><strong>{c.kind === 'test' ? 'Prueba' : 'Aviso general'} · {states[c.status] || c.status}</strong><p style={{ ...hint, marginTop: 7 }}>Pendientes {c.counts?.pending || 0} · En proceso {c.counts?.processing || 0} · Aceptados {c.counts?.accepted || 0} · Fallidos {c.counts?.failed || 0}</p>{['queued', 'sending'].includes(c.status) && <div style={row}><button disabled={busy} onClick={() => act('cancel', { release_id: c.release_id, campaign_id: c.id })} style={secondary}>Cancelar envíos pendientes</button></div>}</div>)}
      </section>
      <section aria-labelledby="activity-title"><h2 id="activity-title" style={{ fontSize: 19, margin: '24px 0 8px' }}>Actividad</h2><p style={hint}>Historial de publicaciones, cambios de política y campañas.</p>{data?.audit?.map(a => <p key={a.id} style={{ fontSize: 12, borderBottom: `1px solid ${C.border}`, padding: '9px 0' }}>{new Date(a.created_at).toLocaleString()} · {a.action}</p>)}</section>
    </main>
  </div>;
}
