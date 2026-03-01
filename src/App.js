import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from "recharts";
import { supabase } from "./supabaseClient";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg:     "#07080d",
  card:   "#0d0f1a",
  card2:  "#111320",
  border: "#1a1d2e",
  bord2:  "#242740",
  accent: "#f0a500",
  teal:   "#00c9a7",
  danger: "#ff4055",
  dim:    "#3a3d55",
  muted:  "#6b6e8a",
  text:   "#dde0f5",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt      = (n, d = 2) => (parseFloat(n) || 0).toFixed(d);
const fmtMXN   = (n) => `$${fmt(n)}`;
const fmtPct   = (n) => `${fmt(n, 1)}%`;
const ms        = () => Date.now();
const todayStr  = () => new Date().toISOString().split("T")[0];
const fmtDate   = (d) => new Date(d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
const fmtHour   = (d) => new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
const fmtClock  = (millis) => {
  const s = Math.floor(Math.abs(millis) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
};
const haversine = (a, b) => {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const x = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// ─── CÁLCULO ─────────────────────────────────────────────────────────────────
const calcTrip = (trip, cfg) => {
  const gpsKm  = parseFloat(trip.gps_km)  || 0;
  const gpsMin = parseFloat(trip.gps_min) || 0;
  const totalKm  = gpsKm  > 0 ? gpsKm  : (parseFloat(trip.pickup_km)  || 0) + (parseFloat(trip.dest_km)  || 0);
  const totalMin = gpsMin > 0 ? gpsMin : (parseFloat(trip.pickup_min) || 0) + (parseFloat(trip.dest_min) || 0);
  const fare     = parseFloat(trip.fare) || 0;
  const gasCost  = (totalKm / (cfg.kmPerLiter || 12)) * (cfg.gasPricePerLiter || 24);
  const platFee  = fare * ((cfg.platformCut || 10) / 100);
  const p2d = { diario:1, semanal:7, mensual:30, trimestral:90, semestral:180, anual:365 };
  let fixedCost = 0;
  if (cfg.rentaEnabled)         fixedCost += (cfg.rentaMonto || 0) / (p2d[cfg.rentaPeriodo] || 30);
  if (cfg.seguroEnabled)        fixedCost += (cfg.seguroMonto || 0) / (p2d[cfg.seguroPeriodo] || 30);
  if (cfg.llantasEnabled)       fixedCost += ((cfg.llantasMonto || 0) / (cfg.llantasKmVida || 40000)) * totalKm;
  if (cfg.mantenimientoEnabled) fixedCost += ((cfg.mantenimientoMonto || 0) / (cfg.mantenimientoKmVida || 5000)) * totalKm;
  const netEarning = fare - platFee - gasCost - fixedCost;
  const hours = totalMin / 60;
  return {
    totalKm, totalMin, fare, gasCost, platFee, fixedCost,
    netEarning, hours,
    netPerHour: hours > 0 ? netEarning / hours : 0,
    netPerKm:   totalKm > 0 ? netEarning / totalKm : 0,
    grossPct:   fare > 0 ? (netEarning / fare) * 100 : 0,
  };
};

// ─── ÍCONOS SVG inline ───────────────────────────────────────────────────────
const SVG = ({ d, size = 18, color = "currentColor", fill = "none", sw = 1.8 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const IC = {
  home:   "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  trips:  "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  stats:  "M18 20V10 M12 20V4 M6 20v-6",
  ai:     ["M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3","M12 17h.01","M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"],
  config: ["M12 15a3 3 0 100-6 3 3 0 000 6z","M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"],
  play:   "M5 3l14 9-14 9V3z",
  stop:   "M6 6h12v12H6z",
  plus:   "M12 5v14 M5 12h14",
  gps:    ["M12 2a7 7 0 017 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 017-7z","M12 11a2 2 0 100-4 2 2 0 000 4z"],
  cam:    ["M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z","M12 17a4 4 0 100-8 4 4 0 000 8z"],
  trash:  ["M3 6h18","M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"],
  check:  "M20 6L9 17l-5-5",
  eye:    ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z","M12 9a3 3 0 100 6 3 3 0 000-6z"],
  mail:   ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z","M22 6l-10 7L2 6"],
  lock:   ["M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z","M7 11V7a5 5 0 0110 0v4"],
  user:   ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2","M12 11a4 4 0 100-8 4 4 0 000 8z"],
  logout: ["M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4","M16 17l5-5-5-5","M21 12H9"],
  back:   "M15 18l-6-6 6-6",
  send:   "M22 2L11 13 M22 2L15 22l-4-9-9-4 22-7z",
  info:   ["M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z","M12 16v-4","M12 8h.01"],
};

// ─── CSS GLOBAL ───────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:0;height:0;}
body{background:#07080d;color:#dde0f5;font-family:'IBM Plex Mono',monospace;-webkit-font-smoothing:antialiased;overflow-x:hidden;}
input,select,textarea{font-family:'IBM Plex Mono',monospace;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
button{cursor:pointer;font-family:'IBM Plex Mono',monospace;border:none;background:none;}
button:active{transform:scale(0.97);}
.B{font-family:'Barlow Condensed',sans-serif;}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.fu{animation:fadeUp .3s ease forwards;}
.pu{animation:pulse 2s ease-in-out infinite;}
.sp{animation:spin .75s linear infinite;}
.su{animation:slideUp .28s cubic-bezier(.32,.72,0,1) forwards;}
`;

// ─── ATOMS ───────────────────────────────────────────────────────────────────
const Card = ({ children, s, onClick }) => (
  <div onClick={onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: 15, ...s }}>
    {children}
  </div>
);

const Lbl = ({ children, color = C.muted, s }) => (
  <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color, fontWeight: 600, ...s }}>{children}</div>
);

const Big = ({ children, size = 24, color = C.text, s }) => (
  <div className="B" style={{ fontSize: size, fontWeight: 800, color, lineHeight: 1, ...s }}>{children}</div>
);

const Pill = ({ platform }) => {
  const cols = { uber: "#00b4d8", didi: "#ff6b35", beat: "#a855f7", otra: C.muted };
  const p = (platform || "uber").toLowerCase();
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: cols[p] || C.muted,
      textTransform: "uppercase", background: `${cols[p] || C.muted}18`, padding: "2px 7px", borderRadius: 4 }}>
      {p}
    </span>
  );
};

const Btn = ({ children, onClick, color = C.accent, outline = false, sm = false, disabled = false, s, full }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: sm ? "7px 13px" : "12px 18px",
    background: outline ? "transparent" : `${color}1e`,
    border: `${outline ? 1 : 2}px solid ${disabled ? C.dim : color}`,
    borderRadius: 9, color: disabled ? C.dim : color,
    fontSize: sm ? 10 : 11, fontWeight: 700, letterSpacing: "0.12em",
    textTransform: "uppercase", display: "inline-flex", alignItems: "center",
    justifyContent: "center", gap: 7, transition: "all .15s",
    width: full ? "100%" : undefined, opacity: disabled ? .5 : 1,
    cursor: disabled ? "not-allowed" : "pointer", ...s
  }}>{children}</button>
);

const Inp = ({ label, value, onChange, type = "text", unit, placeholder = "0", big }) => (
  <div>
    {label && <Lbl s={{ marginBottom: 5 }}>{label}</Lbl>}
    <div style={{ position: "relative" }}>
      <input type={type} step="any" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={e => e.target.style.borderColor = C.accent}
        onBlur={e => e.target.style.borderColor = C.border}
        style={{ width: "100%", background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: big ? "13px 42px 13px 13px" : "9px 34px 9px 11px",
          color: "#fff", fontSize: big ? 26 : 15, fontFamily: "inherit", outline: "none", fontWeight: big ? 700 : 400 }} />
      {unit && <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: C.muted }}>{unit}</span>}
    </div>
  </div>
);

const Spinner = () => (
  <div className="sp" style={{ width: 16, height: 16, border: `2px solid transparent`, borderTopColor: "currentColor", borderRadius: "50%" }} />
);

// ─── MODAL: DETALLE VIAJE ─────────────────────────────────────────────────────
function TripDetailModal({ trip, cfg, onClose }) {
  const c = calcTrip(trip, cfg);
  const isGood = c.netPerHour >= cfg.targetHourlyRate;
  const isOk   = c.netPerHour >= cfg.targetHourlyRate * 0.75;
  const verdict = isGood
    ? { color: C.teal,   label: "✅ Excelente viaje" }
    : isOk
    ? { color: C.accent, label: "⚠️ Viaje aceptable" }
    : { color: C.danger, label: "❌ No rentable" };

  const rows = [
    { lbl: "Tarifa bruta",                                       val: fmtMXN(c.fare),      color: C.text },
    { lbl: `Comisión plataforma (${cfg.platformCut}%)`,          val: `-${fmtMXN(c.platFee)}`, color: C.danger },
    { lbl: `Gasolina · ${fmt(c.totalKm,1)}km ÷ ${cfg.kmPerLiter}km/L × $${cfg.gasPricePerLiter}`, val: `-${fmtMXN(c.gasCost)}`, color: C.danger },
    ...(c.fixedCost > 0 ? [{ lbl: "Gastos fijos amortizados", val: `-${fmtMXN(c.fixedCost)}`, color: C.danger }] : []),
    { lbl: "GANANCIA NETA", val: fmtMXN(c.netEarning), color: c.netEarning >= 0 ? C.teal : C.danger, bold: true },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.87)", zIndex: 9999,
      display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="su"
        style={{ background: C.card, borderTop: `2px solid ${C.bord2}`, borderRadius: "20px 20px 0 0",
          maxHeight: "90vh", overflowY: "auto", padding: "22px 18px 40px" }}>
        <div style={{ width: 32, height: 3, background: C.bord2, borderRadius: 4, margin: "0 auto 18px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <Big size={21} color={C.accent} s={{ letterSpacing: 1 }}>DESGLOSE DEL VIAJE</Big>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3, display: "flex", gap: 8, alignItems: "center" }}>
              {fmtDate(trip.created_at || trip.timestamp)} · <Pill platform={trip.platform} />
              {trip.start_time && <span>{fmtHour(trip.start_time)}</span>}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Big size={26} color={verdict.color}>{fmtMXN(c.netEarning)}</Big>
            <div style={{ fontSize: 10, color: verdict.color, marginTop: 3 }}>{verdict.label}</div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginBottom: 18 }}>
          {[
            { l: "Duración",  v: `${c.totalMin.toFixed(0)} min`, c: C.text },
            { l: "Distancia", v: `${fmt(c.totalKm,1)} km`,       c: C.text },
            { l: "$/hora",    v: fmtMXN(c.netPerHour),           c: isGood ? C.teal : isOk ? C.accent : C.danger },
            { l: "$/km",      v: fmtMXN(c.netPerKm),             c: C.text },
            { l: "% neto",    v: fmtPct(c.grossPct),             c: c.grossPct > 40 ? C.teal : C.accent },
            { l: "Gas",       v: fmtMXN(c.gasCost),              c: C.danger },
          ].map(({ l, v, c: col }) => (
            <div key={l} style={{ background: C.card2, borderRadius: 9, padding: "9px 11px" }}>
              <Lbl s={{ marginBottom: 4 }}>{l}</Lbl>
              <Big size={15} color={col}>{v}</Big>
            </div>
          ))}
        </div>

        {/* Desglose */}
        <Lbl s={{ marginBottom: 9 }}>Desglose contable</Lbl>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 13px", borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : "none",
              background: r.bold ? `${C.accent}08` : "transparent" }}>
              <div style={{ fontSize: r.bold ? 11 : 10, color: r.bold ? C.text : C.muted, fontWeight: r.bold ? 700 : 400 }}>{r.lbl}</div>
              <div className={r.bold ? "B" : ""} style={{ fontSize: r.bold ? 17 : 13, color: r.color, fontWeight: r.bold ? 800 : 600 }}>{r.val}</div>
            </div>
          ))}
        </div>

        {/* GPS detail */}
        {(trip.gps_km > 0 || trip.start_time) && (
          <div style={{ background: C.card2, borderRadius: 10, padding: "12px 13px", marginBottom: 16 }}>
            <Lbl s={{ marginBottom: 9 }}>Registro GPS / tiempo</Lbl>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              {trip.start_time && <div><Lbl s={{ marginBottom: 3 }}>Inicio</Lbl><div style={{ fontSize: 13 }}>{fmtHour(trip.start_time)}</div></div>}
              {trip.end_time   && <div><Lbl s={{ marginBottom: 3 }}>Fin</Lbl><div style={{ fontSize: 13 }}>{fmtHour(trip.end_time)}</div></div>}
              {trip.gps_km > 0 && <div><Lbl s={{ marginBottom: 3 }}>GPS km</Lbl><Big size={16} color={C.teal}>{fmt(trip.gps_km,2)} km</Big></div>}
              {trip.gps_min > 0 && <div><Lbl s={{ marginBottom: 3 }}>GPS min</Lbl><Big size={16} color={C.teal}>{fmt(trip.gps_min,0)} min</Big></div>}
            </div>
          </div>
        )}

        <Btn full onClick={onClose}>Cerrar</Btn>
      </div>
    </div>
  );
}

// ─── MODAL: NUEVO VIAJE ───────────────────────────────────────────────────────
function TripModal({ cfg, trips, saveTrip, activeDay, onClose }) {
  const [mode,     setMode]     = useState("manual");
  const [trip,     setTrip]     = useState({ fare:"", pickup_km:"", pickup_min:"", dest_km:"", dest_min:"", platform:"uber" });
  const [phase,    setPhase]    = useState(0);
  const [gpsOn,    setGpsOn]    = useState(false);
  const [gpsStatus,setGpsStatus]= useState("");
  const [gpsMs,    setGpsMs]    = useState(0);
  const [proc,     setProc]     = useState(false);
  const [prevImg,  setPrevImg]  = useState(null);

  const watchRef   = useRef(null);
  const timerRef   = useRef(null);
  const startRef   = useRef(null);
  const distRef    = useRef(0);
  const lastRef    = useRef(null);
  const fileRef    = useRef();

  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(timerRef.current);
  }, []);

  const setF = (k, v) => setTrip(p => ({ ...p, [k]: v }));

  const startGPS = () => {
    if (!navigator.geolocation) { setGpsStatus("GPS no disponible en este dispositivo"); return; }
    distRef.current = 0;
    lastRef.current = null;
    startRef.current = Date.now();
    setGpsOn(true);
    setGpsMs(0);
    setGpsStatus("📍 Buscando señal...");

    timerRef.current = setInterval(() => setGpsMs(Date.now() - startRef.current), 1000);

    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords: { latitude: lat, longitude: lon } }) => {
        if (lastRef.current) {
          const d = haversine(lastRef.current, { lat, lon });
          if (d > 0.005) distRef.current += d;
        }
        lastRef.current = { lat, lon };
        setGpsStatus(`📍 ${distRef.current.toFixed(2)} km`);
      },
      () => setGpsStatus("⚠️ Error GPS — verifica permisos"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const stopGPS = () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    clearInterval(timerRef.current);
    const mins = ((Date.now() - startRef.current) / 60000).toFixed(1);
    setTrip(p => ({ ...p, gps_km: distRef.current.toFixed(2), gps_min: mins }));
    setGpsOn(false);
    setGpsStatus(`✅ ${distRef.current.toFixed(2)} km · ${mins} min`);
  };

  const handlePhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setProc(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = ev.target.result.split(",")[1];
      setPrevImg(ev.target.result);
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 200,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
              { type: "text", text: `Analiza esta captura de app de transporte. Extrae solo: tarifa total MXN, km al destino, minutos al destino. Responde SOLO JSON: {"fare":0,"dest_km":0,"dest_min":0}` }
            ]}]
          })
        });
        const data = await res.json();
        const txt = data.content?.find(b => b.type === "text")?.text || "{}";
        const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
        setTrip(p => ({ ...p, fare: String(parsed.fare || ""), dest_km: String(parsed.dest_km || ""), dest_min: String(parsed.dest_min || "") }));
        setMode("manual"); setPhase(1);
      } catch { alert("No pude leer la imagen. Intenta manualmente."); }
      setProc(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!trip.fare) return;
    await saveTrip({
      ...trip,
      fare:       parseFloat(trip.fare),
      pickup_km:  parseFloat(trip.pickup_km  || 0),
      pickup_min: parseFloat(trip.pickup_min || 0),
      dest_km:    parseFloat(trip.dest_km    || 0),
      dest_min:   parseFloat(trip.dest_min   || 0),
      gps_km:     parseFloat(trip.gps_km     || 0),
      gps_min:    parseFloat(trip.gps_min    || 0),
      date:       todayStr(),
      start_time: trip.start_time || null,
      end_time:   new Date().toISOString(),
      day_id:     activeDay?.id || null,
    });
    onClose();
  };

  const calc = calcTrip(trip, cfg);
  const hasData = trip.fare && (trip.dest_km || trip.dest_min || parseFloat(trip.gps_km) > 0);
  const verdict = calc.netPerHour >= cfg.targetHourlyRate
    ? { color: C.teal,   label: "✅ Excelente" }
    : calc.netPerHour >= cfg.targetHourlyRate * 0.75
    ? { color: C.accent, label: "⚠️ Aceptable" }
    : { color: C.danger, label: "❌ No conviene" };

  const modeBtnStyle = (id) => ({
    padding: "8px 4px", borderRadius: 8, fontSize: 10, fontWeight: 600,
    letterSpacing: "0.05em", fontFamily: "inherit",
    background: mode === id ? `${C.teal}1e` : "transparent",
    border: `1px solid ${mode === id ? C.teal : C.border}`,
    color: mode === id ? C.teal : C.muted,
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", zIndex: 9999,
      display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="su"
        style={{ background: C.card, borderTop: `2px solid ${C.bord2}`, borderRadius: "20px 20px 0 0",
          maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header fijo */}
        <div style={{ padding: "18px 18px 0", flexShrink: 0 }}>
          <div style={{ width: 30, height: 3, background: C.bord2, borderRadius: 4, margin: "0 auto 14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
            <Big size={19} color={C.accent} s={{ letterSpacing: 1 }}>NUEVO VIAJE</Big>
            <button onClick={onClose} style={{ color: C.muted, fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>
          {/* Plataforma */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 11 }}>
            {["uber","didi","beat","otra"].map(p => (
              <button key={p} onClick={() => setF("platform", p)} style={{
                padding: "7px 4px", background: trip.platform === p ? `${C.accent}1e` : "transparent",
                border: `1px solid ${trip.platform === p ? C.accent : C.border}`, borderRadius: 7,
                color: trip.platform === p ? C.accent : C.muted, fontSize: 10,
                letterSpacing: "0.08em", textTransform: "uppercase" }}>{p}</button>
            ))}
          </div>
          {/* Modos */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginBottom: 11 }}>
            {[{id:"manual",l:"✍️ Manual"},{id:"gps",l:"📍 GPS"},{id:"photo",l:"📸 Foto IA"}].map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={modeBtnStyle(m.id)}>{m.l}</button>
            ))}
          </div>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px", WebkitOverflowScrolling: "touch" }}>
          {/* Tarifa grande */}
          <div style={{ marginBottom: 13 }}>
            <Lbl s={{ marginBottom: 5 }}>💰 Tarifa del viaje (MXN)</Lbl>
            <input type="number" step="any" value={trip.fare} onChange={e => setF("fare", e.target.value)}
              placeholder="0.00"
              onFocus={e => e.target.style.borderColor = C.accent}
              onBlur={e => e.target.style.borderColor = C.border}
              style={{ width: "100%", background: "#0a0b14", border: `1px solid ${C.border}`, borderRadius: 10,
                padding: "13px 14px", color: C.accent, fontSize: 36, fontFamily: "inherit",
                fontWeight: 700, outline: "none", textAlign: "center" }} />
          </div>

          {/* GPS */}
          {mode === "gps" && (
            <div style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 15, marginBottom: 13 }}>
              <Lbl s={{ marginBottom: 11 }}>Rastreo GPS en tiempo real</Lbl>
              {gpsOn && (
                <div className="B" style={{ fontSize: 44, fontWeight: 900, color: C.teal, textAlign: "center", marginBottom: 10 }}>
                  {fmtClock(gpsMs)}
                </div>
              )}
              {gpsStatus && (
                <div style={{ fontSize: 13, color: gpsOn ? C.teal : C.muted, textAlign: "center", marginBottom: 12 }}>{gpsStatus}</div>
              )}
              {!gpsOn ? (
                <Btn full onClick={startGPS} color={C.teal}>
                  <SVG d={IC.gps} size={13} color={C.teal} /> Iniciar GPS
                </Btn>
              ) : (
                <Btn full onClick={stopGPS} color={C.danger}>
                  <SVG d={IC.stop} size={13} color={C.danger} fill={C.danger} /> Finalizar viaje GPS
                </Btn>
              )}
              {trip.gps_km && !gpsOn && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 11 }}>
                  <div style={{ background: C.card, borderRadius: 8, padding: "8px 11px" }}>
                    <Lbl s={{ marginBottom: 3 }}>Km GPS</Lbl>
                    <Big size={17} color={C.teal}>{fmt(trip.gps_km,2)} km</Big>
                  </div>
                  <div style={{ background: C.card, borderRadius: 8, padding: "8px 11px" }}>
                    <Lbl s={{ marginBottom: 3 }}>Tiempo</Lbl>
                    <Big size={17} color={C.teal}>{fmt(trip.gps_min,0)} min</Big>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual */}
          {mode === "manual" && (
            <div style={{ marginBottom: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 9 }}>
                {[{id:0,l:"📍 Recolección"},{id:1,l:"🏁 Destino"}].map(ph => (
                  <button key={ph.id} onClick={() => setPhase(ph.id)} style={{
                    padding: "8px", background: phase === ph.id ? `${C.accent}1a` : "transparent",
                    border: `1px solid ${phase === ph.id ? C.accent : C.border}`, borderRadius: 8,
                    color: phase === ph.id ? C.accent : C.muted, fontSize: 10, fontWeight: 600 }}>
                    {ph.l}
                  </button>
                ))}
              </div>
              {phase === 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  <Inp label="km para recoger"    type="number" value={trip.pickup_km}  onChange={v => setF("pickup_km",  v)} unit="km"  />
                  <Inp label="min para recoger"   type="number" value={trip.pickup_min} onChange={v => setF("pickup_min", v)} unit="min" />
                </div>
              )}
              {phase === 1 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  <Inp label="km al destino"      type="number" value={trip.dest_km}    onChange={v => setF("dest_km",    v)} unit="km"  />
                  <Inp label="min al destino"     type="number" value={trip.dest_min}   onChange={v => setF("dest_min",   v)} unit="min" />
                </div>
              )}
            </div>
          )}

          {/* Foto IA */}
          {mode === "photo" && (
            <div style={{ marginBottom: 13 }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
              {proc ? (
                <div style={{ textAlign: "center", padding: "30px 0" }}>
                  <div className="sp" style={{ width: 30, height: 30, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", margin: "0 auto 11px" }} />
                  <Lbl>Analizando con IA...</Lbl>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} style={{
                  width: "100%", padding: "28px 18px", background: `${C.accent}0a`,
                  border: `2px dashed ${C.accent}44`, borderRadius: 12, color: C.accent,
                  fontSize: 11, letterSpacing: "0.1em", fontWeight: 700,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <SVG d={IC.cam} size={26} color={C.accent} />
                  SUBE CAPTURA DE UBER / DIDI
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>La IA extrae tarifa, km y tiempo automáticamente</span>
                </button>
              )}
              {prevImg && <img src={prevImg} alt="preview" style={{ width: "100%", borderRadius: 8, marginTop: 10, opacity: .5 }} />}
            </div>
          )}

          {/* Preview rentabilidad */}
          {hasData && (
            <div style={{ background: `${verdict.color}10`, border: `1px solid ${verdict.color}33`,
              borderRadius: 11, padding: "13px 14px", marginBottom: 13 }}>
              <div className="B" style={{ fontSize: 15, color: verdict.color, marginBottom: 9 }}>{verdict.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                {[
                  { l:"NETO",     v: fmtMXN(calc.netEarning), c: calc.netEarning >= 0 ? C.teal : C.danger },
                  { l:"POR HORA", v: fmtMXN(calc.netPerHour), c: verdict.color },
                  { l:"POR KM",   v: fmtMXN(calc.netPerKm),   c: C.muted },
                ].map(({ l, v, c }) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <Lbl s={{ marginBottom: 3 }}>{l}</Lbl>
                    <Big size={15} color={c}>{v}</Big>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer fijo */}
        <div style={{ padding: "12px 18px 30px", flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 9 }}>
          <Btn onClick={onClose} color={C.muted} outline>Cancelar</Btn>
          <Btn full onClick={handleSave} disabled={!trip.fare || gpsOn}>
            <SVG d={IC.check} size={13} color={!trip.fare || gpsOn ? C.dim : C.accent} /> Guardar viaje
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: HOME ────────────────────────────────────────────────────────────────
function HomeTab({ cfg, trips, activeDay, saveTrip, startDay, endDay }) {
  const [elapsed,  setElapsed]  = useState(0);
  const [modal,    setModal]    = useState(false);
  const [detail,   setDetail]   = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (activeDay?.running) {
      timerRef.current = setInterval(() => setElapsed(Date.now() - activeDay.startTime), 1000);
    } else { clearInterval(timerRef.current); setElapsed(0); }
    return () => clearInterval(timerRef.current);
  }, [activeDay]);

  const todayTrips = trips.filter(t => t.date === todayStr());
  const stats = todayTrips.reduce((a, t) => {
    const c = calcTrip(t, cfg);
    return { net: a.net + c.netEarning, km: a.km + c.totalKm };
  }, { net: 0, km: 0 });

  return (
    <div className="fu" style={{ padding: "15px 14px 90px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 15 }}>
        <Lbl s={{ marginBottom: 3 }}>Ganancia neta hoy</Lbl>
        <div className="B" style={{ fontSize: 58, fontWeight: 900, color: stats.net >= 0 ? C.teal : C.danger, lineHeight: 1 }}>
          {fmtMXN(stats.net)}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>
          {todayTrips.length} viajes · {fmt(stats.km,1)} km
        </div>
      </div>

      {/* Jornada */}
      <Card s={{ marginBottom: 13 }}>
        <Lbl s={{ marginBottom: 12 }}>Estado de jornada</Lbl>
        {!activeDay ? (
          <Btn full onClick={startDay} color={C.teal}>
            <SVG d={IC.play} size={13} color={C.teal} fill={C.teal} /> Iniciar jornada de trabajo
          </Btn>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="pu" style={{ fontSize: 9, color: C.danger, letterSpacing: "0.2em", marginBottom: 3 }}>● GRABANDO</div>
                <div className="B" style={{ fontSize: 42, fontWeight: 900, color: C.teal, lineHeight: 1 }}>{fmtClock(elapsed)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Big size={28}>{todayTrips.length}</Big>
                <Lbl s={{ marginTop: 2 }}>viajes</Lbl>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <Btn full onClick={() => setModal(true)} color={C.accent}>
                <SVG d={IC.plus} size={13} color={C.accent} /> Nuevo viaje
              </Btn>
              <Btn onClick={endDay} color={C.danger}>
                <SVG d={IC.stop} size={12} color={C.danger} fill={C.danger} /> Fin
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {/* Lista hoy */}
      {todayTrips.length > 0 && (
        <Card>
          <Lbl s={{ marginBottom: 12 }}>Viajes de hoy <span style={{ color: C.muted }}>— toca para desglose</span></Lbl>
          {[...todayTrips].reverse().slice(0, 6).map(t => {
            const c = calcTrip(t, cfg);
            const col = c.netPerHour >= cfg.targetHourlyRate ? C.teal : c.netPerHour >= cfg.targetHourlyRate * .75 ? C.accent : C.danger;
            return (
              <div key={t.id || t.created_at} onClick={() => setDetail(t)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <Pill platform={t.platform} />
                    {t.gps_km > 0 && <span style={{ fontSize: 9, color: C.teal }}>📍GPS</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {fmtMXN(t.fare)} · {fmt(c.totalKm,1)}km · {c.totalMin.toFixed(0)}min
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Big size={18} color={col}>{fmtMXN(c.netEarning)}</Big>
                  <Lbl s={{ marginTop: 2 }}>{fmtMXN(c.netPerHour)}/hr</Lbl>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {modal  && <TripModal cfg={cfg} trips={trips} saveTrip={saveTrip} activeDay={activeDay} onClose={() => setModal(false)} />}
      {detail && <TripDetailModal trip={detail} cfg={cfg} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ─── TAB: VIAJES ─────────────────────────────────────────────────────────────
function TripsTab({ cfg, trips, saveTrip, deleteTrip }) {
  const [filter, setFilter] = useState("all");
  const [modal,  setModal]  = useState(false);
  const [detail, setDetail] = useState(null);

  const filtered = trips.filter(t => {
    if (filter === "today") return t.date === todayStr();
    if (filter === "week")  { const d = new Date(); d.setDate(d.getDate() - 7); return new Date(t.created_at || t.timestamp) >= d; }
    return true;
  }).sort((a, b) => new Date(b.created_at || b.timestamp) - new Date(a.created_at || a.timestamp));

  return (
    <div className="fu" style={{ padding: "15px 14px 90px" }}>
      <div className="B" style={{ fontSize: 22, fontWeight: 800, color: C.accent, marginBottom: 13, letterSpacing: 1 }}>HISTORIAL</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
        {[{id:"all",l:"TODOS"},{id:"week",l:"SEMANA"},{id:"today",l:"HOY"}].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: "8px 4px", background: filter === f.id ? `${C.accent}1a` : "transparent",
            border: `1px solid ${filter === f.id ? C.accent : C.border}`, borderRadius: 7,
            color: filter === f.id ? C.accent : C.muted, fontSize: 10, letterSpacing: "0.1em", fontWeight: 600 }}>{f.l}</button>
        ))}
      </div>

      <Btn full onClick={() => setModal(true)} s={{ marginBottom: 12 }}>
        <SVG d={IC.plus} size={13} color={C.accent} /> Agregar viaje
      </Btn>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: C.dim }}>
          <div style={{ fontSize: 34, marginBottom: 9 }}>🚗</div>
          <Lbl>Sin viajes registrados</Lbl>
        </div>
      ) : filtered.map(t => {
        const c = calcTrip(t, cfg);
        const col = c.netPerHour >= cfg.targetHourlyRate ? C.teal : c.netPerHour >= cfg.targetHourlyRate * .75 ? C.accent : C.danger;
        return (
          <Card key={t.id || t.created_at} s={{ marginBottom: 7, cursor: "pointer" }} onClick={() => setDetail(t)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <Pill platform={t.platform} />
                  {t.gps_km > 0 && <span style={{ fontSize: 9, color: C.teal }}>📍GPS</span>}
                  <span style={{ fontSize: 9, color: C.muted }}>{fmtDate(t.created_at || t.timestamp)}</span>
                </div>
                <div style={{ fontSize: 12, color: C.text }}>{fmtMXN(t.fare)} · {fmt(c.totalKm,1)}km · {c.totalMin.toFixed(0)} min</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Gas: {fmtMXN(c.gasCost)} · Fee: {fmtMXN(c.platFee)}</div>
              </div>
              <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                <Big size={19} color={col}>{fmtMXN(c.netEarning)}</Big>
                <Lbl>{fmtMXN(c.netPerHour)}/hr</Lbl>
                <button onClick={e => { e.stopPropagation(); deleteTrip(t.id); }}
                  style={{ color: C.dim, padding: 2, marginTop: 2 }}>
                  <SVG d={IC.trash} size={13} color={C.dim} />
                </button>
              </div>
            </div>
            {/* Barra de rentabilidad */}
            <div style={{ marginTop: 9, height: 3, borderRadius: 3, background: C.card2, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(100, c.grossPct))}%`, height: "100%", background: col, borderRadius: 3 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              <Lbl>{fmtPct(Math.max(0, c.grossPct))} neto</Lbl>
              <Lbl>Toca para desglose →</Lbl>
            </div>
          </Card>
        );
      })}

      {modal  && <TripModal cfg={cfg} trips={trips} saveTrip={saveTrip} activeDay={null} onClose={() => setModal(false)} />}
      {detail && <TripDetailModal trip={detail} cfg={cfg} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ─── TAB: STATS ───────────────────────────────────────────────────────────────
function StatsTab({ cfg, trips }) {
  const [range, setRange] = useState(30);
  const cutoff = Date.now() - range * 86400000;
  const filtered = trips.filter(t => new Date(t.created_at || t.timestamp).getTime() >= cutoff);

  const byDate = {};
  filtered.forEach(t => {
    const d = t.date || todayStr();
    const c = calcTrip(t, cfg);
    if (!byDate[d]) byDate[d] = { date: d, net: 0, km: 0, trips: 0, min: 0, gas: 0, gross: 0 };
    byDate[d].net   += c.netEarning; byDate[d].km  += c.totalKm;
    byDate[d].min   += c.totalMin;   byDate[d].gas += c.gasCost;
    byDate[d].gross += c.fare;       byDate[d].trips += 1;
  });
  const chartData = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)).map(d => ({
    ...d, netPerHour: d.min > 0 ? d.net / (d.min / 60) : 0,
    label: new Date(d.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
  }));

  const totals = filtered.reduce((a, t) => {
    const c = calcTrip(t, cfg);
    return { net: a.net+c.netEarning, km: a.km+c.totalKm, gas: a.gas+c.gasCost, gross: a.gross+c.fare, min: a.min+c.totalMin };
  }, { net: 0, km: 0, gas: 0, gross: 0, min: 0 });

  // Por plataforma
  const byPlat = {};
  filtered.forEach(t => {
    const p = t.platform || "uber";
    if (!byPlat[p]) byPlat[p] = { name: p.toUpperCase(), net: 0, count: 0 };
    byPlat[p].net += calcTrip(t, cfg).netEarning; byPlat[p].count++;
  });
  const platData = Object.values(byPlat);
  const PIE = [C.accent, C.teal, "#a855f7", "#f43f5e"];

  // Por hora del día
  const byHour = {};
  filtered.forEach(t => {
    const h = new Date(t.created_at || t.timestamp).getHours();
    if (!byHour[h]) byHour[h] = { hour: h, net: 0, count: 0 };
    byHour[h].net += calcTrip(t, cfg).netEarning; byHour[h].count++;
  });
  const hourData = Object.values(byHour).sort((a,b) => a.hour - b.hour)
    .map(d => ({ ...d, label: `${d.hour}h`, avg: d.count > 0 ? d.net / d.count : 0 }));
  const bestHour = hourData.length > 0 ? hourData.reduce((b,d) => d.avg > b.avg ? d : b) : null;
  const bestDay  = chartData.length > 0 ? chartData.reduce((b,d) => d.net > b.net ? d : b) : null;

  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 11 }}>
        <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {fmtMXN(p.value)}</div>)}
      </div>
    );
  };

  return (
    <div className="fu" style={{ padding: "15px 14px 90px" }}>
      <div className="B" style={{ fontSize: 22, fontWeight: 800, color: C.accent, marginBottom: 13, letterSpacing: 1 }}>ESTADÍSTICAS</div>

      {/* Rango */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5, marginBottom: 15 }}>
        {[7,14,30,60].map(r => (
          <button key={r} onClick={() => setRange(r)} style={{
            padding: "8px 4px", background: range === r ? `${C.accent}1e` : "transparent",
            border: `1px solid ${range === r ? C.accent : C.border}`, borderRadius: 7,
            color: range === r ? C.accent : C.muted, fontSize: 11, fontWeight: 700 }}>{r}D</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: C.dim }}>
          <div style={{ fontSize: 34, marginBottom: 9 }}>📊</div>
          <Lbl>Registra viajes para ver estadísticas</Lbl>
        </div>
      ) : <>
        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 13 }}>
          {[
            { l:"Neto total",      v: fmtMXN(totals.net),                          c: totals.net>=0?C.teal:C.danger },
            { l:"Viajes",          v: filtered.length,                              c: C.text },
            { l:"Km recorridos",   v: `${fmt(totals.km,0)} km`,                    c: C.accent },
            { l:"Promedio/viaje",  v: fmtMXN(filtered.length>0?totals.net/filtered.length:0), c: C.teal },
            { l:"$/hora promedio", v: fmtMXN(totals.min>0?totals.net/(totals.min/60):0), c: C.accent },
            { l:"Gas total",       v: fmtMXN(totals.gas),                          c: C.danger },
          ].map(({ l, v, c }) => (
            <Card key={l} s={{ padding: "11px 13px" }}>
              <Lbl s={{ marginBottom: 5 }}>{l}</Lbl>
              <Big size={21} color={c}>{v}</Big>
            </Card>
          ))}
        </div>

        {/* Mejor día / hora */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 13 }}>
          {bestDay && (
            <div style={{ background: `${C.accent}10`, border: `1px solid ${C.accent}33`, borderRadius: 12, padding: "11px 13px" }}>
              <Lbl s={{ color: C.accent, marginBottom: 6 }}>🏆 Mejor día</Lbl>
              <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{fmtDate(bestDay.date)}</div>
              <Big size={19} color={C.accent}>{fmtMXN(bestDay.net)}</Big>
            </div>
          )}
          {bestHour && (
            <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 12, padding: "11px 13px" }}>
              <Lbl s={{ color: C.teal, marginBottom: 6 }}>⏰ Mejor hora</Lbl>
              <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{bestHour.hour}:00 – {bestHour.hour+1}:00</div>
              <Big size={19} color={C.teal}>{fmtMXN(bestHour.avg)}/viaje</Big>
            </div>
          )}
        </div>

        {/* Ganancia diaria */}
        <Card s={{ marginBottom: 11, padding: "13px 8px" }}>
          <Lbl s={{ marginBottom: 11, paddingLeft: 6 }}>Ganancia diaria (MXN)</Lbl>
          <ResponsiveContainer width="100%" height={145}>
            <BarChart data={chartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="net" name="neto $" radius={[4,4,0,0]}>
                {chartData.map((e, i) => <Cell key={i} fill={e.net >= 0 ? C.teal : C.danger} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Rentabilidad por hora del día */}
        {hourData.length > 0 && (
          <Card s={{ marginBottom: 11, padding: "13px 8px" }}>
            <Lbl s={{ marginBottom: 11, paddingLeft: 6 }}>Rentabilidad por hora del día</Lbl>
            <ResponsiveContainer width="100%" height={125}>
              <BarChart data={hourData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="avg" name="$/viaje" radius={[3,3,0,0]}>
                  {hourData.map((e, i) => <Cell key={i} fill={e.avg >= cfg.targetHourlyRate/8 ? C.teal : e.avg >= cfg.targetHourlyRate/12 ? C.accent : C.danger} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 7 }}>
              {[[C.teal,"Excelente"],[C.accent,"Aceptable"],[C.danger,"Bajo"]].map(([col,l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: col }} />
                  <Lbl>{l}</Lbl>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* $/hr vs meta */}
        <Card s={{ marginBottom: 11, padding: "13px 8px" }}>
          <Lbl s={{ marginBottom: 11, paddingLeft: 6 }}>$/hora vs meta ({fmtMXN(cfg.targetHourlyRate)})</Lbl>
          <ResponsiveContainer width="100%" height={125}>
            <LineChart data={chartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tip />} />
              <Line type="monotone" dataKey="netPerHour" stroke={C.teal} strokeWidth={2} dot={false} name="$/hr" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Por plataforma */}
        {platData.length > 0 && (
          <Card s={{ marginBottom: 11 }}>
            <Lbl s={{ marginBottom: 11 }}>Ganancia por plataforma</Lbl>
            <div style={{ display: "flex", alignItems: "center" }}>
              <ResponsiveContainer width="50%" height={105}>
                <PieChart>
                  <Pie data={platData} dataKey="net" cx="50%" cy="50%" innerRadius={26} outerRadius={48} paddingAngle={3}>
                    {platData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, paddingLeft: 7 }}>
                {platData.map((p, i) => (
                  <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: PIE[i] }} />
                      <span style={{ fontSize: 11 }}>{p.name}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: PIE[i], fontWeight: 700 }}>{fmtMXN(p.net)}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>{p.count} viajes</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Gasolina */}
        <Card>
          <Lbl s={{ marginBottom: 11 }}>Gasto en gasolina</Lbl>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
            <div>
              <Big size={26} color={C.danger}>{fmtMXN(totals.gas)}</Big>
              <Lbl s={{ marginTop: 4 }}>en {range} días</Lbl>
            </div>
            <div style={{ textAlign: "right" }}>
              <Big size={19} color={C.muted}>{fmtMXN(totals.gas / (range || 1))}</Big>
              <Lbl s={{ marginTop: 4 }}>por día</Lbl>
            </div>
          </div>
          <div style={{ height: 5, background: C.card2, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (totals.gas/(totals.gross||1))*100)}%`, background: C.danger, borderRadius: 4 }} />
          </div>
          <Lbl s={{ marginTop: 5 }}>Gas = {fmtPct((totals.gas/(totals.gross||1))*100)} de ingresos brutos</Lbl>
        </Card>
      </>}
    </div>
  );
}

// ─── TAB: IA ──────────────────────────────────────────────────────────────────
function AITab({ cfg, trips }) {
  const [msgs,    setMsgs]    = useState([{ role: "assistant", content: "¡Hola! Soy tu asesor de rentabilidad 🚗\n\nAnalizo tus datos reales para darte consejos concretos:\n• ¿En qué horas gano más?\n• ¿Qué plataforma me conviene más?\n• ¿Cómo reduzco mis costos?\n• ¿Qué rutas son más rentables?" }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef();

  const recent = trips.filter(t => new Date(t.created_at || t.timestamp).getTime() >= Date.now() - 30*86400000);

  const buildCtx = () => {
    const s = recent.reduce((a, t) => { const c = calcTrip(t, cfg); return { net:a.net+c.netEarning, km:a.km+c.totalKm, gas:a.gas+c.gasCost, min:a.min+c.totalMin, count:a.count+1 }; }, {net:0,km:0,gas:0,min:0,count:0});
    const byHour = {};
    recent.forEach(t => { const h = new Date(t.created_at||t.timestamp).getHours(); if(!byHour[h]) byHour[h]={net:0,count:0}; byHour[h].net+=calcTrip(t,cfg).netEarning; byHour[h].count++; });
    const bestHours = Object.entries(byHour).sort((a,b)=>(b[1].net/b[1].count)-(a[1].net/a[1].count)).slice(0,3).map(([h])=>`${h}:00`).join(", ");
    const byPlat = {};
    recent.forEach(t => { const p=t.platform||"uber"; if(!byPlat[p]) byPlat[p]={net:0,count:0}; byPlat[p].net+=calcTrip(t,cfg).netEarning; byPlat[p].count++; });
    const platSumm = Object.entries(byPlat).map(([p,d])=>`${p}:${fmtMXN(d.net/d.count)}/viaje`).join(", ");
    return `Conductor Uber/Didi México. 30 días: ${s.count} viajes, neto ${fmtMXN(s.net)}, ${fmt(s.km,0)}km, ${fmtMXN(s.gas)} gas, ${(s.min/60).toFixed(1)}hrs. $/hr=${fmtMXN(s.min>0?s.net/(s.min/60):0)}, meta=${fmtMXN(cfg.targetHourlyRate)}/hr. Mejores horas: ${bestHours||"sin datos"}. Plataformas: ${platSumm||"sin datos"}. Gas $${cfg.gasPricePerLiter}/L, ${cfg.kmPerLiter}km/L.`;
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input };
    setMsgs(p => [...p, userMsg]); setInput(""); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 700,
          system: `Asesor experto en rentabilidad para conductores Uber/Didi México. Consejos concisos y accionables en español mexicano informal. Todo basado en datos reales. Contexto: ${buildCtx()}`,
          messages: [...msgs, userMsg].map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      setMsgs(p => [...p, { role: "assistant", content: data.content?.find(b => b.type==="text")?.text || "Error al responder." }]);
    } catch { setMsgs(p => [...p, { role: "assistant", content: "Error de conexión." }]); }
    setLoading(false);
  };

  const SUGG = ["¿En qué horarios gano más?","¿Qué plataforma me conviene?","¿Cómo bajo mis costos?","Dame un diagnóstico rápido"];

  return (
    <div className="fu" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
      {recent.length < 5 && (
        <div style={{ margin: "11px 14px 0", background: `${C.accent}12`, border: `1px solid ${C.accent}33`, borderRadius: 9, padding: "9px 13px", fontSize: 11, color: C.accent }}>
          ⚠️ Con más viajes registrados el análisis mejora ({recent.length} actuales)
        </div>
      )}
      {msgs.length <= 1 && (
        <div style={{ padding: "11px 14px 0" }}>
          <Lbl s={{ marginBottom: 7 }}>Preguntas frecuentes</Lbl>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SUGG.map(s => (
              <button key={s} onClick={() => setInput(s)} style={{ padding: "6px 11px", background: `${C.teal}12`, border: `1px solid ${C.teal}33`, borderRadius: 18, color: C.teal, fontSize: 11, fontWeight: 600 }}>{s}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "11px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "88%", padding: "10px 13px",
              borderRadius: m.role==="user" ? "13px 13px 3px 13px" : "13px 13px 13px 3px",
              background: m.role==="user" ? `${C.accent}1e` : C.card,
              border: `1px solid ${m.role==="user" ? C.accent+"44" : C.border}`,
              fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: C.text }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex" }}>
            <div style={{ padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: "13px 13px 13px 3px" }}>
              <div className="pu" style={{ fontSize: 10, color: C.teal, letterSpacing: "0.2em" }}>ANALIZANDO...</div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "9px 14px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 7 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Pregunta sobre tu rentabilidad..."
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "10px 13px", color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <button onClick={send} disabled={!input.trim() || loading} style={{ padding: "10px 14px", background: input.trim() ? `${C.accent}1e` : "transparent", border: `1px solid ${input.trim() ? C.accent : C.border}`, borderRadius: 9, color: input.trim() ? C.accent : C.dim, display: "flex", alignItems: "center" }}>
          <SVG d={IC.send} size={15} color={input.trim() ? C.accent : C.dim} />
        </button>
      </div>
    </div>
  );
}

// ─── TAB: CONFIG ──────────────────────────────────────────────────────────────
function ConfigTab({ cfg, saveConfig, onLogout }) {
  const [local, setLocal] = useState(cfg);
  const [saved, setSaved] = useState(false);
  useEffect(() => setLocal(cfg), [cfg]);
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  const save = async () => { await saveConfig(local); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const periods = ["diario","semanal","mensual","trimestral","semestral","anual"];

  const FCRow = ({ ek, mk, pk, label, xk, xl }) => (
    <div style={{ background: C.card2, border: `1px solid ${local[ek] ? C.accent+"44" : C.border}`, borderRadius: 11, padding: "13px 14px", marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: local[ek] ? 12 : 0 }}>
        <div style={{ fontSize: 12, color: local[ek] ? C.text : C.muted }}>{label}</div>
        <button onClick={() => set(ek, !local[ek])} style={{ width: 38, height: 21, borderRadius: 11, background: local[ek] ? C.accent : C.bord2, position: "relative", flexShrink: 0 }}>
          <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: local[ek] ? 20 : 3, transition: "left .18s" }} />
        </button>
      </div>
      {local[ek] && (
        <div style={{ display: "grid", gridTemplateColumns: xk ? "1fr 1fr 1fr" : "1fr 1fr", gap: 7 }}>
          <div>
            <Lbl s={{ marginBottom: 4 }}>Monto $MXN</Lbl>
            <input type="number" value={local[mk]} onChange={e => set(mk, parseFloat(e.target.value)||0)} style={{ width:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", color:"#fff", fontSize:15, fontFamily:"inherit" }} />
          </div>
          {pk && (
            <div>
              <Lbl s={{ marginBottom: 4 }}>Periodo</Lbl>
              <select value={local[pk]} onChange={e => set(pk, e.target.value)} style={{ width:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", color:"#fff", fontSize:11, fontFamily:"inherit" }}>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {xk && (
            <div>
              <Lbl s={{ marginBottom: 4 }}>{xl}</Lbl>
              <input type="number" value={local[xk]} onChange={e => set(xk, parseFloat(e.target.value)||0)} style={{ width:"100%", background:C.card, border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", color:"#fff", fontSize:15, fontFamily:"inherit" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fu" style={{ padding: "15px 14px 100px" }}>
      <div className="B" style={{ fontSize: 22, fontWeight: 800, color: C.accent, marginBottom: 16, letterSpacing: 1 }}>CONFIGURACIÓN</div>
      <Lbl s={{ marginBottom: 9 }}>Variables base</Lbl>
      <Card s={{ marginBottom: 13 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
          <Inp label="Gasolina (MXN/L)" type="number" value={local.gasPricePerLiter} onChange={v => set("gasPricePerLiter",parseFloat(v)||0)} unit="$/L" />
          <Inp label="Rendimiento"       type="number" value={local.kmPerLiter}        onChange={v => set("kmPerLiter",parseFloat(v)||0)}        unit="km/L" />
          <Inp label="Meta por hora"     type="number" value={local.targetHourlyRate}  onChange={v => set("targetHourlyRate",parseFloat(v)||0)}  unit="MXN/hr" />
          <Inp label="Comisión plat."    type="number" value={local.platformCut}       onChange={v => set("platformCut",parseFloat(v)||0)}       unit="%" />
        </div>
      </Card>
      <Lbl s={{ marginBottom: 9 }}>Gastos fijos (opcionales)</Lbl>
      <FCRow ek="rentaEnabled"         mk="rentaMonto"         pk="rentaPeriodo"         label="🚗 Renta / crédito del auto" />
      <FCRow ek="seguroEnabled"        mk="seguroMonto"        pk="seguroPeriodo"        label="🛡️ Seguro del auto" />
      <FCRow ek="llantasEnabled"       mk="llantasMonto"       xk="llantasKmVida"        xl="Vida (km)"    label="🔧 Desgaste de llantas" />
      <FCRow ek="mantenimientoEnabled" mk="mantenimientoMonto" xk="mantenimientoKmVida" xl="Cada (km)"    label="🔩 Mantenimiento" />
      <Btn full onClick={save} color={saved ? C.teal : C.accent} s={{ marginTop: 6, marginBottom: 9 }}>
        <SVG d={IC.check} size={13} color={saved ? C.teal : C.accent} /> {saved ? "¡Guardado!" : "Guardar cambios"}
      </Btn>
      <Btn full onClick={onLogout} color={C.danger} outline>
        <SVG d={IC.logout} size={13} color={C.danger} /> Cerrar sesión
      </Btn>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth() {
  const [mode,     setMode]    = useState("login");
  const [name,     setName]    = useState("");
  const [email,    setEmail]   = useState("");
  const [pass,     setPass]    = useState("");
  const [confirm,  setConfirm] = useState("");
  const [showPw,   setShowPw]  = useState(false);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const [success,  setSuccess] = useState("");

  const reset = () => { setError(""); setSuccess(""); };

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); reset();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (err) setError("Correo o contraseña incorrectos");
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault(); reset();
    if (!name.trim())      { setError("Ingresa tu nombre completo"); return; }
    if (pass.length < 6)   { setError("Contraseña mínima: 6 caracteres"); return; }
    if (pass !== confirm)  { setError("Las contraseñas no coinciden"); return; }
    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: name } } });
    if (err) { setError(err.message); setLoading(false); return; }
    if (data?.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, full_name: name, email, gas_price_per_liter:24, km_per_liter:12, target_hourly_rate:200, platform_cut:10 });
    }
    setSuccess("¡Cuenta creada! Revisa tu correo para confirmar.");
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault(); setLoading(true); reset();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (err) setError(err.message);
    else setSuccess("Te enviamos un link para restablecer tu contraseña.");
    setLoading(false);
  };

  const handleGoogle = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });

  const inp = { width:"100%", background:"#0a0b14", border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 14px 12px 42px", color:"#fff", fontSize:14, fontFamily:"IBM Plex Mono,monospace", outline:"none" };

  const FldIcon = ({ d }) => (
    <div style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
      <SVG d={d} size={15} color={C.muted} />
    </div>
  );

  return (
    <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:30 }}>
          <div className="B" style={{ fontSize:36, fontWeight:900, color:C.accent, letterSpacing:2 }}>RUTAFLOW</div>
          <div style={{ fontSize:10, color:C.dim, letterSpacing:"0.3em", marginTop:3 }}>GESTOR DE CONDUCTOR</div>
        </div>

        {/* Tabs */}
        {mode !== "forgot" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, marginBottom:22, background:C.card2, borderRadius:11, padding:4 }}>
            {["login","register"].map(m => (
              <button key={m} onClick={() => { setMode(m); reset(); }} style={{
                padding:"9px", background: mode===m ? C.card : "transparent",
                border: `1px solid ${mode===m ? C.bord2 : "transparent"}`,
                borderRadius:8, color: mode===m ? C.text : C.muted,
                fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:700 }}>
                {m==="login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={mode==="login"?handleLogin:mode==="register"?handleRegister:handleForgot}>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {mode === "forgot" && (
              <button type="button" onClick={() => { setMode("login"); reset(); }}
                style={{ color:C.accent, fontSize:11, display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
                <SVG d={IC.back} size={13} color={C.accent} /> Volver al inicio de sesión
              </button>
            )}

            {mode === "register" && (
              <div style={{ position:"relative" }}>
                <FldIcon d={IC.user} />
                <input type="text" placeholder="Tu nombre completo" value={name} onChange={e=>setName(e.target.value)}
                  style={inp} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
            )}

            <div style={{ position:"relative" }}>
              <FldIcon d={IC.mail} />
              <input type="email" placeholder="correo@ejemplo.com" value={email} onChange={e=>setEmail(e.target.value)} required
                style={inp} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </div>

            {mode !== "forgot" && (
              <div style={{ position:"relative" }}>
                <FldIcon d={IC.lock} />
                <input type={showPw?"text":"password"} placeholder="Contraseña (mín. 6 caracteres)" value={pass}
                  onChange={e=>setPass(e.target.value)} required style={{ ...inp, paddingRight:44 }}
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:C.muted }}>
                  <SVG d={IC.eye} size={15} color={C.muted} />
                </button>
              </div>
            )}

            {mode === "register" && (
              <div style={{ position:"relative" }}>
                <FldIcon d={IC.lock} />
                <input type={showPw?"text":"password"} placeholder="Confirmar contraseña" value={confirm}
                  onChange={e=>setConfirm(e.target.value)} required style={inp}
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
            )}

            {mode === "login" && (
              <div style={{ textAlign:"right" }}>
                <button type="button" onClick={()=>{setMode("forgot");reset();}}
                  style={{ color:C.accent, fontSize:10, letterSpacing:"0.05em", textDecoration:"underline" }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {error   && <div style={{ background:`${C.danger}12`, border:`1px solid ${C.danger}33`, borderRadius:8, padding:"9px 13px", fontSize:12, color:C.danger }}>⚠️ {error}</div>}
            {success && <div style={{ background:`${C.teal}12`,   border:`1px solid ${C.teal}33`,   borderRadius:8, padding:"9px 13px", fontSize:12, color:C.teal   }}>✅ {success}</div>}

            <button type="submit" disabled={loading} style={{ padding:"13px", background:`${C.accent}1e`, border:`2px solid ${C.accent}`, borderRadius:11, color:C.accent, fontSize:12, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", marginTop:2, display:"flex", alignItems:"center", justifyContent:"center", gap:9 }}>
              {loading ? <Spinner /> : mode==="login"?"Entrar":mode==="register"?"Crear cuenta":"Enviar link"}
            </button>

            {mode !== "forgot" && (
              <>
                <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                  <div style={{ flex:1, height:1, background:C.border }} />
                  <span style={{ fontSize:10, color:C.dim }}>o continúa con</span>
                  <div style={{ flex:1, height:1, background:C.border }} />
                </div>
                <button type="button" onClick={handleGoogle} style={{ padding:"12px", background:"transparent", border:`1px solid ${C.bord2}`, borderRadius:11, color:C.text, fontSize:13, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:9 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continuar con Google
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
const DEFAULT_CFG = {
  gasPricePerLiter:24, kmPerLiter:12, targetHourlyRate:200, platformCut:10,
  rentaEnabled:false,   rentaMonto:0,   rentaPeriodo:"mensual",
  seguroEnabled:false,  seguroMonto:0,  seguroPeriodo:"mensual",
  llantasEnabled:false, llantasMonto:0, llantasKmVida:40000,
  mantenimientoEnabled:false, mantenimientoMonto:0, mantenimientoKmVida:5000,
};

export default function RutaFlow() {
  const [tab,       setTab]       = useState("home");
  const [cfg,       setCfg]       = useState(DEFAULT_CFG);
  const [trips,     setTrips]     = useState([]);
  const [days,      setDays]      = useState([]);
  const [activeDay, setActiveDay] = useState(null);
  const [session,   setSession]   = useState(null);
  const [loading,   setLoading]   = useState(true);

  // ── Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      setSession(session);
      if (session) loadCloud(session.user.id);
      else setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadCloud = useCallback(async (uid) => {
    setLoading(true);
    try {
      const [{ data: tr }, { data: pr }, { data: dy }, { data: ad }] = await Promise.all([
        supabase.from("trips").select("*").eq("user_id",uid).order("created_at",{ascending:false}),
        supabase.from("profiles").select("*").eq("id",uid).single(),
        supabase.from("days").select("*").eq("user_id",uid).order("date",{ascending:false}),
        supabase.from("active_days").select("*").eq("user_id",uid).maybeSingle(),
      ]);
      if (tr) setTrips(tr);
      if (dy) setDays(dy);
      if (pr?.config) setCfg({ ...DEFAULT_CFG, ...pr.config });
      if (ad) setActiveDay({ id:ad.id, date:ad.date, startTime:new Date(ad.start_time).getTime(), running:true });
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  // ── Guardar viaje
  const saveTrip = async (tripData) => {
    if (!session) return;
    const { data, error } = await supabase.from("trips").insert([{ ...tripData, user_id:session.user.id }]).select().single();
    if (!error && data) setTrips(p => [data, ...p]);
  };

  // ── Eliminar viaje
  const deleteTrip = async (id) => {
    if (!window.confirm("¿Eliminar este viaje?")) return;
    await supabase.from("trips").delete().eq("id",id);
    setTrips(p => p.filter(t => t.id !== id));
  };

  // ── Día
  const startDay = async () => {
    if (!session) return;
    const { data, error } = await supabase.from("active_days").upsert(
      { user_id:session.user.id, date:todayStr(), start_time:new Date().toISOString() },
      { onConflict:"user_id" }
    ).select().single();
    if (!error && data) setActiveDay({ id:data.id, date:data.date, startTime:new Date(data.start_time).getTime(), running:true });
  };

  const endDay = async () => {
    if (!activeDay || !session) return;
    await supabase.from("active_days").delete().eq("user_id",session.user.id);
    const dayTrips = trips.filter(t => t.date === activeDay.date);
    const tots = dayTrips.reduce((a,t)=>{ const c=calcTrip(t,cfg); return {net:a.net+c.netEarning,km:a.km+c.totalKm}; },{net:0,km:0});
    await supabase.from("days").insert([{ user_id:session.user.id, date:activeDay.date, total_net:tots.net, total_km:tots.km, trip_count:dayTrips.length }]);
    setActiveDay(null);
  };

  // ── Config
  const saveConfig = async (newCfg) => {
    setCfg(newCfg);
    if (!session) return;
    await supabase.from("profiles").upsert({ id:session.user.id, config:newCfg, updated_at:new Date().toISOString() });
  };

  // ── Loading
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div style={{ background:C.bg, minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div className="B" style={{ fontSize:34, fontWeight:900, color:C.accent, letterSpacing:3 }}>RUTAFLOW</div>
        <div style={{ marginTop:22, width:100, height:2, background:C.border, borderRadius:2, overflow:"hidden" }}>
          <div className="pu" style={{ width:"60%", height:"100%", background:C.accent }} />
        </div>
        <div style={{ marginTop:12, fontSize:9, color:C.dim, letterSpacing:"0.3em" }}>CARGANDO...</div>
      </div>
    </>
  );

  if (!session) return <><style>{CSS}</style><Auth /></>;

  const name = session?.user?.user_metadata?.full_name || session?.user?.email?.split("@")[0] || "Driver";
  const todayNet = trips.filter(t => t.date === todayStr()).reduce((s,t) => s + calcTrip(t,cfg).netEarning, 0);

  const NAV = [
    { id:"home",   d:IC.home,   l:"Hoy"    },
    { id:"trips",  d:IC.trips,  l:"Viajes" },
    { id:"stats",  d:IC.stats,  l:"Stats"  },
    { id:"ai",     d:IC.ai,     l:"IA"     },
    { id:"config", d:IC.config, l:"Config" },
  ];

  return (
    <>
      <style>{CSS}</style>
      <div style={{ background:C.bg, minHeight:"100vh", maxWidth:480, margin:"0 auto", position:"relative" }}>
        {/* Header */}
        <div style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"13px 15px 11px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
          <div>
            <div className="B" style={{ fontSize:19, fontWeight:900, color:C.accent, letterSpacing:1.5 }}>RUTAFLOW</div>
            <div style={{ fontSize:9, color:C.dim, letterSpacing:"0.18em" }}>{name.toUpperCase()}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:C.muted }}>hoy neto</div>
            <div className="B" style={{ fontSize:21, fontWeight:800, color:todayNet>=0?C.teal:C.danger }}>{fmtMXN(todayNet)}</div>
          </div>
        </div>

        {/* Contenido */}
        {tab==="home"   && <HomeTab   cfg={cfg} trips={trips} days={days} activeDay={activeDay} saveTrip={saveTrip} startDay={startDay} endDay={endDay} />}
        {tab==="trips"  && <TripsTab  cfg={cfg} trips={trips} saveTrip={saveTrip} deleteTrip={deleteTrip} />}
        {tab==="stats"  && <StatsTab  cfg={cfg} trips={trips} />}
        {tab==="ai"     && <AITab     cfg={cfg} trips={trips} />}
        {tab==="config" && <ConfigTab cfg={cfg} saveConfig={saveConfig} onLogout={() => supabase.auth.signOut()} />}

        {/* Nav */}
        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.card, borderTop:`1px solid ${C.border}`, display:"flex", zIndex:100 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{ flex:1, padding:"9px 0 13px", display:"flex", flexDirection:"column", alignItems:"center", gap:4, color:tab===n.id?C.accent:C.dim, transition:"color .15s" }}>
              <SVG d={n.d} size={18} color={tab===n.id?C.accent:C.dim} />
              <span style={{ fontSize:9, letterSpacing:"0.1em", fontWeight:tab===n.id?700:400 }}>{n.l}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
