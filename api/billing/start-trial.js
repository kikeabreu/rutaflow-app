const{adminRequest,allowAppOrigin,authenticate}=require("./_shared.cjs");

module.exports=async function handler(req,res){
  allowAppOrigin(req,res);
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Método no permitido"});}
  try{
    if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Object.assign(new Error("Billing no configurado"),{statusCode:503});

    // Accept either Bearer token OR direct userId (from app at signup)
    let userId;
    const user=await authenticate(req);
    if(user){
      userId=user.id;
    }else{
      userId=String(req.body?.user_id||"").trim();
      if(!userId)throw Object.assign(new Error("Sesión no válida."),{statusCode:401});
    }

    const deviceId=String(req.body?.device_id||"").trim();

    // Check if this user already used their trial
    const profile=await adminRequest("profiles",{query:`?id=eq.${encodeURIComponent(userId)}&select=plan,pro_until&limit=1`});
    if(profile?.length){
      const p=profile[0];
      if(p.plan==="trialing"||p.plan==="pro"){
        return res.status(400).json({error:"Este usuario ya tiene acceso a Pro o usó su prueba."});
      }
    }

    // If deviceId provided, check if it already used a trial (anti-abuse by phone)
    if(deviceId){
      const deviceRows=await adminRequest("trial_devices",{query:`?device_id=eq.${encodeURIComponent(deviceId)}&select=user_id&limit=1`});
      if(deviceRows?.length){
        return res.status(400).json({error:"Este dispositivo ya utilizó su prueba de 14 días."});
      }
    }

    // Set trial: 14 days from now
    const now=new Date();
    const trialEndTime=new Date(now.getTime()+14*24*60*60*1000).toISOString();

    // Update profile
    await adminRequest("profiles",{method:"PATCH",body:{plan:"trialing",subscription_status:"trialing",pro_until:trialEndTime},query:`?id=eq.${encodeURIComponent(userId)}`});

    // Record device if provided
    if(deviceId){
      await adminRequest("trial_devices",{method:"POST",body:{device_id:deviceId,user_id:userId,started_at:now.toISOString()}}).catch(()=>{});
    }

    return res.status(200).json({success:true,trial_ends:trialEndTime});
  }catch(error){
    const status=error?.statusCode||500;
    if(status>=500)console.error("Ruleto trial error",error?.message||error);
    return res.status(status).json({error:status===503?"Billing no está configurado.":error?.message||"No se pudo iniciar el trial."});
  }
};
