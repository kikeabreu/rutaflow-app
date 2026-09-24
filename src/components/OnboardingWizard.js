import React, { useState } from 'react';

const C = {
  bg: "#07080d",
  card: "#0d0f1a",
  card2: "#111320",
  border: "#1a1d2e",
  bord2: "#242740",
  accent: "#f0a500",
  teal: "#00c9a7",
  muted: "#6b6e8a",
  text: "#dde0f5"
};

const STEPS = [
  {
    title: "¡Bienvenido a RutaFlow!",
    subtitle: "El copiloto inteligente para conductores de plataforma.",
    icon: "🚕",
    description: "Maximiza tus ganancias reales deduciendo comisiones, combustible y kilometrajes muertos automáticamente."
  },
  {
    title: "Copiloto en Tiempo Real",
    subtitle: "Analiza ofertas al instante en DiDi, inDrive y Uber.",
    icon: "🟢",
    description: "Te dirá por voz y resaltará con colores si un viaje es rentable o si te hace perder dinero antes de que lo aceptes."
  },
  {
    title: "Medición GPS y Offline-First",
    subtitle: "Todo guardado sin importar si te quedas sin señal.",
    icon: "📍",
    description: "Mide tus kilómetros con pasaje y tus kilómetros muertos para conocer tu verdadero rendimiento operativo."
  }
];

export function OnboardingWizard({ isOpen, onComplete, onDismissNever }) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:10003,background:"rgba(0,0,0,0.88)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="su" style={{width:"100%",maxWidth:400,background:C.card,border:`1px solid ${C.bord2}`,borderRadius:24,padding:"28px 22px 20px",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",boxShadow:"0 12px 40px rgba(0,0,0,0.6)"}}>
        
        {/* Step indicator */}
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {STEPS.map((_, i) => (
            <div key={i} style={{width:i===step?24:7,height:7,borderRadius:4,background:i===step?C.accent:C.border,transition:"all .2s"}}/>
          ))}
        </div>

        {/* Icon & Title */}
        <div style={{fontSize:48,marginBottom:12}}>{current.icon}</div>
        <div style={{fontSize:20,fontWeight:900,color:C.text,letterSpacing:0.5,marginBottom:6}}>{current.title}</div>
        <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:12}}>{current.subtitle}</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:24,padding:"0 6px"}}>{current.description}</div>

        {/* Actions */}
        <button onClick={next} style={{width:"100%",padding:"13px 0",background:C.teal,border:"none",borderRadius:12,color:"#000",fontSize:13,fontWeight:900,cursor:"pointer",letterSpacing:0.5,marginBottom:10}}>
          {isLast ? "¡EMPEZAR AHORA!" : "CONTINUAR ▶"}
        </button>

        <button onClick={onDismissNever} style={{background:"none",border:"none",color:C.muted,fontSize:10,cursor:"pointer",padding:"6px"}}>
          No volver a mostrar esta guía
        </button>

      </div>
    </div>
  );
}
