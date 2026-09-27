export const getPlanTier=(profile,now=Date.now())=>{
  if(!profile)return 'FREE';
  const plan=String(profile.plan||'').toLowerCase();
  const status=String(profile.subscription_status||'').toLowerCase();
  const until=profile.pro_until?new Date(profile.pro_until).getTime():0;
  if(plan==='trialing')return until>now?'TRIAL':'FREE';
  if(plan==='pro'||status==='active'||until>now)return 'PRO';
  return 'FREE';
};

export const isProProfile=(profile,now=Date.now())=>getPlanTier(profile,now)!=='FREE';
