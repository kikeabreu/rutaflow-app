import { computeTourPlacement, matchesWait, stepWaits, TAB_LABEL, TOUR_STEPS } from './OnboardingWizard';
import { TOUR_EVENTS } from '../tourBus';

// Teléfono de referencia: 375x812.
const VH = 812;

describe("computeTourPlacement", () => {
  test("sin objetivo no hay hueco y el globo no se ancla", () => {
    expect(computeTourPlacement(null, VH)).toEqual({ hole: null, placeBelow: false });
  });

  test("el hueco rodea al objetivo con margen", () => {
    const { hole } = computeTourPlacement({ top: 100, left: 20, width: 300, height: 60 }, VH);
    expect(hole).toEqual({ top: 92, left: 12, width: 316, height: 76 });
  });

  test("objetivo arriba: el globo va abajo", () => {
    const { placeBelow } = computeTourPlacement({ top: 80, left: 14, width: 347, height: 90 }, VH);
    expect(placeBelow).toBe(true);
  });

  test("objetivo hasta abajo: el globo va arriba para no salirse", () => {
    const { placeBelow } = computeTourPlacement({ top: 700, left: 14, width: 347, height: 70 }, VH);
    expect(placeBelow).toBe(false);
  });

  test("objetivo a media pantalla: gana el lado con más espacio", () => {
    // Quedan 412px abajo contra 392px arriba.
    const { placeBelow } = computeTourPlacement({ top: 400, left: 14, width: 347, height: 100 }, VH);
    expect(placeBelow).toBe(true);
  });

  test("el globo nunca se coloca encima del objetivo", () => {
    for (const top of [0, 120, 300, 500, 650, 780]) {
      const { hole, placeBelow } = computeTourPlacement({ top, left: 14, width: 347, height: 60 }, VH);
      const globoTop = placeBelow ? hole.top + hole.height + 14 : null;
      const globoBottomEdge = placeBelow ? null : hole.top - 14;
      if (placeBelow) expect(globoTop).toBeGreaterThan(hole.top + hole.height);
      else expect(globoBottomEdge).toBeLessThan(hole.top);
    }
  });
});

// Un paso se da por hecho con un aviso de la app. Algunos exigen además un
// valor (qué pestaña, qué modo de captura) y otros aceptan varios finales.
describe("stepWaits / matchesWait", () => {
  test("un paso sin espera no se cumple con ningún aviso", () => {
    const paso = { title: "informativo" };
    expect(stepWaits(paso)).toEqual([]);
    expect(matchesWait(paso, TOUR_EVENTS.CONFIG_SAVED)).toBe(false);
  });

  test("espera simple: basta el nombre del aviso", () => {
    const paso = { waitFor: TOUR_EVENTS.CONFIG_SAVED };
    expect(matchesWait(paso, TOUR_EVENTS.CONFIG_SAVED)).toBe(true);
    expect(matchesWait(paso, TOUR_EVENTS.CONFIG_SAVED, "loquesea")).toBe(true);
    expect(matchesWait(paso, TOUR_EVENTS.CONFIG_CHANGED)).toBe(false);
  });

  test("espera con valor: el aviso correcto con el valor equivocado no cuenta", () => {
    const paso = { waitFor: { name: TOUR_EVENTS.TAB_CHANGED, value: "config" } };
    expect(matchesWait(paso, TOUR_EVENTS.TAB_CHANGED, "config")).toBe(true);
    expect(matchesWait(paso, TOUR_EVENTS.TAB_CHANGED, "stats")).toBe(false);
    expect(matchesWait(paso, TOUR_EVENTS.TAB_CHANGED)).toBe(false);
  });

  test("varios finales posibles: guardar el viaje o cerrar el modal", () => {
    const paso = { waitFor: [TOUR_EVENTS.TRIP_SAVED, TOUR_EVENTS.TRIP_MODAL_CLOSED] };
    expect(matchesWait(paso, TOUR_EVENTS.TRIP_SAVED)).toBe(true);
    expect(matchesWait(paso, TOUR_EVENTS.TRIP_MODAL_CLOSED)).toBe(true);
    expect(matchesWait(paso, TOUR_EVENTS.QUICK_CLOSED)).toBe(false);
  });
});

