import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/db/types";

/**
 * Client com SERVICE ROLE: IGNORA RLS.
 *
 * Uso permitido só em webhooks, jobs de sistema e criação inicial de tenant.
 * Todo chamador deve ter um comentário `// SERVICE_ROLE: <motivo>`.
 * Ver CLAUDE.md, seção "Multi-tenancy".
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
