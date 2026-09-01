import { supabase } from "./supabaseClient";

const CACHE_KEY="rf_zone_cache";

const readCache=()=>{try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}");}catch{return{};}};
const writeCache=value=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(value));}catch{}};
const cacheKey=(lat,lon)=>`${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;

export function getCurrentLocation(options={}){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error("GPS no disponible"));return;}
    navigator.geolocation.getCurrentPosition(
      ({coords})=>resolve({
        lat:Number(coords.latitude.toFixed(5)),
        lon:Number(coords.longitude.toFixed(5)),
        accuracy_m:Math.round(coords.accuracy||0),
        captured_at:new Date().toISOString(),
      }),
      ()=>reject(new Error("No se pudo obtener la ubicacion")),
      {enableHighAccuracy:true,maximumAge:60000,timeout:options.timeout||10000}
    );
  });
}

export async function locateDriver(options={}){
  const point=await getCurrentLocation(options);
  const key=cacheKey(point.lat,point.lon);
  const cached=readCache()[key];
  if(cached)return{...point,...cached};

  try{
    const{data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)return point;
    const response=await fetch(`/api/geocode?lat=${point.lat}&lon=${point.lon}`,{
      headers:{Authorization:`Bearer ${session.access_token}`},
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return point;
    const place={zone:data.zone||"",city:data.city||""};
    const cache=readCache();cache[key]=place;
    const entries=Object.entries(cache).slice(-120);
    writeCache(Object.fromEntries(entries));
    return{...point,...place};
  }catch{return point;}
}
