
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      console.log('Đang đăng nhập với email:', email);

      // 1) Đăng nhập Supabase
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error('Lỗi đăng nhập:', error.message);
        setErrorMsg('Sai email hoặc mật khẩu');
        setLoading(false);
        return;
      }

      // 2) Lấy role qua RPC
      console.log('Đăng nhập thành công, kiểm tra role...');
      const { data: roleData, error: roleError } = await supabase.rpc('get_my_role');
      if (roleError) {
        console.error('Lỗi RPC get_my_role:', roleError.message);
        setErrorMsg('Không lấy được quyền. Kiểm tra cấu hình Supabase.');
        setLoading(false);
        return;
      }
      console.log('Role nhận được:', roleData);

      const redirectParam = params.get('redirect');

      // 3) Chọn trang đích theo role (uploader luôn về dashboard)
      const resolveTargetByRole = (role: string | null): string | null => {
        switch (role) {
          case 'admin':
            return '/dashboard/admin';
          case 'uploader':
            return '/dashboard/uploader'; // <-- luôn về dashboard uploader
          case 'assigner':
            return '/assign-chain';
          case 'grader':
            return '/grading';
          case 'score_viewer':
            return '/results';
          default:
            return null;
        }
      };

      // uploader bỏ qua redirectParam; các role khác vẫn dùng redirectParam nếu có
      let target = resolveTargetByRole(roleData) || '/';
      if (roleData !== 'uploader' && redirectParam) {
        target = redirectParam;
      }

      if (!resolveTargetByRole(roleData)) {
        setErrorMsg('Tài khoản chưa được gán vai trò phù hợp. Vui lòng liên hệ admin.');
      }

      console.log('Chuyển hướng đến', target);
      try {
        // Điều hướng bằng Next Router
        router.push(target);

        // Fallback: nếu sau 300ms vẫn chưa ở trang đích, dùng hard redirect
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location.pathname !== target) {
            console.log('Fallback hard redirect ->', target);
            window.location.href = target; // hard redirect
          }
        }, 300);
      } catch (navErr) {
        console.error('Lỗi khi điều hướng bằng router.push:', navErr);
        // Nếu push lỗi, dùng hard redirect luôn:
        if (typeof window !== 'undefined') {
          window.location.href = target;
        }
      }
    } catch (err) {
      console.error('Lỗi không xác định:', err);
      setErrorMsg('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '50px auto', padding: 20, border: '1px solid #ccc', borderRadius: 8 }}>
      <h1>Đăng nhập</h1>

      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: 10 }}
          required
        />
        <input
          type="password"
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', marginBottom: 10, padding: 10 }}
          required
        />

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: 10, background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6 }}
        >
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </button>
      </form>

      {errorMsg && <p style={{ color: 'red', marginTop: 10 }}>{errorMsg}</p>}
    </div>
  );
}
