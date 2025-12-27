
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type LevelRow = { id: string; name: string };
type CohortRow = {
  id: string;
  year: number;
  level_id?: string;
  levels?: { name: string } | null; // đổi 'levels' theo tên relationship của bạn: levels / level
};

type SortBy = "year" | "level";
type SortDir = "asc" | "desc";

export default function ManageCohorts() {
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [year, setYear] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [keyword, setKeyword] = useState<string>("");

  // Modal edit
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editYear, setEditYear] = useState<string>("");
  const [editLevelId, setEditLevelId] = useState<string>("");

  // Sort state (mặc định: theo năm ↑)
  const [sortBy, setSortBy] = useState<SortBy>("year");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    void fetchLevels();
    void fetchCohorts();
  }, []);

  async function fetchLevels() {
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("levels")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) setErrorMsg(error.message);
    setLevels(data ?? []);
  }

  async function fetchCohorts() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from("cohorts")
        .select("id, year, level_id, levels(name)"); // server không cần sắp xếp, sẽ sort client-side
      if (error) {
        setErrorMsg(error.message);
        setCohorts([]);
      } else {
        setCohorts(data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  /** Kiểm tra trùng năm + level. excludeId dùng khi sửa để bỏ qua chính bản ghi đó */
  async function isDuplicateCohort(y: number, lvlId: string, excludeId?: string) {
    const query = supabase
      .from("cohorts")
      .select("id", { count: "exact" })
      .eq("year", y)
      .eq("level_id", lvlId);

    const { data, error, count } = await (excludeId ? query.neq("id", excludeId) : query);

    if (error) {
      setErrorMsg("❌ Lỗi kiểm tra trùng: " + error.message);
      return true; // chặn thao tác khi có lỗi kiểm tra
    }
    return (count ?? data?.length ?? 0) > 0;
  }

  async function addCohort() {
    const y = Number(year);
    if (!y || !levelId) {
      alert("Vui lòng nhập năm và chọn đối tượng (Level).");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      // Kiểm tra trùng
      if (await isDuplicateCohort(y, levelId)) {
        setErrorMsg("⚠️ Niên khóa và Đối tượng đã tồn tại. Vui lòng kiểm tra lại.");
        return;
      }

      const { error } = await supabase.from("cohorts").insert([{ year: y, level_id: levelId }]);
      if (error) {
        setErrorMsg("❌ Lỗi khi thêm niên khóa: " + error.message);
        return;
      }
      setYear("");
      setLevelId("");
      setStatusMsg("🎉 Đã thêm Niên khóa mới.");
      await fetchCohorts();
    } finally {
      setLoading(false);
    }
  }

  async function deleteCohort(id: string) {
    if (!confirm("Xóa Niên khóa này? Hành động không thể hoàn tác.")) return;
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const { error } = await supabase.from("cohorts").delete().eq("id", id);
      if (error) {
        setErrorMsg("❌ Xóa thất bại: " + error.message);
        return;
      }
      setStatusMsg("🎉 Đã xoá Niên khóa.");
      await fetchCohorts();
    } finally {
      setLoading(false);
    }
  }

  // Modal edit handlers
  function openEdit(row: CohortRow) {
    setEditId(row.id);
    setEditYear(String(row.year ?? ""));
    setEditLevelId(row.level_id ?? "");
    setEditOpen(true);
  }
  function closeEdit() {
    setEditOpen(false);
    setEditId("");
    setEditYear("");
    setEditLevelId("");
  }
  async function saveEdit() {
    const y = Number(editYear);
    if (!editId || !y || !editLevelId) {
      setErrorMsg("⚠️ Vui lòng nhập đầy đủ thông tin trước khi lưu.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      // Kiểm tra trùng (bỏ qua bản ghi đang sửa)
      if (await isDuplicateCohort(y, editLevelId, editId)) {
        setErrorMsg("⚠️ Niên khóa và Đối tượng đã tồn tại. Vui lòng kiểm tra lại.");
        return;
      }

      const { error } = await supabase
        .from("cohorts")
        .update({ year: y, level_id: editLevelId })
        .eq("id", editId);
      if (error) {
        setErrorMsg("❌ Lỗi khi lưu chỉnh sửa: " + error.message);
        return;
      }
      setStatusMsg("🎉 Đã cập nhật Niên khóa.");
      closeEdit();
      await fetchCohorts();
    } finally {
      setLoading(false);
    }
  }

  // Lọc theo keyword
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return cohorts;
    return cohorts.filter((c) => {
      const lvl = c.levels?.name ?? "";
      return String(c.year).includes(q) || lvl.toLowerCase().includes(q);
    });
  }, [cohorts, keyword]);

  // Sắp xếp hiển thị theo sortBy/sortDir (bấm ở dòng tiêu đề)
  const displayRows = useMemo(() => {
    const base = [...filtered];
    base.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "year") {
        cmp = a.year - b.year;
      } else {
        const an = (a.levels?.name ?? "").toLocaleLowerCase();
        const bn = (b.levels?.name ?? "").toLocaleLowerCase();
        cmp = an.localeCompare(bn, "vi");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [filtered, sortBy, sortDir]);

  // Toggle sort theo cột
  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  // Icon mũi tên sort
  function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    return (
      <span className={`inline-block ml-1 text-xs ${active ? "text-sky-700" : "text-sky-500/60"}`}>
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 bg-sky-50 min-h-[100vh]">
      {/* Title + nút quay về */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-sky-900">
            Quản lý Niên khóa (Cohort)
          </h1>
          <p className="text-sky-700/80 mt-1">
            Nhập năm + chọn Đối tượng (Level). Bạn có thể bấm tiêu đề cột để sắp xếp theo ABC hoặc theo năm.
          </p>
        </div>
        <div className="flex gap-2">
          {/* ✅ Sửa: luôn quay về /dashboard để proxy định tuyến đúng theo role */}
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
            title="Quay về Dashboard"
          >
            ← Quay về Dashboard
          </Link>
        </div>
      </div>

      {/* Thông báo trạng thái */}
      {(errorMsg || statusMsg) && (
        <div
          className={`mb-3 rounded-md border px-3 py-2 text-sm ${
            errorMsg ? "border-rose-300 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          {errorMsg ?? statusMsg}
        </div>
      )}

      {/* Form nhập trên 1 dòng */}
      <div className="rounded-xl border border-sky-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col">
            <span className="text-xs font-medium text-sky-900">Năm (Year)</span>
            <input
              type="number"
              placeholder="VD: 2025"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-32 rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
          </label>

          <label className="flex flex-col min-w-[180px]">
            <span className="text-xs font-medium text-sky-900">Đối tượng (Level)</span>
            <select
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
              className="rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            >
              <option value="">-- Chọn Đối tượng --</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={addCohort}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 shadow-sm"
            disabled={loading}
          >
            {loading ? "Đang thêm…" : "Thêm Niên khóa"}
          </button>

          {/* Tìm kiếm nhanh */}
          <div className="ml-auto flex items-end">
            <label className="flex flex-col">
              <span className="text-xs font-medium text-sky-900">Tìm kiếm (Search)</span>
              <input
                type="text"
                placeholder="VD: 2026, Y6…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-48 rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Bảng danh sách với sort ở tiêu đề */}
      <div className="mt-6 rounded-xl border border-sky-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold text-sky-900">Danh sách Niên khóa (Cohort list)</h2>
          <div className="text-sm text-sky-700">
            Tổng: <span className="font-medium">{displayRows.length}</span>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-b-xl">
          <table className="min-w-full border-t text-sm">
            <thead className="sticky top-0 bg-sky-100/80">
              <tr className="text-sky-900">
                <th className="px-4 py-2 text-left w-32">
                  <button
                    type="button"
                    onClick={() => toggleSort("year")}
                    className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                    title="Sắp xếp theo Năm"
                  >
                    Năm (Year)
                    <SortArrow active={sortBy === "year"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort("level")}
                    className="inline-flex items-center gap-1 text-sky-900 hover:text-sky-800"
                    title="Sắp xếp theo Đối tượng (ABC)"
                  >
                    Đối tượng (Level)
                    <SortArrow active={sortBy === "level"} dir={sortDir} />
                  </button>
                </th>
                <th className="px-4 py-2 text-left w-44">Hành động (Actions)</th>
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-sky-50/50">
              {loading && cohorts.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={3}>
                    Đang tải…
                  </td>
                </tr>
              ) : displayRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sky-700" colSpan={3}>
                    (Không có dữ liệu phù hợp)
                  </td>
                </tr>
              ) : (
                displayRows.map((c) => (
                  <tr key={c.id} className="hover:bg-sky-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-sky-900">{c.year}</td>
                    <td className="px-4 py-2">{c.levels?.name ?? "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded-md border border-sky-300 bg-white px-3 py-1 text-xs text-sky-800 hover:bg-sky-50"
                          disabled={loading}
                          title="Sửa"
                        >
                          ✏️ Sửa
                        </button>
                        <button
                          onClick={() => deleteCohort(c.id)}
                          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs text-rose-700 hover:bg-rose-100"
                          disabled={loading}
                          title="Xóa"
                        >
                          🗑️ Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit Cohort */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white shadow-lg border border-sky-200">
            <div className="flex items-center justify-between border-b border-sky-200 px-4 py-3">
              <h4 className="text-base font-semibold text-sky-900">Sửa Niên khóa</h4>
              <button
                onClick={closeEdit}
                className="rounded-md px-2 py-1 text-sm text-sky-700 hover:bg-sky-50"
                title="Đóng"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3 text-sm space-y-3">
              <div className="flex gap-3">
                <label className="flex flex-col">
                  <span className="text-xs font-medium text-sky-900">Năm (Year)</span>
                  <input
                    type="number"
                    placeholder="VD: 2025"
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className="w-32 rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                  />
                </label>

                <label className="flex flex-col min-w-[180px]">
                  <span className="text-xs font-medium text-sky-900">Đối tượng (Level)</span>
                  <select
                    value={editLevelId}
                    onChange={(e) => setEditLevelId(e.target.value)}
                    className="rounded-md border border-sky-200 px-3 py-2 text-sm text-sky-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                  >
                    <option value="">-- Chọn Đối tượng --</option>
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {errorMsg && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {errorMsg}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-sky-200 px-4 py-3">
              <button
                onClick={closeEdit}
                className="rounded-md border border-sky-300 bg-white px-3 py-1 text-sm text-sky-800 hover:bg-sky-50"
              >
                Hủy
              </button>
              <button
                onClick={saveEdit}
                className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
                disabled={loading}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
