import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TOUR_EVENTS, onTourEvent } from '../tourBus';

const C = {
  bg: "#07080d", card: "#0f1119", card2: "#131620", border: "#1e2230", bord2: "#2a3040",
  text: "#e8eaf0", muted: "#8b93a7", dim: "#565e73", accent: "#f0a500", teal: "#00c9a7", danger: "#ff4055"
};

export const TAB_LABEL = {
  home: "Hoy", trips: "Viajes", stats: "Stats", ai: "IA", config: "Config",
};

// Cada paso señala un elemento real vía data-tour y puede pedir tres cosas:
//
//   waitFor        el paso no se da por hecho hasta que la app avisa que la
//                  acción se COMPLETÓ. Mientras espera, la pantalla entera
//                  queda usable y el tour NO salta solo: el conductor sigue
//                  cuando él quiere, para no perder lo que está escribiendo.
//   autoAdvance    excepción para los pasos de mera navegación (cambiar de
//                  pestaña, abrir o cerrar un modal): ahí seguir de inmediato
//                  es lo natural, no hay nada a medio llenar que perder.
//   nada de eso    paso informativo: se bloquea el toque sobre el elemento
//                  para no disparar acciones reales mientras se explica.
//
// `tab` dice en qué pestaña vive el paso. El tour nunca cambia de pestaña por
// el conductor: si anda en otra, lo regresa señalándole cuál tocar.
export const TOUR_STEPS = [
  {
    id: "bienvenida", tab: "home", badge: "BIENVENIDA", icon: "🚕",
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "Vamos a usarla juntos",
    description: "Te voy a llevar pantalla por pantalla y en cada una te voy a pedir que hagas algo tú mismo. No te voy a apurar: yo espero a que termines.",
    actionText: "EMPEZAR ▶",
  },

  // ─── CONFIG ───────────────────────────────────────────────────────────────
  {
    id: "ir-config", badge: "NAVEGACIÓN", icon: "🧭",
    title: "Abajo están tus 5 pestañas",
    subtitle: "Hoy · Viajes · Stats · IA · Config",
    description: "Hoy es tu jornada de hoy; Viajes tu historial; Stats tus números del periodo; IA tu copiloto que responde preguntas; Config tus datos. Empecemos por Config: sin tus números RutaFlow no puede calcular nada.",
    highlight: "nav-config",
    waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "config" },
    autoAdvance: true,
    actionHint: "Toca «Config» en la barra de abajo",
  },
  {
    id: "variables", tab: "config", badge: "TUS NÚMEROS", icon: "⛽",
    title: "Gasolina, rendimiento y meta",
    subtitle: "De aquí sale todo el cálculo",
    description: "Pon lo que pagas por litro, cuántos kilómetros te da un litro y cuánto quieres ganar por hora. Con esos tres datos RutaFlow sabe lo que te cuesta cada viaje y si una oferta conviene.",
    highlight: "variables",
    waitFor: TOUR_EVENTS.CONFIG_CHANGED,
    actionHint: "Ajusta alguno de los tres campos",
    doneHint: "Tómate tu tiempo. Cuando termines, dale SIGUIENTE",
  },
  {
    id: "comisiones", tab: "config", badge: "COMISIONES", icon: "📱",
    title: "Lo que te cobra cada app",
    subtitle: "Uber, DiDi, inDrive o particular",
    description: "Escribe el porcentaje que de verdad te descuentan. RutaFlow lo resta solo al evaluar cada oferta, así que si aquí pones de más o de menos, todos tus números salen mal.",
    highlight: "platforms",
    waitFor: TOUR_EVENTS.PLATFORM_CHANGED,
    actionHint: "Ajusta la comisión de alguna plataforma",
    doneHint: "Corrige las que quieras y luego dale SIGUIENTE",
  },
  {
    id: "plataformas-toggle", tab: "config", badge: "TUS APPS", icon: "🔘",
    title: "El círculo prende y apaga",
    subtitle: "Deja solo las que sí manejas",
    description: "Toca el círculo de la izquierda de cada plataforma: en verde está activa y aparece al registrar un viaje; apagada desaparece de las listas. No hace falta borrarla, basta con apagarla.",
    highlight: "platforms",
    waitFor: TOUR_EVENTS.PLATFORM_TOGGLED,
    actionHint: "Prende o apaga alguna con su círculo",
    doneHint: "Déjalas como las trabajas y dale SIGUIENTE",
  },
  {
    id: "guardar", tab: "config", badge: "GUARDAR", icon: "💾",
    title: "Nada se aplica hasta guardar",
    subtitle: "Baja hasta el botón",
    description: "Todo lo que cambiaste vive solo en la pantalla. Desliza hacia abajo y toca «Guardar cambios» para que RutaFlow empiece a usar tus números.",
    highlight: "config-save",
    waitFor: TOUR_EVENTS.CONFIG_SAVED,
    actionHint: "Toca «Guardar cambios»",
    doneHint: "¡Guardado! Ya puedes seguir",
  },

  // ─── IA ───────────────────────────────────────────────────────────────────
  {
    id: "ir-ia", badge: "NAVEGACIÓN", icon: "🧭",
    title: "Ahora tu copiloto",
    subtitle: "La pestaña IA",
    description: "La IA ya conoce tus viajes, tus horarios y tus zonas. Le puedes preguntar como a un compañero con años de volante.",
    highlight: "nav-ai",
    waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "ai" },
    autoAdvance: true,
    actionHint: "Toca «IA» en la barra de abajo",
  },
  {
    id: "ia-escribir", tab: "ai", badge: "PREGÚNTALE", icon: "🧠",
    title: "Escríbele tu pregunta",
    subtitle: "Te responde con tus datos reales",
    description: "Prueba con «¿a qué hora me conviene salir?» o «¿qué zona me deja más dinero?». Escribe y toca enviar.",
    highlight: "ai-chat",
    waitFor: TOUR_EVENTS.AI_MESSAGE_SENT,
    actionHint: "Escribe algo y envíalo",
    doneHint: "Lee la respuesta con calma y dale SIGUIENTE",
  },
  {
    id: "ia-microfono", tab: "ai", badge: "MICRÓFONO", icon: "🎤",
    title: "O háblale sin soltar el volante",
    subtitle: "Dictado en español",
    description: "Toca el micrófono y di tu pregunta: se escribe sola en el cuadro y tú la revisas antes de enviarla. Sirve cuando vas manejando.",
    highlight: "ai-mic",
    waitFor: TOUR_EVENTS.AI_VOICE_STARTED,
    actionHint: "Toca el micrófono y di algo",
    doneHint: "Eso es todo. Corrige el texto si hace falta",
    optional: true,
  },
  {
    id: "ia-escuchar", tab: "ai", badge: "ESCUCHAR", icon: "🔊",
    title: "Que te lea la respuesta",
    subtitle: "Para no despegar la vista",
    description: "Cada respuesta trae un botón ESCUCHAR que te la lee en voz alta. El mismo botón la detiene.",
    highlight: "ai-speak",
    waitFor: TOUR_EVENTS.AI_SPOKEN,
    actionHint: "Toca «ESCUCHAR» en la respuesta",
    doneHint: "Ya te está leyendo. Sigue cuando quieras",
    optional: true,
    missingHint: "Mándale una pregunta primero para que aparezca el botón",
  },

  // ─── STATS Y VIAJES ───────────────────────────────────────────────────────
  {
    id: "ir-stats", badge: "NAVEGACIÓN", icon: "🧭",
    title: "Vamos a tus números",
    subtitle: "La pestaña Stats",
    description: "Aquí ves cómo te fue en el periodo, no solo hoy: si de verdad estás llegando a tu meta por hora.",
    highlight: "nav-stats",
    waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "stats" },
    autoAdvance: true,
    actionHint: "Toca «Stats» en la barra de abajo",
  },
  {
    id: "stats", tab: "stats", badge: "ESTADÍSTICAS", icon: "📊",
    title: "De dónde sale tu dinero",
    subtitle: "Utilidad, propinas y $/hora",
    description: "Utilidad es lo que queda después de gasolina y comisión. Km productivos es qué tanto de lo que manejaste fue con pasajero. Y tu $/hora real se compara contra la meta que pusiste en Config.",
    highlight: "stats-cards",
  },
  {
    id: "ir-viajes", badge: "NAVEGACIÓN", icon: "🧭",
    title: "Tu historial completo",
    subtitle: "La pestaña Viajes",
    description: "Todo lo que registras queda ahí: viajes, gasolina, propinas, kilómetros sin pasaje y tus cierres de día.",
    highlight: "nav-trips",
    waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "trips" },
    autoAdvance: true,
    actionHint: "Toca «Viajes» en la barra de abajo",
  },
  {
    id: "viajes", tab: "trips", badge: "VIAJES", icon: "📋",
    title: "Cada viaje con su desglose",
    subtitle: "Toca uno para abrirlo",
    description: "Al abrir un viaje ves cuánto se llevó la comisión, cuánta gasolina te costó y qué te quedó limpio. Desde aquí también lo corriges o lo borras.",
    highlight: "trips-list",
  },

  // ─── JORNADA ──────────────────────────────────────────────────────────────
  {
    id: "ir-hoy", badge: "NAVEGACIÓN", icon: "🧭",
    title: "Volvemos a tu día",
    subtitle: "La pestaña Hoy",
    description: "Esta es la pantalla con la que vas a trabajar todos los días. Aquí arranca y termina tu jornada.",
    highlight: "nav-home",
    waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "home" },
    autoAdvance: true,
    actionHint: "Toca «Hoy» en la barra de abajo",
  },
  {
    id: "jornada", tab: "home", badge: "JORNADA", icon: "⏱️",
    title: "Arranca tu turno",
    subtitle: "El GPS mide tiempo y km",
    description: "Al iniciar la jornada, RutaFlow empieza a contar tus horas y tus kilómetros, incluidos los que haces sin pasajero. Al terminar te entrega el cierre del día.",
    highlight: "iniciar-jornada",
    waitFor: TOUR_EVENTS.SHIFT_STARTED,
    actionHint: "Toca «Iniciar jornada»",
    doneHint: "Turno abierto. Ya corre tu reloj",
  },
  {
    id: "abrir-viaje", tab: "home", badge: "NUEVO VIAJE", icon: "➕",
    title: "Registra un viaje",
    subtitle: "Ya con la jornada abierta",
    description: "Cada vez que termines un viaje lo capturas aquí. Ábrelo y te enseño las tres formas de hacerlo.",
    highlight: "nuevo-viaje",
    waitFor: TOUR_EVENTS.TRIP_MODAL_OPENED,
    autoAdvance: true,
    actionHint: "Toca «Nuevo viaje»",
    missingHint: "Primero inicia la jornada para que aparezca el botón",
  },
  {
    id: "viaje-manual", tab: "home", badge: "MODO MANUAL", icon: "✍️",
    title: "1 de 3: a mano",
    subtitle: "Lo más rápido si ya traes los datos",
    description: "En Manual escribes la tarifa y luego, en «Recolección» y «Destino», los kilómetros y minutos. RutaFlow te dice de inmediato si el viaje convino.",
    highlight: "trip-mode-manual",
    waitFor: { name: TOUR_EVENTS.TRIP_MODE_CHANGED, value: "manual" },
    actionHint: "Toca «✍️ Manual»",
    doneHint: "Llena la tarifa y los km si quieres probarlo",
  },
  {
    id: "viaje-tarifa", tab: "home", badge: "LA TARIFA", icon: "💰",
    title: "Escribe cuánto te pagaron",
    subtitle: "Pruébalo con un viaje real",
    description: "Pon la tarifa y los kilómetros: abajo aparece en verde, amarillo o rojo si el viaje valió la pena contra tu meta por hora.",
    highlight: "trip-fare",
    waitFor: TOUR_EVENTS.TRIP_FIELD_FILLED,
    actionHint: "Escribe una tarifa",
    doneHint: "Mira la evaluación de abajo y sigue cuando quieras",
    optional: true,
  },
  {
    id: "viaje-gps", tab: "home", badge: "MODO GPS", icon: "📍",
    title: "2 de 3: que el GPS lo mida",
    subtitle: "Sin escribir kilómetros",
    description: "Tocas «Iniciar GPS» al arrancar el viaje y «Finalizar GPS» al llegar: la app cuenta sola los km y los minutos. Solo te falta poner la tarifa.",
    highlight: "trip-mode-gps",
    waitFor: { name: TOUR_EVENTS.TRIP_MODE_CHANGED, value: "gps" },
    actionHint: "Toca «📍 GPS» para verlo",
    doneHint: "Así se ve. No hace falta que lo inicies ahora",
  },
  {
    id: "viaje-foto", tab: "home", badge: "MODO FOTO IA", icon: "📸",
    title: "3 de 3: con una captura",
    subtitle: "Lo más cómodo al terminar",
    description: "Toma una captura de pantalla del viaje en Uber o DiDi, súbela aquí y la IA saca sola la tarifa, los kilómetros y el tiempo. Si no quieres probarlo ahora, sáltalo.",
    highlight: "trip-mode-photo",
    waitFor: { name: TOUR_EVENTS.TRIP_MODE_CHANGED, value: "photo" },
    actionHint: "Toca «📸 Foto IA»",
    doneHint: "Ahí subes la captura cuando la tengas",
    optional: true,
  },
  {
    id: "viaje-cerrar", tab: "home", badge: "CERRAR", icon: "✅",
    title: "Guárdalo o ciérralo",
    subtitle: "Como tú prefieras",
    description: "Si llenaste una tarifa real, dale «Guardar viaje». Si nada más estabas probando, cierra con la ✕ y no se guarda nada.",
    highlight: "trip-close",
    waitFor: [TOUR_EVENTS.TRIP_SAVED, TOUR_EVENTS.TRIP_MODAL_CLOSED],
    autoAdvance: true,
    actionHint: "Guarda el viaje o cierra con la ✕",
  },

  // ─── REGISTRO RÁPIDO ──────────────────────────────────────────────────────
  {
    id: "abrir-rapido", tab: "home", badge: "REGISTRO RÁPIDO", icon: "⛽",
    title: "Lo que no es un viaje",
    subtitle: "Gasolina, propinas, km sin pasaje",
    description: "Cargar gasolina, una propina en efectivo o los kilómetros que hiciste vacío también cambian tu ganancia real. Ábrelo y te enseño.",
    highlight: "registro-rapido",
    waitFor: TOUR_EVENTS.QUICK_OPENED,
    autoAdvance: true,
    actionHint: "Toca «Registro rápido»",
  },
  {
    id: "rapido-dictar", tab: "home", badge: "DICTAR", icon: "🎙️",
    title: "Díctalo y la IA lo acomoda",
    subtitle: "Sin llenar formularios",
    description: "Escribe o dicta algo como «cargué 10 litros por 243 pesos» y toca IA: te prellena el registro. Tú lo revisas antes de guardarlo.",
    highlight: "quick-text",
  },
  {
    id: "rapido-tipos", tab: "home", badge: "TIPOS", icon: "🗂️",
    title: "O elige el tipo a mano",
    subtitle: "Sin pasaje, gasolina, tanque, propina, bono",
    description: "«Sin pasaje» son los kilómetros que manejaste vacío. «Tanque» sirve para corregir cuánta gasolina traes de verdad. Cada tipo te pide solo lo que necesita.",
    highlight: "quick-types",
    waitFor: TOUR_EVENTS.QUICK_TYPE_CHANGED,
    actionHint: "Toca alguno de los tipos",
    doneHint: "Mira los campos que te pide y sigue",
  },
  {
    id: "rapido-cerrar", tab: "home", badge: "CERRAR", icon: "✅",
    title: "Guárdalo o ciérralo",
    subtitle: "Igual que en el viaje",
    description: "Si lo que escribiste es real, guárdalo. Si solo estabas viendo, cierra la ventana.",
    highlight: "quick-close",
    waitFor: TOUR_EVENTS.QUICK_CLOSED,
    autoAdvance: true,
    actionHint: "Cierra el registro rápido",
  },

  // ─── CIERRE ───────────────────────────────────────────────────────────────
  {
    id: "copiloto", tab: "home", badge: "COPILOTO", icon: "🟢",
    title: "El semáforo de ofertas",
    subtitle: "Encima de Uber y DiDi",
    description: "Activado, lee la oferta que te aparece en pantalla y te dice en verde o en rojo si conviene, sin que tengas que salir de la app del volante.",
    highlight: "copilot-card",
  },
  {
    id: "final", tab: "home", badge: "LISTO", icon: "🏁",
    title: "Tu ganancia real",
    subtitle: "Ya sin gasolina ni comisión",
    description: "Este número es lo que de verdad te queda en la bolsa. Eso es todo: ya puedes salir a rodar. Puedes volver a ver esta guía cuando quieras desde Config.",
    actionText: "¡ENTENDIDO! 🏁",
    highlight: "kpi-panel",
  },
];

