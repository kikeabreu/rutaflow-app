import { useState, useEffect, useRef, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { supabase } from "./supabaseClient";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C={bg:"#07080d",card:"#0d0f1a",card2:"#111320",border:"#1a1d2e",bord2:"#242740",accent:"#f0a500",teal:"#00c9a7",danger:"#ff4055",dim:"#3a3d55",muted:"#6b6e8a",text:"#dde0f5"};

// ─── localStorage ─────────────────────────────────────────────────────────────
const LS={
  get:(k,d=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  del:(k)=>{try{localStorage.removeItem(k);}catch{}},
};
const K={DRAFT:"rf_draft",DAY:"rf_day",DAYGPS:"rf_daygps"};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt=(n,d=2)=>(parseFloat(n)||0).toFixed(d);
const fmtMXN=n=>`$${fmt(n)}`;
const fmtPct=n=>`${fmt(n,1)}%`;
const today=()=>new Date().toISOString().split("T")[0];
const fmtDate=d=>new Date(d).toLocaleDateString("es-MX",{weekday:"short",day:"numeric",month:"short"});
const fmtHour=d=>new Date(d).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
const fmtClock=ms=>{const s=Math.floor(Math.abs(ms)/1000);return`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;};
const haversine=(a,b)=>{const R=6371,r=x=>x*Math.PI/180;const dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon);const x=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};

// ─── CÁLCULO ─────────────────────────────────────────────────────────────────
const calcTrip=(trip,cfg)=>{
  const gKm=parseFloat(trip.gps_km)||0,gMin=parseFloat(trip.gps_min)||0;
  const km=gKm>0?gKm:(parseFloat(trip.pickup_km)||0)+(parseFloat(trip.dest_km)||0);
  const min=gMin>0?gMin:(parseFloat(trip.pickup_min)||0)+(parseFloat(trip.dest_min)||0);
  const fare=parseFloat(trip.fare)||0;
  const gas=km/(cfg.kmPerLiter||12)*(cfg.gasPricePerLiter||24);
  const fee=fare*(cfg.platformCut||10)/100;
  const p2d={diario:1,semanal:7,mensual:30,trimestral:90,semestral:180,anual:365};
  let fx=0;
  if(cfg.rentaEnabled)fx+=(cfg.rentaMonto||0)/(p2d[cfg.rentaPeriodo]||30);
  if(cfg.seguroEnabled)fx+=(cfg.seguroMonto||0)/(p2d[cfg.seguroPeriodo]||30);
  if(cfg.llantasEnabled)fx+=((cfg.llantasMonto||0)/(cfg.llantasKmVida||40000))*km;
  if(cfg.mantenimientoEnabled)fx+=((cfg.mantenimientoMonto||0)/(cfg.mantenimientoKmVida||5000))*km;
  const net=fare-fee-gas-fx,hrs=min/60;
  return{km,min,fare,gas,fee,fx,net,hrs,nph:hrs>0?net/hrs:0,npk:km>0?net/km:0,pct:fare>0?(net/fare)*100:0};
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
`;

// ─── HOOKS DE SISTEMA ────────────────────────────────────────────────────────

function useWakeLock(isActive) {
  const sentinel = useRef(null);
  const requestLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        sentinel.current = await navigator.wakeLock.request('screen');
      }
    } catch (err) { console.error("Wake Lock Error:", err); }
  }, []);
  useEffect(() => {
    if (isActive) requestLock();
    else if (sentinel.current) {
      sentinel.current.release().then(() => { sentinel.current = null; });
    }
  }, [isActive, requestLock]);
}

