import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, CartesianGrid, Legend
} from "recharts";
import {
    Zap, FolderOpen, PieChart as ChartIcon,
    Bot, Settings, Plus, Play, Square,
    ChevronRight, Camera, Trash2,
    AlertCircle, TrendingUp, DollarSign, Wallet, ShieldCheck,
    Fuel, Clock, MapPin, Check, X, Shield, Trophy, Smartphone,
    Mail, Lock, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./supabaseClient";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const STORAGE_KEYS = { TRIPS: "rydecash:trips", DAYS: "rydecash:days", CONFIG: "rydecash:config", ACTIVE_DAY: "rydecash:activeday", ACTIVE_TRIP: "rydecash:activetrip" };
const DEFAULT_CONFIG = {
    gasPricePerLiter: 24.5,
    kmPerLiter: 12,
    targetHourlyRate: 150,
    targetPerKm: 5,
    platformCut: 25,
    unitCost: 0,
    unitPeriod: 'monthly',
    insuranceCost: 0,
    insurancePeriod: 'monthly',
    tireCost: 0,
    tireLifeKm: 50000,
    maintenanceCost: 0,
    maintenanceIntervalKm: 10000,
    mobileDataCost: 0,
    mobileDataPeriod: 'monthly',
    useRentInCalc: false,
    useInsuranceInCalc: false,
    useTiresInCalc: false,
    useMaintenanceInCalc: false,
    useMobileDataInCalc: false
};


// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n, d = 2) => (parseFloat(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMXN = (n) => `$${fmt(n)}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
const now = () => Date.now();
const todayStr = () => new Date().toISOString().split("T")[0];

const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const calcTrip = (trip, cfg) => {
    const totalKm = trip.trackedKm || (parseFloat(trip.pickupKm) || 0) + (parseFloat(trip.destKm) || 0);
    const totalMin = trip.trackedMin || (parseFloat(trip.pickupMin) || 0) + (parseFloat(trip.destMin) || 0);
    const hours = totalMin / 60;

    const gasCost = (totalKm / cfg.kmPerLiter) * cfg.gasPricePerLiter;
    const platformFee = (parseFloat(trip.fare) || 0) * (cfg.platformCut / 100);

    // Amortized costs (Time-based or Distance-based)
    let amortizedCosts = 0;

    // Fixed Time Costs (Assumption: 8 working hours per day)
    const getDaily = (cost, period) => {
        if (period === 'daily') return cost;
        if (period === 'weekly') return cost / 7;
        if (period === 'monthly') return cost / 30;
        if (period === 'annual') return cost / 365;
        return 0;
    };

    if (cfg.useRentInCalc) {
        const dailyRent = getDaily(cfg.unitCost, cfg.unitPeriod);
        amortizedCosts += (dailyRent / 8) * hours;
    }
    if (cfg.useInsuranceInCalc) {
        const dailyIns = getDaily(cfg.insuranceCost, cfg.insurancePeriod);
        amortizedCosts += (dailyIns / 8) * hours;
    }
    if (cfg.useMobileDataInCalc) {
        const dailyData = getDaily(cfg.mobileDataCost, cfg.mobileDataPeriod);
        amortizedCosts += (dailyData / 8) * hours;
    }

    // Usage Based Costs
    if (cfg.useTiresInCalc) {
        const costPerKm = cfg.tireCost / (cfg.tireLifeKm || 1);
        amortizedCosts += costPerKm * totalKm;
    }
    if (cfg.useMaintenanceInCalc) {
        const costPerKm = cfg.maintenanceCost / (cfg.maintenanceIntervalKm || 1);
        amortizedCosts += costPerKm * totalKm;
    }

    const netEarning = (parseFloat(trip.fare) || 0) - platformFee - gasCost - amortizedCosts;
    const netPerHour = hours > 0 ? netEarning / hours : 0;
    const netPerKm = totalKm > 0 ? netEarning / totalKm : 0;

    // Metas: Si cumple con ambas es "Muy Bueno", si cumple una es "Regular", si ninguna es "Bajo"
    const score = (netPerHour >= cfg.targetHourlyRate ? 1 : 0) + (netPerKm >= cfg.targetPerKm ? 1 : 0);

    return { totalKm, totalMin, gasCost, amortizedCosts, platformFee, netEarning, netPerHour, netPerKm, hours, score };
};


// ─── STORAGE ─────────────────────────────────────────────────────────────────
const store = {
    get: (key) => {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : null;
        } catch { return null; }
    },
    set: (key, val) => {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch { }
    }
};

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

