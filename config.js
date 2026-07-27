// Replace these two values with your own Supabase project details.
// Use a publishable key (sb_publishable_...) or legacy anon key.
// Never use a secret key or service_role key in browser code.
const SUPABASE_URL = "https://fteeevnioarkhpcplsyq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yw-S8Fr5BRAWa_kRWD5QXQ_ejJPaoHZ";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