function useDayGPS(isActive) {
  const [dayKm, setDayKm] = useState(() => parseFloat(LS.get(K.DAYGPS, {})?.km || 0));
  const lastRef = useRef(null);
  const distRef = useRef(parseFloat(LS.get(K.DAYGPS, {})?.km || 0));
  useWakeLock(isActive); 
  const start = useCallback(() => {
    if (!navigator.geolocation) return;
    return navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon } }) => {
        if (lastRef.current) {
          const d = haversine(lastRef.current, { lat, lon });
          if (d > 0.01) { 
            distRef.current += d;
            setDayKm(distRef.current);
            LS.set(K.DAYGPS, { km: distRef.current, ts: Date.now() });
          }
        }
        lastRef.current = { lat, lon };
      },
      (err) => console.warn("GPS Error", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, []);
  useEffect(() => {
    let watchId;
    if (isActive) { watchId = start(); }
    return () => { if (watchId) navigator.geolocation.clearWatch(watchId); };
  }, [isActive, start]);
  return { dayKm, reset: () => { distRef.current = 0; setDayKm(0); LS.del(K.DAYGPS); } };
}

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const Card=({children,s,onClick})=><div onClick={onClick} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:15,...s}}>{children}</div>;
const Lbl=({children,color=C.muted,s})=><div style={{fontSize:9,letterSpacing:"0.2em",textTransform:"uppercase",color,fontWeight:600,...s}}>{children}</div>;
const Big=({children,size=24,color=C.text,s})=><div className="B" style={{fontSize:size,fontWeight:800,color,lineHeight:1,...s}}>{children}</div>;
const Pill=({platform})=>{
  const cols={uber:"#00b4d8",didi:"#ff6b35",beat:"#a855f7",otra:C.muted};
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
  <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:99999,background:type==="ok"?"#00c9a7":"#ff4055",color:"#000",borderRadius:10,padding:"10px 20px",fontSize:12,fontWeight:700,letterSpacing:"0.08em",whiteSpace:"nowrap",boxShadow:"0 4px 24px rgba(0,0,0,.6)"}}>
    {type==="ok"?"✅":"⚠️"} {msg}
  </div>
):null;

