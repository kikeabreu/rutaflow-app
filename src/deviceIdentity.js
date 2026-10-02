import { Capacitor, registerPlugin } from "@capacitor/core";

// Identidad del dispositivo para "un celular a la vez" y la prueba por
// dispositivo. En Android usamos ANDROID_ID (sobrevive reinstalaciones); en la
// PWA no existe un ID de hardware, así que guardamos uno aleatorio que dura
// mientras el navegador conserve los datos del sitio.
const NativeDevice = registerPlugin("RuletoDevice");
const WEB_KEY = "ruleto_device_id";

let cached = null;

const randomHex = bytes => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, b => b.toString(16).padStart(2, "0")).join("");
};

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export function webLabel(userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const ua = String(userAgent);
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${browser} · ${os}`;
}

function webDeviceId() {
  let id = null;
  try { id = localStorage.getItem(WEB_KEY); } catch {}
  if (!/^web:[a-f0-9]{32}$/.test(id || "")) {
    id = `web:${randomHex(16)}`;
    try { localStorage.setItem(WEB_KEY, id); } catch {}
  }
  return id;
}

export async function getDeviceIdentity() {
  if (cached) return cached;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    try {
      const info = await NativeDevice.identity();
      const raw = String(info?.id || "");
      if (raw) {
        const hashed = crypto?.subtle ? await sha256Hex(`ruleto:${raw}`) : raw.replace(/[^A-Za-z0-9]/g, "");
        if (hashed.length >= 16) {
          const label = [info.manufacturer, info.model].filter(Boolean).join(" ").trim() || "Android";
          cached = { id: `android:${hashed.slice(0, 64)}`, platform: "android", label: label.slice(0, 80) };
          return cached;
        }
      }
    } catch (error) {
      // APK anterior sin el plugin: caemos al ID guardado, igual que la PWA.
      console.warn("Identidad nativa no disponible", error?.message || error);
    }
  }
  cached = { id: webDeviceId(), platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web", label: webLabel() };
  return cached;
}
