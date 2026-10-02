const test=require("node:test");
const assert=require("node:assert/strict");
const handler=require("../api/account/delete");

function response(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
function configure(){process.env.SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_ANON_KEY="anon";process.env.SUPABASE_SERVICE_ROLE_KEY="service";process.env.STRIPE_SECRET_KEY="sk_test_value";}
const USER="11111111-1111-4111-8111-111111111111";

test("account deletion requires a session and the ELIMINAR confirmation",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,opts={})=>{calls.push({url:String(url),method:opts.method||"GET"});return String(url).includes("/auth/v1/user")?{ok:true,json:async()=>({id:USER})}:{ok:true,status:200,json:async()=>[]};};
  try{
    let res=response();await handler({method:"POST",headers:{},body:{confirm:"ELIMINAR"}},res);assert.equal(res.statusCode,401);
    res=response();await handler({method:"POST",headers:{authorization:"Bearer t"},body:{confirm:"no"}},res);assert.equal(res.statusCode,400);
    assert.ok(!calls.some(c=>c.method==="DELETE"),"nothing is deleted without confirmation");
  }finally{global.fetch=original;}
});

test("account deletion cancels Stripe first, purges user tables, then removes the auth user",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,opts={})=>{
    const u=String(url);calls.push({url:u,method:opts.method||"GET"});
    if(u.includes("/auth/v1/user"))return{ok:true,json:async()=>({id:USER})};
    if(u.includes("billing_subscriptions"))return{ok:true,json:async()=>[{stripe_subscription_id:"sub_1"}]};
    if(u.includes("billing_customers"))return{ok:true,json:async()=>[{stripe_customer_id:"cus_1"}]};
    if(u.includes("api.stripe.com")&&u.includes("subscriptions?"))return{ok:true,json:async()=>({data:[{id:"sub_1",status:"active"},{id:"sub_2",status:"canceled"}]})};
    return{ok:true,status:200,json:async()=>({})};
  };
  try{
    const res=response();await handler({method:"POST",headers:{authorization:"Bearer t"},body:{confirm:"eliminar"}},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.deleted,true);
    const order=calls.filter(c=>c.method==="DELETE").map(c=>c.url);
    assert.match(order[0],/subscriptions\/sub_1/);
    assert.ok(!order.some(u=>u.includes("sub_2")));
    assert.ok(order.some(u=>u.includes("/rest/v1/trips?user_id=eq.")));
    assert.ok(order.some(u=>u.includes("/rest/v1/profiles?id=eq.")));
    assert.match(order[order.length-1],/\/auth\/v1\/admin\/users\//);
    assert.ok(!order.some(u=>u.includes("trial_devices")||u.includes("trial_phones")),"anti-abuse records are retained");
  }finally{global.fetch=original;}
});

test("account deletion skips Stripe when there is no live subscription",async()=>{
  configure();const original=global.fetch;const calls=[];
  global.fetch=async(url,opts={})=>{
    const u=String(url);calls.push({url:u,method:opts.method||"GET"});
    if(u.includes("/auth/v1/user"))return{ok:true,json:async()=>({id:USER})};
    if(u.includes("billing_subscriptions"))return{ok:true,json:async()=>[]};
    return{ok:true,status:200,json:async()=>({})};
  };
  try{
    const res=response();await handler({method:"POST",headers:{authorization:"Bearer t"},body:{confirm:"ELIMINAR"}},res);
    assert.equal(res.statusCode,200);assert.equal(res.body.deleted,true);
    assert.ok(!calls.some(c=>c.url.includes("api.stripe.com")),"Stripe is not required for local trials or already-cancelled accounts");
  }finally{global.fetch=original;}
});
