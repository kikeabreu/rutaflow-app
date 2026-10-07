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

// GET only displays confirmation: link scanners must not unsubscribe recipients.
const getNodes=[
  node('Abrir preferencias','n8n-nodes-base.webhook',{path:'ruleto-email-preferences',httpMethod:'GET',responseMode:'responseNode',options:{}},0),
  code('Formulario de baja',`const token=String($input.first().json.query?.token||'');\nif(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token))return [{json:{html:'<p>Enlace inválido.</p>'}}];\nreturn [{json:{html:'<!doctype html><html lang="es"><meta charset="utf-8"><title>Ruleto Drive</title><body><h1>Preferencias de correo de Ruleto Drive</h1><form method="post" action="https://356082.appsneubox.com/webhook/ruleto-email-preferences"><input type="hidden" name="token" value="'+token+'"><button type="submit">Dejar de recibir correos de acompañamiento</button></form></body></html>'}}];`,240),
  node('Mostrar formulario','n8n-nodes-base.respondToWebhook',{respondWith:'text',responseBody:'={{ $json.html }}',options:{responseHeaders:{entries:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'},{name:'Referrer-Policy',value:'no-referrer'}]}}},480),
  node('Confirmar baja','n8n-nodes-base.webhook',{path:'ruleto-email-preferences',httpMethod:'POST',responseMode:'responseNode',options:{}},0,300),
  code('Configuración',`return [{json:${JSON.stringify(config)}}];`,240,300),
  code('Validar token',"const token=String($('Confirmar baja').first().json.body?.token||''); if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(token))throw new Error('Enlace inválido'); if($('Configuración').first().json.supabaseUrl.includes('REPLACE_'))throw new Error('Configura Supabase'); return [{json:{token}}];",480,300),
  http('Dar de baja','unsubscribe_lifecycle_email',"={{ JSON.stringify({p_token:$json.token}) }}",720),
  node('Confirmación','n8n-nodes-base.respondToWebhook',{respondWith:'text',responseBody:'<!doctype html><html lang="es"><meta charset="utf-8"><h1>Ruleto Drive</h1><p>Tu solicitud de baja fue procesada. Los correos de acceso y seguridad de tu cuenta no cambian.</p></html>',options:{responseHeaders:{entries:[{name:'Content-Type',value:'text/html; charset=utf-8'},{name:'Cache-Control',value:'no-store'}]}}},960,300),
];
getNodes[6].position[1]=300;
const gc={};link(gc,'Abrir preferencias','Formulario de baja');link(gc,'Formulario de baja','Mostrar formulario');link(gc,'Confirmar baja','Configuración');link(gc,'Configuración','Validar token');link(gc,'Validar token','Dar de baja');link(gc,'Dar de baja','Confirmación');
fs.writeFileSync(path.join(__dirname,'ruleto-email-preferences.json'),JSON.stringify(workflow('Ruleto Drive — baja de correos',getNodes,gc),null,2)+'\n');
