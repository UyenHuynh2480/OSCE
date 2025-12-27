
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Grader = {
  id: string;
  last_name: string;
  first_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

type SortBy = 'last_name' | 'first_name' | 'email' | 'created_at';
type SortDir = 'asc' | 'desc';

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`inline-block ml-1 text-xs ${active ? 'text-sky-700' : 'text-sky-500/60'}`}>
      {active ? (dir === 'asc' ? 'A→Z ↑' : 'Z→A ↓') : '↕'}
    </span>
  );
}

function formatDateISO(datetime: string) {
  const d = new Date(datetime);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function ManagerGradersPage() {
  const [graders, setGraders] = useState<Grader[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Block Thêm (chỉ thêm)
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);

  // Search & Sort
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('last_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Export
  const [exporting, setExporting] = useState<boolean>(false);

  // Inline edit trong danh sách
  const [rowEditId, setRowEditId] = useState<string | null>(null);
  const [rowLastName, setRowLastName] = useState('');
  const [rowFirstName, setRowFirstName] = useState('');
  const [rowEmail, setRowEmail] = useState('');
  const [rowPhone, setRowPhone] = useState('');
  const [savingRow, setSavingRow] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchGraders = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        search: searchTerm.trim(),
        sortBy,
        sortDir,
        page: String(page),
        pageSize: String(pageSize),
      });
      const r = await fetch(`/api/admin/list-graders?${params.toString()}`, { method: 'GET' });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErrorMsg('Lỗi tải dữ liệu: ' + (j.error || r.statusText));
        setGraders([]);
        setTotal(0);
      } else {
        setGraders(j.graders || []);
        setTotal(j.total || 0);
      }
    } catch (err: any) {
      setErrorMsg('Lỗi hệ thống: ' + (err?.message ?? 'Không xác định'));
      setGraders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGraders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, searchTerm, sortBy, sortDir]);

  const addGrader = async () => {
    const ln = lastName.trim();
    const fn = firstName.trim();
    const em = email.trim() || null;
    const ph = phone.trim() || null;

    if (!ln || !fn) {
      alert('Họ và Tên là bắt buộc');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const r = await fetch('/api/admin/create-grader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_name: ln, first_name: fn, email: em, phone: ph }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        alert('Lỗi thêm: ' + (j.error || r.statusText));
      } else {
        setLastName('');
        setFirstName('');
        setEmail('');
        setPhone('');
        setPage(1);
        await fetchGraders();
      }
    } finally {
      setLoading(false);
    }
  };

  const deleteGrader = async (id: string) => {
    if (!confirm('Xóa giám khảo này? Hành động không thể hoàn tác.')) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const r = await fetch('/api/admin/delete-grader', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        alert('Lỗi xóa: ' + (j.error || r.statusText));
      } else {
        const newTotal = Math.max(0, total - 1);
        const newTotalPages = Math.max(1, Math.ceil(newTotal / pageSize));
        if (page > newTotalPages) setPage(newTotalPages);
        await fetchGraders();
      }
    } finally {
      setLoading(false);
    }
  };

  // Inline edit handlers (sửa trực tiếp trong danh sách)
  const startRowEdit = (g: Grader) => {
    setRowEditId(g.id);
    setRowLastName(g.last_name ?? '');
    setRowFirstName(g.first_name ?? '');
    setRowEmail(g.email ?? '');
    setRowPhone(g.phone ?? '');
  };
  const cancelRowEdit = () => {
    setRowEditId(null);
    setRowLastName('');
    setRowFirstName('');
    setRowEmail('');
    setRowPhone('');
    setSavingRow(false);
  };
  const saveRowEdit = async () => {
    if (!rowEditId) return;

    const ln = rowLastName.trim();
    const fn = rowFirstName.trim();
    const em = rowEmail.trim() || null;
    const ph = rowPhone.trim() || null;

    if (!ln || !fn) {
      alert('Họ và Tên là bắt buộc');
      return;
    }

    setSavingRow(true);
    setErrorMsg(null);
    try {
      const r = await fetch('/api/admin/update-grader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowEditId, last_name: ln, first_name: fn, email: em, phone: ph }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        alert('Lỗi cập nhật: ' + (j.error || r.statusText));
      } else {
        cancelRowEdit();
        await fetchGraders();
      }
    } finally {
      setSavingRow(false);
    }
  };

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
      setPage(1);
    }
  };

  const fetchAllFilteredGraders = async (): Promise<Grader[]> => {
    // Lấy toàn bộ theo filter & sort phía server (pageSize lớn)
    const params = new URLSearchParams({
      search: searchTerm.trim(),
      sortBy,
      sortDir,
      page: '1',
      pageSize: '100000', // giả định không vượt quá
    });
    const r = await fetch(`/api/admin/list-graders?${params.toString()}`, { method: 'GET' });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || r.statusText);
    return (j.graders ?? []) as Grader[];
  };

  const handleExportExcel = async (scope: 'page' | 'all') => {
    try {
      setExporting(true);
      const XLSX = await import('xlsx');

      const rows: Grader[] = scope === 'page' ? graders : await fetchAllFilteredGraders();

      const header = [
        'Họ (Last name)',
        'Tên (First name)',
        'Email',
        'Số điện thoại (Phone)',
        'Ngày tạo (Created at)',
      ];
      const body = rows.map((g) => [
        g.last_name,
        g.first_name,
        g.email ?? '',
        g.phone ?? '',
        formatDateISO(g.created_at),
      ]);

      const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
      const colWidths = header.map((h, i) => {
        const maxLen = Math.max(h.length, ...body.map((r) => String(r[i] ?? '').length));
        return { wch: Math.min(Math.max(maxLen + 2, 12), 40) };
      });
      (sheet as any)['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Graders');

      const dateTag = new Date().toISOString().slice(0, 10);
      const filterTag = searchTerm.trim()
        ? `_filter_${searchTerm.trim().replace(/\s+/g, '_')}`
        : '';
      const filename =
        scope === 'page'
          ? `graders_page_${page}_${dateTag}.xlsx`
          : `graders_all${filterTag}_${dateTag}.xlsx`;

      XLSX.writeFile(wb, filename);
    } catch (err: any) {
      alert('Xuất Excel thất bại: ' + (err?.message ?? 'Không xác định'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-6 bg-sky-50 min-h-screen text-sky-900">
      {/* Header + nút quay về */}
      <div className="rounded-2xl bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200 border border-sky-200 p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quản lý Giám khảo</h1>
            <p className="text-sky-700/80 mt-1">
              Thêm giám khảo ở cột trái, chỉnh sửa trực tiếp trong danh sách bên phải. Có tìm kiếm, sắp xếp và xuất Excel.
            </p>
          </div>
          <div className="flex gap-2 whitespace-nowrap">
            {/* Quay về Dashboard (proxy tự định tuyến đúng theo role) */}
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
              title="Quay về Dashboard"
            >
              ← Quay về Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* GRID: Trái hẹp ~240px, Phải rộng 2 cột */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_1fr] gap-6">
        {/* ==== CỘT TRÁI (GIỚI HẠN CHIỀU RỘNG) ==== */}
        <div className="space-y-4 lg:w-[240px]">
          {/* Block THÊM nhỏ gọn */}
          <section className="rounded-2xl border border-sky-200 bg-white p-2 shadow-sm">
            <h2 className="text-base font-semibold text-sky-900 mb-2">Thêm Giám khảo</h2>
            <div className="flex flex-wrap items-end gap-2">
              {/* Họ */}
              <label className="flex flex-col">
                <span className="text-xs font-medium text-sky-900">Họ (Last name)</span>
                <input
                  type="text"
                  placeholder="VD: Nguyễn Văn"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-56 rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </label>

              {/* Tên */}
              <label className="flex flex-col">
                <span className="text-xs font-medium text-sky-900">Tên (First name)</span>
                <input
                  type="text"
                  placeholder="VD: An"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-56 rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </label>

              {/* Email */}
              <label className="flex flex-col">
                <span className="text-xs font-medium text-sky-900">Email</span>
                <input
                  type="email"
                  placeholder="VD: grader@..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-56 rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </label>

              {/* Số điện thoại */}
              <label className="flex flex-col">
                <span className="text-xs font-medium text-sky-900">Số điện thoại</span>
                <input
                  type="text"
                  placeholder="VD: 090..., +84..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-56 rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </label>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={addGrader}
                className="px-4 py-2 rounded-lg bg-sky-700 text-white font-semibold hover:bg-sky-800 transition disabled:bg-sky-300 w-full"
                disabled={loading}
              >
                Thêm Giám khảo
              </button>
            </div>
          </section>

          {/* Tìm kiếm */}
          <section className="rounded-2xl border border-sky-200 bg-white p-2 shadow-sm">
            <h3 className="text-base font-semibold text-sky-900 mb-2">Tìm kiếm</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col w-full">
                <span className="text-xs font-medium text-sky-900">Theo Họ, Tên hoặc Email…</span>
                <input
                  type="text"
                  placeholder="Ví dụ: Nguyễn, An, grader@..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
              </label>

              <div className="text-sm text-sky-700">
                Tổng: <span className="font-medium">{total}</span> giám khảo
              </div>
            </div>

            {errorMsg && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {errorMsg}
              </div>
            )}
          </section>
        </div>

        {/* ==== CỘT PHẢI (chiếm 2 cột, LIST RỘNG HƠN) ==== */}
        <section className="rounded-2xl border border-sky-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold text-sky-900">Danh sách Giám khảo</h2>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportExcel('page')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-900 hover:border-sky-400 text-sm disabled:opacity-60"
                disabled={exporting || loading}
                title="Xuất trang hiện tại (.xlsx)"
              >
                📄 Xuất trang
              </button>
              <button
                onClick={() => handleExportExcel('all')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800 text-sm disabled:bg-sky-300"
                disabled={exporting || loading}
                title="Xuất toàn bộ theo bộ lọc (.xlsx)"
              >
                ⬇️ Xuất toàn bộ
              </button>

              <div className="text-sm text-sky-700 ml-2">
                Trang <span className="font-medium">{page}</span> / {totalPages}
              </div>
            </div>
          </div>

          <div className="max-h-[80vh] overflow-auto rounded-b-2xl">
            <table className="min-w-full border-t text-sm">
              <thead className="sticky top-0 bg-sky-100/80">
                <tr className="text-sky-900">
                  <th className="px-4 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort('last_name')}
                      className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                      title="Sắp xếp theo Họ"
                    >
                      Họ
                      <SortArrow active={sortBy === 'last_name'} dir={sortDir} />
                    </button>
                  </th>
                  <th className="px-4 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort('first_name')}
                      className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                      title="Sắp xếp theo Tên"
                    >
                      Tên
                      <SortArrow active={sortBy === 'first_name'} dir={sortDir} />
                    </button>
                  </th>

                  <th className="px-4 py-2 text-left w-56">
                    <button
                      type="button"
                      onClick={() => toggleSort('email')}
                      className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                      title="Sắp xếp theo Email"
                    >
                      Email
                      <SortArrow active={sortBy === 'email'} dir={sortDir} />
                    </button>
                  </th>

                  <th className="px-4 py-2 text-left w-32">Phone</th>

                  <th className="px-4 py-2 text-left w-64">
                    <button
                      type="button"
                      onClick={() => toggleSort('created_at')}
                      className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                      title="Sắp xếp theo Ngày tạo"
                    >
                      Ngày tạo
                      <SortArrow active={sortBy === 'created_at'} dir={sortDir} />
                    </button>
                  </th>

                  <th className="px-4 py-2 text-left w-48">Hành động</th>
                </tr>
              </thead>

              <tbody className="[&>tr:nth-child(even)]:bg-sky-50/50">
                {loading && graders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-sky-700" colSpan={6}>
                      Đang tải…
                    </td>
                  </tr>
                ) : graders.length === 0 ? (
                  <tr>
                    <td className="px-4 py-3 text-sky-700" colSpan={6}>
                      (Không có dữ liệu)
                    </td>
                  </tr>
                ) : (
                  graders.map((g) => {
                    const isEditing = rowEditId === g.id;
                    return (
                      <tr key={g.id} className="hover:bg-sky-50 transition-colors">
                        {/* Họ */}
                        <td className="px-4 py-2 font-medium whitespace-nowrap">
                          {!isEditing ? (
                            g.last_name
                          ) : (
                            <input
                              type="text"
                              value={rowLastName}
                              onChange={(e) => setRowLastName(e.target.value)}
                              className="rounded-md border border-sky-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-40"
                              maxLength={80}
                            />
                          )}
                        </td>

                        {/* Tên */}
                        <td className="px-4 py-2">
                          {!isEditing ? (
                            g.first_name
                          ) : (
                            <input
                              type="text"
                              value={rowFirstName}
                              onChange={(e) => setRowFirstName(e.target.value)}
                              className="rounded-md border border-sky-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-[8ch]"
                              maxLength={8}
                            />
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-4 py-2 w-56">
                          {!isEditing ? (
                            g.email || <span className="text-sky-700/60">—</span>
                          ) : (
                            <input
                              type="email"
                              value={rowEmail}
                              onChange={(e) => setRowEmail(e.target.value)}
                              className="rounded-md border border-sky-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-40"
                              maxLength={80}
                            />
                          )}
                        </td>

                        {/* SĐT */}
                        <td className="px-4 py-2">
                          {!isEditing ? (
                            g.phone || <span className="text-sky-700/60">—</span>
                          ) : (
                            <input
                              type="text"
                              value={rowPhone}
                              onChange={(e) => setRowPhone(e.target.value)}
                              className="rounded-md border border-sky-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-[15ch]"
                              maxLength={15}
                            />
                          )}
                        </td>

                        {/* Ngày tạo */}
                        <td className="px-4 py-2 w-64 whitespace-nowrap">
                          <span className="text-sky-700/80">{formatDateISO(g.created_at)}</span>
                        </td>

                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {!isEditing ? (
                              <>
                                <button
                                  onClick={() => startRowEdit(g)}
                                  className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-900 hover:border-sky-400"
                                  title="Sửa"
                                >
                                  ✏️ Sửa
                                </button>
                                <button
                                  onClick={() => deleteGrader(g.id)}
                                  className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                                  title="Xóa"
                                >
                                  🗑️ Xóa
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={saveRowEdit}
                                  disabled={savingRow || !rowLastName.trim() || !rowFirstName.trim()}
                                  className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-700 hover:border-emerald-500 disabled:opacity-60"
                                  title="Lưu"
                                >
                                  {savingRow ? 'Đang lưu…' : '💾 Lưu'}
                                </button>
                                <button
                                  onClick={cancelRowEdit}
                                  className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-900 hover:border-sky-400"
                                  title="Huỷ"
                                >
                                  ✖️ Huỷ
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap justify-between items-center gap-3 px-4 py-3 border-t border-sky-200">
            <div className="text-sm text-sky-700">
              Hiển thị <span className="font-medium">{graders.length}</span> / {total}
            </div>
            <div className="flex justify-center items-center gap-3">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-900 hover:border-sky-400 disabled:opacity-50"
                title="Trước"
              >
                « Trước
              </button>
              <span className="text-sm">
                Trang <span className="font-medium">{page}</span> / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-900 hover:border-sky-400 disabled:opacity-50"
                title="Sau"
              >
                Sau »
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