const GUTTER = 12;
const HOLE_PAD = 8;

// Algunas anclas se repiten en pantalla (hay un botón ESCUCHAR por cada
// respuesta de la IA). La última es la que el conductor tiene enfrente.
function findTourTarget(highlight) {
  if (!highlight || typeof document === "undefined") return null;
  const all = document.querySelectorAll(`[data-tour="${highlight}"]`);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Los avisos que dan por cumplido un paso, normalizados a {name, value}.
 * Un paso puede aceptar varios (guardar el viaje O cerrar el modal).
 */
export function stepWaits(step) {
  if (!step || !step.waitFor) return [];
  const list = Array.isArray(step.waitFor) ? step.waitFor : [step.waitFor];
  return list.map(w => (typeof w === "string" ? { name: w } : { name: w.name, value: w.value }));
}

/** Un aviso cumple el paso si coincide el nombre y, si lo pide, el valor. */
export function matchesWait(step, name, value) {
  return stepWaits(step).some(w => w.name === name && (w.value === undefined || w.value === value));
}

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
    // Se deja pintar la pantalla antes de centrar el objetivo.
    const settle = setTimeout(() => {
      const el = findTourTarget(highlight);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    // Seguir el rect en vivo cubre el scroll suave, el teclado y los reflows.
    const loop = () => { measure(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { clearTimeout(settle); cancelAnimationFrame(raf); };
  }, [measure, highlight, stepIdx, isOpen]);

  return rect;
}

export function OnboardingWizard({ isOpen, onComplete, onDismissNever, currentTab }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const step = TOUR_STEPS[stepIdx] || TOUR_STEPS[0];
  const isLast = stepIdx === TOUR_STEPS.length - 1;

  // El tour ya no mueve la pestaña por su cuenta. Si el conductor anda en otra,
  // se le señala cómo volver en vez de arrancarle la pantalla de enfrente.
  const offTab = Boolean(step.tab && currentTab && currentTab !== step.tab);
  const highlight = offTab ? `nav-${step.tab}` : step.highlight;
  const rect = useTargetRect(highlight, stepIdx, isOpen);
  const advanceRef = useRef(null);

  // Un paso de navegación no debe avanzar dos veces con el mismo aviso, pero
  // si el conductor regresa con ◀ tiene que poder volver a cumplirlo.
  const firedAtRef = useRef(-1);

  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= TOUR_STEPS.length) return;
    firedAtRef.current = -1;
    setDone(false);
    setStepIdx(idx);
  }, []);

  const handleNext = useCallback(() => {
    if (isLast) onComplete();
    else goTo(stepIdx + 1);
  }, [isLast, onComplete, goTo, stepIdx]);

  advanceRef.current = handleNext;

  const waits = stepWaits(step);
  // Esperando la acción real. Cuando llega, el paso queda "hecho" pero NO salta
  // solo: el conductor puede seguir escribiendo o mirando el resultado.
  const waiting = waits.length > 0 && !done && !offTab;
  // Un paso que pide algo no puede estorbar la pantalla donde se hace.
  const clickThrough = waits.length > 0 || offTab;

  useEffect(() => {
    if (!isOpen || offTab || !stepWaits(step).length) return undefined;
    return onTourEvent((name, value) => {
      if (!matchesWait(step, name, value)) return;
      if (step.autoAdvance) {
        if (firedAtRef.current === stepIdx) return;
        firedAtRef.current = stepIdx;
        setTimeout(() => advanceRef.current?.(), 420);
      } else {
        setDone(true);
      }
    });
  }, [isOpen, offTab, stepIdx, step]);

  if (!isOpen) return null;

  const vh = window.innerHeight;
  // El globo va del lado con más espacio, nunca encima del objetivo.
  const { hole, placeBelow } = computeTourPlacement(rect, vh);
  const dim = clickThrough ? "rgba(5, 7, 13, 0.45)" : "rgba(5, 7, 13, 0.82)";
  const ring = done ? C.teal : C.accent;

  const blocker = (s) => (
    <div style={{
      position: "fixed", background: dim, zIndex: 10005,
      pointerEvents: clickThrough ? "none" : "auto", ...s,
    }} />
  );

  // Qué se muestra: el paso, o el desvío para regresarlo a su pestaña.
  const tabName = TAB_LABEL[step.tab] || step.tab;
  const view = offTab ? {
    badge: "REGRESA", icon: "🧭",
    title: `Vuelve a «${tabName}»`,
    subtitle: "Ahí seguimos",
    description: "El siguiente paso de la guía está en esa pestaña.",
    actionHint: `Toca «${tabName}» en la barra de abajo`,
  } : step;

  const hint = waiting || offTab
    ? view.actionHint
    : (done ? (step.doneHint || "Listo. Sigue cuando quieras") : null);
  const primaryLabel = (waiting || offTab)
    ? (step.optional ? "SALTAR ESTE PASO" : "SEGUIR SIN HACERLO")
    : (step.actionText || "SIGUIENTE ▶");

  return (
    <>
      {hole ? (
        <>
          {/* Cuatro paneles alrededor del objetivo: oscurecen siempre, pero solo
              bloquean el toque cuando el paso es informativo. */}
          {blocker({ top: 0, left: 0, right: 0, height: Math.max(0, hole.top) })}
          {blocker({ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 })}
          {blocker({ top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height })}
          {blocker({ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height })}
          {/* Aro señalador */}
          <div style={{
            position: "fixed", top: hole.top, left: hole.left, width: hole.width, height: hole.height,
            border: `2px solid ${ring}`, borderRadius: 14, zIndex: 10006, pointerEvents: "none",
            boxShadow: `0 0 0 3px ${ring}33, 0 0 22px ${ring}55`,
          }} />
          {/* Los pasos informativos no deben disparar acciones reales por un toque. */}
          {!clickThrough && (
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
              ? { top: Math.min(hole.top + hole.height + 14, vh - 210) }
              : { bottom: Math.max(vh - hole.top + 14, 90) })
          : { bottom: "calc(74px + env(safe-area-inset-bottom))" }),
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}>
        <div style={{
          width: "100%", maxWidth: 420, background: C.card, border: `2px solid ${ring}`,
          borderRadius: 16, padding: "13px 14px 12px", pointerEvents: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.9)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 9 }}>
            <span style={{
              background: `${C.accent}22`, color: C.accent, fontSize: 9, fontWeight: 800,
              padding: "3px 7px", borderRadius: 5, border: `1px solid ${C.accent}55`, letterSpacing: "0.08em",
            }}>
              {stepIdx + 1}/{TOUR_STEPS.length} · {view.badge}
            </span>
            <button onClick={onComplete} style={{
              background: "transparent", border: "none", color: C.muted,
              fontSize: 10, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0,
            }}>
              Saltar ✕
            </button>
          </div>

          {/* Una sola barra: con tantos pasos, los guiones ya no se leían. */}
          <div style={{ height: 3, borderRadius: 2, background: C.border, marginBottom: 11, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${((stepIdx + 1) / TOUR_STEPS.length) * 100}%`,
              background: C.accent, transition: "width .25s",
            }} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 9 }}>
            <div style={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>{view.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div className="B" style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>
                {view.title}
              </div>
              <div style={{ fontSize: 11, color: C.teal, marginTop: 2 }}>{view.subtitle}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 11 }}>
            {view.description}
          </div>

          {!offTab && !rect && step.missingHint && (
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 10, lineHeight: 1.4 }}>
              ℹ️ {step.missingHint}
            </div>
          )}

          {hint && (
            <div className={done ? undefined : "pu"} style={{
              fontSize: 11, fontWeight: 800, color: done ? C.teal : C.accent, marginBottom: 10,
              display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.35,
            }}>
              <span>{done ? "✅" : "👆"}</span><span>{hint}</span>
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
              background: (waiting || offTab) ? "transparent" : C.teal,
              border: `1px solid ${(waiting || offTab) ? C.bord2 : C.teal}`,
              borderRadius: 9, color: (waiting || offTab) ? C.muted : "#04231d",
              fontSize: (waiting || offTab) ? 10 : 12, fontWeight: 800,
              letterSpacing: "0.08em", cursor: "pointer",
            }}>
              {primaryLabel}
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
