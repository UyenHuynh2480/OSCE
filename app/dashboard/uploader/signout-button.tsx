
// app/dashboard/uploader/signout-button.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signOut = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut();
      // Sau khi signOut, proxy/middleware sẽ điều hướng về /login
      router.push('/login');
    } catch (err) {
      console.error(err);
      // fallback
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-3 py-2 text-sm hover:bg-black disabled:opacity-60"
      title="Đăng xuất"
    >
      {loading ? 'Đang đăng xuất…' : 'Đăng xuất'}
    </button>
  );
}
