
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type {
  UUID,
  Level,
  Cohort,
  Station,
  ExamRoundView,
  FixedRubricItem,
  ItemLevelKey,
} from "@/types/osce";
import {
  getMaxTotalScore,
  getMaxScoreOfItem,
  downloadJSON,
  buildRubricFilename,
} from "@/utils/rubric";

// Word export
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";

/** ===== Types local mở rộng ===== */
// Mở rộng item để hỗ trợ auto tính theo %
type LocalRubricItem = FixedRubricItem & {
  autoByPercent?: boolean; // mặc định: true
  overridePercents?: Record<ItemLevelKey, number>; // % 0..100 cho item (nếu override)
};

type LevelColor = { bg: string; border: string; title: string };

type GlobalRatingConfig = {
  enabled: boolean;
  required: boolean;
  label: string;
  scale: ItemLevelKey[]; // ["Fail","Pass","Good","Excellent"]
  scores: Record<ItemLevelKey, number>;
  mandatoryCommentLevels: ItemLevelKey[];
  levelColors: Record<ItemLevelKey, LevelColor>;
};

type GraderCommentConfig = {
  enabled: boolean;
  required: boolean;
  placeholder: string;
  maxLength?: number;
};

type PercentConfig = {
  enabled: boolean; // bật/tắt cơ chế auto theo %
  percentsGlobal: Record<ItemLevelKey, number>; // % 0..100 cho Fail/Pass/Good/Excellent
};

type RubricFormState = {
  level_id: UUID | "";
  cohort_id: UUID | "";
  exam_round_id: UUID | "";
  station_id: UUID | "";
  task_name: string;
  name: string; // Tên rubric hiển thị; nếu trống sẽ ghép tự động
  items: LocalRubricItem[];
  global_rating: GlobalRatingConfig;
  grader_comment: GraderCommentConfig;
  percentConfig: PercentConfig; // NEW
};

/** ===== Constants mặc định ===== */
const LEVEL_KEYS: ItemLevelKey[] = ["Fail", "Pass", "Good", "Excellent"];

const DEFAULT_LEVEL_COLORS: Record<ItemLevelKey, LevelColor> = {
  Fail: { bg: "#fee2e2", border: "#fecaca", title: "#b91c1c" },
  Pass: { bg: "#fef9c3", border: "#fde68a", title: "#a16207" },
  Good: { bg: "#dbeafe", border: "#bfdbfe", title: "#1d4ed8" },
  Excellent: { bg: "#dcfce7", border: "#bbf7d0", title: "#15803d" },
};

const blankItem = (index = 1): LocalRubricItem => ({
  id: `i${index}`,
  text: "",
  levels: {
    Fail: { score: 0, desc: "" },
    Pass: { score: 1, desc: "" },
    Good: { score: 2, desc: "" },
    Excellent: { score: 3, desc: "" },
  },
  autoByPercent: true,
  overridePercents: undefined,
});

const INITIAL_FORM: RubricFormState = {
  level_id: "",
  cohort_id: "",
  exam_round_id: "",
  station_id: "",
  task_name: "",
  name: "",
  items: [blankItem(1)],
  global_rating: {
    enabled: true,
    required: true,
    label: "Đánh giá tổng thể (Global Rating)",
    scale: LEVEL_KEYS,
    scores: { Fail: 0, Pass: 1, Good: 2, Excellent: 3 },
    mandatoryCommentLevels: ["Fail", "Pass"],
    levelColors: DEFAULT_LEVEL_COLORS,
  },
  grader_comment: {
    enabled: true,
    required: false,
    placeholder:
      "Nhập nhận xét tổng thể, điểm mạnh/yếu, khuyến nghị cải thiện...",
    maxLength: 500,
  },
  percentConfig: {
    enabled: true,
    // Mặc định: người dùng có thể đổi tại UI
    percentsGlobal: { Fail: 0, Pass: 50, Good: 75, Excellent: 100 },
  },
};

/** ===== Helper: tính điểm từ % dựa trên điểm Excellent ===== */
const calcScoresFromExcellent = (
  excellentScore: number,
  percents: Record<ItemLevelKey, number>
) => {
  const ratio = (lv: ItemLevelKey) => Math.max(0, (percents[lv] ?? 0) / 100);
  const calc = (lv: ItemLevelKey) =>
    Number((excellentScore * ratio(lv)).toFixed(2));
  return {
    Fail: { score: calc("Fail") },
    Pass: { score: calc("Pass") },
    Good: { score: calc("Good") },
    Excellent: { score: calc("Excellent") },
  };
};

/** ================================================================
 * 🚀 FRONTEND PATCH: tránh duplicate & tự gắn hậu tố Version khi trùng
 * ================================================================ */
// Kiểm tra đã tồn tại rubric theo ngữ cảnh (Level/Cohort/Round/Station [+Task])
const checkDuplicateByContext = async (ctx: {
  level_id: UUID;
  cohort_id: UUID;
  exam_round_id: UUID;
  station_id: UUID;
  task_name?: string | null;
}) => {
  let q = supabase
    .from("rubrics")
    .select("id")
    .eq("level_id", ctx.level_id)
    .eq("cohort_id", ctx.cohort_id)
    .eq("exam_round_id", ctx.exam_round_id)
    .eq("station_id", ctx.station_id);

  // Nếu DB đang giữ UNIQUE theo task_name, kiểm tra thêm theo task_name
  if (typeof ctx.task_name === "string" && ctx.task_name.trim() !== "") {
    q = q.eq("task_name", ctx.task_name.trim());
  }
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0; // true = có trùng
};

// Tạo tên phiên bản để phân biệt khi trùng ngữ cảnh
const ensureUniqueName = (base: string | null, note?: string) => {
  const stamp = new Date().toLocaleString(); // ví dụ: 27/11/2025, 14:33:01
  const suffix = ` — (Version ${stamp})${note ? ` — NOTE: ${note}` : ""}`;
  return (base?.trim() ?? null) ? `${base!.trim()}${suffix}` : suffix;
};

