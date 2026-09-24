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
    badge: "PASO 1 / 10",
    icon: "🚕",
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "Tu copiloto financiero y operativo",
    description: "RutaFlow calcula tu ganancia real descontando gasolina, comisiones y desgaste. Vamos a hacer un recorrido guiado juntos para aprender a dominar cada función.",
    actionText: "EMPEZAR TOUR INTERACTIVO ▶",
    highlight: null
  },
  // 2. Configuración: Variables base
  {
    targetTab: "config",
    badge: "PASO 2 / 10 · CONFIGURACIÓN",
    icon: "⚙️",
    title: "1. Ajusta tu Gasolina y Meta",
    subtitle: "¿Cuánto gastas y cuánto quieres ganar?",
    description: "• Gasolina ($/L): Ajusta al costo actual en tu zona.\n• Rendimiento (km/L): Cuántos km rinde tu coche por litro.\n• Meta ($/hr): Tu aspiración neta por hora.\n¡Al guardar estos datos, el semáforo calculará tu ganancia neta en tiempo real!",
    actionText: "CONTINUAR A PLATAFORMAS ▶",
    highlight: "variables"
  },
  // 3. Configuración: Plataformas
  {
    targetTab: "config",
    badge: "PASO 3 / 10 · PLATAFORMAS",
    icon: "📱",
    title: "2. Comisiones de tus Apps",
    subtitle: "Uber, DiDi, inDrive o Particulares",
    description: "Revisa la comisión de cada app (Uber ~25%, DiDi ~12%, inDrive ~10%). Puedes agregar servicios propios o ajustar las comisiones exactas para que el cálculo no falle.",
    actionText: "PROBAR ASISTENTE DE IA ▶",
    highlight: "platforms"
  },
  // 4. Asistente IA
  {
    targetTab: "ai",
    badge: "PASO 4 / 10 · ASISTENTE DE IA",
    icon: "🧠",
    title: "3. Tu Asesor Inteligente",
    subtitle: "Preguntas por voz o texto",
    description: "Inicia conversaciones o presiona los botones rápidos como «¿A qué hora me conviene salir?» o «¿Qué zona deja más dinero?». La IA analiza tus datos y te da recomendaciones clave.",
    actionText: "IR A ESTADÍSTICAS ▶",
    highlight: "ai-chat"
  },
  // 5. Stats
  {
    targetTab: "stats",
    badge: "PASO 5 / 10 · ESTADÍSTICAS",
    icon: "📊",
    title: "4. Métricas y Rendimiento",
    subtitle: "Visualiza de dónde vienen tus ganancias",
    description: "Aquí verás la comparativa por plataforma, tus mejores horas para trabajar, gráficos de $/hora contra tu meta y la eficiencia de tus kilómetros recorridos.",
    actionText: "VER HISTORIAL DE VIAJES ▶",
    highlight: "stats-cards"
  },
  // 6. Historial de viajes
  {
    targetTab: "trips",
    badge: "PASO 6 / 10 · HISTORIAL",
    icon: "📋",
    title: "5. Viajes y Cierres de Jornada",
    subtitle: "Transparencia total de movimientos",
    description: "Revisa cada viaje aceptado y tus cierres diarios. Puedes tocar cualquier elemento para ver el desglose exacto de comisión, costo de gas y ganancia limpia.",
    actionText: "PROBAR REGISTROS EN HOY ▶",
    highlight: "trips-list"
  },
  // 7. Tipos de Registro de Viaje
  {
    targetTab: "home",
    badge: "PASO 7 / 10 · HOY",
    icon: "➕",
    title: "6. Modos de Registrar Viaje",
    subtitle: "Manual, GPS o Foto con IA",
    description: "Al tocar «+ NUEVO VIAJE» puedes:\n1. Manual: Llenar kilómetros y tarifa a mano.\n2. GPS: Iniciar taxímetro inteligente que mide tiempo y km reales.\n3. Foto IA: Subir captura de pantalla de la app de viajes.",
    actionText: "VER REGISTRO RÁPIDO Y VOZ ▶",
    highlight: "nuevo-viaje"
  },
  // 8. Botón Registro Rápido (Amarillo)
  {
    targetTab: "home",
    badge: "PASO 8 / 10 · REGISTRO RÁPIDO",
    icon: "🎤",
    title: "7. Gastos, Gasolina y Km Muertos",
    subtitle: "El botón de Registro Rápido",
    description: "Toca el botón con micrófono para dictar o seleccionar:\n• Cargas de gasolina (ej. «Cargué 15 litros por 360 pesos»).\n• Kilómetros muertos (sin pasajero).\n• Propinas u otros gastos de tu turno.",
    actionText: "VER ESTADO DE JORNADA ▶",
    highlight: "registro-rapido"
  },
  // 9. Iniciar Jornada GPS
  {
    targetTab: "home",
    badge: "PASO 9 / 10 · JORNADA GPS",
    icon: "⏱️",
    title: "8. Medición de Turno en Vivo",
    subtitle: "Iniciar y Cerrar Jornada",
    description: "Al presionar «INICIAR JORNADA», el GPS comenzará a medir el tiempo transcurrido y los kilómetros sin pasaje. Al finalizar tu turno, presiona «TERMINAR Y VER CIERRE» para guardar el resumen diario.",
    actionText: "VER PANEL DE GANANCIAS ▶",
    highlight: "jornada-card"
  },
  // 10. Copiloto y Panel KPI
  {
    targetTab: "home",
    badge: "PASO 10 / 10 · COPILOTO Y PANEL",
    icon: "🟢",
    title: "9. Copiloto de Ofertas y Panel KPI",
    subtitle: "¡Todo listo para trabajar!",
    description: "En el panel superior verás tu Ganancia Neta del día, % de Km Productivos y el botón «ACTIVAR COPILOTO» para sobreponer el semáforo sobre Uber/DiDi.",
    actionText: "¡ENTENDIDO, FINALIZAR TOUR! 🏁",
    highlight: "kpi-panel"
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
      background: "rgba(5, 7, 13, 0.45)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      padding: "16px 14px calc(65px + env(safe-area-inset-bottom))",
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
