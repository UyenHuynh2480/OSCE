
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/**
 * Nút Đăng xuất cho ứng dụng dùng Supabase Auth.
 * - Chạy ở Client Component (có 'use client').
 * - Gọi supabase.auth.signOut(), sau đó chuyển hướng về /login.
 * - Có trạng thái loading để tránh bấm nhiều lần.
 */
export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const doLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error.message);
        // Nếu muốn hiển thị thông báo, có thể set một state để show ra UI.
      }
      // Sau khi signOut xong, điều hướng về trang login.
      router.push('/login');
    } catch (err) {
      console.error('Unexpected logout error:', err);
      // Vẫn điều hướng về login để đảm bảo người dùng thoát khỏi phiên hiện tại.
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={doLogout}
      disabled={loading}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid #ccc',
        background: loading ? '#ddd' : '#f5f5f5',
        cursor: loading ? 'not-allowed' : 'pointer',
      }}
      aria-busy={loading}
      aria-label="Đăng xuất khỏi hệ thống"
      title="Đăng xuất"
    >
      {loading ? 'Đang đăng xuất...' : 'Đăng xuất'}
    </button>
  );
}
