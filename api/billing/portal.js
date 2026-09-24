const{appUrl,authenticate,findCustomerForUser,requestKey,sendError,stripeRequest}=require("./_shared.cjs");

module.exports=async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    const origin=appUrl();
    if(!origin||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
    const key=requestKey(req,user.id,"portal");
    if(!key)return res.status(400).json({error:"Envía Idempotency-Key único para abrir el portal."});
    const customer=await findCustomerForUser(user.id);
    if(!customer)return res.status(404).json({error:"Aún no hay una cuenta de cobro para este usuario."});
    const session=await stripeRequest("billing_portal/sessions",{idempotencyKey:key,params:{customer,return_url:`${origin}/?billing=portal-return`}});
    return res.status(200).json({url:session.url});
  }catch(error){return sendError(res,error);}
};
