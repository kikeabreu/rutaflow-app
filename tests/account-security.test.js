const test=require("node:test");
const assert=require("node:assert/strict");
const emailChange=require("../api/account/email-change");
const registerRuleto=require("../api/account/register-ruleto");

function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
function configure(){process.env.SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";}
const user={id:"11111111-1111-4111-8111-111111111111",email:"old@example.com"};

test("detecta correos ruleto para omitir verificacion solo en ese dominio",()=>{
  assert.equal(emailChange._internals.isRuletoEmail("demo@ruleto.mx"),true);
  assert.equal(emailChange._internals.isRuletoEmail("demo@sub.ruleto.mx"),false);
  assert.equal(registerRuleto._internals.isRuletoEmail(" Demo@Ruleto.MX "),true);
});

test("cambio de correo valida sesion y contraseña antes de decidir el flujo",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,options={})=>{
    const path=String(url);calls.push({path,options});
    if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>user};
    if(path.includes("/auth/v1/token"))return{ok:false,status:400,json:async()=>({})};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  try{
    const res=response();
    await emailChange({method:"POST",headers:{authorization:"Bearer token"},body:{email:"new@example.com",currentPassword:"bad"}},res);
    assert.equal(res.statusCode,400);
    assert.match(res.body.error,/contraseña actual/i);
    assert.ok(!calls.some(call=>call.path.includes("/auth/v1/admin/users/")));
  }finally{global.fetch=original;}
});

test("correo @ruleto.mx confirmado se aplica desde el servidor",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,options={})=>{
    const path=String(url);calls.push({path,options});
    if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>user};
    if(path.includes("/auth/v1/token"))return{ok:true,json:async()=>({access_token:"tmp"})};
    if(path.includes("/auth/v1/admin/users/"))return{ok:true,json:async()=>({id:user.id,email:"qa@ruleto.mx"})};
    if(path.includes("/rest/v1/profiles"))return{ok:true,json:async()=>({})};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  try{
    const res=response();
    await emailChange({method:"POST",headers:{authorization:"Bearer token"},body:{email:"qa@ruleto.mx",currentPassword:"ok"}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.bypassed,true);
    assert.ok(calls.some(call=>call.path.includes("/auth/v1/admin/users/")&&call.options.method==="PUT"));
    assert.ok(calls.some(call=>String(call.options.body).includes('"email_confirm":true')));
  }finally{global.fetch=original;}
});

test("registro @ruleto.mx crea usuario confirmado y perfil",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,options={})=>{
    const path=String(url);calls.push({path,options});
    if(path.includes("/auth/v1/admin/users"))return{ok:true,json:async()=>({id:user.id})};
    if(path.includes("/rest/v1/profiles"))return{ok:true,json:async()=>({})};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  try{
    const res=response();
    await registerRuleto({method:"POST",headers:{},body:{email:"qa@ruleto.mx",password:"secret1",full_name:"QA Ruleto",phone:"+529991112233",phone_country:"MX"}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.created,true);
    assert.ok(calls.some(call=>String(call.options.body).includes('"email_confirm":true')));
    assert.ok(calls.some(call=>call.path.includes("/rest/v1/profiles")));
  }finally{global.fetch=original;}
});
