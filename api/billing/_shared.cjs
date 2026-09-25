const crypto=require("node:crypto");

const env=(name,fallback)=>process.env[name]||(fallback?process.env[fallback]:"");
const supabaseUrl=()=>env("SUPABASE_URL","REACT_APP_SUPABASE_URL")||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const anonKey=()=>env("SUPABASE_ANON_KEY","REACT_APP_SUPABASE_ANON_KEY")||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";

async function authenticate(req){
  const auth=String(req.headers?.authorization||"");
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token||!supabaseUrl()||!anonKey())return null;
  const response=await fetch(`${supabaseUrl()}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:anonKey()}});
  if(!response.ok)return null;
  const user=await response.json().catch(()=>null);
  return user?.id?user:null;
}

async function stripeRequest(path,{method="POST",params,idempotencyKey}={}){
  if(!process.env.STRIPE_SECRET_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
  const headers={Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`};
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  let body;
  if(params){headers["Content-Type"]="application/x-www-form-urlencoded";body=new URLSearchParams(params).toString();}
  const response=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers,body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data?.error?.message||"Stripe rechazó la operación");
    error.statusCode=response.status>=400&&response.status<500?400:502;
    throw error;
  }
  return data;
}

async function adminRequest(path,{method="GET",body,query=""}={}){
  if(!supabaseUrl()||!serviceKey())throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
  const response=await fetch(`${supabaseUrl()}/rest/v1/${path}${query}`,{
    method,
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,"Content-Type":"application/json",Prefer:"return=representation,resolution=merge-duplicates"},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error("No se pudo actualizar billing"),{statusCode:502,detail:data});
  return data;
}

async function findCustomerForUser(userId){
  const rows=await adminRequest("billing_customers",{query:`?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id&limit=1`});
  return rows?.[0]?.stripe_customer_id||null;
}

async function customerForUser(userId){
  const existing=await findCustomerForUser(userId);
  if(existing)return existing;
  const customer=await stripeRequest("customers",{params:{"metadata[supabase_user_id]":userId},idempotencyKey:`ruleto-customer-${userId}`});
  await adminRequest("billing_customers",{method:"POST",body:{user_id:userId,stripe_customer_id:customer.id}});
  return customer.id;
}

function requestKey(req,userId,purpose){
  const raw=String(req.headers?.["idempotency-key"]||req.body?.request_id||"");
  if(!/^[A-Za-z0-9_.:-]{8,200}$/.test(raw))return null;
  return `ruleto-${purpose}-${userId}-${crypto.createHash("sha256").update(raw).digest("hex").slice(0,32)}`;
}

function appUrl(){
  const raw=process.env.APP_URL||process.env.PUBLIC_APP_URL||"";
  try{const url=new URL(raw);return /^https?:$/.test(url.protocol)?url.origin:"";}catch{return "";}
}

function sendError(res,error){
  const status=error?.statusCode||500;
  if(status>=500)console.error("Ruleto billing error",error?.message||error);
  return res.status(status).json({error:status===503?"Billing no está configurado.":status===401?"Sesión no válida.":error?.message||"No se pudo procesar billing."});
}

function verifyStripeSignature(rawBody,header,secret,now=Math.floor(Date.now()/1000)){
  const parts=String(header||"").split(",").map(value=>value.split("="));
  const timestamp=Number(parts.find(([key])=>key==="t")?.[1]);
  const signatures=parts.filter(([key])=>key==="v1").map(([,value])=>value);
  if(!timestamp||Math.abs(now-timestamp)>300||!signatures.length)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  return signatures.some(signature=>{
    try{return crypto.timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(signature,"hex"));}catch{return false;}
  });
}

async function rawBody(req){
  if(Buffer.isBuffer(req.rawBody))return req.rawBody;
  if(Buffer.isBuffer(req.body))return req.body;
  const chunks=[];
  for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks);
}

module.exports={adminRequest,appUrl,authenticate,customerForUser,findCustomerForUser,requestKey,sendError,stripeRequest,verifyStripeSignature,rawBody};
