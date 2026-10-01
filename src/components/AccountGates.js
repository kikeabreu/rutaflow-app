import React, { useEffect, useRef, useState } from "react";
import { C, ACCENT_FILL } from "../theme";
import { Logo } from "./Logo";
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso, normalizePhone, splitPhone } from "../phone";
import { registerPhone, TRIAL_REASONS } from "../accountClient";

const shell = () => ({
  background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
  padding: "calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom))",
});
const card = () => ({ width: "100%", maxWidth: 400, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 18px" });
const primary = disabled => ({
  width: "100%", padding: "13px", background: disabled ? C.card2 : ACCENT_FILL, color: disabled ? C.muted : "#000",
  border: "none", borderRadius: 11, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
});
const secondary = () => ({ width: "100%", padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 11, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" });

export function PhoneField({ country, onCountry, value, onChange, autoFocus = false }) {
  const selected = countryByIso(country);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {/* El select va invisible encima de una etiqueta compacta: al abrirlo se
          ve la lista completa, cerrado solo ocupa bandera y lada. */}
      <label style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center", gap: 4, minHeight: 46, padding: "0 10px", background: C.well, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 14 }}>
        <span aria-hidden="true">{selected.flag} +{selected.dial}</span>
        <span aria-hidden="true" style={{ color: C.muted, fontSize: 10 }}>▾</span>
        <select
          aria-label="Prefijo del país"
          value={selected.iso}
          onChange={e => onCountry(e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: 16 }}
        >
          {COUNTRIES.map(c => <option key={c.iso} value={c.iso}>{c.flag} {c.name} (+{c.dial})</option>)}
        </select>
      </label>
      <input
        type="tel" inputMode="tel" autoComplete="tel-national" autoFocus={autoFocus}
        placeholder={selected.iso === "MX" ? "55 1234 5678" : "Número celular"}
        value={value} onChange={e => onChange(e.target.value.replace(/[^\d\s()-]/g, ""))}
        style={{ flex: 1, minWidth: 0, background: C.well, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none" }}
      />
    </div>
  );
}

const ago = iso => {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
};

export function DeviceGate({ info, busy, error, onTakeover, onLogout, onSupport }) {
  const other = info?.other || {};
  const limit = Boolean(info?.limit_reached);
  const left = Number(info?.switches_left ?? 0);
  const max = Number(info?.max_switches ?? 3);
  return (
    <div style={shell()}>
      <div style={card()}>
        <div style={{ textAlign: "center", marginBottom: 16 }}><Logo size={22} iconSize={44} stacked tagline={false} /></div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: "center", marginBottom: 8 }}>Ruleto está abierto en otro dispositivo</div>
        <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.55, marginBottom: 14 }}>
          Tu cuenta solo puede usarse en un celular a la vez.
        </div>
        <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.1em", marginBottom: 4 }}>DISPOSITIVO ACTIVO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{other.label || (other.platform === "android" ? "Celular Android" : "Otro dispositivo")}</div>
          {other.seen_at && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Usado {ago(other.seen_at)}</div>}
        </div>
        {limit ? (
          <div style={{ fontSize: 12, color: C.warn, background: `${C.warn}14`, border: `1px solid ${C.warn}44`, borderRadius: 9, padding: "10px 12px", lineHeight: 1.5, marginBottom: 14 }}>
            Ya cambiaste de dispositivo {max} veces en los últimos 30 días. Para moverla otra vez, escríbenos a soporte.
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 14 }}>
            Si continúas aquí, Ruleto se cerrará en el otro dispositivo. Te {left === 1 ? "queda 1 cambio" : `quedan ${left} cambios`} de dispositivo en los próximos 30 días.
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: C.danger, background: `${C.danger}12`, border: `1px solid ${C.danger}33`, borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {limit
            ? <button onClick={onSupport} style={primary(false)}>Contactar soporte</button>
            : <button onClick={onTakeover} disabled={busy} style={primary(busy)}>{busy ? "Cambiando…" : "Usar Ruleto en este dispositivo"}</button>}
          <button onClick={onLogout} style={secondary()}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}

// Pide el celular a todos los que no lo tengan (incluye cuentas de Google).
// Al guardarlo se decide la prueba gratis: una por celular y por número.
// Solo estos motivos merecen explicación: los demás (ya tuvo prueba, ya paga)
// no son una negativa para el conductor.
const DENIED = ["device_used", "phone_used", "no_device"];

export function PhoneGate({ session, onDone, onLogout, onCancel }) {
  const meta = session?.user?.user_metadata || {};
  const initial = meta.phone ? splitPhone(meta.phone, meta.phone_country) : { iso: DEFAULT_COUNTRY, local: "" };
  const [country, setCountry] = useState(initial.iso);
  const [local, setLocal] = useState(initial.local);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const autoTried = useRef(false);

  const submit = async e => {
    e?.preventDefault?.();
    if (busy) return;
    setError("");
    let phone;
    try { phone = normalizePhone(country, local); } catch (err) { setError(err.message); return; }
    setBusy(true);
    try {
      const data = await registerPhone(phone, country);
      setResult(data.trial || { granted: false });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  // Quien se registró con correo ya escribió su número: lo guardamos solo.
  useEffect(() => {
    if (autoTried.current || !meta.phone || onCancel) return;
    autoTried.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (result) {
    const message = result.granted
      ? "Tu prueba de 14 días de Ruleto Pro ya está activa. No necesitas tarjeta."
      : !onCancel && DENIED.includes(result.reason) ? `${TRIAL_REASONS[result.reason]} Puedes seguir en el plan Free o contratar Pro.`
      : onCancel ? "Tu número quedó actualizado." : "Ya puedes seguir usando Ruleto.";
    return (
      <div style={shell()}>
        <div style={card()}>
          <div style={{ textAlign: "center", fontSize: 42, marginBottom: 8 }}>{result.granted ? "🎁" : "✅"}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: result.granted ? C.teal : C.text, textAlign: "center", marginBottom: 8 }}>{result.granted ? "¡Listo, ya tienes Pro!" : "Número guardado"}</div>
          <div style={{ fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 1.55, marginBottom: 18 }}>{message}</div>
          <button onClick={() => onDone(result)} style={primary(false)}>Continuar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell()}>
      <form onSubmit={submit} style={card()}>
        <div style={{ textAlign: "center", marginBottom: 16 }}><Logo size={22} iconSize={44} stacked tagline={false} /></div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: "center", marginBottom: 8 }}>{onCancel ? "Cambiar número celular" : "Agrega tu número celular"}</div>
        <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.55, marginBottom: 16 }}>
          {onCancel ? "Usaremos este número para contactarte sobre tu cuenta." : "Es obligatorio para usar Ruleto. Lo usamos para proteger tu cuenta y contactarte si necesitas soporte."}
        </div>
        <PhoneField country={country} onCountry={setCountry} value={local} onChange={setLocal} autoFocus />
        <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>Lada predeterminada: México +52. Cámbiala si tu número es de otro país.</div>
        {error && <div style={{ fontSize: 12, color: C.danger, background: `${C.danger}12`, border: `1px solid ${C.danger}33`, borderRadius: 8, padding: "9px 12px", marginTop: 12 }}>⚠️ {error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <button type="submit" disabled={busy} style={primary(busy)}>{busy ? "Guardando…" : "Guardar y continuar"}</button>
          {onCancel
            ? <button type="button" onClick={onCancel} style={secondary()}>Cancelar</button>
            : <button type="button" onClick={onLogout} style={secondary()}>Cerrar sesión</button>}
        </div>
      </form>
    </div>
  );
}
