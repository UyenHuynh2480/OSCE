
// proxy.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(req: NextRequest) {
  const res = NextResponse.next();
  const url = new URL(req.url);
  const pathname = url.pathname;

  // Public whitelist
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

  // Supabase SSR client
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

  // Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

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
    '/grading',
    '/results',
  ];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  // Nếu chưa đăng nhập mà vào protected → login
  if (!session && isProtected) {
    const redirectTo = new URL('/login', req.url);
    redirectTo.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectTo);
  }

  // Helper: đọc role (lowercase)
  const getRole = async (): Promise<string | null> => {
    if (!session) return null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', session.user.id)
      .limit(1)
      .single();

    const normalized = (profile?.role ?? '')
      .toString()
      .trim()
      .toLowerCase();

    return normalized || null;
  };

  const deny = () => NextResponse.redirect(new URL('/login', req.url));

  const redirectByRole = async () => {
    const role = await getRole();
    if (role === 'admin')        return NextResponse.redirect(new URL('/dashboard/admin', req.url));
    if (role === 'uploader')     return NextResponse.redirect(new URL('/dashboard/uploader', req.url));
    if (role === 'assigner')     return NextResponse.redirect(new URL('/assign-chain', req.url)); // 🔁 vào thẳng assign-chain
    if (role === 'grader')       return NextResponse.redirect(new URL('/grading', req.url));
    if (role === 'score_viewer') return NextResponse.redirect(new URL('/results', req.url));
    return NextResponse.redirect(new URL('/login', req.url));
  };

  // Nếu đã đăng nhập mà vào /login → điều hướng theo role
  if (session && pathname === '/login') {
    return await redirectByRole();
  }

  // ===== Role gates =====

  // Admin dashboard → admin + uploader + assigner (đã mở quyền)
  if (pathname.startsWith('/dashboard/admin')) {
    const role = await getRole();
    if (!['admin', 'uploader', 'assigner'].includes(role ?? '')) return deny();
  }

  // Uploader dashboard → uploader + admin + assigner (đã mở quyền)
  if (pathname.startsWith('/dashboard/uploader')) {
    const role = await getRole();
    if (!['uploader', 'admin', 'assigner'].includes(role ?? '')) return deny();
  }

  // ✅ Assigner dashboard: hành vi như score_viewer (không dùng dashboard)
  // - assigner: nếu truy cập /dashboard/assigner → chuyển thẳng sang /assign-chain
  // - admin/uploader: cho qua (giữ nguyên cấu trúc hiện có)
  if (pathname.startsWith('/dashboard/assigner')) {
    const role = await getRole();
    if (role === null) return res; // pass-through để client xác thực → tránh flicker

    if (role === 'assigner') {
      // Giống score_viewer: đi thẳng trang chức năng
      return NextResponse.redirect(new URL('/assign-chain', req.url));
    }

    // Giữ nguyên quyền như bản cũ: admin/uploader có thể vào; role khác bị chặn
    if (!['assigner', 'admin', 'uploader'].includes(role)) return deny();

    return res;
  }

  // Các trang quản lý (/manage-*) → admin + uploader
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
  // Phương án B: nếu role === null, cho qua để client xác thực → tránh flicker
  if (pathname.startsWith('/assign-chain')) {
    const role = await getRole();
    if (role === null) return res; // ✅ pass-through
    if (!['assigner', 'admin', 'uploader'].includes(role ?? '')) return deny();
  }

  // Grading → grader + admin
  if (pathname.startsWith('/grading')) {
    const role = await getRole();
    if (role !== 'grader' && role !== 'admin') return deny();
  }

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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
``
