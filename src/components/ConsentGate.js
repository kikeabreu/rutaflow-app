import React, { useState } from "react";
import { C, ACCENT_FILL } from "../theme";
import { Logo } from "./Logo";
import { saveConsent } from "../consent";

const shell = { background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(20px + env(safe-area-inset-top)) 16px calc(20px + env(safe-area-inset-bottom))" };
const card = { width: "100%", maxWidth: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 18px" };
const primary = disabled => ({ width: "100%", padding: "13px", background: disabled ? C.card2 : ACCENT_FILL, color: disabled ? C.muted : "#000", border: "none", borderRadius: 11, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: disabled ? "default" : "pointer" });
const link = { color: C.teal, fontWeight: 700 };

function Check({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 12, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3, accentColor: C.accent, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}

// Casillas desmarcadas por defecto: el consentimiento debe ser una acción del usuario.
export function ConsentGate({ onDone, onLogout }) {
  const [terms, setTerms] = useState(false);
  const [financial, setFinancial] = useState(false);
  const [location, setLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = terms && financial && !busy;
  const submit = async () => {
    setBusy(true); setError("");
    try { onDone(await saveConsent({ location, source: "gate" })); }
    catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 14 }}><Logo size={22} iconSize={44} stacked tagline={false} /></div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: "center", marginBottom: 6 }}>Tu privacidad en Ruleto Drive</div>
        <div style={{ fontSize: 12, color: C.muted, textAlign: "center", lineHeight: 1.55, marginBottom: 16 }}>
          Antes de continuar, confirma cómo tratamos tus datos. Puedes cambiar la ubicación o eliminar tu cuenta cuando quieras desde Configuración.
        </div>
        <Check checked={terms} onChange={setTerms}>
          He leído y acepto los <a style={link} href="/terminos.html" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a> y el <a style={link} href="/privacidad.html" target="_blank" rel="noopener noreferrer">Aviso de Privacidad</a>. <strong>(Obligatorio)</strong>
        </Check>
        <Check checked={financial} onChange={setFinancial}>
          Consiento expresamente el tratamiento de mis <strong>datos financieros y operativos</strong> (viajes, tarifas, gastos y ganancias) para calcular mis resultados y generar respuestas de Ruleto IA, que se procesan con proveedores en México y el extranjero. <strong>(Obligatorio)</strong>
        </Check>
        <Check checked={location} onChange={setLocation}>
          Consiento el tratamiento de mi <strong>ubicación GPS</strong> durante las jornadas que yo inicie, para medir kilómetros y tiempos, y que se obtenga la zona con OpenStreetMap. <strong>(Opcional: sin esto el GPS no funcionará.)</strong>
        </Check>
        {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}
        <button disabled={!ready} onClick={submit} style={primary(!ready)}>{busy ? "Guardando…" : "Continuar"}</button>
        <button onClick={onLogout} style={{ width: "100%", marginTop: 10, padding: "10px", background: "transparent", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cerrar sesión</button>
      </div>
    </div>
  );
}

export function DeleteAccountModal({ onCancel, onConfirm }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ok = text.trim().toUpperCase() === "ELIMINAR" && !busy;
  const go = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 17000, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...card, maxWidth: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.danger, marginBottom: 8 }}>Eliminar mi cuenta y mis datos</div>
        <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 10 }}>
          Se borrarán tus viajes, jornadas, gastos, ubicaciones, conversaciones con la IA y tu perfil. <strong>No se puede deshacer.</strong> Si tienes una suscripción Pro, se cancelará de inmediato y no se reembolsa el periodo restante.
        </div>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>
          Por seguridad conservaremos únicamente el registro de que tu celular y número ya usaron la prueba gratuita (para evitar abusos) y los registros fiscales de pagos que exige la ley.
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Escribe <strong style={{ color: C.text }}>ELIMINAR</strong> para confirmar:</div>
        <input value={text} onChange={e => setText(e.target.value)} autoCapitalize="characters" autoComplete="off"
          style={{ width: "100%", background: C.well, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", marginBottom: 12 }} />
        {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}
        <button disabled={!ok} onClick={go} style={{ ...primary(!ok), background: ok ? C.danger : C.card2, color: ok ? "#fff" : C.muted }}>{busy ? "Eliminando…" : "Eliminar definitivamente"}</button>
        <button disabled={busy} onClick={onCancel} style={{ width: "100%", marginTop: 10, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 11, color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
      </div>
    </div>
  );
}