/** ===== Preview Modal ===== */
function PreviewRubricModal({
  open,
  onClose,
  onConfirm,
  form,
  levels,
  cohorts,
  rounds,
  stations,
  maxTotal,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  form: RubricFormState;
  levels: Level[];
  cohorts: Cohort[];
  rounds: ExamRoundView[];
  stations: Station[];
  maxTotal: number;
}) {
  if (!open) return null;
  const levelName = levels.find((l) => l.id === form.level_id)?.name ?? "-";
  const cohortYear = cohorts.find((c) => c.id === form.cohort_id)?.year ?? "-";
  const roundName =
    rounds.find((r) => r.id === form.exam_round_id)?.display_name ?? "-";
  const stationName =
    stations.find((s) => s.id === form.station_id)?.name ?? "-";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-4xl rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold">Xem trước rubric (Preview)</h3>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Đóng
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-4 py-3 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="font-medium">Đối tượng (Level):</span>{" "}
              {levelName}
            </div>
            <div>
              <span className="font-medium">Niên khóa (Cohort):</span>{" "}
              {cohortYear}
            </div>
            <div>
              <span className="font-medium">Đợt thi (Round):</span> {roundName}
            </div>
            <div>
              <span className="font-medium">Trạm (Station):</span>{" "}
              {stationName}
            </div>
            <div className="md:col-span-2">
              <span className="font-medium">Tác vụ (Task):</span>{" "}
              {form.task_name || "-"}
            </div>
            <div className="md:col-span-2">
              <span className="font-medium">Tổng điểm tối đa:</span>{" "}
              {maxTotal.toFixed(2)} / 10
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-base font-semibold">Các mục chấm (Items)</h4>
            <div className="mt-2 space-y-3">
              {form.items.map((it, idx) => (
                <div key={it.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      Mục chấm #{idx + 1} —{" "}
                      <em>{it.text || "(chưa có mô tả)"}</em>
                    </div>
                    <div className="text-xs text-gray-500">ID: {it.id}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(LEVEL_KEYS as ItemLevelKey[]).map((k) => (
                      <div key={k} className="rounded-md border p-2">
                        <div className="text-xs font-semibold">{k}</div>
                        <div className="text-xs mt-1">
                          Điểm:{" "}
                          <strong>{it.levels[k]?.score ?? "-"}</strong>
                        </div>
                        <div className="text-xs mt-1">
                          Mô tả: {it.levels[k]?.desc || "(chưa có mô tả)"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-base font-semibold">
              Đánh giá tổng thể (Global Rating)
            </h4>
            <div className="text-sm text-gray-700">
              Trạng thái: {form.global_rating.enabled ? "Bật" : "Tắt"} •
              Bắt buộc: {form.global_rating.required ? "Có" : "Không"} • Nhãn:{" "}
              <em>{form.global_rating.label || "-"}</em>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-base font-semibold">
              Nhận xét của giám khảo (Grader comment)
            </h4>
            <div className="text-sm text-gray-700">
              Bật: {form.grader_comment.enabled ? "Có" : "Không"} • Luôn bắt
              buộc: {form.grader_comment.required ? "Có" : "Không"} • Tối đa:{" "}
              {form.grader_comment.maxLength ?? "-"} ký tự
            </div>
            <div className="mt-1 text-xs italic text-gray-500">
              Placeholder: {form.grader_comment.placeholder || "(không có)"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Quay lại
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  );
}

/** ===== Catalog Section (Danh sách rubrics + Sửa/Xóa/Sao chép) ===== */
function RubricsCatalogSection({
  levels,
  roundsAll,
  stations,
}: {
  levels: Level[];
  roundsAll: ExamRoundView[]; // danh sách rounds toàn hệ
  stations: Station[];
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState<string>("");
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Modal sao chép
  const [copyOpen, setCopyOpen] = useState<boolean>(false);
  const [copySourceFull, setCopySourceFull] = useState<any | null>(null);
  const [cohortsAll, setCohortsAll] = useState<Cohort[]>([]); // NEW: tải toàn bộ cohort
  const [target, setTarget] = useState<{
    level_id: UUID | "";
    cohort_id: UUID | "";
    exam_round_id: UUID | "";
    station_id: UUID | "";
  }>({ level_id: "", cohort_id: "", exam_round_id: "", station_id: "" });
  const [note, setNote] = useState<string>("");

  /** NEW: trạng thái sort */
  const [sortKey, setSortKey] = useState<"updated_at" | "display_name">(
    "updated_at"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSortByDisplayName = () => {
    setSortKey("display_name");
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  };
  const resetSortByUpdatedAt = () => {
    setSortKey("updated_at");
    setSortDir("desc"); // giữ mặc định: cập nhật mới nhất trước
  };

  useEffect(() => {
    const loadRubrics = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("rubrics")
          .select(
            "id,name,task_name,level_id,cohort_id,exam_round_id,station_id,updated_at"
          )
          .order("updated_at", { ascending: false });
        if (error) {
          alert("Không tải được danh sách: " + error.message);
          return;
        }
        setRubrics(data ?? []);
      } finally {
        setLoading(false);
      }
    };
    loadRubrics();

    // Lắng nghe sự kiện refresh sau khi lưu
    const handler = () => loadRubrics();
    window.addEventListener("rubrics-changed", handler);
    return () => window.removeEventListener("rubrics-changed", handler);
  }, []);

  // Tải toàn bộ cohort (độc lập với form)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("cohorts")
        .select("id,year,level_id")
        .order("year");
      if (error) {
        alert("Không tải được Cohort: " + error.message);
        return;
      }
      setCohortsAll(data ?? []);
    })();
  }, []);

  const levelMap = new Map(levels.map((l) => [l.id, l.name]));
  const cohortMap = new Map(cohortsAll.map((c) => [c.id, c.year]));
  const roundMap = new Map(roundsAll.map((r) => [r.id, r.round_number])); // hoặc dùng display_name
  const roundNameMap = new Map(roundsAll.map((r) => [r.id, r.display_name]));
  const stationMap = new Map(stations.map((s) => [s.id, s.name]));

  const displayName = (rb: any) => {
    const levelName = levelMap.get(rb.level_id);
    const cohortYear = cohortMap.get(rb.cohort_id);
    const roundNo = roundMap.get(rb.exam_round_id);
    const stationName = stationMap.get(rb.station_id);
    return buildRubricFilename({
      levelName,
      cohortYear,
      roundNo,
      stationName,
      taskName: rb.task_name,
    });
  };

  const filtered = rubrics.filter((rb) => {
    const fields = [
      rb.name ?? "",
      rb.task_name ?? "",
      levelMap.get(rb.level_id) ?? "",
      String(cohortMap.get(rb.cohort_id) ?? ""),
      roundNameMap.get(rb.exam_round_id) ??
        String(roundMap.get(rb.exam_round_id) ?? ""),
      stationMap.get(rb.station_id) ?? "",
      displayName(rb) ?? "",
    ].map((s) => s.toLowerCase());
    const q = keyword.trim().toLowerCase();
    return q === "" ? true : fields.some((f) => f.includes(q));
  });

  /** NEW: sắp xếp sau khi lọc */
  const filteredSorted = [...filtered].sort((a, b) => {
    if (sortKey === "updated_at") {
      const av = new Date(a.updated_at).getTime();
      const bv = new Date(b.updated_at).getTime();
      return sortDir === "asc" ? av - bv : bv - av;
    } else {
      const av = (displayName(a) ?? "").toLowerCase();
      const bv = (displayName(b) ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
  });

  const onDelete = async (id: UUID) => {
    if (!confirm("Xóa rubric này? Hành động không thể hoàn tác.")) return;
    const { error } = await supabase.from("rubrics").delete().eq("id", id);
    if (error) alert("Xóa thất bại: " + error.message);
    else setRubrics((prev) => prev.filter((r) => r.id !== id));
  };

  const openCopy = async (id: UUID) => {
    setCopySourceFull(null);
    setNote("");
    setTarget({ level_id: "", cohort_id: "", exam_round_id: "", station_id: "" });
    // Load đầy đủ rubric nguồn để lấy items/config
    const { data, error } = await supabase
      .from("rubrics")
      .select(
        "id,name,task_name,level_id,cohort_id,exam_round_id,station_id,items,max_score,global_rating,grader_comment"
      )
      .eq("id", id)
      .single();
    if (error) {
      alert("Không tải được rubric nguồn: " + error.message);
      return;
    }
    setCopySourceFull(data);
    setTarget({
      level_id: data.level_id, // giữ Level theo nguồn, disable trong UI
      cohort_id: "",
      exam_round_id: "",
      station_id: "",
    });
    setCopyOpen(true);
  };

  /** 🔧 DO COPY (đã chỉnh) */
  const doCopy = async () => {
    if (!copySourceFull) return;
    if (
      !target.level_id ||
      !target.cohort_id ||
      !target.exam_round_id ||
      !target.station_id
    ) {
      alert(
        "Vui lòng chọn đủ Cohort, Round và Station cho bản sao (Level đã cố định)."
      );
      return;
    }
    try {
      // 1) Kiểm tra trùng theo ngữ cảnh
      const isDup = await checkDuplicateByContext({
        level_id: target.level_id as UUID,
        cohort_id: target.cohort_id as UUID,
        exam_round_id: target.exam_round_id as UUID,
        station_id: target.station_id as UUID,
        task_name: copySourceFull.task_name,
      });

      // 2) Xác định tên hiển thị cho bản sao
      let finalName: string | null = copySourceFull.name ?? null;
      if (isDup) {
        const ok = confirm(
          "Đã có rubric ở tổ hợp này. Bạn có muốn tạo 'phiên bản mới' (hệ thống sẽ gắn hậu tố Version vào tên) không?"
        );
        if (!ok) return;
        finalName = ensureUniqueName(copySourceFull.name ?? null, note);
      } else if (note && (copySourceFull.name ?? "").trim() !== "") {
        finalName = `${copySourceFull.name} — (NOTE: ${note})`;
      }

      // 3) Insert
      const payload = {
        station_id: target.station_id,
        cohort_id: target.cohort_id,
        exam_round_id: target.exam_round_id,
        level_id: target.level_id,
        task_name: copySourceFull.task_name,
        name: finalName,
        items: copySourceFull.items,
        max_score: copySourceFull.max_score,
        global_rating: copySourceFull.global_rating,
        grader_comment: copySourceFull.grader_comment,
      };
      const { error } = await supabase.from("rubrics").insert(payload);
      if (error) {
        alert("Sao chép thất bại: " + error.message);
        return;
      }
      alert("Đã sao chép (tạo phiên bản mới).");
      setCopyOpen(false);

      // 4) Reload list
      const { data } = await supabase
        .from("rubrics")
        .select(
          "id,name,task_name,level_id,cohort_id,exam_round_id,station_id,updated_at"
        )
        .order("updated_at", { ascending: false });
      setRubrics(data ?? []);
    } catch (e: any) {
      alert(
        "Lỗi khi kiểm tra/sao chép: " +
          (e?.message ?? "không rõ nguyên nhân")
      );
    }
  };

  return (
    <div className="mt-10 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Danh sách Rubric</h3>
        <div className="flex items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo Level/Cohort/Round/Station/Task, tên rubric, tên tác vụ..."
            className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-3 text-sm text-gray-600">Đang tải...</div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-700">
                <th className="px-3 py-2 text-left">Tên rubric</th>
                <th className="px-3 py-2 text-left">Tên tác vụ</th>

                {/* Header Ghép tên: click để sort */}
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={toggleSortByDisplayName}
                  title="Sắp xếp theo tên ghép (click để đổi chiều)"
                >
                  Ghép tên (Level/Cohort/Round/Station/Task)
                  {sortKey === "display_name" && (
                    <span className="ml-1 text-xs">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>

                {/* Header Cập nhật: click để trả về sort mặc định */}
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none"
                  onClick={resetSortByUpdatedAt}
                  title="Sắp xếp theo thời điểm cập nhật mới nhất"
                >
                  Cập nhật
                  {sortKey === "updated_at" && (
                    <span className="ml-1 text-xs">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
                <th className="px-3 py-2 text-left">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((rb) => (
                <tr key={rb.id} className="border-b">
                  <td className="px-3 py-2">
                    {rb.name ?? <span className="text-gray-400">(trống)</span>}
                  </td>
                  <td className="px-3 py-2">
                    {rb.task_name ?? (
                      <span className="text-gray-400">(trống)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-gray-700">{displayName(rb)}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(rb.updated_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`?id=${rb.id}`)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => onDelete(rb.id)}
                        className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                      >
                        Xóa
                      </button>
                      <button
                        onClick={() => openCopy(rb.id)}
                        className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      >
                        Sao chép
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSorted.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    Không có kết quả.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal chọn đích để sao chép (Level khóa cứng theo nguồn) */}
      {copyOpen && copySourceFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-base font-semibold">
                Sao chép rubric sang kỳ thi mới
              </h4>
              <button
                onClick={() => {
                  setCopyOpen(false);
                  setCopySourceFull(null);
                }}
                className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3 text-sm">
              <div className="grid grid-cols-1 gap-3">
                {/* Level: preset và disable */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Đối tượng (Level) - cố định
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs bg-gray-100 cursor-not-allowed"
                    value={target.level_id}
                    disabled
                  >
                    <option value={target.level_id}>
                      {levels.find((l) => l.id === target.level_id)?.name ??
                        "(Level nguồn)"}
                    </option>
                  </select>
                </label>

                {/* Cohort */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Niên khóa (Cohort)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={target.cohort_id}
                    onChange={(e) =>
                      setTarget((t) => ({
                        ...t,
                        cohort_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                  >
                    <option value="">-- chọn --</option>
                    {cohortsAll
                      .filter((c) => c.level_id === target.level_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.year}
                        </option>
                      ))}
                  </select>
                </label>

                {/* Round */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Đợt thi (Round)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={target.exam_round_id}
                    onChange={(e) =>
                      setTarget((t) => ({
                        ...t,
                        exam_round_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                    disabled={!target.cohort_id}
                  >
                    <option value="">-- chọn --</option>
                    {roundsAll
                      .filter((r) => r.cohort_id === target.cohort_id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                {/* Station */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Trạm (Station)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={target.station_id}
                    onChange={(e) =>
                      setTarget((t) => ({
                        ...t,
                        station_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                  >
                    <option value="">-- chọn --</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Ghi chú phiên bản */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Ghi chú phiên bản (tuỳ chọn)
                  </span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="VD: Chỉnh sửa sau kỳ thi Round 2 ngày 12/12/2025"
                    className="rounded-md border px-2 py-1 text-xs"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <button
                onClick={() => {
                  setCopyOpen(false);
                  setCopySourceFull(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={doCopy}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Sao chép (tạo phiên bản mới)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ===== Trang Upload Rubric chính ===== */
export default function UploadRubricPage() {
  const router = useRouter(); // <-- thêm để dùng quay về dashboard
  const search = useSearchParams();
  const rubricId = search.get("id"); // nếu có => chế độ sửa

  const [levels, setLevels] = useState<Level[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [rounds, setRounds] = useState<ExamRoundView[]>([]);
  const [roundsAll, setRoundsAll] = useState<ExamRoundView[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [logoArrayBuffer, setLogoArrayBuffer] = useState<ArrayBuffer | undefined>(
    undefined
  );

  const [form, setForm] = useState<RubricFormState>(INITIAL_FORM);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Chế độ lưu khi sửa: 'overwrite' | 'newVersion'
  const [saveMode, setSaveMode] = useState<"overwrite" | "newVersion">(
    "overwrite"
  );

  const [newVersionOpen, setNewVersionOpen] = useState<boolean>(false);
  const [newVersionTarget, setNewVersionTarget] = useState<{
    level_id: UUID | "";
    cohort_id: UUID | "";
    exam_round_id: UUID | "";
    station_id: UUID | "";
  }>({ level_id: "", cohort_id: "", exam_round_id: "", station_id: "" });
  const [newVersionNote, setNewVersionNote] = useState<string>("");

  /** 🔙 Quay lại Dashboard theo role (giống UploadStudents) */
  const goBackDashboard = async () => {
    try {
      const { data: roleRes, error } = await supabase.rpc("get_my_role");
      if (error) {
        alert(`Không lấy được role: ${error.message}`);
        return;
      }
      const role = (roleRes as string | null) ?? null;
      // Map đơn giản: admin -> /dashboard/admin, còn lại -> /dashboard/uploader
      const dashboardHref =
        role === "admin" ? "/dashboard/admin" : "/dashboard/uploader";
      router.push(dashboardHref);
    } catch {
      alert("Lỗi lấy role khi quay lại Dashboard");
    }
  };

  /** ===== Load danh mục cơ bản ===== */
  useEffect(() => {
    const loadBasics = async () => {
      const [{ data: lvl }, { data: sts }] = await Promise.all([
        supabase.from("levels").select("id,name").order("name"),
        supabase.from("stations").select("id,name").order("name"),
      ]);
      setLevels(lvl ?? []);
      setStations(sts ?? []);
    };
    loadBasics();
  }, []);

  /** ===== Load ALL rounds (dùng cho Catalog & modal Copy/NewVersion) ===== */
  useEffect(() => {
    const loadAllRounds = async () => {
      const { data } = await supabase
        .from("exam_rounds_view")
        .select("id, display_name, cohort_id, round_number, date, groups")
        .order("date");
      setRoundsAll(data ?? []);
    };
    loadAllRounds();
  }, []);

  /** ===== Load Cohorts theo Level ===== */
  useEffect(() => {
    const loadCohorts = async () => {
      if (!form.level_id) {
        setCohorts([]);
        setRounds([]);
        setForm((f) => ({ ...f, cohort_id: "", exam_round_id: "" }));
        return;
      }
      const { data } = await supabase
        .from("cohorts")
        .select("id,year,level_id")
        .eq("level_id", form.level_id)
        .order("year");
      setCohorts(data ?? []);
    };
    loadCohorts();
  }, [form.level_id]);

  /** ===== Load Rounds theo Cohort ===== */
  useEffect(() => {
    const loadRounds = async () => {
      if (!form.cohort_id) {
        setRounds([]);
        setForm((f) => ({ ...f, exam_round_id: "" }));
        return;
      }
      const { data } = await supabase
        .from("exam_rounds_view")
        .select("id, display_name, cohort_id, round_number, date, groups")
        .eq("cohort_id", form.cohort_id)
        .order("round_number");
      setRounds(data ?? []);
    };
    loadRounds();
  }, [form.cohort_id]);

  /** ===== Chế độ sửa: load rubric theo id ===== */
  useEffect(() => {
    const loadExisting = async () => {
      if (!rubricId) return;
      const { data, error } = await supabase
        .from("rubrics")
        .select("*")
        .eq("id", rubricId)
        .single();
      if (error || !data) {
        alert("Không tải được rubric: " + (error?.message ?? ""));
        return;
      }
      setForm((prev) => ({
        ...prev,
        level_id: data.level_id,
        cohort_id: data.cohort_id,
        exam_round_id: data.exam_round_id,
        station_id: data.station_id,
        task_name: data.task_name,
        name: data.name ?? "",
        items: (data.items as LocalRubricItem[]) ?? prev.items,
        global_rating: data.global_rating ?? prev.global_rating,
        grader_comment: data.grader_comment ?? prev.grader_comment,
      }));
      // preset cho modal New Version
      setNewVersionTarget({
        level_id: data.level_id,
        cohort_id: "",
        exam_round_id: "",
        station_id: "",
      });
    };
    loadExisting();
  }, [rubricId]);

  /** ===== Handlers ===== */
  const setField = <K extends keyof RubricFormState>(
    key: K,
    value: RubricFormState[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateItemText = (idx: number, text: string) =>
    setForm((prev) => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], text };
      return { ...prev, items };
    });

  const updateItemLevel = (
    idx: number,
    levelKey: ItemLevelKey,
    patch: Partial<{ score: number; desc: string }>
  ) =>
    setForm((prev) => {
      const items = [...prev.items];
      const current = items[idx].levels[levelKey];
      items[idx].levels[levelKey] = { ...current, ...patch };

      // Auto theo %: chỉ chạy khi sửa điểm của mức Excellent
      const shouldAuto =
        levelKey === "Excellent" &&
        typeof patch.score === "number" &&
        !Number.isNaN(patch.score) &&
        (items[idx].autoByPercent ?? true) &&
        prev.percentConfig.enabled;

      if (shouldAuto) {
        const percents =
          items[idx].overridePercents ?? prev.percentConfig.percentsGlobal;
        const computed = calcScoresFromExcellent(patch.score!, percents);
        (["Fail", "Pass", "Good", "Excellent"] as ItemLevelKey[]).forEach(
          (k) => {
            items[idx].levels[k].score = computed[k].score;
          }
        );
      }
      return { ...prev, items };
    });

  const addItem = () =>
    setForm((prev) => {
      const nextIndex = prev.items.length + 1;
      const newItem = blankItem(nextIndex);
      return { ...prev, items: [...prev.items, newItem] };
    });

  const removeItem = (idx: number) =>
    setForm((prev) => {
      if (prev.items.length <= 1) return prev;
      const items = prev.items.filter((_, i) => i !== idx);
      return { ...prev, items };
    });

  const updateGlobalRating = (patch: Partial<GlobalRatingConfig>) =>
    setForm((prev) => ({
      ...prev,
      global_rating: { ...prev.global_rating, ...patch },
    }));

  const updateGraderComment = (patch: Partial<GraderCommentConfig>) =>
    setForm((prev) => ({
      ...prev,
      grader_comment: { ...prev.grader_comment, ...patch },
    }));

  const updateLevelColor = (lv: ItemLevelKey, part: keyof LevelColor, value: string) =>
    setForm((prev) => ({
      ...prev,
      global_rating: {
        ...prev.global_rating,
        levelColors: {
          ...prev.global_rating.levelColors,
          [lv]: { ...prev.global_rating.levelColors[lv], [part]: value },
        },
      },
    }));

  /** ===== Validate ===== */
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!form.level_id) errs.push("Chưa chọn Đối tượng (Level).");
    if (!form.cohort_id) errs.push("Chưa chọn Niên khóa (Cohort).");
    if (!form.exam_round_id) errs.push("Chưa chọn Đợt thi (Exam Round).");
    if (!form.station_id) errs.push("Chưa chọn Trạm (Station).");
    if (!form.task_name.trim()) errs.push("Chưa nhập tên tác vụ.");
    if (!Array.isArray(form.items) || form.items.length === 0)
      errs.push("Rubric cần ít nhất 1 mục chấm (Item).");

    form.items.forEach((it, i) => {
      if (!it.text.trim()) errs.push(`Mục chấm #${i + 1} chưa nhập mô tả.`);
      (["Fail", "Pass", "Good", "Excellent"] as ItemLevelKey[]).forEach((k) => {
        const lv = it.levels[k];
        if (!lv) errs.push(`Mục chấm #${i + 1} - ${k}: thiếu mức.`);
        else {
          if (typeof lv.score !== "number" || Number.isNaN(lv.score))
            errs.push(`Mục chấm #${i + 1} - ${k}: điểm không hợp lệ.`);
          if (!lv.desc.trim())
            errs.push(`Mục chấm #${i + 1} - ${k}: chưa nhập mô tả.`);
        }
      });
    });

    if (form.global_rating.enabled) {
      const { label, scale, scores, mandatoryCommentLevels } = form.global_rating;
      if (!label.trim()) errs.push("Global Rating: thiếu nhãn hiển thị.");
      if (!scale?.length) errs.push("Global Rating: thiếu thang đánh giá.");
      scale.forEach((lv) => {
        if (typeof scores[lv] !== "number" || Number.isNaN(scores[lv])) {
          errs.push(`Global Rating: thiếu điểm cho mức ${lv}.`);
        }
      });
      mandatoryCommentLevels.forEach((lv) => {
        if (!scale.includes(lv))
          errs.push(
            `Global Rating: mức bắt buộc nhận xét '${lv}' không nằm trong thang.`
          );
      });
    }
    return errs;
  }, [form]);

  /** ===== Preview tổng ===== */
  const maxTotal = useMemo(() => getMaxTotalScore(form.items), [form.items]);
  const isOverTen = maxTotal > 10;

  /** ===== Reset theo hành vi ===== */
  const resetAfterSaveNextStation = () => {
    // Sau khi Lưu thành công: giữ Level/Cohort/Round, trống Station và items+name+task
    setForm((prev) => ({
      ...prev,
      station_id: "",
      task_name: "",
      name: "",
      items: [blankItem(1)],
    }));
  };

  const resetAllNewRound = () => {
    if (
      !confirm(
        "Bắt đầu đợt thi mới? Toàn bộ lựa chọn Level/Cohort/Round/Station và nội dung sẽ được reset về mặc định."
      )
    )
      return;
    setForm(INITIAL_FORM);
    setLogoArrayBuffer(undefined);
    setSaveMode("overwrite");
  };

  /** ===== Lưu (ghi đè hoặc tạo bản mới) ===== */
  const saveOverwriteOrInsert = async () => {
    if (errors.length) {
      alert(`Vui lòng xử lý lỗi:\n- ${errors.join("\n- ")}`);
      return;
    }
    setLoading(true);
    try {
      const max_score_to_save = Math.round(maxTotal);
      // Tự ghép tên khi để trống
      const stationName = stations.find((s) => s.id === form.station_id)?.name;
      const levelName = levels.find((l) => l.id === form.level_id)?.name;
      const cohortYear = cohorts.find((c) => c.id === form.cohort_id)?.year;
      const roundNo = rounds.find((r) => r.id === form.exam_round_id)
        ?.round_number;
      const fallback = buildRubricFilename({
        levelName,
        cohortYear,
        roundNo,
        stationName,
        taskName: form.task_name,
      });

      const payload = {
        station_id: form.station_id,
        cohort_id: form.cohort_id,
        exam_round_id: form.exam_round_id,
        level_id: form.level_id,
        task_name: form.task_name.trim(),
        name: form.name?.trim() ?? fallback ?? null,
        items: form.items,
        max_score: max_score_to_save,
        global_rating: form.global_rating,
        grader_comment: form.grader_comment,
      };

      if (rubricId && saveMode === "overwrite") {
        // Ghi đè rubric cũ theo id
        const { error } = await supabase
          .from("rubrics")
          .update(payload)
          .eq("id", rubricId);
        if (error) alert("Lưu (ghi đè) thất bại: " + error.message);
        else {
          alert("Đã ghi đè Rubric.");
          window.dispatchEvent(new CustomEvent("rubrics-changed"));
          resetAfterSaveNextStation();
        }
      } else {
        // Thêm mới (tạo phiên bản mới theo khóa hiện tại)
        const { error } = await supabase.from("rubrics").insert(payload);
        if (error) {
          alert(
            "Lưu mới thất bại (có thể trùng Cohort/Round/Station/Level): " +
              error.message
          );
        } else {
          alert("Đã lưu Rubric mới.");
          window.dispatchEvent(new CustomEvent("rubrics-changed"));
          resetAfterSaveNextStation();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /** ===== Modal Lưu thành phiên bản mới (chọn Cohort/Round/Station + Ghi chú) ===== */
  /** 🔧 DO SAVE NEW VERSION (đã chỉnh) */
  const doSaveNewVersionToTarget = async () => {
    if (
      !newVersionTarget.level_id ||
      !newVersionTarget.cohort_id ||
      !newVersionTarget.exam_round_id ||
      !newVersionTarget.station_id
    ) {
      alert("Vui lòng chọn đủ Cohort, Round và Station cho phiên bản mới.");
      return;
    }
    const max_score_to_save = Math.round(maxTotal);
    // Tên cơ sở (nếu user có nhập) + ghi chú
    let finalName =
      form.name?.trim()
        ? `${form.name.trim()}${
            newVersionNote ? ` — (NOTE: ${newVersionNote})` : ""
          }`
        : null;

    try {
      // 1) Kiểm tra trùng theo ngữ cảnh
      const isDup = await checkDuplicateByContext({
        level_id: newVersionTarget.level_id as UUID,
        cohort_id: newVersionTarget.cohort_id as UUID,
        exam_round_id: newVersionTarget.exam_round_id as UUID,
        station_id: newVersionTarget.station_id as UUID,
        task_name: form.task_name.trim(), // dùng nếu DB đang UNIQUE với task_name
      });
      if (isDup) {
        const ok = confirm(
          "Đã có rubric ở tổ hợp này. Bạn có muốn lưu thành 'phiên bản mới' (hệ thống sẽ gắn hậu tố Version vào tên) không?"
        );
        if (!ok) return;
        finalName = ensureUniqueName(finalName, newVersionNote);
      }

      const payload = {
        station_id: newVersionTarget.station_id,
        cohort_id: newVersionTarget.cohort_id,
        exam_round_id: newVersionTarget.exam_round_id,
        level_id: newVersionTarget.level_id,
        task_name: form.task_name.trim(),
        name: finalName,
        items: form.items,
        max_score: max_score_to_save,
        global_rating: form.global_rating,
        grader_comment: form.grader_comment,
      };
      setLoading(true);
      const { error } = await supabase.from("rubrics").insert(payload);
      setLoading(false);
      if (error) {
        alert("Tạo phiên bản mới thất bại: " + error.message);
        return;
      }
      alert("Đã tạo phiên bản mới cho kỳ thi khác.");
      window.dispatchEvent(new CustomEvent("rubrics-changed"));
      setNewVersionOpen(false);
      resetAfterSaveNextStation();
    } catch (e: any) {
      setLoading(false);
      alert(
        "Lỗi khi kiểm tra/lưu bản mới: " +
          (e?.message ?? "không rõ nguyên nhân")
      );
    }
  };

  /** ===== Export JSON ===== */
  const exportJSON = () => {
    const stationName = stations.find((s) => s.id === form.station_id)?.name;
    const levelName = levels.find((l) => l.id === form.level_id)?.name;
    const cohortYear = cohorts.find((c) => c.id === form.cohort_id)?.year;
    const roundNo = rounds.find((r) => r.id === form.exam_round_id)
      ?.round_number;
    const fallback = buildRubricFilename({
      levelName,
      cohortYear,
      roundNo,
      stationName,
      taskName: form.task_name,
    });
    const baseName = (form.name?.trim() ?? fallback ?? "rubric").replace(
      /[\\\/:*?"<>|]/g,
      "-"
    );
    const payload = {
      station_id: form.station_id,
      cohort_id: form.cohort_id,
      exam_round_id: form.exam_round_id,
      level_id: form.level_id,
      task_name: form.task_name.trim(),
      name: form.name?.trim() ?? null,
      items: form.items,
      max_score_preview: Number(maxTotal.toFixed(2)),
      warning_over_10: isOverTen,
      global_rating: form.global_rating,
      grader_comment: form.grader_comment,
      percent_config: form.percentConfig, // NEW
    };
    downloadJSON(baseName, payload);
  };

  /** ===== Export Word (.docx) ===== */
  const exportDOCX = async () => {
    const stationName = stations.find((s) => s.id === form.station_id)?.name;
    const levelName = levels.find((l) => l.id === form.level_id)?.name;
    const cohortYear = cohorts.find((c) => c.id === form.cohort_id)?.year;
    const roundNo = rounds.find((r) => r.id === form.exam_round_id)
      ?.round_number;
    const fallback = buildRubricFilename({
      levelName,
      cohortYear,
      roundNo,
      stationName,
      taskName: form.task_name,
    });
    const baseName = (form.name?.trim() ?? fallback ?? "rubric").replace(
      /[\\\/:*?"<>|]/g,
      "-"
    );

    const title = new Paragraph({
      text: form.name?.trim() ?? "Rubric OSCE",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    });

    const logoPara =
      logoArrayBuffer
        ? new Paragraph({
            children: [
              new ImageRun({
                data: logoArrayBuffer,
                transformation: { width: 120, height: 120 },
              }),
            ],
            alignment: AlignmentType.CENTER,
          })
        : undefined;

    const infoLines = [
      `Đối tượng (Level): ${levelName ?? "-"}`,
      `Niên khóa (Cohort): ${cohortYear ?? "-"}`,
      `Đợt thi (Round): ${roundNo ?? "-"}`,
      `Trạm (Station): ${stationName ?? "-"}`,
      `Tác vụ (Task): ${form.task_name || "-"}`,
    ].map((t) => new Paragraph({ text: t }));

    const headerRow = new TableRow({
      children: [
        new TableCell({
          width: { size: 8, type: WidthType.PERCENT },
          children: [
            new Paragraph({ text: "Mục chấm (Item)", bold: true }),
          ],
        }),
        new TableCell({
          width: { size: 20, type: WidthType.PERCENT },
          children: [
            new Paragraph({ text: "Mô tả (Description)", bold: true }),
          ],
        }),
        ...LEVEL_KEYS.map(
          (lv) =>
            new TableCell({
              width: { size: 18, type: WidthType.PERCENT },
              children: [
                new Paragraph({
                  text: `${lv} (Điểm + mô tả / Score + description)`,
                  bold: true,
                }),
              ],
            })
        ),
      ],
    });

    const itemRows = form.items.map((item, idx) => {
      const levelCells = LEVEL_KEYS.map((k) => {
        const l = item.levels[k];
        const scoreText = `Điểm: ${
          typeof l.score === "number" ? l.score : "-"
        }`;
        const descText = l.desc ? l.desc : "(chưa có mô tả)";
        return new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: scoreText, bold: true })],
            }),
            new Paragraph({ text: descText }),
          ],
        });
      });
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: `#${idx + 1} (${item.id})` })],
          }),
          new TableCell({
            children: [
              new Paragraph({
                text: item.text || "(chưa có mô tả)",
                italics: !item.text,
              }),
            ],
          }),
          ...levelCells,
        ],
      });
    });

    const itemsTable = new Table({
      width: { size: 100, type: WidthType.PERCENT },
      rows: [headerRow, ...itemRows],
    });

    const grTitle = new Paragraph({
      text: "Đánh giá tổng thể (Global Rating)",
      heading: HeadingLevel.HEADING_2,
    });
    const grStatus = new Paragraph({
      text: `Trạng thái: ${
        form.global_rating.enabled ? "Bật" : "Tắt"
      } • Bắt buộc: ${form.global_rating.required ? "Có" : "Không"}`,
    });
    const grLabel = new Paragraph({
      text: `Nhãn: ${form.global_rating.label || "-"}`,
    });

    const grHeader = new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: "Mức (Level)", bold: true })],
        }),
        new TableCell({
          children: [new Paragraph({ text: "Điểm (Score)", bold: true })],
        }),
        new TableCell({
          children: [
            new Paragraph({
              text: "Bắt buộc nhận xét? (Mandatory comment?)",
              bold: true,
            }),
          ],
        }),
      ],
    });

    const grRows = form.global_rating.scale.map(
      (lv) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: lv })] }),
            new TableCell({
              children: [
                new Paragraph({
                  text: String(form.global_rating.scores[lv] ?? ""),
                }),
              ],
            }),
            new TableCell({
              children: [
                new Paragraph({
                  text: form.global_rating.mandatoryCommentLevels.includes(lv)
                    ? "Có / Yes"
                    : "Không / No",
                }),
              ],
            }),
          ],
        })
    );
    const grTable = new Table({ rows: [grHeader, ...grRows] });

    const gcTitle = new Paragraph({
      text: "Nhận xét của giám khảo (Grader comment)",
      heading: HeadingLevel.HEADING_2,
    });
    const gcStatus = new Paragraph({
      text: `Bật: ${
        form.grader_comment.enabled ? "Có" : "Không"
      } • Bắt buộc: ${
        form.grader_comment.required ? "Có" : "Không"
      } • Tối đa: ${form.grader_comment.maxLength ?? "-"} ký tự`,
    });
    const gcPlaceholder = new Paragraph({
      children: [
        new TextRun({
          text:
            form.grader_comment.placeholder || "(không có placeholder)",
          italics: true,
          color: "777777",
        }),
      ],
    });

    const signTitle = new Paragraph({
      text: "Chữ ký giám khảo (Examiner signature)",
      heading: HeadingLevel.HEADING_2,
    });
    const signInstr = new Paragraph({
      text:
        "Giám khảo ký và ghi rõ họ tên, ngày / Examiner signs, full name, date:",
      italics: true,
    });
    const signLine = new Paragraph({
      children: [
        new TextRun({
          text:
            "Ký tên: __________________________ Ngày: ____ / ____ / ________",
        }),
      ],
    });
    const signName = new Paragraph({
      children: [
        new TextRun({
          text: "Họ và tên (ghi rõ): __________________________",
        }),
      ],
    });

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            ...(logoPara ? [logoPara, new Paragraph({ text: "" })] : []),
            title,
            ...infoLines,
            new Paragraph({ text: "" }),
            new Paragraph({
              text: "Các mục chấm (Items)",
              heading: HeadingLevel.HEADING_2,
            }),
            itemsTable,
            new Paragraph({ text: "" }),
            grTitle,
            grStatus,
            grLabel,
            grTable,
            new Paragraph({ text: "" }),
            gcTitle,
            gcStatus,
            gcPlaceholder,
            new Paragraph({ text: "" }),
            signTitle,
            signInstr,
            signLine,
            signName,
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${baseName}.docx`);
  };

  /** ===== Render ===== */
  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        {/* Header + nút Quay về Dashboard (giữ nguyên nội dung cũ, chỉ thêm nút) */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {rubricId ? "Sửa Rubric" : "Upload Rubric"}
            </h1>
            <p className="text-gray-600 mt-1">
              Mục chấm (Fail/Pass/Good/Excellent) + Đánh giá tổng thể (Global
              Rating) + Nhận xét + Xuất Word
            </p>
          </div>

          <button
            onClick={goBackDashboard}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            ← Quay lại Dashboard
          </button>
        </div>
      </div>

      {/* Hướng dẫn thứ tự nhập */}
      <div className="mb-2 text-[13px] text-gray-600">
        <span className="font-semibold">Thứ tự:</span>
        <span className="ml-1">
          1. Đối tượng → 2. Niên khóa → 3. Đợt thi → 4. Trạm
        </span>
      </div>

      {/* Bộ lọc ngữ cảnh - gọn: 4 ô trên 1 dòng ở desktop */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border border-gray-200 rounded-lg p-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            Đối tượng (Level)
          </span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.level_id}
            onChange={(e) =>
              setField("level_id", (e.target.value as UUID) ?? "")
            }
          >
            <option value="">-- chọn --</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            Niên khóa (Cohort)
          </span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs disabled:bg-gray-100"
            value={form.cohort_id}
            onChange={(e) =>
              setField("cohort_id", (e.target.value as UUID) ?? "")
            }
            disabled={!form.level_id}
          >
            <option value="">-- chọn --</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            Đợt thi (Exam Round)
          </span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs disabled:bg-gray-100"
            value={form.exam_round_id}
            onChange={(e) =>
              setField("exam_round_id", (e.target.value as UUID) ?? "")
            }
            disabled={!form.cohort_id}
          >
            <option value="">-- chọn --</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">
            Trạm (Station)
          </span>
          <select
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            value={form.station_id}
            onChange={(e) =>
              setField("station_id", (e.target.value as UUID) ?? "")
            }
          >
            <option value="">-- chọn --</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Tên rubric + Tên tác vụ */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Tên rubric (hiển thị)
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="VD: Hỏi bệnh sử 3 lần đầu khám thai"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">
              Nếu để trống, hệ thống sẽ tự ghép tên từ Level/Cohort/Round/Station/Task.
            </span>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">
              Tên tác vụ (Task name)
            </span>
            <input
              type="text"
              value={form.task_name}
              onChange={(e) => setField("task_name", e.target.value)}
              placeholder="VD: Khám sản, Hồi sức sơ sinh..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Preview tổng + chọn logo */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">Tổng điểm tối đa</span>:{" "}
            {maxTotal.toFixed(2)} / 10
          </div>
          {isOverTen && (
            <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ Tổng vượt 10. Bạn nên giảm điểm ở một số mục chấm hoặc hệ thống
              sẽ <em>scale</em> về 10 khi chấm.
            </div>
          )}
          <div className="mt-3 text-xs text-gray-500 space-y-1">
            {form.items.map((it, idx) => (
              <div key={it.id}>
                Mục chấm #{idx + 1} — <em>{it.text || "(chưa có mô tả)"}</em>:
                {"  "}Max = {getMaxScoreOfItem(it)}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <label className="text-sm text-gray-700">
            Logo (tuỳ chọn):
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const ab = await f.arrayBuffer();
                setLogoArrayBuffer(ab);
              }}
              className="ml-2"
            />
          </label>
          <div className="mt-2 text-xs text-gray-500">
            Logo sẽ chèn ở đầu file Word nếu có.
          </div>
        </div>
      </div>

      {/* Cấu hình % chung cho các mức */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            Tỉ lệ mức (Percentage by level)
          </h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.percentConfig.enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  percentConfig: {
                    ...prev.percentConfig,
                    enabled: e.target.checked,
                  },
                }))
              }
            />
            <span>Bật tự tính theo %</span>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["Fail", "Pass", "Good", "Excellent"] as ItemLevelKey[]).map(
            (lv) => (
              <label key={lv} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-700">
                  {lv === "Fail"
                    ? "Không đạt (Fail)"
                    : lv === "Pass"
                    ? "Đạt (Pass)"
                    : lv === "Good"
                    ? "Tốt (Good)"
                    : "Xuất sắc (Excellent)"}{" "}
                  — %
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.percentConfig.percentsGlobal[lv]}
                  onChange={(e) => {
                    const val = Math.max(
                      0,
                      Math.min(100, Number(e.target.value))
                    );
                    setForm((prev) => ({
                      ...prev,
                      percentConfig: {
                        ...prev.percentConfig,
                        percentsGlobal: {
                          ...prev.percentConfig.percentsGlobal,
                          [lv]: val,
                        },
                      },
                    }));
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
            )
          )}
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Nhập % tương đối so với mức Xuất sắc (Excellent). Ví dụ: Pass = 50
          nghĩa là điểm Pass bằng 50% điểm Excellent của mục chấm.
        </div>
      </div>

      {/* Danh sách Items */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Các mục chấm (Items)</h2>
          <button
            onClick={addItem}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Thêm mục chấm
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6">
          {form.items.map((item, idx) => {
            const colorCfg = form.global_rating.levelColors;
            return (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      Mục chấm #{idx + 1}
                    </span>
                    <span className="text-xs text-gray-400">ID: {item.id}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Xóa
                    </button>
                    <button
                      onClick={addItem}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      + Thêm
                    </button>
                  </div>
                </div>

                <div className="px-4 pt-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-gray-700">
                      Mô tả mục chấm
                    </span>
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => updateItemText(idx, e.target.value)}
                      placeholder="VD: Chuẩn bị dụng cụ, Thực hiện thao tác A..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>

                {/* Điều khiển auto theo % + override % */}
                <div className="px-4 mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.autoByPercent ?? true}
                      onChange={(e) =>
                        setForm((prev) => {
                          const items = [...prev.items];
                          items[idx].autoByPercent = e.target.checked;
                          return { ...prev, items };
                        })
                      }
                    />
                    <span>Dùng % để tự tính điểm (Auto by percentage)</span>
                  </label>

                  <button
                    type="button"
                    className="text-xs text-indigo-600 hover:text-indigo-700"
                    onClick={() =>
                      setForm((prev) => {
                        const items = [...prev.items];
                        const cur = items[idx].overridePercents;
                        items[idx].overridePercents = cur
                          ? undefined
                          : { ...prev.percentConfig.percentsGlobal };
                        return { ...prev, items };
                      })
                    }
                  >
                    {item.overridePercents
                      ? "Dùng % chung"
                      : "Tùy chỉnh % cho mục này"}
                  </button>
                </div>

                {item.overridePercents && (
                  <div className="px-4 mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(["Fail", "Pass", "Good", "Excellent"] as ItemLevelKey[]).map(
                      (lv) => (
                        <label key={lv} className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-gray-700">
                            {lv === "Fail"
                              ? "Không đạt (Fail)"
                              : lv === "Pass"
                              ? "Đạt (Pass)"
                              : lv === "Good"
                              ? "Tốt (Good)"
                              : "Xuất sắc (Excellent)"}{" "}
                            — % (mục này)
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={item.overridePercents[lv]}
                            onChange={(e) =>
                              setForm((prev) => {
                                const items = [...prev.items];
                                const val = Math.max(
                                  0,
                                  Math.min(100, Number(e.target.value))
                                );
                                items[idx].overridePercents![lv] = val;
                                // nếu item đang auto, cập nhật lại điểm theo % mới dựa trên điểm Excellent hiện tại
                                const excScore =
                                  items[idx].levels.Excellent.score;
                                if (
                                  (items[idx].autoByPercent ?? true) &&
                                  prev.percentConfig.enabled &&
                                  typeof excScore === "number" &&
                                  !Number.isNaN(excScore)
                                ) {
                                  const computed = calcScoresFromExcellent(
                                    excScore,
                                    items[idx].overridePercents!
                                  );
                                  ([
                                    "Fail",
                                    "Pass",
                                    "Good",
                                    "Excellent",
                                  ] as ItemLevelKey[]).forEach((k) => {
                                    items[idx].levels[k].score =
                                      computed[k].score;
                                  });
                                }
                                return { ...prev, items };
                              })
                            }
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                          />
                        </label>
                      )
                    )}
                  </div>
                )}

                <div className="px-4 pb-4">
                  <div className="mt-4 text-sm text-gray-600">
                    <em>
                      Mức đánh giá: Không đạt (Fail) / Đạt (Pass) / Tốt (Good) /
                      Xuất sắc (Excellent)
                    </em>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {LEVEL_KEYS.map((k) => {
                      const lv = item.levels[k];
                      const colorCfg = form.global_rating.levelColors[k];
                      const disableScoreInput =
                        (item.autoByPercent ?? true) &&
                        form.percentConfig.enabled &&
                        k !== "Excellent";
                      return (
                        <div
                          key={k}
                          className="rounded-md p-3"
                          style={{
                            backgroundColor: colorCfg.bg,
                            border: `1px solid ${colorCfg.border}`,
                          }}
                        >
                          <div
                            className="text-sm font-semibold"
                            style={{ color: colorCfg.title }}
                          >
                            {k}
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-3">
                            <label className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-gray-700">
                                Điểm
                              </span>
                              <input
                                type="number"
                                step={0.1}
                                value={lv.score}
                                onChange={(e) =>
                                  updateItemLevel(idx, k, {
                                    score: Number(e.target.value),
                                  })
                                }
                                placeholder="VD: 0, 1, 2, 3"
                                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                disabled={disableScoreInput}
                                title={
                                  disableScoreInput
                                    ? "Điểm được tính tự động theo % (chỉ nhập ở Xuất sắc/Excellent)"
                                    : undefined
                                }
                              />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-gray-700">
                                Mô tả (như thế nào là {k})
                              </span>
                              <input
                                type="text"
                                value={lv.desc}
                                onChange={(e) =>
                                  updateItemLevel(idx, k, {
                                    desc: e.target.value,
                                  })
                                }
                                placeholder={`Mô tả tiêu chí để đạt mức ${k} ở mục này`}
                                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Rating & Grader Comment */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Global Rating Config */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Đánh giá tổng thể (Global Rating)
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.global_rating.enabled}
                onChange={(e) =>
                  updateGlobalRating({ enabled: e.target.checked })
                }
              />
              <span>Bật</span>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.global_rating.required}
                onChange={(e) =>
                  updateGlobalRating({ required: e.target.checked })
                }
                disabled={!form.global_rating.enabled}
              />
              <span>Bắt buộc chọn khi chấm</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Nhãn hiển thị
              </span>
              <input
                type="text"
                value={form.global_rating.label}
                onChange={(e) =>
                  updateGlobalRating({ label: e.target.value })
                }
                placeholder="VD: Đánh giá tổng thể (Global Rating)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                disabled={!form.global_rating.enabled}
              />
            </label>

            <div className="mt-2">
              <div className="text-sm text-gray-600 mb-2">
                Cấu hình từng mức:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {form.global_rating.scale.map((lv) => {
                  const colorCfg = form.global_rating.levelColors[lv];
                  const requiredHere =
                    form.global_rating.mandatoryCommentLevels.includes(lv);
                  return (
                    <div
                      key={lv}
                      className="rounded-md border border-gray-200 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: colorCfg.title }}
                        >
                          {lv}
                        </span>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={requiredHere}
                            onChange={(e) => {
                              const set = new Set(
                                form.global_rating.mandatoryCommentLevels
                              );
                              e.target.checked ? set.add(lv) : set.delete(lv);
                              updateGlobalRating({
                                mandatoryCommentLevels: Array.from(
                                  set
                                ) as ItemLevelKey[],
                              });
                            }}
                          />
                          <span>Bắt buộc nhận xét</span>
                        </label>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-gray-700">Điểm</span>
                          <input
                            type="number"
                            step={0.1}
                            value={form.global_rating.scores[lv]}
                            onChange={(e) =>
                              updateGlobalRating({
                                scores: {
                                  ...form.global_rating.scores,
                                  [lv]: Number(e.target.value),
                                },
                              })
                            }
                            className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-gray-700">Nền (bg)</span>
                          <input
                            type="color"
                            value={colorCfg.bg}
                            onChange={(e) =>
                              updateLevelColor(lv, "bg", e.target.value)
                            }
                            className="h-8 w-full cursor-pointer rounded-md border border-gray-300"
                          />
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-gray-700">Viền</span>
                          <input
                            type="color"
                            value={colorCfg.border}
                            onChange={(e) =>
                              updateLevelColor(lv, "border", e.target.value)
                            }
                            className="h-8 w-full cursor-pointer rounded-md border border-gray-300"
                          />
                        </label>

                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-gray-700">Tiêu đề</span>
                          <input
                            type="color"
                            value={colorCfg.title}
                            onChange={(e) =>
                              updateLevelColor(lv, "title", e.target.value)
                            }
                            className="h-8 w-full cursor-pointer rounded-md border border-gray-300"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Grader Comment Config */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              Nhận xét của giám khảo (Grader comment)
            </h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.grader_comment.enabled}
                onChange={(e) =>
                  updateGraderComment({ enabled: e.target.checked })
                }
              />
              <span>Bật</span>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.grader_comment.required}
                onChange={(e) =>
                  updateGraderComment({ required: e.target.checked })
                }
                disabled={!form.grader_comment.enabled}
              />
              <span>Luôn bắt buộc (ngoài điều kiện theo Global Rating)</span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Placeholder
              </span>
              <input
                type="text"
                value={form.grader_comment.placeholder}
                onChange={(e) =>
                  updateGraderComment({ placeholder: e.target.value })
                }
                placeholder="VD: Nhập nhận xét tổng thể..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                disabled={!form.grader_comment.enabled}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Giới hạn ký tự (tùy chọn)
              </span>
              <input
                type="number"
                min={50}
                max={1000}
                value={form.grader_comment.maxLength ?? 500}
                onChange={(e) =>
                  updateGraderComment({ maxLength: Number(e.target.value) })
                }
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                disabled={!form.grader_comment.enabled}
              />
            </label>
          </div>

          <div className="mt-4">
            <div className="text-sm text-gray-600 mb-1">
              Preview ô nhận xét (khi chấm):
            </div>
            <textarea
              placeholder={form.grader_comment.placeholder}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              disabled
            />
            {form.grader_comment.maxLength && (
              <div className="mt-1 text-xs text-gray-400">
                Tối đa {form.grader_comment.maxLength} ký tự
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lỗi & Actions */}
      {errors.length > 0 && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4">
          <strong className="text-amber-800">Vui lòng sửa lỗi:</strong>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {/* Lưu */}
        <button
          onClick={saveOverwriteOrInsert}
          disabled={loading}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          title={
            rubricId && saveMode === "overwrite" ? "Ghi đè rubric cũ" : "Lưu rubric mới"
          }
        >
          {loading
            ? "Đang lưu..."
            : rubricId && saveMode === "overwrite"
            ? "Lưu (ghi đè)"
            : "Lưu"}
        </button>

        {/* Preview */}
        <button
          onClick={() => setShowPreview(true)}
          type="button"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Preview trước khi lưu
        </button>

        {/* New round: reset toàn bộ về mặc định */}
        <button
          onClick={resetAllNewRound}
          type="button"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          title="Bắt đầu nhập mới cho đợt thi khác (reset toàn bộ về mặc định)"
        >
          New đợt thi
        </button>

        {/* Xuất JSON/Word */}
        <button
          onClick={exportJSON}
          type="button"
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-200 border border-gray-300"
        >
          Xuất JSON (kiểm tra nhanh)
        </button>
        <button
          onClick={exportDOCX}
          type="button"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Xuất Word (.docx)
        </button>

        {/* Khi đang sửa, cho chọn chế độ lưu */}
        {rubricId && (
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="savemode"
                checked={saveMode === "overwrite"}
                onChange={() => setSaveMode("overwrite")}
              />
              <span>Ghi đè rubric cũ</span>
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="savemode"
                checked={saveMode === "newVersion"}
                onChange={() => {
                  setSaveMode("newVersion");
                  // mở modal chọn Cohort/Round/Station để lưu phiên bản mới
                  setNewVersionTarget({
                    level_id: form.level_id,
                    cohort_id: "",
                    exam_round_id: "",
                    station_id: "",
                  });
                  setNewVersionNote("");
                  setNewVersionOpen(true);
                }}
              />
              <span>Lưu thành bản mới</span>
            </label>
          </div>
        )}
      </div>

      {/* Modal Preview */}
      <PreviewRubricModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        onConfirm={async () => {
          setShowPreview(false);
          await saveOverwriteOrInsert();
        }}
        form={form}
        levels={levels}
        cohorts={cohorts}
        rounds={rounds}
        stations={stations}
        maxTotal={maxTotal}
      />

      {/* Modal Lưu thành phiên bản mới (chọn đích + ghi chú) */}
      {newVersionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-base font-semibold">
                Lưu thành phiên bản mới (kỳ thi khác)
              </h4>
              <button
                onClick={() => setNewVersionOpen(false)}
                className="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3 text-sm">
              <div className="grid grid-cols-1 gap-3">
                {/* Level: preset và disable */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Đối tượng (Level) - cố định
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs bg-gray-100 cursor-not-allowed"
                    value={newVersionTarget.level_id}
                    disabled
                  >
                    <option value={newVersionTarget.level_id}>
                      {levels.find((l) => l.id === newVersionTarget.level_id)
                        ?.name ?? "(Level hiện tại)"}
                    </option>
                  </select>
                </label>

                {/* Cohort */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Niên khóa (Cohort)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={newVersionTarget.cohort_id}
                    onChange={(e) =>
                      setNewVersionTarget((t) => ({
                        ...t,
                        cohort_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                  >
                    <option value="">-- chọn --</option>
                    {cohorts
                      .filter((c) => c.level_id === newVersionTarget.level_id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.year}
                        </option>
                      ))}
                  </select>
                </label>

                {/* Round */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Đợt thi (Round)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={newVersionTarget.exam_round_id}
                    onChange={(e) =>
                      setNewVersionTarget((t) => ({
                        ...t,
                        exam_round_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                    disabled={!newVersionTarget.cohort_id}
                  >
                    <option value="">-- chọn --</option>
                    {roundsAll
                      .filter((r) => r.cohort_id === newVersionTarget.cohort_id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.display_name}
                        </option>
                      ))}
                  </select>
                </label>

                {/* Station */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Trạm (Station)
                  </span>
                  <select
                    className="rounded-md border px-2 py-1 text-xs"
                    value={newVersionTarget.station_id}
                    onChange={(e) =>
                      setNewVersionTarget((t) => ({
                        ...t,
                        station_id: (e.target.value as UUID) ?? "",
                      }))
                    }
                  >
                    <option value="">-- chọn --</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Ghi chú phiên bản */}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Ghi chú phiên bản (tuỳ chọn)
                  </span>
                  <input
                    type="text"
                    value={newVersionNote}
                    onChange={(e) => setNewVersionNote(e.target.value)}
                    placeholder="VD: Chỉnh sửa sau kỳ thi Round 2 ngày 12/12/2025"
                    className="rounded-md border px-2 py-1 text-xs"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <button
                onClick={() => setNewVersionOpen(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={doSaveNewVersionToTarget}
                className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Lưu phiên bản mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog */}
      <RubricsCatalogSection
        levels={levels}
        roundsAll={roundsAll}
        stations={stations}
      />
    </div>
  );
}
