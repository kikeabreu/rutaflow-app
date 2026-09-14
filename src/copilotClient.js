import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeCopilot = registerPlugin("RutaFlowCopilot");

export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export const copilotConfig = cfg => {
  const platforms = Array.isArray(cfg?.platforms) ? cfg.platforms : [];
  const commissions = Object.fromEntries(platforms.map(p => [String(p.id || "").toLowerCase(), Number(p.commission) || 0]));
  let wearPerKm = 0;
  if(cfg?.llantasEnabled) wearPerKm += (Number(cfg.llantasMonto) || 0) / (Number(cfg.llantasKmVida) || 40000);
  if(cfg?.mantenimientoEnabled) wearPerKm += (Number(cfg.mantenimientoMonto) || 0) / (Number(cfg.mantenimientoKmVida) || 5000);
  return JSON.stringify({
    gasPricePerLiter:Number(cfg?.gasPricePerLiter) || 24,
    kmPerLiter:Number(cfg?.kmPerLiter) || 12,
    targetHourlyRate:Number(cfg?.targetHourlyRate) || 200,
    wearPerKm,
    commissions,
    platformHint:String(cfg?.copilotPlatform||"otra").toLowerCase(),
  });
};

export const copilot = {
  async supported() {
    if (!isAndroidApp()) return { supported: false, platform: Capacitor.getPlatform() };
    return NativeCopilot.isSupported();
  },
  async status() {
    if (!isAndroidApp()) return { supported: false, running: false, message: "Disponible en la app Android" };
    return NativeCopilot.getStatus();
  },
  async start(cfg) {
    if (!isAndroidApp()) throw new Error("Instala la app Android para usar el copiloto.");
    return NativeCopilot.start({ config: copilotConfig(cfg) });
  },
  async stop() {
    if (!isAndroidApp()) return { running: false };
    return NativeCopilot.stop();
  },
  async updateConfig(cfg) {
    if (!isAndroidApp()) return;
    return NativeCopilot.updateConfig({ config: copilotConfig(cfg) });
  },
  async onOffer(listener) {
    if (!isAndroidApp()) return { remove() {} };
    return NativeCopilot.addListener("offer", listener);
  },
  async onStatus(listener) {
    if (!isAndroidApp()) return { remove() {} };
    return NativeCopilot.addListener("status", listener);
  },
};
