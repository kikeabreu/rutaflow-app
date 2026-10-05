const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const checkout=require("../api/billing/checkout");
const portalStatus=require("../api/billing/portal-status");
const webhook=require("../api/billing/webhook");
const{appUrl,verifyStripeSignature}=require("../api/billing/_shared.cjs");

function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
function configure(){
  process.env.SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  process.env.STRIPE_SECRET_KEY="sk_test_value";process.env.STRIPE_PRICE_ID="price_real_required";process.env.STRIPE_PRICE_ID_MONTHLY="price_real_required";process.env.STRIPE_WEBHOOK_SECRET="whsec_test";process.env.APP_URL="https://ruleto.example";
}

test("billing callbacks use app.ruleto.mx even with the old Vercel URL configured",()=>{
  const previous=process.env.APP_URL;
  try{
    process.env.APP_URL="https://rutaflow-app.vercel.app";
    assert.equal(appUrl(),"https://app.ruleto.mx");
    process.env.APP_URL="https://ruleto.mx";
    assert.equal(appUrl(),"https://app.ruleto.mx");
  }finally{if(previous===undefined)delete process.env.APP_URL;else process.env.APP_URL=previous;}
});

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

test("portal is available only with a live Stripe subscription",async()=>{
  configure();const original=global.fetch;
  const user={id:"11111111-1111-4111-8111-111111111111"};
  let subscriptions=[];
  global.fetch=async url=>{
    const path=String(url);
    if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>user};
    if(path.includes("/billing_customers"))return{ok:true,json:async()=>[{stripe_customer_id:"cus_test"}]};
    if(path.includes("/billing_subscriptions"))return{ok:true,json:async()=>subscriptions};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  try{
    let res=response();await portalStatus({method:"GET",headers:{authorization:"Bearer token"}},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.manageable,false);
    process.env.STRIPE_PRICE_ID_MONTHLY="price_monthly";
    process.env.STRIPE_PRICE_ID_ANNUAL="price_annual";
    subscriptions=[{stripe_subscription_id:"sub_test",status:"active",price_id:"price_monthly",current_period_end:"2026-11-01T00:00:00Z",cancel_at_period_end:false}];
    res=response();await portalStatus({method:"GET",headers:{authorization:"Bearer token"}},res);
    assert.equal(res.body.manageable,true);
    assert.equal(res.body.subscription.interval,"monthly");
    assert.equal(res.body.subscription.can_upgrade_annual,true);
    assert.equal(res.body.subscription.current_period_end,"2026-11-01T00:00:00Z");
  }finally{global.fetch=original;}
});

test("checkout binds Stripe metadata to JWT user id and never to email",async()=>{
  configure();const calls=[];const original=global.fetch;
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/auth/v1/user"))return{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111",email:"untrusted@example.com"})};
    if(String(url).includes("billing_customers?") )return{ok:true,json:async()=>[]};
    if(String(url).includes("api.stripe.com/v1/customers"))return{ok:true,json:async()=>({id:"cus_1"})};
    if(String(url).includes("/subscriptions?")||String(url).includes("/checkout/sessions?"))return{ok:true,json:async()=>({data:[],has_more:false})};
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

for(const [plan,price] of [["monthly","price_monthly"],["annual","price_annual"]]){
  test(`${plan} checkout selects its price and returns a Stripe URL`,async()=>{
    configure();process.env.STRIPE_PRICE_ID_MONTHLY="price_monthly";process.env.STRIPE_PRICE_ID_ANNUAL="price_annual";
    const original=global.fetch;let checkoutBody;
    global.fetch=async(url,options={})=>{
      const path=String(url);
      if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111"})};
      if(path.includes("billing_customers?"))return{ok:true,json:async()=>[{stripe_customer_id:"cus_test"}]};
      if(path.includes("/subscriptions?")||path.includes("/checkout/sessions?"))return{ok:true,json:async()=>({data:[],has_more:false})};
      if(path.endsWith("/checkout/sessions")){checkoutBody=new URLSearchParams(options.body);return{ok:true,json:async()=>({url:"https://checkout.stripe.com/test-session"})};}
      throw new Error(`Unexpected fetch: ${path}`);
    };
    try{
      const res=response();await checkout({method:"POST",headers:{authorization:"Bearer token","idempotency-key":"checkout-123"},body:{plan}},res);
      assert.equal(res.statusCode,200);assert.equal(res.body.url,"https://checkout.stripe.com/test-session");
      assert.equal(checkoutBody.get("line_items[0][price]"),price);
    }finally{global.fetch=original;}
  });
}

