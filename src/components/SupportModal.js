import React, { useState } from 'react';

const C = {
  bg: "#07080d",
  card: "#0d0f1a",
  card2: "#111320",
  border: "#1a1d2e",
  bord2: "#242740",
  accent: "#f0a500",
  teal: "#00c9a7",
  danger: "#ff4055",
  muted: "#6b6e8a",
  text: "#dde0f5"
};

const FAQ_ITEMS = [
  {
    q: "¿Cómo funciona el Copiloto de Ofertas?",
    a: "El Copiloto lee automáticamente las ofertas entrantes en DiDi, inDrive y Uber cuando aparecen en tu pantalla. Evalúa al instante el kilometraje, tiempo y tarifa contra tus costos de gasolina y comisiones, y te dice por voz y con colores si conviene aceptarlo."
  },
  {
    q: "¿Por qué pide permiso de superposición?",
    a: "El permiso 'Mostrar sobre otras aplicaciones' le permite a RutaFlow dibujar un marco de color (Verde, Amarillo o Rojo) directamente sobre la oferta en DiDi o inDrive sin interrumpir tus toques."
  },
  {
    q: "¿Se guardan mis viajes si no tengo internet?",
    a: "Sí. Toda la aplicación está construida con tecnología sin conexión (Offline-First). Tus viajes, jornadas y kilometrajes se guardan en la memoria de tu teléfono y se sincronizan con la nube en cuanto recuperas señal."
  },
  {
    q: "¿Cómo se calculan los kilómetros sin pasaje?",
    a: "Puedes medirlos directamente con el GPS integrado de RutaFlow. Cuando inicias tu jornada o registras un movimiento de 'Sin Pasaje', la app mide los kilómetros muertos para ayudarte a deducir el gasto real de combustible."
  }
];

export function SupportModal({ isOpen, onClose, userId, userEmail, onReportSent }) {
  const [tab, setTab] = useState('faq'); // 'faq' | 'ticket'
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);

    try {
      // Send ticket or log report to Supabase or outbox
      const DexieDB = await import('../storage/db');
      await DexieDB.db.outbox.add({
        id: crypto.randomUUID(),
        user_id: userId || 'anonymous',
        action: 'SUPPORT_TICKET',
        payload: {
          user_id: userId,
          email: userEmail,
          subject: subject || 'Reporte de soporte / error',
          message: message.trim(),
          device_info: {
            userAgent: navigator.userAgent,
            screen: `${window.innerWidth}x${window.innerHeight}`,
            time: new Date().toISOString()
          }
        },
        created_at: Date.now()
      });

      setSentSuccess(true);
      if (onReportSent) onReportSent();
      setTimeout(() => {
        setSentSuccess(false);
        setSubject('');
        setMessage('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Error creating ticket:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:10002,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,maxHeight:"88dvh",background:C.card,borderTop:`1px solid ${C.bord2}`,borderRadius:"20px 20px 0 0",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"0 -10px 30px rgba(0,0,0,0.5)"}}>
        
        {/* Header */}
        <div style={{padding:"16px 18px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:18,fontWeight:900,color:C.accent,letterSpacing:1}}>CENTRO DE AYUDA</div>
            <div style={{fontSize:9,color:C.muted,marginTop:2}}>Soporte técnico, dudas y reportes</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",padding:"4px 8px"}}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",padding:"10px 18px",gap:8,background:C.card2}}>
          <button onClick={()=>setTab('faq')} style={{padding:"8px 0",borderRadius:8,background:tab==='faq'?`${C.teal}22`:"transparent",border:`1px solid ${tab==='faq'?C.teal:C.border}`,color:tab==='faq'?C.teal:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            📖 Preguntas Frecuentes
          </button>
          <button onClick={()=>setTab('ticket')} style={{padding:"8px 0",borderRadius:8,background:tab==='ticket'?`${C.accent}22`:"transparent",border:`1px solid ${tab==='ticket'?C.accent:C.border}`,color:tab==='ticket'?C.accent:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            ✉️ Enviar Mensaje / Ticket
          </button>
        </div>

        {/* Content */}
        <div style={{padding:"16px 18px",overflowY:"auto",flex:1}}>
          {tab === 'faq' ? (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {FAQ_ITEMS.map((item, i) => (
                <div key={i} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>{item.q}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.55}}>{item.a}</div>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:11}}>
              {sentSuccess ? (
                <div style={{padding:"30px 10px",textAlign:"center",color:C.teal}}>
                  <div style={{fontSize:32,marginBottom:8}}>✅</div>
                  <div style={{fontSize:14,fontWeight:800}}>¡Mensaje recibido!</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>El equipo de soporte te responderá a la brevedad.</div>
                </div>
              ) : (
                <>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.45}}>
                    ¿Encontraste un problema, un viaje mal calculado o tienes una sugerencia? Escríbenos directamente aquí:
                  </div>
                  <div>
                    <label style={{fontSize:10,color:C.muted,display:"block",marginBottom:4}}>Asunto (opcional)</label>
                    <input 
                      type="text" 
                      placeholder="Ej. Lectura de viaje en inDrive..." 
                      value={subject} 
                      onChange={e=>setSubject(e.target.value)} 
                      style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,outline:"none"}}
                    />
                  </div>
                  <div>
                    <label style={{fontSize:10,color:C.muted,display:"block",marginBottom:4}}>Mensaje o descripción del error</label>
                    <textarea 
                      rows={4} 
                      placeholder="Explica qué pasó..." 
                      value={message} 
                      onChange={e=>setMessage(e.target.value)} 
                      required 
                      style={{width:"100%",background:C.card2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:C.text,fontSize:12,outline:"none",resize:"none"}}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={sending || !message.trim()} 
                    style={{marginTop:6,padding:"12px 0",background:C.accent,border:"none",borderRadius:8,color:"#000",fontSize:12,fontWeight:900,cursor:"pointer",opacity:sending?0.6:1}}
                  >
                    {sending ? "ENVIANDO..." : "ENVIAR REPORTE"}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
