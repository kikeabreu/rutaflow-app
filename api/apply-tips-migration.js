const{Client}=require("pg");
const TOKEN="59d969f97a97d5544e25c0f99ced387defa29a3da2715bb9c1c0db73b25fd682";

module.exports=async function handler(req,res){
  if(req.method!=="POST"||req.headers.authorization!==`Bearer ${TOKEN}`)return res.status(404).json({error:"Not found"});
  const raw=process.env.POSTGRES_URL_NON_POOLING||process.env.POSTGRES_URL;
  if(!raw)return res.status(503).json({error:"Database unavailable"});
  const url=new URL(raw);url.searchParams.delete("sslmode");url.searchParams.delete("sslrootcert");
  const client=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false}});
  try{
    await client.connect();
    await client.query("begin");
    await client.query("alter table public.operational_events add column if not exists platform text not null default ''");
    await client.query("alter table public.operational_events drop constraint if exists operational_events_type_check");
    await client.query("alter table public.operational_events add constraint operational_events_type_check check (type in ('dead_km', 'refuel', 'tank_checkpoint', 'tip'))");
    const result=await client.query("select exists (select 1 from information_schema.columns where table_schema='public' and table_name='operational_events' and column_name='platform') as has_platform");
    await client.query("commit");
    return res.status(200).json({ok:result.rows[0].has_platform});
  }catch(error){await client.query("rollback").catch(()=>{});return res.status(500).json({error:error.message});}
  finally{await client.end().catch(()=>{});}
};
