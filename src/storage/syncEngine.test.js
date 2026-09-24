// syncEngine importa el cliente de Supabase, que exige credenciales al cargarse.
// Estas pruebas cubren los helpers puros, así que basta con aislarlo.
jest.mock('../supabaseClient', () => ({ supabase: {} }));

import { normalizeBody, normalizeSubject } from './syncEngine';

// RLS exige subject de 4..160 y body de 1..5000. Un valor fuera de rango no
// devuelve un error claro: el insert simplemente rebota y el conductor cree
// que su reporte se envió.
describe("normalizeSubject", () => {
  test("conserva un asunto válido", () => {
    expect(normalizeSubject("La app no guarda mis viajes")).toBe("La app no guarda mis viajes");
  });

  test("sustituye un asunto demasiado corto para RLS", () => {
    expect(normalizeSubject("ay")).toBe("Sugerencia o reporte de conductor");
    expect(normalizeSubject("   ")).toBe("Sugerencia o reporte de conductor");
    expect(normalizeSubject(undefined)).toBe("Sugerencia o reporte de conductor");
  });

  test("recorta un asunto que excede el límite", () => {
    expect(normalizeSubject("a".repeat(400))).toHaveLength(160);
  });
});

describe("normalizeBody", () => {
  test("adjunta los datos del dispositivo al reporte", () => {
    const body = normalizeBody("No abre el copiloto", { screen: "412x915" });
    expect(body).toContain("No abre el copiloto");
    expect(body).toContain("412x915");
  });

  test("omite el pie cuando no hay datos del dispositivo", () => {
    expect(normalizeBody("Falla el GPS", null)).toBe("Falla el GPS");
  });

  test("rechaza un reporte vacío en lugar de mandarlo a rebotar", () => {
    expect(() => normalizeBody("   ", null)).toThrow(/vacío/);
  });

  test("recorta un reporte que excede el límite", () => {
    expect(normalizeBody("a".repeat(6000), null)).toHaveLength(5000);
  });
});
