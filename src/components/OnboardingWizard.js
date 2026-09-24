import React, { useState } from 'react';

const C = {
  bg: "#07080d",
  card: "#0d0f1a",
  card2: "#111320",
  border: "#1a1d2e",
  bord2: "#242740",
  accent: "#f0a500",
  teal: "#00c9a7",
  muted: "#6b6e8a",
  text: "#dde0f5"
};

export const TOUR_STEPS = [
  // 1. Bienvenida
  {
    targetTab: "home",
    badge: "PASO 1 / 6",
    icon: "🚕",
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "Tu copiloto financiero y operativo",
    description: "RutaFlow calcula tu ganancia real descontando gasolina, comisiones y desgaste. Vamos a configurarla juntos en 1 minuto para que te dé números 100% exactos.",
    actionText: "COMENZAR GUÍA PASO A PASO ▶",
    highlight: null
  },
  // 2. Configuración: Variables base
  {
    targetTab: "config",
    badge: "PASO 2 / 6 · CONFIGURACIÓN",
    icon: "⚙️",
    title: "1. Ajusta tu Gasolina y Meta",
    subtitle: "¿Cuánto gastas y cuánto quieres ganar?",
    description: "Aquí defines: \n• Precio Gasolina: Pon lo que cuesta el litro en tu ciudad ($24 MXN prom).\n• Rendimiento: Cuántos km da tu carro por litro (ej. 12 km/L).\n• Meta por hora: Lo que aspiras ganar neto ($150-$200/hr).\n¡Esto calibra el semáforo de viajes!",
    actionText: "ENTENDIDO, SIGUIENTE ▶",
    highlight: "variables"
  },
  // 3. Configuración: Plataformas
  {
    targetTab: "config",
    badge: "PASO 3 / 6 · PLATAFORMAS",
    icon: "📱",
    title: "2. Comisiones de tus Apps",
    subtitle: "Uber, DiDi, inDrive o viajes particulares",
    description: "Revisa la comisión de cada plataforma (Uber ~25%, DiDi ~20%, etc.). RutaFlow restará esta comisión automáticamente al evaluar cada oferta.",
    actionText: "VER ASISTENTE DE IA ▶",
    highlight: "platforms"
  },
  // 4. Asistente IA
  {
    targetTab: "ai",
    badge: "PASO 4 / 6 · ASISTENTE IA",
    icon: "🧠",
    title: "3. Tu Asesor de Rutas y Horarios",
    subtitle: "Habla o escribe con la Inteligencia Artificial",
    description: "Pregúntale: «¿A qué hora me conviene salir?», «¿Qué zona me deja más dinero?» o «¿Me conviene este bono?». La IA conoce tus números, colonias y ganancias reales.",
    actionText: "VER HISTORIAL DE VIAJES ▶",
    highlight: "ai-chat"
  },
  // 5. Historial y Registros
  {
    targetTab: "trips",
    badge: "PASO 5 / 6 · VIAJES Y REGISTROS",
    icon: "📋",
    title: "4. Historial y Movimientos",
    subtitle: "Control de cada viaje, carga de gas y propinas",
    description: "Aquí verás el detalle de cada viaje aceptado. Puedes registrar cargas de combustible, gastos mecánicos o propinas con el botón «+» para tener cuentas claras.",
    actionText: "VER EL COPILOTO EN HOY ▶",
    highlight: "trips-list"
  },
  // 6. Pantalla Hoy y Copiloto
  {
    targetTab: "home",
    badge: "PASO 6 / 6 · COPILOTO ACTIVO",
    icon: "🟢",
    title: "5. Inicia tu Jornada y Copiloto",
    subtitle: "¡Todo listo para rodar en la calle!",
    description: "Al iniciar tu turno:\n1. Toca «INICIAR JORNADA» para medir tus km con GPS.\n2. Toca «ACTIVAR COPILOTO» para que analice ofertas en pantalla sobre DiDi o Uber y te pinte en verde los viajes rentables.",
    actionText: "¡LISTO, A GANAR DINERO! 🏁",
    highlight: "copilot-card"
  }
];

