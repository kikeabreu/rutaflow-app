const{appUrl,authenticate,customerForUser,requestKey,sendError,stripeRequest}=require("./_shared.cjs");

module.exports=async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    const price=process.env.STRIPE_PRICE_ID;
    const origin=appUrl();
    if(!price||!origin||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
    const key=requestKey(req,user.id,"checkout");
    if(!key)return res.status(400).json({error:"Envía Idempotency-Key único para crear el checkout."});
    const customer=await customerForUser(user.id);
    const session=await stripeRequest("checkout/sessions",{idempotencyKey:key,params:{
      mode:"subscription",customer,"line_items[0][price]":price,"line_items[0][quantity]":"1",
      client_reference_id:user.id,"metadata[supabase_user_id]":user.id,
      "subscription_data[metadata][supabase_user_id]":user.id,
      success_url:`${origin}/?billing=return`,cancel_url:`${origin}/?billing=cancelled`,
      allow_promotion_codes:"true",
    }});
    return res.status(200).json({url:session.url});
  }catch(error){return sendError(res,error);}
};
