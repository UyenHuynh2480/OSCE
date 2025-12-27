
// app/results/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

/** ===== Kiểu dữ liệu khớp schema Supabase ===== */
type UUID = string;
type GlobalRating = "Fail" | "Pass" | "Good" | "Excellent";
type UserRole = "admin" | "grader" | "uploader" | "assigner" | "score_viewer";

interface Level { id: UUID; name: string }
interface Cohort { id: UUID; level_id: UUID; year: number }
interface ExamRoundView {
  id: UUID; display_name: string; cohort_id: UUID;
  round_number: number; date: string | null; groups: string[] | null;
}
interface Station { id: UUID; name: string }
interface Chain { id: UUID; name: string; color?: string | null }

interface Student {
  id: UUID;
  student_code: string;
  last_name: string;
  name: string;
  cohort_id: UUID;
  batch_number?: number | null;
  group_number?: number | null;
}

interface ExamSession {
  id: UUID;
  exam_round_id: UUID;
  student_id: UUID;
  chain_id: UUID | null;
  assigned_grader_id?: UUID | null;
}

interface ScoreRow {
  id: UUID;
  exam_session_id: UUID;
  station_id: UUID;
  exam_round_id: UUID;
  level_id?: UUID | null;
  cohort_id?: UUID | null;
  student_id: UUID;
  total_score: number;
  global_rating: GlobalRating;
  comment?: string | null;
  grader_id?: UUID | null;
  item_scores: Record<string, number>;
  graded_at?: string | null;
  inserted_at?: string | null;
  created_at?: string | null;
}

interface FixedRubricItem {
  id: string;
  text: string;
  levels: Record<GlobalRating, { score: number; desc: string }>;
}
interface RubricView {
  id: UUID;
  display_name?: string | null;
  task_name: string;
  station_id: UUID;
  cohort_id: UUID;
  level_id: UUID;
  exam_round_id: UUID;
  items: FixedRubricItem[];
  max_score?: number | null;
  station_name?: string | null;
  cohort_year?: number | null;
  round_name?: string | null;
  level_name?: string | null;
}

