import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, Legend } from "recharts";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const STORAGE_KEYS = { TRIPS: "rutaflow:trips", DAYS: "rutaflow:days", CONFIG: "rutaflow:config", ACTIVE_DAY: "rutaflow:activeday" };
const DEFAULT_CONFIG = { gasPricePerLiter: 24.5, kmPerLiter: 12, targetHourlyRate: 150, platformCut: 25 };
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
const calcTrip = (trip, cfg) => {
    const totalKm = (parseFloat(trip.pickupKm) || 0) + (parseFloat(trip.destKm) || 0);
    const totalMin = (parseFloat(trip.pickupMin) || 0) + (parseFloat(trip.destMin) || 0);
    const gasCost = (totalKm / cfg.kmPerLiter) * cfg.gasPricePerLiter;
    const platformFee = (parseFloat(trip.fare) || 0) * (cfg.platformCut / 100);
    const netEarning = (parseFloat(trip.fare) || 0) - platformFee - gasCost;
    const hours = totalMin / 60;
    const netPerHour = hours > 0 ? netEarning / hours : 0;
    const netPerKm = totalKm > 0 ? netEarning / totalKm : 0;
    return { totalKm, totalMin, gasCost, platformFee, netEarning, netPerHour, netPerKm, hours };
};

// ─── STORAGE ─────────────────────────────────────────────────────────────────
const store = {
    async get(key) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; } },
    async set(key, val) { try { await window.storage.set(key, JSON.stringify(val)); } catch { } },
};

