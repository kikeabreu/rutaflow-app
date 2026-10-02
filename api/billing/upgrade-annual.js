const{allowAppOrigin,appUrl,authenticate,findCustomerForUser,requestKey,sendError,stripeRequest}=require("./_shared.cjs");

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    const origin=appUrl();
    const annual=process.env.STRIPE_PRICE_ID_ANNUAL;
    if(!origin||!annual||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
    const key=requestKey(req,user.id,"annual-upgrade");
    if(!key)return res.status(400).json({error:"Envía Idempotency-Key único para actualizar tu plan."});
    const customer=await findCustomerForUser(user.id);
    if(!customer)return res.status(404).json({error:"Aún no hay una cuenta de cobro para este usuario."});
    const list=await stripeRequest(`subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=100`,{method:"GET"});
    const current=(list?.data||[]).find(sub=>!["canceled","incomplete_expired"].includes(sub.status));
    if(!current?.id)throw Object.assign(new Error("No encontramos una suscripción activa para actualizar."),{statusCode:404});
    const currentPrice=current.items?.data?.[0]?.price?.id||"";
    if(currentPrice===annual)throw Object.assign(new Error("Tu suscripción ya es anual."),{statusCode:409});
    const session=await stripeRequest("billing_portal/sessions",{idempotencyKey:key,params:{
      customer,return_url:`${origin}/?billing=portal-return`,
      "flow_data[type]":"subscription_update",
      "flow_data[subscription_update][subscription]":current.id,
    }});
    return res.status(200).json({url:session.url});
  }catch(error){return sendError(res,error);}
};