export default function App() {
    const [tab, setTab] = useState("home");
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [trips, setTrips] = useState([]);
    const [days, setDays] = useState([]);
    const [activeDay, setActiveDay] = useState(null);
    const [activeTrip, setActiveTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState(null);
    const lastPos = useRef(null);

    // Auth & Load data
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        const loadInitial = async () => {
            const cfg = store.get(STORAGE_KEYS.CONFIG);
            const tr = store.get(STORAGE_KEYS.TRIPS);
            const dy = store.get(STORAGE_KEYS.DAYS);
            const ad = store.get(STORAGE_KEYS.ACTIVE_DAY);
            const at = store.get(STORAGE_KEYS.ACTIVE_TRIP);

            if (cfg) setConfig(cfg);
            if (tr) setTrips(tr);
            if (dy) setDays(dy);
            if (ad) setActiveDay(ad);
            if (at) setActiveTrip(at);

            setTimeout(() => setLoading(false), 1500);
        };

        loadInitial();
        return () => subscription.unsubscribe();
    }, []);

    // Geolocation Tracking
    useEffect(() => {
        if (!activeDay) {
            lastPos.current = null;
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude: lat, longitude: lon } = pos.coords;
                if (lastPos.current) {
                    const d = getDistance(lastPos.current.lat, lastPos.current.lon, lat, lon);
                    if (d > 0.01) { // 10 meters threshold
                        // Update activeDay
                        setActiveDay(prev => {
                            const updated = { ...prev, trackedTotalKm: (prev.trackedTotalKm || 0) + d };
                            store.set(STORAGE_KEYS.ACTIVE_DAY, updated);
                            return updated;
                        });

                        // Update activeTrip if any
                        if (activeTrip) {
                            setActiveTrip(prev => {
                                const updated = { ...prev, trackedKm: (prev.trackedKm || 0) + d };
                                store.set(STORAGE_KEYS.ACTIVE_TRIP, updated);
                                return updated;
                            });
                        }
                    }
                }
                lastPos.current = { lat, lon };
            },
            (err) => console.error("GPS Error:", err),
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [activeDay, !!activeTrip]);

    const syncFromSupabase = async () => {

        try {
            const { data: tr } = await supabase.from('trips').select('*').order('timestamp', { ascending: false });
            const { data: dy } = await supabase.from('days').select('*');
            const { data: pr } = await supabase.from('profiles').select('*').single();

            if (tr) setTrips(tr);
            if (dy) setDays(dy);
            if (pr) setConfig({
                gasPricePerLiter: parseFloat(pr.gas_price_per_liter) || 18,
                kmPerLiter: parseFloat(pr.km_per_liter) || 12,
                targetHourlyRate: parseFloat(pr.target_hourly_rate) || 150,
                targetPerKm: parseFloat(pr.target_per_km) || 5,
                platformCut: parseFloat(pr.platform_cut) || 25,
                unitCost: parseFloat(pr.unit_cost || pr.monthly_rent) || 0,
                unitPeriod: pr.unit_period || 'monthly',
                insuranceCost: parseFloat(pr.insurance_cost) || 0,
                insurancePeriod: pr.insurance_period || 'monthly',
                tireCost: parseFloat(pr.tire_cost) || 0,
                tireLifeKm: parseFloat(pr.tire_life_km) || 50000,
                maintenanceCost: parseFloat(pr.maintenance_cost) || (parseFloat(pr.maintenance_cost_per_km) * 10000) || 0,
                maintenanceIntervalKm: parseFloat(pr.maintenance_interval_km) || 10000,
                useRentInCalc: pr.use_rent_in_calc,
                useInsuranceInCalc: pr.use_insurance_in_calc,
                useTiresInCalc: pr.use_tires_in_calc,
                useMaintenanceInCalc: pr.use_maintenance_in_calc
            });
        } catch (e) {
            console.error("Sync error:", e);
        }
    };


    const saveTrips = async (t) => {
        setTrips(t);
        store.set(STORAGE_KEYS.TRIPS, t);
        if (session) {
            const lastTrip = t[t.length - 1];
            if (lastTrip) {
                await supabase.from('trips').upsert({
                    ...lastTrip,
                    user_id: session.user.id
                });
            }
        }
    };

    const saveDays = async (d) => {
        setDays(d);
        store.set(STORAGE_KEYS.DAYS, d);
        if (session) {
            const lastDay = d[d.length - 1];
            if (lastDay) {
                await supabase.from('days').upsert({
                    ...lastDay,
                    user_id: session.user.id
                });
            }
        }
    };

    const saveConfig = async (c) => {
        setConfig(c);
        store.set(STORAGE_KEYS.CONFIG, c);
        if (session) {
            await supabase.from('profiles').upsert({
                id: session.user.id,
                gas_price_per_liter: c.gasPricePerLiter,
                km_per_liter: c.kmPerLiter,
                target_hourly_rate: c.targetHourlyRate,
                target_per_km: c.targetPerKm,
                platform_cut: c.platformCut,
                unit_cost: c.unitCost,
                unit_period: c.unitPeriod,
                monthly_rent: c.unitCost, // Legacy
                insurance_cost: c.insuranceCost,
                insurance_period: c.insurancePeriod,
                tire_cost: c.tireCost,
                tire_life_km: c.tireLifeKm,
                maintenance_cost: c.maintenanceCost,
                maintenance_interval_km: c.maintenanceIntervalKm,
                use_rent_in_calc: c.useRentInCalc,
                use_insurance_in_calc: c.useInsuranceInCalc,
                use_tires_in_calc: c.useTiresInCalc,
                use_maintenance_in_calc: c.useMaintenanceInCalc,
                updated_at: new Date().toISOString()
            });
        }
    };

    const saveActiveDay = (d) => {
        setActiveDay(d);
        store.set(STORAGE_KEYS.ACTIVE_DAY, d);
    };

    const saveActiveTrip = (t) => {
        setActiveTrip(t);
        store.set(STORAGE_KEYS.ACTIVE_TRIP, t);
    };


    if (loading) return <LoadingScreen />;

    const todayTrips = trips.filter(t => t.date === todayStr());
    const todayNet = todayTrips.reduce((s, t) => s + (calcTrip(t, config).netEarning), 0);

    if (!session) return <AuthScreen />;

    return (
        <div className="container-responsive relative min-h-screen flex flex-col bg-bg">
            <Header session={session} />


            <main className="flex-1 pb-32">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                        {tab === "home" && <HomeTab
                            config={config}
                            trips={trips}
                            days={days}
                            activeDay={activeDay}
                            activeTrip={activeTrip}
                            saveTrips={saveTrips}
                            saveDays={saveDays}
                            saveActiveDay={saveActiveDay}
                            saveActiveTrip={saveActiveTrip}
                        />}
                        {tab === "trips" && <TripsTab config={config} trips={trips} saveTrips={saveTrips} />}
                        {tab === "stats" && <StatsTab config={config} trips={trips} days={days} />}
                        {tab === "logros" && <LogrosTab config={config} trips={trips} days={days} />}
                        {tab === "ai" && <AITab config={config} trips={trips} days={days} />}
                        {tab === "config" && <ConfigTab config={config} saveConfig={saveConfig} />}
                    </motion.div>
                </AnimatePresence>
            </main>

            <Navigation active={tab} onChange={setTab} />
        </div>
    );
}

function LoadingScreen() {
    return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-[1000] font-display">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="mb-8"
            >
                <div className="w-20 h-20 rounded-[32px] bg-accent/10 border border-accent/20 flex items-center justify-center float">
                    <Wallet size={36} className="text-accent" strokeWidth={2.5} />
                </div>
            </motion.div>
            <div className="flex flex-col items-center gap-6">
                <div className="h-1.5 w-40 bg-white/5 overflow-hidden relative rounded-full border border-white/5">
                    <motion.div
                        className="absolute left-0 top-0 h-full bg-accent shadow-[0_0_15px_rgba(34,197,94,0.5)]"
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                    />
                </div>
                <div className="text-center">
                    <h3 className="text-white font-extrabold tracking-tight uppercase text-sm mb-1">Ryde Cash</h3>
                    <p className="text-[10px] font-bold text-accent uppercase tracking-[0.2em] animate-pulse">Optimizando rutas...</p>
                </div>
            </div>
        </div>
    );
}

function Header({ session }) {
    return (
        <header className="px-6 py-10 flex items-center justify-between font-display">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-[24px] overflow-hidden border border-white/10 ring-4 ring-accent-dim shadow-2xl">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${session?.user?.id}`} alt="avatar" className="w-full h-full object-cover" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold text-white tracking-tight">Driver Center</h1>
                    <p className="text-[10px] font-black text-accent uppercase tracking-[0.2em] flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        Sistema Activo
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {session && (
                    <button onClick={() => supabase.auth.signOut()} className="w-12 h-12 rounded-2xl glass border border-white/5 flex items-center justify-center text-text-dim/60 hover:text-danger hover:bg-danger/10 transition-all">
                        <X size={20} strokeWidth={2.5} />
                    </button>
                )}
            </div>
        </header>
    );
}



