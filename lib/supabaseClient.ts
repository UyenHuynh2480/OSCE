
// lib/supabaseClient.ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

// Lưu ý: trong dev (localhost, HTTP), cookie secure phải = false
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // hoặc publishable key nếu bạn đã dùng key mới
  {
    auth: {
      persistSession: true,        // lưu phiên
      autoRefreshToken: true,      // tự refresh token
      detectSessionInUrl: true,    // xử lý callback (email link, v.v.)
      // cookieOptions áp dụng cho trình duyệt (client) khi Supabase đặt cookie
      cookieOptions: {
        name: 'sb-session',        // tên cookie tuỳ chọn
        path: '/',                 // cookie có hiệu lực toàn site
        sameSite: 'lax',           // cho phép điều hướng nội bộ
        secure: process.env.NODE_ENV !== 'development' ? true : false, // localhost = false
        maxAge: 60 * 60,           // 1 giờ (tuỳ chỉnh)
      },
    },
  }
);
