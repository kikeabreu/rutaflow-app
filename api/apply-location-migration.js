const{Client}=require("pg");

const TOKEN="f83202ca5ff6994d6e68c0e540d23a14d3f556348b16b9886c660d002ca7f80e";
const SQL=`
create extension if not exists pgcrypto;
create table if not exists public.location_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('shift_start', 'trip_start', 'trip_end', 'shift_end')),
  trip_id text,
  day_id text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  zone text not null default '',
  city text not null default '',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists location_checkpoints_user_time_idx on public.location_checkpoints (user_id, captured_at desc);
create index if not exists location_checkpoints_trip_idx on public.location_checkpoints (user_id, trip_id);
alter table public.location_checkpoints enable row level security;
drop policy if exists "Users read own location checkpoints" on public.location_checkpoints;
create policy "Users read own location checkpoints" on public.location_checkpoints for select using (auth.uid() = user_id);
drop policy if exists "Users insert own location checkpoints" on public.location_checkpoints;
create policy "Users insert own location checkpoints" on public.location_checkpoints for insert with check (auth.uid() = user_id);
drop policy if exists "Users delete own location checkpoints" on public.location_checkpoints;
create policy "Users delete own location checkpoints" on public.location_checkpoints for delete using (auth.uid() = user_id);
`;

module.exports=async function handler(req,res){
  if(req.method!=="POST"||req.headers.authorization!==`Bearer ${TOKEN}`)return res.status(404).json({error:"Not found"});
  const connectionString=process.env.POSTGRES_URL_NON_POOLING||process.env.POSTGRES_URL;
  if(!connectionString)return res.status(503).json({error:"Database unavailable"});
  const connectionUrl=new URL(connectionString);
  connectionUrl.searchParams.delete("sslmode");
  connectionUrl.searchParams.delete("sslrootcert");
  const client=new Client({connectionString:connectionUrl.toString(),ssl:{rejectUnauthorized:false}});
  try{
    await client.connect();
    await client.query("begin");
    await client.query(SQL);
    const result=await client.query("select to_regclass('public.location_checkpoints') as table_name");
    await client.query("commit");
    return res.status(200).json({ok:result.rows[0].table_name==="location_checkpoints"});
  }catch(error){
    await client.query("rollback").catch(()=>{});
    return res.status(500).json({error:error.message});
  }finally{await client.end().catch(()=>{});}
};
