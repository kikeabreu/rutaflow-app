import {getPlanTier,isProProfile} from './billingAccess';

const now=Date.parse('2026-09-27T12:00:00Z');
test('TRIAL becomes FREE exactly when its 14 days end',()=>{
  const profile={plan:'trialing',subscription_status:'trialing',pro_until:'2026-10-11T12:00:00Z'};
  expect(getPlanTier(profile,now)).toBe('TRIAL');
  expect(isProProfile(profile,now)).toBe(true);
  expect(getPlanTier(profile,Date.parse(profile.pro_until))).toBe('FREE');
  expect(isProProfile(profile,Date.parse(profile.pro_until))).toBe(false);
});
test('paid subscriptions keep PRO during a scheduled cancellation',()=>{
  const profile={plan:'pro',subscription_status:'active',cancel_at_period_end:true,pro_until:'2026-10-11T12:00:00Z'};
  expect(getPlanTier(profile,now)).toBe('PRO');
});
test('profiles without premium access show FREE',()=>{
  expect(getPlanTier(null,now)).toBe('FREE');
  expect(getPlanTier({plan:'free',subscription_status:'inactive'},now)).toBe('FREE');
});
