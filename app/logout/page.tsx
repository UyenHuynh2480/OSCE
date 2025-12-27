
// components/LogoutButton.tsx
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const doLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };
  return <button onClick={doLogout}>Đăng xuất</button>;
}
