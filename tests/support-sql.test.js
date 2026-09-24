const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const sql=fs.readFileSync(path.join(__dirname,"../supabase/migrations/202609230005_support.sql"),"utf8");

test("support tables enable RLS and grant nothing to anonymous users",()=>{
  for(const table of ["support_tickets","support_messages","support_suggestions"]){
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,`i`));
  }
  assert.match(sql,/revoke all on public\.support_tickets, public\.support_messages, public\.support_suggestions from anon/i);
});

test("customer writes are bound to auth uid and cannot impersonate support",()=>{
  assert.match(sql,/ticket_owner_create[\s\S]*user_id=auth\.uid\(\)[\s\S]*status='open'/i);
  assert.match(sql,/message_owner_create[\s\S]*author_id=auth\.uid\(\) and author_kind='user'/i);
  assert.match(sql,/suggestion_owner_create[\s\S]*user_id=auth\.uid\(\) and status='submitted'/i);
});

test("support privilege comes from server-managed app metadata",()=>{
  assert.match(sql,/auth\.jwt\(\) -> 'app_metadata' ->> 'support_role'/i);
  assert.doesNotMatch(sql,/user_metadata[\s\S]*support_role/i);
  assert.match(sql,/in \('agent','admin'\)/i);
});
