import { fixedCostPerHour } from "./fixedCosts";

test("prorratea renta y seguro configurados entre horas semanales", () => {
  expect(fixedCostPerHour({
    workHoursPerWeek: 42,
    rentaEnabled: true, rentaMonto: 420, rentaPeriodo: "semanal",
    seguroEnabled: true, seguroMonto: 300, seguroPeriodo: "mensual",
  })).toBeCloseTo((420 + 70) / 42);
});

test("no descuenta gastos fijos desactivados", () => {
  expect(fixedCostPerHour({ rentaEnabled: false, rentaMonto: 5000 })).toBe(0);
});
