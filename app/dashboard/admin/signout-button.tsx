
'use client';

import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <button
      onClick={handleSignOut}
      className="
        inline-flex items-center justify-center
        bg-primary text-primary-foreground
        px-4 py-2 rounded-lg shadow-sm
        hover:bg-[oklch(0.216_0.006_56.043)]
        transition-colors
      "
    >
      Đăng xuất
    </button>
  );
}

