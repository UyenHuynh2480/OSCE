
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

type Profile = {
  user_id: string;
  role: string;
  display_name?: string | null;
  is_active?: boolean | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ToggleActivePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, role, display_name, is_active')
        .order('role', { ascending: true });
      if (error) alert('Lỗi tải profiles: ' + error.message);
      else setProfiles(data || []);
    };
    load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      alert('Vui lòng chọn tài khoản');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/toggle-active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, active }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert('Toggle active lỗi: ' + (j.error || res.statusText));
      } else {
        alert('Cập nhật trạng thái thành công!');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Active / Unactive tài khoản</h1>
          <p className="text-sm text-muted-foreground">
            Active = bật; Unactive = khóa (ban). Dùng sau/before ngày thi.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-border bg-card hover:border-ring transition"
        >
          ← Về Admin Dashboard
        </Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Chọn tài khoản</label>
          <select
            className="w-full px-3 py-2 rounded border border-border bg-card"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {profiles.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name || p.user_id} — ({p.role}) — {p.is_active ? 'Active' : 'Unactive'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Trạng thái mới</label>
          <select
            className="w-full px-3 py-2 rounded border border-border bg-card"
            value={active ? 'active' : 'unactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
          >
            <option value="active">Active (bật)</option>
            <option value="unactive">Unactive (khóa)</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Đang cập nhật…' : 'Cập nhật'}
          </button>
          <Link
            href="/admin/users"
            className="px-4 py-2 rounded-lg border border-border bg-card hover:border-ring transition"
          >
            Xem danh sách
          </Link>
        </div>
      </form>
    </main>
  );
}