// ─── MODAL: DETALLE / EDICIÓN DE VIAJE ────────────────────────────────────────
function TripDetail({trip,cfg,onClose,onSave,onDelete}){
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({
    fare:String(trip.fare||""),platform:trip.platform||"uber",
    pickup_km:String(trip.pickup_km||""),pickup_min:String(trip.pickup_min||""),
    dest_km:String(trip.dest_km||""),dest_min:String(trip.dest_min||""),
    gps_km:String(trip.gps_km||""),gps_min:String(trip.gps_min||""),
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
    });
    setSaving(false);
    setEditing(false);
  };

  const c=calcTrip(editing?form:trip,cfg);
  const good=c.nph>=cfg.targetHourlyRate,ok=c.nph>=cfg.targetHourlyRate*.75;
  const V=good?{col:C.teal,lbl:"✅ Excelente viaje"}:ok?{col:C.accent,lbl:"⚠️ Aceptable"}:{col:C.danger,lbl:"❌ No rentable"};
  const rows=[
    {l:"Tarifa bruta",v:fmtMXN(c.fare),c:C.text},
    {l:`Comisión plataforma (${cfg.platformCut}%)`,v:`-${fmtMXN(c.fee)}`,c:C.danger},
    {l:`Gas · ${fmt(c.km,1)}km ÷ ${cfg.kmPerLiter}km/L × $${cfg.gasPricePerLiter}`,v:`-${fmtMXN(c.gas)}`,c:C.danger},
    ...(c.fx>0?[{l:"Costos fijos amortizados",v:`-${fmtMXN(c.fx)}`,c:C.danger}]:[]),
    {l:"GANANCIA NETA",v:fmtMXN(c.net),c:c.net>=0?C.teal:C.danger,bold:true},
  ];

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:9999,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="su"
        style={{background:C.card,borderTop:`2px solid ${C.bord2}`,borderRadius:"20px 20px 0 0",maxHeight:"92vh",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"18px 18px 12px",flexShrink:0,borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:30,height:3,background:C.bord2,borderRadius:4,margin:"0 auto 14px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <Big size={19} color={C.accent} s={{letterSpacing:1}}>{editing?"EDITAR VIAJE":"DESGLOSE DEL VIAJE"}</Big>
              <div style={{fontSize:10,color:C.muted,marginTop:3,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                {fmtDate(trip.created_at||trip.timestamp)} · <Pill platform={editing?form.platform:trip.platform}/>
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
                {["uber","didi","beat","otra"].map(p=>(
                  <button key={p} onClick={()=>setF("platform",p)} style={{padding:"7px 4px",background:form.platform===p?`${C.accent}1e`:"transparent",border:`1px solid ${form.platform===p?C.accent:C.border}`,borderRadius:7,color:form.platform===p?C.accent:C.muted,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>{p}</button>
                ))}
              </div>
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
              <Lbl s={{marginBottom:8}}>Desglose contable</Lbl>
              <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden",marginBottom:14}}>
                {rows.map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 13px",borderBottom:i<rows.length-1?`1px solid ${C.border}`:"none",background:r.bold?`${C.accent}08`:"transparent"}}>
                    <div style={{fontSize:r.bold?11:10,color:r.bold?C.text:C.muted,fontWeight:r.bold?700:400}}>{r.l}</div>
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

function TripModal({cfg,saveTrip,activeDay,onClose}){
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

  const startGPS=()=>{ persist({gpsOn:true,gpsStartMs:Date.now(),gpsDistKm:0}); setGpsStatus("📍 Buscando señal GPS..."); _activateGPS(true); };
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
    const file=e.target.files[0];if(!file)return;
    setProc(true);
    const reader=new FileReader();
    reader.onload=async ev=>{
      const b64=ev.target.result.split(",")[1];
      try{
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:200,
            messages:[{role:"user",content:[
              {type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:b64}},
              {type:"text",text:`Extrae: tarifa MXN, km destino, minutos destino. Solo JSON: {"fare":0,"dest_km":0,"dest_min":0}`}
            ]}]})
        });
        const data=await res.json();
        const txt=data.content?.find(b=>b.type==="text")?.text||"{}";
        const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
        setTrip(p=>{const n={...p,fare:String(parsed.fare||""),dest_km:String(parsed.dest_km||""),dest_min:String(parsed.dest_min||"")};persist(n);return n;});
        setModeP("manual");setPhaseP(1);toast_("Captura analizada ✓");
      }catch{toast_("No pude leer la imagen.","err");}
      setProc(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave=async()=>{
    if(!trip.fare||saving)return;
    setSaving(true);
    const ok=await saveTrip({
      fare:parseFloat(trip.fare)||0,platform:trip.platform||"uber",
      pickup_km:parseFloat(trip.pickup_km)||0, pickup_min:parseFloat(trip.pickup_min)||0,
      dest_km:parseFloat(trip.dest_km)||0, dest_min:parseFloat(trip.dest_min)||0,
      gps_km:parseFloat(trip.gps_km)||0, gps_min:parseFloat(trip.gps_min)||0,
      date:today(), end_time:new Date().toISOString(), day_id:activeDay?.id||null,
    });
    setSaving(false);
    if(ok){LS.del(K.DRAFT);onClose();}
    else toast_("Error al guardar.","err");
  };

  const c=calcTrip(trip,cfg);
  const hasData=trip.fare&&(trip.dest_km||trip.dest_min||(parseFloat(trip.gps_km)>0));
  const V=c.nph>=cfg.targetHourlyRate?{col:C.teal,lbl:"✅ Excelente"}:c.nph>=cfg.targetHourlyRate*.75?{col:C.accent,lbl:"⚠️ Aceptable"}:{col:C.danger,lbl:"❌ No conviene"};

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 9999, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      <div className="su" style={{ background: C.card, borderTop: `2px solid ${C.bord2}`, borderRadius: "24px 24px 0 0", maxHeight: "92vh", display: "flex", flexDirection: "column", width: "100%", overflow: "hidden" }}>
        <div style={{padding:"16px 18px 0",flexShrink:0}}>
          <div style={{width:30,height:3,background:C.bord2,borderRadius:4,margin:"0 auto 13px"}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <Big size={19} color={C.accent}>NUEVO VIAJE</Big>
            <button onClick={onClose} style={{color:C.muted,fontSize:20,padding:"4px 8px"}}>✕</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:10}}>
            {["uber","didi","beat","otra"].map(p=>(
              <button key={p} onClick={()=>setF("platform",p)} style={{padding:"7px 4px",background:trip.platform===p?`${C.accent}1e`:"transparent",border:`1px solid ${trip.platform===p?C.accent:C.border}`,borderRadius:7,color:trip.platform===p?C.accent:C.muted,fontSize:10,textTransform:"uppercase"}}>{p}</button>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5,marginBottom:10}}>
            {[{id:"manual",l:"✍️ Manual"},{id:"gps",l:"📍 GPS"},{id:"photo",l:"📸 Foto IA"}].map(m=>(
              <button key={m.id} onClick={()=>setModeP(m.id)} style={{padding:"8px 4px",borderRadius:8,fontSize:10,background:mode===m.id?`${C.teal}1e`:"transparent",border:`1px solid ${mode===m.id?C.teal:C.border}`,color:mode===m.id?C.teal:C.muted}}>{m.l}</button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"0 18px",WebkitOverflowScrolling:"touch"}}>
          <div style={{marginBottom:12}}>
            <Lbl s={{marginBottom:5}}>💰 Tarifa (MXN)</Lbl>
            <input type="number" step="any" value={trip.fare} onChange={e=>setF("fare",e.target.value)} placeholder="0.00" style={{width:"100%",background:"#0a0b14",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",color:C.accent,fontSize:38,fontWeight:700,textAlign:"center",outline:"none"}}/>
          </div>
          {mode==="gps"&&(
            <div style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:12,padding:15,marginBottom:12}}>
              {gpsOn&&<div className="B" style={{fontSize:46,fontWeight:900,color:C.teal,textAlign:"center"}}>{fmtClock(gpsMs)}</div>}
              <div style={{fontSize:13,color:gpsOn?C.teal:C.muted,textAlign:"center",margin:"10px 0"}}>{gpsStatus}</div>
              {!gpsOn?(<Btn full onClick={startGPS} color={C.teal}>Iniciar GPS</Btn>):(<Btn full onClick={stopGPS} color={C.danger}>Finalizar GPS</Btn>)}
            </div>
          )}
          {mode==="manual"&&(
            <div style={{marginBottom:12}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                {[{id:0,l:"📍 Recolección"},{id:1,l:"🏁 Destino"}].map(ph=>(
                  <button key={ph.id} onClick={()=>setPhaseP(ph.id)} style={{padding:"8px",background:phase===ph.id?`${C.accent}1a`:"transparent",border:`1px solid ${phase===ph.id?C.accent:C.border}`,borderRadius:8,color:phase===ph.id?C.accent:C.muted,fontSize:10}}>{ph.l}</button>
                ))}
              </div>
              {phase===0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><Inp label="km" value={trip.pickup_km} onChange={v=>setF("pickup_km",v)} unit="km"/><Inp label="min" value={trip.pickup_min} onChange={v=>setF("pickup_min",v)} unit="min"/></div>}
              {phase===1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}><Inp label="km" value={trip.dest_km} onChange={v=>setF("dest_km",v)} unit="km"/><Inp label="min" value={trip.dest_min} onChange={v=>setF("dest_min",v)} unit="min"/></div>}
            </div>
          )}
          {mode==="photo"&&(
            <div style={{marginBottom:12}}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/>
              {proc?(<div style={{textAlign:"center",padding:28}}><div className="sp" style={{width:28,height:28,border:`2px solid ${C.border}`,borderTopColor:C.accent,borderRadius:"50%",margin:"0 auto 10px"}}/><Lbl>Analizando...</Lbl></div>):(<button onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:26,background:`${C.accent}0a`,border:`2px dashed ${C.accent}44`,borderRadius:12,color:C.accent,fontSize:11,fontWeight:700}}><SVG d={IC.cam} size={24} color={C.accent}/> SUBIR CAPTURA</button>)}
            </div>
          )}
          {hasData&&(
            <div style={{background:`${V.col}10`,border:`1px solid ${V.col}33`,borderRadius:11,padding:"12px 14px",marginBottom:12}}>
              <div className="B" style={{fontSize:15,color:V.col,marginBottom:8}}>{V.lbl}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7}}>
                {[{l:"NETO",v:fmtMXN(c.net),c:c.net>=0?C.teal:C.danger},{l:"HORA",v:fmtMXN(c.nph),c:V.col},{l:"KM",v:fmtMXN(c.npk),c:C.muted}].map(({l,v,c:col})=>(
                  <div key={l} style={{textAlign:"center"}}><Lbl s={{marginBottom:3}}>{l}</Lbl><Big size={15} color={col}>{v}</Big></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{padding:"12px 18px 40px",flexShrink:0,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 2fr",gap:9}}>
          <Btn onClick={onClose} color={C.muted} outline>Cancelar</Btn>
          <Btn full onClick={handleSave} disabled={!trip.fare||gpsOn||saving}>
            {saving?<div className="sp" style={{width:14,height:14,border:`2px solid ${C.dim}`,borderTopColor:C.accent,borderRadius:"50%"}}/>: "Guardar viaje"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function HomeTab({cfg,trips,activeDay,startDay,onEndDay,onNew,dayKm,onSelect}){
  const todayTrips=trips.filter(t=>(t.date||"")===today()).sort((a,b)=>new Date(b.created_at||b.end_time||0)-new Date(a.created_at||a.end_time||0));
  const stats=todayTrips.reduce((a,t)=>{const c=calcTrip(t,cfg);return{net:a.net+c.net,km:a.km+c.km,gross:a.gross+c.fare};},{net:0,km:0,gross:0});
  const deadKm=Math.max(0,dayKm-stats.km);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let t;
    if (activeDay?.running) {
      const tick = () => setElapsed(Date.now() - activeDay.startTime);
      tick(); t = setInterval(tick, 1000);
    } else { setElapsed(0); }
    return () => clearInterval(t);
  }, [activeDay]);

  return(
    <div className="fu" style={{padding:"15px 14px 100px"}}>
      <div style={{marginBottom:14}}>
        <Lbl s={{marginBottom:3}}>Ganancia neta hoy</Lbl>
        <div className="B" style={{fontSize:54,fontWeight:900,color:stats.net>=0?C.teal:C.danger}}>{fmtMXN(stats.net)}</div>
      </div>
      <Card s={{marginBottom:13}}>
        {!activeDay?(<Btn full onClick={startDay} color={C.teal}>Iniciar jornada</Btn>):(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}>
              <div><Lbl s={{color:C.danger,marginBottom:3}}>● GRABANDO</Lbl><div className="B" style={{fontSize:40,color:C.teal}}>{fmtClock(elapsed)}</div></div>
              <div style={{textAlign:"right"}}><Big size={28}>{todayTrips.length}</Big><Lbl>viajes</Lbl></div>
            </div>
            {dayKm>0&&(
              <div style={{background:`${C.accent}12`,borderRadius:9,padding:9,marginBottom:11,display:"flex",justifyContent:"space-between"}}>
                <div><Lbl s={{fontSize:8}}>Km Jornada</Lbl><div style={{fontSize:12}}>{fmt(dayKm,1)} km</div></div>
                <div style={{textAlign:"right"}}><Lbl s={{fontSize:8}}>Km Muertos</Lbl><Big size={16} color={C.accent}>{fmt(deadKm,1)} km</Big></div>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}>
              <Btn full onClick={onNew} color={C.accent}>Nuevo viaje</Btn>
              <Btn onClick={onEndDay} color={C.danger}>Fin</Btn>
            </div>
          </div>
        )}
      </Card>
      {todayTrips.length>0&&<Card>
        <Lbl s={{marginBottom:11}}>Viajes de hoy</Lbl>
        {todayTrips.slice(0,5).map(t=>{
          const c=calcTrip(t,cfg);
          return(<div key={t.id} onClick={()=>onSelect(t)} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
            <div><Pill platform={t.platform}/><div style={{fontSize:11,color:C.muted,marginTop:3}}>{fmtMXN(t.fare)} · {fmt(c.km,1)}km</div></div>
            <div style={{textAlign:"right"}}><Big size={18} color={c.nph>=cfg.targetHourlyRate?C.teal:C.accent}>{fmtMXN(c.net)}</Big></div>
          </div>)
        })}
      </Card>}
    </div>
  );
}

function TripsTab({cfg,trips,onSelect,onNew}){
  return(
    <div className="fu" style={{padding:"15px 14px 100px"}}>
      <Big size={22} color={C.accent} s={{marginBottom:13}}>HISTORIAL</Big>
      <Btn full onClick={onNew} s={{marginBottom:11}}>Agregar viaje</Btn>
      {trips.map(t=>{
        const c=calcTrip(t,cfg);
        return(
          <Card key={t.id} s={{marginBottom:7}} onClick={()=>onSelect(t)}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <div><Pill platform={t.platform}/><div style={{fontSize:12,marginTop:4}}>{fmtMXN(t.fare)} · {fmt(c.km,1)}km</div></div>
              <div style={{textAlign:"right"}}><Big size={19} color={c.net>=0?C.teal:C.danger}>{fmtMXN(c.net)}</Big><Lbl>{fmtMXN(c.nph)}/hr</Lbl></div>
            </div>
          </Card>
        )
      })}
    </div>
  );
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────
function StatsTab({cfg,trips}){
  const[range,setRange]=useState(30);
  const cutoff=Date.now()-range*86400000;
  const filtered=trips.filter(t=>new Date(t.created_at||t.end_time||0).getTime()>=cutoff);
  const byDate={};
  filtered.forEach(t=>{const d=t.date||today();const c=calcTrip(t,cfg);if(!byDate[d])byDate[d]={date:d,net:0,km:0,trips:0,min:0,gas:0,gross:0};byDate[d].net+=c.net;byDate[d].km+=c.km;byDate[d].min+=c.min;byDate[d].gas+=c.gas;byDate[d].gross+=c.fare;byDate[d].trips+=1;});
  const chart=Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,nph:d.min>0?d.net/(d.min/60):0,label:new Date(d.date).toLocaleDateString("es-MX",{day:"numeric",month:"short"})}));
  const tot=filtered.reduce((a,t)=>{const c=calcTrip(t,cfg);return{net:a.net+c.net,km:a.km+c.km,gas:a.gas+c.gas,gross:a.gross+c.fare,min:a.min+c.min};},{net:0,km:0,gas:0,gross:0,min:0});
  const byPlat={};filtered.forEach(t=>{const p=t.platform||"uber";if(!byPlat[p])byPlat[p]={name:p.toUpperCase(),net:0,count:0};byPlat[p].net+=calcTrip(t,cfg).net;byPlat[p].count++;});
  const platData=Object.values(byPlat);const PIE=[C.accent,C.teal,"#a855f7","#f43f5e"];
  const byHour={};filtered.forEach(t=>{const h=new Date(t.created_at||t.end_time||0).getHours();if(!byHour[h])byHour[h]={hour:h,net:0,count:0};byHour[h].net+=calcTrip(t,cfg).net;byHour[h].count++;});
  const hourData=Object.values(byHour).sort((a,b)=>a.hour-b.hour).map(d=>({...d,label:`${d.hour}h`,avg:d.count>0?d.net/d.count:0}));
  const bestH=hourData.length>0?hourData.reduce((b,d)=>d.avg>b.avg?d:b):null;
  const bestD=chart.length>0?chart.reduce((b,d)=>d.net>b.net?d:b):null;
  const Tip=({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:11}}><div style={{color:C.muted,marginBottom:4}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: {fmtMXN(p.value)}</div>)}</div>;};

  return(
    <div className="fu" style={{padding:"15px 14px 90px"}}>
      <div className="B" style={{fontSize:22,fontWeight:800,color:C.accent,marginBottom:13,letterSpacing:1}}>ESTADÍSTICAS</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
        {[7,14,30,60].map(r=><button key={r} onClick={()=>setRange(r)} style={{padding:"8px 4px",background:range===r?`${C.accent}1e`:"transparent",border:`1px solid ${range===r?C.accent:C.border}`,borderRadius:7,color:range===r?C.accent:C.muted,fontSize:11,fontWeight:700}}>{r}D</button>)}
      </div>
      {filtered.length===0?(
        <div style={{textAlign:"center",padding:"50px 0",color:C.dim}}><div style={{fontSize:34,marginBottom:9}}>📊</div><Lbl>Registra viajes para ver estadísticas</Lbl></div>
      ):<>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:13}}>
          {[{l:"Neto total",v:fmtMXN(tot.net),c:tot.net>=0?C.teal:C.danger},{l:"Viajes",v:filtered.length,c:C.text},{l:"Km recorridos",v:`${fmt(tot.km,0)} km`,c:C.accent},{l:"Promedio/viaje",v:fmtMXN(filtered.length>0?tot.net/filtered.length:0),c:C.teal},{l:"$/hora promedio",v:fmtMXN(tot.min>0?tot.net/(tot.min/60):0),c:C.accent},{l:"Gas total",v:fmtMXN(tot.gas),c:C.danger}].map(({l,v,c})=>(
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

function AITab(){ return <div className="fu" style={{padding:"15px 14px 100px"}}><Big size={22} color={C.teal}>ASESOR IA</Big></div>; }
function ConfigTab({cfg,saveConfig,onLogout}){ return <div className="fu" style={{padding:"15px 14px 100px"}}><Big size={22} color={C.accent}>AJUSTES</Big><Btn full onClick={onLogout} color={C.danger} outline s={{marginTop:20}}>Cerrar sesión</Btn></div>; }

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth({onDone}){
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) alert(error.message);
  };
  return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <form onSubmit={handleLogin} style={{width:"100%",maxWidth:320,textAlign:"center"}}>
        <Big size={36} color={C.accent} s={{letterSpacing:2}}>RUTAFLOW</Big>
        <div style={{marginTop:30,display:"flex",flexDirection:"column",gap:10}}>
          <input type="email" placeholder="Correo" value={email} onChange={e=>setEmail(e.target.value)} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,padding:12,color:"#fff",borderRadius:8}}/>
          <input type="password" placeholder="Contraseña" value={pass} onChange={e=>setPass(e.target.value)} style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,padding:12,color:"#fff",borderRadius:8}}/>
          <Btn full type="submit">Entrar</Btn>
        </div>
      </form>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
const DCFG={gasPricePerLiter:24,kmPerLiter:12,targetHourlyRate:200,platformCut:10};

export default function RutaFlow(){
  const[tab,setTab]=useState("home");
  const[cfg,setCfg]=useState(DCFG);
  const[trips,setTrips]=useState([]);
  const[activeDay,setActiveDay]=useState(null);
  const[session,setSession]=useState(null);
  const[loading,setLoading]=useState(true);
  const[toast,setToast]=useState(null);
  
  // Estados de modales (Subidos al Root para que floten sobre la NAV)
  const[selTrip, setSelTrip]=useState(null);
  const[showNew, setShowNew]=useState(false);

  const showToast=(msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);};
  const { dayKm, reset: resetDayGPS } = useDayGPS(!!activeDay?.running);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);if(session)loadCloud(session.user.id);else setLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((ev,session)=>{setSession(session);if(session)loadCloud(session.user.id);else setLoading(false);});
    return()=>subscription.unsubscribe();
  },[]);

  const loadCloud=async uid=>{
    setLoading(true);
    const[{data:tr},{data:pr},{data:ad}]=await Promise.all([
      supabase.from("trips").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
      supabase.from("profiles").select("*").eq("id",uid).single(),
      supabase.from("active_days").select("*").eq("user_id",uid).maybeSingle(),
    ]);
    if(tr)setTrips(tr);
    if(pr?.config)setCfg({...DCFG,...pr.config});
    if(ad){setActiveDay({id:ad.id,startTime:new Date(ad.start_time).getTime(),running:true});}
    setLoading(false);
  };

  const saveTrip=async data=>{
    const{data:saved,error}=await supabase.from("trips").insert([{user_id:session.user.id, ...data}]).select().single();
    if(!error){setTrips(p=>[saved,...p]);showToast("Viaje guardado");return true;}
    return false;
  };

  const startDay=async()=>{
    const{data,error}=await supabase.from("active_days").upsert({user_id:session.user.id,date:today(),start_time:new Date().toISOString()}).select().single();
    if(!error)setActiveDay({id:data.id,startTime:new Date(data.start_time).getTime(),running:true});
  };

  const endDay=async()=>{
    await supabase.from("active_days").delete().eq("user_id",session.user.id);
    resetDayGPS(); setActiveDay(null); showToast("Jornada cerrada");
  };

  if(loading) return <div style={{background:C.bg,minHeight:"100vh"}}/>;
  if(!session) return <Auth/>;

  const todayNet=trips.filter(t=>t.date===today()).reduce((s,t)=>s+calcTrip(t,cfg).net,0);
  const NAV=[{id:"home",d:IC.home,l:"Hoy"},{id:"trips",d:IC.trips,l:"Viajes"},{id:"stats",d:IC.stats,l:"Stats"},{id:"ai",d:IC.ai,l:"IA"},{id:"config",d:IC.cfg,l:"Config"}];

  return(
    <>
      <style>{CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
   <div style={{background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto", position:"relative", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)"}}>
        <div style={{
  background: C.card, 
  padding: `calc(10px + env(safe-area-inset-top)) 15px 10px`, 
  display: "flex", 
  justifyContent: "space-between", 
  position: "sticky", 
  top: 0, 
  zIndex: 10, 
  borderBottom: `1px solid ${C.border}`
}}>
          <Big size={19} color={C.accent}>RUTAFLOW</Big>
          <div style={{textAlign:"right"}}><Lbl>Hoy neto</Lbl><Big size={21} color={todayNet>=0?C.teal:C.danger}>{fmtMXN(todayNet)}</Big></div>
        </div>

        {tab==="home"   && <HomeTab cfg={cfg} trips={trips} activeDay={activeDay} startDay={startDay} onEndDay={endDay} onNew={()=>setShowNew(true)} dayKm={dayKm} onSelect={setSelTrip}/>}
        {tab==="trips"  && <TripsTab cfg={cfg} trips={trips} onSelect={setSelTrip} onNew={()=>setShowNew(true)}/>}
        {tab==="stats"  && <StatsTab cfg={cfg} trips={trips}/>}
        {tab==="ai"     && <AITab/>}
        {tab==="config" && <ConfigTab cfg={cfg} onLogout={()=>supabase.auth.signOut()}/>}

        {/* NAVEGACIÓN FIJA AL FINAL */}
       <div style={{position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.card, borderTop: `1px solid ${C.border}`, display:"flex", zIndex:100, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", paddingTop: "10px"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{flex:1,padding:"12px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:tab===n.id?C.accent:C.dim}}>
              <SVG d={n.d} size={18} color={tab===n.id?C.accent:C.dim}/>
              <span style={{fontSize:9}}>{n.l}</span>
            </button>
          ))}
        </div>

        {/* MODALES: Renderizados después de la NAV para que floten encima */}
        {showNew && <TripModal cfg={cfg} saveTrip={saveTrip} activeDay={activeDay} onClose={()=>setShowNew(false)}/>}
        {selTrip && <TripDetail trip={selTrip} cfg={cfg} onClose={()=>setSelTrip(null)} onSave={async(id,d)=>{await supabase.from("trips").update(d).eq("id",id); loadCloud(session.user.id);}} onDelete={async(id)=>{await supabase.from("trips").delete().eq("id",id); loadCloud(session.user.id);}}/>}
      </div>
    </>
  );
}
