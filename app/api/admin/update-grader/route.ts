
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

export async function POST(req: Request) {
  try {
    const { id, last_name, first_name, email, phone } = await req.json();

    const ln = String(last_name ?? '').trim();
    const fn = String(first_name ?? '').trim();
    const emRaw = email ?? null;
    const em = emRaw ? String(emRaw).trim() : null;
    const phRaw = phone ?? null;
    const ph = phRaw ? String(phRaw).trim() : null;

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Thiếu id' }, { status: 400 });
    }
    if (!ln || !fn) {
      return NextResponse.json({ ok: false, error: 'Họ và Tên là bắt buộc' }, { status: 400 });
    }

    // Duplicate check (exclude id)
    let dupQuery = supabaseAdmin
      .from('graders')
      .select('id', { count: 'exact', head: true })
      .eq('last_name', ln)
      .eq('first_name', fn)
      .neq('id', id);

    dupQuery = em === null ? dupQuery.is('email', null) : dupQuery.eq('email', em);

    const { count, error: dupErr } = await dupQuery;
    if (dupErr) {
      return NextResponse.json({ ok: false, error: dupErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: false, error: 'Đã tồn tại giám khảo trùng Họ, Tên và Email.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin
      .from('graders')
      .update({ last_name: ln, first_name: fn, email: em, phone: ph })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
