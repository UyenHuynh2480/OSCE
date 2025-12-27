
'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/logoutbutton'; // ✅ dùng đúng tên file chữ thường
import { supabase } from '@/lib/supabaseClient';

type Item = { href: string; title: string; desc: string; icon: string; hotkey?: string };
type Group = { id: string; title: string; items: Item[] };

/** 6 nhóm chính theo yêu cầu (đã thêm nhóm Results) */
const GROUPS: Group[] = [
  {
    id: 'admin',
    title: 'Quản trị tài khoản • Account Admin',
    items: [
      {
        href: '/dashboard/admin/users',
        title: 'Danh sách tài khoản • Users',
        desc: 'Xem & quản lý tất cả user (join profiles) • View & manage all users',
        icon: '👥',
        hotkey: 'U',
      },
      {
        href: '/dashboard/admin/create-user',
        title: 'Tạo tài khoản • Create User',
        desc: 'Tạo mới: uploader / assigner / grader / score_viewer • Create roles',
        icon: '➕',
        hotkey: 'N',
      },
    ],
  },
  {
    id: 'manage',
    title: 'Nhóm Quản lý • Management',
    items: [
      { href: '/manage-levels',   title: 'Đối tượng • Levels',   desc: 'Thiết lập Y4/Y6 • Configure levels',       icon: '🎓', hotkey: 'L' },
      { href: '/manage-cohorts',  title: 'Niên khóa • Cohorts',  desc: 'Theo từng level • Cohorts per level',      icon: '📅', hotkey: 'C' },
      { href: '/manage-stations', title: 'Trạm thi • Stations',  desc: 'A–F • Manage stations',                    icon: '🗂️', hotkey: 'S' },
      { href: '/manage-chains',   title: 'Chuỗi màu • Chains',   desc: 'Hồng/Vàng/Xanh • Exam chains',             icon: '🧩', hotkey: 'H' },
      { href: '/manage-graders',  title: 'Giảng viên • Graders', desc: 'Danh sách chấm • Grader list',             icon: '👩‍🏫', hotkey: 'G' },
      { href: '/manage-rounds',   title: 'Đợt thi • Rounds',     desc: 'Theo cohort • Create rounds',              icon: '🔁', hotkey: 'R' },
    ],
  },
  {
    id: 'osce',
    title: 'Phụ trách trạm OSCE • Station Ops',
    items: [
      { href: '/upload-students', title: 'Nhập SV • Upload Students', desc: 'Excel/CSV • Import students', icon: '📤', hotkey: 'V' },
      { href: '/upload-rubric',   title: 'Nhập Rubric • Upload Rubric', desc: 'Mỗi trạm • Per station',   icon: '📝', hotkey: 'B' },
    ],
  },
  {
    id: 'exam',
    title: 'Quản lý thi • Exam Management',
    items: [
      { href: '/assign-chain', title: 'Phân chuỗi • Assign Chain', desc: 'Phân SV vào chuỗi màu • Assign students', icon: '🔗', hotkey: 'A' },
    ],
  },
  {
    id: 'grading',
    title: 'Chấm thi • Grading',
    items: [
      { href: '/grading', title: 'Form chấm • Grading Form', desc: 'Theo rubric • Rubric-based', icon: '✅', hotkey: 'D' },
    ],
  },

  /** 🆕 Nhóm Kết quả • Results — đi thẳng tới route /results */
  {
    id: 'results',
    title: 'Kết quả • Results',
    items: [
      {
        href: '/results',
        title: 'Xem kết quả • Results',
        desc: 'Lọc theo Level/Cohort/Round/Station/Chain • Xuất Excel bảng điểm & dashboard rubric',
        icon: '📊',
        hotkey: 'K', // bạn có thể đổi sang 'E' hoặc ký tự khác nếu muốn
      },
    ],
  },
];

