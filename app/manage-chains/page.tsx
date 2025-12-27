
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type ChainRow = { id: string; name: string };
type SortDir = "asc" | "desc";

/* ============================== Icons ============================== */
// Icon "Link/Chain"
function ChainIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10.586 13.414a2 2 0 0 0 2.828 0l3.172-3.172a4 4 0 0 0-5.657-5.657l-1.586 1.586"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.414 10.586a2 2 0 0 0-2.828 0L7.414 13.758a4 4 0 0 0 5.657 5.657l1.586-1.586"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ============================== Page ============================== */
export default function ManageChains() {
  const [chains, setChains] = useState<ChainRow[]>([]);
  const [chainName, setChainName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Sort (A→Z / Z→A) tại tiêu đề
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    void fetchChains();
  }, []);

  async function fetchChains() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Lấy thô, sort client-side để cho phép toggle A↔Z
      const { data, error } = await supabase.from("chains").select("id,name");
      if (error) {
        setErrorMsg(error.message);
        setChains([]);
      } else {
        setChains(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addChain() {
    const trimmed = chainName.trim();
    if (!trimmed) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("chains").insert([{ name: trimmed }]);
      if (error) {
        setErrorMsg("❌ Lỗi khi thêm Chuỗi: " + error.message);
        return;
      }
      setChainName("");
      await fetchChains();
    } finally {
      setLoading(false);
    }
  }

  async function deleteChain(id: string) {
    if (!confirm("Xóa Chuỗi này? Hành động không thể hoàn tác.")) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("chains").delete().eq("id", id);
      if (error) {
        setErrorMsg("❌ Xóa thất bại: " + error.message);
        return;
      }
      await fetchChains();
    } finally {
      setLoading(false);
    }
  }

  // Edit handlers
  function startEdit(row: ChainRow) {
    setEditingId(row.id);
    setEditingName(row.name);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
    setSavingEdit(false);
  }
  async function saveEdit() {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      setErrorMsg("⚠️ Tên chuỗi không được để trống.");
      return;
    }
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("chains").update({ name: trimmed }).eq("id", editingId);
      if (error) {
        setErrorMsg("❌ Cập nhật thất bại: " + error.message);
        return;
      }
      cancelEdit();
      await fetchChains();
    } finally {
      setSavingEdit(false);
    }
  }

  // Lọc theo keyword
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return chains;
    return chains.filter((c) => c.name.toLowerCase().includes(q));
  }, [chains, keyword]);

  // Sort theo ABC theo sortDir
  const displayRows = useMemo(() => {
    const base = [...filtered];
    base.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, "vi");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [filtered, sortDir]);

  function toggleSort() {
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  function SortArrow({ dir, active = true }: { dir: SortDir; active?: boolean }) {
    return (
      <span className={`inline-block ml-1 text-xs ${active ? "text-sky-700" : "text-sky-500/60"}`}>
        {active ? (dir === "asc" ? "A→Z ↑" : "Z→A ↓") : "↕"}
      </span>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-6 bg-sky-50 min-h-screen text-sky-900">
      {/* Header gradient + nút quay về nổi bật, trên 1 dòng */}
      <div className="rounded-2xl bg-gradient-to-r from-sky-50 via-sky-100 to-sky-200 border border-sky-200 p-4 mb-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Quản lý Chuỗi thi (Chains)</h1>
            <p className="text-sky-700/80 mt-1">
              Chuỗi thi là nhóm kỳ thi liên quan (ví dụ: Chuỗi màu Hồng / Đỏ). Thêm tên, sửa, xóa và sắp xếp A→Z ngay tại tiêu đề.
            </p>
          </div>
          {/* ✅ Nút quay về: luôn dẫn về /dashboard để proxy định tuyến đúng theo role */}
          <div className="flex gap-2 whitespace-nowrap">
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

      {/* Card form + tìm kiếm */}
      <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium">Tên chuỗi (Chain name)</span>
            <input
              type="text"
              value={chainName}
              onChange={(e) => setChainName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addChain();
              }}
              placeholder="Nhập tên chuỗi (VD: Hồng)"
              className="rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </label>

          <button
            onClick={addChain}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 shadow-sm"
            disabled={loading}
            title="Thêm Chuỗi"
          >
            {loading ? "Đang thêm…" : "Thêm Chuỗi"}
          </button>

          {/* Tìm kiếm nhanh */}
          <div className="ml-auto flex items-end">
            <label className="flex flex-col">
              <span className="text-xs font-medium">Tìm kiếm (Search)</span>
              <input
                type="text"
                placeholder="VD: Hồng, Đỏ…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-56 rounded-md border border-sky-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errorMsg}
          </div>
        )}
      </section>

      {/* Bảng danh sách + sort ở tiêu đề + icon cạnh tên chuỗi */}
      <section className="mt-6 rounded-2xl border border-sky-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">Danh sách Chuỗi (Chain list)</h2>
          <div className="text-sm text-sky-700">
            Tổng: <span className="font-medium">{displayRows.length}</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto rounded-b-2xl">
          <table className="min-w-full border-t text-sm">
            <thead className="sticky top-0 bg-sky-100/80">
              <tr className="text-sky-900">
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    onClick={toggleSort}
                    className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                    title="Sắp xếp theo tên (ABC)"
                  >
                    Tên chuỗi (Chain)
                    <SortArrow dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left w-44">Hành động (Actions)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-sky-50/50">
              {loading && chains.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={2}>
                    Đang tải…
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={2}>
                    (Không có dữ liệu phù hợp)
                  </td>
                </tr>
              ) : (
                displayRows.map((c) => {
                  const isEditing = editingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-sky-50 transition-colors">
                      <td className="px-4 py-2 font-medium">
                        {!isEditing ? (
                          <div className="flex items-center gap-2">
                            <ChainIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span className="truncate">{c.name}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <ChainIcon className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="rounded-md border border-sky-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-64"
                              placeholder="Nhập tên chuỗi"
                              aria-label="Sửa tên chuỗi"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(c)}
                              className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs hover:border-sky-400"
                              disabled={loading}
                              title="Sửa"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              onClick={() => deleteChain(c.id)}
                              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                              disabled={loading}
                              title="Xóa"
                            >
                              🗑️ Xóa
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={saveEdit}
                              className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-700 hover:border-emerald-500 disabled:opacity-60"
                              disabled={savingEdit || !editingName.trim()}
                              title="Lưu"
                            >
                              {savingEdit ? "Đang lưu…" : "💾 Lưu"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs hover:border-sky-400"
                              title="Huỷ"
                            >
                              ✖️ Huỷ
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
