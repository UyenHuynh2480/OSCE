
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

/**
 * GET /api/admin/list-profiles
 * Trả về danh sách hồ sơ người dùng từ bảng `profiles`.
 * Dùng Service Role để bypass RLS (admin xem được tất cả).
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id, role, display_name, is_active, password_last_admin_set_at')
      .order('role', { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, profiles: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
