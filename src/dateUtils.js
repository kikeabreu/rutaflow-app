const DATE_ONLY=/^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const parseDeviceDate=value=>{
  if(value instanceof Date)return new Date(value.getTime());
  if(typeof value==="string"){
    const dateOnly=value.match(DATE_ONLY);
    if(dateOnly)return new Date(Number(dateOnly[1]),Number(dateOnly[2])-1,Number(dateOnly[3]),12,0,0,0);
    const local=value.match(LOCAL_DATE_TIME);
    if(local)return new Date(Number(local[1]),Number(local[2])-1,Number(local[3]),Number(local[4]),Number(local[5]),Number(local[6]||0),Number(String(local[7]||"0").padEnd(3,"0")));
  }
  return new Date(value);
};

const dateKey=value=>{
  if(typeof value==="string"&&DATE_ONLY.test(value))return value;
  const d=parseDeviceDate(value);
  if(!Number.isFinite(d.getTime()))return"";
  const pad=n=>String(n).padStart(2,"0");
  return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

const localDateTime=value=>{
  const d=parseDeviceDate(value===undefined||value===null||value===""?Date.now():value);
  if(!Number.isFinite(d.getTime()))return"";
  const pad=n=>String(n).padStart(2,"0");
  return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toStorageInstant=value=>{
  const d=parseDeviceDate(value===undefined||value===null||value===""?Date.now():value);
  if(!Number.isFinite(d.getTime()))throw new Error("Fecha u hora no valida");
  return d.toISOString();
};

const today=()=>dateKey(Date.now());
const shiftDate=(days=0)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return dateKey(d);};
const fmtDate=value=>parseDeviceDate(value).toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"});
const fmtHour=value=>parseDeviceDate(value).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const deviceTimeZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"zona local del dispositivo";}catch{return"zona local del dispositivo";}};

module.exports={parseDeviceDate,dateKey,localDateTime,toStorageInstant,today,shiftDate,fmtDate,fmtHour,deviceTimeZone};
