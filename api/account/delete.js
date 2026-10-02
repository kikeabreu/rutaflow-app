const{allowAppOrigin,authenticate,findCustomerForUser,sendError,stripeRequest}=require("../billing/_shared.cjs");

const supabaseUrl=()=>process.env.SUPABASE_URL||process.env.REACT_APP_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";

// Tablas con datos del usuario. Se purgan explícitamente porque las tablas base
// (trips, days, profiles…) viven fuera de las migraciones y pueden no tener cascade.
// trial_devices y trial_phones se conservan a propósito (antiabuso de la prueba).
const USER_TABLES=[
  ["trips","user_id"],["days","user_id"],["active_days","user_id"],["shift_closures","user_id"],
  ["bonuses","user_id"],["tips","user_id"],["operational_events","user_id"],
  ["location_checkpoints","user_id"],["location_samples","user_id"],["location_places","user_id"],
  ["ai_conversations","user_id"],["vehicle_energy_profiles","user_id"],["offline_mutations","user_id"],
  ["support_tickets","user_id"],["support_suggestions","user_id"],["update_installations","user_id"],
  ["device_switches","user_id"],["privacy_consents","user_id"],["profiles","id"],
];

async function purgeTable(table,column,userId){
  const response=await fetch(`${supabaseUrl()}/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}`,{
    method:"DELETE",
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,Prefer:"return=minimal"},
  });
  // 404 = la tabla no existe en este entorno; no es un error.
  if(!response.ok&&response.status!==404)throw Object.assign(new Error("No se pudo eliminar tu información. Escríbenos a privacidad@ruleto.mx."),{statusCode:502,table});
}

async function hasLiveStripeSubscription(userId){
  const response=await fetch(`${supabaseUrl()}/rest/v1/billing_subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,trialing,past_due,unpaid,paused)&select=stripe_subscription_id&limit=1`,{
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`},
  });
  if(response.status===404)return false;
  if(!response.ok)return true;
  const rows=await response.json().catch(()=>[]);
  return Boolean(rows?.length);
}

async function cancelStripeSubscriptions(userId){
  if(!process.env.STRIPE_SECRET_KEY)return;
  if(!await hasLiveStripeSubscription(userId))return;
  const customer=await findCustomerForUser(userId);
  if(!customer)return;
  try{
    const list=await stripeRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`,{method:"GET"});
    for(const sub of list?.data||[]){
      if(["canceled","incomplete_expired"].includes(sub.status))continue;
      await stripeRequest(`subscriptions/${encodeURIComponent(sub.id)}`,{method:"DELETE"});
    }
  }catch(error){
    console.error("Account deletion Stripe cancellation skipped",error?.stripeCode||error?.message||error);
  }
}

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    if(String(req.body?.confirm||"").trim().toUpperCase()!=="ELIMINAR")return res.status(400).json({error:"Escribe ELIMINAR para confirmar."});
    if(!supabaseUrl()||!serviceKey())throw Object.assign(new Error("Servicio no configurado"),{statusCode:503});
    // Primero se detiene el cobro: si algo falla más adelante, el usuario no sigue pagando.
    await cancelStripeSubscriptions(user.id);
    for(const[table,column]of USER_TABLES)await purgeTable(table,column,user.id);
    const response=await fetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{
      method:"DELETE",
      headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`},
    });
    if(!response.ok&&response.status!==404)throw Object.assign(new Error("No se pudo eliminar tu cuenta. Escríbenos a privacidad@ruleto.mx."),{statusCode:502});
    return res.status(200).json({deleted:true});
  }catch(error){return sendError(res,error);}
};
