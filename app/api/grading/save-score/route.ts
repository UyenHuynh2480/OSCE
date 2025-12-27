
// app/api/grading/save-score/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

type GlobalRating = 'Fail' | 'Pass' | 'Good' | 'Excellent';

function getCookieValueFromRequest(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') ?? '';
  const pairs = header.split(';').map(s => s.trim()).filter(Boolean);
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
    const payload = await req.json();
    const {
      exam_session_id, station_id, level_id, cohort_id, exam_round_id,
      student_id, grader_id, item_scores, total_score, comment, global_rating,
    } = payload;

    // Validate bắt buộc
    for (const [k, v] of Object.entries({
      exam_session_id, station_id, level_id, cohort_id, exam_round_id,
      student_id, grader_id, total_score, global_rating,
    })) {
      if (v === undefined || v === null || v === '') {
        return NextResponse.json({ ok: false, error: `Thiếu trường: ${k}` }, { status: 400 });
      }
    }

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

    // Profile hiện tại
    const { data: pf } = await supabaseAdmin
      .from('profiles')
      .select('role, grader_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const role = pf?.role ?? null;
    const myGraderId = pf?.grader_id ?? null;

    if (!['admin', 'grader'].includes(role ?? '')) {
      return NextResponse.json({ ok: false, error: 'Không có quyền' }, { status: 403 });
    }

    /** ✅ Mô hình account chung:
     * - Nếu profile.grader_id có giá trị -> ép trùng như cũ.
     * - Nếu profile.grader_id = null -> cho phép chọn grader_id bất kỳ, nhưng phải tồn tại trong bảng graders.
     */
    if (role === 'grader') {
      if (myGraderId) {
        if (myGraderId !== grader_id) {
          return NextResponse.json({ ok: false, error: 'Sai grader_id so với profile' }, { status: 403 });
        }
      } else {
        // account chung: xác thực grader_id có tồn tại
        const { data: graderRow, error: graderErr } = await supabaseAdmin
          .from('graders')
          .select('id')
          .eq('id', grader_id)
          .maybeSingle();
        if (graderErr) {
          return NextResponse.json({ ok: false, error: 'Lỗi kiểm tra grader: ' + graderErr.message }, { status: 500 });
        }
        if (!graderRow) {
          return NextResponse.json({ ok: false, error: 'grader_id không tồn tại' }, { status: 400 });
        }
      }

      // Kiểm tra scope trạm + (nếu có) chuỗi
      const { data: scope } = await supabaseAdmin
        .from('station_account_scopes')
        .select('station_id, chain_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!scope || scope.station_id !== station_id) {
        return NextResponse.json({ ok: false, error: 'Không có scope trạm' }, { status: 403 });
      }
      if (scope.chain_id) {
        const { data: es } = await supabaseAdmin
          .from('exam_sessions')
          .select('chain_id')
          .eq('id', exam_session_id)
          .maybeSingle();
        if (!es || es.chain_id !== scope.chain_id) {
          return NextResponse.json({ ok: false, error: 'Phiên thi không thuộc chuỗi trong scope' }, { status: 403 });
        }
      }
    }

    // Kiểm tra existing
    const { data: existing } = await supabaseAdmin
      .from('scores')
      .select('id, allow_regrade')
      .eq('exam_session_id', exam_session_id)
      .eq('station_id', station_id)
      .maybeSingle();

    const row = {
      exam_session_id, station_id, level_id, cohort_id, exam_round_id,
      student_id, grader_id, item_scores, total_score,
      comment: comment ?? null,
      global_rating: global_rating as GlobalRating,
    };

    if (!existing) {
      // Chấm lần đầu -> allow_regrade=false (tự khóa)
      const { error } = await supabaseAdmin
        .from('scores')
        .insert({ ...row, allow_regrade: false });
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'inserted' });
    } else {
      // Chấm lại: chỉ admin hoặc allow_regrade=true
      if (role !== 'admin' && existing.allow_regrade !== true) {
        return NextResponse.json({ ok: false, error: 'Bản điểm đã khoá, cần admin mở regrade' }, { status: 403 });
      }
      const { error } = await supabaseAdmin
        .from('scores')
        .update({ ...row, allow_regrade: false }) // sau chấm lại -> tự khóa lại
        .eq('exam_session_id', exam_session_id)
        .eq('station_id', station_id);
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: 'updated', locked: true });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