test("switching from an abandoned annual checkout creates a monthly checkout",async()=>{
  configure();process.env.STRIPE_PRICE_ID_MONTHLY="price_monthly";process.env.STRIPE_PRICE_ID_ANNUAL="price_annual";
  process.env.APP_URL="https://rutaflow-app.vercel.app";
  const original=global.fetch;const calls=[];
  global.fetch=async(url,options={})=>{
    const path=String(url);calls.push({path,options});
    if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111"})};
    if(path.includes("billing_customers?"))return{ok:true,json:async()=>[{stripe_customer_id:"cus_test"}]};
    if(path.includes("/subscriptions?"))return{ok:true,json:async()=>({data:[],has_more:false})};
    if(path.includes("/checkout/sessions?"))return{ok:true,json:async()=>({data:[{id:"cs_annual",mode:"subscription",status:"open",metadata:{price_id:"price_annual"}}],has_more:false})};
    if(path.endsWith("/checkout/sessions/cs_annual/expire"))return{ok:true,json:async()=>({id:"cs_annual",status:"expired"})};
    if(path.endsWith("/checkout/sessions"))return{ok:true,json:async()=>({url:"https://checkout.stripe.com/monthly"})};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  try{
    const res=response();await checkout({method:"POST",headers:{authorization:"Bearer token","idempotency-key":"checkout-monthly-123"},body:{plan:"monthly"}},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.url,"https://checkout.stripe.com/monthly");
    const expireIndex=calls.findIndex(call=>call.path.endsWith("/expire"));
    const createIndex=calls.findIndex(call=>call.path.endsWith("/checkout/sessions"));
    assert.ok(expireIndex>=0&&createIndex>expireIndex);
    const body=new URLSearchParams(calls[createIndex].options.body);
    assert.equal(body.get("line_items[0][price]"),"price_monthly");
    assert.equal(body.get("cancel_url"),"https://app.ruleto.mx/?billing=cancelled");
  }finally{global.fetch=original;}
});

test("Stripe permission errors never disclose key or account details to the client",async()=>{
  configure();const original=global.fetch;
  global.fetch=async url=>{
    const path=String(url);
    if(path.includes("/auth/v1/user"))return{ok:true,json:async()=>({id:"11111111-1111-4111-8111-111111111111"})};
    if(path.includes("billing_customers?"))return{ok:true,json:async()=>[{stripe_customer_id:"cus_test"}]};
    if(path.includes("/subscriptions?"))return{ok:false,status:403,json:async()=>({error:{code:"permission_denied",message:"Key rk_live_secret lacks access to acct_private"}})};
    throw new Error(`Unexpected fetch: ${path}`);
  };
  const originalError=console.error;console.error=()=>{};
  try{
    const res=response();await checkout({method:"POST",headers:{authorization:"Bearer token","idempotency-key":"checkout-123"},body:{plan:"monthly"}},res);
    assert.equal(res.statusCode,502);assert.match(res.body.error,/cobro/);
    assert.doesNotMatch(res.body.error,/rk_live|acct_private|permission_denied/);
  }finally{global.fetch=original;console.error=originalError;}
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

test("confirmed subscription checkout sends one Subscribe event to Meta",async()=>{
  configure();process.env.META_DATASET_ID="4090885441210287";process.env.META_ACCESS_TOKEN="meta-test-token";process.env.META_GRAPH_API_VERSION="v26.0";
  const event={id:"evt_checkout_1",created:Math.floor(Date.now()/1000),type:"checkout.session.completed",data:{object:{id:"cs_test_1",mode:"subscription",customer:"cus_1",amount_total:9700,currency:"mxn",metadata:{supabase_user_id:"11111111-1111-4111-8111-111111111111"}}}};
  const raw=Buffer.from(JSON.stringify(event));const t=Math.floor(Date.now()/1000);const sig=crypto.createHmac("sha256",process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.`).update(raw).digest("hex");
  const calls=[];const original=global.fetch;global.fetch=async(url,options={})=>{calls.push({url:String(url),options});if(String(url).includes("billing_customers?"))return{ok:true,json:async()=>[{user_id:"11111111-1111-4111-8111-111111111111"}]};if(String(url).includes("graph.facebook.com"))return{ok:true,status:200,json:async()=>({events_received:1})};throw new Error(`Unexpected fetch: ${url}`);};
  try{
    const res=response();await webhook({method:"POST",headers:{"stripe-signature":`t=${t},v1=${sig}`},rawBody:raw},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.received,true);assert.equal(res.body.meta.sent,true);
    const graph=calls.find(call=>call.url.includes("graph.facebook.com"));assert.ok(graph);const body=JSON.parse(graph.options.body);assert.equal(body.data[0].event_name,"Subscribe");assert.equal(body.data[0].event_id,"stripe-evt_checkout_1");assert.equal(body.data[0].custom_data.value,97);assert.equal(graph.options.body.includes("meta-test-token"),false);
  }finally{global.fetch=original;}
});


test("Android billing preflight allows its app origin and idempotency header",async()=>{
  const res=response();
  await checkout({method:"OPTIONS",headers:{origin:"https://localhost"}},res);
  assert.equal(res.statusCode,204);
  assert.equal(res.headers["Access-Control-Allow-Origin"],"https://localhost");
  assert.match(res.headers["Access-Control-Allow-Headers"],/Idempotency-Key/);
});
