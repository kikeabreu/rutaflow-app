const handlers={
  delete:require('../lib/account/delete.cjs'),
  'email-change':require('../lib/account/email-change.cjs'),
  'register-ruleto':require('../lib/account/register-ruleto.cjs'),
};
module.exports=(req,res)=>{
  const handler=handlers[String(req.query?.route||'')];
  if(!handler)return res.status(404).json({error:'Ruta desconocida'});
  return handler(req,res);
};
