import dateUtils from "./dateUtils";

const { shiftDate } = dateUtils;

// Timestamp ISO para "hace N días a las H:MM", usado para que el ejemplo
// siempre se vea como una semana reciente sin importar cuándo se abra la app.
const at = (daysAgo, hour, minute = 0) => {
  const d = new Date(`${shiftDate(-daysAgo)}T12:00:00`);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

// Una semana completa de viajes ficticios: mezcla de plataformas, zonas y
// veredictos (buenos, aceptables y uno flojo) para que Hoy, Historial y
// Estadísticas se vean llenos antes de que el conductor registre nada real.
export const DEMO_TRIPS = [
  { id: "demo-1", platform: "uber", fare: 96, gps_km: 8.4, gps_min: 22, end_time: at(6, 8, 10), zone: "Centro" },
  { id: "demo-2", platform: "didi", fare: 58, gps_km: 4.1, gps_min: 14, end_time: at(6, 13, 40), zone: "Roma Norte" },
  { id: "demo-3", platform: "uber", fare: 142, gps_km: 15.2, gps_min: 34, end_time: at(5, 9, 5), zone: "Aeropuerto" },
  { id: "demo-4", platform: "indrive", fare: 45, gps_km: 6.7, gps_min: 19, end_time: at(5, 19, 20), zone: "Del Valle" },
  { id: "demo-5", platform: "didi", fare: 63, gps_km: 5.3, gps_min: 16, end_time: at(4, 8, 45), zone: "Polanco" },
  { id: "demo-6", platform: "uber", fare: 110, gps_km: 11.6, gps_min: 27, end_time: at(4, 20, 15), zone: "Condesa" },
  { id: "demo-7", platform: "uber", fare: 38, gps_km: 9.8, gps_min: 30, end_time: at(3, 15, 0), zone: "Iztapalapa" },
  { id: "demo-8", platform: "didi", fare: 75, gps_km: 6.2, gps_min: 17, end_time: at(3, 9, 30), zone: "Centro" },
  { id: "demo-9", platform: "particular", fare: 180, gps_km: 22.4, gps_min: 41, end_time: at(2, 18, 0), zone: "Santa Fe" },
  { id: "demo-10", platform: "uber", fare: 52, gps_km: 4.8, gps_min: 13, end_time: at(2, 8, 20), zone: "Roma Norte" },
  { id: "demo-11", platform: "indrive", fare: 88, gps_km: 9.1, gps_min: 24, end_time: at(1, 14, 10), zone: "Del Valle" },
  { id: "demo-12", platform: "didi", fare: 64, gps_km: 5.9, gps_min: 18, end_time: at(1, 21, 5), zone: "Condesa" },
  { id: "demo-13", platform: "uber", fare: 97, gps_km: 8.9, gps_min: 23, end_time: at(0, 8, 0), zone: "Centro" },
  { id: "demo-14", platform: "uber", fare: 71, gps_km: 6.4, gps_min: 19, end_time: at(0, 13, 15), zone: "Polanco" },
];

export const DEMO_EVENTS = [
  { id: "demo-e1", type: "refuel", liters: 32, amount: 780, occurred_at: at(5, 7, 30) },
  { id: "demo-e2", type: "tip", amount: 25, occurred_at: at(4, 20, 40) },
  { id: "demo-e3", type: "dead_km", km: 6.2, occurred_at: at(3, 12, 0) },
  { id: "demo-e4", type: "tip", amount: 40, occurred_at: at(1, 21, 20) },
];

export const isFreshAccount = (trips, events) => (trips?.length || 0) === 0 && (events?.length || 0) === 0;
