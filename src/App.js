import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    gasPricePerLiter: 24, kmPerLiter: 12, targetHourlyRate: 200, platformCut: 10,
};
const DEFAULT_FIXED_COSTS = {
    rentaEnabled: false, rentaMonto: 0, rentaPeriodo: "mensual",
    seguroEnabled: false, seguroMonto: 0, seguroPeriodo: "mensual",
    llantasEnabled: false, llantasMonto: 0, llantasKmVida: 40000,
    mantenimientoEnabled: false, mantenimientoMonto: 0, mantenimientoKmVida: 5000,
};
const ACCENT = "#f0a500";
const ACCENT2 = "#00d4aa";
const DANGER = "#ff4757";
const BG = "#07080d";
const CARD = "#0e1018";
const BORDER = "#1c1f2e";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (parseFloat(n) || 0).toFixed(d);
const fmtMXN = (n) => `$${fmt(n)}`;
const now = () => Date.now();
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
const fmtDate = (d) => new Date(d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

const calcFixedCostPerKm = (fixedCosts, totalKm) => {
    if (!totalKm || totalKm === 0 || !fixedCosts) return 0;
    let cost = 0;
    const p2d = { diario: 1, semanal: 7, mensual: 30, trimestral: 90, semestral: 180, anual: 365 };
    if (fixedCosts.rentaEnabled) cost += (fixedCosts.rentaMonto || 0) / (p2d[fixedCosts.rentaPeriodo] || 30);
    if (fixedCosts.seguroEnabled) cost += (fixedCosts.seguroMonto || 0) / (p2d[fixedCosts.seguroPeriodo] || 30);
    if (fixedCosts.llantasEnabled) cost += ((fixedCosts.llantasMonto || 0) / (fixedCosts.llantasKmVida || 40000)) * totalKm;
    if (fixedCosts.mantenimientoEnabled) cost += ((fixedCosts.mantenimientoMonto || 0) / (fixedCosts.mantenimientoKmVida || 5000)) * totalKm;
    return cost;
};

const calcTrip = (trip, cfg, fixedCosts) => {
    const gpsKm = parseFloat(trip.gps_km || trip.gpsKm) || 0;
    const gpsMin = parseFloat(trip.gps_min || trip.gpsMin) || 0;
    const totalKm = gpsKm > 0 ? gpsKm : (parseFloat(trip.pickup_km || trip.pickupKm) || 0) + (parseFloat(trip.dest_km || trip.destKm) || 0);
    const totalMin = gpsMin > 0 ? gpsMin : (parseFloat(trip.pickup_min || trip.pickupMin) || 0) + (parseFloat(trip.dest_min || trip.destMin) || 0);
    const gasCost = (totalKm / (cfg.kmPerLiter || 12)) * (cfg.gasPricePerLiter || 24);
    const platformFee = (parseFloat(trip.fare) || 0) * ((cfg.platformCut || 10) / 100);
    const fixedCost = calcFixedCostPerKm(fixedCosts, totalKm);
    const netEarning = (parseFloat(trip.fare) || 0) - platformFee - gasCost - fixedCost;
    const hours = totalMin / 60;
    const netPerHour = hours > 0 ? netEarning / hours : 0;
    const netPerKm = totalKm > 0 ? netEarning / totalKm : 0;
    return { totalKm, totalMin, gasCost, platformFee, netEarning, netPerHour, netPerKm, hours, fixedCost };
};

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
    { id: "home", icon: "⚡", label: "Hoy" },
    { id: "trips", icon: "🗂", label: "Viajes" },
    { id: "stats", icon: "📊", label: "Stats" },
    { id: "ai", icon: "🤖", label: "IA" },
    { id: "config", icon: "⚙️", label: "Config" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function RutaFlow() {
    const [tab, setTab] = useState("home");
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [fixedCosts, setFixedCosts] = useState(DEFAULT_FIXED_COSTS);
    const [trips, setTrips] = useState([]);
    const [days, setDays] = useState([]);
    const [activeDay, setActiveDay] = useState(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);

    const loadDataFromCloud = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }

            const { data: tripsData } = await supabase.from('trips').select('*').order('created_at', { ascending: false });
            if (tripsData) setTrips(tripsData);

            const { data: profileData } = await supabase.from('profiles').select('config, fixed_costs').eq('id', user.id).single();
            if (profileData?.config) setConfig(profileData.config);
            if (profileData?.fixed_costs) setFixedCosts(profileData.fixed_costs);

            const { data: daysData } = await supabase.from('days').select('*').order('date', { ascending: false });
            if (daysData) setDays(daysData);

            // Restaurar día activo desde la nube
            const { data: activeDayData } = await supabase.from('active_days').select('*').eq('user_id', user.id).single();
            if (activeDayData) {
                setActiveDay({
                    id: activeDayData.id,
                    date: activeDayData.date,
                    startTime: new Date(activeDayData.start_time).getTime(),
                    running: true,
                });
            }
        } catch (err) {
            console.error("Error cargando datos:", err);
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (!session) setLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) loadDataFromCloud();
            else setLoading(false);
        });
        return () => subscription.unsubscribe();
    }, [loadDataFromCloud]);

    const saveTrips = async (nuevosViajes) => {
        setTrips(nuevosViajes);
        const ultimo = nuevosViajes[nuevosViajes.length - 1];
        if (!ultimo) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('trips').insert([{
            user_id: user.id,
            fare: parseFloat(ultimo.fare),
            pickup_km: parseFloat(ultimo.pickupKm || 0),
            dest_km: parseFloat(ultimo.destKm || 0),
            gps_km: parseFloat(ultimo.gpsKm || 0),
            gps_min: parseFloat(ultimo.gpsMin || 0),
            platform: ultimo.platform,
            date: todayStr(),
        }]);
    };

    const saveDays = async (listaDias) => {
        setDays(listaDias);
        const ultimo = listaDias[listaDias.length - 1];
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('days').insert([{
            user_id: user.id, date: ultimo.date,
            total_net: ultimo.totalNet, total_km: ultimo.totalKm, trip_count: ultimo.tripCount
        }]);
    };

    const saveConfig = async (nuevaConfig, nuevosFixed) => {
        setConfig(nuevaConfig);
        if (nuevosFixed) setFixedCosts(nuevosFixed);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('profiles').upsert({
            id: user.id, config: nuevaConfig,
            fixed_costs: nuevosFixed || fixedCosts,
            updated_at: new Date()
        });
    };

    const startActiveDay = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from('active_days').upsert(
            { user_id: user.id, date: todayStr(), start_time: new Date().toISOString() },
            { onConflict: 'user_id' }
        ).select().single();
        if (!error && data) {
            setActiveDay({ id: data.id, date: data.date, startTime: new Date(data.start_time).getTime(), running: true });
        }
    };

    const endActiveDay = async () => {
        if (!activeDay) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from('active_days').delete().eq('user_id', user.id);
        const dayTrips = trips.filter(t => t.date === activeDay.date);
        const totalNet = dayTrips.reduce((s, t) => s + calcTrip(t, config, fixedCosts).netEarning, 0);
        const totalKm = dayTrips.reduce((s, t) => s + calcTrip(t, config, fixedCosts).totalKm, 0);
        await saveDays([...days, { date: activeDay.date, totalNet, totalKm, tripCount: dayTrips.length }]);
        setActiveDay(null);
    };

    if (loading) return (
        <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: ACCENT }}>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
                <div style={{ letterSpacing: 4, fontSize: 12 }}>CARGANDO...</div>
            </div>
        </div>
    );

    if (!session) return <Auth />;

    const todayTrips = trips.filter(t => t.date === todayStr());
    const todayNet = todayTrips.reduce((s, t) => s + calcTrip(t, config, fixedCosts).netEarning, 0);

    return (
        <div style={{ background: BG, minHeight: "100vh", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e8eaf0", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; }
        input, textarea, select { font-family: inherit; color: #fff; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .btn { cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; }
        .btn:active { transform: scale(0.97); }
        .tab-btn { cursor: pointer; transition: all 0.2s; }
        .trip-card { transition: transform 0.2s; }
        .trip-card:hover { transform: translateX(3px); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        .recording { animation: pulse 2s infinite; }
      `}</style>

            <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
                <div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>RUTAFLOW</div>
                    <div style={{ fontSize: 10, color: "#404060", letterSpacing: 2 }}>GESTOR DE CONDUCTOR</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#606080" }}>hoy neto</div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: todayNet >= 0 ? ACCENT2 : DANGER }}>{fmtMXN(todayNet)}</div>
                </div>
            </div>

            <div style={{ padding: "0 0 8px" }}>
                {tab === "home" && <HomeTab config={config} fixedCosts={fixedCosts} trips={trips} days={days} activeDay={activeDay} saveTrips={saveTrips} saveDays={saveDays} startActiveDay={startActiveDay} endActiveDay={endActiveDay} />}
                {tab === "trips" && <TripsTab config={config} fixedCosts={fixedCosts} trips={trips} saveTrips={saveTrips} />}
                {tab === "stats" && <StatsTab config={config} fixedCosts={fixedCosts} trips={trips} days={days} />}
                {tab === "ai" && <AITab config={config} trips={trips} />}
                {tab === "config" && <ConfigTab config={config} fixedCosts={fixedCosts} saveConfig={saveConfig} onLogout={() => supabase.auth.signOut()} />}
            </div>

            <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: CARD, borderTop: `1px solid ${BORDER}`, display: "flex", zIndex: 100 }}>
                {NAV_ITEMS.map(n => (
                    <button key={n.id} className="tab-btn btn" onClick={() => setTab(n.id)}
                        style={{ flex: 1, padding: "10px 0 12px", background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === n.id ? ACCENT : "#404060" }}>
                        <span style={{ fontSize: 18 }}>{n.icon}</span>
                        <span style={{ fontSize: 9, letterSpacing: 1, fontWeight: tab === n.id ? 600 : 400 }}>{n.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ config, fixedCosts, trips, days, activeDay, saveTrips, startActiveDay, endActiveDay }) {
    const [elapsed, setElapsed] = useState(0);
    const [tripModal, setTripModal] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (activeDay?.running) {
            const tick = () => setElapsed(now() - activeDay.startTime);
            tick();
            timerRef.current = setInterval(tick, 1000);
        } else setElapsed(0);
        return () => clearInterval(timerRef.current);
    }, [activeDay]);

    const todayTrips = trips.filter(t => t.date === todayStr());
    const todayStats = todayTrips.reduce((acc, t) => {
        const c = calcTrip(t, config, fixedCosts);
        return { net: acc.net + c.netEarning, km: acc.km + c.totalKm, trips: acc.trips + 1 };
    }, { net: 0, km: 0, trips: 0 });

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, marginBottom: 16 }}>JORNADA DE HOY</div>
                {!activeDay ? (
                    <button className="btn" onClick={startActiveDay}
                        style={{ width: "100%", padding: "18px", background: `${ACCENT}22`, border: `2px solid ${ACCENT}`, borderRadius: 12, color: ACCENT, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
                        🚀 INICIAR DÍA
                    </button>
                ) : (
                    <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <div>
                                <div className="recording" style={{ fontSize: 10, color: DANGER, letterSpacing: 2, marginBottom: 4 }}>● GRABANDO</div>
                                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 42, fontWeight: 800, color: ACCENT2, lineHeight: 1 }}>{fmtTime(elapsed)}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 10, color: "#505070", marginBottom: 4 }}>viajes hoy</div>
                                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 700 }}>{todayTrips.length}</div>
                            </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <StatMini label="Neto acumulado" value={fmtMXN(todayStats.net)} color={todayStats.net >= 0 ? ACCENT2 : DANGER} />
                            <StatMini label="Km recorridos" value={`${fmt(todayStats.km, 1)} km`} color="#a0a0c0" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                            <button className="btn" onClick={() => setTripModal(true)}
                                style={{ padding: "14px", background: `${ACCENT}22`, border: `2px solid ${ACCENT}`, borderRadius: 10, color: ACCENT, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
                                + INICIAR VIAJE
                            </button>
                            <button className="btn" onClick={endActiveDay}
                                style={{ padding: "14px", background: `${DANGER}15`, border: `1px solid ${DANGER}`, borderRadius: 10, color: DANGER, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700 }}>
                                FIN DÍA
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {todayTrips.length > 0 && (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, marginBottom: 14 }}>VIAJES DE HOY</div>
                    {todayTrips.slice(-5).reverse().map(t => {
                        const c = calcTrip(t, config, fixedCosts);
                        const col = c.netPerHour >= config.targetHourlyRate ? ACCENT2 : c.netPerHour >= config.targetHourlyRate * 0.8 ? ACCENT : DANGER;
                        return (
                            <div key={t.id} className="trip-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                                <div>
                                    <div style={{ fontSize: 12, color: "#c0c0e0" }}>{fmtMXN(t.fare)} · {fmt(c.totalKm, 1)} km</div>
                                    <div style={{ fontSize: 10, color: "#505070" }}>{c.totalMin.toFixed(0)} min · gas {fmtMXN(c.gasCost)}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: col }}>{fmtMXN(c.netEarning)}</div>
                                    <div style={{ fontSize: 9, color: "#505070" }}>{fmtMXN(c.netPerHour)}/hr</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {tripModal && <TripModal config={config} fixedCosts={fixedCosts} trips={trips} saveTrips={saveTrips} activeDay={activeDay} onClose={() => setTripModal(false)} />}
        </div>
    );
}

function StatMini({ label, value, color }) {
    return (
        <div style={{ background: "#0a0b12", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#505070", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color }}>{value}</div>
        </div>
    );
}

// ─── TRIP MODAL ───────────────────────────────────────────────────────────────
function TripModal({ config, fixedCosts, trips, saveTrips, activeDay, onClose }) {
    const [mode, setMode] = useState("manual");
    const [phase, setPhase] = useState(0);
    const [trip, setTrip] = useState({ fare: "", pickupKm: "", pickupMin: "", destKm: "", destMin: "", platform: "uber", gpsKm: 0, gpsMin: 0 });
    const [processing, setProcessing] = useState(false);
    const [img, setImg] = useState(null);
    const [gpsActive, setGpsActive] = useState(false);
    const [gpsStatus, setGpsStatus] = useState("");
    const [tripRunning, setTripRunning] = useState(false);
    const [tripElapsed, setTripElapsed] = useState(0);
    const timerRef = useRef(null);
    const watchRef = useRef(null);
    const tripStartRef = useRef(null);
    const distRef = useRef(0);
    const lastPosRef = useRef(null);
    const fileRef = useRef();

    const setField = (k, v) => setTrip(p => ({ ...p, [k]: v }));

    useEffect(() => {
        if (tripRunning) {
            timerRef.current = setInterval(() => setTripElapsed(now() - tripStartRef.current), 1000);
        } else clearInterval(timerRef.current);
        return () => clearInterval(timerRef.current);
    }, [tripRunning]);

    const haversine = (a, b) => {
        const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    };

    const startGps = () => {
        if (!navigator.geolocation) { setGpsStatus("GPS no disponible en este dispositivo"); return; }
        distRef.current = 0;
        lastPosRef.current = null;
        tripStartRef.current = now();
        setTripRunning(true);
        setGpsActive(true);
        setGpsStatus("📍 Iniciando...");
        watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const cur = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                if (lastPosRef.current) distRef.current += haversine(lastPosRef.current, cur);
                lastPosRef.current = cur;
                setGpsStatus(`📍 ${distRef.current.toFixed(2)} km`);
            },
            () => setGpsStatus("⚠️ Error GPS — verifica permisos"),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );
    };

    const stopGps = () => {
        if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
        const mins = ((now() - tripStartRef.current) / 60000).toFixed(0);
        setTrip(p => ({ ...p, gpsKm: distRef.current.toFixed(2), gpsMin: mins }));
        setTripRunning(false);
        setGpsActive(false);
        setGpsStatus(`✅ ${distRef.current.toFixed(2)} km · ${mins} min`);
    };

    const handlePhoto = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setProcessing(true);
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const b64 = ev.target.result.split(",")[1];
            setImg(ev.target.result);
            try {
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "claude-sonnet-4-20250514", max_tokens: 500,
                        messages: [{ role: "user", content: [
                            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
                            { type: "text", text: `Analiza esta captura de Uber/Didi. Extrae SOLO: tarifa (número), km al destino (número), minutos al destino (número). Responde SOLO en JSON: {"fare":0,"destKm":0,"destMin":0}` }
                        ]}]
                    })
                });
                const data = await res.json();
                const txt = data.content?.find(b => b.type === "text")?.text || "{}";
                const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
                setTrip(p => ({ ...p, fare: parsed.fare || "", destKm: parsed.destKm || "", destMin: parsed.destMin || "" }));
                setMode("manual"); setPhase(1);
            } catch { alert("No pude leer la imagen. Intenta manualmente."); setMode("manual"); }
            setProcessing(false);
        };
        reader.readAsDataURL(file);
    };

    const saveTrip = async () => {
        const newTrip = { ...trip, id: `trip-${now()}`, date: todayStr(), timestamp: now(), dayId: activeDay?.id || null };
        await saveTrips([...trips, newTrip]);
        onClose();
    };

    const calc = calcTrip(trip, config, fixedCosts);
    const hasData = trip.fare && (trip.destKm || trip.destMin || parseFloat(trip.gpsKm) > 0);
    const verdict = calc.netPerHour >= config.targetHourlyRate
        ? { color: ACCENT2, label: "✅ Buen viaje" }
        : calc.netPerHour >= config.targetHourlyRate * 0.8
            ? { color: ACCENT, label: "⚠️ Regular" }
            : { color: DANGER, label: "❌ No conviene" };

    return createPortal(
        <div style={{ position: "fixed", inset: 0, background: "#000000dd", zIndex: 9999, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: CARD, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 20px", maxHeight: "92vh", overflowY: "auto", borderTop: `2px solid ${BORDER}` }}>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT }}>NUEVO VIAJE</div>
                    <button className="btn" onClick={onClose} style={{ background: "none", border: "none", color: "#606080", fontSize: 24 }}>✕</button>
                </div>

                {/* Plataforma */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 16 }}>
                    {["uber", "didi", "beat", "otra"].map(p => (
                        <button key={p} className="btn" onClick={() => setField("platform", p)}
                            style={{ padding: "8px", background: trip.platform === p ? `${ACCENT}22` : "transparent", border: `1px solid ${trip.platform === p ? ACCENT : BORDER}`, borderRadius: 8, color: trip.platform === p ? ACCENT : "#505070", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                            {p}
                        </button>
                    ))}
                </div>

                {/* Tarifa */}
                <TripInput label="💰 TARIFA DEL VIAJE (MXN)" value={trip.fare} onChange={v => setField("fare", v)} unit="$" big />

                {/* Modo */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "16px 0 12px" }}>
                    {[{ id: "gps", label: "📍 GPS" }, { id: "manual", label: "✍️ Manual" }, { id: "photo", label: "📸 Foto" }].map(m => (
                        <button key={m.id} className="btn" onClick={() => setMode(m.id)}
                            style={{ padding: "10px", background: mode === m.id ? `${ACCENT2}22` : "transparent", border: `1px solid ${mode === m.id ? ACCENT2 : BORDER}`, borderRadius: 8, color: mode === m.id ? ACCENT2 : "#505070", fontSize: 11, letterSpacing: 1 }}>
                            {m.label}
                        </button>
                    ))}
                </div>

                {mode === "gps" && (
                    <div style={{ background: "#0a0b12", borderRadius: 12, padding: 16, marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 12 }}>RASTREO GPS EN TIEMPO REAL</div>
                        {gpsStatus && <div style={{ fontSize: 13, color: ACCENT2, marginBottom: 12 }}>{gpsStatus}</div>}
                        {tripRunning && <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, color: ACCENT, marginBottom: 12 }}>{fmtTime(tripElapsed)}</div>}
                        {!gpsActive ? (
                            <button className="btn" onClick={startGps}
                                style={{ width: "100%", padding: "14px", background: `${ACCENT2}22`, border: `2px solid ${ACCENT2}`, borderRadius: 10, color: ACCENT2, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 }}>
                                ▶ INICIAR GPS
                            </button>
                        ) : (
                            <button className="btn" onClick={stopGps}
                                style={{ width: "100%", padding: "14px", background: `${DANGER}15`, border: `2px solid ${DANGER}`, borderRadius: 10, color: DANGER, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700 }}>
                                ⏹ FINALIZAR VIAJE
                            </button>
                        )}
                    </div>
                )}

                {mode === "manual" && (
                    <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                            {[{ id: 0, label: "📍 RECOLECCIÓN" }, { id: 1, label: "🏁 DESTINO" }].map(ph => (
                                <button key={ph.id} className="btn" onClick={() => setPhase(ph.id)}
                                    style={{ padding: "10px", background: phase === ph.id ? `${ACCENT2}22` : "transparent", border: `1px solid ${phase === ph.id ? ACCENT2 : BORDER}`, borderRadius: 8, color: phase === ph.id ? ACCENT2 : "#505070", fontSize: 11, letterSpacing: 1 }}>
                                    {ph.label}
                                </button>
                            ))}
                        </div>
                        {phase === 0 && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <TripInput label="km para recoger" value={trip.pickupKm} onChange={v => setField("pickupKm", v)} unit="km" />
                                <TripInput label="minutos para recoger" value={trip.pickupMin} onChange={v => setField("pickupMin", v)} unit="min" />
                            </div>
                        )}
                        {phase === 1 && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <TripInput label="km al destino" value={trip.destKm} onChange={v => setField("destKm", v)} unit="km" />
                                <TripInput label="minutos al destino" value={trip.destMin} onChange={v => setField("destMin", v)} unit="min" />
                            </div>
                        )}
                    </div>
                )}

                {mode === "photo" && (
                    <div>
                        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
                        {processing ? (
                            <div style={{ textAlign: "center", padding: 40, color: ACCENT }}>
                                <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
                                <div style={{ fontSize: 12, letterSpacing: 2 }}>ANALIZANDO IMAGEN...</div>
                            </div>
                        ) : (
                            <button className="btn" onClick={() => fileRef.current?.click()}
                                style={{ width: "100%", padding: 40, background: `${ACCENT}11`, border: `2px dashed ${ACCENT}55`, borderRadius: 12, color: ACCENT, fontSize: 14, letterSpacing: 1 }}>
                                📱 SUBE CAPTURA DE UBER/DIDI<br />
                                <span style={{ fontSize: 11, color: "#606080", fontWeight: 400 }}>La IA extrae tarifa, km y tiempo</span>
                            </button>
                        )}
                        {img && <img src={img} style={{ width: "100%", borderRadius: 8, marginTop: 12, opacity: 0.6 }} alt="preview" />}
                    </div>
                )}

                {hasData && (
                    <div style={{ background: `${verdict.color}15`, border: `1px solid ${verdict.color}44`, borderRadius: 12, padding: 16, margin: "20px 0 0" }}>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: verdict.color, marginBottom: 12 }}>{verdict.label}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                            {[
                                { l: "NETO", v: fmtMXN(calc.netEarning), c: calc.netEarning >= 0 ? ACCENT2 : DANGER },
                                { l: "POR HORA", v: fmtMXN(calc.netPerHour), c: verdict.color },
                                { l: "POR KM", v: fmtMXN(calc.netPerKm), c: "#a0a0c0" },
                            ].map(({ l, v, c }) => (
                                <div key={l} style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 9, color: "#505070", letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
                    <button className="btn" onClick={onClose}
                        style={{ padding: "14px", background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 10, color: "#606080", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, letterSpacing: 1 }}>
                        CANCELAR
                    </button>
                    <button className="btn" onClick={saveTrip} disabled={!trip.fare}
                        style={{ padding: "14px", background: trip.fare ? `${ACCENT}22` : "#1c1f2e", border: `2px solid ${trip.fare ? ACCENT : BORDER}`, borderRadius: 10, color: trip.fare ? ACCENT : "#404060", fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>
                        GUARDAR ✓
                    </button>
                </div>
            </div>
        </div>
document.body
    );
}

function TripInput({ label, value, onChange, unit, big }) {
    return (
        <div>
            <div style={{ fontSize: 9, color: "#505070", letterSpacing: 1, marginBottom: 6 }}>{label.toUpperCase()}</div>
            <div style={{ position: "relative" }}>
                <input type="number" step="0.1" value={value} onChange={e => onChange(e.target.value)}
                    style={{ width: "100%", background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 8, padding: `${big ? 14 : 10}px 40px ${big ? 14 : 10}px 14px`, color: "#fff", fontSize: big ? 24 : 18, fontFamily: "inherit", outline: "none" }}
                    onFocus={e => e.target.style.borderColor = ACCENT}
                    onBlur={e => e.target.style.borderColor = BORDER} />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#404060" }}>{unit}</span>
            </div>
        </div>
    );
}

// ─── TRIPS TAB ────────────────────────────────────────────────────────────────
function TripsTab({ config, fixedCosts, trips, saveTrips }) {
    const [filter, setFilter] = useState("all");
    const [addModal, setAddModal] = useState(false);

    const filtered = trips.filter(t => {
        if (filter === "today") return t.date === todayStr();
        if (filter === "week") { const d = new Date(); d.setDate(d.getDate() - 7); return new Date(t.created_at || t.timestamp) >= d; }
        return true;
    });

    const deleteTrip = async (id) => {
        await supabase.from('trips').delete().eq('id', id);
        saveTrips(trips.filter(t => t.id !== id));
    };

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 16 }}>
                {["all", "week", "today"].map(f => (
                    <button key={f} className="btn" onClick={() => setFilter(f)}
                        style={{ padding: "8px", background: filter === f ? `${ACCENT}22` : "transparent", border: `1px solid ${filter === f ? ACCENT : BORDER}`, borderRadius: 8, color: filter === f ? ACCENT : "#505070", fontSize: 11, letterSpacing: 1 }}>
                        {f === "all" ? "TODOS" : f === "week" ? "SEMANA" : "HOY"}
                    </button>
                ))}
            </div>
            <button className="btn" onClick={() => setAddModal(true)}
                style={{ width: "100%", padding: "12px", background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 10, color: ACCENT, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, letterSpacing: 1, marginBottom: 16 }}>
                + AGREGAR VIAJE MANUALMENTE
            </button>
            {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#404060" }}>
                    <div style={{ fontSize: 32 }}>🚗</div>
                    <div style={{ fontSize: 12, letterSpacing: 2, marginTop: 8 }}>SIN VIAJES</div>
                </div>
            ) : filtered.map(t => {
                const c = calcTrip(t, config, fixedCosts);
                const col = c.netPerHour >= config.targetHourlyRate ? ACCENT2 : c.netPerHour >= config.targetHourlyRate * 0.8 ? ACCENT : DANGER;
                return (
                    <div key={t.id} className="trip-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: "#505070", letterSpacing: 1, marginBottom: 4 }}>{fmtDate(t.created_at || t.timestamp)} · {(t.platform || "uber").toUpperCase()}</div>
                                <div style={{ fontSize: 13, color: "#c0c0e0" }}>{fmtMXN(t.fare)} · {fmt(c.totalKm, 1)} km · {c.totalMin.toFixed(0)} min</div>
                                {(t.gps_km > 0) && <div style={{ fontSize: 10, color: ACCENT2, marginTop: 2 }}>📍 GPS: {fmt(t.gps_km, 2)} km reales</div>}
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: col }}>{fmtMXN(c.netEarning)}</div>
                                <div style={{ fontSize: 9, color: "#505070" }}>{fmtMXN(c.netPerHour)}/hr · {fmtMXN(c.netPerKm)}/km</div>
                                <button className="btn" onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#404060", fontSize: 12, marginTop: 4 }}>✕</button>
                            </div>
                        </div>
                    </div>
                );
            })}
            {addModal && <TripModal config={config} fixedCosts={fixedCosts} trips={trips} saveTrips={saveTrips} activeDay={null} onClose={() => setAddModal(false)} />}
        </div>
    );
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────
function StatsTab({ config, fixedCosts, trips }) {
    const [range, setRange] = useState(30);
    const cutoff = Date.now() - range * 24 * 3600 * 1000;
    const filtered = trips.filter(t => new Date(t.created_at || t.timestamp).getTime() >= cutoff);

    const byDate = {};
    filtered.forEach(t => {
        const c = calcTrip(t, config, fixedCosts);
        const date = t.date || todayStr();
        if (!byDate[date]) byDate[date] = { date, net: 0, km: 0, trips: 0, minutes: 0, gas: 0 };
        byDate[date].net += c.netEarning;
        byDate[date].km += c.totalKm;
        byDate[date].trips += 1;
        byDate[date].minutes += c.totalMin;
        byDate[date].gas += c.gasCost;
    });
    const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
        ...d,
        netPerHour: d.minutes > 0 ? d.net / (d.minutes / 60) : 0,
        label: new Date(d.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    }));

    const totalNet = filtered.reduce((s, t) => s + calcTrip(t, config, fixedCosts).netEarning, 0);
    const totalKm = filtered.reduce((s, t) => s + calcTrip(t, config, fixedCosts).totalKm, 0);
    const totalGas = filtered.reduce((s, t) => s + calcTrip(t, config, fixedCosts).gasCost, 0);
    const bestDay = chartData.length > 0 ? chartData.reduce((b, d) => d.net > b.net ? d : b) : null;

    const platformData = filtered.reduce((acc, t) => {
        const p = t.platform || "uber";
        if (!acc[p]) acc[p] = { name: p.toUpperCase(), value: 0 };
        acc[p].value += calcTrip(t, config, fixedCosts).netEarning;
        return acc;
    }, {});
    const pieData = Object.values(platformData);
    const PIE_COLORS = [ACCENT, ACCENT2, "#a855f7", "#f43f5e"];

    const Tip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
            <div style={{ color: "#a0a0c0", marginBottom: 4 }}>{label}</div>
            {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {fmtMXN(p.value)}</div>)}
        </div>;
    };

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 20 }}>
                {[7, 14, 30, 60].map(r => (
                    <button key={r} className="btn" onClick={() => setRange(r)}
                        style={{ padding: "8px", background: range === r ? `${ACCENT}22` : "transparent", border: `1px solid ${range === r ? ACCENT : BORDER}`, borderRadius: 8, color: range === r ? ACCENT : "#505070", fontSize: 11, letterSpacing: 1 }}>
                        {r}D
                    </button>
                ))}
            </div>
            {filtered.length < 1 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#404060" }}>
                    <div style={{ fontSize: 32 }}>📊</div>
                    <div style={{ fontSize: 12, letterSpacing: 2, marginTop: 8 }}>REGISTRA VIAJES PARA VER ESTADÍSTICAS</div>
                </div>
            ) : <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {[
                        { l: "GANANCIA NETA", v: fmtMXN(totalNet), c: totalNet >= 0 ? ACCENT2 : DANGER },
                        { l: "VIAJES TOTALES", v: filtered.length, c: "#c0c0e0" },
                        { l: "KM RECORRIDOS", v: `${fmt(totalKm, 0)} km`, c: ACCENT },
                        { l: "PROMEDIO/VIAJE", v: fmtMXN(filtered.length > 0 ? totalNet / filtered.length : 0), c: ACCENT2 },
                    ].map(({ l, v, c }) => (
                        <div key={l} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
                            <div style={{ fontSize: 9, color: "#505070", letterSpacing: 2, marginBottom: 6 }}>{l}</div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: c }}>{v}</div>
                        </div>
                    ))}
                </div>
                {bestDay && (
                    <div style={{ background: `${ACCENT}11`, border: `1px solid ${ACCENT}33`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 2 }}>🏆 MEJOR DÍA</div>
                            <div style={{ fontSize: 13, marginTop: 4 }}>{fmtDate(bestDay.date)}</div>
                        </div>
                        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 800, color: ACCENT }}>{fmtMXN(bestDay.net)}</div>
                    </div>
                )}
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>GANANCIA DIARIA</div>
                    <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={chartData} margin={{ left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                            <XAxis dataKey="label" tick={{ fill: "#404060", fontSize: 9 }} />
                            <YAxis tick={{ fill: "#404060", fontSize: 9 }} />
                            <Tooltip content={<Tip />} />
                            <Bar dataKey="net" name="neto $" radius={[3, 3, 0, 0]}>
                                {chartData.map((e, i) => <Cell key={i} fill={e.net >= 0 ? ACCENT : DANGER} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>$/HORA VS META ({fmtMXN(config.targetHourlyRate)})</div>
                    <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={chartData} margin={{ left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                            <XAxis dataKey="label" tick={{ fill: "#404060", fontSize: 9 }} />
                            <YAxis tick={{ fill: "#404060", fontSize: 9 }} />
                            <Tooltip content={<Tip />} />
                            <Line type="monotone" dataKey="netPerHour" stroke={ACCENT2} strokeWidth={2} dot={false} name="$/hr" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                {pieData.length > 1 && (
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>GANANCIA POR PLATAFORMA</div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <ResponsiveContainer width="50%" height={120}>
                                <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value">
                                    {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                </Pie></PieChart>
                            </ResponsiveContainer>
                            <div style={{ flex: 1, paddingLeft: 8 }}>
                                {pieData.map((p, i) => (
                                    <div key={p.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i] }} />
                                            <span style={{ fontSize: 11 }}>{p.name}</span>
                                        </div>
                                        <span style={{ fontSize: 11, color: PIE_COLORS[i] }}>{fmtMXN(p.value)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>GASTO EN GASOLINA</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, color: DANGER }}>{fmtMXN(totalGas)}</div>
                            <div style={{ fontSize: 10, color: "#505070" }}>en {range} días</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, color: "#a0a0c0" }}>{fmtMXN(totalGas / (range || 1))}</div>
                            <div style={{ fontSize: 10, color: "#505070" }}>por día</div>
                        </div>
                    </div>
                    <div style={{ marginTop: 12, background: "#0a0b12", borderRadius: 6, height: 6 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, (totalGas / (totalNet + totalGas || 1)) * 100)}%`, background: DANGER, borderRadius: 6 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#505070", marginTop: 6 }}>Gas = {fmt((totalGas / (totalNet + totalGas || 1)) * 100, 1)}% de ingresos brutos</div>
                </div>
            </>}
        </div>
    );
}

// ─── AI TAB ───────────────────────────────────────────────────────────────────
function AITab({ config, trips }) {
    const [messages, setMessages] = useState([{ role: "assistant", content: "¡Hola! Soy tu asesor de rentabilidad 🚗\n\nPuedo analizar tus datos para ayudarte a ganar más:\n• ¿Cuándo son mis mejores horas?\n• ¿Cuál plataforma me conviene más?\n• ¿Cómo optimizo mis viajes?" }]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const endRef = useRef();
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const recent = trips.filter(t => new Date(t.created_at || t.timestamp).getTime() >= monthAgo);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const send = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: "user", content: input };
        const newMsgs = [...messages, userMsg];
        setMessages(newMsgs);
        setInput(""); setLoading(true);
        const stats = recent.reduce((a, t) => { const c = calcTrip(t, config, {}); return { net: a.net + c.netEarning, km: a.km + c.totalKm, count: a.count + 1, gas: a.gas + c.gasCost, mins: a.mins + c.totalMin }; }, { net: 0, km: 0, count: 0, gas: 0, mins: 0 });
        try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514", max_tokens: 1000,
                    system: `Asesor de rentabilidad para conductores Uber/Didi México. Consejos concisos y accionables. Español mexicano informal. Datos: ${recent.length} viajes últimos 30 días, neto $${fmt(stats.net)} MXN, ${fmt(stats.km, 0)} km, $${fmt(stats.gas)} gas, ${(stats.mins / 60).toFixed(1)} hrs. Meta/hr: $${config.targetHourlyRate}.`,
                    messages: newMsgs.map(m => ({ role: m.role, content: m.content }))
                })
            });
            const data = await res.json();
            setMessages(p => [...p, { role: "assistant", content: data.content?.find(b => b.type === "text")?.text || "No pude responder." }]);
        } catch { setMessages(p => [...p, { role: "assistant", content: "Error de conexión." }]); }
        setLoading(false);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }} className="fade-up">
            {recent.length < 5 && (
                <div style={{ margin: "12px 16px 0", background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 10, padding: "10px 14px", fontSize: 11, color: ACCENT }}>
                    ⚠️ Necesitas más datos para análisis óptimo ({recent.length} viajes — meta: 30 días)
                </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "85%", padding: "12px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? `${ACCENT}22` : CARD, border: `1px solid ${m.role === "user" ? ACCENT + "44" : BORDER}`, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {m.content}
                        </div>
                    </div>
                ))}
                {loading && <div style={{ display: "flex" }}><div style={{ padding: "12px 16px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}><div className="recording" style={{ color: ACCENT2, fontSize: 12, letterSpacing: 2 }}>ANALIZANDO...</div></div></div>}
                <div ref={endRef} />
            </div>
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="¿Cómo mejoro mi rentabilidad?"
                    style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "#e8eaf0", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                <button className="btn" onClick={send} disabled={!input.trim() || loading}
                    style={{ padding: "12px 16px", background: input.trim() ? `${ACCENT}22` : "transparent", border: `1px solid ${input.trim() ? ACCENT : BORDER}`, borderRadius: 10, color: input.trim() ? ACCENT : "#404060", fontSize: 16 }}>➤</button>
            </div>
        </div>
    );
}

// ─── CONFIG TAB ───────────────────────────────────────────────────────────────
function ConfigTab({ config, fixedCosts, saveConfig, onLogout }) {
    const [local, setLocal] = useState(config);
    const [lf, setLf] = useState(fixedCosts || DEFAULT_FIXED_COSTS);
    const [saved, setSaved] = useState(false);
    const set = (k, v) => setLocal(p => ({ ...p, [k]: parseFloat(v) || 0 }));
    const sf = (k, v) => setLf(p => ({ ...p, [k]: v }));

    const save = async () => { await saveConfig(local, lf); setSaved(true); setTimeout(() => setSaved(false), 2000); };
    const periods = ["diario", "semanal", "mensual", "trimestral", "semestral", "anual"];

    const FCRow = ({ ek, mk, pk, label, xk, xl }) => (
        <div style={{ background: CARD, border: `1px solid ${lf[ek] ? ACCENT + "44" : BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: lf[ek] ? 12 : 0 }}>
                <div style={{ fontSize: 11, color: lf[ek] ? ACCENT : "#505070" }}>{label}</div>
                <button className="btn" onClick={() => sf(ek, !lf[ek])}
                    style={{ padding: "4px 12px", background: lf[ek] ? `${ACCENT}22` : "transparent", border: `1px solid ${lf[ek] ? ACCENT : BORDER}`, borderRadius: 20, color: lf[ek] ? ACCENT : "#505070", fontSize: 10 }}>
                    {lf[ek] ? "✓ ACTIVO" : "ACTIVAR"}
                </button>
            </div>
            {lf[ek] && (
                <div style={{ display: "grid", gridTemplateColumns: xk ? "1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                    <div>
                        <div style={{ fontSize: 9, color: "#505070", marginBottom: 4 }}>MONTO $MXN</div>
                        <input type="number" value={lf[mk]} onChange={e => sf(mk, parseFloat(e.target.value) || 0)}
                            style={{ width: "100%", background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 14, fontFamily: "inherit" }} />
                    </div>
                    {pk && <div>
                        <div style={{ fontSize: 9, color: "#505070", marginBottom: 4 }}>PERIODO</div>
                        <select value={lf[pk]} onChange={e => sf(pk, e.target.value)}
                            style={{ width: "100%", background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 11, fontFamily: "inherit" }}>
                            {periods.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>}
                    {xk && <div>
                        <div style={{ fontSize: 9, color: "#505070", marginBottom: 4 }}>{xl}</div>
                        <input type="number" value={lf[xk]} onChange={e => sf(xk, parseFloat(e.target.value) || 0)}
                            style={{ width: "100%", background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px", color: "#fff", fontSize: 14, fontFamily: "inherit" }} />
                    </div>}
                </div>
            )}
        </div>
    );

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT, marginBottom: 20, letterSpacing: 1 }}>CONFIGURACIÓN</div>

            <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, marginBottom: 12 }}>VARIABLES BÁSICAS</div>
            {[
                { key: "gasPricePerLiter", label: "Precio de gasolina", unit: "MXN/L", step: "0.5" },
                { key: "kmPerLiter", label: "Rendimiento de tu auto", unit: "km/L", step: "0.5" },
                { key: "targetHourlyRate", label: "Meta por hora", unit: "MXN/hr", step: "10" },
                { key: "platformCut", label: "Comisión plataforma", unit: "%", step: "1" },
            ].map(({ key, label, unit, step }) => (
                <div key={key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 8 }}>{label.toUpperCase()}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input type="number" step={step} value={local[key]} onChange={e => set(key, e.target.value)}
                            style={{ flex: 1, background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 20, fontFamily: "inherit", outline: "none" }}
                            onFocus={e => e.target.style.borderColor = ACCENT} onBlur={e => e.target.style.borderColor = BORDER} />
                        <div style={{ fontSize: 12, color: "#505070", minWidth: 50 }}>{unit}</div>
                    </div>
                </div>
            ))}

            <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, margin: "20px 0 12px" }}>GASTOS FIJOS (OPCIONALES)</div>
            <FCRow ek="rentaEnabled" mk="rentaMonto" pk="rentaPeriodo" label="🚗 RENTA / CRÉDITO DEL AUTO" />
            <FCRow ek="seguroEnabled" mk="seguroMonto" pk="seguroPeriodo" label="🛡️ SEGURO DEL AUTO" />
            <FCRow ek="llantasEnabled" mk="llantasMonto" xk="llantasKmVida" xl="VIDA (KM)" label="🔧 DESGASTE DE LLANTAS" />
            <FCRow ek="mantenimientoEnabled" mk="mantenimientoMonto" xk="mantenimientoKmVida" xl="CADA (KM)" label="🔩 MANTENIMIENTO" />

            <button className="btn" onClick={save}
                style={{ width: "100%", padding: "16px", background: saved ? `${ACCENT2}22` : `${ACCENT}22`, border: `2px solid ${saved ? ACCENT2 : ACCENT}`, borderRadius: 12, color: saved ? ACCENT2 : ACCENT, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: 2, marginTop: 10 }}>
                {saved ? "✓ GUARDADO" : "GUARDAR CAMBIOS"}
            </button>

            <button className="btn" onClick={onLogout}
                style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${DANGER}44`, borderRadius: 12, color: DANGER, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 14, letterSpacing: 2, marginTop: 10 }}>
                CERRAR SESIÓN
            </button>
        </div>
    );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function Auth() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);

    const handleAuth = async (e) => {
        e.preventDefault(); setLoading(true);
        const { error } = isSignUp
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });
        if (error) alert(error.message);
        setLoading(false);
    };

    return (
        <div style={{ background: "#07080d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "monospace" }}>
            <div style={{ background: "#0e1018", border: "1px solid #1c1f2e", padding: 32, borderRadius: 20, width: "100%", maxWidth: 400 }}>
                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#f0a500" }}>RUTAFLOW</div>
                    <div style={{ fontSize: 10, color: "#404060", letterSpacing: 2 }}>ACCESO DE CONDUCTOR</div>
                </div>
                <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
                        style={{ width: "100%", background: "#0a0b12", border: "1px solid #1c1f2e", borderRadius: 8, padding: 14, color: "#fff" }} />
                    <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required
                        style={{ width: "100%", background: "#0a0b12", border: "1px solid #1c1f2e", borderRadius: 8, padding: 14, color: "#fff" }} />
                    <button type="submit" disabled={loading} style={{ padding: 16, background: "#f0a50022", border: "2px solid #f0a500", borderRadius: 12, color: "#f0a500", fontWeight: 700 }}>
                        {loading ? "CARGANDO..." : isSignUp ? "REGISTRARME" : "ENTRAR"}
                    </button>
                </form>
                <button onClick={() => setIsSignUp(!isSignUp)} style={{ width: "100%", background: "none", border: "none", color: "#606080", fontSize: 11, marginTop: 20, textDecoration: "underline" }}>
                    {isSignUp ? "¿Ya tienes cuenta? Inicia sesión" : "¿Eres nuevo? Crea una cuenta"}
                </button>
            </div>
        </div>
    );
}
