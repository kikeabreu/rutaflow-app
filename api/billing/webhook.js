const{adminRequest,rawBody,verifyStripeSignature}=require("./_shared.cjs");
const{buildEvent,config:metaConfig,sendEvent}=require("../meta/_shared.cjs");

async function userForEvent(object){
  const customer=typeof object?.customer==="string"?object.customer:object?.customer?.id;
  if(customer){
    const rows=await adminRequest("billing_customers",{query:`?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=user_id&limit=1`});
    if(rows?.[0]?.user_id)return rows[0].user_id;
  }
  return object?.metadata?.supabase_user_id||null;
}

async function sendCheckoutMetaEvent(event,session,userId){
  if(!metaConfig().datasetId||!metaConfig().accessToken)return{sent:false,skipped:true};
  const subscription=session.mode==="subscription";
  const value=Number(session.amount_total);
  const currency=String(session.currency||"").toUpperCase();
  const metaEvent=buildEvent({
    event_name:subscription?"Subscribe":"Purchase",
    event_id:`stripe-${event.id}`,
    event_time:Number(event.created)||Math.floor(Date.now()/1000),
    action_source:"website",
    event_source_url:"https://app.ruleto.mx/",
    custom_data:{
      ...(Number.isFinite(value)&&value>=0?{value:value/100}:{}),
      ...(currency?{currency}:{}),
      content_type:subscription?"subscription":"product",
      order_id:session.id,
    },
  },{id:userId});
  return{sent:true,...await sendEvent(metaEvent)};
}

module.exports=async function handler(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.SUPABASE_SERVICE_ROLE_KEY||(!process.env.STRIPE_PRICE_ID_MONTHLY&&!process.env.STRIPE_PRICE_ID_ANNUAL&&!process.env.STRIPE_PRICE_ID))return res.status(503).json({error:"Billing no está configurado."});
  try{
    const raw=await rawBody(req);
    if(!verifyStripeSignature(raw,req.headers?.["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET))return res.status(400).json({error:"Firma inválida"});
    const event=JSON.parse(raw.toString("utf8"));
    if(!event?.id||!event?.type||!event?.data?.object)return res.status(400).json({error:"Evento inválido"});
    if(event.type==="checkout.session.completed"){
      const checkoutSession=event.data.object;
      const userId=await userForEvent(checkoutSession);
      if(!userId)return res.status(200).json({received:true,ignored:true,reason:"unmapped_customer"});
      try{
        const meta=await sendCheckoutMetaEvent(event,checkoutSession,userId);
        return res.status(200).json({received:true,meta});
      }catch(error){
        // Meta no debe hacer fallar la confirmación de Stripe; el event_id de Stripe
        // permite reintentar la medición sin duplicar la conversión.
        console.error("Ruleto Meta purchase event error",error?.metaCode||error?.message||error);
        return res.status(200).json({received:true,meta:{sent:false,error:"delivery_failed"}});
      }
    }
    if(!["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type))return res.status(200).json({received:true,ignored:true});
    const subscription=event.data.object;
    const userId=await userForEvent(subscription);
    if(!userId)return res.status(200).json({received:true,ignored:true,reason:"unmapped_customer"});
    const priceId=subscription.items?.data?.[0]?.price?.id||null;
    const validPrices=[process.env.STRIPE_PRICE_ID_MONTHLY,process.env.STRIPE_PRICE_ID_ANNUAL,process.env.STRIPE_PRICE_ID].filter(Boolean);
    const active=validPrices.includes(priceId)&&["active","trialing"].includes(subscription.status);
    const periodEndUnix=subscription.current_period_end??subscription.items?.data?.[0]?.current_period_end??null;
    const cancelAt=Number(subscription.cancel_at)||null;
    const cancelling=Boolean(subscription.cancel_at_period_end)||Boolean(cancelAt);
    const endUnix=cancelAt&&(!periodEndUnix||cancelAt<periodEndUnix)?cancelAt:periodEndUnix;
    await adminRequest("rpc/apply_stripe_subscription_event",{method:"POST",body:{
      p_event_id:event.id,p_event_type:event.type,p_event_created:Number(event.created)||0,p_user_id:userId,
      p_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer?.id,
      p_subscription_id:subscription.id,p_status:subscription.status,p_price_id:priceId,
      p_current_period_end:endUnix?new Date(endUnix*1000).toISOString():null,
      p_cancel_at_period_end:cancelling,p_entitled:active,p_payload:event,
    }});
    return res.status(200).json({received:true});
  }catch(error){console.error("Ruleto Stripe webhook error",error?.message||error,error?.detail?JSON.stringify(error.detail):"");return res.status(500).json({error:"No se pudo procesar el webhook"});}
};

module.exports.config={api:{bodyParser:false}};
module.exports.userForEvent=userForEvent;
module.exports.sendCheckoutMetaEvent=sendCheckoutMetaEvent;
