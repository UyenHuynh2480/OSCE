
// components/LogoutButton.tsx
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const doLogout = async () => {
    await supabase.auth.signOut();
    // Xoá cookie role ở client bằng cách gọi 1 API xoá nếu muốn,
    // tạm thời quay về login là đủ vì phiên Supabase đã xoá.
    router.push('/login');
  };
  return <button onClick={doLogout}>Đăng xuất</button>;
}
