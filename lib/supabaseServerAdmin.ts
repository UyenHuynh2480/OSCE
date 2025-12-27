
// lib/supabaseServerAdmin.ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,    // URL public
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // ⚠️ Service Role chỉ dùng ở server
  { auth: { persistSession: false } }
);