// ─── BOTTOM NAV ──────────────────────────────────────────────────────────────
const NAV_ITEMS = [
    { id: "home", icon: "⚡", label: "Hoy" },
    { id: "trips", icon: "🗂", label: "Viajes" },
    { id: "stats", icon: "📊", label: "Stats" },
    { id: "ai", icon: "🤖", label: "IA" },
    { id: "config", icon: "⚙️", label: "Config" },
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function RutaFlow() {
    const [session, setSession] = useState(null);
    const [tab, setTab] = useState("home");
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [trips, setTrips] = useState([]);
    const [days, setDays] = useState([]);
    const [activeDay, setActiveDay] = useState(null);
    const [loading, setLoading] = useState(true);
    const loadDataFromCloud = async () => {
        setLoading(true); // Ponemos la pantalla de "Cargando..."

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // Si no hay usuario, no buscamos nada

            // 1. Traer los VIAJES
            const { data: tripsData, error: tripsErr } = await supabase
                .from('trips')
                .select('*')
                .order('timestamp', { ascending: false }); // Los más nuevos primero

            if (tripsData) setTrips(tripsData);

            // 2. Traer la CONFIGURACIÓN (Precio gas, rendimiento, etc)
            const { data: profileData, error: profileErr } = await supabase
                .from('profiles')
                .select('config')
                .eq('id', user.id)
                .single();

            if (profileData) setConfig(profileData.config);

            // 3. Traer el HISTORIAL DE JORNADAS (Días terminados)
            const { data: daysData } = await supabase
                .from('days')
                .select('*')
                .order('date', { ascending: false });

            if (daysData) setDays(daysData);

        } catch (err) {
            console.error("Error cargando datos:", err);
        } finally {
            setLoading(false); // Quitamos la pantalla de carga
        }
    };

    // Load all data
useEffect(() => {
  // 1. Revisar si ya hay una sesión activa al abrir la app
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session);
  });

  // 2. Escuchar si el usuario entra (Login) o sale (Logout)
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    // Si el usuario acaba de entrar, cargamos sus datos de la nube
    if (session) {
      loadDataFromCloud(); 
    }
  });

  return () => subscription.unsubscribe();
}, []);

    const saveTripToCloud = async (tripData) => {
        // 1. Obtenemos el ID del usuario que tiene la sesión iniciada
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            alert("Debes iniciar sesión para guardar viajes.");
            return;
        }

        // 2. Mandamos el nuevo viaje a la tabla 'trips' de Supabase
        const { error } = await supabase
            .from('trips')
            .insert([
                {
                    user_id: user.id,
                    fare: parseFloat(tripData.fare), // Convertimos a número para que SQL lo entienda
                    pickup_km: parseFloat(tripData.pickupKm || 0),
                    dest_km: parseFloat(tripData.destKm || 0),
                    platform: tripData.platform,
                    date: new Date().toISOString().split('T')[0] // Guarda la fecha de hoy
                }
            ]);

        // 3. Si hay un error (ej. se fue el internet), avisamos al conductor
        if (error) {
            console.error("Error en Supabase:", error);
            alert("Error al guardar: " + error.message);
        } else {
            console.log("Viaje guardado en la nube ✓");
        }
    };
    const saveDays = async (listaDias) => {
        setDays(listaDias); // Actualiza la pantalla
        const ultimoDia = listaDias[listaDias.length - 1]; // Toma el día más reciente
        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('days')
            .insert([{
                user_id: user.id,
                date: ultimoDia.date,
                total_net: ultimoDia.totalNet,
                total_km: ultimoDia.totalKm,
                trip_count: ultimoDia.tripCount
            }]);

        if (error) console.error("Error al guardar jornada:", error.message);
    };
    const saveConfig = async (nuevaConfig) => {
        const { data: { user } } = await supabase.auth.getUser();
        setConfig(nuevaConfig); // Actualiza la pantalla rápido

        const { error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, config: nuevaConfig, updated_at: new Date() });

        if (error) alert("Error al guardar configuración: " + error.message);
    };
    const saveActiveDay = async (d) => { setActiveDay(d); await store.set(STORAGE_KEYS.ACTIVE_DAY, d); };

   // 1. Primero revisamos si la App está cargando datos
    if (loading) return (
        <div style={{ background: BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", color: ACCENT }}>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🚗</div>
                <div style={{ letterSpacing: 4, fontSize: 12 }}>CARGANDO...</div>
            </div>
        </div>
    );

    // 2. Si ya terminó de cargar, revisamos si hay alguien logueado.
    // SI NO HAY SESIÓN, mostramos la pantalla de Auth (Login)
    if (!session) {
        return <Auth />;
    }

    // 3. Si hay sesión, pasamos al diseño principal de la App
    const todayTrips = trips.filter(t => t.date === todayStr());
    // ... sigue el resto de tu código ...
    const todayTrips = trips.filter(t => t.date === todayStr());
    const todayNet = todayTrips.reduce((s, t) => s + (calcTrip(t, config).netEarning), 0);

    return (
        <div style={{ background: BG, minHeight: "100vh", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e8eaf0", maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 80 }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Barlow+Condensed:wght@600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; }
        input, textarea, select { font-family: inherit; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .btn { cursor: pointer; border: none; font-family: inherit; transition: all 0.15s; }
        .btn:active { transform: scale(0.97); }
        .tab-btn { cursor: pointer; transition: all 0.2s; }
        .tab-btn:hover { background: #1c1f2e44 !important; }
        .trip-card { transition: transform 0.2s; }
        .trip-card:hover { transform: translateX(3px); }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        .recording { animation: pulse 2s infinite; }
      `}</style>

            {/* Header */}
            <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
                <div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT, letterSpacing: 1 }}>RUTAFLOW</div>
                    <div style={{ fontSize: 10, color: "#404060", letterSpacing: 2 }}>GESTOR DE CONDUCTOR</div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#606080" }}>hoy neto</div>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: todayNet >= 0 ? ACCENT2 : DANGER }}>{fmtMXN(todayNet)}</div>
                </div>
            </div>

            {/* Content */}
            <div style={{ padding: "0 0 8px" }}>
                {tab === "home" && <HomeTab config={config} trips={trips} days={days} activeDay={activeDay} saveTrips={saveTrips} saveDays={saveDays} saveActiveDay={saveActiveDay} />}
                {tab === "trips" && <TripsTab config={config} trips={trips} saveTrips={saveTrips} />}
                {tab === "stats" && <StatsTab config={config} trips={trips} days={days} />}
                {tab === "ai" && <AITab config={config} trips={trips} days={days} />}
                {tab === "config" && <ConfigTab config={config} saveConfig={saveConfig} />}
            </div>

            {/* Bottom Nav */}
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

// ─── HOME TAB (Day + Quick Trip) ──────────────────────────────────────────────
function HomeTab({ config, trips, days, activeDay, saveTrips, saveDays, saveActiveDay }) {
    const [elapsed, setElapsed] = useState(0);
    const [tripModal, setTripModal] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (activeDay?.running) {
            timerRef.current = setInterval(() => setElapsed(now() - activeDay.startTime), 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [activeDay]);

    const startDay = async () => {
        const d = { id: `day-${now()}`, date: todayStr(), startTime: now(), running: true, startKm: 0, trips: [] };
        await saveActiveDay(d);
    };

    const endDay = async () => {
        if (!activeDay) return;
        clearInterval(timerRef.current);
        const dayTrips = trips.filter(t => t.dayId === activeDay.id);
        const totalNet = dayTrips.reduce((s, t) => s + calcTrip(t, config).netEarning, 0);
        const totalKm = dayTrips.reduce((s, t) => s + (parseFloat(t.pickupKm) || 0) + (parseFloat(t.destKm) || 0), 0);
        const totalMin = (now() - activeDay.startTime) / 60000;
        const finished = { ...activeDay, endTime: now(), running: false, totalNet, totalKm, totalMin, tripCount: dayTrips.length };
        const newDays = [...days, finished];
        await saveDays(newDays);
        await saveActiveDay(null);
        setElapsed(0);
    };

    const todayTrips = trips.filter(t => t.date === todayStr());
    const todayStats = todayTrips.reduce((acc, t) => {
        const c = calcTrip(t, config);
        return { net: acc.net + c.netEarning, km: acc.km + c.totalKm, trips: acc.trips + 1 };
    }, { net: 0, km: 0, trips: 0 });

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            {/* Day Control */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, marginBottom: 16 }}>JORNADA DE HOY</div>

                {!activeDay ? (
                    <button className="btn" onClick={startDay}
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
                            <button className="btn" onClick={endDay}
                                style={{ padding: "14px", background: `${DANGER}15`, border: `1px solid ${DANGER}`, borderRadius: 10, color: DANGER, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 16, fontWeight: 700 }}>
                                FIN DÍA
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Today's trips mini list */}
            {todayTrips.length > 0 && (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 3, marginBottom: 14 }}>VIAJES DE HOY</div>
                    {todayTrips.slice(-5).reverse().map(t => {
                        const c = calcTrip(t, config);
                        const verdict = c.netPerHour >= config.targetHourlyRate ? ACCENT2 : c.netPerHour >= config.targetHourlyRate * 0.8 ? ACCENT : DANGER;
                        return (
                            <div key={t.id} className="trip-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
                                <div>
                                    <div style={{ fontSize: 12, color: "#c0c0e0" }}>{fmtMXN(t.fare)} tarifa · {fmt(c.totalKm, 1)} km</div>
                                    <div style={{ fontSize: 10, color: "#505070" }}>{c.totalMin.toFixed(0)} min · gas {fmtMXN(c.gasCost)}</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 700, color: verdict }}>{fmtMXN(c.netEarning)}</div>
                                    <div style={{ fontSize: 9, color: "#505070" }}>{fmtMXN(c.netPerHour)}/hr</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {tripModal && <TripModal config={config} trips={trips} saveTrips={saveTrips} activeDay={activeDay} onClose={() => setTripModal(false)} />}
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
function TripModal({ config, trips, saveTrips, activeDay, onClose }) {
    const [mode, setMode] = useState("manual"); // manual | photo
    const [phase, setPhase] = useState(0); // 0=recoleccion,1=destino,2=review
    const [trip, setTrip] = useState({ fare: "", pickupKm: "", pickupMin: "", destKm: "", destMin: "", platform: "uber", notes: "" });
    const [processing, setProcessing] = useState(false);
    const [img, setImg] = useState(null);
    const [tripRunning, setTripRunning] = useState(false);
    const [tripStart, setTripStart] = useState(null);
    const [elapsed, setElapsed] = useState(0);
    const timerRef = useRef(null);
    const fileRef = useRef();

    const setField = (k, v) => setTrip(p => ({ ...p, [k]: v }));
    const calc = calcTrip(trip, config);

    // Running timer for active trip phase
    useEffect(() => {
        if (tripRunning) {
            timerRef.current = setInterval(() => setElapsed(now() - tripStart), 1000);
        } else clearInterval(timerRef.current);
        return () => clearInterval(timerRef.current);
    }, [tripRunning, tripStart]);

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
                        model: "claude-sonnet-4-20250514",
                        max_tokens: 500,
                        messages: [{
                            role: "user",
                            content: [
                                { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } },
                                { type: "text", text: `Analiza esta captura de pantalla de Uber o Didi. Extrae SOLO: tarifa (número), distancia en km (número), tiempo estimado en minutos (número). Responde SOLO en JSON así: {"fare":0,"destKm":0,"destMin":0}. Si no ves algún dato pon 0.` }
                            ]
                        }]
                    })
                });
                const data = await res.json();
                const txt = data.content?.find(b => b.type === "text")?.text || "{}";
                const clean = txt.replace(/```json|```/g, "").trim();
                const parsed = JSON.parse(clean);
                setTrip(p => ({ ...p, fare: parsed.fare || "", destKm: parsed.destKm || "", destMin: parsed.destMin || "" }));
                setMode("manual");
                setPhase(2);
            } catch (err) {
                alert("No pude leer la imagen, intenta manualmente.");
                setMode("manual");
            }
            setProcessing(false);
        };
        reader.readAsDataURL(file);
    };

    const saveTrip = async () => {
        const newTrip = { ...trip, id: `trip-${now()}`, date: todayStr(), timestamp: now(), dayId: activeDay?.id || null };
        const newTrips = [...trips, newTrip];
        await saveTrips(newTrips);
        onClose();
    };

    const verdict = calc.netPerHour >= config.targetHourlyRate ? { color: ACCENT2, label: "✅ Buen viaje" }
        : calc.netPerHour >= config.targetHourlyRate * 0.8 ? { color: ACCENT, label: "⚠️ Regular" }
            : { color: DANGER, label: "❌ No conviene" };

    return (
        <div style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#0e1018", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", padding: "24px 20px", maxHeight: "90vh", overflowY: "auto", borderTop: `2px solid ${BORDER}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT }}>NUEVO VIAJE</div>
                    <button className="btn" onClick={onClose} style={{ background: "none", border: "none", color: "#606080", fontSize: 20 }}>✕</button>
                </div>

                {/* Mode selector */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                    {["manual", "photo"].map(m => (
                        <button key={m} className="btn" onClick={() => setMode(m)}
                            style={{ padding: "10px", background: mode === m ? `${ACCENT}22` : "transparent", border: `1px solid ${mode === m ? ACCENT : BORDER}`, borderRadius: 8, color: mode === m ? ACCENT : "#606080", fontSize: 12, letterSpacing: 1 }}>
                            {m === "manual" ? "✍️ MANUAL" : "📸 FOTO"}
                        </button>
                    ))}
                </div>

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
                                <span style={{ fontSize: 11, color: "#606080", fontWeight: 400, letterSpacing: 0 }}>La IA extrae tarifa, km y tiempo</span>
                            </button>
                        )}
                        {img && <img src={img} style={{ width: "100%", borderRadius: 8, marginTop: 12, opacity: 0.6 }} alt="preview" />}
                    </div>
                )}

                {mode === "manual" && (
                    <div>
                        {/* Plataforma */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                            {["uber", "didi", "beat", "otra"].map(p => (
                                <button key={p} className="btn" onClick={() => setField("platform", p)}
                                    style={{ padding: "8px", background: trip.platform === p ? `${ACCENT}22` : "transparent", border: `1px solid ${trip.platform === p ? ACCENT : BORDER}`, borderRadius: 8, color: trip.platform === p ? ACCENT : "#505070", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                                    {p}
                                </button>
                            ))}
                        </div>

                        {/* Fare always visible */}
                        <TripInput label="💰 TARIFA DEL VIAJE (MXN)" value={trip.fare} onChange={v => setField("fare", v)} unit="$" big />

                        {/* Phase tabs */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, margin: "16px 0 12px" }}>
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

                {/* Live preview */}
                {trip.fare && (trip.destKm || trip.destMin) && (
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
                    onBlur={e => e.target.style.borderColor = BORDER}
                />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#404060" }}>{unit}</span>
            </div>
        </div>
    );
}

// ─── TRIPS TAB ────────────────────────────────────────────────────────────────
function TripsTab({ config, trips, saveTrips }) {
    const [filter, setFilter] = useState("all");
    const [addModal, setAddModal] = useState(false);

    const filtered = trips.filter(t => {
        if (filter === "today") return t.date === todayStr();
        if (filter === "week") {
            const d = new Date(); d.setDate(d.getDate() - 7);
            return new Date(t.timestamp) >= d;
        }
        return true;
    }).sort((a, b) => b.timestamp - a.timestamp);

    const deleteTrip = async (id) => {
        await saveTrips(trips.filter(t => t.id !== id));
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
            ) : (
                filtered.map(t => {
                    const c = calcTrip(t, config);
                    const verdict = c.netPerHour >= config.targetHourlyRate ? ACCENT2 : c.netPerHour >= config.targetHourlyRate * 0.8 ? ACCENT : DANGER;
                    return (
                        <div key={t.id} className="trip-card" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div>
                                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 1, marginBottom: 4 }}>{fmtDate(t.timestamp)} · {t.platform?.toUpperCase()}</div>
                                    <div style={{ fontSize: 13, color: "#c0c0e0" }}>{fmtMXN(t.fare)} tarifa · {fmt(c.totalKm, 1)} km · {c.totalMin.toFixed(0)} min</div>
                                    <div style={{ fontSize: 10, color: "#505070", marginTop: 3 }}>recogida: {t.pickupKm || 0}km/{t.pickupMin || 0}min · destino: {t.destKm || 0}km/{t.destMin || 0}min</div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: verdict }}>{fmtMXN(c.netEarning)}</div>
                                    <div style={{ fontSize: 9, color: "#505070" }}>{fmtMXN(c.netPerHour)}/hr</div>
                                    <button className="btn" onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#404060", fontSize: 12, marginTop: 4 }}>✕</button>
                                </div>
                            </div>
                        </div>
                    );
                })
            )}

            {addModal && <TripModal config={config} trips={trips} saveTrips={saveTrips} activeDay={null} onClose={() => setAddModal(false)} />}
        </div>
    );
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────
function StatsTab({ config, trips, days }) {
    const [range, setRange] = useState(30);

    const cutoff = Date.now() - range * 24 * 3600 * 1000;
    const filtered = trips.filter(t => t.timestamp >= cutoff);

    // Group by date
    const byDate = {};
    filtered.forEach(t => {
        const c = calcTrip(t, config);
        if (!byDate[t.date]) byDate[t.date] = { date: t.date, net: 0, km: 0, trips: 0, minutes: 0, gas: 0 };
        byDate[t.date].net += c.netEarning;
        byDate[t.date].km += c.totalKm;
        byDate[t.date].trips += 1;
        byDate[t.date].minutes += c.totalMin;
        byDate[t.date].gas += c.gasCost;
    });
    const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
        ...d,
        netPerHour: d.minutes > 0 ? (d.net / (d.minutes / 60)) : 0,
        label: new Date(d.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    }));

    const totalNet = filtered.reduce((s, t) => s + calcTrip(t, config).netEarning, 0);
    const totalKm = filtered.reduce((s, t) => s + (parseFloat(t.pickupKm) || 0) + (parseFloat(t.destKm) || 0), 0);
    const totalGas = filtered.reduce((s, t) => s + calcTrip(t, config).gasCost, 0);
    const avgPerTrip = filtered.length > 0 ? totalNet / filtered.length : 0;
    const bestDay = chartData.length > 0 ? chartData.reduce((b, d) => d.net > b.net ? d : b) : null;

    // Platform breakdown
    const platformData = filtered.reduce((acc, t) => {
        const p = t.platform || "uber";
        if (!acc[p]) acc[p] = { name: p.toUpperCase(), value: 0, count: 0 };
        acc[p].value += calcTrip(t, config).netEarning;
        acc[p].count += 1;
        return acc;
    }, {});
    const pieData = Object.values(platformData);
    const PIE_COLORS = [ACCENT, ACCENT2, "#a855f7", "#f43f5e"];

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{ background: "#0e1018", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
                <div style={{ color: "#a0a0c0", marginBottom: 4 }}>{label}</div>
                {payload.map((p, i) => <div key={i} style={{ color: p.color }}>{p.name}: {p.name.includes("km") ? `${fmt(p.value, 1)} km` : fmtMXN(p.value)}</div>)}
            </div>
        );
    };

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            {/* Range selector */}
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
                    {range < 30 && <div style={{ fontSize: 10, color: "#303050", marginTop: 8 }}>Se recomienda 1 mes de datos para análisis confiable</div>}
                </div>
            ) : (
                <>
                    {/* KPI Row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                        {[
                            { l: "GANANCIA NETA", v: fmtMXN(totalNet), c: totalNet >= 0 ? ACCENT2 : DANGER },
                            { l: "VIAJES TOTALES", v: filtered.length, c: "#c0c0e0" },
                            { l: "KM RECORRIDOS", v: `${fmt(totalKm, 0)} km`, c: ACCENT },
                            { l: "PROMEDIO/VIAJE", v: fmtMXN(avgPerTrip), c: avgPerTrip >= 0 ? ACCENT2 : DANGER },
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

                    {/* Earnings chart */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>GANANCIA DIARIA (MXN)</div>
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={chartData} margin={{ left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                                <XAxis dataKey="label" tick={{ fill: "#404060", fontSize: 9 }} />
                                <YAxis tick={{ fill: "#404060", fontSize: 9 }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="net" fill={ACCENT} name="neto $" radius={[3, 3, 0, 0]}>
                                    {chartData.map((e, i) => <Cell key={i} fill={e.net >= 0 ? ACCENT : DANGER} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Per-hour chart */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>RENTABILIDAD $/HORA VS META ({fmtMXN(config.targetHourlyRate)})</div>
                        <ResponsiveContainer width="100%" height={140}>
                            <LineChart data={chartData} margin={{ left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                                <XAxis dataKey="label" tick={{ fill: "#404060", fontSize: 9 }} />
                                <YAxis tick={{ fill: "#404060", fontSize: 9 }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Line type="monotone" dataKey="netPerHour" stroke={ACCENT2} strokeWidth={2} dot={false} name="$/hr" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Platform pie */}
                    {pieData.length > 1 && (
                        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 14 }}>GANANCIA POR PLATAFORMA</div>
                            <div style={{ display: "flex", alignItems: "center" }}>
                                <ResponsiveContainer width="50%" height={120}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value">
                                            {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                        </Pie>
                                    </PieChart>
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

                    {/* Gas cost chart */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px" }}>
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
                        <div style={{ marginTop: 12, background: "#0a0b12", borderRadius: 6, height: 6, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (totalGas / (totalNet + totalGas)) * 100)}%`, background: DANGER, borderRadius: 6 }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#505070", marginTop: 6 }}>Gasolina = {fmt((totalGas / (totalNet + totalGas || 1)) * 100, 1)}% de ingresos brutos</div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── AI TAB ───────────────────────────────────────────────────────────────────
function AITab({ config, trips, days }) {
    const [messages, setMessages] = useState([{
        role: "assistant",
        content: "¡Hola! Soy tu asesor de rentabilidad 🚗\n\nPuedo analizar tus datos para ayudarte a ganar más. Pregúntame:\n• ¿Cuándo son mis mejores horas?\n• ¿Cuál plataforma me conviene más?\n• ¿Cómo optimizo mis viajes?\n• ¿En qué días gano más?\n\n¿Qué quieres saber?"
    }]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const endRef = useRef();
    const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const recentTrips = trips.filter(t => t.timestamp >= monthAgo);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const buildContext = () => {
        const stats = recentTrips.reduce((acc, t) => {
            const c = calcTrip(t, config);
            return { net: acc.net + c.netEarning, km: acc.km + c.totalKm, count: acc.count + 1, gas: acc.gas + c.gasCost, mins: acc.mins + c.totalMin };
        }, { net: 0, km: 0, count: 0, gas: 0, mins: 0 });
        return `Datos del conductor (últimos 30 días): ${recentTrips.length} viajes, ganancia neta total $${fmt(stats.net)} MXN, ${fmt(stats.km, 0)} km recorridos, $${fmt(stats.gas)} gastado en gasolina, ${(stats.mins / 60).toFixed(1)} horas conducidas. Meta por hora: $${config.targetHourlyRate} MXN. Precio gas: $${config.gasPricePerLiter}/L. Rendimiento: ${config.kmPerLiter} km/L.`;
    };

    const send = async () => {
        if (!input.trim() || loading) return;
        const userMsg = { role: "user", content: input };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput("");
        setLoading(true);
        try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "claude-sonnet-4-20250514",
                    max_tokens: 1000,
                    system: `Eres un asesor experto en rentabilidad para conductores de Uber y Didi en México. Das consejos concisos, accionables y basados en datos reales. Hablas en español mexicano informal. Usas emojis moderadamente. ${buildContext()}`,
                    messages: newMessages.map(m => ({ role: m.role, content: m.content }))
                })
            });
            const data = await res.json();
            const reply = data.content?.find(b => b.type === "text")?.text || "No pude responder ahora.";
            setMessages(prev => [...prev, { role: "assistant", content: reply }]);
        } catch {
            setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión. Intenta de nuevo." }]);
        }
        setLoading(false);
    };

    const hasEnoughData = recentTrips.length >= 5;

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }} className="fade-up">
            {!hasEnoughData && (
                <div style={{ margin: "12px 16px 0", background: `${ACCENT}15`, border: `1px solid ${ACCENT}44`, borderRadius: 10, padding: "10px 14px", fontSize: 11, color: ACCENT }}>
                    ⚠️ Para análisis óptimo necesitas al menos 1 mes de datos ({recentTrips.length} viajes registrados de 30+ recomendados)
                </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                            maxWidth: "85%", padding: "12px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                            background: m.role === "user" ? `${ACCENT}22` : CARD,
                            border: `1px solid ${m.role === "user" ? ACCENT + "44" : BORDER}`,
                            fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap"
                        }}>
                            {m.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                        <div style={{ padding: "12px 16px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
                            <div className="recording" style={{ color: ACCENT2, fontSize: 12, letterSpacing: 2 }}>ANALIZANDO...</div>
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
                    placeholder="¿Cómo mejoro mi rentabilidad?"
                    style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: "#e8eaf0", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                <button className="btn" onClick={send} disabled={!input.trim() || loading}
                    style={{ padding: "12px 16px", background: input.trim() ? `${ACCENT}22` : "transparent", border: `1px solid ${input.trim() ? ACCENT : BORDER}`, borderRadius: 10, color: input.trim() ? ACCENT : "#404060", fontSize: 16 }}>
                    ➤
                </button>
            </div>
        </div>
    );
}

// ─── CONFIG TAB ───────────────────────────────────────────────────────────────
function ConfigTab({ config, saveConfig }) {
    const [local, setLocal] = useState(config);
    const [saved, setSaved] = useState(false);
    const set = (k, v) => setLocal(p => ({ ...p, [k]: parseFloat(v) || 0 }));

    const save = async () => {
        await saveConfig(local);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const fields = [
        { key: "gasPricePerLiter", label: "Precio de gasolina", unit: "MXN/L", step: "0.5" },
        { key: "kmPerLiter", label: "Rendimiento de tu auto", unit: "km/L", step: "0.5" },
        { key: "targetHourlyRate", label: "Meta de ganancia por hora", unit: "MXN/hr", step: "10" },
        { key: "platformCut", label: "Comisión de la plataforma", unit: "%", step: "1" },
    ];

    return (
        <div style={{ padding: "20px 16px" }} className="fade-up">
            <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 800, color: ACCENT, marginBottom: 20, letterSpacing: 1 }}>CONFIGURACIÓN</div>
            {fields.map(({ key, label, unit, step }) => (
                <div key={key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px", marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 10 }}>{label.toUpperCase()}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <input type="number" step={step} value={local[key]} onChange={e => set(key, e.target.value)}
                            style={{ flex: 1, background: "#0a0b12", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px", color: "#fff", fontSize: 22, fontFamily: "inherit", outline: "none" }}
                            onFocus={e => e.target.style.borderColor = ACCENT}
                            onBlur={e => e.target.style.borderColor = BORDER} />
                        <div style={{ fontSize: 12, color: "#505070", minWidth: 50 }}>{unit}</div>
                    </div>
                </div>
            ))}

            <button className="btn" onClick={save}
                style={{ width: "100%", padding: "16px", background: saved ? `${ACCENT2}22` : `${ACCENT}22`, border: `2px solid ${saved ? ACCENT2 : ACCENT}`, borderRadius: 12, color: saved ? ACCENT2 : ACCENT, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: 2, marginTop: 10 }}>
                {saved ? "✓ GUARDADO" : "GUARDAR CAMBIOS"}
            </button>

            <div style={{ marginTop: 24, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 10, color: "#505070", letterSpacing: 2, marginBottom: 12 }}>CÓMO FUNCIONA</div>
                {["Registra viajes con tarifa, km de recolección y km al destino", "El cronómetro del día mide tu tiempo total trabajado", "Con 30+ viajes el chat IA da análisis más precisos", "Las estadísticas muestran tus mejores días, horas y rutas"].map((tip, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#606080", marginBottom: 8, paddingLeft: 12, borderLeft: `2px solid ${ACCENT}44` }}>{tip}</div>
                ))}
            </div>
        </div>
    );
}
// --- COMPONENTE DE LOGIN (AUTH) ---
function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
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
