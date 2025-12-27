
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Body {
  user_id: string;
  station_id: string; // UUID
  chain_id: string;   // UUID
}

export async function POST(req: Request) {
  try {
    const { user_id, station_id, chain_id } = (await req.json()) as Body;

    if (!user_id || !station_id || !chain_id) {
      return NextResponse.json(
        { ok: false, error: 'Thiếu user_id hoặc station_id hoặc chain_id' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Upsert theo user_id
    const { data: existing, error: getErr } = await supabaseAdmin
      .from('station_account_scopes')
      .select('user_id')
      .eq('user_id', user_id)
      .maybeSingle();

    if (getErr) {
      return NextResponse.json({ ok: false, error: getErr.message }, { status: 500 });
    }

    if (existing) {
      const { error: updErr } = await supabaseAdmin
        .from('station_account_scopes')
        .update({ station_id, chain_id })
        .eq('user_id', user_id);
      if (updErr) {
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabaseAdmin
        .from('station_account_scopes')
        .insert([{ user_id, station_id, chain_id }]);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
