import { Capacitor } from "@capacitor/core";

const configuredOrigin=String(process.env.REACT_APP_API_BASE_URL||"").replace(/\/$/,"");

export function apiUrl(path){
  const normalized=String(path||"").startsWith("/")?String(path):`/${path}`;
  return Capacitor.isNativePlatform()?`${configuredOrigin}${normalized}`:normalized;
}