/** View từ Supabase: regrade_requests_view */
interface RegradeRequestView {
  id: string;
  inserted_at: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  exam_session_id: string;
  station_id: string;
  requested_by: string; // graders.id
  exam_round_id: string;
  chain_id?: string | null;
  station_name?: string | null;
  chain_name?: string | null;
  chain_color?: string | null;
  round_name?: string | null;
  student_code?: string | null;
  last_name?: string | null;
  name?: string | null;
  cohort_year?: number | null;
  level_name?: string | null;
}

export default function AdminDashboardPage() {
  const [active, setActive] = useState<string>('admin');
  const [query, setQuery] = useState<string>('');

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

  /** Phím tắt: 1–6 chuyển nhóm, / focus search, hotkey item */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();

      const tabMap: Record<string, string> = {
        '1': 'admin',
        '2': 'manage',
        '3': 'osce',
        '4': 'exam',
        '5': 'grading',
        '6': 'results', // 🆕 thêm nhóm kết quả
      };
      if (tabMap[key]) {
        setActive(tabMap[key]);
        return;
      }

      if (key === '/') {
        const el = document.getElementById('dashboard-search') as HTMLInputElement | null;
        el?.focus();
        e.preventDefault();
        return;
      }

      const target = currentGroup.items.find((it) => it.hotkey?.toUpperCase() === key);
      if (target) {
        window.location.href = target.href;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentGroup]);

  /** ========= BANNER YÊU CẦU CHẤM LẠI DÀNH CHO ADMIN ========= */

  const [role, setRole] = useState<string>('');
  const [myGraderId, setMyGraderId] = useState<string | null>(null);
  const [pending, setPending] = useState<RegradeRequestView[]>([]);
  const [loadingRegrade, setLoadingRegrade] = useState<boolean>(false);
  const [toast, setToast] = useState<string>('');

  // Lấy role + grader_id của tài khoản đang đăng nhập
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from('profiles')
        .select('role, grader_id, user_id')
        .eq('user_id', uid)
        .maybeSingle();
      setRole(data?.role ?? '');
      setMyGraderId(data?.grader_id ?? null);
    })();
  }, []);

  const fetchPending = useCallback(async () => {
    if (role !== 'admin') {
      setPending([]);
      return;
    }
    setLoadingRegrade(true);
    const { data, error } = await supabase
      .from('regrade_requests_view')
      .select('*')
      .eq('status', 'pending')
      .order('inserted_at', { ascending: false });
    if (error) {
      console.error(error);
      setLoadingRegrade(false);
      return;
    }
    setPending((data ?? []) as RegradeRequestView[]);
    setLoadingRegrade(false);
  }, [role]);

  useEffect(() => {
    fetchPending();
    // Poll 30s/lần để admin thấy yêu cầu mới
    const t = setInterval(fetchPending, 30000);
    return () => clearInterval(t);
  }, [fetchPending]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1500);
  };

  const approveRequest = async (req: RegradeRequestView) => {
    if (role !== 'admin') return;
    // Cập nhật status = 'approved' + approved_by_admin (graders.id) + approved_at
    const { error } = await supabase
      .from('regrade_requests')
      .update({
        status: 'approved',
        approved_by_admin: myGraderId ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.id);
    if (error) {
      alert('Duyệt thất bại: ' + error.message);
      return;
    }
    notify('✅ Đã duyệt mở chấm lại');
    await fetchPending();
  };

  const rejectRequest = async (req: RegradeRequestView) => {
    if (role !== 'admin') return;
    const { error } = await supabase
      .from('regrade_requests')
      .update({
        status: 'rejected',
        approved_by_admin: myGraderId ?? null, // lưu dấu người quyết định (tùy chọn)
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.id);
    if (error) {
      alert('Từ chối thất bại: ' + error.message);
      return;
    }
    notify('⛔ Đã từ chối yêu cầu');
    await fetchPending();
  };

  /** CỜ: nhóm "manage" dùng card thấp hơn */
  const isCompact = active === 'manage';

  return (
    <main className="min-h-screen bg-white text-blue-900">
      {/* Khung 2 cột: Sidebar trái + Content phải */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
        {/* Sidebar trái — chữ căn lề trái */}
        <aside className="md:min-h-screen md:sticky md:top-0 border-r border-blue-200 bg-blue-50/50">
          <div className="px-4 py-4 md:py-6">
            <h1 className="text-xl font-bold mb-3">Admin Dashboard</h1>
            <p className="text-xs text-blue-700/70 mb-4">
              Nhấn <kbd className="px-1 py-[2px] rounded border border-blue-300">1–6</kbd> để chuyển nhóm •{' '}
              <kbd className="px-1 py-[2px] rounded border border-blue-300">/</kbd> để tìm
            </p>

            {/* NAV: chữ căn trái, badge bên phải */}
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

        {/* Content phải — trung tâm hiển thị theo nhóm */}
        <section className="p-4 md:p-6">
          {/* Header content: Search + Sign out */}
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
              <LogoutButton /> {/* ✅ dùng nút đăng xuất hiện có */}
            </div>
          </div>

          {/* ========= BANNER: YÊU CẦU CHẤM LẠI ========= */}
          {role === 'admin' && (
            <div className="mb-4">
              <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-blue-800">
                    📨 Yêu cầu chấm lại • Regrade Requests ({pending.length}{loadingRegrade ? '…' : ''})
                  </h3>
                  <button
                    onClick={fetchPending}
                    className="text-xs px-2 py-1 rounded border border-blue-300 bg-white hover:bg-blue-100"
                    aria-label="Refresh regrade requests"
                  >
                    Refresh
                  </button>
                </div>

                {pending.length === 0 ? (
                  <p className="text-xs text-blue-700/70 mt-2">Chưa có yêu cầu nào ở trạng thái pending.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {pending.map((req) => {
                      const studentFullName = `${req.last_name ?? ''} ${req.name ?? ''}`.trim();
                      return (
                        <li
                          key={req.id}
                          className="rounded-md border border-blue-200 bg-white p-2.5"
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs"
                              style={{ borderColor: req.chain_color ?? '#60a5fa', color: req.chain_color ?? '#2563eb' }}
                              title={req.chain_name ?? 'Chain'}
                            >
                              ●
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-medium text-blue-900">
                                Chuỗi {req.chain_name ?? '—'} • Trạm {req.station_name ?? '—'}
                              </div>
                              <div className="text-[12px] text-blue-800/80">
                                Yêu cầu chấm lại SV <strong>{studentFullName}</strong>{' '}
                                {req.student_code ? `(${req.student_code})` : ''}
                                {req.round_name ? ` • ${req.round_name}` : ''}
                              </div>
                              {req.reason && (
                                <div className="mt-1 text-[12px] italic text-blue-700/80">
                                  Lý do: “{req.reason}”
                                </div>
                              )}
                              <div className="mt-2 flex gap-2">
                                <button
                                  onClick={() => approveRequest(req)}
                                  className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                >
                                  ✅ Cho phép chấm lại
                                </button>
                                <button
                                  onClick={() => rejectRequest(req)}
                                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                >
                                  ⛔ Không cho chấm lại
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {toast && (
                <div className="mt-2 text-xs text-green-700">{toast}</div>
              )}
            </div>
          )}

          {/* Danh sách dọc: card thấp, giữ padding/icon/font */}
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={
                  `group rounded-lg border border-blue-200 bg-white
                   p-2.5 flex flex-col ${isCompact ? 'min-h-[46px]' : 'min-h-[50px]'}
                   hover:border-blue-400 hover:shadow-md transition-all`
                }
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-8 h-8 rounded-full grid place-items-center text-[15px] bg-blue-50 border border-blue-200 text-blue-600"
                    aria-hidden
                  >
                    {it.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text/[13px] font-semibold leading-tight mb-0.5 line-clamp-1">
                      {it.title}
                    </h3>
                    <p className="text-[12px] text-blue-700/80 line-clamp-1">
                      {it.desc}
                    </p>
                  </div>
                </div>

                {/* Footer: dính đáy để card cân */}
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
            <kbd className="px-1 py-[2px] rounded border border-blue-300">1–6</kbd> chuyển nhóm
          </div>
        </section>
      </div>
    </main>
  );
}
