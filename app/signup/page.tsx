
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    // Tạo tài khoản Supabase Auth
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }

    // Trigger DB handle_new_user sẽ tự tạo profiles với role='grader'
    setBusy(false);
    setMessage('Tạo tài khoản thành công. Vui lòng đăng nhập.');
    router.replace('/login');
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', display: 'grid', gap: 12 }}>
      <h2>Đăng ký (Create account)</h2>

      <form onSubmit={handleSignUp} style={{ display: 'grid', gap: 8 }}>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label>Mật khẩu (Password)</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        <button type="submit" disabled={busy}>
          {busy ? 'Đang tạo...' : 'Tạo tài khoản'}
        </button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {message && <p style={{ color: 'green' }}>{message}</p>}

      <p style={{ marginTop: 8 }}>
        Đã có tài khoản? /loginĐăng nhập</a>
      </p>
    </div>
  );
}
