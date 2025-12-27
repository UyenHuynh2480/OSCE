
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

/**
 * Tạo tài khoản mới:
 *  - Tạo user trong Supabase Auth
 *  - Upsert vào `profiles`
 *  - Nếu role = 'grader' -> lưu scope vào `station_account_scopes`
 *    BẮT BUỘC: chain_id, station_id (map từ station_code nếu cần)
 *    TÙY CHỌN: level_id (nullable)
 *    KHÔNG DÙNG: exam_round_id khi tạo account (bỏ qua)
 */
export async function POST(req: Request) {
  try {
    const {
      email,
      password,
      role,
      grader_id,
      display_name,

      chain_id,        // REQUIRED
      level_id,        // optional (nullable)
      station_code,    // A–F (optional nếu chưa có station_id)
      station_id,      // REQUIRED (hoặc map từ station_code)

      // exam_round_id intentionally ignored at account creation
    } = await req.json();

    // ===== Validate cơ bản =====
    if (!email || !password || !role) {
      return NextResponse.json(
        { ok: false, error: 'Thiếu email/password/role' },
        { status: 400 }
      );
    }

    const validRoles = ['admin', 'grader', 'uploader', 'assigner', 'score_viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { ok: false, error: 'Role không hợp lệ' },
        { status: 400 }
      );
    }

    // ===== 1) Tạo user =====
    const { data: createData, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr) {
      return NextResponse.json({ ok: false, error: createErr.message }, { status: 400 });
    }
    const userId = createData.user?.id;
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Không lấy được user id' }, { status: 500 });
    }

    // ===== 2) Upsert profiles =====
    {
      const { error: upsertProfileErr } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            role,
            grader_id: grader_id ?? null,
            display_name: display_name ?? email,
            is_active: true,
          },
          { onConflict: 'user_id' }
        );
      if (upsertProfileErr) {
        return NextResponse.json({ ok: false, error: upsertProfileErr.message }, { status: 400 });
      }
    }

    // ===== 3) Lưu scope cho grader (KHÔNG xếp đợt thi) =====
    if (role === 'grader') {
      // BẮT BUỘC: chain_id
      if (!chain_id) {
        return NextResponse.json(
          { ok: false, error: 'Thiếu chain_id (Chuỗi bắt buộc).' },
          { status: 400 }
        );
      }

      // Map station_code (A–F) -> station_id nếu chưa có
      let stationIdFinal: string | null = station_id ?? null;
      if (!stationIdFinal && station_code) {
        const { data: sData, error: sErr } = await supabaseAdmin
          .from('stations')
          .select('id')
          .eq('name', String(station_code).toUpperCase())
          .limit(1)
          .maybeSingle();
        if (sErr) {
          return NextResponse.json(
            { ok: false, error: 'Lỗi tra cứu trạm: ' + sErr.message },
            { status: 400 }
          );
        }
        stationIdFinal = sData?.id ?? null;
      }

      // BẮT BUỘC: station_id
      if (!stationIdFinal) {
        return NextResponse.json(
          { ok: false, error: 'Thiếu station_id (Trạm bắt buộc). Vui lòng chọn trạm hoặc seed A–F trong bảng stations.' },
          { status: 400 }
        );
      }

      // Payload chỉ với các khóa cần thiết; KHÔNG thêm exam_round_id
      const scopePayload: Record<string, any> = {
        user_id: userId,
        chain_id,
        station_id: stationIdFinal,
      };
      if (level_id != null && level_id !== '') scopePayload.level_id = level_id;
      if (station_code != null && station_code !== '') scopePayload.station_code = station_code;

      // Upsert theo user_id hoặc theo (user_id, station_id) tuỳ ý
      const { error: upsertScopeErr } = await supabaseAdmin
        .from('station_account_scopes')
        .upsert(scopePayload, { onConflict: 'user_id' }); // hoặc onConflict: 'user_id, station_id'

      if (upsertScopeErr) {
        return NextResponse.json({ ok: false, error: upsertScopeErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, user_id: userId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Lỗi không xác định' },
      { status: 500 }
    );
  }
}
