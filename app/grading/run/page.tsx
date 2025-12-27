
// app/grading/run/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const ADMIN_DASHBOARD_PATH = "/dashboard/admin";

type UUID = string;
type ItemLevelKey = "Fail" | "Pass" | "Good" | "Excellent";
type GlobalRating = "Fail" | "Pass" | "Good" | "Excellent";

interface ExamRoundView {
  id: UUID;
  display_name: string;
  cohort_id: UUID;
  round_number: number;
  date: string | null;
  groups: string[] | null;
}
interface Station { id: UUID; name: string; }
interface Grader { id: UUID; first_name: string; last_name: string; email?: string | null; }
interface StudentBrief {
  student_code: string;
  last_name: string;
  name: string;
  group_number?: number | null;
}
interface ExamSession {
  id: UUID;
  exam_round_id: UUID;
  student_id: UUID;
  chain_id: UUID | null;
  chains?: { name: string; color?: string | null };
  students?: StudentBrief;
}
interface FixedRubricItem {
  id: string;
  text: string;
  levels: Record<ItemLevelKey, { score: number; desc: string }>;
}
type RatingSelection = Record<string, number>;

const LEVEL_KEYS: ItemLevelKey[] = ["Fail", "Pass", "Good", "Excellent"];
const DEFAULT_GLOBAL_DESC: Record<GlobalRating, string> = {
  Fail: "Không đạt mục tiêu, sai/thiếu bước quan trọng hoặc không an toàn.",
  Pass: "Đạt mức tối thiểu, còn thiếu mạch lạc nhưng vẫn an toàn.",
  Good: "Thực hiện tốt, đúng quy trình, mạch lạc.",
  Excellent: "Xuất sắc, thuần thục, dự phòng tốt và giao tiếp rõ ràng.",
};

