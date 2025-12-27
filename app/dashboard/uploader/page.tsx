
'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { SignOutButton } from './signout-button';
import { supabase } from '@/lib/supabaseClient';

/** Kiểu dữ liệu cho item & group */
type Item = { href: string; title: string; desc: string; icon: string; hotkey?: string };
type Group = { id: string; title: string; items: Item[] };

/** ======= 4 nhóm chính cho Uploader ======= */
const GROUPS: Group[] = [
  {
    id: 'upload',
    title: 'Upload dữ liệu • Data import',
    items: [
      { href: '/upload-students', title: 'Upload sinh viên • Upload Students', desc: 'Import CSV/Excel danh sách sinh viên.', icon: '📤', hotkey: 'V' },
      { href: '/upload-rubric',   title: 'Upload rubric • Upload Rubric',     desc: 'Tạo/nhập rubric: items, thang điểm, global rating.', icon: '📝', hotkey: 'B' },
    ],
  },
  {
    id: 'manage',
    title: 'Nhóm Quản lý • Management',
    items: [
      { href: '/manage-levels',   title: 'Đối tượng • Levels',   desc: 'Thiết lập Y4/Y6 • Configure levels',       icon: '🎓', hotkey: 'L' },
      { href: '/manage-cohorts',  title: 'Niên khóa • Cohorts',  desc: 'Theo từng level • Cohorts per level',      icon: '📅', hotkey: 'C' },
      { href: '/manage-stations', title: 'Trạm thi • Stations',  desc: 'A–F • Manage stations',                    icon: '🗂️', hotkey: 'S' },
      { href: '/manage-chains',   title: 'Chuỗi màu • Chains',   desc: 'Hồng/Vàng/Xanh • Exam chains',             icon: '🧩', hotkey: 'N' }, // ✅ đúng tên "Chains"
      { href: '/manage-graders',  title: 'Giảng viên • Graders', desc: 'Danh sách chấm • Grader list',             icon: '👩‍🏫', hotkey: 'G' },
    ],
  },
  {
    id: 'exam',
    title: 'Quản lý thi • Exam Management',
    items: [
      { href: '/manage-rounds', title: 'Đợt thi • Rounds', desc: 'Theo cohort • Create rounds', icon: '🔁', hotkey: 'R' },
    ],
  },
  {
    id: 'results',
    title: 'Kết quả • Results',
    items: [
      { href: '/results', title: 'Xem kết quả • Results', desc: 'Lọc theo Level/Cohort/Round/Station/Chain • Xuất Excel bảng điểm & dashboard rubric', icon: '📊', hotkey: 'K' },
    ],
  },
];

export default function UploaderDashboardPage() {
  /** Trạng thái tab & tìm kiếm */
  const [active, setActive] = useState<string>('upload');
  const [query, setQuery] = useState<string>('');

  /** Lấy email user (hiển thị chào) */
  const [userEmail, setUserEmail] = useState<string>('Uploader');
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? 'Uploader';
      setUserEmail(email);
    })();
  }, []);

  const currentGroup = useMemo(
    () => GROUPS.find((g) => g.id === active) ?? GROUPS[0],
    [active]
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return currentGroup.items;
    return currentGroup.items.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        it.desc.toLowerCase().includes(q)
    );
  }, [query, currentGroup]);

  /** Hotkeys giống admin: 1–4 chuyển nhóm, / focus search, phím chữ mở item */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();

      const tabMap: Record<string, string> = {
        '1': 'upload',
        '2': 'manage',
        '3': 'exam',
        '4': 'results',
      };
      if (tabMap[key]) { setActive(tabMap[key]); return; }

      if (key === '/') {
        const el = document.getElementById('dashboard-search') as HTMLInputElement | null;
        el?.focus();
        e.preventDefault();
        return;
      }

      const target = currentGroup.items.find((it) => it.hotkey?.toUpperCase() === key);
      if (target) window.location.href = target.href;
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentGroup]);

  /** Nhóm "Manage" hiển thị compact hơn (giống admin) */
  const isCompact = active === 'manage';

  return (
    <main className="min-h-screen bg-white text-blue-900">
      {/* Khung 2 cột giống admin */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* ===== Sidebar trái ===== */}
        <aside className="md:min-h-screen md:sticky md:top-0 border-r border-blue-200 bg-blue-50/50">
          <div className="px-4 py-4 md:py-6">
            <h1 className="text-xl font-bold mb-3">Uploader Dashboard</h1>
            <p className="text-xs text-blue-700/70 mb-4">
              Xin chào <b>{userEmail}</b>. Nhấn{' '}
              <kbd className="px-1 py-[2px] rounded border border-blue-300">1–4</kbd> để chuyển nhóm •{' '}
              <kbd className="px-1 py-[2px] rounded border border-blue-300">/</kbd> để tìm
            </p>

            {/* NAV giống admin */}
            <nav className="flex flex-col">
              {GROUPS.map((g, idx) => {
                const isActive = g.id === active;
                return (
                  <button
                    key={g.id}
                    onClick={() => setActive(g.id)}
                    className={`flex items-center justify-between w-full rounded-lg px-3 py-2 text-sm mb-2 border transition-all text-left
                      ${isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-400'}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="font-medium leading-tight text-left">{g.title}</span>
                    <span
                      className={`ml-2 inline-flex items-center justify-center rounded bg-blue-100 px-1.5 py-[1px] text-[10px] border
                        ${isActive ? 'border-white text-blue-900' : 'border-blue-200 text-blue-700'}`}
                      title="Phím tắt nhóm"
                    >
                      {idx + 1}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* ===== Content phải ===== */}
        <section className="p-4 md:p-6">
          {/* Header content giống admin */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold">{currentGroup.title}</h2>
              <span className="text-xs text-blue-700/70">{filteredItems.length} mục • items</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <input
                  id="dashboard-search"
                  type="text"
                  placeholder="Tìm trong nhóm hiện tại • Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-56 sm:w-64 rounded-lg border border-blue-200 bg-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 text-xs">/</span>
              </div>
              <SignOutButton />
            </div>
          </div>

          {/* Danh sách card item (giống admin) */}
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`group rounded-lg border border-blue-200 bg-white
                   p-2.5 flex flex-col ${isCompact ? 'min-h-[46px]' : 'min-h-[50px]'}
                   hover:border-blue-400 hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full grid place-items-center text-[15px] bg-blue-50 border border-blue-200 text-blue-600"
                    aria-hidden
                  >
                    {it.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold leading-tight mb-0.5 line-clamp-1">{it.title}</h3>
                    <p className="text-[12px] text-blue-700/80 line-clamp-1">{it.desc}</p>
                  </div>
                </div>

                <div className={isCompact ? 'mt-auto pt-0.5' : 'mt-auto pt-1'}>
                  <div className="flex items-center justify-end gap-2">
                    {it.hotkey && (
                      <span
                        className="text-[11px] text-blue-600 group-hover:text-blue-700 transition-colors border border-blue-200 rounded px-1.5 py-[1px]"
                        title={`Phím tắt: ${it.hotkey}`}
                      >
                        {it.hotkey}
                      </span>
                    )}
                    <span className="text-blue-500 group-hover:text-blue-700 transition-colors">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-3 text-xs text-blue-700/70">
            Mẹo: <kbd className="px-1 py-[2px] rounded border border-blue-300">/</kbd> tìm nhanh •{' '}
            <kbd className="px-1 py-[2px] rounded border border-blue-300">1–4</kbd> chuyển nhóm
          </div>
        </section>
      </div>
    </main>
  );
}
