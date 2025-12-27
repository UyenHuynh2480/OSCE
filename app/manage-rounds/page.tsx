
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { format } from "date-fns";

// Supabase client (đổi nếu bạn dùng '@/lib/supabaseClient')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Sentinel cho "Tất cả"
const ALL = "__all__";

type RoundViewRow = {
  id: string;
  cohort_id: string;
  round_number: number;
  date: string | null; // yyyy-MM-dd (hoặc null)
  display_name?: string; // từ exam_rounds_view
  levelName?: string; // merge để lọc
  cohortYear?: number; // merge để lọc
};

/** ========= DatePicker dạng Popover (gọn, chỉ bung khi click) ========= */
type DatePopoverInputProps = {
  value?: Date;
  onChange: (d?: Date) => void;
  placeholder?: string;
  className?: string;
  disabledDates?: (date: Date) => boolean; // tuỳ chọn: chặn ngày không hợp lệ
};

function DatePopoverInput({
  value,
  onChange,
  placeholder = "Chọn ngày...",
  className = "",
  disabledDates,
}: DatePopoverInputProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            "flex w-full items-center justify-between rounded-md border border-sky-200 bg-white px-3 py-2 text-left text-sky-900 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300 " +
            className
          }
        >
          <span className={value ? "" : "text-sky-700/60"}>
            {value ? format(value, "dd/MM/yyyy") : placeholder}
          </span>
          {/* icon lịch nhỏ */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="ml-2 h-4 w-4 text-sky-700/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="p-0 border-sky-200 w-auto bg-white">
        {/* Thu gọn popover bằng cách giới hạn width */}
        <div className="p-2 w-[280px]">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => onChange(d ?? undefined)}
            className="rounded-md border border-sky-200"
            disabled={disabledDates}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function ManageRoundsPage() {
  /** ===== Dữ liệu nền ===== */
  const [levels, setLevels] = useState<any[]>([]);
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [examRounds, setExamRounds] = useState<RoundViewRow[]>([]);

  /** ===== Tạo mới ===== */
  const [selectedLevelCreate, setSelectedLevelCreate] = useState<string>("");
  const [selectedCohortCreate, setSelectedCohortCreate] = useState<string>("");
  const [roundNumberCreate, setRoundNumberCreate] = useState<number>(1);
  const [examDateCreate, setExamDateCreate] = useState<Date | undefined>(undefined);

  /** ===== Sửa (modal) ===== */
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>("");
  const [editCohortId, setEditCohortId] = useState<string>("");
  const [editRoundNumber, setEditRoundNumber] = useState<number>(1);
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);

  /** ===== Xóa (confirm modal) ===== */
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [toDelete, setToDelete] = useState<RoundViewRow | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  /** ===== Bộ lọc & tìm kiếm ===== */
  const [searchInput, setSearchInput] = useState<string>(""); // thô (gõ)
  const [searchTerm, setSearchTerm] = useState<string>(""); // debounce 300ms
  const [filterLevelId, setFilterLevelId] = useState<string>(ALL);
  const [filterCohortYear, setFilterCohortYear] = useState<string>(ALL);
  const [filterRoundNo, setFilterRoundNo] = useState<string>("");
  const [filterExactDate, setFilterExactDate] = useState<Date | undefined>(undefined); // ngày thi chính xác

  /** ===== Phân trang ===== */
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  /** ===== Trạng thái UI ===== */
  const [status, setStatus] = useState<string>("");

  /** ===== Vai trò người dùng (để hiển thị nút quay lại phù hợp) ===== */
  const [userRole, setUserRole] = useState<string>("");

  /** Debounce tìm kiếm nhanh (300ms) */
  useEffect(() => {
    const h = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(h);
  }, [searchInput]);

  /** Lấy vai trò đăng nhập hiện tại (profiles.role) — vẫn giữ nếu cần ở nơi khác */
  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("user_id", user.id)
            .single();
          const roleRaw = String(prof?.role ?? "").toLowerCase();
          setUserRole(roleRaw === "admin" || roleRaw === "uploader" ? roleRaw : "");
        }
      } catch {
        // bỏ qua
      }
    })();
  }, []);

  /** Load levels & cohorts */
  useEffect(() => {
    (async () => {
      const [{ data: lvl }, { data: coh }] = await Promise.all([
        supabase.from("levels").select("*"),
        supabase.from("cohorts").select("*"),
      ]);
      setLevels(lvl ?? []);
      setCohorts(coh ?? []);
    })();
  }, []);

  /** Fetch từ exam_rounds_view + merge để lọc */
  const fetchExamRounds = async () => {
    const { data: roundsView, error } = await supabase
      .from("exam_rounds_view")
      .select("id, display_name, cohort_id, round_number, date")
      .order("date", { ascending: true });

    if (error) {
      setExamRounds([]);
      setStatus("❌ Lỗi tải danh sách đợt thi: " + error.message);
      return;
    }
    if (!roundsView) {
      setExamRounds([]);
      return;
    }

    const levelsMap = new Map(levels.map((l: any) => [String(l.id), l.name]));
    const cohortsMap = new Map(
      cohorts.map((c: any) => [String(c.id), { year: c.year, level_id: String(c.level_id) }])
    );

    const merged: RoundViewRow[] = roundsView.map((r: any) => {
      const coh = cohortsMap.get(String(r.cohort_id));
      const lvlName = coh ? levelsMap.get(String(coh.level_id)) : undefined;
      return {
        id: r.id,
        cohort_id: r.cohort_id,
        round_number: r.round_number,
        date: r.date ?? null,
        display_name: r.display_name,
        levelName: lvlName,
        cohortYear: coh?.year,
      };
    });
    setExamRounds(merged);
  };

  useEffect(() => {
    fetchExamRounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, cohorts]);

  /** Tạo đợt thi */
  const handleCreateRound = async () => {
    if (!selectedCohortCreate || !roundNumberCreate || !examDateCreate) {
      setStatus("⚠️ Vui lòng nhập đầy đủ thông tin tạo đợt thi.");
      return;
    }
    const { error } = await supabase.from("exam_rounds").insert([
      {
        cohort_id: selectedCohortCreate,
        round_number: roundNumberCreate,
        date: format(examDateCreate, "yyyy-MM-dd"),
      },
    ]);

    if (error) {
      setStatus("❌ Lỗi tạo đợt thi: " + error.message);
    } else {
      setStatus("🎉 Tạo đợt thi thành công!");
      setSelectedLevelCreate("");
      setSelectedCohortCreate("");
      setRoundNumberCreate(1);
      setExamDateCreate(undefined);
      await fetchExamRounds();
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    }
  };

  /** Edit modal */
  const openEdit = (row: RoundViewRow) => {
    setEditId(row.id);
    setEditCohortId(String(row.cohort_id));
    setEditRoundNumber(row.round_number);
    setEditDate(row.date ? new Date(row.date) : undefined);
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditId("");
    setEditCohortId("");
    setEditRoundNumber(1);
    setEditDate(undefined);
  };
  const saveEdit = async () => {
    if (!editId || !editCohortId || !editRoundNumber || !editDate) {
      setStatus("⚠️ Vui lòng nhập đủ thông tin trước khi lưu sửa.");
      return;
    }
    const { error } = await supabase
      .from("exam_rounds")
      .update({
        cohort_id: editCohortId,
        round_number: editRoundNumber,
        date: format(editDate, "yyyy-MM-dd"),
      })
      .eq("id", editId);

    if (error) {
      setStatus("❌ Lỗi khi lưu chỉnh sửa: " + error.message);
    } else {
      setStatus("🎉 Đã cập nhật đợt thi!");
      closeEdit();
      await fetchExamRounds();
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    }
  };

  /** Delete confirm modal */
  const openConfirmDelete = (row: RoundViewRow) => {
    setToDelete(row);
    setConfirmOpen(true);
  };
  const closeConfirmDelete = () => {
    setConfirmOpen(false);
    setDeleting(false);
    setToDelete(null);
  };
  const doConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("exam_rounds")
      .delete()
      .eq("id", toDelete.id);

    if (error) {
      setStatus("❌ Xóa thất bại: " + error.message);
      setDeleting(false);
    } else {
      setStatus("🎉 Đã xoá đợt thi.");
      setDeleting(false);
      closeConfirmDelete();
      await fetchExamRounds();
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    }
  };

  /** Lọc & sắp xếp */
  const filteredRounds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    const matchQuick = (r: RoundViewRow) => {
      if (!q) return true;
      const dateText = r.date ? format(new Date(r.date), "dd/MM/yyyy") : "";
      return (
        (r.display_name ?? "").toLowerCase().includes(q) ||
        (r.levelName ?? "").toLowerCase().includes(q) ||
        String(r.cohortYear ?? "").toLowerCase().includes(q) ||
        String(r.round_number ?? "").toLowerCase().includes(q) ||
        dateText.toLowerCase().includes(q)
      );
    };

    const matchLevel = (r: RoundViewRow) => {
      if (filterLevelId === ALL) return true;
      const lvlNameById = levels.find((l) => String(l.id) === filterLevelId)?.name ?? "";
      return (r.levelName ?? "") === lvlNameById;
    };

    const matchCohort = (r: RoundViewRow) => {
      if (filterCohortYear === ALL) return true;
      return String(r.cohortYear ?? "") === filterCohortYear;
    };

    const matchRoundNo = (r: RoundViewRow) => {
      if (!filterRoundNo) return true;
      return String(r.round_number ?? "") === filterRoundNo;
    };

    const matchExactDate = (r: RoundViewRow) => {
      if (!filterExactDate) return true;
      if (!r.date) return false;
      const fmtR = format(new Date(r.date), "yyyy-MM-dd");
      const fmtF = format(filterExactDate, "yyyy-MM-dd");
      return fmtR === fmtF;
    };

    return examRounds
      .filter(matchQuick)
      .filter(matchLevel)
      .filter(matchCohort)
      .filter(matchRoundNo)
      .filter(matchExactDate)
      .sort((a, b) => {
        if ((a.levelName ?? "") !== (b.levelName ?? "")) {
          return (a.levelName ?? "").localeCompare(b.levelName ?? "");
        }
        if ((a.cohortYear ?? 0) !== (b.cohortYear ?? 0)) {
          return (a.cohortYear ?? 0) - (b.cohortYear ?? 0);
        }
        if ((a.round_number ?? 0) !== (b.round_number ?? 0)) {
          return (a.round_number ?? 0) - (b.round_number ?? 0);
        }
        return (
          new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime()
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    examRounds,
    searchTerm,
    filterLevelId,
    filterCohortYear,
    filterRoundNo,
    filterExactDate,
    levels,
  ]);

  /** Phân trang */
  const totalPages = Math.max(1, Math.ceil(filteredRounds.length / itemsPerPage));
  const paginatedRounds = filteredRounds.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  /** Reset bộ lọc */
  const resetFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setFilterLevelId(ALL);
    setFilterCohortYear(ALL);
    setFilterRoundNo("");
    setFilterExactDate(undefined);
    setCurrentPage(1);
  };

  /** ✅ Nút quay về Dashboard: luôn dẫn về /dashboard để proxy tự điều hướng đúng theo role */
  const backHref = "/dashboard";
  const backLabel = "← Quay về Dashboard";

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto bg-sky-50 min-h-[100vh]">
      {/* Header */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-sky-900">
            Quản lý đợt thi (Exam Rounds)
          </h1>
        </div>
        {/* Nút quay lại theo vai trò (proxy định tuyến) + tổng kết quả */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:block text-sm text-sky-700">
            {filteredRounds.length} kết quả
          </div>
          <Link
            href={backHref}
            className="inline-flex items-center whitespace-nowrap px-3 py-1.5 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
            title={backLabel}
          >
            {backLabel}
          </Link>
        </div>
      </div>

      {/* Khung 2 cột: 30% / 70% (desktop), 1 cột ở mobile */}
      <div className="grid grid-cols-1 lg:[grid-template-columns:30%_70%] gap-6">
        {/* CỘT TRÁI: Tạo đợt thi */}
        <div className="space-y-4 border border-sky-200 p-4 rounded-xl shadow-sm bg-white/90 backdrop-blur lg:sticky lg:top-4 lg:self-start">
          {/* Level */}
          <div>
            <Label className="text-sky-900">Đối tượng (Level)</Label>
            <Select
              value={selectedLevelCreate}
              onValueChange={setSelectedLevelCreate}
            >
              <SelectTrigger className="mt-2 lg:max-w-[420px] bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300">
                <SelectValue placeholder="Chọn Level" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {levels.map((lvl) => (
                  <SelectItem
                    key={lvl.id}
                    value={String(lvl.id)}
                    className="data-[highlighted]:bg-sky-50"
                  >
                    {lvl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cohort */}
          <div>
            <Label className="text-sky-900">Niên khóa (Cohort)</Label>
            <Select
              value={selectedCohortCreate}
              onValueChange={setSelectedCohortCreate}
            >
              <SelectTrigger className="mt-2 lg:max-w-[420px] bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300">
                <SelectValue placeholder="Chọn Cohort" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {cohorts
                  .filter(
                    (c) =>
                      !selectedLevelCreate ||
                      String(c.level_id) === String(selectedLevelCreate)
                  )
                  .map((c) => (
                    <SelectItem
                      key={c.id}
                      value={String(c.id)}
                      className="data-[highlighted]:bg-sky-50"
                    >
                      {c.year}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Round number */}
          <div>
            <Label className="text-sky-900">Đợt thi (Round Number)</Label>
            <Input
              type="number"
              min={1}
              value={roundNumberCreate}
              onChange={(e) => setRoundNumberCreate(Number(e.target.value))}
              className="mt-2 lg:max-w-[420px] bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300"
            />
          </div>

          {/* Exam date - Popover */}
          <div>
            <Label className="text-sky-900">Ngày thi (Exam Date)</Label>
            <DatePopoverInput
              value={examDateCreate}
              onChange={setExamDateCreate}
              placeholder="Chọn ngày thi…"
              className="mt-2 lg:max-w-[420px]"
            />
            {examDateCreate && (
              <p className="text-sm mt-2 text-sky-800">
                Ngày đã chọn:{" "}
                <span className="font-medium">
                  {format(examDateCreate, "dd/MM/yyyy")}
                </span>
              </p>
            )}
          </div>

          {/* Save button */}
          <Button
            onClick={handleCreateRound}
            className="w-full lg:w-auto bg-sky-600 hover:bg-sky-700 text-white mt-2 rounded-lg shadow-sm disabled:opacity-60"
            disabled={!selectedCohortCreate || !roundNumberCreate || !examDateCreate}
          >
            Tạo đợt thi
          </Button>
        </div>

        {/* CỘT PHẢI: Bộ lọc + Danh sách (rộng hơn) */}
        <div className="border border-sky-200 rounded-xl p-4 bg-white/90 backdrop-blur">
          <h2 className="text-xl font-semibold mb-4 text-sky-900">
            Danh sách đợt thi (Exam Rounds List)
          </h2>

          {/* Bộ lọc nâng cao */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2 lg:col-span-4">
              <Label className="text-sky-900">Tìm kiếm nhanh (Quick search)</Label>
              <Input
                placeholder="Nhập Level/Cohort/Round/Ngày (dd/mm/yyyy)..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setCurrentPage(1);
                }}
                className="mt-1 bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300"
              />
            </div>

            <div>
              <Label className="text-sky-900">Đối tượng (Level)</Label>
              <Select
                value={filterLevelId}
                onValueChange={(v) => {
                  setFilterLevelId(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-white text-sky-900 mt-1 border-sky-200 focus:ring-2 focus:ring-sky-300">
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value={ALL} className="data-[highlighted]:bg-sky-50">
                    Tất cả
                  </SelectItem>
                  {levels.map((lvl) => (
                    <SelectItem
                      key={lvl.id}
                      value={String(lvl.id)}
                      className="data-[highlighted]:bg-sky-50"
                    >
                      {lvl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sky-900">Niên khóa (Cohort)</Label>
              <Select
                value={filterCohortYear}
                onValueChange={(v) => {
                  setFilterCohortYear(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="bg-white text-sky-900 mt-1 border-sky-200 focus:ring-2 focus:ring-sky-300">
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value={ALL} className="data-[highlighted]:bg-sky-50">
                    Tất cả
                  </SelectItem>
                  {[...new Set(examRounds.map((r) => r.cohortYear))]
                    .filter((y): y is number => typeof y === "number")
                    .sort((a, b) => a - b)
                    .map((y) => (
                      <SelectItem
                        key={y}
                        value={String(y)}
                        className="data-[highlighted]:bg-sky-50"
                      >
                        {y}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sky-900">Đợt (Round #)</Label>
              <Input
                type="number"
                min={1}
                placeholder="VD: 1, 2..."
                value={filterRoundNo}
                onChange={(e) => {
                  setFilterRoundNo(e.target.value);
                  setCurrentPage(1);
                }}
                className="mt-1 bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300"
              />
            </div>

            {/* Ngày thi chính xác - Popover */}
            <div>
              <Label className="text-sky-900">Ngày thi (Exam date)</Label>
              <DatePopoverInput
                value={filterExactDate}
                onChange={(d) => {
                  setFilterExactDate(d ?? undefined);
                  setCurrentPage(1);
                }}
                placeholder="Chọn ngày lọc…"
                className="mt-1"
              />
              {filterExactDate && (
                <p className="text-xs mt-1 text-sky-800">
                  Đang lọc theo:{" "}
                  <span className="font-medium">
                    {format(filterExactDate, "dd/MM/yyyy")}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Actions bộ lọc */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              onClick={resetFilters}
              className="border-sky-300 text-sky-800 hover:bg-sky-50"
            >
              Reset bộ lọc
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-sm text-sky-900">Items/page</Label>
              <Select
                value={String(itemsPerPage)}
                onValueChange={(v) => {
                  setItemsPerPage(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-24 bg-white text-sky-900 border-sky-200 focus:ring-2 focus:ring-sky-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {[5, 10, 20, 50].map((n) => (
                    <SelectItem
                      key={n}
                      value={String(n)}
                      className="data-[highlighted]:bg-sky-50"
                    >
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bảng danh sách (mở rộng chiều rộng theo cột phải) */}
          <div className="mt-4 max-h-[60vh] overflow-auto rounded-xl border border-sky-200 w-full">
            {paginatedRounds.length === 0 ? (
              <p className="text-sky-800 p-3">Không có dữ liệu phù hợp.</p>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-sky-100/80 text-left text-sky-900">
                    <th className="p-2 border border-sky-200">Hiển thị</th>
                    <th className="p-2 border border-sky-200">Đối tượng</th>
                    <th className="p-2 border border-sky-200">Niên khóa</th>
                    <th className="p-2 border border-sky-200">Đợt</th>
                    <th className="p-2 border border-sky-200">Ngày thi</th>
                    <th className="p-2 border border-sky-200 w-44">Hành động</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:nth-child(even)]:bg-sky-50/50">
                  {paginatedRounds.map((round) => (
                    <tr
                      key={round.id}
                      className="hover:bg-sky-50 transition-colors"
                    >
                      <td className="p-2 border border-sky-200 text-sky-900">
                        {round.display_name ?? "-"}
                      </td>
                      <td className="p-2 border border-sky-200">
                        <span className="inline-flex items-center rounded-md bg-sky-100 text-sky-700 px-2 py-0.5 text-xs">
                          {round.levelName ?? "-"}
                        </span>
                      </td>
                      <td className="p-2 border border-sky-200">
                        <span className="inline-flex items-center rounded-md bg-sky-100 text-sky-700 px-2 py-0.5 text-xs">
                          {round.cohortYear ?? "-"}
                        </span>
                      </td>
                      <td className="p-2 border border-sky-200">
                        <span className="inline-flex items-center rounded-md bg-sky-100 text-sky-700 px-2 py-0.5 text-xs">
                          {round.round_number}
                        </span>
                      </td>
                      <td className="p-2 border border-sky-200 text-sky-900">
                        {round.date
                          ? format(new Date(round.date), "dd/MM/yyyy")
                          : "-"}
                      </td>
                      <td className="p-2 border border-sky-200">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            className="border-sky-300 text-sky-800 hover:bg-sky-50"
                            onClick={() => openEdit(round)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            className="bg-rose-500 hover:bg-rose-600 text-white"
                            onClick={() => openConfirmDelete(round)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4 gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    variant={page === currentPage ? "default" : "outline"}
                    className={
                      page === currentPage
                        ? "bg-sky-600 hover:bg-sky-700 text-white"
                        : "border-sky-300 text-sky-800 hover:bg-sky-50"
                    }
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                )
              )}
            </div>
          )}

          {/* Tổng số kết quả */}
          <div className="mt-2 text-sm text-sky-800">
            Tổng:{" "}
            <span className="font-medium">{filteredRounds.length}</span> đợt thi
            • Trang {currentPage}/{totalPages}
          </div>
        </div>
      </div>

      {/* ===== Modal Edit ===== */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-sky-200">
            <div className="flex items-center justify-between border-b border-sky-200 px-4 py-3">
              <h4 className="text-base font-semibold text-sky-900">Sửa đợt thi</h4>
              <button
                onClick={closeEdit}
                className="rounded-md px-2 py-1 text-sm text-sky-700 hover:bg-sky-50"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3 text-sm space-y-3">
              <div>
                <Label className="text-sky-900">Niên khóa (Cohort)</Label>
                <Select value={editCohortId} onValueChange={setEditCohortId}>
                  <SelectTrigger className="bg-white text-sky-900 mt-1 border-sky-200 focus:ring-2 focus:ring-sky-300">
                    <SelectValue placeholder="Chọn Cohort" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {cohorts.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={String(c.id)}
                        className="data-[highlighted]:bg-sky-50"
                      >
                        {c.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sky-900">Đợt thi (Round Number)</Label>
                <Input
                  type="number"
                  min={1}
                  value={editRoundNumber}
                  onChange={(e) => setEditRoundNumber(Number(e.target.value))}
                  className="bg-white text-sky-900 mt-1 border-sky-200 focus:ring-2 focus:ring-sky-300"
                />
              </div>

              <div>
                <Label className="text-sky-900">Ngày thi (Exam Date)</Label>
                <DatePopoverInput
                  value={editDate}
                  onChange={setEditDate}
                  placeholder="Chọn ngày thi…"
                  className="mt-1 lg:max-w-[420px]"
                />
                {editDate && (
                  <p className="text-xs mt-2 text-sky-800">
                    Ngày đã chọn:{" "}
                    <span className="font-medium">
                      {format(editDate, "dd/MM/yyyy")}
                    </span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-sky-200 px-4 py-3">
              <Button
                variant="outline"
                onClick={closeEdit}
                className="border-sky-300 text-sky-800 hover:bg-sky-50"
              >
                Hủy
              </Button>
              <Button
                className="bg-sky-600 hover:bg-sky-700 text-white"
                onClick={saveEdit}
              >
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Xác nhận Xóa ===== */}
      {confirmOpen && toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/20 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white shadow-lg border border-sky-200">
            <div className="flex items-center justify-between border-b border-sky-200 px-4 py-3">
              <h4 className="text-base font-semibold text-sky-900">
                Xác nhận xoá đợt thi
              </h4>
              <button
                onClick={closeConfirmDelete}
                className="rounded-md px-2 py-1 text-sm text-sky-700 hover:bg-sky-50"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3 text-sm">
              <p className="text-sky-900">Bạn chắc chắn muốn xoá đợt thi sau?</p>
              <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 p-3">
                <div>
                  <span className="font-semibold text-sky-900">Hiển thị:</span>{" "}
                  <span className="text-sky-800">
                    {toDelete.display_name ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-sky-900">Level:</span>{" "}
                  <span className="text-sky-800">
                    {toDelete.levelName ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-sky-900">Niên khóa:</span>{" "}
                  <span className="text-sky-800">
                    {toDelete.cohortYear ?? "-"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-sky-900">Đợt:</span>{" "}
                  <span className="text-sky-800">{toDelete.round_number}</span>
                </div>
                <div>
                  <span className="font-semibold text-sky-900">Ngày thi:</span>{" "}
                  <span className="text-sky-800">
                    {toDelete.date
                      ? format(new Date(toDelete.date), "dd/MM/yyyy")
                      : "-"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs text-rose-600">
                Hành động không thể hoàn tác.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-sky-200 px-4 py-3">
              <Button
                variant="outline"
                onClick={closeConfirmDelete}
                disabled={deleting}
                className="border-sky-300 text-sky-800 hover:bg-sky-50"
              >
                Hủy
              </Button>
              <Button
                className="bg-rose-500 hover:bg-rose-600 text-white"
                onClick={doConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "Đang xoá..." : "Xoá"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
``
