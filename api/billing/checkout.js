const{allowAppOrigin,appUrl,authenticate,customerForUser,requestKey,sendError,stripeRequest}=require("./_shared.cjs");

const{checkoutGuard}=require("./_checkout-guard.cjs");

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    const user=await authenticate(req);
    if(!user)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    const plan=String(req.body?.plan||"monthly").toLowerCase();
    if(!["monthly","annual"].includes(plan))return res.status(400).json({error:"Plan debe ser 'monthly' o 'annual'."});
    const priceKey=plan==="annual"?"STRIPE_PRICE_ID_ANNUAL":"STRIPE_PRICE_ID_MONTHLY";
    const price=process.env[priceKey];
    const origin=appUrl();
    if(!price||!origin||!process.env.STRIPE_SECRET_KEY||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});
    const key=requestKey(req,user.id,"checkout");
    if(!key)return res.status(400).json({error:"Envía Idempotency-Key único para crear el checkout."});
    const customer=await customerForUser(user.id);
    const guard=await checkoutGuard(customer,price);
    if(guard.url)return res.status(200).json({url:guard.url});
    const session=await stripeRequest("checkout/sessions",{idempotencyKey:guard.idempotencyKey,params:{
      mode:"subscription",customer,"line_items[0][price]":price,"line_items[0][quantity]":"1",
      "metadata[price_id]":price,client_reference_id:user.id,"metadata[supabase_user_id]":user.id,
      "subscription_data[metadata][supabase_user_id]":user.id,
      success_url:`${origin}/?billing=return`,cancel_url:`${origin}/?billing=cancelled`,
      allow_promotion_codes:"true",
    }});
    return res.status(200).json({url:session.url});
  }catch(error){return sendError(res,error);}
};
