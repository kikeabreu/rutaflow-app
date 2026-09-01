import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabaseClient";
import { callGroq, imageToDataUrl, parseJsonContent } from "./groqClient";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C={bg:"#07080d",card:"#0d0f1a",card2:"#111320",border:"#1a1d2e",bord2:"#242740",accent:"#f0a500",teal:"#00c9a7",danger:"#ff4055",dim:"#3a3d55",muted:"#6b6e8a",text:"#dde0f5"};

// ─── localStorage ─────────────────────────────────────────────────────────────
const LS={
  get:(k,d=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  del:(k)=>{try{localStorage.removeItem(k);}catch{}},
};
const K={DRAFT:"rf_draft",DAY:"rf_day",DAYGPS:"rf_daygps",CHATS:"rf_ai_conversations"};
const FREE_MONTHLY_TRIP_LIMIT=30;
const paymentUrl=()=>process.env.REACT_APP_STRIPE_PAYMENT_LINK||process.env.REACT_APP_MERCADOPAGO_PAYMENT_LINK||"";
const isProProfile=profile=>{
  if(!profile)return false;
  const plan=String(profile.plan||"").toLowerCase();
  const status=String(profile.subscription_status||"").toLowerCase();
  const until=profile.pro_until?new Date(profile.pro_until).getTime():0;
  return plan==="pro"||status==="active"||status==="trialing"||until>Date.now();
};
const openUpgrade=()=>{
  const url=paymentUrl();
  if(url)window.open(url,"_blank","noopener,noreferrer");
  else alert("Configura REACT_APP_STRIPE_PAYMENT_LINK o REACT_APP_MERCADOPAGO_PAYMENT_LINK para activar cobros.");
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt=(n,d=2)=>(parseFloat(n)||0).toFixed(d);
const fmtMXN=n=>`$${fmt(n)}`;
const fmtPct=n=>`${fmt(n,1)}%`;
const dateKey=value=>{const d=new Date(value),pad=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
const today=()=>dateKey(Date.now());
const fmtDate=d=>new Date(typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)?`${d}T12:00:00`:d).toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"});
const fmtHour=d=>new Date(d).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const fmtClock=ms=>{const s=Math.floor(Math.abs(ms)/1000);return`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;};
const haversine=(a,b)=>{const R=6371,r=x=>x*Math.PI/180;const dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon);const x=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
const dateOf=x=>x?.date||dateKey(x?.end_time||x?.occurred_at||x?.created_at||Date.now());
const shiftDate=(days=0)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return dateKey(d);};
const localDateTime=value=>{const d=new Date(value||Date.now());const pad=n=>String(n).padStart(2,"0");return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
const inDateRange=(item,range)=>{const d=dateOf(item);return(!range.from||d>=range.from)&&(!range.to||d<=range.to);};

const DEFAULT_PLATFORMS=[
  {id:"uber",name:"Uber",commission:25,enabled:true,color:"#00b4d8"},
  {id:"didi",name:"DiDi",commission:12,enabled:true,color:"#ff6b35"},
  {id:"indrive",name:"inDrive",commission:10,enabled:true,color:"#8bd450"},
  {id:"particular",name:"Particular",commission:0,enabled:true,color:"#00c9a7"},
];
const normalizeConfig=raw=>{
  const base={...DCFG,...(raw||{})};
  if(Array.isArray(raw?.platforms)&&raw.platforms.length)return{...base,platforms:raw.platforms.map(p=>({...p,id:String(p.id||p.name).toLowerCase().replace(/\s+/g,"-"),commission:Number(p.commission)||0,enabled:p.enabled!==false}))};
  return{...base,platforms:DEFAULT_PLATFORMS.map(p=>({...p}))};
};
const platformList=cfg=>(cfg?.platforms?.length?cfg.platforms:DEFAULT_PLATFORMS);
const platformInfo=(cfg,id)=>platformList(cfg).find(p=>p.id===String(id||"").toLowerCase())||platformList(cfg).find(p=>p.name.toLowerCase()===String(id||"").toLowerCase())||{id:id||"otra",name:id||"Otra",commission:Number(cfg?.platformCut)||0,color:C.muted,enabled:true};
const platformCommission=(cfg,id)=>Number(platformInfo(cfg,id).commission)||0;

// ─── CÁLCULO ─────────────────────────────────────────────────────────────────
const calcTrip=(trip,cfg)=>{
  const gKm=parseFloat(trip.gps_km)||0,gMin=parseFloat(trip.gps_min)||0;
  const km=gKm>0?gKm:(parseFloat(trip.pickup_km)||0)+(parseFloat(trip.dest_km)||0);
  const min=gMin>0?gMin:(parseFloat(trip.pickup_min)||0)+(parseFloat(trip.dest_min)||0);
  const fare=parseFloat(trip.fare)||0;
  const gas=km/(cfg.kmPerLiter||12)*(cfg.gasPricePerLiter||24);
  const fee=fare*platformCommission(cfg,trip.platform)/100;
  const p2d={diario:1,semanal:7,mensual:30,trimestral:90,semestral:180,anual:365};
  let fx=0;
  if(cfg.rentaEnabled)fx+=(cfg.rentaMonto||0)/(p2d[cfg.rentaPeriodo]||30);
  if(cfg.seguroEnabled)fx+=(cfg.seguroMonto||0)/(p2d[cfg.seguroPeriodo]||30);
  if(cfg.llantasEnabled)fx+=((cfg.llantasMonto||0)/(cfg.llantasKmVida||40000))*km;
  if(cfg.mantenimientoEnabled)fx+=((cfg.mantenimientoMonto||0)/(cfg.mantenimientoKmVida||5000))*km;
  const net=fare-fee-gas-fx,hrs=min/60;
  return{km,min,fare,gas,fee,fx,net,hrs,nph:hrs>0?net/hrs:0,npk:km>0?net/km:0,pct:fare>0?(net/fare)*100:0};
};
const eventMs=e=>new Date(e.occurred_at||e.created_at||0).getTime();
const tripMs=t=>new Date(t.end_time||t.created_at||0).getTime();
const distanceCost=(km,cfg)=>{
  const n=Number(km)||0;
  let wear=0;
  if(cfg.llantasEnabled)wear+=((cfg.llantasMonto||0)/(cfg.llantasKmVida||40000))*n;
  if(cfg.mantenimientoEnabled)wear+=((cfg.mantenimientoMonto||0)/(cfg.mantenimientoKmVida||5000))*n;
  return{gas:n/(cfg.kmPerLiter||12)*(cfg.gasPricePerLiter||24),wear};
};
const estimateTank=(trips,events,cfg)=>{
  const checkpoints=events.filter(e=>e.type==="tank_checkpoint"&&Number(e.tank_liters)>0).sort((a,b)=>eventMs(b)-eventMs(a));
  const refuels=events.filter(e=>e.type==="refuel"&&Number(e.liters)>0).sort((a,b)=>eventMs(b)-eventMs(a));
  const base=checkpoints[0]||refuels[0];
  if(!base)return{liters:null,rangeKm:null,confidence:"sin datos",status:"Sin referencia",statusColor:C.dim,basis:"Registra una carga o el nivel actual del tanque"};
  const start=eventMs(base);
  const baseLiters=base.type==="tank_checkpoint"?Number(base.tank_liters):Number(base.liters);
  const added=events.filter(e=>e.type==="refuel"&&eventMs(e)>start).reduce((s,e)=>s+(Number(e.liters)||0),0);
  const tripKm=trips.filter(t=>tripMs(t)>start).reduce((s,t)=>s+calcTrip(t,cfg).km,0);
  const deadKm=events.filter(e=>e.type==="dead_km"&&eventMs(e)>start).reduce((s,e)=>s+(Number(e.km)||0),0);
  const liters=Math.max(0,baseLiters+added-(tripKm+deadKm)/(cfg.kmPerLiter||12));
  const rangeKm=liters*(cfg.kmPerLiter||12);
  const urgent=liters<=2||rangeKm<35;
  const low=!urgent&&(liters<=6||rangeKm<80);
  return{
    liters,
    rangeKm,
    confidence:base.type==="tank_checkpoint"?"alta":"conservadora",
    status:urgent?"Carga urgente":low?"Combustible bajo":"Nivel suficiente",
    statusColor:urgent?C.danger:low?C.accent:C.teal,
    basis:base.type==="tank_checkpoint"?"Desde tu ultimo punto de control":"Desde tu ultima carga; no cuenta el combustible anterior",
  };
};
const operationalSummary=(trips,events,cfg,date,trackedKm=0)=>{
  const dayTrips=trips.filter(t=>(t.date||today())===date);
  const dayEvents=events.filter(e=>(e.date||today())===date);
  const tripStats=dayTrips.reduce((a,t)=>{const c=calcTrip(t,cfg);return{gross:a.gross+c.fare,fee:a.fee+c.fee,net:a.net+c.net,km:a.km+c.km,min:a.min+c.min};},{gross:0,fee:0,net:0,km:0,min:0});
  const explicitDeadKm=dayEvents.filter(e=>e.type==="dead_km").reduce((s,e)=>s+(Number(e.km)||0),0);
  const totalKm=Math.max(tripStats.km+explicitDeadKm,Number(trackedKm)||0);
  const deadKm=Math.max(explicitDeadKm,totalKm-tripStats.km);
  const deadCost=distanceCost(deadKm,cfg);
  const refuels=dayEvents.filter(e=>e.type==="refuel");
  const fuelPurchased=refuels.reduce((s,e)=>s+(Number(e.amount)||0),0);
  const litersPurchased=refuels.reduce((s,e)=>s+(Number(e.liters)||0),0);
  const consumedGas=distanceCost(totalKm,cfg).gas;
  return{
    ...tripStats,totalKm,deadKm,fuelPurchased,litersPurchased,consumedGas,
    net:tripStats.net-deadCost.gas-deadCost.wear,
    cash:tripStats.gross-tripStats.fee-fuelPurchased,
    productivePct:totalKm>0?tripStats.km/totalKm*100:0,
  };
};

// ─── ICONOS SVG ───────────────────────────────────────────────────────────────
const SVG=({d,size=18,color="currentColor",fill="none",sw=1.8})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
  </svg>
);
const IC={
  home:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  trips:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  stats:"M18 20V10 M12 20V4 M6 20v-6",
  ai:["M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3","M12 17h.01","M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"],
  cfg:["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
  play:"M5 3l14 9-14 9V3z",stop:"M6 6h12v12H6z",plus:"M12 5v14 M5 12h14",
  gps:["M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z","M12 11a2 2 0 100-4 2 2 0 000 4z"],
  cam:["M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z","M12 17a4 4 0 100-8 4 4 0 000 8z"],
  trash:["M3 6h18","M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"],
  check:"M20 6L9 17l-5-5",
  edit:["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
  eye:["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  mail:["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z","M22 6l-10 7L2 6"],
  lock:["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z","M7 11V7a5 5 0 0110 0v4"],
  user:["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2","M12 11a4 4 0 100-8 4 4 0 000 8z"],
  out:["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  back:"M15 18l-6-6 6-6",send:"M22 2L11 13 M22 2L15 22l-4-9-9-4 22-7z",
  flag:["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z","M4 22v-7"],
  road:["M3 17l3-10h12l3 10","M8 17v-5","M12 17V7","M16 17v-5"],
  fuel:["M3 22V4a2 2 0 012-2h8a2 2 0 012 2v18","M3 10h12","M18 7l3 3v9a2 2 0 01-4 0v-4a2 2 0 00-2-2"],
  gauge:["M4.93 19a10 10 0 1114.14 0","M12 15l4-4","M8 19h8"],
  mic:["M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z","M19 10v2a7 7 0 01-14 0v-2","M12 19v3","M8 22h8"],
  close:"M18 6L6 18 M6 6l12 12",
};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:0;height:0;}
body{background:#07080d;color:#dde0f5;font-family:'IBM Plex Mono',monospace;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
input,select,textarea{font-family:'IBM Plex Mono',monospace;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
button{cursor:pointer;font-family:'IBM Plex Mono',monospace;border:none;background:none;}
button:active{transform:scale(0.97);}
.B{font-family:'Barlow Condensed',sans-serif;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.fu{animation:fadeUp .28s ease forwards;}
.pu{animation:pulse 2s ease-in-out infinite;}
.sp{animation:spin .7s linear infinite;}
.su{animation:slideUp .26s cubic-bezier(.32,.72,0,1) forwards;}
.md{overflow-wrap:anywhere;}
.md p{margin:0 0 10px;}.md p:last-child{margin-bottom:0;}
.md h1,.md h2,.md h3{font-family:'Barlow Condensed',sans-serif;color:#f0a500;line-height:1.15;margin:16px 0 8px;letter-spacing:0;}
.md h1{font-size:22px}.md h2{font-size:19px}.md h3{font-size:16px}
.md ul,.md ol{padding-left:20px;margin:7px 0 11px}.md li{margin:4px 0}.md strong{color:#fff;font-weight:700}
.md blockquote{border-left:3px solid #f0a500;padding:7px 10px;margin:10px 0;background:#f0a5000c;color:#dde0f5}
.md code{background:#07080d;border:1px solid #242740;border-radius:4px;padding:1px 4px;font-size:.92em}
.md pre{overflow:auto;background:#07080d;border:1px solid #242740;border-radius:7px;padding:10px;margin:10px 0}.md pre code{border:0;padding:0}
.md .table-wrap{overflow-x:auto;margin:10px 0;border:1px solid #242740;border-radius:7px}
.md table{width:100%;border-collapse:collapse;min-width:380px;font-size:11px}.md th,.md td{padding:8px 9px;border-bottom:1px solid #242740;text-align:left;vertical-align:top}.md th{color:#f0a500;background:#111320}.md tr:last-child td{border-bottom:0}
`;

// ─── HOOKS DE SISTEMA ────────────────────────────────────────────────────────
function useWakeLock(isActive){
  const sentinel=useRef(null);
  const requestLock=useCallback(async()=>{
    try{if('wakeLock' in navigator){sentinel.current=await navigator.wakeLock.request('screen');}}
    catch(err){console.error("Wake Lock Error:",err);}
  },[]);
  useEffect(()=>{
    if(isActive)requestLock();
    else if(sentinel.current){sentinel.current.release().then(()=>{sentinel.current=null;});}
  },[isActive,requestLock]);
}

function useDayGPS(isActive){
  const[dayKm,setDayKm]=useState(()=>parseFloat(LS.get(K.DAYGPS,{})?.km||0));
  const lastRef=useRef(null);
  const distRef=useRef(parseFloat(LS.get(K.DAYGPS,{})?.km||0));
  useWakeLock(isActive);
  const start=useCallback(()=>{
    if(!navigator.geolocation)return;
    return navigator.geolocation.watchPosition(
      ({coords:{latitude:lat,longitude:lon}})=>{
        if(lastRef.current){
          const d=haversine(lastRef.current,{lat,lon});
          if(d>0.01){distRef.current+=d;setDayKm(distRef.current);LS.set(K.DAYGPS,{km:distRef.current,ts:Date.now()});}
        }
        lastRef.current={lat,lon};
      },
      (err)=>console.warn("GPS Error",err),
      {enableHighAccuracy:true,maximumAge:0,timeout:10000}
    );
  },[]);
  useEffect(()=>{
    let watchId;
    if(isActive){watchId=start();}
    return()=>{if(watchId)navigator.geolocation.clearWatch(watchId);};
  },[isActive,start]);
  return{dayKm,reset:()=>{distRef.current=0;setDayKm(0);LS.del(K.DAYGPS);}};
}

function useInstallApp(){
  const[prompt,setPrompt]=useState(null);
  const[installed,setInstalled]=useState(()=>window.matchMedia?.("(display-mode: standalone)").matches||window.navigator.standalone===true);
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(()=>{
    const ready=e=>{e.preventDefault();setPrompt(e);};
    const done=()=>{setInstalled(true);setPrompt(null);};
    window.addEventListener("beforeinstallprompt",ready);window.addEventListener("appinstalled",done);
    return()=>{window.removeEventListener("beforeinstallprompt",ready);window.removeEventListener("appinstalled",done);};
  },[]);
  const install=async()=>{
    if(prompt){await prompt.prompt();await prompt.userChoice;setPrompt(null);return;}
    if(isIOS)alert('En Safari toca Compartir, despues "Agregar a pantalla de inicio" y activa "Abrir como app".');
    else alert('Abre el menu de Chrome y toca "Instalar app" o "Agregar a pantalla principal".');
  };
  return{available:!installed,installed,install,isIOS};
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const Card=({children,s,onClick})=><div onClick={onClick} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:15,...s}}>{children}</div>;
const Lbl=({children,color=C.muted,s})=><div style={{fontSize:9,letterSpacing:"0.2em",textTransform:"uppercase",color,fontWeight:600,...s}}>{children}</div>;
const Big=({children,size=24,color=C.text,s})=><div className="B" style={{fontSize:size,fontWeight:800,color,lineHeight:1,...s}}>{children}</div>;
const Pill=({platform})=>{
  const cols={uber:"#00b4d8",didi:"#ff6b35",indrive:"#8bd450",particular:C.teal,beat:"#a855f7",otra:C.muted};
  const p=(platform||"uber").toLowerCase();
  return <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",color:cols[p]||C.muted,textTransform:"uppercase",background:`${cols[p]||C.muted}18`,padding:"2px 7px",borderRadius:4}}>{p}</span>;
};
const Btn=({children,onClick,color=C.accent,outline=false,sm=false,disabled=false,s,full})=>(
  <button onClick={onClick} disabled={disabled} style={{padding:sm?"7px 13px":"12px 18px",background:outline?"transparent":`${color}1e`,border:`${outline?1:2}px solid ${disabled?C.dim:color}`,borderRadius:9,color:disabled?C.dim:color,fontSize:sm?10:11,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,transition:"all .15s",width:full?"100%":undefined,opacity:disabled?.5:1,cursor:disabled?"not-allowed":"pointer",...s}}>{children}</button>
);
const Inp=({label,value,onChange,type="text",unit,placeholder="0"})=>(
  <div>
    {label&&<Lbl s={{marginBottom:5}}>{label}</Lbl>}
    <div style={{position:"relative"}}>
      <input type={type} step="any" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}
        style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 34px 9px 11px",color:"#fff",fontSize:15,fontFamily:"inherit",outline:"none"}}/>
      {unit&&<span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",fontSize:9,color:C.muted}}>{unit}</span>}
    </div>
  </div>
);
const Toast=({msg,type="ok"})=>msg?(
  <div style={{position:"fixed",top:"calc(16px + env(safe-area-inset-top))",left:"50%",transform:"translateX(-50%)",zIndex:99999,background:type==="ok"?"#00c9a7":"#ff4055",color:"#000",borderRadius:10,padding:"10px 20px",fontSize:12,fontWeight:700,letterSpacing:"0.08em",whiteSpace:"nowrap",boxShadow:"0 4px 24px rgba(0,0,0,.6)"}}>
    {type==="ok"?"✅":"⚠️"} {msg}
  </div>
):null;
const MarkdownMessage=({children})=><div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{table:({children})=><div className="table-wrap"><table>{children}</table></div>}}>{String(children||"")}</ReactMarkdown></div>;

function DateRangeControl({value,onChange}){
  const setPreset=id=>{
    if(id==="all")onChange({preset:id,from:"",to:""});
    if(id==="today")onChange({preset:id,from:shiftDate(0),to:shiftDate(0)});
    if(id==="yesterday")onChange({preset:id,from:shiftDate(-1),to:shiftDate(-1)});
    if(id==="week")onChange({preset:id,from:shiftDate(-6),to:shiftDate(0)});
    if(id==="month")onChange({preset:id,from:shiftDate(-29),to:shiftDate(0)});
    if(id==="custom")onChange({...value,preset:id});
  };
  return <div style={{marginBottom:12}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
      {[{id:"today",l:"Hoy"},{id:"yesterday",l:"Ayer"},{id:"week",l:"7 días"},{id:"month",l:"30 días"},{id:"all",l:"Todo"},{id:"custom",l:"Personalizar"}].map(p=><button key={p.id} onClick={()=>setPreset(p.id)} style={{padding:"8px 3px",background:value.preset===p.id?`${C.accent}1a`:"transparent",border:`1px solid ${value.preset===p.id?C.accent:C.border}`,borderRadius:7,color:value.preset===p.id?C.accent:C.muted,fontSize:9,fontWeight:700}}>{p.l}</button>)}
    </div>
    {value.preset==="custom"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:7}}>
      <div><Lbl s={{marginBottom:4}}>Desde</Lbl><input type="date" value={value.from} onChange={e=>onChange({...value,from:e.target.value})} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px",color:C.text}}/></div>
      <div><Lbl s={{marginBottom:4}}>Hasta</Lbl><input type="date" value={value.to} onChange={e=>onChange({...value,to:e.target.value})} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px",color:C.text}}/></div>
    </div>}
  </div>;
}
const UpgradeCard=({monthlyTripsCount=0,onUpgrade=openUpgrade,s})=>(
  <div style={{background:`${C.accent}12`,border:`1px solid ${C.accent}3d`,borderRadius:12,padding:"12px 13px",display:"flex",alignItems:"center",gap:12,...s}}>
    <div style={{flex:1}}>
      <div className="B" style={{fontSize:17,fontWeight:800,color:C.accent,letterSpacing:1}}>RUTAFLOW PRO</div>
      <div style={{fontSize:11,color:C.text,lineHeight:1.45,marginTop:3}}>
        {monthlyTripsCount}/{FREE_MONTHLY_TRIP_LIMIT} viajes gratis este mes. Pro desbloquea GPS, Foto IA, asesor IA e historial ilimitado.
      </div>
    </div>
    <button onClick={onUpgrade} style={{background:C.accent,color:"#000",borderRadius:8,padding:"9px 11px",fontSize:10,fontWeight:900,letterSpacing:"0.12em"}}>VER PRO</button>
  </div>
);

