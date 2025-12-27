
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

/* ============================== Types ============================== */
type Station = {
  id: number;
  name: string;
};

type ToastKind = 'success' | 'warning' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string };

/* ============================== Icon ============================== */
// Icon "Map Pin" đẹp, gọn, dùng inline SVG (không cần cài thêm package)
function StationIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 21s7-4.438 7-11a7 7 0 1 0-14 0c0 6.562 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ============================== Toast ============================== */
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
export default function ManageStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationName, setStationName] = useState('');
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [adding, setAdding] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Edit/Delete state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Toast
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (kind: ToastKind, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };
  const removeToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  useEffect(() => {
    fetchStations();
  }, []);

  async function fetchStations() {
    setLoadingList(true);
    setErrorMsg('');
    const { data, error } = await supabase.from('stations').select('*').order('name', { ascending: true });
    if (error) {
      setErrorMsg(error.message);
      pushToast('error', 'Lỗi tải danh sách trạm: ' + error.message);
      setStations([]);
    } else {
      setStations((data as Station[]) || []);
    }
    setLoadingList(false);
  }

  async function addStation() {
    if (!stationName.trim()) {
      pushToast('warning', 'Vui lòng nhập tên trạm.');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('stations').insert([{ name: stationName.trim() }]);
    if (error) {
      pushToast('error', 'Thêm trạm thất bại: ' + error.message);
    } else {
      pushToast('success', 'Đã thêm trạm mới.');
      setStationName('');
      fetchStations();
    }
    setAdding(false);
  }

  function startEdit(s: Station) {
    setEditingId(s.id);
    setEditingName(s.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  async function saveEdit() {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) {
      pushToast('warning', 'Tên trạm không được để trống.');
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.from('stations').update({ name }).eq('id', editingId);
    if (error) {
      pushToast('error', 'Cập nhật thất bại: ' + error.message);
    } else {
      pushToast('success', 'Đã cập nhật tên trạm.');
      cancelEdit();
      fetchStations();
    }
    setSavingEdit(false);
  }

  async function deleteStation(id: number) {
    const ok = window.confirm('Bạn có chắc muốn xóa trạm này? Hành động không thể hoàn tác.');
    if (!ok) return;
    setDeletingId(id);
    const { error } = await supabase.from('stations').delete().eq('id', id);
    if (error) {
      pushToast('error', 'Xóa trạm thất bại: ' + error.message);
    } else {
      pushToast('success', 'Đã xóa trạm.');
      // Optimistic update
      setStations((prev) => prev.filter((s) => s.id !== id));
    }
    setDeletingId(null);
  }

  return (
    <main className="mx-auto max-w-4xl p-6 text-sky-900">
      <ToastStack items={toasts} remove={removeToast} />

      {/* Header + nút quay lại nổi bật */}
      <div className="rounded-2xl bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200 border border-sky-200 p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Quản lý Trạm Thi</h1>
            <p className="text-sm text-sky-700 mt-1">
              Tạo, sửa, xóa các trạm (ví dụ: A, B, C…); dùng cho cấu hình OSCE.
            </p>
          </div>

          {/* ✅ Nút quay lại: luôn dẫn về /dashboard để proxy định tuyến đúng theo role */}
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
              aria-label="Quay về Dashboard"
              title="Quay về Dashboard"
            >
              ← Quay về Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* Card thêm trạm */}
      <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm mb-6">
        <h2 className="text-lg font-semibold text-sky-900 mb-3">Thêm Trạm</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={stationName}
            onChange={(e) => setStationName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-sky-300 bg-white text-sm focus:ring-2 focus:ring-sky-400"
            placeholder="Nhập tên trạm (VD: A)"
            aria-label="Tên trạm"
          />
          <button
            onClick={addStation}
            disabled={adding}
            className="px-4 py-2 rounded-lg bg-sky-700 text-white font-semibold hover:bg-sky-800 transition disabled:bg-sky-300"
          >
            {adding ? 'Đang thêm…' : 'Thêm Trạm'}
          </button>
        </div>
        <p className="text-xs text-sky-700/70 mt-2">
          Gợi ý: tên ngắn, dễ nhớ (A, B, C, D hoặc Station 01, Station 02…)
        </p>
      </section>

      {/* Card danh sách trạm */}
      <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-sky-900">Danh sách Trạm</h2>
          <button
            onClick={fetchStations}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-sky-300 text-sky-900 bg-white hover:border-sky-400 text-sm"
            aria-label="Làm mới danh sách trạm"
            title="Làm mới"
          >
            🔄 Làm mới
          </button>
        </div>

        {/* Trạng thái */}
        {loadingList && (
          <div className="py-8 text-center text-sky-700">Đang tải danh sách trạm…</div>
        )}
        {!loadingList && errorMsg && (
          <div className="py-8 text-center text-rose-700">Có lỗi khi tải dữ liệu: {errorMsg}</div>
        )}
        {!loadingList && !errorMsg && stations.length === 0 && (
          <div className="py-8 text-center text-sky-700/80">Chưa có trạm nào. Hãy thêm trạm ở phía trên.</div>
        )}

        {/* Danh sách dạng thẻ */}
        {!loadingList && !errorMsg && stations.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stations.map((s) => {
              const isEditing = editingId === s.id;
              const isDeleting = deletingId === s.id;

              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-sky-200 bg-sky-50/50 hover:bg-sky-50 transition p-3 flex flex-col gap-3"
                >
                  {/* Hàng trên: avatar + tên */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-900 border border-sky-200 grid place-items-center font-bold">
                        {(s.name || '?').trim().charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0">
                        {!isEditing ? (
                          <div className="text-sm font-semibold truncate flex items-center gap-2">
                            <StationIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span className="truncate">{s.name}</span>
                          </div>
                          // ❌ Không hiển thị ID nữa
                        ) : (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <StationIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white text-sm focus:ring-2 focus:ring-sky-400"
                                aria-label="Sửa tên trạm"
                                placeholder="Nhập tên trạm"
                              />
                            </div>
                            <span className="text-xs text-sky-700/70">Mẹo: Enter để lưu, Esc để huỷ</span>
                            {/* ❌ Không hiển thị ID */}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nút thao tác */}
                    <div className="flex items-center gap-2">
                      {!isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="text-xs px-2 py-1 rounded border border-sky-300 bg-white hover:border-sky-400"
                            aria-label="Sửa trạm"
                            title="Sửa"
                          >
                            ✏️ Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteStation(s.id)}
                            disabled={isDeleting}
                            className="text-xs px-2 py-1 rounded border border-rose-300 bg-white hover:border-rose-400 text-rose-700 disabled:opacity-60"
                            aria-label="Xóa trạm"
                            title="Xóa"
                          >
                            {isDeleting ? 'Đang xóa…' : '🗑️ Xóa'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={savingEdit || !editingName.trim()}
                            className="text-xs px-2 py-1 rounded border border-emerald-300 bg-white hover:border-emerald-500 text-emerald-700 disabled:opacity-60"
                            aria-label="Lưu trạm"
                            title="Lưu"
                          >
                            {savingEdit ? 'Đang lưu…' : '💾 Lưu'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-xs px-2 py-1 rounded border border-sky-300 bg-white hover:border-sky-400"
                            aria-label="Huỷ sửa"
                            title="Huỷ"
                          >
                            ✖️ Huỷ
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
