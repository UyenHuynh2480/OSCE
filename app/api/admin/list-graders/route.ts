
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const search = (url.searchParams.get('search') || '').trim();
    const sortBy = url.searchParams.get('sortBy') || 'last_name';
    const sortDir = (url.searchParams.get('sortDir') || 'asc') as 'asc' | 'desc';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

    // Đếm total (có filter)
    let countQuery = supabaseAdmin
      .from('graders')
      .select('id', { count: 'exact', head: true });

    if (search) {
      countQuery = countQuery.or(
        `last_name.ilike.%${search}%,first_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { count: total, error: countErr } = await countQuery;
    if (countErr) {
      return NextResponse.json({ ok: false, error: countErr.message }, { status: 500 });
    }

    // Data page
    let dataQuery = supabaseAdmin
      .from('graders')
      .select('id,last_name,first_name,email,phone,created_at');

    if (search) {
      dataQuery = dataQuery.or(
        `last_name.ilike.%${search}%,first_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await dataQuery
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(from, to);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, graders: data ?? [], total: total ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
