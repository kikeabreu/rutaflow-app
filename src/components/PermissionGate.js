import React, { useCallback, useEffect, useState } from 'react';
import { copilot, isAndroidApp } from '../copilotClient';
import { nativeTracking } from '../nativeTrackingClient';
import { requestSpeechPermission, speechPermissionState } from '../speechClient';
import { C } from '../theme';

// Qué se le pide al conductor y por qué. El "por qué" no es relleno: si no
// entiende para qué sirve, niega el permiso y la app queda inservible sin que
// él sepa que fue por eso.
//
// `required` marca lo que no se puede dejar pasar. La superposición queda
// fuera a propósito: no se concede desde un diálogo sino en los ajustes del
// sistema, de donde el conductor puede salirse sin conceder nada. Bloquear ahí
// sería dejarlo encerrado sin poder ni abrir la app.
export const PERMISOS = [
  {
    id: "location", icon: "📍", titulo: "Ubicación",
    porque: "Es con lo que Ruleto cuenta tus kilómetros: los del viaje y los que haces vacío. Elige «Permitir todo el tiempo» y «Ubicación precisa», si no deja de medir en cuanto te pasas a Uber.",
    required: true,
  },
  {
    id: "notifications", icon: "🔔", titulo: "Notificaciones",
    porque: "Android exige una notificación visible para dejar que la app siga midiendo con la pantalla apagada. Sin ella tu jornada deja de contar kilómetros.",
    required: true,
  },
  {
    id: "microphone", icon: "🎤", titulo: "Micrófono",
    porque: "Para dictar viajes, gasolina y preguntas a la IA sin soltar el volante.",
    required: true,
  },
  {
    id: "overlay", icon: "🟢", titulo: "Mostrar sobre otras apps",
    porque: "Es el copiloto: el semáforo que evalúa la oferta encima de Uber o DiDi. Se activa en los ajustes del sistema.",
    required: false, enAjustes: true,
  },
];

/** Qué falta todavía y si ya se puede entrar. */
export function faltantes(estado) {
  return PERMISOS.filter(p => p.required && estado[p.id] !== "granted");
}
export function puedeEntrar(estado) {
  return faltantes(estado).length === 0;
}

/** Lee el estado real de los cuatro permisos sin pedir ninguno. */
export async function leerPermisos() {
  const estado = { location: "prompt", notifications: "prompt", microphone: "prompt", overlay: "prompt" };
  const [nativo, micro, copiloto] = await Promise.all([
    nativeTracking.checkPermissions().catch(() => null),
    speechPermissionState().catch(() => "prompt"),
    copilot.supported().catch(() => null),
  ]);
  if (nativo) {
    estado.location = nativo.location === "granted" ? "granted" : "prompt";
    estado.notifications = nativo.notifications === "granted" ? "granted" : "prompt";
  }
  estado.microphone = micro === "granted" ? "granted" : "prompt";
  estado.overlay = copiloto?.canDrawOverlays ? "granted" : "prompt";
  return estado;
}