export default function GradingRunPage() {
  const params = useSearchParams();
  const router = useRouter();

  // Lấy role để điều khiển nút Admin
  const [role, setRole] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle();
      setRole(data?.role ?? "");
    })();
  }, []);
  const isAdmin = role === "admin";

  const levelId = params.get("level_id") ?? "";
  const cohortId = params.get("cohort_id") ?? "";
  const examRoundId = params.get("exam_round_id") ?? "";
  const stationId = params.get("station_id") ?? "";

  // Hỗ trợ chain_id / chain_ids
  const chainParamRaw =
    params.get("chain_id") ??
    params.get("chain_ids") ??
    "";

  const chainIdSet = useMemo(() => {
    const s = new Set<string>();
    chainParamRaw.split(",").map(v => v.trim()).filter(Boolean).forEach(id => s.add(id));
    return s;
  }, [chainParamRaw]);

  // Context & danh mục
  const [roundInfo, setRoundInfo] = useState<ExamRoundView | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [graders, setGraders] = useState<Grader[]>([]);
  const [graderId, setGraderId] = useState<string>("");

  // Sessions + trạng thái chấm
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [gradedSet, setGradedSet] = useState<Set<string>>(new Set());

  // Các session đã được mở khóa (admin chấp nhận regrade) → không mờ nữa
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());

  // Tìm kiếm + Lọc tổ
  const [keyword, setKeyword] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const groupOptions = useMemo(() => {
    const set = new Set<number>();
    sessions.forEach(s => {
      const g = s.students?.group_number;
      if (typeof g === "number") set.add(g);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [sessions]);

  // Rubric & chấm điểm
  const [rubric, setRubric] = useState<any | null>(null);
  const [ratings, setRatings] = useState<RatingSelection>({});
  const [globalRating, setGlobalRating] = useState<GlobalRating | "">("");
  const [comment, setComment] = useState<string>("");

  // Toast
  const [toastMsg, setToastMsg] = useState<string>("");
  const showToast = (msg: string, timeout=2500) => { setToastMsg(msg); window.setTimeout(()=>setToastMsg(""), timeout); };

  // Panel regrade
  const [showRegradePanel, setShowRegradePanel] = useState(false);
  const [regradeReason, setRegradeReason] = useState("");

  // Bản điểm hiện có
  const [selectedExistingScore, setSelectedExistingScore] = useState<{ id: string; allow_regrade: boolean } | null>(null);

  // Trạng thái yêu cầu đang chờ (để đổi nút)
  const [pendingRegrade, setPendingRegrade] = useState<{ id: string; inserted_at: string; reason?: string | null } | null>(null);

  // Nhớ trạng thái lock trước đó để hiện toast khi unlock
  const wasLockedRef = useRef<boolean>(false);

  // Nhớ quyết định regrade gần nhất để tránh toast lặp
  const lastDecisionIdRef = useRef<string | null>(null);

  // ====== Tải ngữ cảnh (Round, Station)
  useEffect(() => {
    const loadContext = async () => {
      const [{ data: roundData }, { data: stationData }] = await Promise.all([
        supabase.from("exam_rounds_view").select("id, display_name, cohort_id, round_number, date, groups").eq("id", examRoundId).maybeSingle(),
        supabase.from("stations").select("id, name").eq("id", stationId).maybeSingle(),
      ]);
      setRoundInfo(roundData ?? null);
      setStation(stationData ?? null);
    };
    if (examRoundId && stationId) loadContext();
  }, [examRoundId, stationId]);

  // ====== Tải danh sách giảng viên chấm
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("graders").select("id, first_name, last_name, email").order("last_name", { ascending: true });
      setGraders(data ?? []);
    })();
  }, []);

  // ====== Tải sessions và join students
  useEffect(() => {
    const loadSessions = async () => {
      setSelectedSessionId("");
      if (!examRoundId || !cohortId) { setSessions([]); return; }
      const [{ data: sess }, { data: studs }] = await Promise.all([
        supabase.from("exam_sessions").select("id, exam_round_id, student_id, chain_id, chains(name,color)").eq("exam_round_id", examRoundId).order("student_id", { ascending: true }),
        supabase.from("students").select("id, student_code, last_name, name, cohort_id, group_number").eq("cohort_id", cohortId),
      ]);
      const studsMap = new Map((studs ?? []).map(s => [s.id, s]));
      const joined: ExamSession[] = (sess ?? []).map(s => {
        const st = studsMap.get(s.student_id);
        return {
          ...s,
          students: st ? {
            student_code: st.student_code,
            last_name: st.last_name,
            name: st.name,
            group_number: st.group_number ?? null,
          } : undefined,
        };
      }).filter(s => !!s.students);
      setSessions(joined);
    };
    loadSessions();
  }, [examRoundId, cohortId]);

  // ====== Tải danh sách đã chấm (để mờ)
  useEffect(() => {
    const loadGraded = async () => {
      setGradedSet(new Set());
      if (!examRoundId || !stationId) return;

      try {
        // Ưu tiên API service role
        const r = await fetch(`/api/grading/list-graded?exam_round_id=${examRoundId}&station_id=${stationId}`);
        const j = await r.json();
        if (r.ok && j.ok) {
          const set = new Set<string>((j.exam_session_ids ?? []) as string[]);
          setGradedSet(set);
          return;
        }
        console.warn("list-graded API lỗi:", j.error || r.statusText);
      } catch (e) {
        console.warn("list-graded API exception:", (e as any)?.message);
      }

      // Fallback: lấy từ bảng scores/scores_view (đổi tên bảng cho đúng schema)
      try {
        const { data, error } = await supabase
          .from("scores_view") // ⬅️ đổi nếu bạn dùng bảng khác (scores)
          .select("exam_session_id, station_id")
          .eq("station_id", stationId);
        if (error) throw error;
        const set = new Set<string>((data ?? []).map(x => x.exam_session_id as string));
        setGradedSet(set);
      } catch (e2) {
        console.warn("graded fallback lỗi:", (e2 as any)?.message);
      }
    };
    loadGraded();
  }, [examRoundId, stationId]);

  // ====== Tải danh sách đã được unlock (approved)
  useEffect(() => {
    const loadUnlocked = async () => {
      setUnlockedSet(new Set());
      if (!examRoundId || !stationId) return;

      // Cách 1: Supabase trực tiếp (nếu bảng regrade_requests cho phép đọc)
      try {
        const { data, error } = await supabase
          .from("regrade_requests")
          .select("exam_session_id, status")
          .eq("station_id", stationId)
          .eq("status", "approved");
        if (error) throw error;
        const set = new Set<string>((data ?? []).map(x => x.exam_session_id));
        setUnlockedSet(set);
      } catch (e) {
        // Cách 2: API service role
        try {
          const r = await fetch(`/api/grading/list-unlocked?exam_round_id=${examRoundId}&station_id=${stationId}`);
          const j = await r.json();
          if (r.ok && j.ok) {
            setUnlockedSet(new Set<string>(j.exam_session_ids ?? []));
          } else {
            console.warn("Load unlocked lỗi:", j.error || r.statusText);
          }
        } catch (e2) {
          console.warn("Load unlocked lỗi (fallback):", (e2 as any)?.message);
        }
      }
    };
    loadUnlocked();
  }, [examRoundId, stationId]);

  // ====== Lọc + sắp xếp
  const filteredSessions = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return sessions
      .filter(s => chainIdSet.size ? (s.chain_id && chainIdSet.has(s.chain_id)) : true)
      .filter(s => groupFilter ? String(s.students?.group_number ?? "") === groupFilter : true)
      .filter(s => {
        if (!kw) return true;
        const fields = [s.students?.last_name ?? "", s.students?.name ?? "", s.students?.student_code ?? ""].map(x => x.toLowerCase());
        return fields.some(f => f.includes(kw));
      });
  }, [sessions, chainIdSet, groupFilter, keyword]);

  const orderedFilteredSessions = useMemo(() => {
    const byCode = (a?: StudentBrief, b?: StudentBrief) => (a?.student_code ?? "").localeCompare(b?.student_code ?? "");
    const notDone = [...filteredSessions].filter(s => !gradedSet.has(s.id)).sort((a,b)=>byCode(a.students,b.students));
    const done = [...filteredSessions].filter(s => gradedSet.has(s.id)).sort((a,b)=>byCode(a.students,b.students));
    return [...notDone, ...done];
  }, [filteredSessions, gradedSet]);

  // ====== Chọn mặc định SV
  useEffect(() => {
    if (!orderedFilteredSessions.length) { setSelectedSessionId(""); return; }
    const exists = orderedFilteredSessions.some(s => s.id === selectedSessionId);
    if (!exists) setSelectedSessionId(orderedFilteredSessions[0].id);
  }, [orderedFilteredSessions]);

  // ====== Load rubric
  useEffect(() => {
    const loadRubric = async () => {
      setRubric(null);
      if (!stationId || !cohortId || !examRoundId || !levelId) return;
      const { data: rv } = await supabase
        .from("rubrics_view")
        .select("id, task_name, items, max_score, station_id, cohort_id, level_id, exam_round_id, display_name")
        .eq("station_id", stationId).eq("cohort_id", cohortId).eq("level_id", levelId).eq("exam_round_id", examRoundId).maybeSingle();
      if (rv?.id) { setRubric(rv); setRatings({}); setGlobalRating(""); setComment(""); return; }
      const { data: r } = await supabase
        .from("rubrics")
        .select("id, task_name, items, max_score, station_id, cohort_id, level_id, exam_round_id, name")
        .eq("station_id", stationId).eq("cohort_id", cohortId).eq("level_id", levelId).eq("exam_round_id", examRoundId).maybeSingle();
      if (r?.id) { setRubric({ ...r, display_name: r.name ?? null }); setRatings({}); setGlobalRating(""); setComment(""); return; }
      setRubric(null);
    };
    loadRubric();
  }, [stationId, cohortId, examRoundId, levelId]);

  // ====== TÍNH ĐIỂM
  const rawTotal = useMemo(() => {
    if (!rubric) return 0;
    return rubric.items.reduce((acc: number, item: FixedRubricItem) => acc + (ratings[item.id] ?? 0), 0);
  }, [rubric, ratings]);

  const scaledTotal = useMemo(() => {
    if (!rubric) return 0;
    const max = rubric.max_score ?? 10;
    if (Number(max) <= 10) return Math.min(10, Math.max(0, rawTotal));
    const factor = 10 / Number(max);
    return Math.min(10, Math.max(0, rawTotal * factor));
  }, [rubric, rawTotal]);

  const onSelectLevelScore = (itemId: string, score: number) =>
    setRatings(prev => ({ ...prev, [itemId]: score }));

  const suggestGlobal = (t: number): GlobalRating =>
    (t < 5 ? "Fail" : t < 6.5 ? "Pass" : t < 8.5 ? "Good" : "Excellent");

  const resetAll = () => { setRatings({}); setGlobalRating(""); setComment(""); };

  // ====== Current student + chain
  const currentStudent = useMemo(() => {
    const s = orderedFilteredSessions.find(ss => ss.id === selectedSessionId);
    if (!s?.students) return null;
    const fullName = `${s.students.last_name} ${s.students.name}`;
    const code = s.students.student_code;
    const group = typeof s.students.group_number === "number" ? s.students.group_number : null;
    return { fullName, code, group };
  }, [orderedFilteredSessions, selectedSessionId]);

  const currentChain = useMemo(() => {
    const s = orderedFilteredSessions.find(ss => ss.id === selectedSessionId);
    const name = s?.chains?.name ?? "(chưa gán chuỗi)";
    const color = s?.chains?.color ?? "#0ea5e9";
    return { name, color };
  }, [orderedFilteredSessions, selectedSessionId]);

  // ====== Selected score — dùng API get-score (thêm unlock ngay khi thấy allow_regrade=true)
  useEffect(() => {
    const fetchSelected = async () => {
      if (!selectedSessionId || !stationId) { setSelectedExistingScore(null); return; }
      const r = await fetch('/api/grading/get-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_session_id: selectedSessionId, station_id: stationId }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { console.warn('get-score lỗi:', j.error || r.statusText); setSelectedExistingScore(null); return; }
      setSelectedExistingScore(j.score ?? null);

      // Nếu SV đang chọn đã unlock → bỏ mờ ngay trong danh sách
      if (j.score?.allow_regrade === true) {
        setUnlockedSet(prev => {
          const next = new Set(prev);
          next.add(selectedSessionId);
          return next;
        });
      }
    };
    fetchSelected();
  }, [selectedSessionId, stationId]);

  // ====== Pending regrade?
  useEffect(() => {
    const loadPendingRegrade = async () => {
      setPendingRegrade(null);
      if (!selectedSessionId || !stationId) return;
      const { data } = await supabase
        .from("regrade_requests")
        .select("id, inserted_at, reason, status")
        .eq("exam_session_id", selectedSessionId)
        .eq("station_id", stationId)
        .eq("status", "pending")
        .maybeSingle();
      setPendingRegrade(data?.id ? { id: data.id, inserted_at: data.inserted_at, reason: data.reason ?? null } : null);
    };
    loadPendingRegrade();
  }, [selectedSessionId, stationId]);

  // ====== Poll unlock (approve từ Admin) — dùng API get-score
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!selectedSessionId || !stationId) return;
      try {
        const r = await fetch('/api/grading/get-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_session_id: selectedSessionId, station_id: stationId }),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) return;

        const nowUnlocked = !!j.score && j.score.allow_regrade === true;
        const prevLocked = wasLockedRef.current;

        setSelectedExistingScore(prev =>
          prev
            ? { ...prev, allow_regrade: nowUnlocked }
            : (j.score ? { id: j.score.id, allow_regrade: nowUnlocked } : null)
        );

        if (prevLocked && nowUnlocked) {
          setUnlockedSet(prev => {
            const next = new Set(prev);
            next.add(selectedSessionId);
            return next;
          });
          showToast("✅ Yêu cầu chấm lại đã được chấp nhận. Bạn có thể chấm lại.");
          setPendingRegrade(null);
        }
        wasLockedRef.current = !nowUnlocked;
      } catch (e) {
        // ignore polling error
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedSessionId, stationId]);

  // ====== Poll quyết định regrade (approved/rejected)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!selectedSessionId || !stationId) return;
      try {
        const { data, error } = await supabase
          .from("regrade_requests")
          .select("id, inserted_at, reason, status")
          .eq("exam_session_id", selectedSessionId)
          .eq("station_id", stationId)
          .order("inserted_at", { ascending: false })
          .limit(1);
        if (error) return;
        const latest = Array.isArray(data) ? data[0] : null;
        if (!latest) return;
        if (latest.status !== "pending" && lastDecisionIdRef.current !== latest.id) {
          lastDecisionIdRef.current = latest.id;
          if (latest.status === "approved") {
            setUnlockedSet(prev => {
              const next = new Set(prev);
              next.add(selectedSessionId);
              return next;
            });
            showToast("✅ Admin đã chấp nhận chấm lại.");
            setPendingRegrade(null);
            setSelectedExistingScore(prev => (prev ? { ...prev, allow_regrade: true } : prev));
            wasLockedRef.current = false;
          } else if (latest.status === "rejected") {
            showToast("❌ Yêu cầu chấm lại đã bị từ chối bởi admin.");
            setPendingRegrade(null);
            setSelectedExistingScore(prev => (prev ? { ...prev, allow_regrade: false } : prev));
            wasLockedRef.current = true;
          }
        }
      } catch (e) {
        // ignore polling error
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedSessionId, stationId]);

  // ====== CÁC CỜ
  const allGraded = filteredSessions.length > 0
    && filteredSessions.every(s => gradedSet.has(s.id));

  const isLocked = !!(selectedExistingScore && !selectedExistingScore.allow_regrade);
  useEffect(() => { wasLockedRef.current = isLocked; }, [isLocked]);

  const disableSave = !selectedSessionId || !graderId || isLocked;

  // ====== Gửi yêu cầu regrade
  const requestRegrade = async () => {
    if (!selectedSessionId) { alert("Chưa chọn sinh viên."); return; }
    if (!graderId) { alert("Vui lòng chọn Giảng viên chấm."); return; }
    if (pendingRegrade?.id) { showToast("⏳ Đã có yêu cầu đang chờ admin."); return; }

    const { error } = await supabase.from("regrade_requests").insert({
      exam_session_id: selectedSessionId,
      station_id: stationId,
      requested_by: graderId,
      reason: regradeReason || null,
    });
    if (error) { alert("Gửi yêu cầu thất bại: " + error.message); return; }

    const { data } = await supabase
      .from("regrade_requests")
      .select("id, inserted_at, reason, status")
      .eq("exam_session_id", selectedSessionId)
      .eq("station_id", stationId)
      .eq("status", "pending")
      .maybeSingle();
    setPendingRegrade(data?.id ? { id: data.id, inserted_at: data.inserted_at, reason: data.reason ?? null } : null);

    showToast("📨 Đã gửi yêu cầu chấm lại. ⏳ Chờ admin chấp nhận.");
    setShowRegradePanel(false);
    setRegradeReason("");
  };

  // ====== Lưu điểm — dùng API service role
  const saveScore = async () => {
    if (!selectedSessionId) { alert("Vui lòng chọn Sinh viên ở panel trái."); return; }
    if (!graderId) { alert("Vui lòng chọn Giảng viên chấm."); return; }
    if (!rubric) { alert("Chưa có Rubric cho ngữ cảnh này."); return; }

    const selectedSession = sessions.find(s => s.id === selectedSessionId);
    const studentId = selectedSession?.student_id;
    if (!studentId) { alert("Không lấy được student_id."); return; }

    if (!window.confirm("Xác nhận lưu điểm chấm cho sinh viên này?")) return;

    const payloadBase = {
      exam_session_id: selectedSessionId, station_id: stationId,
      level_id: levelId, cohort_id: cohortId, exam_round_id: examRoundId,
      student_id: studentId, grader_id: graderId,
      item_scores: ratings, total_score: scaledTotal, comment,
      global_rating: (globalRating || suggestGlobal(scaledTotal)) as GlobalRating,
    };

    const r = await fetch('/api/grading/save-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBase),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) { alert('Lưu thất bại: ' + (j.error || r.statusText)); return; }

    // Đánh dấu đã chấm + chuyển tiếp SV kế
    setGradedSet(prev => {
      const next = new Set(prev);
      next.add(selectedSessionId);
      return next;
    });
    showToast("✅ Đã lưu điểm");

    const idx = orderedFilteredSessions.findIndex(s => s.id === selectedSessionId);
    const next = idx >= 0 && idx + 1 < orderedFilteredSessions.length ? orderedFilteredSessions[idx + 1].id : "";
    setSelectedSessionId(next);

    // Reset form
    setPendingRegrade(null);
    setShowRegradePanel(false);
    setRegradeReason("");
    setRatings({});
    setGlobalRating("");
    setComment("");
  };

  /** ✅ Exit: thoát ra ngoài hẳn (sign out + về login) */
  const exitImmediately = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore lỗi signOut
    } finally {
      router.push("/login");
    }
  };

  return (
    <div className="page">
      <header className="header">
        <div className="title"><strong>Chấm thi / Grading</strong></div>
        <div className="context">
          <span className="blueText"><strong>Trạm:</strong> {station?.name ?? "(…)"} </span>
          <span className="blueText"><strong>Tác vụ:</strong> {rubric?.task_name ?? "(…)"} </span>
          <span className="blueText"><strong>Đợt:</strong> {roundInfo?.display_name ?? "(…)"} </span>
          <span className="chainChip">
            <span className="chainDot" style={{ background: currentChain.color }} />
            Chuỗi: <strong>{currentChain.name}</strong>
          </span>
          {isLocked && (
            <span className="chainChip" title="Đã chấm — Khóa / Graded — Locked">
              🔒 Locked
            </span>
          )}
        </div>

        <div className="headerActions">
          {isAdmin && (
            <button className="btnAdmin" onClick={() => router.push(ADMIN_DASHBOARD_PATH)} title="Quay về Admin Dashboard">
              ⬅️ Admin Dashboard
            </button>
          )}
          {/* Exit: đăng xuất và về login */}
          <button
            className="btnExit"
            onClick={exitImmediately}
            title="Thoát ra ngoài (đăng xuất)"
          >
            ⎋ Exit
          </button>
        </div>
      </header>

      <main className="grid">
        {/* LEFT */}
        <aside className="leftPane card">
          <div className="graderRow">
            <label className="label blueText">Giảng viên chấm / Grader</label>
            <select className="select" value={graderId} onChange={(e) => setGraderId(e.target.value)}>
              <option value="">-- chọn --</option>
              {graders.map((g) => (
                <option key={g.id} value={g.id}>{g.last_name} {g.first_name}</option>
              ))}
            </select>
          </div>

          <div className="filters">
            <label className="label blueText">Tổ (Group)</label>
            <select className="select" value={groupFilter} onChange={(e)=>setGroupFilter(e.target.value)} title="Lọc theo Tổ (Group number)">
              <option value="">-- Tất cả --</option>
              {groupOptions.map(g => <option key={g} value={String(g)}>{g}</option>)}
            </select>

            <label className="label blueText">Tìm SV (Họ/Tên/Mã)</label>
            <input type="text" value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="VD: Nguyen / A123 / Võ An…" className="input" />
          </div>

          <div className="studentList">
            {orderedFilteredSessions.map((s) => {
              const label = s.students
                ? `${s.students.last_name} ${s.students.name} — ${s.students.student_code}${typeof s.students.group_number === "number" ? ` • Tổ ${s.students.group_number}` : ""}`
                : s.id;
              const selected = selectedSessionId === s.id;
              const graded = gradedSet.has(s.id);
              // Đã chấm & chưa unlock ⇒ mờ
              const faded = graded && !unlockedSet.has(s.id);
              // Đã chấm & đã unlock ⇒ đậm lại
              const isUnlocked = graded && unlockedSet.has(s.id);

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSessionId(s.id)}
                  className={[
                    "studentItem",
                    selected ? "selected" : "",
                    faded ? "graded" : "",
                    isUnlocked ? "unlocked" : "",
                  ].join(" ").trim()}
                  title={graded ? (faded ? "Đã chấm (đang khóa)" : "Được chấp nhận chấm lại — không khóa") : "Chọn sinh viên để chấm"}
                >
                  {graded && <span className="check">✓</span>}
                  {label}
                </button>
              );
            })}
            {orderedFilteredSessions.length === 0 && (
              <div className="hint">Không có sinh viên trong bộ lọc hiện tại.</div>
            )}
          </div>
        </aside>

        {/* RIGHT */}
        <section className="rightPane">
          {/* SCORE HEADER */}
          <div className="scoreHeader card">
            <div className="scoreLeft">
              <div className="scoreTitle">Điểm tổng (thang 10)</div>
              <div className="scoreValue">{scaledTotal.toFixed(2)}</div>
              {currentStudent ? (
                <div className="scoreStudentLine">
                  <span className="studentName">{currentStudent.fullName}</span>
                  <span className="dot">•</span>
                  <span className="meta">Mã số: <strong>{currentStudent.code}</strong></span>
                  {currentStudent.group !== null && (
                    <>
                      <span className="dot">•</span>
                      <span className="meta">Tổ: <strong>{currentStudent.group}</strong></span>
                    </>
                  )}
                </div>
              ) : (
                <div className="studentName muted">Chưa chọn sinh viên</div>
              )}
            </div>

            <div className="scoreRight">
              <button
                className="btnSaveYellow"
                onClick={saveScore}
                disabled={disableSave}
                title={!selectedSessionId ? "Chọn sinh viên ở panel trái trước" : !graderId ? "Chọn Giảng viên chấm trước" : isLocked ? "SV đã có điểm — cần admin chấp nhận regrade" : "Lưu điểm"}
              >
                <span className="saveText">Lưu điểm</span>
              </button>

              {/* Nút mở panel đề nghị / trạng thái chờ admin */}
              {isLocked && !showRegradePanel && (
                pendingRegrade?.id ? (
                  <button className="btnGhost" disabled title={`Đã gửi lúc ${new Date(pendingRegrade.inserted_at).toLocaleString()}`} style={{ marginLeft: 6, opacity: .85 }}>
                    ⏳ Chờ admin chấp nhận
                  </button>
                ) : (
                  <button onClick={() => setShowRegradePanel(true)} className="btnGhost" title="Bản điểm đang khóa — bấm để đề nghị chấm lại" style={{ marginLeft: 6 }}>
                    🔒 Đề nghị chấm lại
                  </button>
                )
              )}
            </div>
          </div>

          {/* Panel đề nghị chấm lại */}
          {showRegradePanel && (
            <div className="card tealBox" style={{ marginTop: 6 }}>
              <div className="cardTitle blueText">Yêu cầu chấm lại / Request regrade</div>
              {pendingRegrade?.id && (
                <div className="hint" style={{ marginBottom: 6 }}>
                  ⏳ Đã có yêu cầu đang chờ admin (gửi lúc {new Date(pendingRegrade.inserted_at).toLocaleString()}).
                </div>
              )}
              <label className="label blueText">Lý do / Reason (optional)</label>
              <textarea value={regradeReason} onChange={(e) => setRegradeReason(e.target.value)} rows={3} className="textarea" placeholder="VD: Lỗi nhập liệu, rubric cập nhật, giám khảo nhầm chuỗi..." />
              <div className="actionsRow">
                <button className="btnSaveYellow" onClick={requestRegrade} disabled={!!pendingRegrade?.id} title={pendingRegrade?.id ? "Đã có yêu cầu đang chờ admin" : "Gửi yêu cầu chấm lại"}>
                  {pendingRegrade?.id ? "⏳ Chờ admin chấp nhận" : "Gửi yêu cầu / Submit request"}
                </button>
                <button className="btnGhost" onClick={() => setShowRegradePanel(false)}>Hủy / Cancel</button>
              </div>
            </div>
          )}

          {/* Rubric */}
          {!rubric && (
            <div className="card alert warn">
              <div className="blueText"><strong>Không tìm thấy Rubric</strong></div>
              <div>Chưa tìm thấy Rubric cho Trạm/Đợt/Niên khóa/Đối tượng này. Vui lòng kiểm tra trang Upload Rubric.</div>
            </div>
          )}
          {rubric && (
            <div className="card">
              <div className="rubricGrid">
                {rubric.items.map((item: FixedRubricItem, idx: number) => (
                  <div key={item.id} className="rubricItem card">
                    <div className={`rubricItemTitle ${idx % 2 === 0 ? "even" : "odd"}`} title={`Mục chấm #${idx + 1}`}>
                      {item.text}
                    </div>
                    <div className="levelsColumn">
                      {LEVEL_KEYS.map((k) => {
                        const lv = item.levels[k];
                        const checked = (ratings[item.id] ?? 0) === lv.score;
                        return (
                          <label key={k} className={`levelOpt ${checked ? "checked" : ""}`}>
                            <input type="radio" name={`item_${item.id}`} value={lv.score} checked={checked} onChange={() => onSelectLevelScore(item.id, lv.score)} />
                            <span className="levelLabel blueText">{k} ({lv.score}) — <em>{lv.desc}</em></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="divider" />

              {/* Global rating */}
              <div className="globalRow">
                <label className="label labelNoBold">Nhận xét tổng quát (Global rating)</label>
                <div className="globalBox tealBox">
                  {(["Fail","Pass","Good","Excellent"] as GlobalRating[]).map((k) => (
                    <label key={k} className={`globalOpt ${globalRating === k ? "checked" : ""}`}>
                      <input type="radio" name="global_rating" value={k} checked={globalRating === k} onChange={() => setGlobalRating(k)} />
                      <span className="levelLabel tealText">{k} — <span className="desc">{DEFAULT_GLOBAL_DESC[k]}</span></span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="commentRow">
                <label className="label blueText"><strong>Nhận xét (tùy chọn) / Optional comment</strong></label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="textarea" placeholder="Nhận xét về an toàn, giao tiếp, quy trình..." />
              </div>

              <div className="actionsRow">
                <button className="btnSaveYellow" onClick={saveScore} disabled={disableSave}>
                  <span className="saveText">Lưu điểm</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 10, right: 10,
          background: "#0a1630", color: "#ffdf3b",
          padding: "8px 12px", borderRadius: 8,
          border: "2px solid #0b5ed7", boxShadow: "0 2px 6px rgba(0,0,0,.25)", zIndex: 50,
          fontWeight: 800, fontSize: 13
        }}>
          {toastMsg}
        </div>
      )}

      {/* styles - COMPACT */}
      <style jsx>{`
        :root {
          --bg: #f4f9ff;
          --card-bg: #ffffff;
          --border: #d9e6f2;
          --ink: #0a2a43;
          --blue: #0b5ed7;
          --blue-ghost: #e6f0ff;
          --green: #16a34a;
          --yellow: #ffdf3b;
          --yellow-dark: #e6b800;
          --teal-bg: #d5f5f2;
          --teal-border:#36cfc9;
          --teal-deep: #08979c;
          --teal-text: #0b6f6f;
        }
        .page { min-height: 100vh; background: var(--bg); color: var(--ink); }

        /* Header: nhỏ gọn */
        .header {
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:10px 14px; background: linear-gradient(90deg,#eaf3ff,#e0efff);
          border-bottom:1px solid var(--border); position: sticky; top:0; z-index: 40;
        }
        .title { font-size:16px; font-weight:700; color: var(--ink); }
        .context { display:flex; gap:8px; color: var(--ink); flex-wrap: wrap; align-items:center; font-weight:600; font-size:13px; }
        .blueText { color: var(--ink); }
        .headerActions { display:flex; gap:6px; align-items:center; }

        /* Nút: nhỏ gọn */
        .btnAdmin {
          background: #1f2937; color: #fff;
          border: 2px solid #111827; padding: 6px 10px; border-radius: 6px;
          cursor: pointer; font-weight: 800; font-size: 13px;
          box-shadow: 0 2px 6px rgba(0,0,0,.18);
        }
        .btnExit {
          background: #1f2937; color: #fff; border: 2px solid #111827;
          padding: 6px 10px; border-radius: 6px; cursor: pointer;
          font-weight: 800; font-size: 13px;
          box-shadow: 0 2px 6px rgba(0,0,0,.18); white-space: nowrap; margin-left: 4px;
        }

        .chainChip { display: inline-flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #d9e6f2; color: #0a2a43; border-radius: 999px; padding: 3px 8px; font-weight: 700; font-size: 12px; }
        .chainDot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid rgba(0,0,0,.08); display: inline-block; }

        /* Grid layout */
        .grid { display:grid; grid-template-columns: 340px 1fr; gap:12px; padding:12px; }

        /* Card: nhỏ padding */
        .card { background: var(--card-bg); border:1px solid var(--border); border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,.04); padding:10px; color: var(--ink); }
        .card.subtle { background:#f9fcff; }
        .cardTitle { font-weight:700; margin-bottom:8px; color: var(--blue); font-size: 14px; }

        .leftPane { display:flex; flex-direction:column; gap:10px; }
        .filters { display:grid; grid-template-columns: 1fr; gap: 6px; }
        .label { color: var(--ink); font-size:12.5px; font-weight:600; }
        .labelNoBold { font-weight: 500 !important; color: var(--ink); font-size: 12.5px; }

        /* Ô nhập: nhỏ gọn */
        .select, .input { padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:#fff; font-weight:600; color: var(--ink); font-size:13px; }
        .input::placeholder { color: #8196aa; font-weight:500; }
        .graderRow { display:grid; gap:6px; margin-bottom: 8px; }

        .studentList { display:flex; flex-direction:column; gap:6px; overflow:auto; max-height:44vh; padding-right:4px; }

        .studentItem {
          text-align:left; padding:6px 8px; background:#fff; border:1px solid var(--border); border-radius:6px;
          cursor:pointer; font-weight:600; color: var(--ink); display:flex; align-items:center; gap:6px;
          transition: background .15s ease, opacity .15s ease, color .15s ease, border-color .15s ease; font-size:13px;
        }
        .studentItem:hover { background: var(--blue-ghost); }
        .studentItem.selected { background:#d6f0ff; border-color:#a6d4ff; opacity: 1 !important; font-weight: 700; }
        .studentItem .check {
          display:inline-block; min-width:16px; height:16px; line-height:16px; text-align:center; border-radius:50%;
          background:#dcfce7; color:#14532d; border:1px solid #bbf7d0; font-weight:700; font-size: 12px;
        }

        /* ĐÃ CHẤM nhưng CHƯA unlock → mờ & màu nhạt */
        .studentItem.graded {
          opacity: .55;
          color: #6b7280;               /* xám text */
          background: #f8fafc;          /* xám nền */
          border-color: #e5e7eb;        /* xám border */
        }
        .studentItem.graded .check {
          background:#eef2f7; color:#64748b; border-color:#e5e7eb;
        }

        /* ĐÃ CHẤP NHẬN CHẤM LẠI → đậm lại, rõ */
        .studentItem.unlocked {
          opacity: 1 !important;
          color: var(--ink) !important;
          font-weight: 700;
          background: #ffffff;
          border-color: var(--border);
        }

        .rightPane { display:grid; gap:10px; }

        /* Score header: compact */
        .scoreHeader { display:flex; align-items:center; justify-content:space-between; gap:8px; border-left: 4px solid var(--green); }
        .scoreLeft { display:flex; align-items:center; gap:10px; flex-wrap: wrap; }
        .scoreTitle { font-size:13px; font-weight:700; color:#14532d; }
        .scoreValue { font-size:26px; font-weight:800; color:#0a2a43; background:#f0fdf4; border:2px solid #bbf7d0; border-radius:10px; padding:4px 10px; min-width:90px; text-align:center; }
        .scoreRight { display:flex; align-items:center; gap:6px; }
        .scoreStudentLine { display:flex; gap:6px; align-items: baseline; flex-wrap: wrap; }
        .studentName { font-weight: 800; color: #0a2a43; font-size: 14px; }
        .studentName.muted { font-weight: 700; color: #6b7280; font-size: 13px; }
        .meta { font-weight: 700; color: #0a2a43; font-size: 13px; }
        .dot { color: #64748b; font-weight: 800; }

        /* Nút vàng & ghost: compact */
        .btnSaveYellow {
          background: var(--yellow); color: var(--ink) !important; border: 2px solid var(--yellow-dark);
          padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 800;
          box-shadow: 0 2px 6px rgba(0,0,0,.15); white-space: nowrap; font-size: 13px;
        }
        .btnSaveYellow:disabled { opacity: .6; cursor: not-allowed; }
        .saveText { font-weight: 800; font-size: 13px; }
        .btnGhost {
          background: #fff7ed; color: #b45309; border: 1px solid #f59e0b;
          padding: 6px 10px; border-radius: 6px; cursor: pointer; font-weight: 800;
          box-shadow: 0 2px 6px rgba(0,0,0,.08); white-space: nowrap; font-size: 13px;
        }
        .btnGhost:hover { background: #ffedd5; }

        .rubricGrid { display:grid; gap:10px; }
        .rubricItem { border-radius:8px; color: var(--ink); }
        .rubricItemTitle { font-weight:800; margin-bottom:6px; border-radius:6px; padding:6px 8px; color: var(--blue); font-size: 13.5px; }
        .rubricItemTitle.even { background:#eef7ff; border:1px solid #b8e1ff; }
        .rubricItemTitle.odd { background:#f9fafb; border:1px solid #e5e7eb; }

        .levelsColumn { display: grid; grid-template-columns: 1fr; gap: 6px; }
        .levelOpt { display:flex; align-items:center; gap:6px; border:1px solid var(--border); border-radius:6px; padding:6px 8px; background:#fff; cursor:pointer; font-weight:600; color: var(--ink); font-size:13px; }
        .levelOpt.checked { background:#eef7ff; border-color:#b8e1ff; }
        .levelOpt input { accent-color: var(--blue); }
        .levelLabel em { color: #295e85; font-size: 12.5px; }

        .divider { border-top:1px dashed var(--border); margin:6px 0; }

        .globalRow { display:grid; gap:6px; }
        .globalBox { width: 100%; }
        .tealBox {
          background: var(--teal-bg); border: 2px solid var(--teal-border);
          border-radius: 10px; padding: 10px 10px; box-shadow: 0 2px 8px rgba(8, 151, 156, .12);
        }
        .tealText, .globalOpt .levelLabel, .globalOpt .desc { font-weight: 500 !important; }
        .globalOpt {
          display:flex; align-items:center; gap:6px; border:1px solid var(--teal-border);
          border-radius:6px; padding:6px 8px; background:#ffffff; color: var(--ink); font-weight: 500; font-size:13px;
        }
        .globalOpt.checked { background: #e9fbfa; border-color: var(--teal-deep); }
        .globalOpt input { accent-color: var (--teal-deep); }
        .globalOpt .desc { color: var(--teal-text); font-size: 12.5px; }

        .commentRow { display:grid; gap:6px; color: var(--ink); }
        .textarea { width:100%; border-radius:8px; border:1px solid var(--border); padding:6px 8px; font-weight:600; color: var(--ink); font-size:13px; }

        .actionsRow { display:flex; gap:6px; justify-content:flex-end; margin-top:6px; }
        .hint { color: var(--ink); font-weight:600; opacity: 0.95; font-size: 12.5px; }

        @media (max-width: 900px) {
          .grid { grid-template-columns: 1fr; }
          .scoreLeft { gap: 8px; }
        }
      `}</style>
    </div>
  );
}
