import { calculationSnapshot, energyCostPerKm, kwhPer100FromKmPerKwh, validateEnergy } from "./energy";

const base = {
  vehicleType: "combustion", gasPricePerLiter: 24, kmPerLiter: 12,
  electricityPricePerKwh: 3.5, kwhPer100Km: 14,
  chargingLossPct: 0, electricSharePct: 50,
};

test("combustion and HEV use paid fuel only", () => {
  expect(energyCostPerKm(base)).toBe(2);
  expect(energyCostPerKm({...base, vehicleType:"hev",gasPricePerLiter:23.47,kmPerLiter:22})).toBeCloseTo(1.066818, 5);
});

test("electricity and charging adjustment include zero price", () => {
  expect(energyCostPerKm({...base, vehicleType:"electric"})).toBeCloseTo(.49);
  expect(energyCostPerKm({...base, vehicleType:"electric",chargingLossPct:10})).toBeCloseTo(.539);
  expect(energyCostPerKm({...base, vehicleType:"electric",electricityPricePerKwh:0})).toBe(0);
});

test("PHEV blends the share of kilometers", () => {
  const phev={...base,vehicleType:"phev",gasPricePerLiter:23.47,kmPerLiter:20,kwhPer100Km:15,electricSharePct:70};
  expect(energyCostPerKm(phev)).toBeCloseTo(.71955,5);
  expect(energyCostPerKm({...phev,electricSharePct:0})).toBeCloseTo(23.47/20);
  expect(energyCostPerKm({...phev,electricSharePct:100})).toBeCloseTo(.525);
});

test("units and invalid inputs", () => {
  expect(kwhPer100FromKmPerKwh(5)).toBe(20);
  expect(()=>validateEnergy({...base,kmPerLiter:0})).toThrow();
  expect(()=>validateEnergy({...base,electricSharePct:101})).toThrow();
  expect(()=>validateEnergy({...base,electricityPricePerKwh:-1})).toThrow();
});

test("snapshot freezes energy cost and commission", () => {
  const snap=calculationSnapshot({...base,platforms:[{id:"uber",commission:25}]},"uber");
  expect(snap.operatingEnergyCostPerKm).toBe(2);
  expect(snap.commissionPct).toBe(25);
});
