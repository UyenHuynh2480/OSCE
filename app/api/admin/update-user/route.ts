
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Role = 'admin' | 'grader' | 'uploader' | 'assigner' | 'score_viewer';

interface UpdateUserBody {
  user_id: string;
  role?: Role;
  display_name?: string | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UpdateUserBody;
    const { user_id, role, display_name } = body;

    if (!user_id) {
      return NextResponse.json({ ok: false, error: 'Thiếu user_id' }, { status: 400 });
    }

    // Server-side Supabase (Service Role)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Chặn chỉnh sửa admin
    const { data: current, error: getErr } = await supabaseAdmin
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user_id)
      .single();

    if (getErr) {
      return NextResponse.json({ ok: false, error: getErr.message }, { status: 500 });
    }
    if (!current) {
      return NextResponse.json({ ok: false, error: 'Không tìm thấy user' }, { status: 404 });
    }
    if (current.role === 'admin') {
      return NextResponse.json({ ok: false, error: 'Không cho chỉnh sửa tài khoản admin' }, { status: 403 });
    }

    const payload: Record<string, any> = {};
    if (typeof role !== 'undefined') payload.role = role;
    if (typeof display_name !== 'undefined') payload.display_name = display_name ?? null;

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ ok: false, error: 'Không có trường nào để cập nhật' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(payload)
      .eq('user_id', user_id)
      .select('user_id, role, display_name, is_active, password_last_admin_set_at')
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, profile: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Server error' }, { status: 500 });
  }
}