function TripModal({ config, trips, saveTrips, activeDay, activeTrip, saveActiveTrip, onClose }) {
    const [mode, setMode] = useState("live"); // live | manual | photo
    const [phase, setPhase] = useState(0);
    const [trip, setTrip] = useState({ fare: "", pickupKm: "", pickupMin: "", destKm: "", destMin: "", platform: "uber", notes: "" });
    const fileRef = useRef();

    const handleStartLive = () => {
        if (!trip.fare) return;
        const newTrip = {
            ...trip,
            id: `trip-${now()}`,
            date: todayStr(),
            timestamp: now(),
            dayId: activeDay?.id || null,
            trackedKm: 0,
            trackedMin: 0
        };
        saveActiveTrip(newTrip);
        onClose();
    };

    const handleManualSave = () => {
        if (!trip.fare) return;
        const newTrip = {
            ...trip,
            id: `trip-${now()}`,
            date: todayStr(),
            timestamp: now(),
            dayId: activeDay?.id || null,
            trackedKm: (parseFloat(trip.pickupKm) || 0) + (parseFloat(trip.destKm) || 0),
            trackedMin: (parseFloat(trip.pickupMin) || 0) + (parseFloat(trip.destMin) || 0),
        };
        saveTrips([...trips, newTrip]);
        onClose();
    };

    const calc = useMemo(() => calcTrip(trip, config), [trip, config]);
    const isGood = calc.netPerHour >= config.targetHourlyRate;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xl flex items-end justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="w-full max-w-lg glass-bright rounded-t-[32px] border-t border-white/10 flex flex-col"
                style={{ maxHeight: "88vh" }}
                onClick={e => e.stopPropagation()}
            >
                {/* Handle fijo arriba */}
                <div className="flex-shrink-0 pt-5 pb-2 px-8">
                    <div className="w-10 h-1 rounded-full bg-white/10 mx-auto mb-5" />
                    <div className="flex gap-2 p-1.5 rounded-[20px] glass border border-white/5">
                        {[
                            { id: 'live', icon: Play, label: 'En Vivo' },
                            { id: 'manual', icon: FolderOpen, label: 'Manual' },
                            { id: 'photo', icon: Camera, label: 'IA Photo' }
                        ].map(m => (
                            <button key={m.id} onClick={() => setMode(m.id)}
                                className={`flex-1 py-3 flex items-center justify-center gap-2 rounded-[14px] text-[10px] font-black tracking-widest uppercase transition-all ${mode === m.id ? 'bg-white text-black shadow-xl' : 'text-text-dim/50 hover:text-white'}`}>
                                <m.icon size={11} fill={mode === m.id ? 'currentColor' : 'none'} />
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Contenido con scroll */}
                <div className="flex-1 overflow-y-auto px-8 pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className="space-y-5 py-2">
                        {/* Tarifa */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-text-dim tracking-[0.4em] uppercase pl-1">Tarifa Bruta</label>
                            <input
                                type="number"
                                placeholder="0.00"
                                value={trip.fare}
                                onChange={e => setTrip({ ...trip, fare: e.target.value })}
                                className="w-full bg-white/5 border border-white/5 rounded-2xl px-6 py-5 text-5xl font-black mono text-accent placeholder:text-white/10 outline-none focus:border-accent/30 transition-all text-center"
                            />
                        </div>

                        {/* Campos manuales */}
                        {mode === 'manual' && (
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { label: 'KM recolección', key: 'pickupKm' },
                                    { label: 'MIN recolección', key: 'pickupMin' },
                                    { label: 'KM al destino', key: 'destKm' },
                                    { label: 'MIN al destino', key: 'destMin' },
                                ].map(f => (
                                    <div key={f.key} className="space-y-2">
                                        <label className="text-[8px] font-black text-text-dim uppercase tracking-widest">{f.label}</label>
                                        <input
                                            type="number"
                                            value={trip[f.key]}
                                            onChange={e => setTrip({ ...trip, [f.key]: e.target.value })}
                                            className="premium-input w-full text-xl font-black mono"
                                            placeholder="0"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Plataforma */}
                        <div className="flex gap-2 p-1.5 rounded-[20px] glass border border-white/5">
                            {['uber', 'didi', 'beat', 'otra'].map(p => (
                                <button key={p} onClick={() => setTrip({ ...trip, platform: p })}
                                    className={`flex-1 py-3 rounded-[14px] text-[9px] font-black tracking-widest uppercase transition-all ${trip.platform === p ? 'bg-accent/10 text-accent border border-accent/20' : 'text-text-dim/40'}`}>
                                    {p}
                                </button>
                            ))}
                        </div>

                        {/* Foto IA */}
                        {mode === 'photo' && (
                            <div onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-white/10 rounded-[24px] p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-accent/40 transition-all bg-white/[0.02]">
                                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-text-dim hover:text-accent transition-all">
                                    <Camera size={22} />
                                </div>
                                <div className="text-center">
                                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1">Sube el recibo</p>
                                    <p className="text-[8px] font-bold text-text-dim uppercase tracking-widest">Uber, Didi o Indriver</p>
                                </div>
                                <input ref={fileRef} type="file" className="hidden" accept="image/*" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Botón guardar fijo abajo */}
                <div className="flex-shrink-0 px-8 pt-4 pb-8">
                    <button
                        onClick={mode === 'live' ? handleStartLive : handleManualSave}
                        disabled={mode !== 'photo' && !trip.fare}
                        className="btn-accent w-full flex items-center justify-center gap-3 disabled:opacity-20 disabled:grayscale transition-all"
                        style={{ height: 56, borderRadius: 16, fontSize: 14 }}
                    >
                        {mode === 'live' ? <><Play size={18} fill="currentColor" /> INICIAR VIAJE</> : mode === 'photo' ? 'PROCESAR CON IA' : 'GUARDAR REGISTRO'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}


function HomeTab({ config, trips, days, activeDay, activeTrip, saveTrips, saveDays, saveActiveDay, saveActiveTrip }) {
    const [elapsed, setElapsed] = useState(0);
    const [tripModalOpen, setTripModalOpen] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (activeDay?.running) {
            timerRef.current = setInterval(() => setElapsed(now() - activeDay.startTime), 1000);
        } else {
            clearInterval(timerRef.current);
            setElapsed(0);
        }
        return () => clearInterval(timerRef.current);
    }, [activeDay]);

    const startDay = () => {
        const d = { id: `day-${now()}`, date: todayStr(), startTime: now(), running: true, startKm: 0, trackedTotalKm: 0, trips: [] };
        saveActiveDay(d);
    };

    const endDay = () => {
        if (!activeDay) return;
        const dayTrips = trips.filter(t => t.dayId === activeDay.id);
        const dayStats = dayTrips.reduce((acc, t) => {
            const c = calcTrip(t, config);
            return { net: acc.net + c.netEarning, km: acc.km + c.totalKm };
        }, { net: 0, km: 0 });

        const totalMin = (now() - activeDay.startTime) / 60000;
        const finished = {
            ...activeDay,
            endTime: now(),
            running: false,
            totalNet: dayStats.net,
            totalKm: activeDay.trackedTotalKm || dayStats.km,
            totalMin,
            tripCount: dayTrips.length
        };
        saveDays([...days, finished]);
        saveActiveDay(null);
        saveActiveTrip(null);
    };

    const startTrip = () => {
        setTripModalOpen(true);
    };

    const endTrip = () => {
        if (!activeTrip) return;
        const finishedTrip = {
            ...activeTrip,
            trackedMin: (now() - activeTrip.timestamp) / 60000,
        };
        saveTrips([...trips, finishedTrip]);
        saveActiveTrip(null);
    };

    const todayTrips = trips.filter(t => t.date === todayStr());

    // Detailed Stats for Home
    const homeStats = useMemo(() => {
        return todayTrips.reduce((acc, t) => {
            const c = calcTrip(t, config);
            return {
                net: acc.net + c.netEarning,
                km: acc.km + c.totalKm,
                min: acc.min + c.totalMin,
                gas: acc.gas + c.gasCost,
                fees: acc.fees + c.platformFee,
                count: acc.count + 1,
                gross: acc.gross + (parseFloat(t.fare) || 0)
            };
        }, { net: 0, km: 0, min: 0, gas: 0, fees: 0, count: 0, gross: 0 });
    }, [todayTrips, config]);

    const gasPct = homeStats.gross > 0 ? (homeStats.gas / homeStats.gross) * 100 : 0;
    const feesPct = homeStats.gross > 0 ? (homeStats.fees / homeStats.gross) * 100 : 0;
    const netPct = homeStats.gross > 0 ? (homeStats.net / homeStats.gross) * 100 : 0;

    return (
        <div className="pb-40 animate-in fade-in slide-in-from-bottom-6 duration-700">
            {/* Main Stats Card */}
            <section className="px-6 mb-12">
                <p className="text-[14px] font-extrabold text-text-dim tracking-tight mb-2">Ingresos del Día</p>
                <div className="flex items-baseline gap-2 mb-4">
                    <h2 className="text-[56px] font-extrabold text-white tracking-tighter leading-none heading-premium">
                        {fmtMXN(homeStats.net).split('.')[0]}
                        <span className="text-3xl opacity-20">.{fmtMXN(homeStats.net).split('.')[1]}</span>
                    </h2>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[12px] font-extrabold">
                        <TrendingUp size={14} strokeWidth={3} />
                        <span>PRO</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                    <span className="text-[11px] font-black text-accent uppercase tracking-widest">Actualizado en tiempo real</span>
                </div>
            </section>

            {/* Allocation Bar */}
            <section className="px-6 mb-12">
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <span className="text-[12px] font-black text-text-dim uppercase tracking-widest block mb-1">Distribución</span>
                        <span className="text-lg font-extrabold text-white tracking-tight">Costo vs Ganancia</span>
                    </div>
                    <span className="text-lg font-black text-white mono">{fmtMXN(homeStats.gross)}</span>
                </div>
                <div className="spending-bar w-full h-[18px] mb-6 rounded-full p-1 bg-white/5 border border-white/5">
                    <div className="bg-accent rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(34,197,94,0.3)]" style={{ width: `${netPct}%` }} />
                    <div className="bg-accent-cyan rounded-full mx-1 transition-all duration-1000" style={{ width: `${gasPct}%` }} />
                    <div className="bg-white/10 rounded-full transition-all duration-1000" style={{ width: `${feesPct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-accent shadow-lg shadow-accent/20" />
                        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">Neto</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-accent-cyan" />
                        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">Gas</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-white/10" />
                        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">Fee</span>
                    </div>
                </div>
            </section>

            {/* Info Cards Row */}
            <div className="grid grid-cols-2 gap-4 px-6 mb-12">
                <div className="card-premium h-44 flex flex-col justify-between py-6 group bg-gradient-to-br from-white/[0.03] to-transparent">
                    <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        <MapPin size={22} strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[11px] font-black text-text-dim uppercase tracking-widest mb-1">KM Totales</p>
                        <p className="text-3xl font-extrabold text-white tracking-tighter">{fmt(activeDay?.trackedTotalKm || homeStats.km, 1)}</p>
                    </div>
                </div>
                <div className="card-premium h-44 flex flex-col justify-between py-6 group bg-gradient-to-br from-white/[0.03] to-transparent">
                    <div className="w-12 h-12 rounded-2xl bg-accent2/10 flex items-center justify-center text-accent2 group-hover:scale-110 transition-transform">
                        <Clock size={22} strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[11px] font-black text-text-dim uppercase tracking-widest mb-1">Sesión</p>
                        <p className="text-3xl font-extrabold text-white tracking-tighter">{activeDay ? fmtTime(elapsed).split(':').slice(0, 2).join('h ') + 'm' : `${Math.floor(homeStats.min / 60)}h ${Math.floor(homeStats.min % 60)}m`}</p>
                    </div>
                </div>
            </div>

            {/* Quick Actions / Status */}
            <section className="px-6 mb-12">
                <div className={`card-premium p-1 transition-all duration-700 ${activeDay ? 'bg-accent/5 border-accent/20' : 'bg-white/[0.02]'}`}>
                    <div className="flex items-center justify-between p-7">
                        <div>
                            <h3 className="text-lg font-extrabold text-white tracking-tight mb-0.5">{activeDay ? 'Turno Iniciado' : 'Fuera de Línea'}</h3>
                            <p className="text-[11px] font-bold text-text-dim uppercase tracking-[0.1em]">{activeDay ? 'Analizando métricas en vivo...' : 'Toca para empezar a ganar'}</p>
                        </div>
                        {activeDay ? (
                            <button onClick={endDay} className="w-14 h-14 rounded-2xl bg-danger/10 border border-danger/20 text-danger flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-danger/10">
                                <Square size={22} strokeWidth={3} />
                            </button>
                        ) : (
                            <button onClick={startDay} className="w-14 h-14 rounded-2xl bg-accent text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl shadow-accent/40">
                                <Play size={24} fill="currentColor" />
                            </button>
                        )
                        }
                    </div>
                </div>
            </section>

            {/* Recent Trips List */}
            {todayTrips.length > 0 && (
                <section className="px-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-extrabold tracking-tight text-white mb-0.5">Actividad</h3>
                            <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Tus últimos servicios</p>
                        </div>
                        <button className="text-accent text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-full glass border border-accent/20">Ver todo</button>
                    </div>

                    <div className="space-y-4">
                        {todayTrips.slice().reverse().slice(0, 5).map(t => {
                            const c = calcTrip(t, config);
                            const colorClass = c.score === 2 ? 'text-accent' : c.score === 1 ? 'text-accent2' : 'text-danger';

                            return (
                                <div key={t.id} className="card-premium flex items-center justify-between group p-6 border-white/5 hover:border-white/10">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-white/5 border border-white/5 transition-transform group-active:scale-95 group-hover:bg-white/10`}>
                                            <Wallet size={24} className={colorClass} />
                                        </div>
                                        <div>
                                            <div className="font-extrabold text-lg text-white tracking-tight uppercase">{t.platform}</div>
                                            <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-60">{fmtDate(t.timestamp)} • {Math.round(c.totalMin)}min</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xl font-extrabold tracking-tighter ${colorClass}`}>{fmtMXN(c.netEarning)}</div>
                                        <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-40">NETO</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {activeDay && !activeTrip && (
                        <button onClick={startTrip} className="w-full h-20 rounded-[32px] border-2 border-dashed border-white/10 flex items-center justify-center gap-3 text-white/40 hover:text-white hover:border-accent/40 transition-all bg-white/[0.01] hover:bg-accent/[0.02]">
                            <Plus size={22} />
                            <span className="text-[12px] font-black tracking-[0.3em] uppercase">Registrar Nuevo Viaje</span>
                        </button>
                    )}
                </section>
            )}

            {activeDay && activeTrip && (
                <div className="fixed bottom-36 left-6 right-6 z-[80] glass-bright border border-accent/30 rounded-[32px] p-6 shadow-2xl animate-float">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <span className="text-[10px] font-black text-accent uppercase tracking-widest">Escaneando Ruta...</span>
                        </div>
                        <span className="text-[12px] font-black text-white mono">{fmtTime(now() - activeTrip.timestamp).split(':').slice(1).join(':')}m</span>
                    </div>
                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <p className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-1">Tarifa Actual</p>
                            <p className="text-3xl font-black text-white italic mono">{fmtMXN(activeTrip.fare)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-1">Km Track</p>
                            <p className="text-2xl font-black text-white mono">{fmt(activeTrip.trackedKm || 0, 2)}</p>
                        </div>
                    </div>
                    <button onClick={endTrip} className="w-full py-4 rounded-2xl bg-white text-black font-black text-xs tracking-widest uppercase">
                        FINALIZAR VIAJE
                    </button>
                </div>
            )}

            {tripModalOpen && <TripModal config={config} trips={trips} saveTrips={saveTrips} activeDay={activeDay} activeTrip={activeTrip} saveActiveTrip={saveActiveTrip} onClose={() => setTripModalOpen(false)} />}
        </div>
    );
}

function StatsMini({ label, value, color, icon: Icon }) {
    return (
        <div className="glass p-5 rounded-[28px] border border-white/5 flex flex-col items-center text-center group hover:bg-white/[0.03] transition-all">
            <div className={`w-10 h-10 rounded-2xl mb-3 flex items-center justify-center`} style={{ backgroundColor: `${color}15`, color }}>
                <Icon size={18} />
            </div>
            <p className="text-[8px] font-black text-text-dim uppercase tracking-[0.2em] mb-1">{label}</p>
            <p className="text-sm font-black mono text-white truncate w-full">{value}</p>
        </div>
    );
}

function TripsTab({ config, trips, saveTrips }) {
    const [filter, setFilter] = useState("all");
    const [modalOpen, setModalOpen] = useState(false);

    const filtered = trips.filter(t => {
        if (filter === "today") return t.date === todayStr();
        if (filter === "week") {
            const d = new Date(); d.setDate(d.getDate() - 7);
            return new Date(t.timestamp) >= d;
        }
        return true;
    }).sort((a, b) => b.timestamp - a.timestamp);

    const deleteTrip = (id) => {
        if (confirm("¿Eliminar registro?")) {
            saveTrips(trips.filter(t => t.id !== id));
        }
    };

    return (
        <div className="py-8 space-y-8 pb-32">
            <header className="px-2">
                <h2 className="text-3xl font-black italic tracking-tighter">HISTORIAL DE<br /><span className="accent-text NOT-italic">VIAJES</span></h2>
            </header>

            <div className="glass p-1.5 rounded-2xl flex gap-1 border border-white/5">
                {["all", "week", "today"].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${filter === f ? 'bg-white text-black shadow-xl' : 'text-text-dim hover:text-white'}`}>
                        {f === 'all' ? 'Ver Todos' : f === 'week' ? 'Semana' : 'Hoy'}
                    </button>
                ))}
            </div>

            <button onClick={() => setModalOpen(true)} className="w-full card-item border-dashed flex items-center justify-center gap-3 text-text-dim hover:text-accent group">
                <Plus size={18} strokeWidth={3} className="group-hover:scale-125 transition-all" />
                <span className="text-[10px] font-black tracking-[0.2em] uppercase">Registrar Manual</span>
            </button>

            <div className="space-y-4 px-2">
                {filtered.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center opacity-20">
                        <FolderOpen size={48} className="mb-4" />
                        <p className="text-[12px] font-extrabold tracking-[0.4em] uppercase">Sin registros</p>
                    </div>
                ) : (
                    filtered.map(t => {
                        const c = calcTrip(t, config);
                        const label = c.score === 2 ? 'Rendimiento Alto' : c.score === 1 ? 'Neutral' : 'Bajo Impacto';
                        const colorClass = c.score === 2 ? 'text-accent' : c.score === 1 ? 'text-accent2' : 'text-danger';
                        const bgColorClass = c.score === 2 ? 'bg-accent/20' : c.score === 1 ? 'bg-accent2/20' : 'bg-danger/20';

                        return (
                            <div key={t.id} className="card-premium group relative border-white/5 hover:border-accent/30 transition-all">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-white/5 border border-white/5 group-hover:bg-white/10 transition-colors`}>
                                            <Wallet size={24} className={colorClass} />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black text-text-dim tracking-widest uppercase">{fmtDate(t.timestamp)} • {t.platform}</span>
                                            <h4 className="text-2xl font-extrabold text-white tracking-tight">{fmtMXN(t.fare)}</h4>
                                        </div>
                                    </div>
                                    <button onClick={() => deleteTrip(t.id)} className="w-10 h-10 flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-all">
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-6 py-4 border-t border-white/5">
                                    <div>
                                        <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Recorrido</p>
                                        <p className="text-xl font-extrabold text-white tracking-tight">{fmt(c.totalKm, 1)} <span className="text-xs text-text-muted">KM</span></p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">Neto Real</p>
                                        <p className={`text-xl font-extrabold tracking-tight ${colorClass}`}>{fmtMXN(c.netEarning)}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5">
                                            <Fuel size={12} className="text-danger" />
                                            <span className="text-[10px] font-black text-white">{fmtMXN(c.gasCost)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5">
                                            <Clock size={12} className="text-accent" />
                                            <span className="text-[10px] font-black text-white">{Math.round(c.totalMin)}m</span>
                                        </div>
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase ${bgColorClass} ${colorClass}`}>
                                        {label}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
            {modalOpen && <TripModal config={config} trips={trips} saveTrips={saveTrips} onClose={() => setModalOpen(false)} />}
        </div>
    );
}


function StatsTab({ config, trips, days }) {
    const [range, setRange] = useState(30);

    const cutoff = Date.now() - range * 24 * 3600 * 1000;
    const filtered = trips.filter(t => t.timestamp >= cutoff);

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

    const totals = filtered.reduce((acc, t) => {
        const c = calcTrip(t, config);
        return {
            net: acc.net + c.netEarning,
            km: acc.km + c.totalKm,
            gas: acc.gas + c.gasCost,
            amortized: acc.amortized + c.amortizedCosts
        };
    }, { net: 0, km: 0, gas: 0, amortized: 0 });

    const totalNet = totals.net;
    const totalKm = totals.km;
    const totalGas = totals.gas;

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="card-premium !bg-black border-accent/20 p-5 shadow-2xl backdrop-blur-3xl">
                <div className="text-[10px] font-black text-accent uppercase tracking-widest mb-4 pb-3 border-b border-white/5">{label}</div>
                <div className="space-y-3">
                    {payload.map((p, i) => (
                        <div key={i} className="flex items-center justify-between gap-8">
                            <span className="text-[10px] font-black text-text-dim uppercase tracking-tighter">{p.name}</span>
                            <span className="text-sm font-extrabold" style={{ color: p.color }}>{p.name.includes("km") ? `${fmt(p.value, 1)}` : fmtMXN(p.value)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="py-8 space-y-10 pb-32 px-1">
            <header className="px-4">
                <h2 className="text-[34px] font-extrabold text-white tracking-tighter leading-[1.1]">Rendimiento<br /><span className="text-accent">Analítico</span></h2>
                <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest mt-2">Métricas avanzadas de tu operación</p>
            </header>

            <div className="px-4">
                <div className="bg-white/5 p-1.5 rounded-[20px] flex gap-1 border border-white/5">
                    {[7, 14, 30, 90].map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all ${range === r ? 'bg-accent text-black font-extrabold' : 'text-text-dim hover:text-white'}`}>
                            {r} Días
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 px-4">
                <div className="card-premium h-44 flex flex-col justify-between py-6 group bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden">
                    <TrendingUp className="absolute -bottom-6 -right-6 w-32 h-32 text-accent opacity-[0.03]" />
                    <span className="text-[11px] font-black text-accent tracking-widest uppercase">Neto Total</span>
                    <div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tighter leading-none mb-2">{fmtMXN(totalNet)}</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                            <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Post-Gastos</p>
                        </div>
                    </div>
                </div>
                <div className="card-premium h-44 flex flex-col justify-between py-6 group bg-gradient-to-br from-white/[0.03] to-transparent relative overflow-hidden">
                    <Fuel className="absolute -bottom-6 -right-6 w-32 h-32 text-danger opacity-[0.03]" />
                    <span className="text-[11px] font-black text-danger tracking-widest uppercase">Gasolina</span>
                    <div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tighter leading-none mb-2">{fmtMXN(totalGas)}</h2>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-danger" />
                            <p className="text-[10px] font-bold text-text-dim uppercase tracking-widest">Consumo</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4">
                <div className="card-premium p-8 border-white/5">
                    <div className="flex items-center justify-between mb-10">
                        <h4 className="text-[11px] font-black tracking-widest text-text-muted uppercase">Tendencia de Ingresos</h4>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5">
                            <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                            <span className="text-[10px] font-black text-white uppercase tracking-widest">Métricas en vivo</span>
                        </div>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -40, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="12 12" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis dataKey="label" hide />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: 'rgba(255,255,255,0.2)' }} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                                <Bar dataKey="net" name="Ganancia" radius={[4, 4, 4, 4]} barSize={24}>
                                    {chartData.map((e, i) => (
                                        <Cell key={i} fill={e.net >= 0 ? 'var(--accent)' : 'var(--danger)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-10 grid grid-cols-3 gap-4 pt-10 border-t border-white/5">
                        <div className="text-center">
                            <span className="text-[9px] font-black text-text-muted uppercase block tracking-widest mb-2">Km Total</span>
                            <span className="text-base font-extrabold text-white">{fmt(totalKm, 0)}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-[9px] font-black text-text-muted uppercase block tracking-widest mb-2">$/Viaje</span>
                            <span className="text-base font-extrabold text-accent">{fmtMXN(totalNet / (filtered.length || 1))}</span>
                        </div>
                        <div className="text-center">
                            <span className="text-[9px] font-black text-text-muted uppercase block tracking-widest mb-2">$/KM</span>
                            <span className="text-base font-extrabold text-accent2">{fmt(totalNet / (totalKm || 1), 2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function AITab({ config, trips, days }) {
    const [messages, setMessages] = useState([{
        role: "assistant",
        content: "¡Qué onda! Soy tu analista personal. Mis datos dicen que tu rendimiento actual es estable, pero hay un margen que podemos mejorar optimizando tus zonas de recolección.\n\n¿Quieres saber en qué horarios estás perdiendo más dinero?"
    }]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef();

    useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = { role: "user", content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);

        setTimeout(() => {
            const aiMsg = { role: "assistant", content: "Analizando tus últimos viajes... He notado que en Uber estás aceptando viajes de menos de $45 MXN que te toman más de 15 minutos. Si reducimos estos, tu ganancia por hora subirá un 12%." };
            setMessages(prev => [...prev, aiMsg]);
            setIsTyping(false);
        }, 1500);
    };

    return (
        <div className="flex flex-col h-[75vh] font-display">
            <header className="px-4 mb-8">
                <h2 className="text-[34px] font-extrabold text-white tracking-tighter leading-[1.1]">Asistente<br /><span className="text-accent">Inteligente</span></h2>
            </header>

            <div className="flex-1 overflow-y-auto space-y-6 px-4 pb-10 scrollbar-hide">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] p-6 ${m.role === 'user'
                            ? 'bg-accent text-black rounded-3xl rounded-tr-none font-bold shadow-xl shadow-accent/10'
                            : 'card-premium border-white/5 text-white/90 rounded-3xl rounded-tl-none'
                            }`}>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                            <span className={`text-[9px] mt-2 block opacity-40 font-black uppercase tracking-widest ${m.role === 'user' ? 'text-black' : 'text-text-dim'}`}>
                                {m.role === 'user' ? 'Tú' : 'AI PRO'} • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start animate-pulse">
                        <div className="card-premium border-accent/20 px-6 py-4 rounded-full flex gap-1.5 items-center">
                            <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                            <div className="w-1.5 h-1.5 bg-accent/60 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-accent/30 rounded-full" />
                        </div>
                    </div>
                )}
                <div ref={scrollRef} />
            </div>

            <div className="px-4 pt-4 pb-12">
                <div className="card-premium p-2 flex gap-4 items-center bg-white/[0.03] border-white/10 shadow-2xl">
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleSend()}
                        placeholder="Pregunta sobre tu rendimiento..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-text-muted px-4 font-bold"
                    />
                    <button
                        onClick={handleSend}
                        className="w-12 h-12 rounded-2xl bg-accent text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg shadow-accent/20"
                    >
                        <Zap size={20} fill="currentColor" strokeWidth={0} />
                    </button>
                </div>
            </div>
        </div>
    );
}


function ConfigTab({ config, saveConfig }) {
    const [local, setLocal] = useState(config);

    useEffect(() => {
        setLocal(config);
    }, [config]);

    const handleSave = () => {
        saveConfig(local);
        alert("¡Motor financiero optimizado y guardado!");
    };

    const ConfigItem = ({ label, icon: Icon, value, onChange, unit, step = "0.1", subtitle }) => (
        <div className="card-premium flex flex-col justify-between py-6">
            <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-2xl bg-accent-dim flex items-center justify-center text-accent">
                    <Icon size={18} />
                </div>
                <span className="text-[10px] font-black text-white/20 mono">{unit}</span>
            </div>
            <div>
                <input
                    type="number"
                    step={step}
                    value={value}
                    onChange={e => onChange(parseFloat(e.target.value) || 0)}
                    className="bg-transparent text-3xl font-black text-white mono italic w-full focus:text-accent transition-colors"
                    placeholder="0.00"
                />
                <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mt-1">{label}</p>
            </div>
        </div>
    );

    return (
        <div className="py-8 space-y-12 pb-48 font-display px-1">
            <header className="px-4">
                <h2 className="text-[34px] font-extrabold text-white tracking-tighter leading-[1.1]">Motor<br /><span className="text-accent">Financiero</span></h2>
                <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest mt-2">Personaliza tus metas y costos</p>
            </header>

            <section className="px-4 space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Configuración Base</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <ConfigItem label="Gasolina" icon={Fuel} value={local.gasPricePerLiter} onChange={v => setLocal({ ...local, gasPricePerLiter: v })} unit="MXN/L" />
                    <ConfigItem label="Rendimiento" icon={TrendingUp} value={local.kmPerLiter} onChange={v => setLocal({ ...local, kmPerLiter: v })} unit="KM/L" />
                    <ConfigItem label="Meta / Hora" icon={Clock} value={local.targetHourlyRate} onChange={v => setLocal({ ...local, targetHourlyRate: v })} unit="MXN/HR" />
                    <ConfigItem label="Meta / KM" icon={MapPin} value={local.targetPerKm} onChange={v => setLocal({ ...local, targetPerKm: v })} unit="MXN/KM" />
                </div>
            </section>

            <section className="space-y-6 px-1">
                <div className="flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent2" />
                        <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Gastos Pro</h3>
                    </div>
                </div>

                <div className="space-y-4 px-2">
                    {/* RENTA / PAGO AUTO */}
                    <div className={`card-premium transition-all duration-500 ${local.useRentInCalc ? 'border-accent/40 bg-accent/5 shadow-2xl shadow-accent/10' : 'opacity-40 grayscale border-white/5'}`}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${local.useRentInCalc ? 'bg-accent text-black' : 'bg-white/5 text-text-dim'}`}>
                                    <ShieldCheck size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <span className="text-[13px] font-extrabold text-white tracking-tight block">Pago de Unidad</span>
                                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Gasto periódico</span>
                                </div>
                            </div>
                            <button onClick={() => setLocal({ ...local, useRentInCalc: !local.useRentInCalc })} className={`w-12 h-6 rounded-full relative transition-all ${local.useRentInCalc ? 'bg-accent' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${local.useRentInCalc ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        {local.useRentInCalc && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Cantidad (MXN)</label>
                                    <input type="number" value={local.unitCost} onChange={e => setLocal({ ...local, unitCost: parseFloat(e.target.value) || 0 })} className="premium-input w-full text-2xl font-extrabold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Frecuencia</label>
                                    <select value={local.unitPeriod} onChange={e => setLocal({ ...local, unitPeriod: e.target.value })} className="premium-input w-full text-[10px] font-black uppercase appearance-none cursor-pointer">
                                        <option value="daily">Diario</option>
                                        <option value="weekly">Semanal</option>
                                        <option value="monthly">Mensual</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SEGURO */}
                    <div className={`card-premium transition-all duration-500 ${local.useInsuranceInCalc ? 'border-accent/40 bg-accent/5' : 'opacity-40 grayscale border-white/5'}`}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${local.useInsuranceInCalc ? 'bg-accent text-black' : 'bg-white/5 text-text-dim'}`}>
                                    <Shield size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <span className="text-[13px] font-extrabold text-white tracking-tight block">Seguro Auto</span>
                                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Protección Activa</span>
                                </div>
                            </div>
                            <button onClick={() => setLocal({ ...local, useInsuranceInCalc: !local.useInsuranceInCalc })} className={`w-12 h-6 rounded-full relative transition-all ${local.useInsuranceInCalc ? 'bg-accent' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${local.useInsuranceInCalc ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        {local.useInsuranceInCalc && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Costo (MXN)</label>
                                    <input type="number" value={local.insuranceCost} onChange={e => setLocal({ ...local, insuranceCost: parseFloat(e.target.value) || 0 })} className="premium-input w-full text-2xl font-extrabold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Frecuencia</label>
                                    <select value={local.insurancePeriod} onChange={e => setLocal({ ...local, insurancePeriod: e.target.value })} className="premium-input w-full text-[10px] font-black uppercase appearance-none cursor-pointer">
                                        <option value="monthly">Mensual</option>
                                        <option value="annual">Anual</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* LLANTAS / MANTENIMIENTO */}
                    <div className={`card-premium transition-all duration-500 ${local.useTiresInCalc ? 'border-accent/40 bg-accent/5' : 'opacity-40 grayscale border-white/5'}`}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${local.useTiresInCalc ? 'bg-accent text-black' : 'bg-white/5 text-text-dim'}`}>
                                    <TrendingUp size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <span className="text-[13px] font-extrabold text-white tracking-tight block">Insumos (Llantas)</span>
                                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Costo por KM</span>
                                </div>
                            </div>
                            <button onClick={() => setLocal({ ...local, useTiresInCalc: !local.useTiresInCalc })} className={`w-12 h-6 rounded-full relative transition-all ${local.useTiresInCalc ? 'bg-accent' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${local.useTiresInCalc ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        {local.useTiresInCalc && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Costo Juego</label>
                                    <input type="number" value={local.tireCost} onChange={e => setLocal({ ...local, tireCost: parseFloat(e.target.value) || 0 })} className="premium-input w-full text-2xl font-extrabold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Vida Estimada (KM)</label>
                                    <input type="number" value={local.tireLifeKm} onChange={e => setLocal({ ...local, tireLifeKm: parseFloat(e.target.value) || 0 })} className="premium-input w-full text-2xl font-extrabold" />
                                </div>
                            </div>
                        )}
                    </div>
                    {/* DATOS MÓVILES */}
                    <div className={`card-premium transition-all duration-500 ${local.useMobileDataInCalc ? 'border-accent/40 bg-accent/5 shadow-2xl shadow-accent/10' : 'opacity-40 grayscale border-white/5'}`}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${local.useMobileDataInCalc ? 'bg-accent text-black' : 'bg-white/5 text-text-dim'}`}>
                                    <Smartphone size={24} strokeWidth={2.5} />
                                </div>
                                <div>
                                    <span className="text-[13px] font-extrabold text-white tracking-tight block">Plan de Datos</span>
                                    <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Internet / Celular</span>
                                </div>
                            </div>
                            <button onClick={() => setLocal({ ...local, useMobileDataInCalc: !local.useMobileDataInCalc })} className={`w-12 h-6 rounded-full relative transition-all ${local.useMobileDataInCalc ? 'bg-accent' : 'bg-white/10'}`}>
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all ${local.useMobileDataInCalc ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        {local.useMobileDataInCalc && (
                            <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Costo (MXN)</label>
                                    <input type="number" value={local.mobileDataCost} onChange={e => setLocal({ ...local, mobileDataCost: parseFloat(e.target.value) || 0 })} className="premium-input w-full text-2xl font-extrabold" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-text-dim uppercase tracking-widest pl-2">Frecuencia</label>
                                    <select value={local.mobileDataPeriod} onChange={e => setLocal({ ...local, mobileDataPeriod: e.target.value })} className="premium-input w-full text-[10px] font-black uppercase appearance-none cursor-pointer">
                                        <option value="monthly">Mensual</option>
                                        <option value="weekly">Semanal</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <div className="px-4 pb-12">
                <button onClick={handleSave} className="w-full h-16 rounded-full bg-accent text-black font-extrabold text-lg tracking-tight shadow-xl shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-3">
                    <Check size={24} strokeWidth={3} />
                    Guardar Configuración
                </button>
            </div>
        </div>
    );
}



function LogrosTab({ config, trips }) {
    const monthFiltered = trips.filter(t => {
        const d = new Date(t.timestamp);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const monthlyGoal = 25000; // Meta mensual estática por ahora
    const monthlyNet = monthFiltered.reduce((s, t) => s + (calcTrip(t, config).netEarning), 0);
    const progress = Math.min((monthlyNet / monthlyGoal) * 100, 100);

    const badges = [
        { id: 1, label: "Ahorrador", icon: Fuel, color: "text-accent", desc: "Eficiencia > 14km/l", active: config.kmPerLiter > 14 },
        { id: 2, label: "Rey de Propinas", icon: DollarSign, color: "text-accent2", desc: "Más de $500 en extras", active: false },
        { id: 3, label: "KM Inteligente", icon: MapPin, color: "text-accent", desc: "Meta meta/km superada", active: true },
        { id: 4, label: "Nocturno", icon: Zap, color: "text-accent2", desc: "50 viajes de noche", active: false },
    ];

    return (
        <div className="py-8 space-y-10 pb-32 px-1 font-display">
            <header className="px-4">
                <h2 className="text-[34px] font-extrabold text-white tracking-tighter leading-[1.1]">Logros y<br /><span className="text-accent2">Metas</span></h2>
                <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest mt-2">Gamificación de rentabilidad</p>
            </header>

            {/* Circular Goal Display */}
            <div className="px-4">
                <div className="card-premium flex flex-col items-center py-12 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-accent2/5 to-transparent pointer-events-none" />
                    <div className="relative w-48 h-48 mb-8">
                        <svg className="w-full h-full -rotate-90">
                            <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/[0.03]" />
                            <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray={552} strokeDashoffset={552 - (552 * progress) / 100} className="text-accent2 transition-all duration-1000 ease-out" strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-black text-white italic">{Math.round(progress)}%</span>
                            <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">de la Meta</span>
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-extrabold text-white mb-1">{fmtMXN(monthlyNet)}</h3>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Meta Mensual: {fmtMXN(monthlyGoal)}</p>
                    </div>
                </div>
            </div>

            {/* Badges Grid */}
            <div className="px-4 space-y-6">
                <h3 className="text-[11px] font-black text-text-dim uppercase tracking-[0.3em] ml-2">Insignias de Poder</h3>
                <div className="grid grid-cols-2 gap-4">
                    {badges.map(b => {
                        const Icon = b.icon;
                        return (
                            <div key={b.id} className={`card-premium p-6 flex flex-col items-center text-center transition-all ${b.active ? 'opacity-100 border-accent2/40' : 'opacity-30 grayscale'}`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${b.active ? 'bg-accent2 text-black' : 'bg-white/5 text-text-muted'}`}>
                                    <Icon size={24} strokeWidth={2.5} />
                                </div>
                                <span className="text-[12px] font-extrabold text-white block mb-1">{b.label}</span>
                                <span className="text-[8px] font-bold text-text-dim uppercase tracking-tighter leading-tight">{b.desc}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Driver Level */}
            <div className="px-4">
                <div className="card-premium p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent2 text-black flex items-center justify-center">
                                <Trophy size={20} weight="bold" />
                            </div>
                            <div>
                                <span className="text-[12px] font-extrabold text-white block">Rango Oro</span>
                                <span className="text-[9px] font-bold text-accent2 uppercase tracking-widest">Siguiente: Diamante</span>
                            </div>
                        </div>
                        <span className="text-[10px] font-black text-white/20 uppercase">XP: 2,450 / 5,000</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: "49%" }}
                            className="h-full bg-gradient-to-r from-accent2 to-accent shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function Navigation({ active, onChange }) {
    const items = [
        { id: "home", icon: Zap, label: "Hoy" },
        { id: "trips", icon: FolderOpen, label: "Viajes" },
        { id: "stats", icon: ChartIcon, label: "Stats" },
        { id: "logros", icon: Trophy, label: "Logros" },
        { id: "ai", icon: Bot, label: "IA Pro" },
        { id: "config", icon: Settings, label: "Motor" },
    ];

    return (
        <nav className="fixed bottom-10 left-1/2 -translate-x-1/2 px-4 py-2 z-[100] max-w-sm pointer-events-none w-full flex justify-center">
            <div className="glass bg-black/80 backdrop-blur-3xl rounded-[32px] flex items-center gap-1 p-2 pointer-events-auto shadow-2xl shadow-black/80 border border-white/5">
                {items.map(item => {
                    const Icon = item.icon;
                    const isSelected = active === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onChange(item.id)}
                            className="relative flex flex-col items-center justify-center h-14 w-16 transition-all active:scale-90"
                        >
                            {isSelected && (
                                <motion.div
                                    layoutId="nav-glow"
                                    className="absolute inset-0 bg-accent/10 rounded-2xl border border-accent/20"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <Icon size={22} className={`relative z-10 transition-colors duration-500 ${isSelected ? 'text-accent' : 'text-text-muted'}`} strokeWidth={isSelected ? 3 : 2} />
                            <span className={`relative z-10 text-[9px] font-bold uppercase mt-1 tracking-widest transition-colors ${isSelected ? 'text-white' : 'text-text-muted opacity-40'}`}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}


function AuthScreen() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        setError("");
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) setError("Credenciales incorrectas");
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-black flex flex-col z-[500] overflow-x-hidden font-display bg-pattern selection:bg-accent/30">
            {/* Top App Bar */}
            <div className="flex items-center p-4 justify-between sticky top-0 z-10 w-full">
                <div className="text-slate-100 flex size-12 shrink-0 items-center justify-start cursor-pointer transition-colors hover:text-accent">
                    <X size={24} strokeWidth={2} />
                </div>
                <div className="flex-1 text-center">
                    <span className="text-[10px] font-black tracking-[0.3em] uppercase text-accent/80">Premium Fintech</span>
                </div>
                <div className="size-12"></div>
            </div>

            <main className="flex flex-col flex-1 px-6 pb-12 max-w-[480px] mx-auto w-full justify-center relative z-10">
                {/* Logo Section */}
                <div className="mb-12 text-center">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center justify-center p-6 rounded-3xl bg-accent/10 mb-8 border border-accent/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]"
                    >
                        <Wallet className="text-accent" size={42} strokeWidth={2.5} />
                    </motion.div>
                    <h1 className="text-white tracking-tight text-[42px] font-extrabold leading-tight mb-3 heading-premium">
                        Ryde Cash
                    </h1>
                    <p className="text-text-dim text-lg font-medium leading-relaxed max-w-[280px] mx-auto opacity-80">
                        Controla tus ganancias en segundos
                    </p>
                </div>

                {/* Login Form */}
                <div className="space-y-6">
                    <div className="flex flex-col gap-2.5">
                        <label className="text-text-dim text-[11px] font-black uppercase tracking-[0.15em] ml-1">Correo electrónico</label>
                        <div className="glass-panel flex items-center rounded-[20px] overflow-hidden px-5 group focus-within:ring-2 focus-within:ring-accent/40 transition-all duration-500 bg-white/[0.03]">
                            <Mail className="text-accent/60 mr-4 group-focus-within:text-accent transition-colors" size={20} />
                            <input
                                className="flex-1 bg-transparent border-none text-white h-16 placeholder:text-text-muted focus:ring-0 text-base font-bold"
                                placeholder="ejemplo@rydecash.com"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <label className="text-text-dim text-[11px] font-black uppercase tracking-[0.15em] ml-1">Contraseña</label>
                        <div className="glass-panel flex items-center rounded-[20px] overflow-hidden px-5 group focus-within:ring-2 focus-within:ring-accent/40 transition-all duration-500 bg-white/[0.03]">
                            <Lock className="text-accent/60 mr-4 group-focus-within:text-accent transition-colors" size={20} />
                            <input
                                className="flex-1 bg-transparent border-none text-white h-16 placeholder:text-text-muted focus:ring-0 text-base font-bold"
                                placeholder="••••••••"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                            <button
                                onClick={() => setShowPassword(!showPassword)}
                                className="text-text-muted hover:text-accent transition-colors p-2"
                            >
                                <Eye size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {error && (
                        <motion.p
                            initial={{ y: -10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-center text-[10px] font-black text-danger uppercase tracking-widest bg-danger/10 py-3 rounded-xl border border-danger/20"
                        >
                            {error}
                        </motion.p>
                    )}

                    {/* Forgot Password */}
                    <div className="flex justify-end pt-1">
                        <button className="text-accent text-[11px] font-black uppercase tracking-widest hover:text-white transition-colors">
                            ¿Olvidaste tu contraseña?
                        </button>
                    </div>

                    {/* Action Button */}
                    <div className="pt-8">
                        <button
                            onClick={handleLogin}
                            disabled={loading}
                            className="w-full bg-accent text-black font-black text-lg h-16 rounded-[24px] shadow-[0_10px_30px_rgba(34,197,94,0.3)] hover:shadow-[0_15px_40px_rgba(34,197,94,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin" />
                            ) : (
                                "Comenzar"
                            )}
                        </button>
                    </div>
                </div>

                {/* Footer Section */}
                <div className="mt-16 text-center">
                    <p className="text-text-muted text-[12px] font-bold">
                        ¿No tienes una cuenta?
                        <button className="text-accent font-black ml-2 hover:underline decoration-2 underline-offset-4">Regístrate</button>
                    </p>

                    <div className="mt-12 flex items-center justify-center gap-6">
                        <div className="h-[1px] flex-1 bg-white/5"></div>
                        <span className="text-text-muted text-[9px] uppercase font-black tracking-[0.3em] opacity-40">O accede con</span>
                        <div className="h-[1px] flex-1 bg-white/5"></div>
                    </div>

                    <div className="mt-10 flex justify-center gap-6">
                        <button className="size-16 rounded-[24px] glass-panel flex items-center justify-center border-white/5 hover:border-accent/40 hover:bg-accent/5 transition-all active:scale-90">
                            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.05 20.28c-.96.95-2.14 1.72-3.55 1.72-1.35 0-2.45-.63-3.5-1.72-1.05 1.09-2.15 1.72-3.5 1.72-1.41 0-2.59-.77-3.55-1.72-3.35-3.32-3.35-8.7 0-12.03.96-.95 2.14-1.72 3.55-1.72 1.35 0 2.45.63 3.5 1.72 1.05-1.09 2.15-1.72 3.5-1.72 1.41 0 2.59.77 3.55 1.72 3.35 3.33 3.35 8.71 0 12.03zM12 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path>
                            </svg>
                        </button>
                        <button className="size-16 rounded-[24px] glass-panel flex items-center justify-center border-white/5 hover:border-accent/40 hover:bg-accent/5 transition-all active:scale-90">
                            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </main>

            {/* Decorative elements */}
            <div className="absolute -bottom-20 -left-20 size-96 bg-accent/5 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute top-1/4 -right-20 size-[500px] bg-accent/10 rounded-full blur-[150px] pointer-events-none"></div>
        </div>
    );
}
