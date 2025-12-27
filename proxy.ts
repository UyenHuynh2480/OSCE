
// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptionsWithName } from '@supabase/ssr';

/**
 * Middleware-like proxy kiểm tra session và điều hướng theo vai trò.
 * Gọi trong middleware.ts hoặc handler tương đương của bạn.
 */
export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Cho qua các đường dẫn tĩnh/công khai
  const publicPaths = ['/login', '/signup', '/favicon.ico', '/robots.txt'];
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/api')
  ) {
    return res;
  }

  // Supabase SSR client với cookie methods typed
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptionsWithName) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptionsWithName) {
          res.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );

  // Lấy session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Các trang cần bảo vệ (BỎ /grading ở đây để hành xử giống các trang khác: cho client tự kiểm soát)
  const protectedPaths = [
    '/dashboard',
    '/dashboard/admin',
    '/dashboard/uploader',
    '/dashboard/assigner',
    '/manage-levels',
    '/manage-cohorts',
    '/manage-stations',
    '/manage-chains',
    '/manage-graders',
    '/manage-rounds',
    '/upload-students',
    '/upload-rubric',
    '/assign-chain',
    // '/grading', <-- bỏ khỏi protected để tránh bị đẩy ra login khi session/role chưa lấy kịp
    '/results',
  ];
  const isProtected = protectedPaths.some(p => pathname.startsWith(p));

  // Nếu chưa đăng nhập mà vào protected → chuyển login
  if (!session && isProtected) {
    const redirectTo = new URL('/login', req.url);
    redirectTo.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectTo);
  }

  // Helper: đọc role (lowercase) — giữ nguyên, dùng fallback hợp lý
  const getRole = async (): Promise<string | null> => {
    if (!session) return null;

    // Ưu tiên RPC (đồng nhất với client). Nếu RLS chưa cho phép ở middleware, sẽ fallback.
    try {
      const { data: roleData, error } = await supabase.rpc('get_my_role');
      if (!error && typeof roleData === 'string' && roleData.trim()) {
        return roleData.trim().toLowerCase();
      }
    } catch {}

    // Fallback: profiles.id = auth.uid
    try {
      const { data: profileById } = await supabase
        .from('profiles')
        .select('role, id, user_id')
        .eq('id', session.user.id)
        .limit(1)
        .maybeSingle();

      const normalized = (profileById?.role ?? '')
        .toString()
        .trim()
        .toLowerCase();
      if (normalized) return normalized;
    } catch {}

    // Fallback: profiles.user_id = auth.uid
    try {
      const { data: profileByUserId } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      const normalized2 = (profileByUserId?.role ?? '')
        .toString()
        .trim()
        .toLowerCase();
      return normalized2 || null;
    } catch {
      return null;
    }
  };

  const deny = () => NextResponse.redirect(new URL('/login', req.url));

  const redirectByRole = async () => {
    const role = await getRole();
    if (role === 'admin') return NextResponse.redirect(new URL('/dashboard/admin', req.url));
    if (role === 'uploader') return NextResponse.redirect(new URL('/dashboard/uploader', req.url));
    if (role === 'assigner') return NextResponse.redirect(new URL('/assign-chain', req.url));
    if (role === 'grader') return NextResponse.redirect(new URL('/grading', req.url));
    if (role === 'score_viewer') return NextResponse.redirect(new URL('/results', req.url));
    return NextResponse.redirect(new URL('/login', req.url));
  };

  // Nếu đã đăng nhập mà vào /login → điều hướng theo role
  if (session && pathname === '/login') {
    return await redirectByRole();
  }

  // ===== Role gates =====

  // Admin dashboard → admin + uploader + assigner
  if (pathname.startsWith('/dashboard/admin')) {
    const role = await getRole();
    if (!['admin', 'uploader', 'assigner'].includes(role ?? '')) return deny();
  }

  // Uploader dashboard → uploader + admin + assigner
  if (pathname.startsWith('/dashboard/uploader')) {
    const role = await getRole();
    if (!['uploader', 'admin', 'assigner'].includes(role ?? '')) return deny();
  }

  // Assigner dashboard: nếu assigner vào /dashboard/assigner → chuyển thẳng /assign-chain
  if (pathname.startsWith('/dashboard/assigner')) {
    const role = await getRole();
    if (role === null) return res; // pass-through để client xác thực → tránh flicker
    if (role === 'assigner') {
      return NextResponse.redirect(new URL('/assign-chain', req.url));
    }
    if (!['assigner', 'admin', 'uploader'].includes(role)) return deny();
    return res;
  }

  // /manage-* → admin + uploader
  if (pathname.startsWith('/manage-')) {
    const role = await getRole();
    if (role !== 'admin' && role !== 'uploader') return deny();
  }

  // Upload students/rubric → uploader + admin
  if (pathname.startsWith('/upload-students') || pathname.startsWith('/upload-rubric')) {
    const role = await getRole();
    if (role !== 'uploader' && role !== 'admin') return deny();
  }

  // Assigner thao tác chính (/assign-chain) → assigner + admin + uploader
  if (pathname.startsWith('/assign-chain')) {
    const role = await getRole();
    if (role === null) return res; // pass-through
    if (!['assigner', 'admin', 'uploader'].includes(role ?? '')) return deny();
  }

  // ⚠️ BỎ toàn bộ gate cho /grading để giống các trang khác (client tự xử lý).
  // if (pathname.startsWith('/grading')) { ... }  // <-- remove

  // Results → score_viewer + admin + uploader
  if (pathname.startsWith('/results')) {
    const role = await getRole();
    if (!['score_viewer', 'admin', 'uploader'].includes(role ?? '')) return deny();
  }

  // Nếu đã đăng nhập mà vào /dashboard tổng hoặc / → redirect theo role
  if (session && (pathname === '/dashboard' || pathname === '/')) {
    return await redirectByRole();
  }

  return res;
}

// Matcher cho Next middleware (giữ nguyên ý nghĩa tránh tĩnh)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
