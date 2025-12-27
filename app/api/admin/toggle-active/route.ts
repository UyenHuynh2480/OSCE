
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

/**
 * POST /api/admin/toggle-active
 * Body: { user_id: string, active: boolean, ban_hours?: number }
 * - active=true  -> unban ('none'), rồi set is_active=true
 * - active=false -> ban N giờ (mặc định 720h = 30 ngày), rồi set is_active=false
 *
 * Lưu ý: GoTrue chỉ chấp nhận các đơn vị ns/us/ms/s/m/h. Không hỗ trợ 'y' (year).
 */
export async function POST(req: Request) {
  try {
    const { user_id, active, ban_hours } = await req.json();

    if (!user_id || typeof active !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'Thiếu user_id hoặc active (boolean)' },
        { status: 400 }
      );
    }

    // 1) Ban/Unban trước
    if (active) {
      // Unban
      const { error: eBan } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: 'none',
      });
      if (eBan) {
        return NextResponse.json({ ok: false, error: eBan.message }, { status: 400 });
      }
    } else {
      // Ban theo giờ (mặc định 720h = 30 ngày)
      const hours = typeof ban_hours === 'number' && ban_hours > 0 ? ban_hours : 720;
      const { error: eBan } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        ban_duration: `${hours}h`,
      });
      if (eBan) {
        return NextResponse.json({ ok: false, error: eBan.message }, { status: 400 });
      }
    }

    // 2) Cập nhật is_active sau khi ban/unban đã OK
    const { error: eFlag } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: active })
      .eq('user_id', user_id);
    if (eFlag) {
      // Trong trường hợp hiếm, nếu cờ UI cập nhật lỗi, trả về cảnh báo
      return NextResponse.json({ ok: true, warn: eFlag.message });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Lỗi không xác định' },
      { status: 500 }
    );
  }
}
