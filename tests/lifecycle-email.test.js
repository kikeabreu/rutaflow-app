const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {renderEmail}=require('../automations/n8n/lifecycle-email.cjs');
const cfg={appUrl:'https://app.ruleto.mx',unsubscribeUrl:'https://automation.example/webhook/ruleto-email-preferences'};
const data={name:'Ana',trips_count:12,trial_until:'2026-10-21T18:00:00Z',unsubscribe_token:'01234567-89ab-4cde-8fab-0123456789ab'};
test('all six campaigns render with one app link and a usable unsubscribe link',()=>{
  for(const campaign of ['welcome','activation','midpoint','ending','expired','return']){
    const result=renderEmail({...data,campaign},cfg);
    assert.ok(result.subject.length>10);
    assert.ok(result.text.includes(cfg.appUrl));
    assert.ok(result.text.includes('token='+data.unsubscribe_token));
    assert.ok(result.html.includes('Ruleto Drive'));
    assert.ok(!result.html.includes('RUTAFLOW'));
  }
});
test('user names cannot inject HTML',()=>{
  const result=renderEmail({...data,campaign:'midpoint',name:'<img src=x onerror=alert(1)>'},cfg);
  assert.ok(!result.html.includes('<img'));
  assert.ok(result.html.includes('&lt;img'));
});
test('midpoint adapts to real usage without invented financial results',()=>{
  assert.ok(renderEmail({...data,campaign:'midpoint'},cfg).text.includes('12 viajes'));
  assert.ok(renderEmail({...data,campaign:'midpoint',trips_count:0},cfg).text.includes('registra un viaje'));
  assert.ok(!renderEmail({...data,campaign:'midpoint'},cfg).text.includes('$'));
});
test('unsafe links, malformed tokens and missing trial dates fail closed',()=>{
  assert.throws(()=>renderEmail({...data,campaign:'welcome'},{...cfg,appUrl:'javascript:alert(1)'}));
  assert.throws(()=>renderEmail({...data,campaign:'welcome',unsubscribe_token:'" onmouseover="x'},cfg));
  assert.throws(()=>renderEmail({...data,campaign:'welcome',trial_until:'invalid'},cfg));
  assert.throws(()=>renderEmail({...data,campaign:'welcome',trips_count:-1},cfg));
});
test('generated workflows have resolvable connections, no enabled sender or secrets, and compile',()=>{
  for(const file of ['ruleto-lifecycle-email.json','ruleto-email-preferences.json']){
    const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../automations/n8n',file)));
    assert.equal(w.active,false);
    const names=new Set(w.nodes.map(n=>n.name));
    for(const [name,outputs] of Object.entries(w.connections)){
      assert.ok(names.has(name));
      for(const output of outputs.main)for(const target of output||[])assert.ok(names.has(target.node));
    }
    for(const n of w.nodes){
      assert.equal(n.retryOnFail,undefined);
      assert.equal(n.credentials,undefined);
      if(n.type==='n8n-nodes-base.code')new Function(n.parameters.jsCode);
    }
    assert.ok(w.nodes.find(n=>n.name==='Configuración').parameters.jsCode.includes('"sendEnabled":false'));
  }
});

test('SMTP uses the built-in emailSend node and unsubscribe form has an absolute action',()=>{
  const mail=JSON.parse(fs.readFileSync(path.join(__dirname,'../automations/n8n/ruleto-lifecycle-email.json')));
  assert.equal(mail.nodes.find(n=>n.name==='Enviar por Neubox').type,'n8n-nodes-base.emailSend');
  const prefs=JSON.parse(fs.readFileSync(path.join(__dirname,'../automations/n8n/ruleto-email-preferences.json')));
  const form=prefs.nodes.find(n=>n.name==='Formulario de baja');
  assert.match(form.parameters.jsCode,/<form method=\\?"post\\?" action=\\?"https:\/\//);
});
