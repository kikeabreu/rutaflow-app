const{allowAppOrigin,authenticate,sendError}=require("../../api/billing/_shared.cjs");

const supabaseUrl=()=>process.env.SUPABASE_URL||process.env.REACT_APP_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const anonKey=()=>process.env.SUPABASE_ANON_KEY||process.env.REACT_APP_SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";

function normalizeEmail(email){return String(email||"").trim().toLowerCase();}
function isRuletoEmail(email){return /@ruleto\.mx$/i.test(normalizeEmail(email));}

async function jsonFetch(url,options){
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>null);
  return{response,data};
}

async function verifyPassword(email,password){
  if(!supabaseUrl()||!anonKey())throw Object.assign(new Error("Auth no configurado"),{statusCode:503});
  const{response}=await jsonFetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`,{
    method:"POST",
    headers:{apikey:anonKey(),"Content-Type":"application/json"},
    body:JSON.stringify({email,password}),
  });
  return response.ok;
}

async function adminUpdateEmail(userId,email){
  if(!supabaseUrl()||!serviceKey())throw Object.assign(new Error("Auth no configurado"),{statusCode:503});
  const{response,data}=await jsonFetch(`${supabaseUrl()}/auth/v1/admin/users/${encodeURIComponent(userId)}`,{
    method:"PUT",
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,"Content-Type":"application/json"},
    body:JSON.stringify({email,email_confirm:true,user_metadata:{email_verified:true}}),
  });
  if(!response.ok)throw Object.assign(new Error(data?.msg||data?.error||"No se pudo cambiar el correo."),{statusCode:502});
}

async function updateProfileEmail(userId,email){
  if(!supabaseUrl()||!serviceKey())return;
  await fetch(`${supabaseUrl()}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,{
    method:"PATCH",
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify({email}),
  }).catch(()=>{});
}

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    const email=normalizeEmail(req.body?.email);
    const currentPassword=String(req.body?.currentPassword||"");
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.status(400).json({error:"Ingresa un correo válido."});
    if(!currentPassword)return res.status(400).json({error:"Ingresa tu contraseña actual."});
    if(!await verifyPassword(user.email,currentPassword))return res.status(400).json({error:"La contraseña actual no es correcta."});
    if(isRuletoEmail(email)){
      await adminUpdateEmail(user.id,email);
      await updateProfileEmail(user.id,email);
      return res.status(200).json({changed:true,bypassed:true,email});
    }
    return res.status(200).json({changed:false,bypassed:false,email});
  }catch(error){return sendError(res,error);}
};

module.exports._internals={isRuletoEmail,normalizeEmail};
