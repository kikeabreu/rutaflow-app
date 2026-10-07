'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {renderEmail} = require('./lifecycle-email.cjs');
const config = {supabaseUrl:'https://REPLACE_PROJECT.supabase.co',appUrl:'https://app.ruleto.mx',unsubscribeUrl:'https://REPLACE_N8N_HOST/webhook/ruleto-email-preferences',sendEnabled:false};
let counter = 0;
const node = (name,type,parameters,x,y=0,extra={}) => ({id:`ruleto-${++counter}`,name,type,typeVersion:type==='n8n-nodes-base.httpRequest'?4.2:type==='n8n-nodes-base.code'?2:type==='n8n-nodes-base.if'?2.2:type==='n8n-nodes-base.emailSend'?2.1:type==='n8n-nodes-base.webhook'?2:1,position:[x,y],parameters,...extra});
const code = (name,js,x,y=0) => node(name,'n8n-nodes-base.code',{jsCode:js},x,y);
const http = (name,rpc,body,x) => node(name,'n8n-nodes-base.httpRequest',{
  method:'POST',url:`={{ $('Configuración').first().json.supabaseUrl + '/rest/v1/rpc/${rpc}' }}`,
  authentication:'genericCredentialType',genericAuthType:'httpCustomAuth',sendBody:true,specifyBody:'json',jsonBody:body,
  options:{timeout:15000},
},x);
const link=(connections,from,to,branch=0)=>{connections[from]??={main:[]};connections[from].main[branch]??=[];connections[from].main[branch].push({node:to,type:'main',index:0});};
const workflow = (name,nodes,connections) => ({name,nodes,connections,active:false,settings:{executionOrder:'v1',timezone:'America/Mexico_City',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},pinData:{},tags:[]});
const configure = code('Configuración',`const config = ${JSON.stringify(config)};\nif (Object.values(config).some(v => typeof v === 'string' && v.includes('REPLACE_'))) throw new Error('Completa Configuración antes de ejecutar');\nreturn [{json:config}];`,240);
const nodes=[
  node('Cada 10 minutos','n8n-nodes-base.scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:10}]}},0),
  configure,
  code('Envíos habilitados',"return $input.first().json.sendEnabled === true ? $input.all() : [];",480),
  http('Preparar campañas','enqueue_lifecycle_email','{}',720),
  http('Reservar un correo','claim_lifecycle_email','{}',960),
  code('Crear mensaje',`${renderEmail.toString()}\nconst data = $input.first().json;\nif (!data || !data.delivery_id) return [];\nreturn [{json:renderEmail(data,$('Configuración').first().json)}];`,1200),
  http('Revalidar permiso y plan','validate_lifecycle_email',"={{ JSON.stringify({p_delivery_id:$('Crear mensaje').first().json.delivery_id,p_email:$('Crear mensaje').first().json.email}) }}",1440),
  code('Resultado de validación',"return [{json:{ok:$input.first().json.ok === true}}];",1680),
  node('Puede enviar','n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:'allowed',leftValue:'={{ $json.ok }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}},1920),
  node('Enviar por Neubox','n8n-nodes-base.emailSend',{fromEmail:'Ruleto Drive <no-reply@ruleto.mx>',toEmail:"={{ $('Crear mensaje').first().json.email }}",subject:"={{ $('Crear mensaje').first().json.subject }}",emailFormat:'both',text:"={{ $('Crear mensaje').first().json.text }}",html:"={{ $('Crear mensaje').first().json.html }}",options:{appendAttribution:false}},2160,0),
  http('Registrar envío','finish_lifecycle_email',"={{ JSON.stringify({p_delivery_id:$('Crear mensaje').first().json.delivery_id,p_status:'sent'}) }}",2400),
  http('Cancelar envío','finish_lifecycle_email',"={{ JSON.stringify({p_delivery_id:$('Crear mensaje').first().json.delivery_id,p_status:'cancelled'}) }}",2160),
];
nodes[nodes.length-1].position[1]=220;
const connections={};
for(let i=0;i<8;i++)link(connections,nodes[i].name,nodes[i+1].name);
link(connections,'Puede enviar','Enviar por Neubox',0);link(connections,'Puede enviar','Cancelar envío',1);link(connections,'Enviar por Neubox','Registrar envío');
fs.writeFileSync(path.join(__dirname,'ruleto-lifecycle-email.json'),JSON.stringify(workflow('Ruleto Drive — acompañamiento del trial por correo',nodes,connections),null,2)+'\n');

