
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  try {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => req.cookies.get(name)?.value,
          set: (name: string, value: string, options: any) =>
            res.cookies.set({ name, value, ...options }),
          remove: (name: string, options: any) =>
            res.cookies.set({ name, value: '', maxAge: 0, ...options }),
        },
      }
    );

    const { new_password } = await req.json();
    if (!new_password) {
      return NextResponse.json({ ok: false, error: 'Thiếu new_password' }, { status: 400 });
    }

    // Phiên hiện tại
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    // 1) Người dùng tự đổi password
    const { data, error } = await supabase.auth.updateUser({ password: new_password });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    // 2) Ghi dấu mốc vào profiles
    const { error: e2 } = await supabase
      .from('profiles')
      .update({ password_last_user_set_at: new Date().toISOString() })
      .eq('user_id', session.user.id);
    if (e2) {
      return NextResponse.json({ ok: true, warn: e2.message });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Lỗi không xác định' }, { status: 500 });
  }
}
