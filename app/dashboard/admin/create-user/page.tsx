
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

type Role = 'admin' | 'grader' | 'uploader' | 'assigner' | 'score_viewer';
type Chain = { id: string; name: string };
type Level = { id: string; name: string };

const STATION_CODES = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
type StationCode = (typeof STATION_CODES)[number];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  grader: 'Grader (chung)',
  uploader: 'Uploader (cá nhân)',
  assigner: 'Assigner (chung)',
  score_viewer: 'Xem điểm (cá nhân)',
};

export default function CreateUserPage() {
  // Form state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('grader');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Chain / Level / Station
  const [selectedChainId, setSelectedChainId] = useState<string>('');
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [selectedStationCode, setSelectedStationCode] = useState<StationCode | ''>('');

  // Data & status
  const [chains, setChains] = useState<Chain[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('');

  // Stepper visual (auto)
  const [step, setStep] = useState<number>(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus('');
      const [{ data: cData }, { data: lData }] = await Promise.all([
        supabase.from('chains').select('id,name').order('name', { ascending: true }),
        supabase.from('levels').select('id,name').order('name', { ascending: true }),
      ]);
      setChains(cData ?? []);
      setLevels(lData ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const validatePassword = (pwd: string) => pwd.length >= 8;

  const createUser = async () => {
    setStatus('');

    if (!email.trim()) return setStatus('⚠️ Vui lòng nhập Email.');
    if (!password.trim()) return setStatus('⚠️ Vui lòng nhập Mật khẩu.');
    if (!validatePassword(password)) return setStatus('⚠️ Mật khẩu tối thiểu 8 ký tự.');
    if (!role) return setStatus('⚠️ Vui lòng chọn Role.');
    if (role === 'grader' && !selectedStationCode) {
      return setStatus('⚠️ Với Grader, vui lòng chọn Trạm (A–F).');
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          display_name: displayName.trim() || null,
          role,
          password,
          chain_id: selectedChainId || null,
          level_id: selectedLevelId || null,
          station_code: selectedStationCode || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        return setStatus('❌ Tạo tài khoản lỗi: ' + (j.error || res.statusText));
      }

      setStatus('🎉 Tạo tài khoản thành công!');
      setEmail('');
      setDisplayName('');
      setRole('grader');
      setPassword('');
      setSelectedChainId('');
      setSelectedLevelId('');
      setSelectedStationCode('');
      setStep(1);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (e: any) {
      setStatus('❌ Lỗi hệ thống: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  // Chip hiển thị số bước (giống nhau ở 3 block)
  const StepPill = ({ idx, text }: { idx: number; text: string }) => (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold bg-white/70 text-sky-900 border border-white shadow-sm">
      {idx} {text}
    </span>
  );

  return (
    <main className="mx-auto max-w-6xl p-6 bg-sky-50 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-sky-900 mb-1">Tạo tài khoản</h1>
          <p className="text-sm text-sky-700">
            👤 Chọn Role; nếu là <strong>Grader</strong> thì chọn thêm <strong>Level</strong> và <strong>Trạm (A–F)</strong>.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-sky-300 bg-white text-sky-800 hover:border-sky-500 hover:shadow-sm"
          >
            ← Về Dashboard
          </Link>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm border ${
            status.startsWith('🎉')
              ? 'bg-green-50 text-green-800 border-green-200'
              : status.startsWith('⚠️')
              ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
              : status.startsWith('❌')
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-sky-50 text-sky-800 border-sky-200'
          }`}
        >
          {status}
        </div>
      )}

      {/* ===== Block 1: Thông tin cơ bản — gradient & pill đồng bộ ===== */}
      <section className="relative mb-5 rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200 p-5 shadow-sm">
        {/* Pill số bước — cùng vị trí & style như các block dưới */}
        <div className="absolute -top-3 left-4">
          <StepPill idx={1} text="Thông tin cơ bản" />
        </div>

        {/* Nội dung */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>✉️</span> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setStep((s) => Math.max(s, 2))}
              className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"
              placeholder="vd: grader@example.com"
              autoComplete="email"
            />
          </div>

          {/* Display name */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🏷️</span> Tên hiển thị
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"
              placeholder="vd: Chuỗi Vàng · Trạm A"
              autoComplete="name"
            />
            {/* Gợi ý ngay dưới Tên hiển thị */}
            <p className="text-xs text-sky-800 mt-1">
              💡 Gợi ý: đặt <em>Tên hiển thị</em> gắn với nhiệm vụ, ví dụ: <strong>Vàng · Trạm A</strong>, giúp nhận diện nhanh khi phân công.
            </p>
          </div>

          {/* Password + toggle */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🔒</span> Mật khẩu
            </label>
            <div className="flex gap-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setStep((s) => Math.max(s, 2))}
                className="flex-1 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-400"
                placeholder="≥ 8 ký tự"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="px-3 py-2 rounded-lg border border-sky-300 bg-white hover:bg-sky-50 text-sky-700"
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            <p className="text-xs text-sky-800 mt-1">Tối thiểu 8 ký tự.</p>
          </div>
        </div>
      </section>

      {/* ===== Block 2: Phân quyền — gradient vừa & pill đồng bộ ===== */}
      <section className="relative mb-5 rounded-2xl border border-sky-300 bg-gradient-to-r from-sky-100 via-sky-200 to-sky-300 p-5 shadow-sm">
        <div className="absolute -top-3 left-4">
          <StepPill idx={2} text="Phân quyền" />
        </div>

        {/* Một hàng: Role select + mô tả inline (không khung, chữ thẳng hàng) */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-[340px_1fr] gap-4 items-center">
          {/* Role */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🛂</span> Role
            </label>
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setStep(3);
              }}
              className="w-full rounded-lg border border-sky-400 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500"
            >
              {Object.entries(ROLE_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Mô tả quyền (inline) */}
          <p className="text-sm text-sky-900">
            <span className="inline-flex items-center gap-2 align-middle">
              <span className="inline-block w-5 h-5 rounded bg-sky-600 text-white grid place-items-center text-[12px] font-bold">i</span>
              <span>
                <strong>admin</strong> toàn quyền; <strong>uploader</strong> nhập dữ liệu; <strong>assigner</strong> phân chuỗi;{' '}
                <strong>grader</strong> chấm thi; <strong>score_viewer</strong> xem kết quả.
              </span>
            </span>
          </p>
        </div>
      </section>

      {/* ===== Block 3: Ràng buộc — gradient đậm hơn & pill đồng bộ ===== */}
      <section className="relative mb-6 rounded-2xl border border-sky-400 bg-gradient-to-r from-sky-200 via-sky-300 to-sky-400 p-5 shadow-sm">
        <div className="absolute -top-3 left-4">
          <StepPill idx={3} text="Ràng buộc Role" />
        </div>

        {/* Thứ tự: Level → Chain → Station */}
        <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Level */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🎓</span> Đối tượng (Level)
            </label>
            <select
              value={selectedLevelId}
              onChange={(e) => setSelectedLevelId(e.target.value)}
              className="w-full rounded-lg border border-sky-500 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-600"
              disabled={loading}
            >
              <option value="">— Chọn Level —</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <p className="text-xs text-sky-900 mt-1">Không ảnh hưởng danh sách trạm; lưu kèm để tham chiếu.</p>
          </div>

          {/* Chain */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🧩</span> Chuỗi (Chain)
            </label>
            <select
              value={selectedChainId}
              onChange={(e) => setSelectedChainId(e.target.value)}
              className="w-full rounded-lg border border-sky-500 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-600"
              disabled={loading}
            >
              <option value="">— Chọn Chuỗi —</option>
              {chains.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-xs text-sky-900 mt-1">Nguồn: bảng <code>chains(id, name)</code>.</p>
          </div>

          {/* Station */}
          <div>
            <label className="block text-sm font-semibold text-sky-900 mb-1 flex items-center gap-2">
              <span>🚩</span> Trạm (A–F)
            </label>
            <select
              value={selectedStationCode}
              onChange={(e) => setSelectedStationCode(e.target.value as StationCode)}
              className="w-full rounded-lg border border-sky-500 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-sky-600"
              disabled={loading}
            >
              <option value="">— Chọn Trạm —</option>
              {STATION_CODES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <p className="text-xs text-sky-900 mt-1">Bắt buộc với <strong>Grader</strong> · Trạm cố định A–F.</p>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={createUser}
          disabled={creating || loading}
          className="px-4 py-2 rounded-lg bg-sky-700 text-white font-semibold hover:bg-sky-800 disabled:bg-sky-400"
          title="Tạo tài khoản mới"
        >
          {creating ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>

        <Link
          href="/dashboard/admin/users"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-sky-300 bg-white text-sky-800 hover:border-sky-500 hover:shadow-sm"
        >
          Hủy / Quay lại danh sách
        </Link>
      </div>
    </main>
  );
}
