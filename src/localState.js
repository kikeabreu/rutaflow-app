const PREFIX="rf_user";

export const scopedKey=(userId,name)=>`${PREFIX}:${encodeURIComponent(String(userId||"anonymous"))}:${name}`;

export const readScoped=(storage,userId,name,fallback=null)=>{
  if(!storage||!userId)return fallback;
  try{
    const raw=storage.getItem(scopedKey(userId,name));
    return raw===null?fallback:JSON.parse(raw);
  }catch{return fallback;}
};

export const writeScoped=(storage,userId,name,value)=>{
  if(!storage||!userId)return false;
  try{storage.setItem(scopedKey(userId,name),JSON.stringify(value));return true;}catch{return false;}
};

export const removeScoped=(storage,userId,name)=>{
  if(!storage||!userId)return false;
  try{storage.removeItem(scopedKey(userId,name));return true;}catch{return false;}
};

export const resolveActiveDay=({localDay,cloudDay,cloudError})=>{
  if(cloudError)return localDay||null;
  if(!cloudDay)return null;
  return{
    id:cloudDay.id,
    date:cloudDay.date,
    startTime:new Date(cloudDay.start_time).getTime(),
    running:true,
  };
};

const TABS=new Set(["home","trips","stats","ai","config"]);
const TRIP_SECTIONS=new Set(["trips","extras","shifts"]);
const EXTRA_TYPES=new Set(["all","dead_km","refuel","tank_checkpoint","tip","bonus"]);

export const normalizeUiState=value=>({
  tab:TABS.has(value?.tab)?value.tab:"home",
  tripsSection:TRIP_SECTIONS.has(value?.tripsSection)?value.tripsSection:"trips",
  extraType:EXTRA_TYPES.has(value?.extraType)?value.extraType:"all",
});
