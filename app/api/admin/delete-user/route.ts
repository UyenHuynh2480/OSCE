
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

/**
 * DELETE /api/admin/delete-user
 * Body: { user_id: string }
 *
 * Hành vi:
 * 1) Xóa user khỏi Supabase Auth (hard delete).
 * 2) Xóa bản ghi liên quan ở public.profiles.
 * 3) Xóa scope tại public.station_account_scopes (nếu có).
 *
 * Nếu muốn soft delete, dùng shouldSoftDelete=true (nhưng GoTrue không luôn expose),
 * hoặc chỉ set is_active=false và ban_duration dài.
 */
export async function DELETE(req: Request) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: 'Thiếu user_id' },
        { status: 400 }
      );
    }

    // 1) Xóa user khỏi Auth (hard delete)
    const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(user_id /*, true*/);
    if (delAuthErr) {
      return NextResponse.json({ ok: false, error: delAuthErr.message }, { status: 400 });
    }

    // 2) Xóa profiles
    const { error: delProfileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', user_id);
    if (delProfileErr) {
      // Không fail toàn bộ nếu lỗi xóa phụ; trả cảnh báo
      return NextResponse.json({ ok: true, warn: delProfileErr.message });
    }

    // 3) Xóa scopes (nếu có)
    const { error: delScopeErr } = await supabaseAdmin
      .from('station_account_scopes')
      .delete()
      .eq('user_id', user_id);
    if (delScopeErr) {
      return NextResponse.json({ ok: true, warn: delScopeErr.message });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Lỗi không xác định' },
      { status: 500 }
    );
  }
}
