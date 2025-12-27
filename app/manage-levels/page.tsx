
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type LevelRow = { id: string; name: string };
type SortMode = "number" | "name";

export default function ManageLevels() {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [levelName, setLevelName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyword, setKeyword] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("number");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  useEffect(() => {
    void fetchLevels();
  }, []);

  /** Lấy phần số ở tên level, ví dụ "Y6" -> 6; "Năm 4" -> 4; "Y10" -> 10 */
  function getNumericValue(name: string): number {
    const m = name?.match(/\d+/);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY; // tên không số -> xếp cuối khi sort theo số
  }

  /** Sắp xếp theo số nhỏ -> lớn; nếu bằng nhau thì so theo tên (tiếng Việt) */
  function sortLevelsByNumber(list: LevelRow[]): LevelRow[] {
    return [...list].sort((a, b) => {
      const na = getNumericValue(a.name);
      const nb = getNumericValue(b.name);
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name, "vi");
    });
  }

  /** Sắp xếp theo tên ABC (locale vi) */
  function sortLevelsByName(list: LevelRow[]): LevelRow[] {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  function applySort(list: LevelRow[]): LevelRow[] {
    return sortMode === "number" ? sortLevelsByNumber(list) : sortLevelsByName(list);
  }

  async function fetchLevels() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.from("levels").select("id,name");
      if (error) {
        setErrorMsg(error.message);
        setLevels([]);
      } else {
        setLevels(applySort(data ?? []));
      }
    } finally {
      setLoading(false);
    }
  }

  async function addLevel() {
    const trimmed = levelName.trim();
    if (!trimmed) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("levels").insert([{ name: trimmed }]);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setLevelName("");
      const { data, error: err2 } = await supabase.from("levels").select("id,name");
      if (err2) {
        setErrorMsg(err2.message);
        return;
      }
      setLevels(applySort(data ?? []));
    } finally {
      setLoading(false);
    }
  }

  async function deleteLevel(id: string) {
    if (!confirm("Xóa Đối tượng này? Hành động không thể hoàn tác.")) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("levels").delete().eq("id", id);
      if (error) {
        setErrorMsg("❌ Xóa thất bại: " + error.message);
        return;
      }
      // Tải lại danh sách sau khi xóa
      const { data, error: err2 } = await supabase.from("levels").select("id,name");
      if (err2) {
        setErrorMsg(err2.message);
        return;
      }
      setLevels(applySort(data ?? []));
    } finally {
      setLoading(false);
    }
  }

  // Edit handlers
  function startEdit(row: LevelRow) {
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
      setErrorMsg("Tên đối tượng không được để trống.");
      return;
    }
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("levels").update({ name: trimmed }).eq("id", editingId);
      if (error) {
        setErrorMsg("❌ Cập nhật thất bại: " + error.message);
        return;
      }
      cancelEdit();
      const { data, error: err2 } = await supabase.from("levels").select("id,name");
      if (err2) {
        setErrorMsg(err2.message);
        return;
      }
      setLevels(applySort(data ?? []));
    } finally {
      setSavingEdit(false);
    }
  }

  // Lọc theo keyword
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const base = levels;
    if (!q) return base;
    return base.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        String(getNumericValue(l.name)).includes(q)
    );
  }, [levels, keyword]);

  // Khi đổi sort mode -> áp lại sort trên danh sách hiện có
  function onChangeSortMode(mode: SortMode) {
    setSortMode(mode);
    setLevels((prev) => applySort(prev));
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 bg-sky-50 min-h-[100vh]">
      {/* Tiêu đề + nút quay lại nổi bật */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-sky-900">
            Quản lý Đối tượng (Levels)
          </h1>
          <p className="text-sky-700/80 mt-1">
            Ví dụ: Y4, Y6… Có thể sắp xếp theo số (mặc định) hoặc tên ABC.
          </p>
        </div>
        <div className="flex gap-2">
          {/* ✅ Sửa: luôn quay về /dashboard để proxy định tuyến đúng theo role */}
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
            title="← Quay về Dashboard"
          >
            ← Quay về Dashboard
          </Link>
        </div>
      </div>

      {/* Form nhập trên 1 dòng + tìm kiếm + chọn sort */}
      <div className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col flex-1 min-w-[200px]">
            <span className="text-xs font-medium text-sky-900">
              Tên đối tượng (Level name)
            </span>
            <input
              type="text"
              value={levelName}
              onChange={(e) => setLevelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addLevel();
              }}
              placeholder="Nhập tên đối tượng (VD: Y4)"
              className="rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </label>

          <button
            onClick={addLevel}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 shadow-sm"
            disabled={loading}
          >
            {loading ? "Đang thêm…" : "Thêm Đối tượng"}
          </button>

          {/* Chọn sort mode */}
          <div className="flex flex-col">
            <span className="text-xs font-medium text-sky-900">Sắp xếp</span>
            <select
              value={sortMode}
              onChange={(e) => onChangeSortMode(e.target.value as SortMode)}
              className="w-40 rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              title="Chọn kiểu sắp xếp"
            >
              <option value="number">Theo số (4, 6, 10…)</option>
              <option value="name">Theo tên ABC</option>
            </select>
          </div>

          {/* Tìm kiếm nhanh */}
          <div className="ml-auto flex items-end">
            <label className="flex flex-col">
              <span className="text-xs font-medium text-sky-900">
                Tìm kiếm (Search)
              </span>
              <input
                type="text"
                placeholder="VD: Y6, 6…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-48 rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Bảng danh sách đẹp */}
      <div className="mt-6 rounded-xl border border-sky-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold text-sky-900">
            Danh sách Đối tượng (Level list)
          </h2>
          <div className="text-sm text-sky-700">
            Tổng: <span className="font-medium">{filtered.length}</span>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-b-xl">
          <table className="min-w-full border-t text-sm">
            <thead className="sticky top-0 bg-sky-100/80">
              <tr className="text-sky-900">
                <th className="px-4 py-2 text-left">Tên đối tượng (Level)</th>
                <th className="px-4 py-2 text-left w-48">Hành động (Actions)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-sky-50/50">
              {loading && levels.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={2}>
                    Đang tải…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={2}>
                    (Không có dữ liệu phù hợp)
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const isEditing = editingId === l.id;
                  return (
                    <tr key={l.id} className="hover:bg-sky-50 transition-colors">
                      <td className="px-4 py-2 font-medium text-sky-900">
                        {!isEditing ? (
                          <span>{l.name}</span>
                        ) : (
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="rounded-md border border-sky-300 px-3 py-1.5 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 w-64"
                            placeholder="Nhập tên đối tượng"
                            aria-label="Sửa tên đối tượng"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!isEditing ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(l)}
                              className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-900 hover:border-sky-400"
                              disabled={loading}
                              title="Sửa"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              onClick={() => deleteLevel(l.id)}
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
                              className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-900 hover:border-sky-400"
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
      </div>
    </div>
  );
}
