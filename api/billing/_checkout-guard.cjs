const{stripeRequest}=require('./_shared.cjs');

// Use Stripe directly: webhook delivery can lag behind a completed payment.
async function checkoutGuard(customer,price){
  let after='';
  do{
    const query=new URLSearchParams({customer,status:'all',limit:'100',...(after?{starting_after:after}:{})});
    const page=await stripeRequest(`subscriptions?${query}`,{method:'GET'});
    if(!Array.isArray(page.data))throw new Error('No se pudieron verificar las suscripciones.');
    if(page.data.some(s=>!['canceled','incomplete_expired'].includes(s.status))){
      throw Object.assign(new Error('Ya tienes una suscripción vigente o un pago pendiente. Adminístrala desde Configuración; si cancelaste la renovación, espera a que termine tu período antes de comprar otra.'),{statusCode:409});
    }
    after=page.has_more?page.data.at(-1)?.id:'';
    if(page.has_more&&!after)throw new Error('Respuesta incompleta de Stripe.');
  }while(after);

  // Include completed/expired sessions to derive a stable generation key.
  // Concurrent requests with different client keys must not create two checkouts.
  let latest=null;
  after='';
  do{
    const query=new URLSearchParams({customer,limit:'100',...(after?{starting_after:after}:{})});
    const page=await stripeRequest(`checkout/sessions?${query}`,{method:'GET'});
    if(!Array.isArray(page.data))throw new Error('No se pudieron verificar los pagos pendientes.');
    for(const session of page.data){
      if(session.mode!=='subscription')continue;
      latest ||= session;
      if(session.status==='open'){
        if(session.metadata?.price_id!==price){
          throw Object.assign(new Error('Ya tienes un checkout abierto. Complétalo o espera a que venza antes de elegir otro plan.'),{statusCode:409});
        }
        if(!session.url)throw new Error('El checkout pendiente no tiene enlace.');
        return{url:session.url};
      }
    }
    after=page.has_more?page.data.at(-1)?.id:'';
    if(page.has_more&&!after)throw new Error('Respuesta incompleta de Stripe.');
  }while(after);
  return{idempotencyKey:`ruleto-checkout-${customer}-${latest?.id||'initial'}`};
}
module.exports={checkoutGuard};
