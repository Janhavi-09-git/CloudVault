import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

export const supabase = createClient(config.supabaseUrl || "http://localhost", config.supabaseServiceRoleKey || "not-configured", {
  auth: { autoRefreshToken: false, persistSession: false },
});
