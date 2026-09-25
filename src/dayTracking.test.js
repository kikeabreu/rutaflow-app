jest.mock('./nativeTrackingClient', () => ({
  nativeTracking: { readPending: jest.fn(), ack: jest.fn(), status: jest.fn(), startSession: jest.fn(), startSegment: jest.fn() },
}));

import { nativeTracking } from './nativeTrackingClient';
import { drainNativeKm, ensureNativeShift, haversineKm, kmFromSamples } from './dayTracking';

// Mérida: dos puntos a un kilómetro escaso uno del otro.
const P = (lat, lon, ms, continuity = "a") => ({
  latitude: lat, longitude: lon, capturedAt: ms, continuityId: continuity,
  sampleId: `s-${lat}-${lon}-${ms}`,
});

describe("kmFromSamples", () => {
  test("sin puntos suficientes no hay distancia", () => {
    expect(kmFromSamples([])).toBe(0);
    expect(kmFromSamples([P(20.97, -89.62, 1)])).toBe(0);
    expect(kmFromSamples(null)).toBe(0);
  });

  test("suma los tramos consecutivos", () => {
    const km = kmFromSamples([P(20.97, -89.62, 1), P(20.98, -89.62, 2), P(20.99, -89.62, 3)]);
    expect(km).toBeCloseTo(haversineKm({ lat: 20.97, lon: -89.62 }, { lat: 20.99, lon: -89.62 }), 5);
  });

  test("los ordena por hora aunque lleguen revueltos", () => {
    const orden = [P(20.97, -89.62, 1), P(20.98, -89.62, 2), P(20.99, -89.62, 3)];
    const revuelto = [orden[2], orden[0], orden[1]];
    expect(kmFromSamples(revuelto)).toBeCloseTo(kmFromSamples(orden), 9);
  });

  // Lo importante: un hueco de GPS no es distancia manejada. Si se sumara, el
  // conductor vería kilómetros que no hizo y gasolina que no gastó.
  test("no cruza un corte de continuidad", () => {
    const conHueco = [P(20.97, -89.62, 1, "a"), P(20.98, -89.62, 2, "a"), P(21.20, -89.62, 3, "b"), P(21.21, -89.62, 4, "b")];
    const tramoA = haversineKm({ lat: 20.97, lon: -89.62 }, { lat: 20.98, lon: -89.62 });
    const tramoB = haversineKm({ lat: 21.20, lon: -89.62 }, { lat: 21.21, lon: -89.62 });
    expect(kmFromSamples(conHueco)).toBeCloseTo(tramoA + tramoB, 9);
  });

  // Number(null) es 0, y 0,0 es un punto válido en el Golfo de Guinea: un
  // punto vacío colado sumaría casi 20 000 km a la jornada.
  test("ignora puntos con coordenadas rotas", () => {
    const limpio = kmFromSamples([P(20.97, -89.62, 1), P(20.98, -89.62, 3)]);
    for (const roto of [null, undefined, "", "abc", 999]) {
      const sucios = [P(20.97, -89.62, 1), { latitude: roto, longitude: roto, capturedAt: 2, continuityId: "a" }, P(20.98, -89.62, 3)];
      expect(kmFromSamples(sucios)).toBeCloseTo(limpio, 9);
    }
  });
});

describe("drainNativeKm", () => {
  beforeEach(() => jest.clearAllMocks());

  test("sin usuario no toca el almacén nativo", async () => {
    expect(await drainNativeKm("")).toBe(0);
    expect(nativeTracking.readPending).not.toHaveBeenCalled();
  });

  test("con un solo punto no confirma nada: hace falta el par", async () => {
    nativeTracking.readPending.mockResolvedValue({ points: [P(20.97, -89.62, 1)] });
    expect(await drainNativeKm("u1")).toBe(0);
    expect(nativeTracking.ack).not.toHaveBeenCalled();
  });

  // El último punto es el ancla de la siguiente tanda. Confirmarlo perdería el
  // tramo entre una lectura y la que sigue, y la jornada mediría de menos.
  test("deja sin confirmar el último punto", async () => {
    const puntos = [P(20.97, -89.62, 1), P(20.98, -89.62, 2), P(20.99, -89.62, 3)];
    nativeTracking.readPending.mockResolvedValue({ points: puntos });
    nativeTracking.ack.mockResolvedValue({ acknowledged: 2 });

    const km = await drainNativeKm("u1");

    expect(km).toBeGreaterThan(0);
    const confirmados = nativeTracking.ack.mock.calls[0][1];
    expect(confirmados).toEqual([puntos[0].sampleId, puntos[1].sampleId]);
    expect(confirmados).not.toContain(puntos[2].sampleId);
  });

  test("dos tandas seguidas suman el tramo que las une", async () => {
    const ancla = P(20.98, -89.62, 2);
    nativeTracking.readPending.mockResolvedValueOnce({ points: [P(20.97, -89.62, 1), ancla] });
    nativeTracking.ack.mockResolvedValue({ acknowledged: 1 });
    const primera = await drainNativeKm("u1");

    // La segunda lectura vuelve a traer el ancla, que quedó pendiente.
    nativeTracking.readPending.mockResolvedValueOnce({ points: [ancla, P(20.99, -89.62, 3)] });
    const segunda = await drainNativeKm("u1");

    const total = haversineKm({ lat: 20.97, lon: -89.62 }, { lat: 20.99, lon: -89.62 });
    expect(primera + segunda).toBeCloseTo(total, 5);
  });
});

describe("ensureNativeShift", () => {
  beforeEach(() => jest.clearAllMocks());

  test("fuera de Android no intenta nada", async () => {
    nativeTracking.status.mockResolvedValue({ supported: false });
    await ensureNativeShift("u1", "d1");
    expect(nativeTracking.startSession).not.toHaveBeenCalled();
  });

  test("si no hay sesión la abre y arranca el tramo", async () => {
    nativeTracking.status.mockResolvedValue({ supported: true, running: false });
    await ensureNativeShift("u1", "d1");
    expect(nativeTracking.startSession).toHaveBeenCalledWith({ userId: "u1", sessionId: "d1" });
    expect(nativeTracking.startSegment).toHaveBeenCalledWith("shift");
  });

  // Este era el agujero: el servicio corría, gastaba batería y mostraba su
  // notificación, pero sin tramo abierto tiraba cada punto que tomaba.
  test("si la sesión corre sin tramo, lo arranca sin reabrir la sesión", async () => {
    nativeTracking.status.mockResolvedValue({ supported: true, running: true, segmentId: "" });
    await ensureNativeShift("u1", "d1");
    expect(nativeTracking.startSession).not.toHaveBeenCalled();
    expect(nativeTracking.startSegment).toHaveBeenCalledWith("shift");
  });

  test("si ya va midiendo no la reinicia", async () => {
    nativeTracking.status.mockResolvedValue({ supported: true, running: true, segmentId: "seg-1" });
    await ensureNativeShift("u1", "d1");
    expect(nativeTracking.startSession).not.toHaveBeenCalled();
    expect(nativeTracking.startSegment).not.toHaveBeenCalled();
  });
});
