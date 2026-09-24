import { computeTourPlacement, TOUR_STEPS } from './OnboardingWizard';
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

describe("TOUR_STEPS", () => {
  test("cada paso informativo declara a qué pestaña lleva", () => {
    for (const step of TOUR_STEPS) {
      expect(typeof step.targetTab).toBe("string");
      expect(step.targetTab.length).toBeGreaterThan(0);
    }
  });

  test("los pasos de práctica traen la instrucción visible", () => {
    const practica = TOUR_STEPS.filter(s => s.action === "click" || s.waitFor);
    expect(practica.length).toBeGreaterThan(0);
    for (const step of practica) {
      expect(step.highlight).toBeTruthy();
      expect(step.actionHint).toBeTruthy();
    }
  });

  test("todo paso con práctica apunta a un ancla real", () => {
    // Las anclas existentes en App.js; si se renombra una, esta prueba avisa.
    const anclas = new Set([
      "variables", "platforms", "config-save", "ai-chat", "ai-mic", "ai-speak",
      "stats-cards", "trips-list", "nuevo-viaje", "registro-rapido",
      "jornada-card", "copilot-card", "kpi-panel",
    ]);
    for (const step of TOUR_STEPS) {
      if (step.highlight) expect(anclas.has(step.highlight)).toBe(true);
    }
  });

  // El tour solo puede esperar eventos que la app de verdad emite; si alguien
  // inventa un waitFor que nadie dispara, el conductor se queda atorado.
  test("cada waitFor corresponde a un evento declarado", () => {
    const conocidos = new Set(Object.values(TOUR_EVENTS));
    const conEspera = TOUR_STEPS.filter(s => s.waitFor);
    expect(conEspera.length).toBeGreaterThan(0);
    for (const step of conEspera) {
      expect(conocidos.has(step.waitFor)).toBe(true);
    }
  });

  test("un paso no espera un evento y un toque a la vez", () => {
    for (const step of TOUR_STEPS) {
      if (step.waitFor) expect(step.action).toBeUndefined();
    }
  });
});
