import React, { useCallback, useEffect, useRef, useState } from 'react';

const C = {
  bg: "#07080d", card: "#0f1119", card2: "#131620", border: "#1e2230", bord2: "#2a3040",
  text: "#e8eaf0", muted: "#8b93a7", dim: "#565e73", accent: "#f0a500", teal: "#00c9a7", danger: "#ff4055"
};

// Cada paso apunta a un elemento real vía data-tour. `action: "click"` convierte
// el paso en una práctica: el conductor tiene que tocar el elemento para avanzar,
// y solo ese elemento queda tocable. Los pasos sin action son informativos y se
// bloquea el toque para no disparar acciones reales durante el tour.
export const TOUR_STEPS = [
  {
    targetTab: "home",
    badge: "BIENVENIDA",
    icon: "🚕",
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "Vamos a configurarla juntos",
    description: "Te voy a ir señalando cada parte. No tienes que memorizar nada: solo sigue el círculo amarillo.",
    actionText: "EMPEZAR ▶",
    highlight: null,
  },
  {
    targetTab: "config",
    badge: "CONFIGURACIÓN",
    icon: "⚙️",
    title: "Tu gasolina y tu meta",
    subtitle: "De aquí sale todo el cálculo",
    description: "Ajusta el precio del litro, cuánto rinde tu coche y cuánto quieres ganar por hora.",
    actionText: "SIGUIENTE ▶",
    highlight: "variables",
    action: "click",
    actionHint: "Tócalo para revisar tus números",
  },
  {
    targetTab: "config",
    badge: "PLATAFORMAS",
    icon: "📱",
    title: "Comisiones de tus apps",
    subtitle: "Uber, DiDi, inDrive o particular",
    description: "RutaFlow resta esta comisión sola al evaluar cada oferta. Ajústala si no coincide con la tuya.",
    actionText: "SIGUIENTE ▶",
    highlight: "platforms",
    action: "click",
    actionHint: "Tócalo para ver tus comisiones",
  },
  {
    targetTab: "ai",
    badge: "ASISTENTE IA",
    icon: "🧠",
    title: "Pregúntale lo que sea",
    subtitle: "Por voz o escrito",
    description: "«¿A qué hora me conviene salir?» o «¿qué zona deja más?». Conoce tus números reales.",
    actionText: "SIGUIENTE ▶",
    highlight: "ai-chat",
    action: "click",
    actionHint: "Toca el campo para escribirle",
  },
  {
    targetTab: "stats",
    badge: "ESTADÍSTICAS",
    icon: "📊",
    title: "De dónde sale tu dinero",
    subtitle: "Tus métricas del periodo",
    description: "Utilidad, propinas, km productivos y tu $/hora real contra la meta que pusiste.",
    actionText: "SIGUIENTE ▶",
    highlight: "stats-cards",
    action: "click",
    actionHint: "Tócalas para verlas de cerca",
  },
  {
    targetTab: "trips",
    badge: "VIAJES",
    icon: "📋",
    title: "Tu historial completo",
    subtitle: "Cada viaje, con su desglose",
    description: "Desde aquí agregas un viaje a mano. Al tocar cualquiera ves comisión, gas y ganancia limpia.",
    actionText: "SIGUIENTE ▶",
    highlight: "trips-list",
  },
  {
    targetTab: "home",
    badge: "HOY",
    icon: "⏱️",
    title: "Tu jornada",
    subtitle: "Aquí arranca el turno",
    description: "«Iniciar jornada» mide tiempo y km con GPS. Al terminar te da el cierre del día.",
    actionText: "SIGUIENTE ▶",
    highlight: "jornada-card",
  },
  {
    targetTab: "home",
    badge: "REGISTRO RÁPIDO",
    icon: "🎤",
    title: "Gastos y km muertos",
    subtitle: "Dicta o selecciona",
    description: "Cargas de gasolina, kilómetros sin pasaje y propinas. Puedes dictarlo mientras manejas.",
    actionText: "SIGUIENTE ▶",
    highlight: "registro-rapido",
  },
  {
    targetTab: "home",
    badge: "COPILOTO",
    icon: "🟢",
    title: "El semáforo de ofertas",
    subtitle: "Encima de Uber y DiDi",
    description: "Activado, lee la oferta en pantalla y te dice en verde si conviene, sin que salgas de la app.",
    actionText: "SIGUIENTE ▶",
    highlight: "copilot-card",
  },
  {
    targetTab: "home",
    badge: "LISTO",
    icon: "🏁",
    title: "Tu ganancia real",
    subtitle: "Ya con gasolina y comisión descontadas",
    description: "Este número es lo que de verdad te queda. Eso es todo: ya puedes salir a rodar.",
    actionText: "¡ENTENDIDO! 🏁",
    highlight: "kpi-panel",
  },
];

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
    const el = document.querySelector(`[data-tour="${highlight}"]`);
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
      const el = highlight && document.querySelector(`[data-tour="${highlight}"]`);
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

  // Paso de práctica: tocar el elemento real avanza el tour.
  const waitingForTap = step.action === "click" && !!rect;
  useEffect(() => {
    if (!isOpen || !waitingForTap || !step.highlight) return undefined;
    const el = document.querySelector(`[data-tour="${step.highlight}"]`);
    if (!el) return undefined;
    const onTap = () => { setTimeout(() => advanceRef.current?.(), 220); };
    el.addEventListener("click", onTap, { once: true });
    return () => el.removeEventListener("click", onTap);
  }, [isOpen, waitingForTap, step.highlight, stepIdx]);

  if (!isOpen) return null;

  const vh = window.innerHeight;
  // El globo va del lado con más espacio, nunca encima del objetivo.
  const { hole, placeBelow } = computeTourPlacement(rect, vh);
  const dim = "rgba(5, 7, 13, 0.82)";

  const blocker = (s) => (
    <div style={{ position: "fixed", background: dim, zIndex: 10005, ...s }} />
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
          {!waitingForTap && (
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

          {waitingForTap && (
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
              background: waitingForTap ? "transparent" : C.teal,
              border: `1px solid ${waitingForTap ? C.bord2 : C.teal}`,
              borderRadius: 9, color: waitingForTap ? C.muted : "#04231d",
              fontSize: waitingForTap ? 10 : 12, fontWeight: 800,
              letterSpacing: "0.08em", cursor: "pointer",
            }}>
              {waitingForTap ? "SALTAR ESTE PASO" : step.actionText}
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
