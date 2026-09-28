const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");

test("el enlace viejo abre la PWA y su manifiesto instala app.ruleto.mx",()=>{
  const routes=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
  const legacyRoot=routes.redirects.find(route=>route.source==="/"&&route.has?.some(condition=>condition.type==="host"&&condition.value==="rutaflow-app.vercel.app")&&!route.has?.some(condition=>condition.type==="query"));
  assert.equal(legacyRoot?.destination,"https://app.ruleto.mx/");
  const billingReturn=routes.redirects.find(route=>route.source==="/"&&route.has?.some(condition=>condition.key==="billing"));
  assert.equal(billingReturn?.destination,"https://app.ruleto.mx/?billing=:billing");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"public/manifest.json"),"utf8"));
  assert.equal(manifest.id,"https://app.ruleto.mx/");
  assert.equal(manifest.start_url,"https://app.ruleto.mx/");
  assert.equal(manifest.scope,"https://app.ruleto.mx/");
});