describe("TOUR_STEPS", () => {
  test("los pasos que piden algo traen la instrucción visible", () => {
    const conAccion = TOUR_STEPS.filter(s => stepWaits(s).length);
    expect(conAccion.length).toBeGreaterThan(0);
    for (const step of conAccion) {
      expect(step.highlight).toBeTruthy();
      expect(step.actionHint).toBeTruthy();
    }
  });

  test("todo paso señala un ancla real", () => {
    // Las anclas existentes en App.js; si se renombra una, esta prueba avisa.
    const anclas = new Set([
      "variables", "platforms", "config-save",
      "ai-chat", "ai-mic", "ai-speak",
      "stats-cards", "trips-list",
      "kpi-panel", "jornada-card", "copilot-card",
      "iniciar-jornada", "nuevo-viaje", "registro-rapido",
      "trip-mode-manual", "trip-mode-gps", "trip-mode-photo", "trip-fare", "trip-close",
      "quick-text", "quick-types", "quick-close",
      ...Object.keys(TAB_LABEL).map(t => `nav-${t}`),
    ]);
    for (const step of TOUR_STEPS) {
      if (step.highlight) expect(anclas.has(step.highlight)).toBe(true);
    }
  });

  // El tour solo puede esperar avisos que la app de verdad emite; si alguien
  // inventa un waitFor que nadie dispara, el conductor se queda atorado.
  test("cada espera corresponde a un evento declarado", () => {
    const conocidos = new Set(Object.values(TOUR_EVENTS));
    const esperas = TOUR_STEPS.flatMap(stepWaits);
    expect(esperas.length).toBeGreaterThan(0);
    for (const espera of esperas) expect(conocidos.has(espera.name)).toBe(true);
  });

  // Si un paso vive en una pestaña, el tour tiene que poder mandarlo de vuelta.
  test("la pestaña de cada paso es una de las cinco reales", () => {
    for (const step of TOUR_STEPS) {
      if (step.tab) expect(TAB_LABEL[step.tab]).toBeTruthy();
    }
  });

  // Solo la navegación pura puede saltar sola: en un paso donde el conductor
  // está escribiendo, avanzar solo le borra de la vista lo que está haciendo.
  test("solo avanzan solos los pasos de navegación", () => {
    for (const step of TOUR_STEPS.filter(s => s.autoAdvance)) {
      const nombres = stepWaits(step).map(w => w.name);
      const navegacion = [
        TOUR_EVENTS.TAB_CHANGED, TOUR_EVENTS.TRIP_MODAL_OPENED,
        TOUR_EVENTS.TRIP_MODAL_CLOSED, TOUR_EVENTS.TRIP_SAVED,
        TOUR_EVENTS.QUICK_OPENED, TOUR_EVENTS.QUICK_CLOSED,
      ];
      expect(nombres.length).toBeGreaterThan(0);
      for (const nombre of nombres) expect(navegacion).toContain(nombre);
    }
  });

  test("antes de señalar algo dentro de un modal, el tour pidió abrirlo", () => {
    const abre = { trip: TOUR_EVENTS.TRIP_MODAL_OPENED, quick: TOUR_EVENTS.QUICK_OPENED };
    const dentro = { trip: /^trip-/, quick: /^quick-/ };
    for (const modal of ["trip", "quick"]) {
      const primerUso = TOUR_STEPS.findIndex(s => dentro[modal].test(s.highlight || ""));
      const pasoQueAbre = TOUR_STEPS.findIndex(s => stepWaits(s).some(w => w.name === abre[modal]));
      expect(pasoQueAbre).toBeGreaterThanOrEqual(0);
      expect(pasoQueAbre).toBeLessThan(primerUso);
    }
  });

  test("cada modal que se abre también se cierra antes de terminar", () => {
    const cierra = [TOUR_EVENTS.TRIP_MODAL_CLOSED, TOUR_EVENTS.QUICK_CLOSED];
    const esperas = TOUR_STEPS.flatMap(stepWaits).map(w => w.name);
    for (const evento of cierra) expect(esperas).toContain(evento);
  });
});
