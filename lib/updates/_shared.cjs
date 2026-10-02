const {authenticate} = require('../../api/billing/_shared.cjs');
const BASE=process.env.SUPABASE_URL||process.env.REACT_APP_SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers=()=>({apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json',Prefer:'return=representation,resolution=merge-duplicates'});
function error(message,status=400){return Object.assign(new Error(message),{status});}
function cors(req,res){const origin=req.headers.origin;if(['https://app.ruleto.mx','https://localhost','capacitor://localhost'].includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS'){res.status(204).end();return true;}return false;}
function reply(res,e){const status=e.status||500;if(status>=500)console.error('Updates API',e);res.status(status).json({error:status>=500?'Servicio de actualizaciones no disponible':e.message});}
async function db(table,{method='GET',query='',body,prefer}={}){if(!BASE||!KEY)throw error('Updates backend not configured',503);const response=await fetch(`${BASE}/rest/v1/${table}${query}`,{method,headers:{...headers(),...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>null);if(!response.ok)throw error(`Database ${response.status}`,503);return data;}
async function rpc(name,body){return db(`rpc/${name}`,{method:'POST',body});}
async function user(req){const value=await authenticate(req);if(!value)throw error('Sesión no válida',401);return value;}
function adminEmails(){return String(process.env.UPDATE_ADMIN_EMAILS||'e.abreuespinoza@gmail.com').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);}
function isAdminUser(value){return value?.app_metadata?.support_role==='admin'||adminEmails().includes(String(value?.email||'').toLowerCase());}
async function admin(req){const value=await user(req);if(!isAdminUser(value))throw error('Sin permiso',403);return value;}
function validBuild(value){return Number.isSafeInteger(Number(value))&&Number(value)>=0;}
function queryEq(value){return encodeURIComponent(String(value));}
module.exports={admin,cors,db,error,isAdminUser,queryEq,reply,rpc,user,validBuild};
