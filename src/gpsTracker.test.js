import { gpsStep, readTracker, startTracker, stopTracker, clearTracker, patchTracker, resumeTracker, subscribeTracker, trackerElapsedMs } from "./gpsTracker";

let onPosition;
let watches;
beforeEach(() => {
  localStorage.clear();
  watches = 0;
  onPosition = null;
  Object.defineProperty(global.navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: jest.fn(success => { onPosition = success; watches += 1; return watches; }),
      clearWatch: jest.fn(),
    },
  });
});
afterEach(() => { clearTracker("u1", "trip"); clearTracker("u1", "dead_km"); });

const fix = (lat, lon) => onPosition({ coords: { latitude: lat, longitude: lon } });

describe("gpsTracker", () => {
  it("sigue sumando y guardando km aunque nadie esté suscrito (modal cerrado)", () => {
    startTracker("u1", "trip");
    fix(20.97, -89.62);
    fix(20.98, -89.62); // ~1.1 km
    const saved = readTracker("u1", "trip");
    expect(saved.running).toBe(true);
    expect(saved.distKm).toBeGreaterThan(1.0);
    expect(saved.distKm).toBeLessThan(1.3);
  });

  it("al reabrir no duplica el watch y conserva lo medido", () => {
    startTracker("u1", "trip");
    fix(20.97, -89.62);
    fix(20.98, -89.62);
    resumeTracker("u1", "trip");
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    const seen = [];
    const off = subscribeTracker("u1", "trip", state => seen.push(state.distKm));
    fix(20.99, -89.62);
    off();
    expect(seen.at(-1)).toBeGreaterThan(2.0);
  });

  it("tras recargar la app retoma el watch desde lo guardado", () => {
    localStorage.setItem("ruleto:u1:gps:dead_km", JSON.stringify({ running: true, startedAt: Date.now() - 60000, distKm: 3, last: { lat: 20.97, lon: -89.62 } }));
    resumeTracker("u1", "dead_km");
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    fix(20.98, -89.62);
    expect(readTracker("u1", "dead_km").distKm).toBeGreaterThan(4.0);
  });

  it("detener conserva el resultado hasta guardarlo o descartarlo", () => {
    startTracker("u1", "dead_km", { startedAt: Date.now() - 120000 });
    patchTracker("u1", "dead_km", { startLocation: { lat: 1, lon: 2 } });
    const stopped = stopTracker("u1", "dead_km");
    expect(stopped.running).toBe(false);
    expect(stopped.startLocation).toEqual({ lat: 1, lon: 2 });
    expect(trackerElapsedMs(stopped)).toBeGreaterThanOrEqual(120000);
    expect(navigator.geolocation.clearWatch).toHaveBeenCalled();
    expect(readTracker("u1", "dead_km").running).toBe(false);
    clearTracker("u1", "dead_km");
    expect(readTracker("u1", "dead_km")).toBeNull();
  });

  it("separa las mediciones por usuario", () => {
    startTracker("u1", "trip");
    expect(readTracker("u2", "trip")).toBeNull();
  });
});

// Un metro de latitud son ~0.000009 grados (Mérida).
const M = 1 / 111195;
const at = (north, east = 0, extra = {}) => ({ latitude: 20.97 + north * M, longitude: -89.62 + east * M, accuracy: 10, ...extra });
const run = fixes => fixes.reduce((acc, c) => { const r = gpsStep(acc.anchor, c); return { km: acc.km + r.km, anchor: r.anchor }; }, { km: 0, anchor: null }).km;

describe("gpsStep", () => {
  it("estacionado, el ruido dentro del margen de error no suma", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    const ruido = Array.from({ length: 400 }, () => at(rnd() * 20, rnd() * 20, { accuracy: 15 }));
    expect(run(ruido)).toBe(0);
  });

  it("si el GPS dice que el auto está quieto, no avanza aunque el punto salte", () => {
    expect(run([at(0), at(40, 0, { speed: 0.2 }), at(-40, 0, { speed: 0.3 })])).toBe(0);
  });

  it("en tráfico lento acumula contra el ancla y no pierde lo recorrido", () => {
    const km = run(Array.from({ length: 41 }, (_, i) => at(i * 4, 0, { accuracy: 8 })));
    expect(km * 1000).toBeGreaterThanOrEqual(140);
    expect(km * 1000).toBeLessThanOrEqual(160);
  });

  it("descarta lecturas imprecisas", () => {
    expect(run([at(0), at(500, 0, { accuracy: 200 })])).toBe(0);
  });
});