/** ===== Results Page ===== */
export default function ResultsPage() {
  const router = useRouter();

  /** Catalogs */
  const [levels, setLevels] = useState<Level[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [rounds, setRounds] = useState<ExamRoundView[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);

  /** Selections (bộ lọc) */
  const [levelId, setLevelId] = useState<string>("");
  const [cohortId, setCohortId] = useState<string>("");
  const [roundId, setRoundId] = useState<string>("");
  const [stationId, setStationId] = useState<string>("");
  const [chainId, setChainId] = useState<string>("");   // tùy chọn
  const [groupFilter, setGroupFilter] = useState<string>(""); // "" = All
  const [keyword, setKeyword] = useState<string>("");   // tìm Họ/Tên/Mã SV

  /** Data */
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);            // theo trạm đang chọn (nếu có)
  const [rubric, setRubric] = useState<RubricView | null>(null);   // theo trạm đang chọn (nếu có)

  // Dữ liệu toàn đợt (không lọc trạm)
  const [scoresAll, setScoresAll] = useState<ScoreRow[]>([]);
  const [rubricsAll, setRubricsAll] = useState<RubricView[]>([]);

  // Map tên GV chấm
  const [graders, setGraders] = useState<{ id: string; full_name: string }[]>([]);

  /** Loading & status */
  const [loading, setLoading] = useState<boolean>(true);
  const [status, setStatus] = useState<string>("");

  /** Auto‑refresh */
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(false);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(30);
  const intervalRef = useRef<number | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");

  /** Vai trò user (để hiện nút Dashboard theo role) */
  const [userRole, setUserRole] = useState<UserRole>("score_viewer");
  const isAdmin = userRole === "admin";
  const isUploader = userRole === "uploader";

  /** ===== Tải vai trò & graders ===== */
  useEffect(() => {
    (async () => {
      // Lấy role qua RPC get_my_role() (SECURITY DEFINER)
      const { data: roleData, error: roleErr } = await supabase.rpc("get_my_role");
      if (!roleErr && typeof roleData === "string") {
        setUserRole(roleData as UserRole);
      }

      // Tải danh sách graders để map grader_id -> họ tên
      const { data: gdrs } = await supabase
        .from("graders")
        .select("id, last_name, first_name");
      setGraders(
        (gdrs ?? []).map((g: any) => ({
          id: g.id,
          full_name: `${g.last_name ?? ""} ${g.first_name ?? ""}`.trim(),
        }))
      );
    })();
  }, []);

  /** ===== Tải danh mục cơ bản ===== */
  useEffect(() => {
    (async () => {
      const [{ data: lvl }, { data: sts }, { data: chs }] = await Promise.all([
        supabase.from("levels").select("id,name").order("name", { ascending: true }),
        supabase.from("stations").select("id,name").order("name", { ascending: true }),
        supabase.from("chains").select("id,name,color").order("name", { ascending: true }),
      ]);
      setLevels(lvl ?? []);
      setStations(sts ?? []);
      setChains(chs ?? []);
    })();
  }, []);

  /** Level -> Cohorts */
  useEffect(() => {
    setCohorts([]); setRounds([]);
    setCohortId(""); setRoundId("");
    setStudents([]); setSessions([]); setScores([]); setRubric(null);
    setScoresAll([]); setRubricsAll([]);
    if (!levelId) return;
    (async () => {
      const { data, error } = await supabase
        .from("cohorts").select("id, year, level_id")
        .eq("level_id", levelId).order("year", { ascending: true });
      if (error) console.error("Lỗi lấy Cohort:", error.message);
      setCohorts(data ?? []);
    })();
  }, [levelId]);

  /** Cohort -> Rounds */
  useEffect(() => {
    setRounds([]); setRoundId("");
    setStudents([]); setSessions([]); setScores([]); setRubric(null);
    setScoresAll([]); setRubricsAll([]);
    if (!cohortId) return;
    (async () => {
      const { data, error } = await supabase
        .from("exam_rounds_view")
        .select("id, display_name, cohort_id, round_number, date, groups")
        .eq("cohort_id", cohortId).order("round_number", { ascending: true });
      if (error) console.error("Lỗi lấy Round:", error.message);
      setRounds(data ?? []);
    })();
  }, [cohortId]);

  /** Round -> load students/sessions/scores/rubrics */
  useEffect(() => {
    setStudents([]); setSessions([]); setScores([]); setRubric(null);
    setScoresAll([]); setRubricsAll([]);
    setStatus("");
    if (!roundId || !cohortId) return;

    (async () => {
      setLoading(true);

      const [{ data: studs, error: errStuds }, { data: sess, error: errSess }] = await Promise.all([
        supabase.from("students")
          .select("id, student_code, last_name, name, cohort_id, batch_number, group_number")
          .eq("cohort_id", cohortId)
          .order("student_code", { ascending: true }),
        supabase.from("exam_sessions")
          .select("id, exam_round_id, student_id, chain_id, assigned_grader_id")
          .eq("exam_round_id", roundId),
      ]);

      if (errStuds || errSess) {
        console.error(errStuds ?? errSess);
        setStatus("❌ Lỗi tải danh sách sinh viên/phiên thi!");
        setLoading(false);
        return;
      }

      setStudents(studs ?? []);
      setSessions(sess ?? []);

      // Điểm + rubric cho trạm đang chọn
      if (stationId) {
        const [{ data: sc, error: errScore }, { data: rv }] = await Promise.all([
          supabase.from("scores")
            .select("id, exam_session_id, station_id, exam_round_id, level_id, cohort_id, student_id, total_score, global_rating, comment, item_scores, grader_id, graded_at, inserted_at, created_at")
            .eq("exam_round_id", roundId)
            .eq("station_id", stationId),
          supabase.from("rubrics_view")
            .select("id, display_name, task_name, station_id, cohort_id, level_id, exam_round_id, items, max_score, station_name, cohort_year, round_name, level_name")
            .eq("station_id", stationId)
            .eq("cohort_id", cohortId)
            .eq("level_id", levelId)
            .eq("exam_round_id", roundId)
            .maybeSingle(),
        ]);

        if (errScore) {
          console.error(errScore);
          setStatus("❌ Lỗi tải điểm (trạm).");
        }
        setScores(sc ?? []);
        setRubric(rv ?? null);
      } else {
        setScores([]);
        setRubric(null);
      }

      // Toàn đợt
      const [{ data: scAll }, { data: rubAll }] = await Promise.all([
        supabase.from("scores")
          .select("id, exam_session_id, station_id, exam_round_id, level_id, cohort_id, student_id, total_score, global_rating, comment, item_scores, grader_id, graded_at, inserted_at, created_at")
          .eq("exam_round_id", roundId),
        supabase.from("rubrics_view")
          .select("id, display_name, task_name, station_id, cohort_id, level_id, exam_round_id, items, max_score, station_name, cohort_year, round_name, level_name")
          .eq("cohort_id", cohortId)
          .eq("level_id", levelId)
          .eq("exam_round_id", roundId),
      ]);
      setScoresAll(scAll ?? []);
      setRubricsAll(rubAll ?? []);

      setLoading(false);
      setLastRefreshedAt(new Date().toLocaleString("vi-VN"));
    })();
  }, [roundId, cohortId, stationId, levelId]);

  /** Auto‑refresh (sessions + scores theo trạm + scoresAll toàn đợt) */
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefreshEnabled && roundId) {
      const ms = Math.max(5, refreshIntervalSec) * 1000;
      intervalRef.current = window.setInterval(async () => {
        const [{ data: sess }, { data: sc }, { data: scAll }] = await Promise.all([
          supabase.from("exam_sessions")
            .select("id, exam_round_id, student_id, chain_id, assigned_grader_id")
            .eq("exam_round_id", roundId),
          stationId
            ? supabase.from("scores")
                .select("id, exam_session_id, station_id, exam_round_id, level_id, cohort_id, student_id, total_score, global_rating, comment, item_scores, grader_id, graded_at, inserted_at, created_at")
                .eq("exam_round_id", roundId)
                .eq("station_id", stationId)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from("scores")
            .select("id, exam_session_id, station_id, exam_round_id, level_id, cohort_id, student_id, total_score, global_rating, comment, item_scores, grader_id, graded_at, inserted_at, created_at")
            .eq("exam_round_id", roundId),
        ]);
        setSessions(sess ?? []);
        if (stationId) setScores(sc ?? []);
        setScoresAll(scAll ?? []);
        setLastRefreshedAt(new Date().toLocaleString("vi-VN"));
      }, ms);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefreshEnabled, refreshIntervalSec, roundId, stationId]);

  /** ======= Join + Filter + Sort ======= */
  const scoredSessionIds = useMemo(() => new Set(scores.map(s => s.exam_session_id)), [scores]);

  const chainNameById = useMemo(() => {
    const m: Record<string, string> = {};
    chains.forEach(c => { m[c.id] = c.name; });
    return m;
  }, [chains]);

  const chainInfoById = useMemo(() => {
    const m: Record<string, { name: string; color?: string | null }> = {};
    chains.forEach(c => { m[c.id] = { name: c.name, color: c.color }; });
    return m;
  }, [chains]);

  const stationNameById = useMemo(() => {
    const m: Record<string, string> = {};
    stations.forEach(s => { m[s.id] = s.name; });
    return m;
  }, [stations]);

  const graderNameById = useMemo(() => {
    const m: Record<string, string> = {};
    graders.forEach(g => { m[g.id] = g.full_name; });
    return m;
  }, [graders]);

  const rubricsByStationId = useMemo(() => {
    const m = new Map<string, RubricView>();
    rubricsAll.forEach(r => m.set(r.station_id, r));
    return m;
  }, [rubricsAll]);

  const sessionsJoined = useMemo(() => {
    const mapStudent = new Map(students.map(s => [s.id, s]));
    return (sessions ?? [])
      .map(s => {
        const st = mapStudent.get(s.student_id);
        if (!st) return null;
        const chain_name = s.chain_id ? (chainNameById[s.chain_id] ?? "") : "";
        const graded = s.id ? scoredSessionIds.has(s.id) : false;
        return { session: s, student: st, chain_name, graded };
      })
      .filter(Boolean) as { session: ExamSession; student: Student; chain_name: string; graded: boolean }[];
  }, [sessions, students, chainNameById, scoredSessionIds]);

  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return sessionsJoined
      .filter(r => (chainId ? r.session.chain_id === chainId : true))
      .filter(r => (groupFilter ? String(r.student.group_number ?? "") === groupFilter : true))
      .filter(r => {
        if (!kw) return true;
        const fields = [
          r.student.last_name ?? "",
          r.student.name ?? "",
          r.student.student_code ?? "",
        ].map(x => x.toLowerCase());
        return fields.some(f => f.includes(kw));
      });
  }, [sessionsJoined, chainId, groupFilter, keyword]);

  const orderedRows = useMemo(() => {
    const byCode = (a?: Student, b?: Student) =>
      (a?.student_code ?? "").localeCompare(b?.student_code ?? "");
    const notDone = [...filteredRows].filter(r => !r.graded).sort((a,b)=>byCode(a.student,b.student));
    const done = [...filteredRows].filter(r => r.graded).sort((a,b)=>byCode(a.student,b.student));
    return [...notDone, ...done];
  }, [filteredRows]);

  /** KPI */
  const total = filteredRows.length;
  const gradedCount = filteredRows.filter(r => r.graded).length;
  const ungradedCount = total - gradedCount;

  /** ===== Dashboard Rubric: đếm theo từng item (trạm đang chọn) ===== */
  type ItemDist = { itemId: string; text: string; counts: Record<GlobalRating, number>; total: number };

  const itemDistributions = useMemo<ItemDist[]>(() => {
    if (!rubric || scores.length === 0) return [];
    const dists: ItemDist[] = [];
    const levelKeys: GlobalRating[] = ["Fail","Pass","Good","Excellent"];
    const mapScoreToLevelByItem: Record<string, Record<number, GlobalRating>> = {};

    // Map score -> level key cho từng item
    rubric.items.forEach(item => {
      const m: Record<number, GlobalRating> = {};
      levelKeys.forEach(k => {
        const sc = item.levels[k]?.score;
        if (typeof sc === "number") m[sc] = k;
      });
      mapScoreToLevelByItem[item.id] = m;
    });

    // Khởi tạo
    rubric.items.forEach(item => {
      const base: Record<GlobalRating, number> = { Fail:0, Pass:0, Good:0, Excellent:0 };
      dists.push({ itemId: item.id, text: item.text, counts: base, total: 0 });
    });

    // Cộng dồn
    const distByItemId = new Map<string, ItemDist>();
    dists.forEach(d => distByItemId.set(d.itemId, d));

    scores.forEach(sc => {
      const is = sc.item_scores || {};
      Object.entries(is).forEach(([itemId, scoreVal]) => {
        const dist = distByItemId.get(itemId);
        if (!dist) return;
        const lv = mapScoreToLevelByItem[itemId]?.[Number(scoreVal)];
        if (lv) {
          dist.counts[lv] += 1;
          dist.total += 1;
        }
      });
    });

    return dists;
  }, [rubric, scores]);

  /** Tên hiển thị */
  const levelName = useMemo(()=>levels.find(l=>l.id===levelId)?.name ?? "",[levels, levelId]);
  const cohortYear = useMemo(()=>cohorts.find(c=>c.id===cohortId)?.year ?? "",[cohorts, cohortId]);
  const roundName = useMemo(()=>rounds.find(r=>r.id===roundId)?.display_name ?? "",[rounds, roundId]);
  const stationName = useMemo(()=>stations.find(s=>s.id===stationId)?.name ?? "",[stations, stationId]);
  const chainName = useMemo(()=>chains.find(c=>c.id===chainId)?.name ?? "",[chains, chainId]);

  /** ===== Excel helpers ===== */
  const safeSheetName = (name: string) =>
    (name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

  const fileSuffix = useMemo(() =>
    `L_${levelName || "Level"}_C_${cohortYear || "Cohort"}_R_${roundName || "Round"}`
    + `${stationName ? `_S_${stationName}` : ""}`
    + `${chainName ? `_Ch_${chainName}` : ""}`
    .replace(/\s+/g, "_"),
    [levelName, cohortYear, roundName, stationName, chainName]
  );

  /** ===== Export: DS SV theo bộ lọc ===== */
  function exportStudentsExcel() {
    if (orderedRows.length === 0) {
      setStatus("⚠️ Không có dữ liệu để xuất Excel (DS SV).");
      return;
    }
    const data = orderedRows.map((r, idx) => ({
      STT: idx + 1,
      "Mã SV (Student Code)": r.student.student_code,
      "Họ và tên (Full Name)": `${r.student.last_name} ${r.student.name}`.trim(),
      "Tổ (Group)": r.student.group_number ?? "",
      "Chuỗi (Chain)": r.chain_name || "",
      "Trạng thái": r.graded ? "Đã chấm" : "Chưa chấm",
      "Đợt thi (Round)": roundName,
      ...(stationName ? { "Trạm (Station)": stationName } : {}),
      ...(chainName ? { "Chuỗi lọc": chainName } : {}),
      ...(groupFilter ? { "Tổ lọc": groupFilter } : {}),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), safeSheetName("DS_SV"));

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `DS_SV_${fileSuffix}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** ===== Export: Bảng điểm chung — toàn đợt ===== */
  function exportRoundSummaryExcel() {
    if (!roundId) { setStatus("⚠️ Vui lòng chọn Đợt thi."); return; }
    if (sessions.length === 0 || students.length === 0) {
      setStatus("⚠️ Chưa có dữ liệu phiên thi / sinh viên."); return;
    }
    if (scoresAll.length === 0) {
      setStatus("⚠️ Chưa có điểm để xuất (toàn đợt)."); return;
    }

    const mapSessionByStudentId = new Map<string, ExamSession>();
    sessions.forEach(s => mapSessionByStudentId.set(s.student_id, s));

    const data = students
      .filter(st => {
        const sess = mapSessionByStudentId.get(st.id);
        if (!sess) return false;
        const chainOk = chainId ? sess.chain_id === chainId : true;
        const groupOk = groupFilter ? String(st.group_number ?? "") === groupFilter : true;
        const kw = keyword.trim().toLowerCase();
        const kwOk = !kw || [st.last_name ?? "", st.name ?? "", st.student_code ?? ""]
          .map(x => x.toLowerCase()).some(f => f.includes(kw));
        return chainOk && groupOk && kwOk;
      })
      .map((st, idx) => {
        const sess = mapSessionByStudentId.get(st.id);
        const chain = sess?.chain_id ? chainInfoById[sess.chain_id] : undefined;
        const scArr = scoresAll.filter(sc => sc.exam_session_id === (sess?.id ?? ""));

        const totalAllStations = scArr.reduce((sum, s) => sum + (Number(s.total_score ?? 0)), 0);
        const stationCount = scArr.length;

        return {
          STT: idx + 1,
          "Mã SV (Student Code)": st.student_code,
          "Họ và tên (Full Name)": `${st.last_name} ${st.name}`.trim(),
          "Tổ (Group)": st.group_number ?? "",
          "Niên khóa (Cohort)": cohortYear,
          "Đợt thi (Round)": roundName,
          "Ngày thi (Date)": rounds.find(r => r.id === roundId)?.date ?? "",
          "Chuỗi (Chain)": chain?.name ?? "",
          "Chuỗi màu (Color)": chain?.color ?? "",
          "Số trạm đã chấm": stationCount,
          "Điểm chung (tổng các trạm)": totalAllStations,
        };
      });

    if (data.length === 0) {
      setStatus("⚠️ Không có dữ liệu phù hợp bộ lọc để xuất (toàn đợt).");
      return;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), safeSheetName("Diem_chung_toan_dot"));

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Diem_chung_toan_dot_${fileSuffix}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** ===== Export: Điểm chi tiết — toàn đợt ===== */
  function exportDetailedScoresExcel() {
    if (!roundId) { setStatus("⚠️ Vui lòng chọn Đợt thi."); return; }
    if (sessions.length === 0 || students.length === 0) {
      setStatus("⚠️ Chưa có dữ liệu phiên thi / sinh viên."); return;
    }
    if (scoresAll.length === 0) {
      setStatus("⚠️ Chưa có điểm để xuất (chi tiết)."); return;
    }

    const mapSessionByStudentId = new Map<string, ExamSession>();
    sessions.forEach(s => mapSessionByStudentId.set(s.student_id, s));

    // Danh sách trạm có điểm trong đợt
    const stationIdsInContext = Array.from(new Set(scoresAll.map(s => s.station_id)));
    const stationOrder = stations
      .filter(st => stationIdsInContext.includes(st.id))
      .map(st => st.id);

    const dataRows = students
      .filter(st => {
        const sess = mapSessionByStudentId.get(st.id);
        if (!sess) return false;
        const chainOk = chainId ? sess.chain_id === chainId : true;
        const groupOk = groupFilter ? String(st.group_number ?? "") === groupFilter : true;
        const kw = keyword.trim().toLowerCase();
        const kwOk = !kw || [st.last_name ?? "", st.name ?? "", st.student_code ?? ""]
          .map(x => x.toLowerCase()).some(f => f.includes(kw));
        return chainOk && groupOk && kwOk;
      })
      .map((st, idx) => {
        const sess = mapSessionByStudentId.get(st.id);
        const chain = sess?.chain_id ? chainInfoById[sess.chain_id] : undefined;

        const row: Record<string, any> = {
          STT: idx + 1,
          "Mã SV (Student Code)": st.student_code,
          "Họ và tên (Full Name)": `${st.last_name} ${st.name}`.trim(),
          "Tổ (Group)": st.group_number ?? "",
          "Niên khóa (Cohort)": cohortYear,
          "Đợt thi (Round)": roundName,
          "Ngày thi (Date)": rounds.find(r => r.id === roundId)?.date ?? "",
          "Chuỗi (Chain)": chain?.name ?? "",
          "Chuỗi màu (Color)": chain?.color ?? "",
        };

        let totalAllStations = 0;

        stationOrder.forEach(stId => {
          const stName = stationNameById[stId] || stId;
          const score = scoresAll.find(sc => sc.exam_session_id === (sess?.id ?? "") && sc.station_id === stId);
          const rbr = rubricsByStationId.get(stId);
          const items = rbr?.items ?? [];

          // Giờ chấm: ưu tiên graded_at -> inserted_at -> created_at
          const timeString =
            score?.graded_at ? new Date(score.graded_at).toLocaleString("vi-VN") :
            score?.inserted_at ? new Date(score.inserted_at).toLocaleString("vi-VN") :
            score?.created_at ? new Date(score.created_at).toLocaleString("vi-VN") : "";

          row[`Giờ chấm – ${stName}`] = timeString;

          // Điểm từng item
          items.forEach(it => {
            const val = score?.item_scores?.[it.id];
            row[`Điểm – ${stName} – ${it.text}`] = (typeof val === "number") ? val : "";
          });

          // Tổng, GV, rating
          row[`Điểm tổng – ${stName}`] = (typeof score?.total_score === "number") ? score.total_score : "";
          if (typeof score?.total_score === "number") totalAllStations += Number(score.total_score);

          const graderName = (score?.grader_id && graderNameById[score.grader_id]) ? graderNameById[score.grader_id] : (score?.grader_id ?? "");
          row[`GV chấm – ${stName}`] = graderName || "";

          row[`Global rating – ${stName}`] = score?.global_rating ?? "";
          // (Tuỳ chọn) Nhận xét:
          // row[`Comment – ${stName}`] = score?.comment ?? "";
        });

        row["Điểm chung (tổng các trạm)"] = totalAllStations;

        return row;
      });

    if (dataRows.length === 0) {
      setStatus("⚠️ Không có dữ liệu phù hợp bộ lọc để xuất (chi tiết).");
      return;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataRows),
      safeSheetName("Diem_chi_tiet_toan_dot")
    );

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Diem_chi_tiet_${fileSuffix}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /** ===== UI ===== */
  return (
    <div className="p-6 max-w-7xl mx-auto bg-sky-50 min-h-screen font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold text-sky-900 border-b pb-2">
          KẾT QUẢ THI OSCE (Results) 📊
        </h1>

        <div className="flex items-center gap-3">
          {/* Nút quay về Dashboard theo role */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => router.push("/dashboard/admin")}
              className="bg-sky-700 text-white px-4 py-2 rounded-md font-bold hover:bg-sky-800"
              title="Quay về Dashboard Admin"
            >
              ⬅️ Dashboard Admin
            </button>
          )}
          {isUploader && (
            <button
              type="button"
              onClick={() => router.push("/dashboard/uploader")}
              className="bg-sky-700 text-white px-4 py-2 rounded-md font-bold hover:bg-sky-800"
              title="Quay về Dashboard Uploader"
            >
              ⬅️ Dashboard Uploader
            </button>
          )}
          {!isAdmin && !isUploader && (
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/login");
              }}
              className="bg-rose-600 text-white px-4 py-2 rounded-md font-bold hover:bg-rose-700"
              title="Đăng xuất"
            >
              🚪 Đăng xuất
            </button>
          )}

          {/* Auto‑refresh */}
          <div className="flex items-center gap-3 bg-white border border-sky-200 rounded-md px-3 py-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              <span className="text-sky-800 font-semibold">Auto‑refresh</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-sky-900">Chu kỳ</span>
              <input
                type="number"
                min={5}
                step={5}
                value={refreshIntervalSec}
                onChange={(e) => setRefreshIntervalSec(Number(e.target.value))}
                className="w-20 p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
              />
              <span className="text-sm text-sky-900">giây</span>
            </div>
            {lastRefreshedAt && (
              <span className="text-sm text-sky-700">Cập nhật: <strong>{lastRefreshedAt}</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* Status */}
      {status && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            status.startsWith("❌")
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : status.startsWith("⚠️")
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : "bg-sky-50 text-sky-700 border border-sky-200"
          }`}
        >
          {status}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-6 gap-4 bg-white p-4 rounded-lg shadow mb-4 border border-sky-200">
        {/* Level */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Đối tượng (Level)
          </label>
          <select
            value={levelId}
            onChange={(e)=>setLevelId(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
          >
            <option value="">-- Chọn Level --</option>
            {levels.map(l=> <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {/* Cohort */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Niên khóa (Cohort)
          </label>
          <select
            value={cohortId}
            onChange={(e)=>setCohortId(e.target.value)}
            disabled={!levelId}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
          >
            <option value="">-- Chọn Cohort --</option>
            {cohorts.map(c=> <option key={c.id} value={c.id}>{c.year}</option>)}
          </select>
        </div>

        {/* Round */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Đợt thi (Round)
          </label>
          <select
            value={roundId}
            onChange={(e)=>setRoundId(e.target.value)}
            disabled={!cohortId}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
          >
            <option value="">-- Chọn Đợt --</option>
            {rounds.map(r=> <option key={r.id} value={r.id}>{r.display_name}</option>)}
          </select>
        </div>

        {/* Station */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Trạm (Station)
          </label>
          <select
            value={stationId}
            onChange={(e)=>setStationId(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
          >
            <option value="">-- Tất cả --</option>
            {stations.map(s=> <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Chain */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Chuỗi (Chain)
          </label>
          <select
            value={chainId}
            onChange={(e)=>setChainId(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
          >
            <option value="">-- Tất cả --</option>
            {chains.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Group filter */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Tổ (Group number)
          </label>
          <select
            value={groupFilter}
            onChange={(e)=>setGroupFilter(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
          >
            <option value="">-- Tất cả --</option>
            {Array.from(new Set(students.map(s => s.group_number).filter(g => Number.isFinite(g)))).sort((a:any,b:any)=>a-b)
              .map((g:any)=> <option key={g} value={String(g)}>{g}</option>)
            }
          </select>
        </div>

        {/* Keyword */}
        <div className="col-span-3">
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            Tìm SV (Họ/Tên/Mã)
          </label>
          <input
            value={keyword}
            onChange={(e)=>setKeyword(e.target.value)}
            placeholder="VD: Nguyen / SV001 / Võ An…"
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
          />
        </div>

        {/* Export buttons */}
        <div className="col-span-3 flex items-end gap-2">
          <button
            type="button"
            onClick={exportStudentsExcel}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md font-bold hover:bg-emerald-700 disabled:bg-gray-400"
            disabled={orderedRows.length === 0}
            title="Xuất Excel danh sách SV theo bộ lọc"
          >
            ⬇️ Xuất DS SV
          </button>

          {/* Bảng điểm chung toàn đợt */}
          <button
            type="button"
            onClick={exportRoundSummaryExcel}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md font-bold hover:bg-indigo-700 disabled:bg-gray-400"
            disabled={!roundId || scoresAll.length === 0}
            title="Xuất điểm chung toàn đợt (tổng các trạm)"
          >
            ⬇️ Xuất bảng điểm (toàn đợt)
          </button>

          {/* Điểm chi tiết */}
          <button
            type="button"
            onClick={exportDetailedScoresExcel}
            className="bg-sky-600 text-white px-4 py-2 rounded-md font-bold hover:bg-sky-700 disabled:bg-gray-400"
            disabled={!roundId || scoresAll.length === 0}
            title="Xuất điểm chi tiết (từng trạm, từng mục)"
          >
            ⬇️ Xuất điểm chi tiết
          </button>
        </div>
      </div>

      {/* KPI tổng quan */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-sky-200 rounded-lg p-4 shadow">
          <div className="text-sm text-sky-700 font-semibold">Tổng số (theo bộ lọc)</div>
          <div className="text-3xl font-extrabold text-sky-900">{total}</div>
        </div>
        <div className="bg-white border border-emerald-200 rounded-lg p-4 shadow">
          <div className="text-sm text-emerald-700 font-semibold">Đã chấm</div>
          <div className="text-3xl font-extrabold text-emerald-900">{gradedCount}</div>
        </div>
        <div className="bg-white border border-rose-200 rounded-lg p-4 shadow">
          <div className="text-sm text-rose-700 font-semibold">Chưa chấm</div>
          <div className="text-3xl font-extrabold text-rose-900">{ungradedCount}</div>
        </div>
        <div className="bg-white border border-sky-200 rounded-lg p-4 shadow">
          <div className="text-sm text-sky-700 font-semibold">Bối cảnh</div>
          <div className="text-xs text-sky-800">
            Level: <strong>{levelName || "…"}</strong> • Cohort: <strong>{cohortYear || "…"}</strong> • Round: <strong>{roundName || "…"}</strong> • Station: <strong>{stationName || "All"}</strong> • Chain: <strong>{chainName || "All"}</strong>
          </div>
        </div>
      </div>

      {/* Bảng danh sách SV theo Chuỗi & Trạm */}
      <div className="bg-white border border-sky-200 rounded-lg p-4 shadow mb-6">
        <div className="text-xl font-semibold text-sky-900 mb-2">
          Danh sách sinh viên theo Chuỗi & Trạm
        </div>
        {loading && <p className="text-sky-600 font-semibold">Đang tải dữ liệu…</p>}
        {!loading && orderedRows.length === 0 && (
          <p className="text-rose-600 italic">Không có sinh viên trong bộ lọc hiện tại.</p>
        )}
        {!loading && orderedRows.length > 0 && (
          <table className="min-w-full bg-white border border-sky-200 rounded-lg overflow-hidden">
            <thead className="bg-sky-600 text-white">
              <tr>
                <th className="py-2 px-3 text-left w-1/12">STT</th>
                <th className="py-2 px-3 text-left w-2/12">Mã SV</th>
                <th className="py-2 px-3 text-left w-3/12">Họ tên</th>
                <th className="py-2 px-3 text-left w-2/12">Tổ</th>
                <th className="py-2 px-3 text-left w-2/12">Chuỗi</th>
                <th className="py-2 px-3 text-left w-2/12">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((r, idx) => (
                <tr key={r.session.id} className="border-b hover:bg-sky-50">
                  <td className="py-2 px-3">{idx + 1}</td>
                  <td className="py-2 px-3 font-mono text-sm">{r.student.student_code}</td>
                  <td className="py-2 px-3 font-medium">{r.student.last_name} {r.student.name}</td>
                  <td className="py-2 px-3">{r.student.group_number ?? ""}</td>
                  <td className="py-2 px-3">{r.chain_name || "(N/A)"}</td>
                  <td className="py-2 px-3">
                    {r.graded ? (
                      <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">Đã chấm</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded bg-rose-100 text-rose-800 border border-rose-200 font-semibold">Chưa chấm</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dashboard Rubric (theo trạm) */}
      <div className="bg-white border border-sky-200 rounded-lg p-4 shadow">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-sky-900 mb-2">
            Dashboard Rubric theo Trạm {stationName ? `(${stationName})` : ""}
          </div>
          {!rubric && (
            <span className="text-rose-600 font-semibold italic">Chưa chọn Trạm hoặc chưa có Rubric cho ngữ cảnh này.</span>
          )}
        </div>

        {rubric && itemDistributions.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {itemDistributions.map((d, idx) => {
              const total = d.total || 1;
              const pFail = Math.round((d.counts.Fail / total) * 100);
              const pPass = Math.round((d.counts.Pass / total) * 100);
              const pGood = Math.round((d.counts.Good / total) * 100);
              const pExcel = Math.round((d.counts.Excellent / total) * 100);
              return (
                <div key={d.itemId} className="border border-sky-200 rounded-lg p-3">
                  <div className="font-semibold text-sky-800 mb-2">
                    #{idx + 1} {d.text} — <span className="text-sky-700">Tổng lượt chấm: {d.total}</span>
                  </div>
                  {/* Thanh phân bố */}
                  <div className="w-full h-6 rounded overflow-hidden flex">
                    <div title={`Fail: ${d.counts.Fail}`} style={{width: `${pFail}%`}} className="bg-rose-500" />
                    <div title={`Pass: ${d.counts.Pass}`} style={{width: `${pPass}%`}} className="bg-yellow-400" />
                    <div title={`Good: ${d.counts.Good}`} style={{width: `${pGood}%`}} className="bg-sky-500" />
                    <div title={`Excellent: ${d.counts.Excellent}`} style={{width: `${pExcel}%`}} className="bg-emerald-500" />
                  </div>
                  {/* Chú giải */}
                  <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
                    <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-rose-500 rounded" />Fail: <strong>{d.counts.Fail}</strong></div>
                    <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-yellow-400 rounded" />Pass: <strong>{d.counts.Pass}</strong></div>
                    <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-sky-500 rounded" />Good: <strong>{d.counts.Good}</strong></div>
                    <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 bg-emerald-500 rounded" />Excellent: <strong>{d.counts.Excellent}</strong></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {rubric && itemDistributions.length === 0 && (
          <p className="text-sky-600 italic">Chưa có điểm để hiển thị phân bố theo từng item.</p>
        )}
      </div>
    </div>
  );
}
