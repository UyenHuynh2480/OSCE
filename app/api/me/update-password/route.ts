
// app/api/me/update-password/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Cập nhật mật khẩu cho user hiện tại.
 * Yêu cầu: đang đăng nhập; body JSON: { newPassword: string }
 */
export async function POST(req: Request) {
  try {
    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Mật khẩu mới không hợp lệ (tối thiểu 6 ký tự).' },
        { status: 400 }
      );
    }

    // 👉 Trong môi trường của anh/chị, cookies() trả về Promise → cần await
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          // Lấy giá trị cookie hiện thời của phiên Supabase
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          // Cập nhật cookie khi phiên thay đổi (refresh, v.v.)
          set(name: string, value: string, options?: any) {
            // Next hỗ trợ chữ ký set(name, value, options)
            cookieStore.set(name, value, options);
          },
          // Xoá cookie khi signOut
          remove(name: string, _options?: any) {
            cookieStore.delete(name);
          },
        },
      }
    );

    // Bắt buộc phải có user đăng nhập
    const { data: userData, error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
      return NextResponse.json({ error: getUserError.message }, { status: 401 });
    }
    if (!userData?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 });
    }

    // Cập nhật mật khẩu người dùng hiện tại
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Lỗi không xác định.' },
      { status: 500 }
    );
  }
}
