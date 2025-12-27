
// app/dashboard/admin/users/page.tsx
'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Role = 'admin' | 'grader' | 'uploader' | 'assigner' | 'score_viewer';

type Profile = {
  user_id: string;
  role: Role;
  display_name?: string | null;
  is_active?: boolean | null;
  password_last_admin_set_at?: string | null;
};

type EmailMap = Record<string, string | undefined>;
type Station = { id: string; name: string };
type Chain = { id: string; name: string; color?: string | null };

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  grader: 'Grader (chung)',
  uploader: 'Uploader (cá nhân)',
  assigner: 'Assigner (chung)',
  score_viewer: 'Xem điểm (cá nhân)',
};

type SortKey = 'display_name' | 'email' | 'role' | 'active' | 'last_set';
type SortDir = 'asc' | 'desc';

// State chỉnh sửa inline (hàng thứ 2)
type EditingState = {
  display_name: string;
  role: Role;
  station_id: string; // UUID trạm (bắt buộc nếu role = grader)
  chain_id: string;   // UUID chuỗi (bắt buộc nếu role = grader)
};

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [emails, setEmails] = useState<EmailMap>({});
  const [loading, setLoading] = useState(true);

  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('display_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Dữ liệu phục vụ edit grader
  const [stations, setStations] = useState<Station[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);

  // Chỉ 1 dòng chỉnh sửa tại một thời điểm
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Load dữ liệu qua API (service role)
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1) PROFILES
      try {
        const resProfiles = await fetch('/api/admin/list-profiles', { method: 'GET' });
        const jp = await resProfiles.json();
        if (!resProfiles.ok || !jp.ok) {
          alert('Tải profiles lỗi: ' + (jp.error || resProfiles.statusText));
          setLoading(false);
          return;
        }
        setProfiles(jp.profiles || []);
      } catch (e: any) {
        alert('Tải profiles lỗi: ' + (e?.message ?? 'Unknown error'));
        setLoading(false);
        return;
      }

      // 2) EMAILS (Auth)
      try {
        const resUsers = await fetch('/api/admin/list-users', { method: 'GET' });
        const j = await resUsers.json();
        if (!resUsers.ok || !j.ok) {
          alert('Tải emails lỗi: ' + (j.error || resUsers.statusText));
        } else {
          const map: EmailMap = {};
          (j.users || []).forEach((u: any) => {
            map[u.id] = u.email;
          });
          setEmails(map);
        }
      } catch (e: any) {
        alert('Tải emails lỗi: ' + (e?.message ?? 'Unknown error'));
      }

      // 3) STATIONS + CHAINS
      try {
        const [rSt, rCh] = await Promise.all([
          fetch('/api/admin/list-stations', { method: 'GET' }),
          fetch('/api/admin/list-chains', { method: 'GET' }),
        ]);
        const jsSt = await rSt.json();
        const jsCh = await rCh.json();
        setStations(jsSt.ok ? (jsSt.stations ?? []) : []);
        setChains(jsCh.ok ? (jsCh.chains ?? []) : []);
      } catch (e: any) {
        console.warn('Tải stations/chains lỗi:', e?.message);
      }

      setLoading(false);
    };

    load();
  }, []);

  // Lọc theo role
  const filtered = useMemo(() => {
    if (roleFilter === 'all') return profiles;
    return profiles.filter((p) => p.role === roleFilter);
  }, [profiles, roleFilter]);

  // Sắp xếp
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };
  const normStr = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('vi');

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      switch (sortKey) {
        case 'display_name':
          aVal = normStr(a.display_name);
          bVal = normStr(b.display_name);
          break;
        case 'email':
          aVal = normStr(emails[a.user_id]);
          bVal = normStr(emails[b.user_id]);
          break;
        case 'role':
          aVal = normStr(ROLE_LABEL[a.role]);
          bVal = normStr(ROLE_LABEL[b.role]);
          break;
        case 'active':
          aVal = a.is_active ? 'active' : 'unactive';
          bVal = b.is_active ? 'active' : 'unactive';
          break;
        case 'last_set':
          aVal = a.password_last_admin_set_at ?? '';
          bVal = b.password_last_admin_set_at ?? '';
          break;
      }

      const aEmpty = aVal === '';
      const bEmpty = bVal === '';
      if (aEmpty && !bEmpty) return sortDir === 'asc' ? 1 : -1;
      if (!aEmpty && bEmpty) return sortDir === 'asc' ? -1 : 1;

      const cmp = aVal.localeCompare(bVal, 'vi', { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, emails]);

  // Toggle active (bypass RLS qua API)
  const toggleActive = async (user_id: string, currentRole: Role, nextActive: boolean) => {
    // 🔒 Admin: không cho phép unactive/active
    if (currentRole === 'admin') return;
    const res = await fetch('/api/admin/toggle-active', {
      method: 'POST',
      body: JSON.stringify({
        user_id,
        active: nextActive,
        ban_hours: nextActive ? undefined : 48,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert('Toggle active lỗi: ' + (j.error || res.statusText));
      return;
    }
    setProfiles((prev) => prev.map((p) => (p.user_id === user_id ? { ...p, is_active: nextActive } : p)));
  };

  // Xóa user
  const deleteUser = async (user_id: string, role: Role) => {
    if (role === 'admin') {
      alert('Không thể xóa tài khoản admin.');
      return;
    }
    const ok = confirm(
      'Xóa tài khoản này khỏi hệ thống?\n' +
        '- Sẽ xóa user ở Auth\n' +
        '- Xóa profile & scope liên quan\n' +
        'Hành động không thể hoàn tác.'
    );
    if (!ok) return;

    const res = await fetch('/api/admin/delete-user', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      alert('Xóa account lỗi: ' + (j.error || res.statusText));
      return;
    }

    setProfiles((prev) => prev.filter((p) => p.user_id !== user_id));
    setEmails((prev) => {
      const next = { ...prev };
      delete next[user_id];
      return next;
    });
  };

  // Lấy scope hiện tại (prefill khi edit)
  const fetchScope = async (userId: string): Promise<{ station_id: string; chain_id: string } | null> => {
    try {
      const res = await fetch('/api/admin/get-station-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) return null;
      return j.scope ?? null;
    } catch {
      return null;
    }
  };

  // Bắt đầu chỉnh sửa
  const startEdit = async (p: Profile) => {
    if (p.role === 'admin') return; // 🔒 chặn admin
    setEditingUserId(p.user_id);

    let station_id = '';
    let chain_id = '';
    const scope = await fetchScope(p.user_id);
    if (scope) {
      station_id = scope.station_id ?? '';
      chain_id = scope.chain_id ?? '';
    }

    setEditing({
      display_name: p.display_name ?? '',
      role: p.role,
      station_id,
      chain_id,
    });
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditing(null);
    setSaving(false);
  };

  // Lưu chỉnh sửa
  const saveEdit = async () => {
    if (!editingUserId || !editing) return;
    setSaving(true);

    try {
      // Lấy role gốc để biết có cần clear scope hay không
      const original = profiles.find((p) => p.user_id === editingUserId);

      // 1) Cập nhật profile
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: editingUserId,
          role: editing.role,
          display_name: editing.display_name.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert('Cập nhật user lỗi: ' + (j.error || res.statusText));
        setSaving(false);
        return;
      }

      // 2) Nếu role là grader -> bắt buộc station_id & chain_id
      if (editing.role === 'grader') {
        if (!editing.station_id) {
          alert('Vui lòng chọn Trạm (Station).');
          setSaving(false);
          return;
        }
        if (!editing.chain_id) {
          alert('Vui lòng chọn Chuỗi (Chain).');
          setSaving(false);
          return;
        }

        const resScope = await fetch('/api/admin/set-station-scope', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: editingUserId,
            station_id: editing.station_id,
            chain_id: editing.chain_id,
          }),
        });
        const js = await resScope.json();
        if (!resScope.ok || !js.ok) {
          alert('Thiết lập station scope lỗi: ' + (js.error || resScope.statusText));
          setSaving(false);
          return;
        }
      } else {
        // 3) Nếu đổi khỏi grader mà trước đó là grader -> clear scope
        if (original?.role === 'grader') {
          await fetch('/api/admin/clear-station-scope', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: editingUserId }),
          }).catch(() => {});
        }
      }

      // 4) Cập nhật state bảng
      setProfiles((prev) =>
        prev.map((p) =>
          p.user_id === editingUserId
            ? { ...p, role: editing.role, display_name: editing.display_name.trim() || null }
            : p
        )
      );

      cancelEdit();
    } catch (e: any) {
      alert('Lỗi hệ thống: ' + e?.message);
      setSaving(false);
    }
  };

  const SortIcon = ({ active }: { active: boolean }) => (
    <span className="ml-1 inline-block align-middle text-xs opacity-70">
      {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </span>
  );

  const thBtn =
    'text-left px-3 py-2 select-none cursor-pointer hover:bg-blue-50 transition rounded-sm text-blue-900 whitespace-nowrap';

  return (
    <main className="mx-auto w-full max-w-[min(1440px,100vw-32px)] p-4 sm:p-6 text-blue-900">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Danh sách tài khoản</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800 transition"
          >
            ← Về Admin Dashboard
          </Link>
          <Link
            href="/dashboard/admin/create-user"
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800 transition"
          >
            + Tạo tài khoản
          </Link>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium">Lọc theo role:</label>
        <select
          className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as any)}
        >
          <option value="all">Tất cả</option>
          <option value="admin">Admin</option>
          <option value="uploader">Uploader</option>
          <option value="assigner">Assigner</option>
          <option value="grader">Grader</option>
          <option value="score_viewer">Score viewer</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-blue-200 bg-white">
        <table className="w-full table-auto min-w-[980px] text-sm">
          <thead className="bg-blue-50 sticky top-0 z-10">
            <tr className="text-blue-900">
              <th className={thBtn} onClick={() => toggleSort('display_name')} title="Sắp xếp theo Display Name">
                Display Name
                <SortIcon active={sortKey === 'display_name'} />
              </th>
              <th className={thBtn} onClick={() => toggleSort('email')} title="Sắp xếp theo Email">
                Email
                <SortIcon active={sortKey === 'email'} />
              </th>
              <th className={thBtn} onClick={() => toggleSort('role')} title="Sắp xếp theo Role">
                Role
                <SortIcon active={sortKey === 'role'} />
              </th>
              <th className={thBtn} onClick={() => toggleSort('active')} title="Sắp xếp theo trạng thái Active/Unactive">
                Active
                <SortIcon active={sortKey === 'active'} />
              </th>
              <th className={thBtn} onClick={() => toggleSort('last_set')} title="Sắp xếp theo thời gian đặt mật khẩu bởi Admin">
                Last set by Admin
                <SortIcon active={sortKey === 'last_set'} />
              </th>
              <th className="text-left px-3 py-2 whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-blue-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={`cell-${i}-${j}`} className="px-3 py-2">
                      <div className="h-4 w-24 rounded bg-blue-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800">
                    <span>Không có tài khoản phù hợp</span>
                    <Link
                      href="/dashboard/admin/create-user"
                      className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800 transition text-[13px]"
                    >
                      Tạo tài khoản mới
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              sorted.map((p, idx) => {
                const isEditing = editingUserId === p.user_id;
                const isAdminRow = p.role === 'admin';

                return (
                  <Fragment key={p.user_id}>
                    {/* Hàng dữ liệu chính */}
                    <tr
                      className={`${idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'} hover:bg-blue-50 transition-colors`}
                    >
                      {/* Display name */}
                      <td className="px-3 py-2 font-medium text-blue-900">
                        {p.display_name || '—'}
                      </td>

                      {/* Email */}
                      <td className="px-3 py-2 text-blue-800">{emails[p.user_id] || '—'}</td>

                      {/* Role */}
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200 px-2 py-[3px] text-xs">
                          {ROLE_LABEL[p.role]}
                        </span>
                      </td>

                      {/* Active */}
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-xs border ${
                            p.is_active ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
                          }`}
                        >
                          {p.is_active ? 'Active' : 'Unactive'}
                        </span>
                      </td>

                      {/* Last set by Admin */}
                      <td className="px-3 py-2">
                        {p.password_last_admin_set_at ? (
                          <span className="text-xs text-blue-700/80">
                            {new Date(p.password_last_admin_set_at).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-blue-700/60">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="inline-flex flex-wrap gap-2">
                          {/* Chỉnh sửa (admin: mờ + disable) */}
                          <button
                            className={
                              'inline-flex items-center justify-center px-2 py-1 rounded-lg text-[13px] ' +
                              (isAdminRow
                                ? 'border border-blue-200 text-blue-700/60 cursor-not-allowed opacity-50 bg-white'
                                : 'border border-blue-200 text-blue-900 bg-white hover:border-blue-400 hover:shadow-sm transition')
                            }
                            onClick={async () => {
                              if (isAdminRow) return;
                              await startEdit(p);
                            }}
                            disabled={isAdminRow}
                            title={isAdminRow ? 'Không thể chỉnh sửa admin' : 'Chỉnh sửa hồ sơ'}
                          >
                            Chỉnh sửa
                          </button>

                          {/* Active/Unactive (admin: mờ + disable) */}
                          <button
                            className={
                              'inline-flex items-center justify-center px-2 py-1 rounded-lg text-[13px] ' +
                              (isAdminRow
                                ? 'border border-blue-200 text-blue-700/60 cursor-not-allowed opacity-50 bg-white'
                                : 'border border-blue-200 text-blue-900 bg-white hover:border-blue-400 hover:shadow-sm transition')
                            }
                            onClick={() => {
                              if (isAdminRow) return;
                              toggleActive(p.user_id, p.role, !p.is_active);
                            }}
                            disabled={isAdminRow}
                            title={isAdminRow ? 'Admin luôn active' : p.is_active ? 'Unactive' : 'Active'}
                          >
                            {p.is_active ? 'Unactive' : 'Active'}
                          </button>

                          <Link
                            href={`/dashboard/admin/reset-password?user_id=${p.user_id}`}
                            className="inline-flex items-center justify-center px-2 py-1 rounded-lg border border-blue-200 text-blue-900 bg-white hover:border-blue-400 hover:shadow-sm transition text-[13px]"
                          >
                            Đổi mật khẩu
                          </Link>

                          <button
                            className={
                              'inline-flex items-center justify-center px-2 py-1 rounded-lg transition text-[13px] ' +
                              (p.role === 'admin'
                                ? 'border border-blue-200 text-blue-700/60 cursor-not-allowed opacity-50 bg-white'
                                : 'border border-red-300 text-red-700 bg-white hover:border-red-500 hover:bg-red-50')
                            }
                            onClick={() => {
                              if (p.role === 'admin') return;
                              deleteUser(p.user_id, p.role);
                            }}
                            disabled={p.role === 'admin'}
                            title={p.role === 'admin' ? 'Không thể xóa admin' : 'Xóa tài khoản'}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* HÀNG THỨ 2: panel chỉnh sửa */}
                    {isEditing && (
                      <tr className="bg-blue-50/60">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="rounded-lg border border-blue-200 bg-white p-3">
                            {/* Form: Display name + Role + (Station/Chain nếu grader) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* Display name */}
                              <div>
                                <label className="block text-xs font-semibold text-blue-900 mb-1">Tên hiển thị</label>
                                <input
                                  value={editing?.display_name ?? ''}
                                  onChange={(e) =>
                                    setEditing((prev) => (prev ? { ...prev, display_name: e.target.value } : prev))
                                  }
                                  className="w-full rounded-lg border border-blue-300 px-2 py-[6px] text-sm focus:ring-2 focus:ring-blue-400"
                                  placeholder="Tên hiển thị…"
                                />
                              </div>

                              {/* Role */}
                              <div>
                                <label className="block text-xs font-semibold text-blue-900 mb-1">Role</label>
                                <select
                                  value={editing?.role ?? 'grader'}
                                  onChange={(e) =>
                                    setEditing((prev) =>
                                      prev ? { ...prev, role: e.target.value as Role, station_id: '', chain_id: '' } : prev
                                    )
                                  }
                                  className="w-full rounded-lg border border-blue-300 px-2 py-[6px] text-sm focus:ring-2 focus:ring-blue-400"
                                >
                                  {Object.keys(ROLE_LABEL).map((rk) => (
                                    <option key={rk} value={rk}>
                                      {ROLE_LABEL[rk as Role]}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Nếu role = grader → Station & Chain (UUID, bắt buộc) */}
                              {editing?.role === 'grader' && (
                                <>
                                  {/* Station */}
                                  <div>
                                    <label className="block text-xs font-semibold text-blue-900 mb-1">Trạm (Station)</label>
                                    <select
                                      value={editing?.station_id ?? ''}
                                      onChange={(e) =>
                                        setEditing((prev) => (prev ? { ...prev, station_id: e.target.value } : prev))
                                      }
                                      className={
                                        'w-full rounded-lg border px-2 py-[6px] text-sm focus:ring-2 ' +
                                        (!editing?.station_id
                                          ? 'border-red-300 focus:ring-red-400'
                                          : 'border-blue-300 focus:ring-blue-400')
                                      }
                                    >
                                      <option value="">— Chọn trạm —</option>
                                      {stations.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Chain */}
                                  <div>
                                    <label className="block text-xs font-semibold text-blue-900 mb-1">Chuỗi (Chain)</label>
                                    <select
                                      value={editing?.chain_id ?? ''}
                                      onChange={(e) =>
                                        setEditing((prev) => (prev ? { ...prev, chain_id: e.target.value } : prev))
                                      }
                                      className={
                                        'w-full rounded-lg border px-2 py-[6px] text-sm focus:ring-2 ' +
                                        (!editing?.chain_id
                                          ? 'border-red-300 focus:ring-red-400'
                                          : 'border-blue-300 focus:ring-blue-400')
                                      }
                                    >
                                      <option value="">— Chọn chuỗi —</option>
                                      {chains.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Actions Save/Cancel cho panel chỉnh sửa */}
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                onClick={saveEdit}
                                disabled={saving}
                                className={
                                  'inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[13px] border ' +
                                  'border-emerald-300 text-emerald-800 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100 transition'
                                }
                                title="Lưu chỉnh sửa"
                              >
                                {saving ? 'Đang lưu…' : 'Lưu'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-900 bg-white hover:border-blue-400 hover:shadow-sm transition text-[13px]"
                              >
                                Hủy
                              </button>
                              <Link
                                href={`/dashboard/admin/reset-password?user_id=${editingUserId ?? ''}`}
                                className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-900 bg-white hover:border-blue-400 hover:shadow-sm transition text-[13px]"
                              >
                                Đổi mật khẩu
                              </Link>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
``
