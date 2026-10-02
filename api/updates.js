const handlers={
  policy:require('../lib/updates/index.cjs'),
  installations:require('../lib/updates/installations.cjs'),
  admin:require('../lib/updates/admin.cjs'),
  worker:require('../lib/updates/worker.cjs'),
  vapid:require('../lib/updates/vapid.cjs'),
};
module.exports=(req,res)=>{
  const route=String(req.query?.route||'policy');
  const handler=handlers[route];
  if(!handler)return res.status(404).json({error:'Ruta desconocida'});
  return handler(req,res);
};
