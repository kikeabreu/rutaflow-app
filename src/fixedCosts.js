const PERIOD_DAYS = { diario: 1, semanal: 7, mensual: 30, trimestral: 90, semestral: 180, anual: 365 };

export function fixedCostPerHour(cfg = {}) {
  const hoursPerWeek = Number(cfg.workHoursPerWeek) > 0 ? Number(cfg.workHoursPerWeek) : 48;
  const weeklyCost = ["renta", "seguro"].reduce((total, name) => {
    if (!cfg[`${name}Enabled`]) return total;
    const amount = Math.max(0, Number(cfg[`${name}Monto`]) || 0);
    const days = PERIOD_DAYS[cfg[`${name}Periodo`]] || 30;
    return total + amount * 7 / days;
  }, 0);
  return weeklyCost / hoursPerWeek;
}
