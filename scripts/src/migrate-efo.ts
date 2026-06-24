import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function migrate() {
  const sql1 = `
    create table if not exists efo_access_cv (
      id serial primary key,
      date text not null,
      ad_code text not null,
      profile_name text not null,
      access_count integer not null default 0,
      cv_count integer not null default 0,
      synced_at text,
      unique (date, ad_code, profile_name)
    );
  `;

  const sql2 = `
    create table if not exists efo_exit_scenarios (
      id serial primary key,
      date text not null,
      profile_name text not null,
      ad_code text not null,
      exit_scenario text not null,
      session_count integer not null default 0,
      synced_at text,
      unique (date, profile_name, ad_code, exit_scenario)
    );
  `;

  const { error: e1 } = await supabase.rpc("exec_sql", { sql: sql1 }).maybeSingle();
  if (e1) {
    console.error("efo_access_cv migration error:", e1);
  } else {
    console.log("efo_access_cv: OK");
  }

  const { error: e2 } = await supabase.rpc("exec_sql", { sql: sql2 }).maybeSingle();
  if (e2) {
    console.error("efo_exit_scenarios migration error:", e2);
  } else {
    console.log("efo_exit_scenarios: OK");
  }
}

migrate().catch(console.error);
