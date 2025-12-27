
// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// Client cho phía trình duyệt (use client).
// v2.89.0: KHÔNG truyền cookieOptions ở cấp root.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
