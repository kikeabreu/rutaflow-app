import { supabase } from "./supabaseClient";
import { apiUrl } from "./apiClient";

const cacheName=userId=>`rf_zone_cache_${userId}`;
const readCache=userId=>{try{return JSON.parse(localStorage.getItem(cacheName(userId))||"{}");}catch{return{};}};
const writeCache=(userId,value)=>{try{localStorage.setItem(cacheName(userId),JSON.stringify(value));}catch{}};
const cacheKey=(lat,lon)=>`${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;

export function getCurrentLocation(options={}){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error("GPS no disponible"));return;}
    navigator.geolocation.getCurrentPosition(
      ({coords,timestamp})=>resolve({
        lat:Number(coords.latitude.toFixed(6)),
        lon:Number(coords.longitude.toFixed(6)),
        accuracy_m:Number.isFinite(coords.accuracy)?Math.round(coords.accuracy):null,
        captured_at:new Date(timestamp||Date.now()).toISOString(),
      }),
      ()=>reject(new Error("No se pudo obtener la ubicacion")),
      {enableHighAccuracy:true,maximumAge:options.maximumAge??0,timeout:options.timeout||10000}
    );
  });
}

export async function reverseGeocodePoint(point){
  if(!point||!Number.isFinite(Number(point.lat))||!Number.isFinite(Number(point.lon)))return point;
  let session;
  try{({data:{session}}=await supabase.auth.getSession());}catch{return{...point,place_status:"pending"};}
  if(!session?.access_token)return{...point,place_status:"pending"};
  const key=cacheKey(point.lat,point.lon);
  const cached=readCache(session.user.id)[key];
  if(cached)return{...point,...cached};

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4500);
  try{
    const response=await fetch(apiUrl(`/api/geocode?lat=${point.lat}&lon=${point.lon}`),{
      headers:{Authorization:`Bearer ${session.access_token}`},
      signal:controller.signal,
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return{...point,place_status:"pending"};
    const place={
      zone:data.zone||"",
      neighborhood:data.neighborhood||"",
      neighborhood_type:data.neighborhood_type||"",
      city:data.city||"",
      city_type:data.city_type||"",
      municipality:data.municipality||"",
      state:data.state||"",
      place_status:data.place_status||"partial",
      geocode_provider:data.provider||"",
      display_name:data.display_name||(data.zone&&data.city&&data.zone!==data.city?`${data.zone}, ${data.city}`:(data.zone||data.city||""))
    };
    const cache=readCache(session.user.id);cache[key]=place;
    const entries=Object.entries(cache).slice(-120);
    writeCache(session.user.id,Object.fromEntries(entries));
    return{...point,...place};
  }catch{return{...point,place_status:"pending"};}
  finally{clearTimeout(timer);}
}

export async function locateDriver(options={}){
  const point=await getCurrentLocation(options);
  if(options.includePlace===false)return point;
  return reverseGeocodePoint(point);
}
