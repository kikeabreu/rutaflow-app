import { normalizePhone, splitPhone, formatPhone, DEFAULT_COUNTRY } from "./phone";

describe("normalizePhone", () => {
  it("usa México +52 por defecto y acepta 10 dígitos con espacios", () => {
    expect(DEFAULT_COUNTRY).toBe("MX");
    expect(normalizePhone("MX", "55 1234 5678")).toBe("+525512345678");
  });
  it("quita la lada internacional y el 1 o 044 de los celulares mexicanos", () => {
    expect(normalizePhone("MX", "+52 1 55 1234 5678")).toBe("+525512345678");
    expect(normalizePhone("MX", "1 55 1234 5678")).toBe("+525512345678");
    expect(normalizePhone("MX", "044 55 1234 5678")).toBe("+525512345678");
  });
  it("valida la longitud según el país", () => {
    expect(() => normalizePhone("MX", "551234")).toThrow(/10 dígitos/);
    expect(normalizePhone("CO", "300 123 4567")).toBe("+573001234567");
    expect(() => normalizePhone("MX", "")).toThrow(/Escribe/);
    expect(() => normalizePhone("MX", "5555555555")).toThrow(/no parece válido/);
  });
});

describe("splitPhone / formatPhone", () => {
  it("separa y formatea números guardados", () => {
    expect(splitPhone("+525512345678")).toEqual({ iso: "MX", local: "5512345678" });
    expect(splitPhone("+15551234567", "US")).toEqual({ iso: "US", local: "5551234567" });
    expect(formatPhone("+525512345678")).toBe("+52 55 1234 5678");
  });
});
