
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

/* ============================== Types ============================== */
type Role = 'admin' | 'grader' | 'uploader' | 'assigner' | 'score_viewer';
type Profile = {
  user_id: string;
  role: Role | string;
  display_name?: string | null;
};

type ToastKind = 'success' | 'warning' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

/* ============================== Supabase ============================== */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ============================== Helpers ============================== */
function assessPassword(pwd: string) {
  const len = pwd.length >= 8;
  const upper = /[A-Z]/.test(pwd);
  const lower = /[a-z]/.test(pwd);
  const digit = /\d/.test(pwd);
  const special = /[^A-Za-z0-9]/.test(pwd);

  const score = [len, upper, lower, digit, special].filter(Boolean).length;
  let level: 'Yếu' | 'Trung bình' | 'Mạnh' | 'Rất mạnh' = 'Yếu';
  if (score >= 4) level = 'Mạnh';
  if (score === 5) level = 'Rất mạnh';
  else if (score === 3) level = 'Trung bình';
  return { score, level, checks: { len, upper, lower, digit, special } };
}

const initialOf = (s?: string | null, fallback?: string) =>
  ((s ?? '').trim()[0] || (fallback ?? '')[0] || '•').toUpperCase();

/* ============================== Toast component ============================== */
function ToastStack({ items, remove }: { items: ToastItem[]; remove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => {
        const palette =
          t.kind === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : t.kind === 'warning'
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : t.kind === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-sky-50 text-sky-800 border-sky-200';
        return (
          <div
            key={t.id}
            className={`min-w-[280px] rounded-lg border px-3 py-2 shadow-sm ${palette} flex items-start gap-3`}
            role="status"
            aria-live="polite"
          >
            <div className="text-lg">
              {t.kind === 'success' ? '✅' : t.kind === 'warning' ? '⚠️' : t.kind === 'error' ? '❌' : 'ℹ️'}
            </div>
            <div className="flex-1 text-sm">{t.message}</div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-sm px-2 py-1 rounded border bg-white border-sky-200 hover:border-sky-400"
              aria-label="Đóng thông báo"
            >
              Đóng
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== Page ============================== */
export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [showPwd, setShowPwd] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (kind: ToastKind, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };
  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, role, display_name')
        .order('role', { ascending: true });
      if (error) {
        pushToast('error', 'Lỗi tải danh sách tài khoản: ' + error.message);
      } else {
        setProfiles(data || []);
      }
    };
    load();

    const qUserId = searchParams.get('user_id');
    if (qUserId) setUserId(qUserId);
  }, [searchParams]);

  const pwdMeta = useMemo(() => assessPassword(newPassword), [newPassword]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !newPassword) {
      pushToast('warning', 'Vui lòng chọn tài khoản và nhập mật khẩu mới.');
      return;
    }
    if (newPassword.length < 8) {
      pushToast('warning', 'Mật khẩu tối thiểu 8 ký tự.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        pushToast('error', 'Đổi mật khẩu lỗi: ' + (j.error || res.statusText));
      } else {
        pushToast('success', 'Đổi mật khẩu thành công!');
        setNewPassword('');
      }
    } catch (err: any) {
      pushToast('error', 'Lỗi hệ thống: ' + (err?.message ?? 'Không xác định'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 text-sky-900">
      <ToastStack items={toasts} remove={removeToast} />

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200 border border-sky-200 p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Đặt mật khẩu mới</h1>
            <p className="text-sm text-sky-700 mt-1">
              Dùng cho account chung hoặc khôi phục khi quên, ghi mốc thời gian vào hồ sơ.
            </p>
          </div>
          <div className="flex gap-2 w-full max-w-md">
            <Link
              href="/dashboard/admin"
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
            >
              ← Về Admin Dashboard
            </Link>
            <Link
              href="/dashboard/admin/users"
              className="flex-1 inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
            >
              Xem danh sách
            </Link>
          </div>
        </div>
      </div>

      {/* Form */}
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm"
        aria-label="Form đặt mật khẩu mới"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chọn tài khoản */}
          <section>
            <label className="block text-sm font-semibold text-sky-900 mb-1">Chọn tài khoản</label>
            <div className="relative">
              <select
                className="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white text-sm focus:ring-2 focus:ring-sky-400"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">— Chọn —</option>
                {profiles.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {(p.display_name || p.user_id) + ' — (' + p.role + ')'}
                  </option>
                ))}
              </select>
              {userId && (
                <SelectedUserInfo
                  userId={userId}
                  profiles={profiles}
                  onCopy={(msg) => pushToast('success', msg)}
                  onCopyFail={(msg) => pushToast('warning', msg)}
                />
              )}
            </div>
          </section>

          {/* Mật khẩu mới */}
          <section>
            <label className="block text-sm font-semibold text-sky-900 mb-1">Mật khẩu mới</label>
            <div className="flex gap-2">
              <input
                type={showPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-sky-300 bg-white text-sm focus:ring-2 focus:ring-sky-400"
                placeholder="≥ 8 ký tự, khuyến nghị có chữ hoa, số, ký tự đặc biệt"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="px-3 py-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800"
              >
                {showPwd ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            <PasswordStrength pwdMeta={pwdMeta} />
          </section>
        </div>

        {/* Actions */}
        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-700 text-white font-semibold hover:bg-sky-800 transition disabled:bg-sky-300"
          >
            {loading ? 'Đang đổi…' : 'Đổi mật khẩu'}
          </button>
        </div>
      </form>
    </main>
  );
}

/* ============================== Subcomponents ============================== */
function SelectedUserInfo({
  userId,
  profiles,
  onCopy,
  onCopyFail,
}: {
  userId: string;
  profiles: Profile[];
  onCopy: (msg: string) => void;
  onCopyFail: (msg: string) => void;
}) {
  const cur = profiles.find((x) => x.user_id === userId);
  if (!cur) return null;
  const init = initialOf(cur.display_name, cur.user_id);

  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-900 border border-sky-200 grid place-items-center font-bold">
        {init}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{cur.display_name || cur.user_id}</div>
        <div className="text-xs text-sky-700/80 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 border border-sky-200 px-2 py-[2px]">
            {String(cur.role)}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(cur.user_id);
                onCopy('Đã copy user_id vào clipboard.');
              } catch {
                onCopyFail('Không thể copy, vui lòng chọn & Ctrl+C.');
              }
            }}
            className="text-xs px-2 py-[2px] rounded border border-sky-200 bg-white hover:border-sky-400"
          >
            Copy user_id
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordStrength({ pwdMeta }: { pwdMeta: ReturnType<typeof assessPassword> }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-sky-800 mb-1">
        <span>
          Độ mạnh: <strong>{pwdMeta.level}</strong>
        </span>
        <span className="text-sky-700/70">Tiêu chí: độ dài, chữ hoa, chữ thường, số, ký tự đặc biệt</span>
      </div>
      <div className="h-2 w-full rounded bg-sky-100 overflow-hidden flex">
        <div className={`${pwdMeta.score >= 1 ? 'bg-rose-400' : 'bg-sky-100'} flex-1`} />
        <div className={`${pwdMeta.score >= 2 ? 'bg-amber-400' : 'bg-sky-100'} flex-1`} />
        <div className={`${pwdMeta.score >= 3 ? 'bg-sky-500' : 'bg-sky-100'} flex-1`} />
        <div className={`${pwdMeta.score >= 4 ? 'bg-emerald-500' : 'bg-sky-100'} flex-1`} />
        <div className={`${pwdMeta.score >= 5 ? 'bg-emerald-700' : 'bg-sky-100'} flex-1`} />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
        <li className={`flex items-center gap-2 ${pwdMeta.checks.len ? 'text-emerald-700' : 'text-sky-700/70'}`}>
          {pwdMeta.checks.len ? '✓' : '•'} ≥ 8 ký tự
        </li>
        <li className={`flex items-center gap-2 ${pwdMeta.checks.upper ? 'text-emerald-700' : 'text-sky-700/70'}`}>
          {pwdMeta.checks.upper ? '✓' : '•'} Có chữ hoa
        </li>
        <li className={`flex items-center gap-2 ${pwdMeta.checks.lower ? 'text-emerald-700' : 'text-sky-700/70'}`}>
          {pwdMeta.checks.lower ? '✓' : '•'} Có chữ thường
        </li>
        <li className={`flex items-center gap-2 ${pwdMeta.checks.digit ? 'text-emerald-700' : 'text-sky-700/70'}`}>
          {pwdMeta.checks.digit ? '✓' : '•'} Có số
        </li>
        <li className={`flex items-center gap-2 ${pwdMeta.checks.special ? 'text-emerald-700' : 'text-sky-700/70'}`}>
          {pwdMeta.checks.special ? '✓' : '•'} Có ký tự đặc biệt
        </li>
      </ul>
    </div>
  );
}
