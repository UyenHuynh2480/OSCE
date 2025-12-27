
// app/api/grading/get-score/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

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
    const { exam_session_id, station_id } = await req.json();

    if (!exam_session_id || !station_id) {
      return NextResponse.json({ ok: false, error: 'Thiếu exam_session_id hoặc station_id' }, { status: 400 });
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

    // Quyền
    const { data: pf } = await supabaseAdmin
      .from('profiles').select('role').eq('user_id', session.user.id).maybeSingle();
    const role = pf?.role ?? null;
    if (!['admin', 'grader'].includes(role ?? '')) {
      return NextResponse.json({ ok: false, error: 'Không có quyền' }, { status: 403 });
    }
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

    const { data, error } = await supabaseAdmin
      .from('scores')
      .select('id, allow_regrade')
      .eq('exam_session_id', exam_session_id)
      .eq('station_id', station_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, score: data ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
