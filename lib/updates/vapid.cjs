module.exports=(req,res)=>{res.setHeader('Cache-Control','public,max-age=3600');res.json({publicKey:process.env.WEB_PUSH_PUBLIC_KEY||null});};
