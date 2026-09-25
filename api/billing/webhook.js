const{adminRequest,rawBody,verifyStripeSignature}=require("./_shared.cjs");

async function userForEvent(object){
  const customer=typeof object?.customer==="string"?object.customer:object?.customer?.id;
  if(customer){
    const rows=await adminRequest("billing_customers",{query:`?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=user_id&limit=1`});
    if(rows?.[0]?.user_id)return rows[0].user_id;
  }
  return object?.metadata?.supabase_user_id||null;
}

module.exports=async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_PRICE_ID||!process.env.SUPABASE_SERVICE_ROLE_KEY)return res.status(503).json({error:"Billing no está configurado."});
  try{
    const raw=await rawBody(req);
    if(!verifyStripeSignature(raw,req.headers?.["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET))return res.status(400).json({error:"Firma inválida"});
    const event=JSON.parse(raw.toString("utf8"));
    if(!event?.id||!event?.type||!event?.data?.object)return res.status(400).json({error:"Evento inválido"});
    if(!["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type))return res.status(200).json({received:true,ignored:true});
    const subscription=event.data.object;
    const userId=await userForEvent(subscription);
    if(!userId)return res.status(200).json({received:true,ignored:true,reason:"unmapped_customer"});
    const priceId=subscription.items?.data?.[0]?.price?.id||null;
    const active=priceId===process.env.STRIPE_PRICE_ID&&["active","trialing"].includes(subscription.status);
    await adminRequest("rpc/apply_stripe_subscription_event",{method:"POST",body:{
      p_event_id:event.id,p_event_type:event.type,p_event_created:Number(event.created)||0,p_user_id:userId,
      p_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
      p_subscription_id:subscription.id,p_status:subscription.status,p_price_id:priceId,
      p_current_period_end:subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null,
      p_cancel_at_period_end:Boolean(subscription.cancel_at_period_end),p_entitled:active,p_payload:event,
    }});
    return res.status(200).json({received:true});
  }catch(error){console.error("Ruleto Stripe webhook error",error?.message||error);return res.status(500).json({error:"No se pudo procesar el webhook"});}
};

module.exports.config={api:{bodyParser:false}};
module.exports.userForEvent=userForEvent;
