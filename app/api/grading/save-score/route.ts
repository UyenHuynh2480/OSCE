
// app/api/grading/save-score/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

type GlobalRating = 'Fail' | 'Pass' | 'Good' | 'Excellent';

function getCookieValueFromRequest(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  const pairs = header.split(';').map((s) => s.trim()).filter(Boolean);
  for (const p of pairs) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    const k = p.slice(0, eq);
    if (k === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return undefined;
}

export async function POST(req: Request) {
  try {
    // ✅ Kiểm tra env: service role key phải có (chỉ check, không đổi logic)
    const hasSrvKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!hasSrvKey) {
      // Nếu thiếu key server role, mọi truy vấn bằng supabaseAdmin sẽ bị RLS chặn
      return NextResponse.json(
        { ok: false, error: 'Thiếu SUPABASE_SERVICE_ROLE_KEY trên server' },
        { status: 500 }
      );
    }

    const payload = await req.json();
    const {
      exam_session_id,
      station_id,
      level_id,
      cohort_id,
      exam_round_id,
      student_id,
      grader_id,
      item_scores,
      total_score,
      comment,
      global_rating,
    } = payload;

    // Validate bắt buộc (giữ nguyên ý nghĩa hiện có)
    for (const [k, v] of Object.entries({
      exam_session_id,
      station_id,
      level_id,
      cohort_id,
      exam_round_id,
      student_id,
      grader_id,
      total_score,
      global_rating,
    })) {
      if (v === undefined || v === null || v === '') {
        return NextResponse.json({ ok: false, error: `Thiếu trường: ${k}` }, { status: 400 });
      }
    }

    // Lấy session từ cookie (SSR)
    const supabaseSSR = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return getCookieValueFromRequest(req, name);
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { session } } = await supabaseSSR.auth.getSession();
    if (!session) return NextResponse.json({ ok: false, error: 'Chưa đăng nhập' }, { status: 401 });

    // Lấy role/grader_id từ profiles
    const { data: pf, error: pfErr } = await supabaseAdmin
      .from('profiles')
      .select('role, grader_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (pfErr) {
      // Trường hợp supabaseAdmin không phải service role hoặc RLS/policy chặn
      return NextResponse.json(
        { ok: false, error: `Lỗi truy vấn profiles: ${pfErr.message}` },
        { status: 500 }
      );
    }
    const role = pf?.role ?? null;
    const myGraderId = pf?.grader_id ?? null;

    if (!['admin', 'grader'].includes(role ?? '')) {
      // Giữ nguyên logic "Không có quyền", nhưng trả đúng tình huống
      return NextResponse.json({ ok: false, error: 'Không có quyền' }, { status: 403 });
    }

    // Với grader: kiểm tra ràng buộc grader_id theo profile (nếu có)
    if (role === 'grader') {
      if (myGraderId && myGraderId !== grader_id) {
        return NextResponse.json({ ok: false, error: 'Sai grader_id so với profile' }, { status: 403 });
      }
      if (!myGraderId) {
        const { data: graderRow, error: graderErr } = await supabaseAdmin
          .from('graders')
          .select('id')
          .eq('id', grader_id)
          .maybeSingle();
        if (graderErr) {
          return NextResponse.json(
            { ok: false, error: 'Lỗi kiểm tra grader: ' + graderErr.message },
            { status: 500 }
          );
        }
        if (!graderRow) {
          return NextResponse.json({ ok: false, error: 'grader_id không tồn tại' }, { status: 400 });
        }
      }
      // Kiểm tra scope trạm (+ chuỗi nếu có)
      const { data: scope, error: scopeErr } = await supabaseAdmin
        .from('station_account_scopes')
        .select('station_id, chain_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (scopeErr) {
        return NextResponse.json(
          { ok: false, error: 'Lỗi truy vấn scope: ' + scopeErr.message },
          { status: 500 }
        );
      }
      if (!scope || scope.station_id !== station_id) {
        return NextResponse.json({ ok: false, error: 'Không có scope trạm' }, { status: 403 });
      }
      if (scope.chain_id) {
        const { data: es, error: esErr } = await supabaseAdmin
          .from('exam_sessions')
          .select('chain_id')
          .eq('id', exam_session_id)
          .maybeSingle();
        if (esErr) {
          return NextResponse.json(
            { ok: false, error: 'Lỗi kiểm tra chain: ' + esErr.message },
            { status: 500 }
          );
        }
        if (!es || es.chain_id !== scope.chain_id) {
          return NextResponse.json(
            { ok: false, error: 'Phiên thi không thuộc chuỗi trong scope' },
            { status: 403 }
          );
        }
      }
    }

    // Kiểm tra bản điểm hiện hữu
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('scores')
      .select('id, allow_regrade')
      .eq('exam_session_id', exam_session_id)
      .eq('station_id', station_id)
      .maybeSingle();

    if (existingErr) {
      // Nếu lỗi permission ở đây thì chắc chắn env/key hoặc policy có vấn đề
      return NextResponse.json(
        { ok: false, error: 'Lỗi kiểm tra bản điểm: ' + existingErr.message },
        { status: 500 }
      );
    }

    const row = {
      exam_session_id,
      station_id,
      level_id,
      cohort_id,
      exam_round_id,
      student_id,
      grader_id,
      item_scores,
      total_score,
      comment: comment ?? null,
      global_rating: global_rating as GlobalRating,
    };

    if (!existing) {
      // Chấm lần đầu -> khóa regrade
      const { error: insErr } = await supabaseAdmin
        .from('scores')
        .insert({ ...row, allow_regrade: false });
      if (insErr) {
        // Trả thẳng thông điệp lỗi gốc để bạn thấy nguyên nhân thật (permission/constraint/…)
        return NextResponse.json(
          { ok: false, error: 'Lưu thất bại: ' + insErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, action: 'inserted' });
    } else {
      // Chấm lại: chỉ admin hoặc allow_regrade = true
      if (role !== 'admin' && existing.allow_regrade !== true) {
        return NextResponse.json(
          { ok: false, error: 'Bản điểm đã khóa, cần admin mở regrade' },
          { status: 403 }
        );
      }
      const { error: updErr } = await supabaseAdmin
        .from('scores')
        .update({ ...row, allow_regrade: false }) // Sau chấm lại -> tự khóa lại
        .eq('exam_session_id', exam_session_id)
        .eq('station_id', station_id);
      if (updErr) {
        return NextResponse.json(
          { ok: false, error: 'Lưu thất bại: ' + updErr.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, action: 'updated', locked: true });
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
