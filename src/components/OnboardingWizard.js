import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TOUR_EVENTS, onTourEvent } from '../tourBus';

const C = {
  bg: "#07080d", card: "#0f1119", card2: "#131620", border: "#1e2230", bord2: "#2a3040",
  text: "#e8eaf0", muted: "#8b93a7", dim: "#565e73", accent: "#f0a500", teal: "#00c9a7", danger: "#ff4055"
};

// Cada paso apunta a un elemento real vía data-tour y puede pedir tres cosas:
//
//   waitFor           el paso no avanza hasta que la app avisa que la acción se
//                     COMPLETÓ (guardó, envió, empezó a dictar). Mientras espera,
//                     la pantalla entera queda usable: el conductor necesita
//                     escribir, bajar al botón y tocarlo de verdad.
//   action: "click"   basta tocar el elemento señalado; solo ese queda tocable.
//   ninguno de los dos  paso informativo: se bloquea el toque para no disparar
//                     acciones reales mientras se explica.
export const TOUR_STEPS = [
  {
    targetTab: "home", badge: "BIENVENIDA", icon: "🚕",
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "Vamos a usarla juntos",
    description: "No solo te voy a explicar: te voy a pedir que hagas cada cosa. Sigue el círculo amarillo.",
    actionText: "EMPEZAR ▶", highlight: null,
  },
  {
    targetTab: "config", badge: "TU GASOLINA", icon: "⚙️",
    title: "Ajusta tus números",
    subtitle: "De aquí sale todo el cálculo",
    description: "Cambia el precio del litro, el rendimiento de tu coche o tu meta por hora.",
    actionText: "SIGUIENTE ▶", highlight: "variables",
    waitFor: TOUR_EVENTS.CONFIG_CHANGED,
    actionHint: "Modifica alguno de los tres campos",
  },
  {
    targetTab: "config", badge: "COMISIONES", icon: "📱",
    title: "Las comisiones de tus apps",
    subtitle: "Uber, DiDi, inDrive o particular",
    description: "RutaFlow las resta sola al evaluar cada oferta. Pon la que de verdad te cobran.",
    actionText: "SIGUIENTE ▶", highlight: "platforms",
    waitFor: TOUR_EVENTS.PLATFORM_CHANGED,
    actionHint: "Ajusta la comisión de alguna plataforma",
  },
  {
    targetTab: "config", badge: "GUARDAR", icon: "💾",
    title: "Ahora guárdalo",
    subtitle: "Sin esto no se aplica nada",
    description: "Los cambios viven en pantalla hasta que los guardas. Baja y toca el botón.",
    actionText: "SIGUIENTE ▶", highlight: "config-save",
    waitFor: TOUR_EVENTS.CONFIG_SAVED,
    actionHint: "Toca «Guardar cambios»",
  },
  {
    targetTab: "ai", badge: "PREGÚNTALE", icon: "🧠",
    title: "Escríbele a la IA",
    subtitle: "Conoce tus números reales",
    description: "Prueba con «¿a qué hora me conviene salir?» o «¿qué zona deja más dinero?».",
    actionText: "SIGUIENTE ▶", highlight: "ai-chat",
    waitFor: TOUR_EVENTS.AI_MESSAGE_SENT,
    actionHint: "Escribe tu pregunta y envíala",
  },
  {
    targetTab: "ai", badge: "MICRÓFONO", icon: "🎤",
    title: "O háblale sin soltar el volante",
    subtitle: "Dictado en español",
    description: "El micrófono convierte tu voz en la pregunta. Útil cuando vas manejando.",
    actionText: "SIGUIENTE ▶", highlight: "ai-mic",
    waitFor: TOUR_EVENTS.AI_VOICE_STARTED,
    actionHint: "Toca el micrófono y di algo",
  },
  {
    targetTab: "ai", badge: "ESCUCHAR", icon: "🔊",
    title: "Que te lea la respuesta",
    subtitle: "Para no despegar la vista",
    description: "Cada respuesta trae un botón «ESCUCHAR» que te la lee en voz alta.",
    actionText: "SIGUIENTE ▶", highlight: "ai-speak",
    waitFor: TOUR_EVENTS.AI_SPOKEN,
    actionHint: "Toca «ESCUCHAR» en la respuesta",
  },
  {
    targetTab: "stats", badge: "ESTADÍSTICAS", icon: "📊",
    title: "De dónde sale tu dinero",
    subtitle: "Tus métricas del periodo",
    description: "Utilidad, propinas, km productivos y tu $/hora real contra la meta que pusiste.",
    actionText: "SIGUIENTE ▶", highlight: "stats-cards",
    action: "click", actionHint: "Tócalas para verlas de cerca",
  },
  {
    targetTab: "trips", badge: "VIAJES", icon: "📋",
    title: "Tu historial completo",
    subtitle: "Cada viaje con su desglose",
    description: "Desde aquí agregas un viaje a mano. Al tocar cualquiera ves comisión, gas y ganancia limpia.",
    actionText: "SIGUIENTE ▶", highlight: "trips-list",
    action: "click", actionHint: "Tócalo para ver el alta de viaje",
  },
  {
    targetTab: "home", badge: "JORNADA", icon: "⏱️",
    title: "Arranca tu turno",
    subtitle: "El GPS mide tiempo y km",
    description: "Al iniciar, RutaFlow cuenta tus horas y kilómetros. Al terminar te da el cierre del día.",
    actionText: "SIGUIENTE ▶", highlight: "jornada-card",
    waitFor: TOUR_EVENTS.SHIFT_STARTED,
    actionHint: "Toca «Iniciar jornada»",
  },
  {
    targetTab: "home", badge: "REGISTRO RÁPIDO", icon: "⛽",
    title: "Gastos y km muertos",
    subtitle: "Gasolina, propinas, sin pasaje",
    description: "Aquí registras lo que no es un viaje. También puedes dictarlo por voz.",
    actionText: "SIGUIENTE ▶", highlight: "registro-rapido",
    waitFor: TOUR_EVENTS.QUICK_OPENED,
    actionHint: "Ábrelo para ver los tipos de registro",
  },
  {
    targetTab: "home", badge: "COPILOTO", icon: "🟢",
    title: "El semáforo de ofertas",
    subtitle: "Encima de Uber y DiDi",
    description: "Activado, lee la oferta en pantalla y te dice en verde si conviene, sin salir de la app.",
    actionText: "SIGUIENTE ▶", highlight: "copilot-card",
  },
  {
    targetTab: "home", badge: "LISTO", icon: "🏁",
    title: "Tu ganancia real",
    subtitle: "Ya sin gasolina ni comisión",
    description: "Este número es lo que de verdad te queda. Eso es todo: ya puedes salir a rodar.",
    actionText: "¡ENTENDIDO! 🏁", highlight: "kpi-panel",
  },
];

