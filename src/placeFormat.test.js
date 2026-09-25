import { coordsLabel, placeLabel } from './placeFormat';

describe("placeLabel", () => {
  test("junta colonia y ciudad", () => {
    expect(placeLabel({ neighborhood: "Itzimná", city: "Mérida" })).toBe("Itzimná, Mérida");
  });

  // Antes se mandaba a la IA solo la colonia; "Centro" no le dice en qué
  // ciudad ganó bien el conductor.
  test("no se queda con la colonia a secas", () => {
    expect(placeLabel({ neighborhood: "Centro", city: "Cancún" })).toBe("Centro, Cancún");
    expect(placeLabel({ neighborhood: "Centro", city: "Mérida" })).toBe("Centro, Mérida");
  });

  test("acepta el campo viejo zone", () => {
    expect(placeLabel({ zone: "García Ginerés", city: "Mérida" })).toBe("García Ginerés, Mérida");
  });

  test("cae al municipio cuando no hay ciudad", () => {
    expect(placeLabel({ neighborhood: "Chuburná", municipality: "Mérida" })).toBe("Chuburná, Mérida");
  });

  test("no repite el nombre cuando colonia y ciudad coinciden", () => {
    expect(placeLabel({ neighborhood: "Progreso", city: "Progreso" })).toBe("Progreso");
  });

  test("con una sola pieza devuelve esa", () => {
    expect(placeLabel({ city: "Mérida" })).toBe("Mérida");
    expect(placeLabel({ neighborhood: "Itzimná" })).toBe("Itzimná");
  });

  test("sin nombre resuelto quedan las coordenadas, no una cadena vacía", () => {
    expect(placeLabel({ latitude: 20.9767, longitude: -89.6212 })).toBe("20.977, -89.621");
    expect(placeLabel({ lat: 20.9767, lon: -89.6212 })).toBe("20.977, -89.621");
  });

  test("sin punto no inventa nada", () => {
    expect(placeLabel(null)).toBe("");
    expect(placeLabel({})).toBe("");
    expect(coordsLabel({ latitude: null, longitude: null })).toBe("");
  });
});