export function PermissionGate({ onReady }) {
  const [estado, setEstado] = useState({ location: "prompt", notifications: "prompt", microphone: "prompt", overlay: "prompt" });
  const [bloqueados, setBloqueados] = useState({});
  const [pidiendo, setPidiendo] = useState(false);
  const [leido, setLeido] = useState(false);

  const revisar = useCallback(async () => {
    const nuevo = await leerPermisos();
    setEstado(nuevo);
    setLeido(anterior => anterior || "primera");
    // Un permiso que ya se concedió deja de estar bloqueado.
    setBloqueados(prev => {
      const limpio = { ...prev };
      for (const p of PERMISOS) if (nuevo[p.id] === "granted") delete limpio[p.id];
      return limpio;
    });
    return nuevo;
  }, []);

  useEffect(() => {
    revisar();
    // Los ajustes del sistema se conceden fuera de la app: al volver hay que
    // releer, si no el conductor concede y la pantalla sigue diciendo que no.
    const alVolver = () => { if (document.visibilityState === "visible") revisar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [revisar]);

  // Quien ya tiene todo lo necesario no debe ver esta pantalla ni un parpadeo.
  // Pero al que acaba de conceder no se le empuja adentro de golpe: se le deja
  // ver el copiloto, que se activa aparte, y entra cuando él toca el botón.
  useEffect(() => {
    if (leido === "primera" && puedeEntrar(estado)) onReady();
  }, [leido, estado, onReady]);

  const pedir = async () => {
    setLeido("interactuado");
    setPidiendo(true);
    try {
      const pendientes = PERMISOS.filter(p => estado[p.id] !== "granted");
      const alias = pendientes.filter(p => p.id === "location" || p.id === "notifications").map(p => p.id);
      if (alias.length) await nativeTracking.requestPermissions(alias).catch(() => {});
      if (estado.microphone !== "granted") await requestSpeechPermission().catch(() => {});
      const nuevo = await revisar();
      // Lo que sigue faltando después de preguntarlo es una negativa firme:
      // Android ya no vuelve a mostrar el diálogo y solo queda ir a ajustes.
      setBloqueados(prev => {
        const marca = { ...prev };
        for (const p of pendientes) if (!p.enAjustes && nuevo[p.id] !== "granted") marca[p.id] = true;
        return marca;
      });
    } finally {
      setPidiendo(false);
    }
  };

  const abrirAjustes = () => {
    import('capacitor-native-settings').then(({ NativeSettings, AndroidSettings, IOSSettings }) =>
      NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App })
    ).catch(() => {});
  };

  const pendientes = faltantes(estado);
  const hayBloqueados = pendientes.some(p => bloqueados[p.id]);

  // Leer los permisos es asíncrono. Pintar la pantalla antes de saber haría
  // que al que ya concedió todo le parpadee una advertencia que no le toca.
  if (!leido) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 20000, background: C.bg, overflowY: "auto",
      padding: "calc(28px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))",
    }}>
      <div style={{ maxWidth: 440, margin: "0 auto" }}>
        <div className="B" style={{ fontSize: 22, fontWeight: 900, color: C.accent, letterSpacing: 1.5 }}>RULETO DRIVE</div>
        <div className="B" style={{ fontSize: 19, fontWeight: 800, color: C.text, marginTop: 14, lineHeight: 1.25 }}>
          Antes de empezar, dale estos permisos
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 7, lineHeight: 1.5 }}>
          Ruleto mide tu jornada mientras manejas, con la app cerrada y la pantalla apagada.
          Para eso Android obliga a pedirte esto. Nada de esto sale de tu teléfono sin que tú lo guardes.
        </div>

        <div style={{ marginTop: 18 }}>
          {PERMISOS.map(p => {
            const ok = estado[p.id] === "granted";
            const trabado = bloqueados[p.id];
            return (
              <div key={p.id} style={{
                background: C.card, border: `1px solid ${ok ? C.teal + "55" : trabado ? C.danger + "55" : C.border}`,
                borderRadius: 12, padding: "13px 14px", marginBottom: 9,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                      {p.titulo}
                      {!p.required && <span style={{ fontSize: 9, color: C.dim, fontWeight: 600 }}>  · opcional</span>}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", padding: "3px 7px", borderRadius: 5,
                    color: ok ? C.teal : trabado ? C.danger : C.accent,
                    background: `${ok ? C.teal : trabado ? C.danger : C.accent}18`,
                  }}>
                    {ok ? "LISTO" : trabado ? "BLOQUEADO" : "PENDIENTE"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.45 }}>{p.porque}</div>
                {!ok && p.enAjustes && (
                  <button onClick={() => copilot.requestOverlayPermission().catch(() => {})} style={{
                    marginTop: 9, padding: "8px 12px", background: "transparent", border: `1px solid ${C.teal}`,
                    borderRadius: 8, color: C.teal, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer",
                  }}>
                    ACTIVAR EN AJUSTES
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {hayBloqueados && (
          <div style={{
            background: `${C.danger}10`, border: `1px solid ${C.danger}33`, borderRadius: 10,
            padding: "11px 13px", fontSize: 11, color: C.text, lineHeight: 1.5, marginBottom: 12,
          }}>
            Android ya no te va a volver a preguntar por lo que dice BLOQUEADO. Hay que concederlo
            a mano en los ajustes de la app y volver aquí.
            <button onClick={abrirAjustes} style={{
              display: "block", marginTop: 9, padding: "9px 12px", background: "transparent",
              border: `1px solid ${C.danger}`, borderRadius: 8, color: C.danger,
              fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer",
            }}>
              ABRIR AJUSTES DE LA APP
            </button>
          </div>
        )}

        <button onClick={pendientes.length ? pedir : onReady} disabled={pidiendo} style={{
          width: "100%", padding: "14px 12px", background: C.teal, border: `1px solid ${C.teal}`,
          borderRadius: 10, color: "#04231d", fontSize: 12, fontWeight: 900,
          letterSpacing: "0.1em", cursor: pidiendo ? "wait" : "pointer", opacity: pidiendo ? 0.6 : 1,
        }}>
          {pidiendo ? "PIDIENDO..." : pendientes.length ? "DAR PERMISOS" : "ENTRAR A RULETO ▶"}
        </button>

        <div style={{ fontSize: 10, color: C.dim, marginTop: 14, lineHeight: 1.5, textAlign: "center" }}>
          {pendientes.length
            ? "Sin ubicación, notificaciones y micrófono, Ruleto no puede medir tu jornada ni entenderte al dictar."
            : "El copiloto lo puedes activar después desde la pantalla de Hoy."}
        </div>
      </div>
    </div>
  );
}

/** Solo la app de Android pide permisos; el navegador los pide al usarlos. */
export const necesitaPuertaDePermisos = () => isAndroidApp();