// Algunas anclas se repiten en pantalla (hay un botón ESCUCHAR por cada
// respuesta de la IA). La última es la que el conductor tiene enfrente.
function findTourTarget(highlight) {
  if (!highlight || typeof document === "undefined") return null;
  const all = document.querySelectorAll(`[data-tour="${highlight}"]`);
  return all.length ? all[all.length - 1] : null;
}

const GUTTER = 12;
const HOLE_PAD = 8;

/**
 * Geometría del spotlight, aislada para poder probarla sin navegador.
 * Devuelve el hueco alrededor del objetivo y de qué lado cabe el globo.
 */
export function computeTourPlacement(rect, viewportHeight, pad = HOLE_PAD) {
  if (!rect) return { hole: null, placeBelow: false };
  const hole = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const spaceBelow = viewportHeight - (hole.top + hole.height);
  // Abajo si cabe cómodo, o si de plano hay más espacio abajo que arriba.
  const placeBelow = spaceBelow > 260 || spaceBelow > hole.top;
  return { hole, placeBelow };
}

function useTargetRect(highlight, stepIdx, isOpen) {
  const [rect, setRect] = useState(null);

  const measure = useCallback(() => {
    if (!highlight) { setRect(null); return; }
    const el = findTourTarget(highlight);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    // Un elemento de tamaño cero está montado pero aún no pintado.
    if (r.width === 0 && r.height === 0) { setRect(null); return; }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [highlight]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let raf;
    // La pestaña acaba de cambiar: se deja pintar antes de centrar el objetivo.
    const settle = setTimeout(() => {
      const el = findTourTarget(highlight);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
    // Seguir el rect en vivo cubre el scroll suave, el teclado y los reflows.
    const loop = () => { measure(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { clearTimeout(settle); cancelAnimationFrame(raf); };
  }, [measure, highlight, stepIdx, isOpen]);

  return rect;
}

export function OnboardingWizard({ isOpen, onComplete, onDismissNever, setTab }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];
  const isLast = stepIdx === TOUR_STEPS.length - 1;
  const rect = useTargetRect(step.highlight, stepIdx, isOpen);
  const advanceRef = useRef(null);

  useEffect(() => {
    if (isOpen && step.targetTab && setTab) setTab(step.targetTab);
  }, [isOpen, stepIdx, step.targetTab, setTab]);

  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= TOUR_STEPS.length) return;
    setStepIdx(idx);
    if (setTab && TOUR_STEPS[idx]?.targetTab) setTab(TOUR_STEPS[idx].targetTab);
  }, [setTab]);

  const handleNext = useCallback(() => {
    if (isLast) { if (setTab) setTab("home"); onComplete(); }
    else goTo(stepIdx + 1);
  }, [isLast, setTab, onComplete, goTo, stepIdx]);

  advanceRef.current = handleNext;

  // Paso que exige una acción terminada: la app avisa por el bus del tour.
  const waitingForEvent = !!step.waitFor;
  // Paso de práctica simple: basta tocar el elemento señalado.
  const waitingForTap = step.action === "click" && !!rect;
  const waiting = waitingForEvent || waitingForTap;

  // Un mismo paso no debe avanzar dos veces si el evento se repite.
  const firedAtRef = useRef(-1);
  useEffect(() => {
    if (!isOpen || !step.waitFor) return undefined;
    return onTourEvent((name) => {
      if (name !== step.waitFor) return;
      if (firedAtRef.current === stepIdx) return;
      firedAtRef.current = stepIdx;
      // Se le deja ver el resultado de lo que acaba de hacer antes de seguir.
      setTimeout(() => advanceRef.current?.(), 900);
    });
  }, [isOpen, step.waitFor, stepIdx]);

  useEffect(() => {
    if (!isOpen || !waitingForTap || !step.highlight) return undefined;
    const el = findTourTarget(step.highlight);
    if (!el) return undefined;
    const onTap = () => { setTimeout(() => advanceRef.current?.(), 220); };
    el.addEventListener("click", onTap, { once: true });
    return () => el.removeEventListener("click", onTap);
  }, [isOpen, waitingForTap, step.highlight, stepIdx]);

  if (!isOpen) return null;

  const vh = window.innerHeight;
  // El globo va del lado con más espacio, nunca encima del objetivo.
  const { hole, placeBelow } = computeTourPlacement(rect, vh);
  // Mientras se espera una acción de verdad el conductor tiene que poder
  // escribir, hacer scroll y tocar botones que quedan fuera del hueco: el velo
  // se aclara y deja pasar el toque. En los demás pasos sí bloquea.
  const dim = waitingForEvent ? "rgba(5, 7, 13, 0.45)" : "rgba(5, 7, 13, 0.82)";
  const clickThrough = waitingForEvent;

  const blocker = (s) => (
    <div style={{
      position: "fixed", background: dim, zIndex: 10005,
      pointerEvents: clickThrough ? "none" : "auto", ...s,
    }} />
  );

  return (
    <>
      {hole ? (
        <>
          {/* Cuatro paneles alrededor del objetivo: oscurecen y bloquean, y
              dejan libre el hueco para que el conductor pueda tocarlo. */}
          {blocker({ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) })}
          {blocker({ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 })}
          {blocker({ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height })}
          {blocker({ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height })}
          {/* Aro señalador */}
          <div style={{
            position: "fixed", top: hole.top, left: hole.left, width: hole.width, height: hole.height,
            border: `2px solid ${C.accent}`, borderRadius: 14, zIndex: 10006, pointerEvents: "none",
            boxShadow: `0 0 0 3px ${C.accent}33, 0 0 22px ${C.accent}55`,
          }} />
          {/* Los pasos informativos no deben disparar acciones reales por un toque. */}
          {!waiting && (
            <div style={{
              position: "fixed", top: hole.top, left: hole.left, width: hole.width, height: hole.height,
              zIndex: 10006, background: "transparent",
            }} />
          )}
        </>
      ) : (
        blocker({ inset: 0 })
      )}

      <div style={{
        position: "fixed", zIndex: 10007, left: GUTTER, right: GUTTER,
        ...(hole
          ? (placeBelow
              ? { top: Math.min(hole.top + hole.height + 14, vh - 200) }
              : { bottom: Math.max(vh - hole.top + 14, 90) })
          : { bottom: "calc(74px + env(safe-area-inset-bottom))" }),
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          width: "100%", maxWidth: 420, background: C.card, border: `2px solid ${C.accent}`,
          borderRadius: 16, padding: "13px 14px 12px", pointerEvents: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.9)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span style={{
              background: `${C.accent}22`, color: C.accent, fontSize: 9, fontWeight: 800,
              padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.accent}55`, letterSpacing: "0.08em",
            }}>
              {stepIdx + 1}/{TOUR_STEPS.length} · {step.badge}
            </span>
            <button onClick={onComplete} style={{
              background: "transparent", border: "none", color: C.muted,
              fontSize: 10, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0,
            }}>
              Saltar ✕
            </button>
          </div>

          <div style={{ display: "flex", gap: 3, marginBottom: 11 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: i <= stepIdx ? C.accent : C.border, transition: "background .2s",
              }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
            <div style={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>{step.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div className="B" style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 11, color: C.teal, marginTop: 2 }}>{step.subtitle}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 11 }}>
            {step.description}
          </div>

          {waiting && (
            <div className="pu" style={{
              fontSize: 11, fontWeight: 800, color: C.accent, marginBottom: 10,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              👆 {step.actionHint}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {stepIdx > 0 && (
              <button onClick={() => goTo(stepIdx - 1)} style={{
                padding: "10px 12px", background: "transparent", border: `1px solid ${C.bord2}`,
                borderRadius: 9, color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
              }}>
                ◀
              </button>
            )}
            <button onClick={handleNext} style={{
              flex: 1, padding: "11px 12px",
              background: waiting ? "transparent" : C.teal,
              border: `1px solid ${waiting ? C.bord2 : C.teal}`,
              borderRadius: 9, color: waiting ? C.muted : "#04231d",
              fontSize: waiting ? 10 : 12, fontWeight: 800,
              letterSpacing: "0.08em", cursor: "pointer",
            }}>
              {waiting ? "SALTAR ESTE PASO" : step.actionText}
            </button>
          </div>

          {isLast && (
            <button onClick={onDismissNever} style={{
              width: "100%", marginTop: 9, background: "transparent", border: "none",
              color: C.dim, fontSize: 10, textDecoration: "underline", cursor: "pointer",
            }}>
              No volver a mostrar esta guía
            </button>
          )}
        </div>
      </div>
    </>
  );
}