export function OnboardingWizard({ isOpen, onComplete, onDismissNever, setTab, currentTab }) {
  const [stepIdx, setStepIdx] = useState(0);

  const step = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  // Sincronizar la pestaña de la app con el objetivo del paso actual
  React.useEffect(() => {
    if (isOpen && step.targetTab && setTab) {
      setTab(step.targetTab);
    }
  }, [isOpen, stepIdx, step.targetTab, setTab]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (isLast) {
      if (setTab) setTab("home");
      onComplete();
    } else {
      const nextIdx = stepIdx + 1;
      setStepIdx(nextIdx);
      if (setTab && TOUR_STEPS[nextIdx]?.targetTab) {
        setTab(TOUR_STEPS[nextIdx].targetTab);
      }
    }
  };

  const handlePrev = () => {
    if (stepIdx > 0) {
      const prevIdx = stepIdx - 1;
      setStepIdx(prevIdx);
      if (setTab && TOUR_STEPS[prevIdx]?.targetTab) {
        setTab(TOUR_STEPS[prevIdx].targetTab);
      }
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 10005,
      background: "rgba(5, 7, 13, 0.78)",
      backdropFilter: "blur(3px)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      padding: "16px 14px calc(20px + env(safe-area-inset-bottom))",
      pointerEvents: "auto"
    }}>
      
      {/* Tarjeta Flotante Interactiva de la Guía */}
      <div style={{
        width: "100%",
        maxWidth: 440,
        margin: "0 auto",
        background: C.card,
        border: `2px solid ${C.accent}`,
        borderRadius: 20,
        padding: "20px 18px 16px",
        boxShadow: "0 16px 48px rgba(0,0,0,0.85), 0 0 25px rgba(240, 165, 0, 0.2)",
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}>

        {/* Encabezado con badge y saltar */}
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12}}>
          <span style={{
            background: `${C.accent}22`,
            color: C.accent,
            fontSize: 10,
            fontWeight: 800,
            padding: "4px 9px",
            borderRadius: 6,
            border: `1px solid ${C.accent}55`,
            letterSpacing: "0.08em"
          }}>
            {step.badge}
          </span>

          <button 
            onClick={onComplete}
            style={{
              background: "transparent",
              border: "none",
              color: C.muted,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              padding: "4px 8px"
            }}
          >
            Saltar tutorial ✕
          </button>
        </div>

        {/* Barra de progreso */}
        <div style={{display: "flex", gap: 5, marginBottom: 16}}>
          {TOUR_STEPS.map((_, i) => (
            <div 
              key={i} 
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= stepIdx ? C.accent : C.border,
                transition: "all .2s ease"
              }}
            />
          ))}
        </div>

        {/* Icono + Título */}
        <div style={{display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10}}>
          <div style={{
            fontSize: 32,
            background: C.card2,
            border: `1px solid ${C.bord2}`,
            borderRadius: 14,
            width: 52,
            height: 52,
            display: "grid",
            placeItems: "center",
            flexShrink: 0
          }}>
            {step.icon}
          </div>
          <div>
            <div style={{fontSize: 17, fontWeight: 900, color: C.text, lineHeight: 1.25}}>
              {step.title}
            </div>
            <div style={{fontSize: 12, fontWeight: 700, color: C.teal, marginTop: 3}}>
              {step.subtitle}
            </div>
          </div>
        </div>

        {/* Explicación paso a paso con bullets limpios */}
        <div style={{
          fontSize: 12,
          color: "#b0b4d4",
          lineHeight: 1.55,
          whiteSpace: "pre-line",
          background: C.card2,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "12px 14px",
          marginBottom: 16
        }}>
          {step.description}
        </div>

        {/* Botones de navegación del paso */}
        <div style={{display: "flex", gap: 8, alignItems: "center"}}>
          {stepIdx > 0 && (
            <button
              onClick={handlePrev}
              style={{
                padding: "13px 16px",
                background: C.card2,
                border: `1px solid ${C.bord2}`,
                borderRadius: 12,
                color: C.text,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer"
              }}
            >
              ◀ Atrás
            </button>
          )}

          <button
            onClick={handleNext}
            style={{
              flex: 1,
              padding: "13px 16px",
              background: C.teal,
              border: "none",
              borderRadius: 12,
              color: "#000",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              letterSpacing: "0.04em",
              boxShadow: "0 4px 14px rgba(0, 201, 167, 0.35)"
            }}
          >
            {step.actionText}
          </button>
        </div>

        {/* Opción de no volver a mostrar */}
        <div style={{textAlign: "center", marginTop: 12}}>
          <button 
            onClick={onDismissNever} 
            style={{
              background: "none",
              border: "none",
              color: C.muted,
              fontSize: 11,
              cursor: "pointer",
              textDecoration: "underline",
              padding: "4px"
            }}
          >
            No volver a mostrar esta guía en el futuro
          </button>
        </div>

      </div>
    </div>
  );
}
