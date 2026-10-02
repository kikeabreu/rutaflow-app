const test=require("node:test");
const assert=require("node:assert/strict");

const originalFetch=global.fetch;
const originalEnv={...process.env};

function response(){
  return {
    code:200,
    headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(v){this.code=v;return this;},
    json(v){this.body=v;return this;},
    end(){this.ended=true;return this;},
  };
}

function headCount(value,status=200){
  return {ok:status<400,status,headers:{get(name){return name.toLowerCase()==="content-range"?`0-0/${value}`:null;}}};
}

test("public metrics returns only aggregate Supabase counts",async()=>{
  process.env.SUPABASE_URL="https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="service";
  const seen=[];
  global.fetch=async(url,options={})=>{
    seen.push({url,method:options.method,auth:options.headers.Authorization});
    if(String(url).includes("/profiles?select=*&plan=eq.pro"))return headCount(2);
    if(String(url).includes("/profiles?select=*"))return headCount(8);
    if(String(url).includes("/trips?select=*"))return headCount(42);
    if(String(url).includes("/billing_subscriptions?select=*"))return headCount(1);
    if(String(url).includes("/privacy_consents?select=*"))return headCount(5);
    return headCount(0,404);
  };
  delete require.cache[require.resolve("../api/public-metrics.js")];
  const handler=require("../api/public-metrics.js");
  const res=response();
  await handler({method:"GET"},res);
  assert.equal(res.code,200);
  assert.equal(res.body.source,"supabase");
  assert.deepEqual(res.body.metrics,{
    registered_drivers:8,
    analyzed_trips:42,
    pro_or_trial_accounts:5,
    public_rating:null,
  });
  assert.equal(seen.every(call=>call.method==="HEAD"),true);
  assert.equal(seen.every(call=>call.auth==="Bearer service"),true);
});

test.after(()=>{
  global.fetch=originalFetch;
  process.env=originalEnv;
});
