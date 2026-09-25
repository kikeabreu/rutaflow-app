const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const checkout=require("../api/billing/checkout");
const webhook=require("../api/billing/webhook");
const{verifyStripeSignature}=require("../api/billing/_shared.cjs");

function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function configure(){
  process.env.SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  process.env.STRIPE_SECRET_KEY="sk_test_value";process.env.STRIPE_PRICE_ID="price_real_required";process.env.STRIPE_WEBHOOK_SECRET="whsec_test";process.env.APP_URL="https://ruleto.example";
}

test("verifies Stripe signature over the exact raw body and rejects tampering",()=>{
  const raw=Buffer.from('{"id":"evt_1"}');const t=1700000000;
  const sig=crypto.createHmac("sha256","whsec_test").update(`${t}.`).update(raw).digest("hex");
  assert.equal(verifyStripeSignature(raw,`t=${t},v1=${sig}`,"whsec_test",t),true);
  assert.equal(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'),`t=${t},v1=${sig}`,"whsec_test",t),false);
});

test("checkout requires an authenticated user and client idempotency key",async()=>{
  configure();const original=global.fetch;global.fetch=async url=>String(url).includes("/auth/v1/user")?{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111"})}:{ok:true,json:async()=>[]};
  try{
    let res=response();await checkout({method:"POST",headers:{},body:{}},res);assert.equal(res.statusCode,401);
    res=response();await checkout({method:"POST",headers:{authorization:"Bearer token"},body:{}},res);assert.equal(res.statusCode,400);assert.match(res.body.error,/Idempotency-Key/);
  }finally{global.fetch=original;}
});

test("checkout binds Stripe metadata to JWT user id and never to email",async()=>{
  configure();const calls=[];const original=global.fetch;
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/auth/v1/user"))return{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111",email:"untrusted@example.com"})};
    if(String(url).includes("billing_customers?") )return{ok:true,json:async()=>[]};
    if(String(url).includes("api.stripe.com/v1/customers"))return{ok:true,json:async()=>({id:"cus_1"})};
    if(String(url).includes("billing_customers"))return{ok:true,json:async()=>[{}]};
    return{ok:true,json:async()=>({url:"https://checkout.stripe.com/session"})};
  };
  try{
    const res=response();await checkout({method:"POST",headers:{authorization:"Bearer token","idempotency-key":"checkout-123"},body:{}},res);
    assert.equal(res.statusCode,200);const bodies=calls.map(call=>String(call.options.body||""));
    assert.ok(bodies.some(body=>body.includes("metadata%5Bsupabase_user_id%5D=11111111-1111-4111-8111-111111111111")));
    assert.ok(!bodies.some(body=>body.includes("untrusted%40example.com")));
    assert.ok(calls.filter(call=>call.options.headers?.["Idempotency-Key"]).length>=2);
  }finally{global.fetch=original;}
});

test("signed subscription webhook calls the atomic entitlement RPC",async()=>{
  configure();const event={id:"evt_1",created:1700000000,type:"customer.subscription.updated",data:{object:{id:"sub_1",customer:"cus_1",status:"active",current_period_end:1800000000,cancel_at_period_end:false,metadata:{supabase_user_id:"11111111-1111-4111-8111-111111111111"},items:{data:[{price:{id:"price_real_required"}}]}}}};
  const raw=Buffer.from(JSON.stringify(event));const t=Math.floor(Date.now()/1000);const sig=crypto.createHmac("sha256",process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest("hex");
  const calls=[];const original=global.fetch;global.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).includes("billing_customers?"))return{ok:true,json:async()=>[]};return{ok:true,json:async()=>true};};
  try{
    const res=response();await webhook({method:"POST",headers:{"stripe-signature":`t=${t},v1=${sig}`},rawBody:raw},res);
    assert.equal(res.statusCode,200);const rpc=calls.find(call=>call.url.includes("rpc/apply_stripe_subscription_event"));assert.ok(rpc);
    const body=JSON.parse(rpc.options.body);assert.equal(body.p_user_id,"11111111-1111-4111-8111-111111111111");assert.equal(body.p_entitled,true);
  }finally{global.fetch=original;}
});
