const test=require('node:test');
const assert=require('node:assert/strict');
const{checkoutGuard}=require('../api/billing/_checkout-guard.cjs');
async function withStripe(pages,run){
  const original=global.fetch;const calls=[];process.env.STRIPE_SECRET_KEY='sk_test';
  global.fetch=async(url,options)=>{calls.push({url:String(url),options});const page=pages.shift();assert.ok(page,'unexpected request');return{ok:true,json:async()=>page};};
  try{await run(calls);}finally{global.fetch=original;}
}
for(const status of ['active','trialing','past_due','unpaid','incomplete','paused']){
  test(`blocks ${status} subscriptions, including scheduled cancellations`,async()=>{
    await withStripe([{data:[{id:'sub_1',status,cancel_at_period_end:true}],has_more:false}],async calls=>{
      await assert.rejects(checkoutGuard('cus_1','price_1'),e=>e.statusCode===409);
      assert.equal(calls.length,1);
    });
  });
}
test('checks later pages after ended subscriptions',async()=>{
  await withStripe([{data:[{id:'sub_old',status:'canceled'}],has_more:true},{data:[{id:'sub_live',status:'active'}],has_more:false}],async calls=>{
    await assert.rejects(checkoutGuard('cus_1','price_1'),e=>e.statusCode===409);
    assert.match(calls[1].url,/starting_after=sub_old/);
  });
});
test('reuses open checkout for the same price',async()=>{
  await withStripe([{data:[]},{data:[{mode:'subscription',status:'open',url:'https://checkout.stripe.com/existing',metadata:{price_id:'price_1'}}]}],async()=>{
    assert.deepEqual(await checkoutGuard('cus_1','price_1'),{url:'https://checkout.stripe.com/existing'});
  });
});
test('blocks another plan while checkout is open',async()=>{
  await withStripe([{data:[]},{data:[{mode:'subscription',status:'open',metadata:{price_id:'price_2'}}]}],async()=>{
    await assert.rejects(checkoutGuard('cus_1','price_1'),e=>e.statusCode===409);
  });
});
test('concurrent first checkouts use the same server idempotency key across prices',async()=>{
  await withStripe([{data:[]},{data:[]},{data:[]},{data:[]}],async()=>{
    const a=await checkoutGuard('cus_1','price_1');
    const b=await checkoutGuard('cus_1','price_2');
    assert.equal(a.idempotencyKey,b.idempotencyKey);
  });
});
test('an expired checkout permits a new generation',async()=>{
  await withStripe([{data:[{status:'incomplete_expired'}]},{data:[{id:'cs_old',mode:'subscription',status:'expired'}]}],async()=>{
    assert.equal((await checkoutGuard('cus_1','price_1')).idempotencyKey,'ruleto-checkout-cus_1-cs_old');
  });
});
test('fails closed when Stripe does not return a list',async()=>{
  await withStripe([{}],async()=>{await assert.rejects(checkoutGuard('cus_1','price_1'));});
});
