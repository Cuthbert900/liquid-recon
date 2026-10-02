import 'server-only';

// Resolves a provider's API key: an /admin/environment-managed key in
// Supabase first, then the provider's own env var, matching the order
// EnvironmentPageClient shows in the UI ("Configured" vs "Using env
// var"). Kept out of providers.ts on purpose — that file's PROVIDERS
// metadata (ProviderId, TokenUsage, etc.) is imported by several client
// components for display purposes, and importing Supabase's
// service-role client there would pull server-only code into the
// browser bundle.

import { getProviderMeta, type ProviderId } from '@/lib/ai/providers';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createAdminClient } from '@/lib/supabase/admin';

export async function resolveProviderApiKey(
  id: ProviderId
): Promise<string | undefined> {
  if (isSupabaseConfigured()) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('provider_keys')
        .select('key_value')
        .eq('provider_id', id)
        .maybeSingle();
      if (data?.key_value) return data.key_value;
    } catch (err) {
      // A misconfigured or unreachable Supabase instance shouldn't take
      // the AI Assistant down with it — fall through to the env var.
      console.error(`[key-resolution] Supabase lookup failed for ${id}:`, err);
    }
  }

  const meta = getProviderMeta(id);
  return process.env[meta.envKey];
}
