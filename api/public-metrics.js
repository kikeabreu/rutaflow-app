const supabaseUrl=()=>process.env.SUPABASE_URL||process.env.REACT_APP_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
const serviceKey=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||"";

async function countRows(table,query=""){
  if(!supabaseUrl()||!serviceKey())return null;
  const response=await fetch(`${supabaseUrl()}/rest/v1/${table}?select=*${query}`,{
    method:"HEAD",
    headers:{apikey:serviceKey(),Authorization:`Bearer ${serviceKey()}`,Prefer:"count=exact"},
  });
  if(!response.ok)return null;
  const range=response.headers.get("content-range")||"";
  const raw=range.split("/").pop();
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
}

function publicNumber(value){
  return Number.isFinite(value)&&value>0?value:null;
}

module.exports=async(req,res)=>{
  if(req.method==="OPTIONS"){
    res.setHeader("Access-Control-Allow-Methods","GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");
    return res.status(204).end();
  }
  if(req.method!=="GET")return res.status(405).json({error:"Método no permitido"});
  res.setHeader("Cache-Control","public, max-age=300, stale-while-revalidate=1800");
  try{
    const [profiles,trips,proProfiles,activeSubscriptions,privacyConsents]=await Promise.all([
      countRows("profiles"),
      countRows("trips"),
      countRows("profiles","&plan=eq.pro"),
      countRows("billing_subscriptions","&status=in.(active,trialing,past_due,unpaid,paused)"),
      countRows("privacy_consents"),
    ]);
    return res.status(200).json({
      generated_at:new Date().toISOString(),
      source:"supabase",
      metrics:{
        registered_drivers:publicNumber(profiles),
        analyzed_trips:publicNumber(trips),
        pro_or_trial_accounts:publicNumber(Math.max(proProfiles||0,activeSubscriptions||0,privacyConsents||0)),
        public_rating:null,
      },
    });
  }catch(error){
    console.error("Ruleto public metrics error",error);
    return res.status(200).json({generated_at:new Date().toISOString(),source:"supabase",metrics:{registered_drivers:null,analyzed_trips:null,pro_or_trial_accounts:null,public_rating:null}});
  }
};
