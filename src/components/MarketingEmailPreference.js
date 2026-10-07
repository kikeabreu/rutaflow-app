import { useEffect, useState } from 'react';
import { C } from '../theme';
import { EMAIL_CONSENT_LABEL, EMAIL_CONSENT_HELP, loadEmailPreference, saveEmailPreference } from '../marketingEmail';

export function MarketingEmailChoice({ checked, onChange, disabled = false }) {
  return <div style={{ fontSize: 12, lineHeight: 1.5 }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: C.text, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: C.accent, flexShrink: 0 }} />
      <span>{EMAIL_CONSENT_LABEL}</span>
    </label>
    <p style={{ margin: '6px 0 0 22px', fontSize: 11, color: C.muted }}>{EMAIL_CONSENT_HELP}</p>
  </div>;
}

export function MarketingEmailPreference({ userId }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMessage(''); setEnabled(false);
    loadEmailPreference().then(value => { if (active) setEnabled(value); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, retry]);
  const change = async next => {
    if (busy || loading || error) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await saveEmailPreference(next);
      setEnabled(next);
      setMessage(next ? 'Activaste los correos de consejos, novedades y ofertas.' : 'Te diste de baja de estos correos. Tu cuenta y tu plan no cambian.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <section aria-label="Preferencias de correo" style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
    <strong>Correos de Ruleto Drive</strong>
    <div style={{ marginTop: 10 }}><MarketingEmailChoice checked={enabled} onChange={change} disabled={loading || busy || Boolean(error)} /></div>
    {(loading || busy) && <p role="status" style={{ fontSize: 12, color: C.muted }}>{loading ? 'Consultando preferencia…' : 'Guardando…'}</p>}
    {message && <p role="status" style={{ fontSize: 12, color: C.teal }}>{message}</p>}
    {error && <div role="alert" style={{ fontSize: 12, color: C.danger }}>{error} <button type="button" className="text-link" onClick={() => setRetry(n => n + 1)}>Reintentar</button></div>}
  </section>;
}
