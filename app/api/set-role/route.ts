
// app/api/set-role/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  // Next 15/16: cookies() là Dynamic API -> cần await
  const cookieStore = await cookies();

  // Supabase server client dùng cookie phiên
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  // 1) Lấy user từ session
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: userError?.message || 'no-user' }, { status: 401 });
  }

  // 2) Lấy role từ bảng profiles (RLS cho phép chính chủ đọc)
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data?.role) {
    return NextResponse.json({ error: 'role-not-found' }, { status: 404 });
  }

  return NextResponse.json({ role: data.role }, { status: 200 });
}