// Páginas públicas de baja: HTML autocontenido (n8n aísla las respuestas HTML), mismo verde que los correos.
const APP_URL='https://app.ruleto.mx';
const pageHtml=(title,inner)=>'<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'
  +'*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f6f4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#172129}'
  +'.card{background:#fff;width:calc(100% - 32px);max-width:440px;padding:36px 28px 28px;border-radius:16px;box-shadow:0 8px 30px rgba(20,107,80,.12);text-align:center}'
  +'.logo{height:34px;margin:0 auto 22px;display:block}h1{font-size:22px;line-height:1.25;margin:0 0 10px}p{color:#4b5a63;line-height:1.55;margin:0 0 22px;font-size:15px}'
  +'.btn{display:block;width:100%;background:#146b50;color:#fff;border:0;border-radius:10px;padding:14px 18px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none}.btn:hover{background:#0f5a42}'
  +'.link{display:inline-block;margin-top:16px;color:#146b50;font-size:14px;text-decoration:none}.note{font-size:12px;color:#7a878f;margin:20px 0 0;line-height:1.5}'
  +'.ok{width:56px;height:56px;border-radius:50%;background:#e3f4ec;color:#146b50;font-size:30px;line-height:56px;margin:0 auto 16px}'
  +'</style></head><body><main class="card"><img class="logo" src="'+APP_URL+'/brand/ruleto-logo-dark.png" alt="Ruleto Drive">'+inner+'</main></body></html>';
const FORM_ACTION='https://356082.appsneubox.com/webhook/ruleto-email-preferences';
const formBefore=pageHtml('Ruleto Drive · Preferencias de correo','<h1>¿Dejar de recibir nuestros correos?</h1><p>Te enviamos consejos para aprovechar Ruleto Drive Pro, recordatorios de tu prueba y novedades. Si ya no los quieres, puedes darte de baja aquí.</p><form method="post" action="'+FORM_ACTION+'"><input type="hidden" name="token" value="__TOKEN__"><button class="btn" type="submit">Sí, dejar de recibirlos</button></form><a class="link" href="'+APP_URL+'">No, volver a Ruleto Drive</a><p class="note">Los correos de acceso y seguridad de tu cuenta no cambian, y tu plan tampoco.</p>');
const invalidPage=pageHtml('Ruleto Drive · Enlace no válido','<h1>Este enlace no es válido</h1><p>Puede que esté incompleto o vencido. Abre Ruleto Drive y desactiva los correos desde Configuración.</p><a class="btn" href="'+APP_URL+'">Ir a Ruleto Drive</a>');
const doneHtml=pageHtml('Ruleto Drive · Baja procesada','<div class="ok">✓</div><h1>Listo, ya no recibirás estos correos</h1><p>Tu solicitud de baja fue procesada. Si cambias de opinión, puedes volver a activarlos en Configuración dentro de la app.</p><a class="btn" href="'+APP_URL+'">Ir a Ruleto Drive</a><p class="note">Los correos de acceso y seguridad de tu cuenta no cambian.</p>');
// GET only displays confirmation: link scanners must not unsubscribe recipients.
const getNodes=[
  node('Abrir preferencias','n8n-nodes-base.webhook',{path:'ruleto-email-preferences',httpMethod:'GET',responseMode:'responseNode',options:{}},0),
  code('Formulario de baja',`const token=String($input.first().json.query?.token||'');\nif(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token))return [{json:{html:${JSON.stringify(invalidPage)}}}];\nreturn [{json:{html:${JSON.stringify(formBefore)}.replace('__TOKEN__',token)}}];`,240),
  node('Mostrar formulario','n8n-nodes-base.respondToWebhook',{respondWith:'text',responseBody:'={{ $json.html }}',options:{responseHeaders:{entries:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'},{name:'Referrer-Policy',value:'no-referrer'}]}}},480),
  node('Confirmar baja','n8n-nodes-base.webhook',{path:'ruleto-email-preferences',httpMethod:'POST',responseMode:'responseNode',options:{}},0,300),
  code('Configuración',`return [{json:${JSON.stringify(config)}}];`,240,300),
  code('Validar token',"const token=String($('Confirmar baja').first().json.body?.token||''); if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token))throw new Error('Enlace inválido'); if($('Configuración').first().json.supabaseUrl.includes('REPLACE_'))throw new Error('Configura Supabase'); return [{json:{token}}];",480,300),
  http('Dar de baja','unsubscribe_lifecycle_email',"={{ JSON.stringify({p_token:$json.token}) }}",720),
  node('Confirmación','n8n-nodes-base.respondToWebhook',{respondWith:'text',responseBody:doneHtml,options:{responseHeaders:{entries:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'}]}}},960,300),
];
getNodes[6].position[1]=300;
const gc={};link(gc,'Abrir preferencias','Formulario de baja');link(gc,'Formulario de baja','Mostrar formulario');link(gc,'Confirmar baja','Configuración');link(gc,'Configuración','Validar token');link(gc,'Validar token','Dar de baja');link(gc,'Dar de baja','Confirmación');
fs.writeFileSync(path.join(__dirname,'ruleto-email-preferences.json'),JSON.stringify(workflow('Ruleto Drive — baja de correos',getNodes,gc),null,2)+'\n');
