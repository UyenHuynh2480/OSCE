
// app/api/grading/list-graded/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

/** Đọc cookie từ header Request (Next 16) */
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const exam_round_id = url.searchParams.get('exam_round_id');
    const station_id = url.searchParams.get('station_id');

    if (!exam_round_id || !station_id) {
      return NextResponse.json({ ok: false, error: 'Thiếu exam_round_id hoặc station_id' }, { status: 400 });
    }

    // SSR Supabase từ cookie header
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

    // Quyền: admin hoặc grader
    const { data: pf } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', session.user.id).maybeSingle();
    const role = pf?.role ?? null;
    if (!['admin', 'grader'].includes(role ?? '')) {
      return NextResponse.json({ ok: false, error: 'Không có quyền' }, { status: 403 });
    }

    // Grader: kiểm tra scope trạm
    if (role === 'grader') {
      const { data: scope } = await supabaseAdmin
        .from('station_account_scopes')
        .select('station_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!scope || scope.station_id !== station_id) {
        return NextResponse.json({ ok: false, error: 'Không có scope trạm' }, { status: 403 });
      }
    }

    // Danh sách đã chấm
    const { data, error } = await supabaseAdmin
      .from('scores')
      .select('exam_session_id')
      .eq('exam_round_id', exam_round_id)
      .eq('station_id', station_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const ids = (data ?? []).map((r: any) => r.exam_session_id);
    return NextResponse.json({ ok: true, exam_session_ids: ids });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
