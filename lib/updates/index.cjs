const fs=require('node:fs');
const path=require('node:path');
const {cors,db,reply}=require('./_shared.cjs');

function androidManifestRelease(){
  try{
    const file=path.join(__dirname,'..','..','public','android-release.json');
    const release=JSON.parse(fs.readFileSync(file,'utf8'));
    if(release?.platform==='android'&&Number.isSafeInteger(Number(release.build_number)))return{...release,id:'android-release-manifest',published_at:null};
  }catch{}
  return null;
}

module.exports=async(req,res)=>{if(cors(req,res))return;res.setHeader('Cache-Control','no-store, max-age=0');if(req.method!=='GET')return res.status(405).end();try{const platform=String(req.query?.platform||'');if(!['android','web'].includes(platform))return res.status(400).json({error:'Plataforma inválida'});const rows=await db('app_releases',{query:`?platform=eq.${platform}&status=eq.published&select=id,platform,version_label,build_number,minimum_build,notes,published_at&order=build_number.desc&limit=1`});let release=rows?.[0]||null;const manifest=platform==='android'?androidManifestRelease():null;if(manifest&&(!release||Number(manifest.build_number)>Number(release.build_number)))release=manifest;return res.status(200).json({release});}catch(e){if(String(req.query?.platform||'')==='android'){const manifest=androidManifestRelease();if(manifest)return res.status(200).json({release:manifest});}reply(res,e);}};
