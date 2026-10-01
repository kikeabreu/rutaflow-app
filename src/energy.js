export const ENERGY_DEFAULTS = Object.freeze({
  vehicleType: "combustion", fuelKind: "gasoline", gasPricePerLiter: 24,
  kmPerLiter: 12, electricityPricePerKwh: 3.5, kwhPer100Km: 14,
  chargingLossPct: 0, electricSharePct: 50, energyUnit: "kwh100",
});

export function validateEnergy(config) {
  const kind = config.vehicleType || "combustion";
  if (!["combustion", "electric", "hev", "phev"].includes(kind)) throw new Error("Tipo de vehículo inválido");
  const checks = [
    ["gasPricePerLiter", 0, Infinity], ["kmPerLiter", 0, Infinity],
    ["electricityPricePerKwh", 0, Infinity], ["kwhPer100Km", 0, Infinity],
    ["chargingLossPct", 0, 100], ["electricSharePct", 0, 100],
  ];
  for (const [key, min, max] of checks) {
    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < min || value > max || ((key === "kmPerLiter" || key === "kwhPer100Km") && value === 0))
      throw new Error(`Valor inválido: ${key}`);
  }
  return kind;
}

export function energyCostPerKm(config) {
  const kind = validateEnergy(config);
  const fuel = Number(config.gasPricePerLiter) / Number(config.kmPerLiter);
  const electric = Number(config.electricityPricePerKwh) * Number(config.kwhPer100Km) / 100 * (1 + Number(config.chargingLossPct) / 100);
  if (kind === "electric") return electric;
  if (kind !== "phev") return fuel;
  const share = Number(config.electricSharePct) / 100;
  return share * electric + (1 - share) * fuel;
}

export const kwhPer100FromKmPerKwh = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error("El rendimiento debe ser mayor que cero");
  return 100 / n;
};

export function calculationSnapshot(config, platform) {
  return {
    version: 1, source: "recorded", vehicleType: config.vehicleType || "combustion",
    operatingEnergyCostPerKm: energyCostPerKm(config),
    commissionPct: Number((config.platforms || []).find(p => p.id === platform)?.commission ?? config.platformCut ?? 0),
    wearPerKm: (config.llantasEnabled ? Number(config.llantasMonto || 0) / Number(config.llantasKmVida || 40000) : 0)
      + (config.mantenimientoEnabled ? Number(config.mantenimientoMonto || 0) / Number(config.mantenimientoKmVida || 5000) : 0),
    fixedCostPerHour: Number(config.fixedCostPerHour || 0),
  };
}
