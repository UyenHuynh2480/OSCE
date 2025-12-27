
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

export async function POST(req: Request) {
  try {
    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) {
      return NextResponse.json({ ok: false, error: 'Thiếu user_id hoặc new_password' }, { status: 400 });
    }

    // 1) Đổi mật khẩu qua Admin API
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // 2) Ghi dấu mốc vào profiles
    const { error: e2 } = await supabaseAdmin
      .from('profiles')
      .update({ password_last_admin_set_at: new Date().toISOString() })
      .eq('user_id', user_id);
    if (e2) return NextResponse.json({ ok: true, warn: e2.message });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Lỗi không xác định' }, { status: 500 });
  }
}
