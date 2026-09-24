const test=require("node:test");
const assert=require("node:assert/strict");
const handler=require("../api/geocode");

function responseRecorder(){
  return{
    statusCode:200,body:null,headers:{},
    setHeader(name,value){this.headers[name]=value;},
    status(code){this.statusCode=code;return this;},
    json(value){this.body=value;return this;},
  };
}

test("rejects invalid reverse-geocoding coordinates",async()=>{
  process.env.SUPABASE_URL="https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY="anon-test";
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true});
  try{
    const req={method:"GET",headers:{authorization:"Bearer user-token"},query:{lat:"200",lon:"-89"}};
    const res=responseRecorder();
    await handler(req,res);
    assert.equal(res.statusCode,400);
  }finally{global.fetch=originalFetch;}
});

test("returns a useful neighbourhood from OpenStreetMap",async()=>{
  process.env.SUPABASE_URL="https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY="anon-test";
  const calls=[];
  const originalFetch=global.fetch;
  global.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes("/auth/v1/user"))return{ok:true};
    return{ok:true,json:async()=>({address:{neighbourhood:"Centro",city:"Merida"}})};
  };
  try{
    const req={method:"GET",headers:{authorization:"Bearer user-token"},query:{lat:"20.967",lon:"-89.623"}};
    const res=responseRecorder();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.zone,"Centro");
    assert.equal(res.body.neighborhood,"Centro");
    assert.equal(res.body.neighborhood_type,"neighbourhood");
    assert.equal(res.body.city,"Merida");
    assert.equal(res.body.place_status,"resolved");
    assert.match(calls[1].options.headers["User-Agent"],/RutaFlow/);
    assert.match(res.headers["Cache-Control"],/s-maxage/);
  }finally{global.fetch=originalFetch;}
});

test("does not present a municipality as a colonia or as a verified city",()=>{
  const place=handler.normalizePlace({municipality:"Mérida",state:"Yucatán",city_district:"Centro"});
  assert.equal(place.neighborhood,"");
  assert.equal(place.city,"");
  assert.equal(place.municipality,"Mérida");
  assert.equal(place.place_status,"partial");
  assert.equal(place.display_name,"Mérida");
});

test("keeps fraccionamiento and city as separate place fields",()=>{
  const place=handler.normalizePlace({residential:"Las Américas",city:"Mérida",municipality:"Mérida"});
  assert.equal(place.neighborhood,"Las Américas");
  assert.equal(place.neighborhood_type,"residential");
  assert.equal(place.city,"Mérida");
  assert.equal(place.display_name,"Las Américas, Mérida");
});
