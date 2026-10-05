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

test("la ruta de recuperacion de contraseña carga la PWA",()=>{
  const routes=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
  const recovery=routes.rewrites.find(route=>route.source==="/auth/restablecer");
  assert.equal(recovery?.destination,"/app.html");
});

test("separa explícitamente la landing del apex y la PWA del subdominio app",()=>{
  const routes=JSON.parse(fs.readFileSync(path.join(root,"vercel.json"),"utf8"));
  const landing=routes.rewrites.find(route=>route.source==="/"&&route.destination==="/landing.html");
  const app=routes.rewrites.find(route=>route.source==="/"&&route.destination==="/app.html");
  assert.deepEqual(landing?.has,[{type:"host",value:"ruleto.mx"}]);
  assert.deepEqual(app?.has,[{type:"host",value:"app.ruleto.mx"}]);
  const wwwRedirect=routes.redirects.find(route=>route.source==="/:path*"&&route.destination==="https://ruleto.mx/:path*");
  assert.deepEqual(wwwRedirect?.has,[{type:"host",value:"www.ruleto.mx"}]);
  assert.equal(wwwRedirect?.permanent,true);
});

test("incluye una pagina 404 compartida por ruleto.mx y app.ruleto.mx",()=>{
  const page=fs.readFileSync(path.join(root,"public","404.html"),"utf8");
  assert.match(page,/<title>Página no encontrada/);
  assert.match(page,/noindex/);
  assert.match(page,/https:\/\/ruleto\.mx\//);
  assert.match(page,/https:\/\/app\.ruleto\.mx\//);
});
