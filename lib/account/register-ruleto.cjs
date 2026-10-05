const{allowAppOrigin,sendError}=require("../../api/billing/_shared.cjs");

const supabaseUrl=()=>process.env.SUPABASE_URL||process.env.REACT_APP_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";

function normalizeEmail(email){return String(email||"").trim().toLowerCase();}
function isRuletoEmail(email){return /@ruleto\.mx$/i.test(normalizeEmail(email));}

async function request(path,{method="POST",body}={}){
  const response=await fetch(`${supabaseUrl()}${path}`,{
    method,
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(data?.msg||data?.error||"No se pudo crear la cuenta."),{statusCode:502});
  return data;
}

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    if(!supabaseUrl()||!serviceKey())throw Object.assign(new Error("Auth no configurado"),{statusCode:503});
    const email=normalizeEmail(req.body?.email);
    const password=String(req.body?.password||"");
    const fullName=String(req.body?.full_name||"").trim();
    const phone=String(req.body?.phone||"").trim();
    const phoneCountry=String(req.body?.phone_country||"").trim();
    if(!isRuletoEmail(email))return res.status(400).json({error:"Este registro solo aplica para correos @ruleto.mx."});
    if(!fullName)return res.status(400).json({error:"Ingresa tu nombre completo."});
    if(password.length<6)return res.status(400).json({error:"Contraseña mínima: 6 caracteres."});
    const user=await request("/auth/v1/admin/users",{body:{
      email,password,email_confirm:true,
      user_metadata:{
        full_name:fullName,phone,phone_country:phoneCountry,
        privacy_notice_version:req.body?.privacy_notice_version,
        privacy_terms_accepted:true,privacy_financial_accepted:true,
      },
    }});
    await fetch(`${supabaseUrl()}/rest/v1/profiles`,{
      method:"POST",
      headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({id:user.id||user?.user?.id,full_name:fullName,email,config:{}}),
    }).catch(()=>{});
    return res.status(200).json({created:true,email});
  }catch(error){return sendError(res,error);}
};

module.exports._internals={isRuletoEmail,normalizeEmail};
