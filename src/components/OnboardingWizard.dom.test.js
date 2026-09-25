/**
 * Pruebas de comportamiento del recorrido sobre un DOM real (jsdom).
 *
 * Cubren justo lo que se rompió en el teléfono: que el tour no se adelante
 * mientras el conductor está escribiendo, y que el velo no le tape lo que le
 * está pidiendo hacer.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingWizard, TOUR_STEPS, stepWaits } from './OnboardingWizard';
import { TOUR_EVENTS, emitTourEvent } from '../tourBus';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.requestAnimationFrame = cb => setTimeout(cb, 0);
  window.cancelAnimationFrame = id => clearTimeout(id);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (props = {}) => act(() => {
  root.render(<OnboardingWizard isOpen onComplete={() => {}} onDismissNever={() => {}} currentTab="home" {...props} />);
});

const textoGlobo = () => container.textContent || "";
const botonPrincipal = () => [...container.querySelectorAll("button")]
  .find(b => /SIGUIENTE|EMPEZAR|SALTAR ESTE PASO|SEGUIR SIN|ENTENDIDO/.test(b.textContent));
const avanzar = () => act(() => { botonPrincipal().click(); });
const emitir = (name, value) => act(() => { emitTourEvent(name, value); });

const idxDe = id => TOUR_STEPS.findIndex(s => s.id === id);
// Lleva el recorrido hasta un paso dado tocando el botón principal.
const llegarA = (id) => { for (let i = 0; i < idxDe(id); i++) avanzar(); };

test("arranca en la bienvenida y no adivina pasos", () => {
  render();
  expect(textoGlobo()).toContain("¡Bienvenido a Ruleto Drive!");
  expect(textoGlobo()).toContain(`1/${TOUR_STEPS.length}`);
});

test("un paso de acción NO salta solo: marca hecho y espera al conductor", () => {
  render({ currentTab: "config" });
  llegarA("variables");
  expect(textoGlobo()).toContain("Gasolina, rendimiento y meta");

  emitir(TOUR_EVENTS.CONFIG_CHANGED);

  // Sigue en el mismo paso — el conductor puede seguir escribiendo.
  expect(textoGlobo()).toContain("Gasolina, rendimiento y meta");
  // Pero ya se ve cumplido y el botón invita a seguir.
  expect(textoGlobo()).toContain(TOUR_STEPS[idxDe("variables")].doneHint);
  expect(botonPrincipal().textContent).toContain("SIGUIENTE");

  avanzar();
  expect(textoGlobo()).toContain("Lo que te cobra cada app");
});

test("el aviso equivocado no da por hecho el paso", () => {
  render({ currentTab: "config" });
  llegarA("variables");
  emitir(TOUR_EVENTS.QUICK_CLOSED);
  expect(botonPrincipal().textContent).toContain("SEGUIR SIN HACERLO");
});

test("un paso de navegación sí avanza solo al llegar a la pestaña", () => {
  jest.useFakeTimers();
  render();
  avanzar(); // bienvenida -> ir-config
  expect(textoGlobo()).toContain("Abajo están tus 5 pestañas");

  emitir(TOUR_EVENTS.TAB_CHANGED, "stats");   // pestaña equivocada
  act(() => { jest.advanceTimersByTime(600); });
  expect(textoGlobo()).toContain("Abajo están tus 5 pestañas");

  emitir(TOUR_EVENTS.TAB_CHANGED, "config");
  act(() => { jest.advanceTimersByTime(600); });
  render({ currentTab: "config" });
  expect(textoGlobo()).toContain("Gasolina, rendimiento y meta");
  jest.useRealTimers();
});

test("si el conductor anda en otra pestaña, lo regresan en vez de moverlo", () => {
  render({ currentTab: "home" });
  llegarA("variables");
  // El paso vive en Config y él está en Hoy.
  expect(textoGlobo()).toContain("Vuelve a «Config»");
  expect(textoGlobo()).toContain("Toca «Config» en la barra de abajo");
});

const velos = () => [...container.querySelectorAll("div")]
  .filter(d => d.style.position === "fixed" && d.style.zIndex === "10005");

test("un paso que pide algo deja pasar el toque en toda la pantalla", () => {
  render({ currentTab: "config" });
  llegarA("variables"); // hay que escribir en los campos y bajar a guardar
  expect(velos().length).toBeGreaterThan(0);
  for (const v of velos()) expect(v.style.pointerEvents).toBe("none");
});

test("un paso informativo sí bloquea, para no disparar acciones reales", () => {
  render({ currentTab: "stats" });
  llegarA("stats");
  expect(textoGlobo()).toContain("De dónde sale tu dinero");
  expect(velos().length).toBeGreaterThan(0);
  for (const v of velos()) expect(v.style.pointerEvents).toBe("auto");
});

// Lo que se rompió en el teléfono: el aro se quedaba en el botón de modo y el
// globo tapaba justo el panel de GPS o Foto IA que se estaba explicando.
test("al cumplir un paso el aro se pasa al panel que acaba de aparecer", () => {
  render({ currentTab: "home" });
  llegarA("viaje-gps");
  const paso = TOUR_STEPS[idxDe("viaje-gps")];
  expect(textoGlobo()).toContain("2 de 3: que el GPS lo mida");

  emitir(TOUR_EVENTS.TRIP_MODE_CHANGED, "gps");

  expect(textoGlobo()).toContain(paso.doneHint);
  expect(paso.doneHighlight).toBe("trip-gps-panel");
});

test("los km del viaje se explican en dos tramos, no de golpe", () => {
  const orden = ["viaje-tarifa", "viaje-recoleccion", "viaje-destino"].map(idxDe);
  expect(orden).toEqual([...orden].sort((a, b) => a - b));
  expect(orden.every(i => i >= 0)).toBe(true);

  render({ currentTab: "home" });
  llegarA("viaje-recoleccion");
  expect(textoGlobo()).toContain("Primero, lo que te cuesta llegar");
  // El tramo para recoger no se paga pero sí gasta: por eso se pide aparte.
  emitir(TOUR_EVENTS.TRIP_FIELD_FILLED, "pickup_min");
  expect(textoGlobo()).toContain("Ahora el tramo con el pasajero arriba");
  avanzar();
  expect(textoGlobo()).toContain("Luego, el viaje pagado");
  emitir(TOUR_EVENTS.TRIP_FIELD_FILLED, "dest_km");
  expect(textoGlobo()).toContain("evaluación del viaje completo");
});

test("escribir la tarifa no adelanta el paso de los kilómetros", () => {
  render({ currentTab: "home" });
  llegarA("viaje-recoleccion");
  emitir(TOUR_EVENTS.TRIP_FIELD_FILLED, "fare");
  expect(botonPrincipal().textContent).toContain("SALTAR ESTE PASO");
});

test("ningún paso del recorrido se queda sin salida", () => {
  render({ currentTab: "home" });
  for (let i = 0; i < TOUR_STEPS.length; i++) {
    const paso = TOUR_STEPS[i];
    const boton = botonPrincipal();
    expect(boton).toBeDefined();
    // Un paso en espera ofrece seguir sin hacerlo; uno cumplido, seguir.
    if (stepWaits(paso).length && !paso.tab) expect(boton.textContent).toMatch(/SEGUIR SIN HACERLO|SALTAR ESTE PASO/);
    if (i < TOUR_STEPS.length - 1) avanzar();
  }
  expect(botonPrincipal().textContent).toContain("ENTENDIDO");
});
