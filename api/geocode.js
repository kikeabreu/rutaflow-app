const NOMINATIM_URL="https://nominatim.openstreetmap.org/reverse";

const env=(name,fallback)=>process.env[name]||(fallback?process.env[fallback]:"");

async function authenticate(req){
  const auth=req.headers.authorization||"";
  const token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token)return false;
  const url=env("SUPABASE_URL","REACT_APP_SUPABASE_URL")||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=env("SUPABASE_ANON_KEY","REACT_APP_SUPABASE_ANON_KEY")||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return false;
  const response=await fetch(`${url}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:key}});
  return response.ok;
}

module.exports=async function handler(req,res){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({error:"Metodo no permitido"});
  }
  try{
    if(!(await authenticate(req)))return res.status(401).json({error:"Sesion no valida"});
    const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
    if(!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180){
      return res.status(400).json({error:"Coordenadas no validas"});
    }
    const params=new URLSearchParams({format:"jsonv2",lat:String(lat),lon:String(lon),zoom:"14",addressdetails:"1",layer:"address","accept-language":"es"});
    const response=await fetch(`${NOMINATIM_URL}?${params}`,{
      headers:{"User-Agent":"RutaFlow/1.0 (https://github.com/kikeabreu/rutaflow-app)","Accept-Language":"es"},
    });
    if(!response.ok)return res.status(502).json({error:"No se pudo identificar la zona"});
    const data=await response.json();
    const a=data.address||{};
    const zone=a.neighbourhood||a.suburb||a.quarter||a.city_district||a.borough||a.village||a.town||a.city||"";
    const city=a.city||a.town||a.municipality||a.county||"";
    res.setHeader("Cache-Control","s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({zone,city,attribution:"OpenStreetMap contributors"});
  }catch(error){
    console.error("RutaFlow geocode error",error);
    return res.status(500).json({error:"No se pudo identificar la zona"});
  }
};