// ─── MODAL: DETALLE / EDICIÓN DE VIAJE ────────────────────────────────────────
function TripDetail({trip,cfg,onClose,onSave,onDelete}){
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({
    fare:String(trip.fare||""),platform:trip.platform||"uber",
    pickup_km:String(trip.pickup_km||""),pickup_min:String(trip.pickup_min||""),
    dest_km:String(trip.dest_km||""),dest_min:String(trip.dest_min||""),
    gps_km:String(trip.gps_km||""),gps_min:String(trip.gps_min||""),
    occurred_at:localDateTime(trip.end_time||trip.created_at),
  });
  const[saving,setSaving]=useState(false);
  const setF=(k,v)=>setForm(p=>({...p,[k]:v}));

  const handleSave=async()=>{
    setSaving(true);
    await onSave(trip.id,{
      fare:parseFloat(form.fare)||0,platform:form.platform,
      pickup_km:parseFloat(form.pickup_km)||0,pickup_min:parseFloat(form.pickup_min)||0,
      dest_km:parseFloat(form.dest_km)||0,dest_min:parseFloat(form.dest_min)||0,
      gps_km:parseFloat(form.gps_km)||0,gps_min:parseFloat(form.gps_min)||0,
      date:form.occurred_at.split("T")[0],end_time:new Date(form.occurred_at).toISOString(),
    });
    setSaving(false);
    setEditing(false);
  };

  const c=calcTrip(editing?form:trip,cfg);
  const good=c.nph>=cfg.targetHourlyRate,ok=c.nph>=cfg.targetHourlyRate*.75;
  const V=good?{col:C.teal,lbl:"✅ Excelente viaje"}:ok?{col:C.accent,lbl:"⚠️ Aceptable"}:{col:C.danger,lbl:"❌ No rentable"};
  const rows=[
    {l:"Tarifa bruta",v:fmtMXN(c.fare),c:C.text},
    {l:`Comisión ${platformInfo(cfg,editing?form.platform:trip.platform).name} (${platformCommission(cfg,editing?form.platform:trip.platform)}%)`,v:`-${fmtMXN(c.fee)}`,c:C.danger},
    {l:`Gas · ${fmt(c.km,1)}km ÷ ${cfg.kmPerLiter}km/L × $${cfg.gasPricePerLiter}`,v:`-${fmtMXN(c.gas)}`,c:C.danger},
    ...(c.fx>0?[{l:"Costos fijos amortizados",v:`-${fmtMXN(c.fx)}`,c:C.danger}]:[]),
    {l:"GANANCIA NETA",v:fmtMXN(c.net),c:c.net>=0?C.teal:C.danger,bold:true},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="su"
        style={{background:C.card,borderTop:`2px solid ${C.bord2}`,borderRadius:"20px 20px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"18px 18px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:30,height:3,background:C.bord2,borderRadius:4,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <Big size={19} color={C.accent} s={{letterSpacing:1}}>{editing?"EDITAR VIAJE":"DESGLOSE DEL VIAJE"}</Big>
              <div style={{fontSize:10,color:C.muted,marginTop:3,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {fmtDate(trip.end_time||trip.created_at||trip.timestamp)} · <Pill platform={editing?form.platform:trip.platform}/>
                {trip.start_time&&<span>{fmtHour(trip.start_time)}</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              {!editing&&<button onClick={()=>setEditing(true)} style={{color:C.accent,padding:4}}><SVG d={IC.edit} size={16} color={C.accent}/></button>}
              <button onClick={onClose} style={{color:C.muted,fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
            </div>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"14px 18px 0",WebkitOverflowScrolling:"touch"}}>
          {editing?(
            <div>
              <Lbl s={{marginBottom:7}}>Plataforma</Lbl>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
                {platformList(cfg).filter(p=>p.enabled!==false||p.id===form.platform).map(p=>(
                  <button key={p.id} onClick={()=>setF("platform",p.id)} style={{padding:"7px 4px",background:form.platform===p.id?`${C.accent}1e`:"transparent",border:`1px solid ${form.platform===p.id?C.accent:C.border}`,borderRadius:7,color:form.platform===p.id?C.accent:C.muted,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>{p.name}</button>
                ))}
              </div>
              <div style={{marginBottom:12}}><Lbl s={{marginBottom:5}}>Fecha y hora del viaje</Lbl><input type="datetime-local" value={form.occurred_at} onChange={e=>setF("occurred_at",e.target.value)} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px",color:C.text}}/></div>
              <Lbl s={{marginBottom:7}}>Tarifa (MXN)</Lbl>
              <input type="number" step="any" value={form.fare} onChange={e=>setF("fare",e.target.value)}
                onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}
                style={{width:"100%",background:"#0a0b14",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.accent,fontSize:36,fontFamily:"inherit",fontWeight:700,outline:"none",textAlign:"center",marginBottom:14}}/>
              <Lbl s={{marginBottom:7}}>Recolección</Lbl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                <Inp label="km" type="number" value={form.pickup_km} onChange={v=>setF("pickup_km",v)} unit="km"/>
                <Inp label="min" type="number" value={form.pickup_min} onChange={v=>setF("pickup_min",v)} unit="min"/>
              </div>
              <Lbl s={{marginBottom:7}}>Destino</Lbl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                <Inp label="km" type="number" value={form.dest_km} onChange={v=>setF("dest_km",v)} unit="km"/>
                <Inp label="min" type="number" value={form.dest_min} onChange={v=>setF("dest_min",v)} unit="min"/>
              </div>
              <Lbl s={{marginBottom:7}}>GPS registrado</Lbl>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                <Inp label="km GPS" type="number" value={form.gps_km} onChange={v=>setF("gps_km",v)} unit="km"/>
                <Inp label="min GPS" type="number" value={form.gps_min} onChange={v=>setF("gps_min",v)} unit="min"/>
              </div>
              <div style={{background:`${V.col}10`,border:`1px solid ${V.col}33`,borderRadius:11,padding:"12px 14px",marginBottom:14}}>
                <div className="B" style={{fontSize:14,color:V.col,marginBottom:8}}>{V.lbl}</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                  {[{l:"NETO",v:fmtMXN(c.net),c:c.net>=0?C.teal:C.danger},{l:"$/HORA",v:fmtMXN(c.nph),c:V.col},{l:"$/KM",v:fmtMXN(c.npk),c:C.muted}].map(({l,v,c:col})=>(
                    <div key={l} style={{textAlign:"center"}}><Lbl s={{marginBottom:3}}>{l}</Lbl><Big size={14} color={col}>{v}</Big></div>
                  ))}
                </div>
              </div>
            </div>
          ):(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div><Big size={32} color={V.col}>{fmtMXN(c.net)}</Big><div style={{fontSize:10,color:V.col,marginTop:3}}>{V.lbl}</div></div>
                <div style={{textAlign:"right"}}><Big size={20}>{fmtMXN(c.fare)}</Big><Lbl s={{marginTop:3}}>tarifa bruta</Lbl></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:14}}>
                {[{l:"Duración",v:`${c.min.toFixed(0)} min`,c:C.text},{l:"Distancia",v:`${fmt(c.km,1)} km`,c:C.text},{l:"$/hora",v:fmtMXN(c.nph),c:good?C.teal:ok?C.accent:C.danger},{l:"$/km",v:fmtMXN(c.npk),c:C.text},{l:"% neto",v:fmtPct(c.pct),c:c.pct>40?C.teal:C.accent},{l:"Gas",v:fmtMXN(c.gas),c:C.danger}].map(({l,v,c:col})=>(
                  <div key={l} style={{background:C.card2,borderRadius:9,padding:"9px 11px"}}><Lbl s={{marginBottom:4}}>{l}</Lbl><Big size={15} color={col}>{v}</Big></div>
                ))}
              </div>
              <div style={{marginBottom:14}}>
                {rows.map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.muted,flex:1,paddingRight:8}}>{r.l}</div>
                    <div className={r.bold?"B":""} style={{fontSize:r.bold?17:13,color:r.c,fontWeight:r.bold?800:600}}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"12px 18px 30px",flexShrink:0,borderTop:`1px solid ${C.border}`}}>
          {editing?(
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:9}}>
              <Btn onClick={()=>setEditing(false)} color={C.muted} outline>Cancelar</Btn>
              <Btn full onClick={handleSave} disabled={saving}>
                {saving?<div className="sp" style={{width:14,height:14,border:`2px solid ${C.dim}`,borderTopColor:C.accent,borderRadius:"50%"}}/>:<SVG d={IC.check} size={13} color={C.accent}/>}
                {saving?"Guardando...":"Guardar"}
              </Btn>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <Btn onClick={()=>setEditing(true)} color={C.accent} outline sm><SVG d={IC.edit} size={12} color={C.accent}/>Editar</Btn>
              <Btn onClick={()=>{if(window.confirm("¿Eliminar este viaje?"))onDelete(trip.id);}} color={C.danger} outline sm><SVG d={IC.trash} size={12} color={C.danger}/>Borrar</Btn>
              <Btn onClick={onClose} color={C.muted} outline sm>Cerrar</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: NUEVO VIAJE ───────────────────────────────────────────────────────
const DRAFT0={fare:"",pickup_km:"",pickup_min:"",dest_km:"",dest_min:"",platform:"uber",gps_km:null,gps_min:null,mode:"manual",phase:0,gpsOn:false,gpsStartMs:null,gpsDistKm:0};

function TripModal({cfg,saveTrip,activeDay,onClose,isPro,onUpgrade=openUpgrade}){
  const draft=LS.get(K.DRAFT,DRAFT0);
  const[trip,setTrip]=useState(draft);
  const[mode,setMode]=useState(draft.mode||"manual");
  const[phase,setPhase]=useState(draft.phase||0);
  const[gpsOn,setGpsOn]=useState(false);
  const[gpsMs,setGpsMs]=useState(draft.gpsOn&&draft.gpsStartMs?Date.now()-draft.gpsStartMs:0);
  const[gpsStatus,setGpsStatus]=useState(draft.gps_km?`✅ ${fmt(draft.gps_km,2)} km · ${fmt(draft.gps_min,0)} min`:"");
  const[proc,setProc]=useState(false);
  const[saving,setSaving]=useState(false);
  const[toast,setToast]=useState(null);

  const watchRef=useRef(null),timerRef=useRef(null),startRef=useRef(null);
  const distRef=useRef(parseFloat(draft.gpsDistKm)||0),lastRef=useRef(null);
  const fileRef=useRef();

  useEffect(()=>{
    if(draft.gpsOn&&draft.gpsStartMs){
      startRef.current=draft.gpsStartMs;
      distRef.current=parseFloat(draft.gpsDistKm)||0;
      _activateGPS(false);
    }
  },[]);

  useEffect(()=>()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(timerRef.current);
  },[]);

  const persist=(updates)=>{const m={...LS.get(K.DRAFT,DRAFT0),...updates};LS.set(K.DRAFT,m);};
  const setF=(k,v)=>setTrip(p=>{const n={...p,[k]:v};persist(n);return n;});
  const setModeP=m=>{setMode(m);persist({mode:m});};
  const setPhaseP=p=>{setPhase(p);persist({phase:p});};
  const toast_=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};

  const _activateGPS=(isNew=true)=>{
    if(!navigator.geolocation){setGpsStatus("GPS no disponible");return;}
    if(isNew){distRef.current=0;lastRef.current=null;startRef.current=Date.now();}
    setGpsOn(true);
    clearInterval(timerRef.current);
    timerRef.current=setInterval(()=>{
      setGpsMs(Date.now()-startRef.current);
      persist({gpsDistKm:distRef.current});
    },1000);
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current=navigator.geolocation.watchPosition(
      ({coords:{latitude:lat,longitude:lon}})=>{
        if(lastRef.current){const d=haversine(lastRef.current,{lat,lon});if(d>0.005)distRef.current+=d;}
        lastRef.current={lat,lon};
        setGpsStatus(`📍 ${distRef.current.toFixed(2)} km`);
      },
      ()=>setGpsStatus("⚠️ Error GPS — verifica permisos"),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000}
    );
  };

  const startGPS=()=>{
    if(!isPro){onUpgrade();return;}
    persist({gpsOn:true,gpsStartMs:Date.now(),gpsDistKm:0});setGpsStatus("📍 Buscando señal GPS...");_activateGPS(true);
  };
  const stopGPS=()=>{
    if(watchRef.current)navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(timerRef.current);
    const mins=((Date.now()-startRef.current)/60000).toFixed(1);
    const km=distRef.current.toFixed(2);
    setGpsOn(false);
    setGpsStatus(`✅ ${km} km · ${mins} min`);
    setTrip(p=>{const n={...p,gps_km:km,gps_min:mins};persist({...n,gpsOn:false});return n;});
  };

  const handlePhoto=async e=>{
    if(!isPro){onUpgrade();return;}
    const file=e.target.files[0];if(!file)return;
    setProc(true);
    try{
        const b64=await imageToDataUrl(file);
        const raw=await callGroq("vision",[{role:"user",content:[
          {type:"image_url",image_url:{url:b64}},
          {type:"text",text:"Extrae los datos visibles de este viaje."}
        ]}],300);
        const match=raw.match(/\{[\s\S]*\}/);
        const parsed=JSON.parse(match?match[0]:"{}");
        if(!parsed.fare&&!parsed.dest_km)throw new Error("No se detectaron datos");
        setTrip(p=>{const n={...p,fare:String(parsed.fare||""),pickup_km:String(parsed.pickup_km||""),pickup_min:String(parsed.pickup_min||""),dest_km:String(parsed.dest_km||""),dest_min:String(parsed.dest_min||"")};persist(n);return n;});
        setModeP("manual");setPhaseP(parsed.dest_km||parsed.dest_min?1:0);toast_("Captura analizada ✓");
    }catch(err){toast_("IA: "+err.message,"err");}
    setProc(false);
  };

  const handleSave=async()=>{
    if(!trip.fare||saving)return;
    setSaving(true);
    const ok=await saveTrip({
      fare:parseFloat(trip.fare)||0,platform:trip.platform||"uber",
      pickup_km:parseFloat(trip.pickup_km)||0,pickup_min:parseFloat(trip.pickup_min)||0,
      dest_km:parseFloat(trip.dest_km)||0,dest_min:parseFloat(trip.dest_min)||0,
      gps_km:parseFloat(trip.gps_km)||0,gps_min:parseFloat(trip.gps_min)||0,
      date:today(),end_time:new Date().toISOString(),day_id:activeDay?.id||null,
    });
    setSaving(false);
    if(ok){LS.del(K.DRAFT);onClose();}
    else toast_("Error al guardar. Intenta de nuevo.","err");
  };

  const c=calcTrip(trip,cfg);
  const hasData=trip.fare&&(trip.dest_km||trip.dest_min||(parseFloat(trip.gps_km)>0));
  const V=c.nph>=cfg.targetHourlyRate?{col:C.teal,lbl:"✅ Excelente"}:c.nph>=cfg.targetHourlyRate*.75?{col:C.accent,lbl:"⚠️ Aceptable"}:{col:C.danger,lbl:"❌ No conviene"};
  const mBtn=id=>({padding:"8px 4px",borderRadius:8,fontSize:10,fontWeight:600,fontFamily:"inherit",background:mode===id?`${C.teal}1e`:"transparent",border:`1px solid ${mode===id?C.teal:C.border}`,color:mode===id?C.teal:C.muted});

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:9999,display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 10px 80px 10px"}}>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div className="su" style={{background:C.card,border:`1px solid ${C.bord2}`,borderRadius:"24px",maxHeight:"calc(100vh - 160px)",display:"flex",flexDirection:"column",width:"100%",overflow:"hidden",boxShadow:"0px -4px 20px rgba(0,0,0,0.2)"}}>
        <div style={{padding:"16px 18px 0",flexShrink:0}}>
          <div style={{width:30,height:3,background:C.bord2,borderRadius:4,margin:"0 auto 13px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <Big size={19} color={C.accent} s={{letterSpacing:1}}>NUEVO VIAJE</Big>
            <button onClick={onClose} style={{color:C.muted,fontSize:20,lineHeight:1,padding:"4px 8px"}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:10}}>
            {platformList(cfg).filter(p=>p.enabled!==false||p.id===trip.platform).map(p=>(
              <button key={p.id} onClick={()=>setF("platform",p.id)} style={{padding:"7px 4px",background:trip.platform===p.id?`${C.accent}1e`:"transparent",border:`1px solid ${trip.platform===p.id?C.accent:C.border}`,borderRadius:7,color:trip.platform===p.id?C.accent:C.muted,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>{p.name}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:10}}>
            {[{id:"manual",l:"✍️ Manual"},{id:"gps",l:"📍 GPS"},{id:"photo",l:"📸 Foto IA"}].map(m=>(
              <button key={m.id} onClick={()=>setModeP(m.id)} style={mBtn(m.id)}>{m.l}</button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 18px",WebkitOverflowScrolling:"touch"}}>
          <div style={{marginBottom:12}}>
            <Lbl s={{marginBottom:5}}>💰 Tarifa del viaje (MXN)</Lbl>
            <input type="number" step="any" value={trip.fare} onChange={e=>setF("fare",e.target.value)} placeholder="0.00"
              onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}
              style={{width:"100%",background:"#0a0b14",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.accent,fontSize:38,fontFamily:"inherit",fontWeight:700,outline:"none",textAlign:"center"}}/>
          </div>
          {mode==="gps"&&(
            <div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:12,padding:15,marginBottom:12}}>
              <Lbl s={{marginBottom:10}}>Rastreo GPS en tiempo real</Lbl>
              {!isPro&&<UpgradeCard onUpgrade={onUpgrade} s={{marginBottom:12}}/>}
              {gpsOn&&<div className="B" style={{fontSize:46,fontWeight:900,color:C.teal,textAlign:"center",marginBottom:8}}>{fmtClock(gpsMs)}</div>}
              {gpsStatus&&<div style={{fontSize:13,color:gpsOn?C.teal:C.muted,textAlign:"center",marginBottom:10}}>{gpsStatus}</div>}
              {!gpsOn?(
                <Btn full onClick={startGPS} color={C.teal}><SVG d={IC.gps} size={13} color={C.teal}/>Iniciar GPS</Btn>
              ):(
                <Btn full onClick={stopGPS} color={C.danger}><SVG d={IC.stop} size={13} color={C.danger} fill={C.danger}/>Finalizar GPS</Btn>
              )}
              {trip.gps_km&&!gpsOn&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginTop:10}}>
                  <div style={{background:C.card,borderRadius:8,padding:"8px 11px"}}><Lbl s={{marginBottom:3}}>GPS km</Lbl><Big size={17} color={C.teal}>{fmt(trip.gps_km,2)} km</Big></div>
                  <div style={{background:C.card,borderRadius:8,padding:"8px 11px"}}><Lbl s={{marginBottom:3}}>Tiempo</Lbl><Big size={17} color={C.teal}>{fmt(trip.gps_min,0)} min</Big></div>
                </div>
              )}
            </div>
          )}
          {mode==="manual"&&(
            <div style={{marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                {[{id:0,l:"📍 Recolección"},{id:1,l:"🏁 Destino"}].map(ph=>(
                  <button key={ph.id} onClick={()=>setPhaseP(ph.id)} style={{padding:"8px",background:phase===ph.id?`${C.accent}1a`:"transparent",border:`1px solid ${phase===ph.id?C.accent:C.border}`,borderRadius:8,color:phase===ph.id?C.accent:C.muted,fontSize:10,fontWeight:600}}>{ph.l}</button>
                ))}
              </div>
              {phase===0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><Inp label="km para recoger" type="number" value={trip.pickup_km} onChange={v=>setF("pickup_km",v)} unit="km"/><Inp label="min para recoger" type="number" value={trip.pickup_min} onChange={v=>setF("pickup_min",v)} unit="min"/></div>}
              {phase===1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><Inp label="km al destino" type="number" value={trip.dest_km} onChange={v=>setF("dest_km",v)} unit="km"/><Inp label="min al destino" type="number" value={trip.dest_min} onChange={v=>setF("dest_min",v)} unit="min"/></div>}
            </div>
          )}
          {mode==="photo"&&(
            <div style={{marginBottom:12}}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
              {!isPro&&<UpgradeCard onUpgrade={onUpgrade} s={{marginBottom:12}}/>}
              {proc?(
                <div style={{textAlign:"center",padding:"28px 0"}}>
                  <div className="sp" style={{width:28,height:28,border:`2px solid ${C.border}`,borderTopColor:C.accent,borderRadius:"50%",margin:"0 auto 10px"}}/>
                  <Lbl>Analizando con IA...</Lbl>
                </div>
              ):(
                <button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:"26px 18px",background:`${C.accent}0a`,border:`2px dashed ${C.accent}44`,borderRadius:12,color:C.accent,fontSize:11,letterSpacing:"0.1em",fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                  <SVG d={IC.cam} size={24} color={C.accent}/>
                  SUBE CAPTURA DE UBER / DIDI
                  <span style={{fontSize:10,color:C.muted,fontWeight:400,textTransform:"none",letterSpacing:0}}>La IA extrae tarifa, km y tiempo</span>
                </button>
              )}
            </div>
          )}
          {hasData&&(
            <div style={{background:`${V.col}10`,border:`1px solid ${V.col}33`,borderRadius:11,padding:"12px 14px",marginBottom:12}}>
              <div className="B" style={{fontSize:15,color:V.col,marginBottom:8}}>{V.lbl}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {[{l:"NETO",v:fmtMXN(c.net),c:c.net>=0?C.teal:C.danger},{l:"POR HORA",v:fmtMXN(c.nph),c:V.col},{l:"POR KM",v:fmtMXN(c.npk),c:C.muted}].map(({l,v,c:col})=>(
                  <div key={l} style={{textAlign:"center"}}><Lbl s={{marginBottom:3}}>{l}</Lbl><Big size={15} color={col}>{v}</Big></div>
                ))}
              </div>
            </div>
          )}
          <div style={{height:8}}/>
        </div>
        <div style={{padding:"12px 18px 20px",flexShrink:0,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 2fr",gap:9}}>
          <Btn onClick={onClose} color={C.muted} outline>Cancelar</Btn>
          <Btn full onClick={handleSave} disabled={!trip.fare||gpsOn||saving}>
            {saving?<div className="sp" style={{width:14,height:14,border:`2px solid ${C.dim}`,borderTopColor:C.accent,borderRadius:"50%"}}/>:<SVG d={IC.check} size={13} color={!trip.fare||gpsOn?C.dim:C.accent}/>}
            {saving?"Guardando...":"Guardar viaje"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── REGISTRO OPERATIVO ───────────────────────────────────────────────────────
const OP0={type:"dead_km",km:"",amount:"",liters:"",tank_liters:"",odometer:"",fare:"",trip_km:"",platform:"didi",note:"",occurred_at:""};
function OperationModal({onClose,onSaveOperation,onUpdateOperation,onSaveTrip,initial,cfg}){
  const[form,setForm]=useState(()=>initial?{
    ...OP0,...initial,km:String(initial.km||""),amount:String(initial.amount||""),liters:String(initial.liters||""),tank_liters:String(initial.tank_liters||""),odometer:String(initial.odometer||""),occurred_at:localDateTime(initial.occurred_at||initial.created_at),
  }:{...OP0,occurred_at:localDateTime()});
  const[text,setText]=useState("");
  const[parsing,setParsing]=useState(false);
  const[saving,setSaving]=useState(false);
  const[listening,setListening]=useState(false);
  const[voiceError,setVoiceError]=useState("");
  const recRef=useRef(null);
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const TYPES=[
    {id:"trip",label:"Viaje",d:IC.trips},
    {id:"dead_km",label:"Sin pasaje",d:IC.road},
    {id:"refuel",label:"Gasolina",d:IC.fuel},
    {id:"tank_checkpoint",label:"Tanque",d:IC.gauge},
  ];
  const parse=async()=>{
    if(!text.trim()||parsing)return;
    if(recRef.current)recRef.current.stop();
    setParsing(true);
    try{
      const raw=await callGroq("parser",[{role:"user",content:text.trim()}],500);
      const data=parseJsonContent(raw);
      if(!TYPES.some(t=>t.id===data.type))throw new Error("No entendi el movimiento. Prueba con importe, km o litros.");
      const parsedPlatform=platformInfo(cfg,data.platform).id;
      const normalized={...data,platform:parsedPlatform,km:data.dead_km||data.km||0};
      setForm(p=>({...p,...Object.fromEntries(Object.entries(normalized).filter(([k])=>k!=="dead_km").map(([k,v])=>[k,v===0?"":String(v)])),type:data.type,occurred_at:p.occurred_at}));
    }catch(err){setVoiceError(err.message||"No pude interpretar el movimiento. Puedes llenar los campos manualmente.");}
    setParsing(false);
  };
  const listen=()=>{
    if(listening){recRef.current?.stop();return;}
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){setVoiceError("El dictado del navegador no esta disponible. Puedes escribir el movimiento.");return;}
    setVoiceError("");
    const base=text.trim();
    const rec=new Recognition();rec.lang="es-MX";rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=3;recRef.current=rec;
    rec.onstart=()=>setListening(true);
    rec.onend=()=>{setListening(false);recRef.current=null;};
    rec.onerror=e=>{setListening(false);recRef.current=null;setVoiceError(e.error==="not-allowed"?"Activa el permiso del microfono para RutaFlow.":"No se escucho con claridad. Intenta de nuevo o corrige el texto.");};
    rec.onresult=e=>{let heard="";for(let i=0;i<e.results.length;i++)heard+=`${e.results[i][0].transcript} `;setText(`${base}${base?" ":""}${heard.trim()}`);};
    rec.start();
  };
  const valid=form.type==="trip"?Number(form.fare)>0:Number(form.type==="dead_km"?form.km:form.type==="refuel"?(form.liters||form.amount):form.tank_liters)>0;
  const save=async()=>{
    if(!valid||saving)return;setSaving(true);
    let ok=false;
    const occurredAt=new Date(form.occurred_at||Date.now()).toISOString();
    if(form.type==="trip")ok=await onSaveTrip({fare:Number(form.fare)||0,dest_km:Number(form.trip_km)||0,platform:form.platform||"otra",date:form.occurred_at.split("T")[0],end_time:occurredAt});
    else{
      const payload={type:form.type,km:Number(form.km)||0,amount:Number(form.amount)||0,liters:Number(form.liters)||0,tank_liters:Number(form.tank_liters)||0,odometer:Number(form.odometer)||0,note:form.note||"",occurred_at:occurredAt,date:form.occurred_at.split("T")[0]};
      ok=initial?await onUpdateOperation(initial.id,payload):await onSaveOperation(payload);
    }
    setSaving(false);if(ok)onClose();
  };
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.76)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="su" style={{width:"100%",maxWidth:480,maxHeight:"92dvh",overflowY:"auto",background:C.card,border:`1px solid ${C.bord2}`,borderRadius:"14px 14px 0 0",padding:"15px 14px calc(18px + env(safe-area-inset-bottom))"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><Big size={23} color={C.accent}>{initial?"EDITAR MOVIMIENTO":"REGISTRO RAPIDO"}</Big><div style={{fontSize:10,color:C.muted,marginTop:3}}>Escribe, dicta o elige un movimiento</div></div><button onClick={onClose} aria-label="Cerrar"><SVG d={IC.close} color={C.muted}/></button></div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&parse()} placeholder='Ej. "Cargue 10 litros por $243.90"' style={{flex:1,minWidth:0,background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"11px",color:C.text,fontSize:12,outline:"none"}}/>
          <button onClick={listen} title={listening?"Detener dictado":"Dictar movimiento"} style={{width:42,height:42,border:`1px solid ${listening?C.danger:C.border}`,borderRadius:8,display:"grid",placeItems:"center",background:listening?`${C.danger}18`:C.card2}}><SVG d={listening?IC.stop:IC.mic} color={listening?C.danger:C.muted}/></button>
          <button onClick={parse} disabled={!text.trim()||parsing} style={{padding:"0 12px",border:`1px solid ${C.teal}`,borderRadius:8,color:C.teal,fontSize:10,fontWeight:700}}>{parsing?"...":"IA"}</button>
        </div>
        <div style={{fontSize:9,color:listening?C.teal:C.dim,lineHeight:1.45,marginBottom:voiceError?6:14}}>{listening?"Escuchando... puedes corregir el texto antes de enviarlo a IA.":"La IA prepara el registro. Tu confirmas antes de guardarlo."}</div>
        {voiceError&&<div style={{fontSize:10,color:C.danger,background:`${C.danger}10`,border:`1px solid ${C.danger}33`,borderRadius:7,padding:"8px 9px",marginBottom:12}}>{voiceError}</div>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:15}}>{TYPES.map(t=><button key={t.id} onClick={()=>set("type",t.id)} style={{minHeight:66,padding:"8px 3px",border:`1px solid ${form.type===t.id?C.accent:C.border}`,borderRadius:8,background:form.type===t.id?`${C.accent}12`:C.card2,color:form.type===t.id?C.accent:C.muted,fontSize:8,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}><SVG d={t.d} size={17} color={form.type===t.id?C.accent:C.muted}/>{t.label}</button>)}</div>
        {form.type==="trip"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}><Inp label="Tarifa" type="number" value={form.fare} onChange={v=>set("fare",v)} unit="$"/><Inp label="Distancia" type="number" value={form.trip_km} onChange={v=>set("trip_km",v)} unit="km"/><div style={{gridColumn:"1 / -1"}}><Lbl s={{marginBottom:5}}>Plataforma</Lbl><select value={form.platform} onChange={e=>set("platform",e.target.value)} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px",color:C.text}}>{platformList(cfg).filter(p=>p.enabled!==false||p.id===form.platform).map(p=><option key={p.id} value={p.id}>{p.name} · {p.commission}%</option>)}</select></div></div>}
        {form.type==="dead_km"&&<Inp label="Kilometros sin pasajero" type="number" value={form.km} onChange={v=>set("km",v)} unit="km"/>}
        {form.type==="refuel"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}><Inp label="Litros cargados" type="number" value={form.liters} onChange={v=>set("liters",v)} unit="L"/><Inp label="Importe pagado" type="number" value={form.amount} onChange={v=>set("amount",v)} unit="$"/></div>}
        {form.type==="tank_checkpoint"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}><Inp label="Litros estimados" type="number" value={form.tank_liters} onChange={v=>set("tank_liters",v)} unit="L"/><Inp label="Odometro opcional" type="number" value={form.odometer} onChange={v=>set("odometer",v)} unit="km"/></div>}
        <div style={{marginTop:10}}><Lbl s={{marginBottom:5}}>Fecha y hora reales</Lbl><input type="datetime-local" value={form.occurred_at} onChange={e=>set("occurred_at",e.target.value)} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 11px",color:C.text,fontSize:12}}/></div>
        <div style={{marginTop:10}}><Lbl s={{marginBottom:5}}>Nota opcional</Lbl><input value={form.note} onChange={e=>set("note",e.target.value)} placeholder="Zona, referencia o aclaracion" style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 11px",color:C.text,fontSize:12,outline:"none"}}/></div>
        <Btn full onClick={save} disabled={!valid||saving} color={C.teal} s={{marginTop:14}}><SVG d={IC.check} size={13} color={valid?C.teal:C.dim}/>{saving?"Guardando...":initial?"Guardar cambios":"Confirmar movimiento"}</Btn>
      </div>
    </div>
  );
}

function ClosureModal({closure,onClose}){
  const s=closure?.snapshot||closure||{};
  const rows=[
    ["Ingreso bruto",s.gross],["Comisiones",-(s.fee||0)],["Gasolina consumida",-(s.consumedGas||0)],["Utilidad operativa",s.net],["Flujo de efectivo",s.cash],
  ];
  return <div style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div className="su" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"90dvh",overflowY:"auto",background:C.card,border:`1px solid ${C.bord2}`,borderRadius:"16px 16px 0 0",padding:"17px 16px calc(22px + env(safe-area-inset-bottom))"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:15}}><div><Lbl s={{marginBottom:5}}>Cierre de jornada</Lbl><Big size={27} color={(s.net||0)>=0?C.teal:C.danger}>{fmtDate(closure.date)}</Big></div><button onClick={onClose}><SVG d={IC.close} color={C.muted}/></button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:14}}>
        {[{l:"Viajes",v:closure.trip_count||0},{l:"Duración",v:fmtClock(closure.total_ms||0)},{l:"Productivo",v:fmtPct(s.productivePct||closure.productive_pct||0)}].map(x=><div key={x.l} style={{background:C.card2,borderRadius:8,padding:"9px 7px",textAlign:"center"}}><Lbl s={{marginBottom:4}}>{x.l}</Lbl><Big size={16}>{x.v}</Big></div>)}
      </div>
      <Card s={{marginBottom:12}}>{rows.map(([l,v],i)=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<rows.length-1?`1px solid ${C.border}`:"none"}}><span style={{fontSize:11,color:C.muted}}>{l}</span><strong style={{color:i===3?((v||0)>=0?C.teal:C.danger):C.text}}>{fmtMXN(v||0)}</strong></div>)}</Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <Card s={{padding:11}}><Lbl s={{marginBottom:5}}>Km totales</Lbl><Big size={20}>{fmt(s.totalKm||closure.total_km,1)} km</Big></Card>
        <Card s={{padding:11}}><Lbl s={{marginBottom:5}}>Sin pasajero</Lbl><Big size={20} color={C.accent}>{fmt(s.deadKm||closure.dead_km,1)} km</Big></Card>
      </div>
      <div style={{fontSize:11,color:C.muted,lineHeight:1.55,background:`${C.accent}0b`,border:`1px solid ${C.accent}28`,borderRadius:9,padding:"10px 12px"}}>{(s.productivePct||0)<45?"Tu mayor oportunidad esta en reducir kilometros sin pasajero antes de buscar mas viajes.":(s.net||0)<0?"La jornada cerro en negativo: revisa comisiones, combustible y viajes de baja rentabilidad.":"Jornada positiva. Compara este cierre con tus mejores dias para repetir horarios y plataformas."}</div>
    </div>
  </div>;
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({cfg,trips,events,closures,activeDay,startDay,onEndDay,onNew,onQuick,dayKm:propDayKm,onSelect,onDeleteEvent,onEditEvent,onSelectClosure,isPro,monthlyTripsCount,onUpgrade}){
  const[elapsed,setElapsed]=useState(0);
  const[showAll,setShowAll]=useState(false);
  const timerRef=useRef(null);

  useEffect(()=>{
    if(activeDay?.running&&activeDay?.startTime){
      const tick=()=>setElapsed(Date.now()-activeDay.startTime);
      tick();timerRef.current=setInterval(tick,1000);
    }else{clearInterval(timerRef.current);setElapsed(0);}
    return()=>clearInterval(timerRef.current);
  },[activeDay?.running,activeDay?.startTime]);

  useEffect(()=>{
    const onVisible=()=>{
      if(document.visibilityState==="visible"&&activeDay?.running&&activeDay?.startTime){
        setElapsed(Date.now()-activeDay.startTime);
      }
    };
    document.addEventListener("visibilitychange",onVisible);
    return()=>document.removeEventListener("visibilitychange",onVisible);
  },[activeDay]);

  const todayTrips=trips
    .filter(t=>(t.date||"")===today())
    .sort((a,b)=>new Date(b.end_time||b.created_at||0)-new Date(a.end_time||a.created_at||0));

  const stats=operationalSummary(trips,events,cfg,today(),propDayKm);
  const tank=estimateTank(trips,events,cfg);
  const todayEvents=events.filter(e=>(e.date||"")===today()).sort((a,b)=>eventMs(b)-eventMs(a));
  const dayNph=elapsed>0?stats.net/(elapsed/3600000):0;
  const deadKm=stats.deadKm;
  const visibleTrips=showAll?todayTrips:todayTrips.slice(0,4);

  return(
    <div className="fu" style={{padding:"15px 14px 90px"}}>
      {!isPro&&<UpgradeCard monthlyTripsCount={monthlyTripsCount} onUpgrade={onUpgrade} s={{marginBottom:13}}/>}
      <div style={{marginBottom:14}}>
        <Lbl s={{marginBottom:3}}>Ganancia neta hoy</Lbl>
        <div className="B" style={{fontSize:54,fontWeight:900,color:stats.net>=0?C.teal:C.danger,lineHeight:1}}>{fmtMXN(stats.net)}</div>
        <div style={{fontSize:11,color:C.muted,marginTop:5}}>
          {todayTrips.length} viajes · {fmt(stats.productivePct,0)}% de km productivos · {stats.min.toFixed(0)} min
        </div>
      </div>

      <Card s={{marginBottom:13}}>
        <Lbl s={{marginBottom:11}}>Estado de jornada</Lbl>
        {!activeDay?(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Btn full onClick={startDay} color={C.teal}><SVG d={IC.play} size={13} color={C.teal} fill={C.teal}/>Iniciar jornada</Btn>
            <Btn full onClick={onQuick} color={C.accent}><SVG d={IC.plus} size={13} color={C.accent}/>Registrar</Btn>
          </div>
        ):(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:11}}>
              <div>
                <div className="pu" style={{fontSize:9,color:C.danger,letterSpacing:"0.2em",marginBottom:3}}>● GRABANDO</div>
                <div className="B" style={{fontSize:40,fontWeight:900,color:C.teal,lineHeight:1}}>{fmtClock(elapsed)}</div>
                {elapsed>0&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>{fmtMXN(dayNph)}/hr efectivo en jornada</div>}
              </div>
              <div style={{textAlign:"right"}}>
                <Big size={28}>{todayTrips.length}</Big>
                <Lbl s={{marginTop:2}}>viajes hoy</Lbl>
              </div>
            </div>

            {(todayTrips.length>0||todayEvents.length>0)&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:11}}>
                {[{l:"Bruto",v:fmtMXN(stats.gross),c:C.text},{l:"Utilidad",v:fmtMXN(stats.net),c:stats.net>=0?C.teal:C.danger},{l:"Efectivo",v:fmtMXN(stats.cash),c:stats.cash>=0?C.text:C.danger},{l:"Gas usado",v:fmtMXN(stats.consumedGas),c:C.danger}].map(({l,v,c})=>(
                  <div key={l} style={{background:C.card2,borderRadius:8,padding:"8px 6px",textAlign:"center"}}><Lbl s={{marginBottom:3,fontSize:8}}>{l}</Lbl><Big size={13} color={c}>{v}</Big></div>
                ))}
              </div>
            )}

            {stats.totalKm>0&&(
              <div style={{background:`${C.accent}0a`,border:`1px solid ${C.accent}22`,borderRadius:9,padding:"9px 12px",marginBottom:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <SVG d={IC.road} size={14} color={C.accent}/>
                  <div>
                    <Lbl s={{fontSize:8,marginBottom:2}}>Km totales jornada</Lbl>
                    <div style={{fontSize:12,color:C.text}}>{fmt(stats.totalKm,1)} km · {fmt(stats.productivePct,0)}% productivos</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Lbl s={{fontSize:8,marginBottom:2}}>Km sin pasajero</Lbl>
                  <Big size={16} color={C.accent}>{fmt(deadKm,1)} km</Big>
                </div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <Btn full onClick={onNew} color={C.accent}><SVG d={IC.plus} size={13} color={C.accent}/>Nuevo viaje</Btn>
              <Btn full onClick={onQuick} color={C.teal}><SVG d={IC.mic} size={13} color={C.teal}/>Registro rapido</Btn>
            </div>
            <Btn full onClick={onEndDay} color={C.danger} outline><SVG d={IC.flag} size={12} color={C.danger}/>Terminar y ver cierre</Btn>
          </div>
        )}
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:13}}>
        <Card s={{padding:12}}>
          <Lbl s={{marginBottom:6}}>Tanque estimado</Lbl>
          <Big size={24} color={tank.statusColor}>{tank.liters===null?"--":`${fmt(tank.liters,1)} L`}</Big>
          <div style={{fontSize:11,color:tank.statusColor,marginTop:5,fontWeight:700}}>{tank.status}</div>
          <div style={{fontSize:9,color:C.muted,marginTop:3}}>{tank.rangeKm===null?tank.basis:`~${fmt(tank.rangeKm,0)} km · estimación ${tank.confidence}`}</div>
        </Card>
        <Card s={{padding:12}}>
          <Lbl s={{marginBottom:6}}>Gasolina comprada</Lbl>
          <Big size={24} color={C.accent}>{fmtMXN(stats.fuelPurchased)}</Big>
          <div style={{fontSize:10,color:C.muted,marginTop:5}}>{fmt(stats.litersPurchased,2)} L cargados hoy</div>
        </Card>
      </div>

      {todayEvents.length>0&&<Card s={{marginBottom:13}}>
        <Lbl s={{marginBottom:9}}>Movimientos de jornada</Lbl>
        {todayEvents.slice(0,8).map(e=>{
          const label=e.type==="dead_km"?`${fmt(e.km,1)} km sin pasajero`:e.type==="refuel"?`${fmt(e.liters,2)} L · ${fmtMXN(e.amount)}`:`Tanque ajustado a ${fmt(e.tank_liters,1)} L`;
          const icon=e.type==="dead_km"?IC.road:e.type==="refuel"?IC.fuel:IC.gauge;
          return <div key={e.id} onClick={()=>onEditEvent(e)} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}><SVG d={icon} size={15} color={C.accent}/><div style={{flex:1}}><div style={{fontSize:11,color:C.text}}>{label}</div><div style={{fontSize:9,color:C.dim,marginTop:2}}>{fmtHour(e.occurred_at)}{e.note?` · ${e.note}`:""}</div></div><button onClick={ev=>{ev.stopPropagation();onEditEvent(e);}} title="Editar movimiento"><SVG d={IC.edit} size={14} color={C.accent}/></button><button onClick={ev=>{ev.stopPropagation();onDeleteEvent(e.id);}} title="Eliminar movimiento"><SVG d={IC.trash} size={14} color={C.danger}/></button></div>;
        })}
      </Card>}

      {closures?.length>0&&<Card s={{marginBottom:13}}>
        <Lbl s={{marginBottom:9}}>Cierres recientes</Lbl>
        {closures.slice(0,3).map(cl=>{const s=cl.snapshot||cl;return <button key={cl.id} onClick={()=>onSelectClosure(cl)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`,color:C.text,textAlign:"left"}}><div><div style={{fontSize:11}}>{fmtDate(cl.date)}</div><div style={{fontSize:9,color:C.muted,marginTop:2}}>{cl.trip_count||0} viajes · {fmt(s.totalKm||cl.total_km,1)} km · {fmtPct(s.productivePct||cl.productive_pct||0)} productivo</div></div><Big size={18} color={(s.net||cl.total_net||0)>=0?C.teal:C.danger}>{fmtMXN(s.net||cl.total_net||0)}</Big></button>})}
      </Card>}

      {todayTrips.length>0&&(
        <Card>
          <Lbl s={{marginBottom:11}}>Viajes de hoy — <span style={{color:C.dim}}>toca para desglose</span></Lbl>
          {visibleTrips.map(t=>{
            const c=calcTrip(t,cfg);
            const col=c.nph>=cfg.targetHourlyRate?C.teal:c.nph>=cfg.targetHourlyRate*.75?C.accent:C.danger;
            return(
              <div key={t.id} onClick={()=>onSelect(t)}
                style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                    <Pill platform={t.platform}/>
                    {t.gps_km>0&&<span style={{fontSize:9,color:C.teal}}>📍GPS</span>}
                    {t.end_time&&<span style={{fontSize:9,color:C.dim}}>{fmtHour(t.end_time)}</span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>{fmtMXN(t.fare)} · {fmt(c.km,1)}km · {c.min.toFixed(0)}min</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <Big size={18} color={col}>{fmtMXN(c.net)}</Big>
                  <Lbl s={{marginTop:2}}>{fmtMXN(c.nph)}/hr</Lbl>
                </div>
              </div>
            );
          })}
          {todayTrips.length>4&&(
            <button onClick={()=>setShowAll(!showAll)} style={{width:"100%",padding:"10px 0 2px",fontSize:11,color:C.accent,fontWeight:600,letterSpacing:"0.1em",textAlign:"center"}}>
              {showAll?`▲ Ver menos`:`▼ Ver ${todayTrips.length-4} más`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── TRIPS TAB ────────────────────────────────────────────────────────────────
function TripsTab({cfg,trips,saveTrip,updateTrip,deleteTrip,onSelect,onNew}){
  const[range,setRange]=useState({preset:"all",from:"",to:""});
  const filtered=trips.filter(t=>inDateRange(t,range)).sort((a,b)=>new Date(b.end_time||b.created_at||0)-new Date(a.end_time||a.created_at||0));

  return(
    <div className="fu" style={{padding:"15px 14px 90px"}}>
      <div className="B" style={{fontSize:22,fontWeight:800,color:C.accent,marginBottom:13,letterSpacing:1}}>HISTORIAL</div>
      <DateRangeControl value={range} onChange={setRange}/>
      <Btn full onClick={onNew} s={{marginBottom:11}}><SVG d={IC.plus} size={13} color={C.accent}/>Agregar viaje</Btn>
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"48px 0",color:C.dim}}><div style={{fontSize:34,marginBottom:9}}>🚗</div><Lbl>Sin viajes registrados</Lbl></div>
      ):filtered.map(t=>{
        const c=calcTrip(t,cfg);
        const col=c.nph>=cfg.targetHourlyRate?C.teal:c.nph>=cfg.targetHourlyRate*.75?C.accent:C.danger;
        return(
          <Card key={t.id} s={{marginBottom:7,cursor:"pointer"}} onClick={()=>onSelect(t)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                  <Pill platform={t.platform}/>
                  {t.gps_km>0&&<span style={{fontSize:9,color:C.teal}}>📍GPS</span>}
                  <span style={{fontSize:9,color:C.muted}}>{fmtDate(t.end_time||t.created_at)}</span>
                  {t.end_time&&<span style={{fontSize:9,color:C.dim}}>{fmtHour(t.end_time)}</span>}
                </div>
                <div style={{fontSize:12,color:C.text}}>{fmtMXN(t.fare)} · {fmt(c.km,1)}km · {c.min.toFixed(0)} min</div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>Gas: {fmtMXN(c.gas)} · Fee: {fmtMXN(c.fee)}</div>
              </div>
              <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                <Big size={19} color={col}>{fmtMXN(c.net)}</Big>
                <Lbl>{fmtMXN(c.nph)}/hr</Lbl>
              </div>
            </div>
            <div style={{marginTop:9,height:3,borderRadius:3,background:C.card2,overflow:"hidden"}}>
              <div style={{width:`${Math.max(0,Math.min(100,c.pct))}%`,height:"100%",background:col,borderRadius:3}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
              <Lbl>{fmtPct(Math.max(0,c.pct))} neto</Lbl><Lbl>Toca para editar / desglose →</Lbl>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────
function StatsTab({cfg,trips,events}){
  const[range,setRange]=useState({preset:"month",from:shiftDate(-29),to:shiftDate(0)});
  const filtered=trips.filter(t=>inDateRange(t,range));
  const filteredEvents=events.filter(e=>inDateRange(e,range));
  const dates=[...new Set([...filtered.map(dateOf),...filteredEvents.map(dateOf)])].sort();
  const chart=dates.map(date=>{const d=operationalSummary(trips,events,cfg,date);return{date,...d,trips:trips.filter(t=>dateOf(t)===date).length,nph:d.min>0?d.net/(d.min/60):0,label:new Date(`${date}T12:00:00`).toLocaleDateString("es-MX",{day:"numeric",month:"short"})};});
  const tot=chart.reduce((a,d)=>({net:a.net+d.net,km:a.km+d.totalKm,gas:a.gas+d.consumedGas,gross:a.gross+d.gross,min:a.min+d.min,deadKm:a.deadKm+d.deadKm,fuelPurchased:a.fuelPurchased+d.fuelPurchased,cash:a.cash+d.cash,productiveKm:a.productiveKm+d.km}),{net:0,km:0,gas:0,gross:0,min:0,deadKm:0,fuelPurchased:0,cash:0,productiveKm:0});
  const byPlat={};filtered.forEach(t=>{const p=t.platform||"uber";if(!byPlat[p])byPlat[p]={name:p.toUpperCase(),net:0,count:0};byPlat[p].net+=calcTrip(t,cfg).net;byPlat[p].count++;});
  const platData=Object.values(byPlat);const PIE=[C.accent,C.teal,"#a855f7","#f43f5e"];
  const byHour={};filtered.forEach(t=>{const h=new Date(t.end_time||t.created_at||0).getHours();if(!byHour[h])byHour[h]={hour:h,net:0,count:0};byHour[h].net+=calcTrip(t,cfg).net;byHour[h].count++;});
  const hourData=Object.values(byHour).sort((a,b)=>a.hour-b.hour).map(d=>({...d,label:`${d.hour}h`,avg:d.count>0?d.net/d.count:0}));
  const bestH=hourData.length>0?hourData.reduce((b,d)=>d.avg>b.avg?d:b):null;
  const bestD=chart.length>0?chart.reduce((b,d)=>d.net>b.net?d:b):null;
  const Tip=({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:11}}><div style={{color:C.muted,marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: {fmtMXN(p.value)}</div>)}</div>;};

  return(
    <div className="fu" style={{padding:"15px 14px 90px"}}>
      <div className="B" style={{fontSize:22,fontWeight:800,color:C.accent,marginBottom:13,letterSpacing:1}}>ESTADÍSTICAS</div>
      <DateRangeControl value={range} onChange={setRange}/>
      {filtered.length===0&&filteredEvents.length===0?(
        <div style={{textAlign:"center",padding:"50px 0",color:C.dim}}><div style={{fontSize:34,marginBottom:9}}>📊</div><Lbl>Registra viajes para ver estadísticas</Lbl></div>
      ):<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:13}}>
          {[{l:"Utilidad operativa",v:fmtMXN(tot.net),c:tot.net>=0?C.teal:C.danger},{l:"Flujo de efectivo",v:fmtMXN(tot.cash),c:tot.cash>=0?C.text:C.danger},{l:"Viajes",v:filtered.length,c:C.text},{l:"Km totales",v:`${fmt(tot.km,0)} km`,c:C.accent},{l:"Km sin pasajero",v:`${fmt(tot.deadKm,0)} km`,c:tot.deadKm>tot.productiveKm?C.danger:C.accent},{l:"Km productivos",v:fmtPct(tot.km>0?tot.productiveKm/tot.km*100:0),c:C.teal},{l:"$/hora promedio",v:fmtMXN(tot.min>0?tot.net/(tot.min/60):0),c:C.accent},{l:"Gas consumida",v:fmtMXN(tot.gas),c:C.danger},{l:"Gas comprada",v:fmtMXN(tot.fuelPurchased),c:C.accent},{l:"Promedio/viaje",v:fmtMXN(filtered.length>0?tot.net/filtered.length:0),c:C.teal}].map(({l,v,c})=>(
            <Card key={l} s={{padding:"11px 13px"}}><Lbl s={{marginBottom:5}}>{l}</Lbl><Big size={21} color={c}>{v}</Big></Card>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:13}}>
          {bestD&&<div style={{background:`${C.accent}10`,border:`1px solid ${C.accent}33`,borderRadius:12,padding:"11px 13px"}}><Lbl s={{color:C.accent,marginBottom:6}}>🏆 Mejor día</Lbl><div style={{fontSize:11,color:C.text,marginBottom:4}}>{fmtDate(bestD.date)}</div><Big size={19} color={C.accent}>{fmtMXN(bestD.net)}</Big></div>}
          {bestH&&<div style={{background:`${C.teal}10`,border:`1px solid ${C.teal}33`,borderRadius:12,padding:"11px 13px"}}><Lbl s={{color:C.teal,marginBottom:6}}>⏰ Mejor hora</Lbl><div style={{fontSize:11,color:C.text,marginBottom:4}}>{bestH.hour}:00 – {bestH.hour+1}:00</div><Big size={19} color={C.teal}>{fmtMXN(bestH.avg)}/viaje</Big></div>}
        </div>
        <Card s={{marginBottom:11,padding:"13px 8px"}}>
          <Lbl s={{marginBottom:11,paddingLeft:6}}>Ganancia diaria (MXN)</Lbl>
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={chart} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/><XAxis dataKey="label" tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="net" name="neto $" radius={[4,4,0,0]}>{chart.map((e,i)=><Cell key={i} fill={e.net>=0?C.teal:C.danger}/>)}</Bar></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card s={{marginBottom:11,padding:"13px 8px"}}>
          <Lbl s={{marginBottom:11,paddingLeft:6}}>Km productivos vs sin pasajero</Lbl>
          <ResponsiveContainer width="100%" height={135}>
            <BarChart data={chart} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/><XAxis dataKey="label" tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip/><Bar dataKey="km" name="Con pasajero" stackId="km" fill={C.teal}/><Bar dataKey="deadKm" name="Sin pasajero" stackId="km" fill={C.accent} radius={[3,3,0,0]}/></BarChart>
          </ResponsiveContainer>
        </Card>
        {hourData.length>0&&<Card s={{marginBottom:11,padding:"13px 8px"}}>
          <Lbl s={{marginBottom:11,paddingLeft:6}}>Rentabilidad por hora del día</Lbl>
          <ResponsiveContainer width="100%" height={125}>
            <BarChart data={hourData} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/><XAxis dataKey="label" tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<Tip/>}/><Bar dataKey="avg" name="$/viaje" radius={[3,3,0,0]}>{hourData.map((e,i)=><Cell key={i} fill={e.avg>=cfg.targetHourlyRate/8?C.teal:e.avg>=cfg.targetHourlyRate/12?C.accent:C.danger}/>)}</Bar></BarChart>
          </ResponsiveContainer>
        </Card>}
        <Card s={{marginBottom:11,padding:"13px 8px"}}>
          <Lbl s={{marginBottom:11,paddingLeft:6}}>$/hora vs meta ({fmtMXN(cfg.targetHourlyRate)})</Lbl>
          <ResponsiveContainer width="100%" height={125}>
            <LineChart data={chart} margin={{left:-20}}><CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/><XAxis dataKey="label" tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.dim,fontSize:9}} axisLine={false} tickLine={false}/><Tooltip content={<Tip/>}/><Line type="monotone" dataKey="nph" stroke={C.teal} strokeWidth={2} dot={false} name="$/hr"/></LineChart>
          </ResponsiveContainer>
        </Card>
        {platData.length>0&&<Card s={{marginBottom:11}}>
          <Lbl s={{marginBottom:11}}>Ganancia por plataforma</Lbl>
          <div style={{display:"flex",alignItems:"center"}}>
            <ResponsiveContainer width="50%" height={105}><PieChart><Pie data={platData} dataKey="net" cx="50%" cy="50%" innerRadius={26} outerRadius={48} paddingAngle={3}>{platData.map((_,i)=><Cell key={i} fill={PIE[i%PIE.length]}/>)}</Pie></PieChart></ResponsiveContainer>
            <div style={{flex:1,paddingLeft:7}}>{platData.map((p,i)=>(
              <div key={p.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:PIE[i]}}/><span style={{fontSize:11}}>{p.name}</span></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:12,color:PIE[i],fontWeight:700}}>{fmtMXN(p.net)}</div><div style={{fontSize:9,color:C.muted}}>{p.count} viajes</div></div>
              </div>
            ))}</div>
          </div>
        </Card>}
      </>}
    </div>
  );
}

// ─── AI TAB ───────────────────────────────────────────────────────────────────
function AITab({cfg,trips,isPro,monthlyTripsCount,onUpgrade,userId}){
  const WELCOME={role:"assistant",content:"## Asesor de rentabilidad\n\nPuedo analizar tus viajes, horarios, plataformas y costos. Pregúntame algo concreto o elige una sugerencia."};
  const[msgs,setMsgs]=useState([WELCOME]);
  const[conversations,setConversations]=useState([]);
  const[activeId,setActiveId]=useState(null);
  const[showHistory,setShowHistory]=useState(false);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const endRef=useRef();
  useEffect(()=>{
    if(!userId)return;
    let live=true;
    (async()=>{
      const{data,error}=await supabase.from("ai_conversations").select("*").eq("user_id",userId).order("updated_at",{ascending:false});
      if(!live)return;
      const local=LS.get(`${K.CHATS}_${userId}`,[]);
      const rows=error?local:(data||[]);
      setConversations(rows);
      if(rows[0]){setActiveId(rows[0].id);setMsgs(Array.isArray(rows[0].messages)?rows[0].messages:[WELCOME]);}
    })();
    return()=>{live=false;};
  },[userId]);
  const rememberLocal=rows=>{setConversations(rows);LS.set(`${K.CHATS}_${userId}`,rows);};
  const persistConversation=async(next,title)=>{
    const updatedAt=new Date().toISOString();
    if(activeId){
      const{data,error}=await supabase.from("ai_conversations").update({messages:next,title,updated_at:updatedAt}).eq("id",activeId).select().single();
      const row=error?{id:activeId,user_id:userId,messages:next,title,updated_at:updatedAt}:data;
      rememberLocal([row,...conversations.filter(c=>c.id!==activeId)]);return row.id;
    }
    const{data,error}=await supabase.from("ai_conversations").insert({user_id:userId,messages:next,title,updated_at:updatedAt}).select().single();
    const row=error?{id:`local-${Date.now()}`,user_id:userId,messages:next,title,updated_at:updatedAt}:data;
    setActiveId(row.id);rememberLocal([row,...conversations]);return row.id;
  };
  const newConversation=()=>{setActiveId(null);setMsgs([WELCOME]);setInput("");setShowHistory(false);};
  const openConversation=c=>{setActiveId(c.id);setMsgs(Array.isArray(c.messages)?c.messages:[WELCOME]);setShowHistory(false);};
  const deleteConversation=async()=>{
    if(!activeId||!window.confirm("Eliminar esta conversacion?"))return;
    if(!String(activeId).startsWith("local-"))await supabase.from("ai_conversations").delete().eq("id",activeId);
    const rest=conversations.filter(c=>c.id!==activeId);rememberLocal(rest);
    if(rest[0])openConversation(rest[0]);else newConversation();
  };
  const recent=trips.filter(t=>new Date(t.end_time||t.created_at||0).getTime()>=Date.now()-30*86400000);
  const ctx=()=>{
    const all=[...trips].sort((a,b)=>tripMs(b)-tripMs(a)); // todos los viajes, no solo 30d
    const s30=recent.reduce((a,t)=>{const c=calcTrip(t,cfg);return{net:a.net+c.net,km:a.km+c.km,gas:a.gas+c.gas,min:a.min+c.min,n:a.n+1};},{net:0,km:0,gas:0,min:0,n:0});
    const sAll=all.reduce((a,t)=>{const c=calcTrip(t,cfg);return{net:a.net+c.net,km:a.km+c.km,gas:a.gas+c.gas,min:a.min+c.min,n:a.n+1};},{net:0,km:0,gas:0,min:0,n:0});

    // Mejor y peor hora (todos los viajes)
    const bh={};all.forEach(t=>{const h=new Date(t.end_time||t.created_at||0).getHours();if(!bh[h])bh[h]={net:0,n:0};bh[h].net+=calcTrip(t,cfg).net;bh[h].n++;});
    const horaSort=Object.entries(bh).sort((a,b)=>(b[1].net/b[1].n)-(a[1].net/a[1].n));
    const bestH=horaSort.slice(0,3).map(([h,d])=>`${h}:00(${fmtMXN(d.net/d.n)}/viaje)`).join(", ");
    const worstH=horaSort.slice(-2).map(([h,d])=>`${h}:00(${fmtMXN(d.net/d.n)}/viaje)`).join(", ");

    // Por plataforma
    const bp={};all.forEach(t=>{const p=t.platform||"uber";if(!bp[p])bp[p]={net:0,n:0,km:0};const c=calcTrip(t,cfg);bp[p].net+=c.net;bp[p].n++;bp[p].km+=c.km;});
    const platS=Object.entries(bp).map(([p,d])=>`${p}:${fmtMXN(d.net/d.n)}/viaje,${fmtMXN(d.n>0?d.net/(d.km||1)*100:0)}c/100km`).join(" | ");

    // Por día de semana
    const bd={};all.forEach(t=>{const d=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(t.end_time||t.created_at||0).getDay()];if(!bd[d])bd[d]={net:0,n:0};bd[d].net+=calcTrip(t,cfg).net;bd[d].n++;});
    const diaS=Object.entries(bd).sort((a,b)=>(b[1].net/b[1].n)-(a[1].net/a[1].n)).map(([d,v])=>`${d}:${fmtMXN(v.net/v.n)}/viaje`).join(", ");

    // Últimos 5 viajes detallados
    const last5=all.slice(0,5).map(t=>{const c=calcTrip(t,cfg);const d=new Date(t.end_time||t.created_at||0);return`${d.toLocaleDateString("es-MX")} ${d.getHours()}h ${t.platform||"uber"} $${t.fare} pickup:${t.pickup_km||0}km/${t.pickup_min||0}min dest:${t.dest_km||0}km/${t.dest_min||0}min neto:${fmtMXN(c.net)}`;}).join(" | ");

    // Tendencia: esta semana vs semana anterior
    const now=Date.now();
    const w1=all.filter(t=>new Date(t.end_time||t.created_at||0).getTime()>=now-7*86400000);
    const w2=all.filter(t=>{const ms=new Date(t.end_time||t.created_at||0).getTime();return ms>=now-14*86400000&&ms<now-7*86400000;});
    const wNet1=w1.reduce((a,t)=>a+calcTrip(t,cfg).net,0);
    const wNet2=w2.reduce((a,t)=>a+calcTrip(t,cfg).net,0);
    const tendencia=wNet2>0?`${wNet1>wNet2?"+":""}${(((wNet1-wNet2)/wNet2)*100).toFixed(0)}% vs semana anterior`:"primera semana";

    return`=== CONTEXTO COMPLETO RUTAFLOW ===
CONDUCTOR: ${cfg.name||"sin nombre"} | Meta: ${fmtMXN(cfg.targetHourlyRate)}/hr | Gas: $${cfg.gasPricePerLiter}/L ${cfg.kmPerLiter}km/L
COSTOS FIJOS: renta ${fmtMXN(cfg.monthlyRent)} + seguro ${fmtMXN(cfg.insurance)} + llantas ${fmtMXN(cfg.tires)} + mant ${fmtMXN(cfg.maintenance)} = ${fmtMXN((cfg.monthlyRent||0)+(cfg.insurance||0)+(cfg.tires||0)+(cfg.maintenance||0))}/mes
HISTÓRICO TOTAL (${sAll.n} viajes): neto ${fmtMXN(sAll.net)}, ${fmt(sAll.km,0)}km, ${(sAll.min/60).toFixed(0)}hrs trabajadas, promedio ${fmtMXN(sAll.n>0?sAll.net/sAll.n:0)}/viaje
ÚLTIMOS 30 DÍAS (${s30.n} viajes): neto ${fmtMXN(s30.net)}, ${fmt(s30.km,0)}km, ${fmtMXN(s30.gas)} gas, ${(s30.min/60).toFixed(1)}hrs, ${fmtMXN(s30.min>0?s30.net/(s30.min/60):0)}/hr
TENDENCIA: ${tendencia}
MEJORES HORAS: ${bestH||"sin datos"} | PEORES: ${worstH||"sin datos"}
POR DÍA: ${diaS||"sin datos"}
POR PLATAFORMA: ${platS||"sin datos"}
ÚLTIMOS 5 VIAJES: ${last5||"sin datos"}`;
  };
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs,loading]);
  const send=async()=>{
    if(!isPro){onUpgrade();return;}
    if(!input.trim()||loading)return;
    const question=input.trim();
    const um={role:"user",content:question};
    const pending=[...msgs,um];
    setMsgs(pending);setInput("");setLoading(true);
    try{
      const content=await callGroq("advisor",[
        {role:"system",content:`Eres el asesor de rentabilidad de RutaFlow para conductores de plataformas en Mexico. Responde en espanol claro, conciso y accionable. Distingue hechos de estimaciones. Usa Markdown GFM normal. Cuando presentes una tabla, conserva sus saltos de linea y nunca la encierres en un bloque de codigo ni escribas \`\`\`markdown. ${ctx()}`},
        ...pending
      ].map(m=>({role:m.role,content:m.content})),4096);
      const next=[...pending,{role:"assistant",content}];setMsgs(next);
      await persistConversation(next,conversations.find(c=>c.id===activeId)?.title||question.slice(0,52));
    }catch(err){const next=[...pending,{role:"assistant",content:`No pude consultar la IA: ${err.message}`}];setMsgs(next);await persistConversation(next,conversations.find(c=>c.id===activeId)?.title||question.slice(0,52));}
    setLoading(false);
  };
  const SUGG=["¿En qué horarios gano más?","¿Qué plataforma me conviene?","Dame un diagnóstico rápido","¿Cómo bajo mis costos?"];
  return(
    <div className="fu" style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 130px)",paddingBottom:"calc(60px + env(safe-area-inset-bottom))"}}>
      <div style={{padding:"9px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:7,position:"relative"}}>
        <button onClick={()=>setShowHistory(!showHistory)} style={{flex:1,minWidth:0,textAlign:"left",color:C.text}}><Lbl s={{marginBottom:3}}>Conversación</Lbl><div style={{fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{conversations.find(c=>c.id===activeId)?.title||"Nueva conversación"}</div></button>
        {activeId&&<button onClick={deleteConversation} title="Eliminar conversación" style={{width:34,height:34,border:`1px solid ${C.border}`,borderRadius:7,display:"grid",placeItems:"center"}}><SVG d={IC.trash} size={14} color={C.danger}/></button>}
        <button onClick={newConversation} title="Nueva conversación" style={{width:34,height:34,border:`1px solid ${C.accent}`,borderRadius:7,display:"grid",placeItems:"center"}}><SVG d={IC.plus} size={15} color={C.accent}/></button>
        {showHistory&&<div style={{position:"absolute",top:"calc(100% + 5px)",left:14,right:14,zIndex:20,background:C.card,border:`1px solid ${C.bord2}`,borderRadius:8,maxHeight:260,overflowY:"auto",boxShadow:"0 12px 30px rgba(0,0,0,.55)"}}>{conversations.length===0?<div style={{padding:13,fontSize:11,color:C.muted}}>Aun no hay conversaciones guardadas.</div>:conversations.map(c=><button key={c.id} onClick={()=>openConversation(c)} style={{width:"100%",padding:"10px 12px",textAlign:"left",borderBottom:`1px solid ${C.border}`,color:c.id===activeId?C.accent:C.text}}><div style={{fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.title||"Conversación"}</div><div style={{fontSize:8,color:C.dim,marginTop:3}}>{fmtDate(c.updated_at||c.created_at)}</div></button>)}</div>}
      </div>
      {recent.length<5&&<div style={{margin:"11px 14px 0",background:`${C.accent}12`,border:`1px solid ${C.accent}33`,borderRadius:9,padding:"9px 13px",fontSize:11,color:C.accent}}>⚠️ Con más viajes el análisis mejora ({recent.length} actuales)</div>}
      {!isPro&&<UpgradeCard monthlyTripsCount={monthlyTripsCount} onUpgrade={onUpgrade} s={{margin:"11px 14px 0"}}/>}
      {msgs.length<=1&&<div style={{padding:"11px 14px 0"}}><Lbl s={{marginBottom:7}}>Preguntas frecuentes</Lbl><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{SUGG.map(s=><button key={s} onClick={()=>setInput(s)} style={{padding:"6px 11px",background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:18,color:C.teal,fontSize:11,fontWeight:600}}>{s}</button>)}</div></div>}
      <div style={{flex:1,overflowY:"auto",padding:"11px 14px",display:"flex",flexDirection:"column",gap:9}}>
        {msgs.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}><div style={{maxWidth:m.role==="user"?"88%":"96%",padding:"10px 13px",borderRadius:m.role==="user"?"13px 13px 3px 13px":"13px 13px 13px 3px",background:m.role==="user"?`${C.accent}1e`:C.card,border:`1px solid ${m.role==="user"?C.accent+"44":C.border}`,fontSize:13,lineHeight:1.6,whiteSpace:m.role==="user"?"pre-wrap":"normal",color:C.text}}>{m.role==="assistant"?<MarkdownMessage>{m.content}</MarkdownMessage>:m.content}</div></div>)}
        {loading&&<div style={{display:"flex"}}><div style={{padding:"10px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:"13px 13px 13px 3px"}}><div className="pu" style={{fontSize:10,color:C.teal,letterSpacing:"0.2em"}}>ANALIZANDO...</div></div></div>}
        <div ref={endRef}/>
      </div>
      <div style={{padding:"9px 14px 12px",borderTop:`1px solid ${C.border}`,display:"flex",gap:7,position:"sticky",bottom:0,background:C.bg}}>
        <textarea rows={1} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Pregunta sobre tu rentabilidad..." onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} style={{flex:1,resize:"none",background:C.card,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 13px",color:C.text,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
        <button onClick={send} disabled={!input.trim()||loading} style={{padding:"10px 14px",background:input.trim()?`${C.accent}1e`:"transparent",border:`1px solid ${input.trim()?C.accent:C.border}`,borderRadius:9,color:input.trim()?C.accent:C.dim,display:"flex",alignItems:"center"}}><SVG d={IC.send} size={15} color={input.trim()?C.accent:C.dim}/></button>
      </div>
    </div>
  );
}

// ─── CONFIG TAB ───────────────────────────────────────────────────────────────
function ConfigTab({cfg,saveConfig,onLogout,installApp}){
  const[local,setLocal]=useState(cfg);
  const[saved,setSaved]=useState(false);
  useEffect(()=>setLocal(cfg),[cfg]);
  const set=(k,v)=>setLocal(p=>({...p,[k]:v}));
  const updatePlatform=(id,patch)=>setLocal(p=>({...p,platforms:platformList(p).map(x=>x.id===id?{...x,...patch}:x)}));
  const addPlatform=()=>{const id=`personal-${Date.now()}`;setLocal(p=>({...p,platforms:[...platformList(p),{id,name:"Servicio propio",commission:0,enabled:true,color:C.muted}]}));};
  const removePlatform=id=>setLocal(p=>({...p,platforms:platformList(p).filter(x=>x.id!==id)}));
  const save=async()=>{await saveConfig(local);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const periods=["diario","semanal","mensual","trimestral","semestral","anual"];
  const FCRow=({ek,mk,pk,label,xk,xl})=>(
    <div style={{background:C.card2,border:`1px solid ${local[ek]?C.accent+"44":C.border}`,borderRadius:11,padding:"13px 14px",marginBottom:9}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:local[ek]?12:0}}>
        <div style={{fontSize:12,color:local[ek]?C.text:C.muted}}>{label}</div>
        <button onClick={()=>set(ek,!local[ek])} style={{width:38,height:21,borderRadius:11,background:local[ek]?C.accent:C.bord2,position:"relative",flexShrink:0}}><div style={{width:15,height:15,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:local[ek]?20:3,transition:"left .18s"}}/></button>
      </div>
      {local[ek]&&<div style={{display:"grid",gridTemplateColumns:xk?"1fr 1fr 1fr":"1fr 1fr",gap:7}}>
        <div><Lbl s={{marginBottom:4}}>Monto $MXN</Lbl><input type="number" value={local[mk]} onChange={e=>set(mk,parseFloat(e.target.value)||0)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:"#fff",fontSize:15,fontFamily:"inherit"}}/></div>
        {pk&&<div><Lbl s={{marginBottom:4}}>Periodo</Lbl><select value={local[pk]} onChange={e=>set(pk,e.target.value)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:"#fff",fontSize:11,fontFamily:"inherit"}}>{periods.map(p=><option key={p} value={p}>{p}</option>)}</select></div>}
        {xk&&<div><Lbl s={{marginBottom:4}}>{xl}</Lbl><input type="number" value={local[xk]} onChange={e=>set(xk,parseFloat(e.target.value)||0)} style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 10px",color:"#fff",fontSize:15,fontFamily:"inherit"}}/></div>}
      </div>}
    </div>
  );
  return(
    <div className="fu" style={{padding:"15px 14px 100px"}}>
      <div className="B" style={{fontSize:22,fontWeight:800,color:C.accent,marginBottom:16,letterSpacing:1}}>CONFIGURACIÓN</div>
      {installApp?.available&&<div style={{background:`${C.teal}10`,border:`1px solid ${C.teal}33`,borderRadius:10,padding:"12px 13px",display:"flex",alignItems:"center",gap:11,marginBottom:14}}><SVG d={IC.home} size={18} color={C.teal}/><div style={{flex:1}}><div style={{fontSize:12,color:C.text,fontWeight:700}}>Instalar RutaFlow</div><div style={{fontSize:10,color:C.muted,marginTop:3}}>Acceso directo a pantalla completa</div></div><button onClick={installApp.install} style={{padding:"8px 10px",border:`1px solid ${C.teal}`,borderRadius:7,color:C.teal,fontSize:9,fontWeight:800}}>INSTALAR</button></div>}
      <Lbl s={{marginBottom:9}}>Variables base</Lbl>
      <Card s={{marginBottom:13}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          <Inp label="Gasolina (MXN/L)" type="number" value={local.gasPricePerLiter} onChange={v=>set("gasPricePerLiter",parseFloat(v)||0)} unit="$/L"/>
          <Inp label="Rendimiento" type="number" value={local.kmPerLiter} onChange={v=>set("kmPerLiter",parseFloat(v)||0)} unit="km/L"/>
          <Inp label="Meta por hora" type="number" value={local.targetHourlyRate} onChange={v=>set("targetHourlyRate",parseFloat(v)||0)} unit="MXN/hr"/>
        </div>
      </Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}><Lbl>Plataformas y comisiones</Lbl><Btn sm onClick={addPlatform} color={C.teal}><SVG d={IC.plus} size={11} color={C.teal}/>Añadir</Btn></div>
      <div style={{marginBottom:14}}>{platformList(local).map(p=><div key={p.id} style={{display:"grid",gridTemplateColumns:"34px minmax(0,1fr) 86px 30px",gap:7,alignItems:"end",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
        <button onClick={()=>updatePlatform(p.id,{enabled:p.enabled===false})} title={p.enabled===false?"Activar":"Desactivar"} style={{width:34,height:34,borderRadius:8,background:p.enabled===false?C.card2:`${C.teal}18`,border:`1px solid ${p.enabled===false?C.border:C.teal}`,position:"relative"}}><div style={{width:12,height:12,borderRadius:"50%",background:p.enabled===false?C.dim:C.teal,margin:"0 auto"}}/></button>
        <div><Lbl s={{marginBottom:4}}>Nombre</Lbl><input value={p.name} onChange={e=>updatePlatform(p.id,{name:e.target.value})} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 9px",color:C.text,minWidth:0}}/></div>
        <div><Lbl s={{marginBottom:4}}>Comisión</Lbl><div style={{position:"relative"}}><input type="number" min="0" max="100" value={p.commission} onChange={e=>updatePlatform(p.id,{commission:Math.max(0,Math.min(100,Number(e.target.value)||0))})} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:7,padding:"8px 24px 8px 8px",color:C.text}}/><span style={{position:"absolute",right:8,top:9,fontSize:10,color:C.muted}}>%</span></div></div>
        <button onClick={()=>removePlatform(p.id)} title="Eliminar plataforma" style={{height:34,display:"grid",placeItems:"center"}}><SVG d={IC.trash} size={14} color={C.danger}/></button>
      </div>)}</div>
      <Lbl s={{marginBottom:9}}>Gastos fijos (opcionales)</Lbl>
      <FCRow ek="rentaEnabled" mk="rentaMonto" pk="rentaPeriodo" label="🚗 Renta / crédito del auto"/>
      <FCRow ek="seguroEnabled" mk="seguroMonto" pk="seguroPeriodo" label="🛡️ Seguro del auto"/>
      <FCRow ek="llantasEnabled" mk="llantasMonto" xk="llantasKmVida" xl="Vida (km)" label="🔧 Desgaste de llantas"/>
      <FCRow ek="mantenimientoEnabled" mk="mantenimientoMonto" xk="mantenimientoKmVida" xl="Cada (km)" label="🔩 Mantenimiento"/>
      <Btn full onClick={save} color={saved?C.teal:C.accent} s={{marginTop:6,marginBottom:9}}><SVG d={IC.check} size={13} color={saved?C.teal:C.accent}/>{saved?"¡Guardado!":"Guardar cambios"}</Btn>
      <Btn full onClick={onLogout} color={C.danger} outline><SVG d={IC.out} size={13} color={C.danger}/>Cerrar sesión</Btn>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth(){
  const[mode,setMode]=useState("login");
  const[name,setName]=useState("");
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[confirm,setConfirm]=useState("");
  const[showPw,setShowPw]=useState(false);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[success,setSuccess]=useState("");
  const reset=()=>{setError("");setSuccess("");};
  const redir=()=>window.location.origin;
  const handleLogin=async e=>{e.preventDefault();setLoading(true);reset();const{error:err}=await supabase.auth.signInWithPassword({email,password:pass});if(err)setError("Correo o contraseña incorrectos");setLoading(false);};
  const handleRegister=async e=>{e.preventDefault();reset();if(!name.trim()){setError("Ingresa tu nombre completo");return;}if(pass.length<6){setError("Contraseña mínima: 6 caracteres");return;}if(pass!==confirm){setError("Las contraseñas no coinciden");return;}setLoading(true);const{data,error:err}=await supabase.auth.signUp({email,password:pass,options:{data:{full_name:name},emailRedirectTo:redir()}});if(err){setError(err.message);setLoading(false);return;}if(data?.user)await supabase.from("profiles").upsert({id:data.user.id,full_name:name,email,config:{}});setSuccess("¡Cuenta creada! Revisa tu correo para confirmar.");setLoading(false);};
  const handleForgot=async e=>{e.preventDefault();setLoading(true);reset();const{error:err}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:redir()});if(err)setError(err.message);else setSuccess("Te enviamos un link para restablecer tu contraseña.");setLoading(false);};
  const handleGoogle=()=>supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:redir()}});
  const inp={width:"100%",background:"#0a0b14",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px 12px 42px",color:"#fff",fontSize:14,fontFamily:"IBM Plex Mono,monospace",outline:"none"};
  const FI=({d})=><div style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}><SVG d={d} size={15} color={C.muted}/></div>;
  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:28}}><div className="B" style={{fontSize:36,fontWeight:900,color:C.accent,letterSpacing:2}}>RUTAFLOW</div><div style={{fontSize:10,color:C.dim,letterSpacing:"0.3em",marginTop:3}}>GESTOR DE CONDUCTOR</div></div>
        {mode!=="forgot"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5,marginBottom:20,background:C.card2,borderRadius:11,padding:4}}>{["login","register"].map(m=><button key={m} onClick={()=>{setMode(m);reset();}} style={{padding:"9px",background:mode===m?C.card:"transparent",border:`1px solid ${mode===m?C.bord2:"transparent"}`,borderRadius:8,color:mode===m?C.text:C.muted,fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700}}>{m==="login"?"Iniciar sesión":"Crear cuenta"}</button>)}</div>}
        <form onSubmit={mode==="login"?handleLogin:mode==="register"?handleRegister:handleForgot}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {mode==="forgot"&&<button type="button" onClick={()=>{setMode("login");reset();}} style={{color:C.accent,fontSize:11,display:"flex",alignItems:"center",gap:5,marginBottom:6}}><SVG d={IC.back} size={13} color={C.accent}/>Volver</button>}
            {mode==="register"&&<div style={{position:"relative"}}><FI d={IC.user}/><input type="text" placeholder="Tu nombre completo" value={name} onChange={e=>setName(e.target.value)} style={inp} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/></div>}
            <div style={{position:"relative"}}><FI d={IC.mail}/><input type="email" placeholder="correo@ejemplo.com" value={email} onChange={e=>setEmail(e.target.value)} required style={inp} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/></div>
            {mode!=="forgot"&&<div style={{position:"relative"}}><FI d={IC.lock}/><input type={showPw?"text":"password"} placeholder="Contraseña (mín. 6 caracteres)" value={pass} onChange={e=>setPass(e.target.value)} required style={{...inp,paddingRight:44}} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/><button type="button" onClick={()=>setShowPw(!showPw)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:C.muted}}><SVG d={IC.eye} size={15} color={C.muted}/></button></div>}
            {mode==="register"&&<div style={{position:"relative"}}><FI d={IC.lock}/><input type={showPw?"text":"password"} placeholder="Confirmar contraseña" value={confirm} onChange={e=>setConfirm(e.target.value)} required style={inp} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border}/></div>}
            {mode==="login"&&<div style={{textAlign:"right"}}><button type="button" onClick={()=>{setMode("forgot");reset();}} style={{color:C.accent,fontSize:10,textDecoration:"underline"}}>¿Olvidaste tu contraseña?</button></div>}
            {error&&<div style={{background:`${C.danger}12`,border:`1px solid ${C.danger}33`,borderRadius:8,padding:"9px 13px",fontSize:12,color:C.danger}}>⚠️ {error}</div>}
            {success&&<div style={{background:`${C.teal}12`,border:`1px solid ${C.teal}33`,borderRadius:8,padding:"9px 13px",fontSize:12,color:C.teal}}>✅ {success}</div>}
            <button type="submit" disabled={loading} style={{padding:"13px",background:`${C.accent}1e`,border:`2px solid ${C.accent}`,borderRadius:11,color:C.accent,fontSize:12,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
              {loading?<div className="sp" style={{width:16,height:16,border:`2px solid ${C.accent}44`,borderTopColor:C.accent,borderRadius:"50%"}}/>:mode==="login"?"Entrar":mode==="register"?"Crear cuenta":"Enviar link"}
            </button>
            {mode!=="forgot"&&<>
              <div style={{display:"flex",alignItems:"center",gap:9}}><div style={{flex:1,height:1,background:C.border}}/><span style={{fontSize:10,color:C.dim}}>o</span><div style={{flex:1,height:1,background:C.border}}/></div>
              <button type="button" onClick={handleGoogle} style={{padding:"12px",background:"transparent",border:`1px solid ${C.bord2}`,borderRadius:11,color:C.text,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
                <svg width="17" height="17" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continuar con Google
              </button>
            </>}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
const DCFG={gasPricePerLiter:24,kmPerLiter:12,targetHourlyRate:200,platformCut:10,platforms:DEFAULT_PLATFORMS,
  rentaEnabled:false,rentaMonto:0,rentaPeriodo:"mensual",
  seguroEnabled:false,seguroMonto:0,seguroPeriodo:"mensual",
  llantasEnabled:false,llantasMonto:0,llantasKmVida:40000,
  mantenimientoEnabled:false,mantenimientoMonto:0,mantenimientoKmVida:5000};

export default function RutaFlow(){
  const[tab,setTab]=useState("home");
  const[cfg,setCfg]=useState(DCFG);
  const[trips,setTrips]=useState([]);
  const[events,setEvents]=useState([]);
  const[days,setDays]=useState([]);
  const[closures,setClosures]=useState([]);
  const[activeDay,setActiveDay]=useState(null);
  const[session,setSession]=useState(null);
  const[profile,setProfile]=useState(null);
  const[loading,setLoading]=useState(true);
  const[toast,setToast]=useState(null);
  const[selTrip,setSelTrip]=useState(null);
  const[showNew,setShowNew]=useState(false);
  const[showOperation,setShowOperation]=useState(false);
  const[editingEvent,setEditingEvent]=useState(null);
  const[selectedClosure,setSelectedClosure]=useState(null);
  const installApp=useInstallApp();

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const{dayKm,reset:resetDayGPS}=useDayGPS(!!activeDay?.running);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(session)loadCloud(session.user.id);else{setProfile(null);setLoading(false);}});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((ev,session)=>{setSession(session);if(session)loadCloud(session.user.id);else{setProfile(null);setLoading(false);}});
    return()=>subscription.unsubscribe();
  },[]);

  const loadCloud=useCallback(async uid=>{
    setLoading(true);
    try{
      const[{data:tr},{data:pr},{data:dy},{data:ad},{data:oe,error:oeError},{data:cl,error:clError}]=await Promise.all([
        supabase.from("trips").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("profiles").select("*").eq("id",uid).single(),
        supabase.from("days").select("*").eq("user_id",uid).order("date",{ascending:false}),
        supabase.from("active_days").select("*").eq("user_id",uid).maybeSingle(),
        supabase.from("operational_events").select("*").eq("user_id",uid).order("occurred_at",{ascending:false}),
        supabase.from("shift_closures").select("*").eq("user_id",uid).order("date",{ascending:false}),
      ]);
      if(tr)setTrips(tr);
      if(oe)setEvents(oe);
      if(oeError&&oeError.code!=="42P01")console.warn("Operational events",oeError.message);
      if(dy)setDays(dy);
      if(cl)setClosures(cl);
      if(clError&&clError.code!=="42P01")console.warn("Shift closures",clError.message);
      if(pr)setProfile(pr);
      if(pr?.config&&Object.keys(pr.config).length>0)setCfg(normalizeConfig(pr.config));
      if(ad){const obj={id:ad.id,date:ad.date,startTime:new Date(ad.start_time).getTime(),running:true};setActiveDay(obj);LS.set(K.DAY,obj);}
      else{LS.del(K.DAY);setActiveDay(null);}
    }catch(e){console.error(e);}
    setLoading(false);
  },[]);

  const saveTrip=async data=>{
    if(!session)return false;
    const monthlyTripsCount=trips.filter(t=>{
      const d=new Date(t.end_time||t.created_at||0);
      const now=new Date();
      return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
    }).length;
    if(paymentUrl()&&!isProProfile(profile)&&monthlyTripsCount>=FREE_MONTHLY_TRIP_LIMIT){
      openUpgrade();
      showToast(`Tu plan gratis incluye ${FREE_MONTHLY_TRIP_LIMIT} viajes al mes`,"err");
      return false;
    }
    try{
      const{data:saved,error}=await supabase.from("trips").insert([{
        user_id:session.user.id,fare:Number(data.fare)||0,platform:data.platform||"uber",
        pickup_km:Number(data.pickup_km)||0,pickup_min:Number(data.pickup_min)||0,
        dest_km:Number(data.dest_km)||0,dest_min:Number(data.dest_min)||0,
        gps_km:Number(data.gps_km)||0,gps_min:Number(data.gps_min)||0,
        date:data.date||today(),end_time:data.end_time||new Date().toISOString(),day_id:data.day_id||null,
      }]).select().single();
      if(error){showToast("Error: "+error.message,"err");return false;}
      if(saved){setTrips(p=>[saved,...p]);showToast("Viaje guardado ✓");return true;}
    }catch(e){console.error(e);showToast("Error de conexión","err");}
    return false;
  };

  const updateTrip=async(id,data)=>{
    try{
      const{data:updated,error}=await supabase.from("trips").update(data).eq("id",id).select().single();
      if(error){showToast("Error al actualizar","err");return false;}
      if(updated){setTrips(p=>p.map(t=>t.id===id?updated:t));showToast("Viaje actualizado ✓");return true;}
    }catch(e){showToast("Error de conexión","err");}
    return false;
  };

  const deleteTrip=async id=>{
    if(!window.confirm("¿Eliminar este viaje?"))return;
    const{error}=await supabase.from("trips").delete().eq("id",id);
    if(!error){setTrips(p=>p.filter(t=>t.id!==id));showToast("Viaje eliminado");}
  };

  const saveOperation=async data=>{
    if(!session)return false;
    try{
      const{data:saved,error}=await supabase.from("operational_events").insert([{
        user_id:session.user.id,type:data.type,km:Number(data.km)||0,amount:Number(data.amount)||0,
        liters:Number(data.liters)||0,tank_liters:Number(data.tank_liters)||0,odometer:Number(data.odometer)||0,
        note:data.note||"",date:data.date||today(),occurred_at:data.occurred_at||new Date().toISOString(),
      }]).select().single();
      if(error){
        const msg=error.code==="42P01"?"Falta instalar la tabla de Jornada Inteligente en Supabase.":error.message;
        showToast(msg,"err");return false;
      }
      setEvents(p=>[saved,...p]);showToast("Movimiento guardado");return true;
    }catch(e){showToast("Error de conexion","err");return false;}
  };

  const updateOperation=async(id,data)=>{
    try{
      const{data:updated,error}=await supabase.from("operational_events").update({...data,date:data.date||dateOf(data)}).eq("id",id).select().single();
      if(error){showToast("No se pudo actualizar el movimiento","err");return false;}
      setEvents(p=>p.map(e=>e.id===id?updated:e).sort((a,b)=>eventMs(b)-eventMs(a)));showToast("Movimiento actualizado");return true;
    }catch(e){showToast("Error de conexion","err");return false;}
  };

  const deleteOperation=async id=>{
    if(!window.confirm("Eliminar este movimiento de la jornada?"))return;
    const{error}=await supabase.from("operational_events").delete().eq("id",id);
    if(!error){setEvents(p=>p.filter(e=>e.id!==id));showToast("Movimiento eliminado");}
  };

  const startDay=async()=>{
    if(!session)return;
    const{data,error}=await supabase.from("active_days").upsert({user_id:session.user.id,date:today(),start_time:new Date().toISOString()},{onConflict:"user_id"}).select().single();
    if(!error&&data){const obj={id:data.id,date:data.date,startTime:new Date(data.start_time).getTime(),running:true};setActiveDay(obj);LS.set(K.DAY,obj);}
  };

  const endDay=async()=>{
    if(!activeDay||!session)return;
    const dayTrips=trips.filter(t=>t.date===activeDay.date);
    const tots=operationalSummary(trips,events,cfg,activeDay.date,dayKm);
    const totalMs=Date.now()-activeDay.startTime;
    await supabase.from("active_days").delete().eq("user_id",session.user.id);
    await supabase.from("days").insert([{
      user_id:session.user.id,date:activeDay.date,
      total_net:tots.net,total_km:tots.totalKm,
      total_min:tots.min,total_ms:totalMs,trip_count:dayTrips.length,
    }]);
    const closurePayload={
      user_id:session.user.id,date:activeDay.date,start_time:new Date(activeDay.startTime).toISOString(),end_time:new Date().toISOString(),total_ms:totalMs,trip_count:dayTrips.length,
      total_net:tots.net,total_km:tots.totalKm,dead_km:tots.deadKm,productive_pct:tots.productivePct,snapshot:tots,
    };
    const{data:closed,error:closeError}=await supabase.from("shift_closures").insert(closurePayload).select().single();
    if(closed){setClosures(p=>[closed,...p]);setSelectedClosure(closed);}
    if(closeError)showToast(closeError.code==="42P01"?"Falta instalar la migracion de cierres en Supabase":closeError.message,"err");
    resetDayGPS();
    LS.del(K.DAY);setActiveDay(null);
    if(!closeError)showToast("Jornada cerrada y guardada");
  };

  const saveConfig=async newCfg=>{
    const normalized=normalizeConfig(newCfg);setCfg(normalized);
    if(!session)return;
    await supabase.from("profiles").upsert({id:session.user.id,config:normalized,updated_at:new Date().toISOString()});
  };

  if(loading)return(
    <><style>{CSS}</style>
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div className="B" style={{fontSize:34,fontWeight:900,color:C.accent,letterSpacing:3}}>RUTAFLOW</div>
      <div style={{marginTop:20,width:100,height:2,background:C.border,borderRadius:2,overflow:"hidden"}}><div className="pu" style={{width:"60%",height:"100%",background:C.accent}}/></div>
      <div style={{marginTop:11,fontSize:9,color:C.dim,letterSpacing:"0.3em"}}>CARGANDO...</div>
    </div></>
  );
  if(!session)return <><style>{CSS}</style><Auth/></>;

  const uname=session?.user?.user_metadata?.full_name||session?.user?.email?.split("@")[0]||"Driver";
  const todayNet=operationalSummary(trips,events,cfg,today(),dayKm).net;
  const isPro=!paymentUrl()||isProProfile(profile);
  const monthlyTripsCount=trips.filter(t=>{
    const d=new Date(t.end_time||t.created_at||0);
    const now=new Date();
    return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  }).length;
  const NAV=[{id:"home",d:IC.home,l:"Hoy"},{id:"trips",d:IC.trips,l:"Viajes"},{id:"stats",d:IC.stats,l:"Stats"},{id:"ai",d:IC.ai,l:"IA"},{id:"config",d:IC.cfg,l:"Config"}];

  return(
    <>
      <style>{CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
      <div style={{background:C.bg,minHeight:"100vh",maxWidth:480,margin:"0 auto",position:"relative"}}>
        <div style={{background:C.card,padding:`calc(10px + env(safe-area-inset-top)) 15px 10px`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,zIndex:10,borderBottom:`1px solid ${C.border}`}}>
          <div>
            <div className="B" style={{fontSize:19,fontWeight:900,color:C.accent,letterSpacing:1.5}}>RUTAFLOW</div>
            <div style={{fontSize:9,color:C.dim,letterSpacing:"0.18em"}}>{uname.toUpperCase()}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.muted}}>hoy neto</div>
            <div className="B" style={{fontSize:21,fontWeight:800,color:todayNet>=0?C.teal:C.danger}}>{fmtMXN(todayNet)}</div>
          </div>
        </div>

        {tab==="home"   &&<HomeTab cfg={cfg} trips={trips} events={events} closures={closures} activeDay={activeDay} startDay={startDay} onEndDay={endDay} onNew={()=>setShowNew(true)} onQuick={()=>{setEditingEvent(null);setShowOperation(true);}} dayKm={dayKm} onSelect={setSelTrip} onDeleteEvent={deleteOperation} onEditEvent={e=>{setEditingEvent(e);setShowOperation(true);}} onSelectClosure={setSelectedClosure} isPro={isPro} monthlyTripsCount={monthlyTripsCount} onUpgrade={openUpgrade}/>}
        {tab==="trips"  &&<TripsTab cfg={cfg} trips={trips} saveTrip={saveTrip} updateTrip={updateTrip} deleteTrip={deleteTrip} onSelect={setSelTrip} onNew={()=>setShowNew(true)}/>}
        {tab==="stats"  &&<StatsTab cfg={cfg} trips={trips} events={events}/>}
        {tab==="ai"     &&<AITab cfg={cfg} trips={trips} isPro={isPro} monthlyTripsCount={monthlyTripsCount} onUpgrade={openUpgrade} userId={session.user.id}/>}
        {tab==="config" &&<ConfigTab cfg={cfg} saveConfig={saveConfig} onLogout={()=>supabase.auth.signOut()} installApp={installApp}/>}

        {/* NAVEGACIÓN FIJA */}
        <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"calc(10px + env(safe-area-inset-bottom))",paddingTop:"10px"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,padding:"12px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:tab===n.id?C.accent:C.dim,transition:"color .15s"}}>
              <SVG d={n.d} size={18} color={tab===n.id?C.accent:C.dim}/>
              <span style={{fontSize:9,letterSpacing:"0.1em",fontWeight:tab===n.id?700:400}}>{n.l}</span>
            </button>
          ))}
        </div>

      </div>{/* ← CIERRE DEL DIV PRINCIPAL */}

      {/* MODALES FUERA DEL DIV — flotan sobre todo incluyendo la NAV */}
      {showNew&&<TripModal cfg={cfg} saveTrip={saveTrip} activeDay={activeDay} onClose={()=>setShowNew(false)} isPro={isPro} onUpgrade={openUpgrade}/>}
      {showOperation&&<OperationModal cfg={cfg} initial={editingEvent} onClose={()=>{setShowOperation(false);setEditingEvent(null);}} onSaveOperation={saveOperation} onUpdateOperation={updateOperation} onSaveTrip={saveTrip}/>}
      {selectedClosure&&<ClosureModal closure={selectedClosure} onClose={()=>setSelectedClosure(null)}/>}
      {selTrip&&<TripDetail trip={selTrip} cfg={cfg} onClose={()=>setSelTrip(null)}
        onSave={async(id,d)=>{await updateTrip(id,d);setSelTrip(null);}}
        onDelete={async id=>{await deleteTrip(id);setSelTrip(null);}}/>}
    </>
  );
}
