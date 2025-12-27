
// app/grading/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UUID = string;
type UserRole = "admin" | "grader" | "uploader" | "assigner" | "score_viewer";

interface Level { id: UUID; name: string; }
interface Cohort { id: UUID; level_id: UUID; year: number; }
interface ExamRoundView { id: UUID; display_name: string; cohort_id: UUID; round_number?: number | null; date?: string | null; }
interface Station { id: UUID; name: string; }
interface Chain { id: UUID; name: string; color?: string | null; }
interface Student {
  id: UUID;
  student_code: string;
  last_name: string;
  name: string;
  cohort_id: UUID;
}
interface ExamSession {
  id: UUID;
  exam_round_id: UUID;
  student_id: UUID;
  chain_id: UUID | null;
  chains?: { name: string; color?: string | null };
}

const ADMIN_DASHBOARD_PATH = "/dashboard/admin";

export default function GradingPage() {
  const router = useRouter();

  /** ===== Vai trò (giống Results) ===== */
  const [userRole, setUserRole] = useState<UserRole>("grader"); // mặc định ổn định
  const [roleLoading, setRoleLoading] = useState<boolean>(true);
  useEffect(() => {
    (async () => {
      const { data: roleData, error } = await supabase.rpc("get_my_role");
      if (!error && typeof roleData === "string") {
        setUserRole(roleData as UserRole);
      }
      setRoleLoading(false);
    })();
  }, []);
  const isAdmin = userRole === "admin";

  /** ===== Catalogs ===== */
  const [levels, setLevels] = useState<Level[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [rounds, setRounds] = useState<ExamRoundView[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [basicsLoading, setBasicsLoading] = useState<boolean>(true);

  /** ===== Selections ===== */
  const [levelId, setLevelId] = useState<string>("");
  const [cohortId, setCohortId] = useState<string>("");
  const [roundId, setRoundId] = useState<string>("");
  const [stationId, setStationId] = useState<string>(""); // sẽ được điền sẵn cho grader
  const [chainId, setChainId] = useState<string>("");     // sẽ được điền sẵn cho grader

  /** Scope: đã điền sẵn từ phân công chưa? (chỉ để ghi chú UI) */
  const [prefilledFromScope, setPrefilledFromScope] = useState<boolean>(false);

  /** ===== Data ===== */
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  /** ===== Tải danh mục cơ bản ===== */
  useEffect(() => {
    (async () => {
      setBasicsLoading(true);
      const [{ data: lvl }, { data: sts }, { data: chs }] = await Promise.all([
        supabase.from("levels").select("id,name").order("name", { ascending: true }),
        supabase.from("stations").select("id,name").order("name", { ascending: true }),
        supabase.from("chains").select("id,name,color").order("name", { ascending: true }),
      ]);
      setLevels(lvl ?? []);
      setStations(sts ?? []);
      setChains(chs ?? []);
      setBasicsLoading(false);
    })();
  }, []);

  /** ===== Prefill Chuỗi & Trạm theo scope của tài khoản (grader) ===== */
  useEffect(() => {
    const prefillScope = async () => {
      if (isAdmin || roleLoading || basicsLoading) return;
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;

        const resp = await fetch("/api/admin/get-station-scope", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: uid }),
        });
        const json = await resp.json();

        const scopeStationId: string | undefined = json?.scope?.station_id;
        const scopeChainId: string | undefined = json?.scope?.chain_id;

        const stationExists = !!scopeStationId && stations.some(s => s.id === scopeStationId);
        const chainExists   = !!scopeChainId   && chains.some(c => c.id === scopeChainId);

        if (stationExists) setStationId(scopeStationId as string);
        if (chainExists)   setChainId(scopeChainId as string);

        if (stationExists || chainExists) setPrefilledFromScope(true);
      } catch (e) {
        setPrefilledFromScope(false);
      }
    };

    prefillScope();
  }, [isAdmin, roleLoading, basicsLoading, stations, chains]);

  /** ===== Level -> Cohorts ===== */
  useEffect(() => {
    setCohorts([]); setRounds([]);
    setCohortId(""); setRoundId("");
    setStudents([]); setSessions([]);
    setStatus("");
    if (!levelId) return;
    (async () => {
      const { data, error } = await supabase
        .from("cohorts")
        .select("id, year, level_id")
        .eq("level_id", levelId)
        .order("year", { ascending: true });
      if (error) console.error("Lỗi lấy Cohort:", error.message);
      setCohorts(data ?? []);
    })();
  }, [levelId]);

  /** ===== Cohort -> Rounds ===== */
  useEffect(() => {
    setRounds([]); setRoundId("");
    setStudents([]); setSessions([]);
    setStatus("");
    if (!cohortId) return;
    (async () => {
      const { data, error } = await supabase
        .from("exam_rounds_view")
        .select("id, display_name, cohort_id, round_number, date")
        .eq("cohort_id", cohortId)
        .order("round_number", { ascending: true });
      if (error) console.error("Lỗi lấy Round:", error.message);
      setRounds(data ?? []);
    })();
  }, [cohortId]);

  /** ===== Round -> load students + sessions ===== */
  useEffect(() => {
    setStudents([]); setSessions([]); setStatus("");
    if (!roundId || !cohortId) return;
    (async () => {
      setLoading(true);
      const [{ data: studs, error: errStuds }, { data: sess, error: errSess }] = await Promise.all([
        supabase.from("students")
          .select("id, student_code, last_name, name, cohort_id")
          .eq("cohort_id", cohortId)
          .order("student_code", { ascending: true }),
        supabase.from("exam_sessions")
          .select("id, exam_round_id, student_id, chain_id, chains(name,color)")
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
      setLoading(false);
    })();
  }, [roundId, cohortId]);

  /** ===== Join + Filter theo CHUỖI ===== */
  const filteredRows = useMemo(() => {
    if (!roundId || !chainId) return [];
    const mapStudent = new Map(students.map(s => [s.id, s]));
    return (sessions ?? [])
      .filter(s => s.chain_id === chainId)
      .map(s => {
        const st = mapStudent.get(s.student_id);
        if (!st) return null;
        return { session: s, student: st };
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        (a.student?.student_code ?? "").localeCompare(b.student?.student_code ?? "")
      ) as { session: ExamSession; student: Student }[];
  }, [sessions, students, roundId, chainId]);

  /** ===== Start grading ===== */
  const canStart =
    !!levelId && !!cohortId && !!roundId && !!stationId && !!chainId && (filteredRows.length >= 0);

  const startGrading = () => {
    if (!canStart) {
      alert("Bạn vui lòng chọn đủ: Level, Cohort, Round, Station và Chain trước khi bắt đầu.");
      return;
    }
    const q = new URLSearchParams({
      level_id: levelId,
      cohort_id: cohortId,
      exam_round_id: roundId,
      station_id: stationId,
      chain_id: chainId, // một chuỗi duy nhất
    }).toString();
    router.push(`/grading/run?${q}`);
  };

  /** ===== Test Rubric (NEW) ===== */
  const [testing, setTesting] = useState<boolean>(false);

  const testRubric = async () => {
    if (!levelId || !cohortId || !roundId || !stationId) {
      alert("Bạn cần chọn đủ: Đối tượng (Level), Niên khóa (Cohort), Đợt thi (Round) và Trạm (Station) trước khi kiểm tra rubric nhé.");
      return;
    }
    try {
      setTesting(true);

      const { data: rv, error: errView } = await supabase
        .from("rubrics_view")
        .select("id, task_name, display_name")
        .eq("station_id", stationId)
        .eq("cohort_id", cohortId)
        .eq("level_id", levelId)
        .eq("exam_round_id", roundId)
        .maybeSingle();

      if (!errView && rv?.id) {
        alert(`✅ Tìm thấy rubric: ${rv.task_name ?? rv.display_name ?? "(không rõ tên)"}`);
        return;
      }

      const { data: r, error: errRubric } = await supabase
        .from("rubrics")
        .select("id, task_name, name")
        .eq("station_id", stationId)
        .eq("cohort_id", cohortId)
        .eq("level_id", levelId)
        .eq("exam_round_id", roundId)
        .maybeSingle();

      if (!errRubric && r?.id) {
        alert(`✅ Tìm thấy rubric: ${r.task_name ?? r.name ?? "(không rõ tên)"}`);
        return;
      }

      alert("❌ Chưa thấy rubric cho ngữ cảnh này. Bạn kiểm tra 4 khóa (Level/Cohort/Round/Station) hoặc tạo rubric khớp giúp nhé.");
    } catch (e: any) {
      alert("❌ Lỗi khi kiểm tra rubric. Bạn thử lại hoặc liên hệ admin.");
    } finally {
      setTesting(false);
    }
  };

  /** ===== Tên hiển thị ===== */
  const levelName   = useMemo(() => levels.find(l => l.id === levelId)?.name ?? "",    [levels, levelId]);
  const cohortYear  = useMemo(() => cohorts.find(c => c.id === cohortId)?.year ?? "", [cohorts, cohortId]);
  const roundName   = useMemo(() => rounds.find(r => r.id === roundId)?.display_name ?? "", [rounds, roundId]);
  const stationName = useMemo(() => stations.find(s => s.id === stationId)?.name ?? "", [stations, stationId]);
  const chainName   = useMemo(() => chains.find(c => c.id === chainId)?.name ?? "", [chains, chainId]);

  /** ===== UI ===== */
  return (
    <div className="p-6 max-w-7xl mx-auto bg-sky-50 min-h-screen font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold text-sky-900 border-b pb-2">
          VẬN HÀNH THI OSCE — THIẾT LẬP CHẤM (Grading Setup) 🧪
        </h1>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => router.push(ADMIN_DASHBOARD_PATH)}
              className="bg-sky-700 text-white px-4 py-2 rounded-md font-bold hover:bg-sky-800"
              title="Quay về Dashboard Admin"
            >
              ⬅️ Admin Dashboard
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
              className="bg-rose-600 text-white px-4 py-2 rounded-md font-bold hover:bg-rose-700"
              title="Đăng xuất"
            >
              🚪 Đăng xuất
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      {status && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            status.startsWith("❌")
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : "bg-sky-50 text-sky-700 border border-sky-200"
          }`}
        >
          {status}
        </div>
      )}

      {/* Layout: trái = bộ lọc + prefill; phải = danh sách SV */}
      <div className="grid grid-cols-6 gap-4">
        {/* LEFT COLUMN */}
        <div className="col-span-2 bg-white p-4 rounded-lg shadow border border-sky-200">
          {/* Hộp thông tin phân công (hiển thị ngay đầu cột trái) */}
          {!isAdmin && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-blue-50 px-3 py-2">
              <div className="text-sm text-sky-800 font-bold">Phân công chấm</div>
              <div className="text-xs text-sky-900">
                Trạm: <strong>{stationName || "(chưa xác định)"}</strong> • Chuỗi: <strong>{chainName || "(chưa xác định)"}</strong>
                {prefilledFromScope && <span className="ml-2 text-[11px] italic text-sky-700">đã điền sẵn từ phân công</span>}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-1 gap-3">
            {/* Level */}
            <div>
              <label className="block text-xs font-medium text-sky-900 uppercase mb-1">Đối tượng (Level)</label>
              <select
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
              >
                <option value="">-- Chọn Level --</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Cohort */}
            <div>
              <label className="block text-xs font-medium text-sky-900 uppercase mb-1">Niên khóa (Cohort)</label>
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={!levelId}
                className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
              >
                <option value="">-- Chọn Cohort --</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.year}</option>
                ))}
              </select>
            </div>

            {/* Round */}
            <div>
              <label className="block text-xs font-medium text-sky-900 uppercase mb-1">Đợt thi (Round)</label>
              <select
                value={roundId}
                onChange={(e) => setRoundId(e.target.value)}
                disabled={!cohortId}
                className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
              >
                <option value="">-- Chọn Đợt --</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>{r.display_name}</option>
                ))}
              </select>
            </div>

            {/* Station (điền sẵn & khóa với grader; admin không khóa) */}
            <div>
              <label className="block text-xs font-medium text-sky-900 uppercase mb-1">Trạm (Station)</label>
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                disabled={!isAdmin}
                className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
              >
                <option value="">-- Chọn Trạm --</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Chain (điền sẵn & khóa với grader; admin không khóa) */}
            <div>
              <label className="block text-xs font-medium text-sky-900 uppercase mb-1">Chuỗi (Chain)</label>
              <select
                value={chainId}
                onChange={(e) => setChainId(e.target.value)}
                disabled={!isAdmin}
                className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
              >
                <option value="">-- Chọn Chuỗi --</option>
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Actions (NEW: Test Rubric + Start) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={testRubric}
                disabled={testing || !levelId || !cohortId || !roundId || !stationId}
                className="bg-amber-500 text-white px-4 py-2 rounded-md font-bold hover:bg-amber-600 disabled:bg-gray-400"
                title="Kiểm tra liệu đã có rubric cho Trạm/Đợt/Cohort/Level hay chưa"
              >
                Test Rubric
              </button>

              <button
                type="button"
                onClick={startGrading}
                disabled={!canStart}
                className="bg-sky-700 text-white px-4 py-2 rounded-md font-bold hover:bg-sky-800 disabled:bg-gray-400"
                title="Bắt đầu chấm"
              >
                💾 Bắt đầu chấm
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Danh sách SV theo Chuỗi đã chọn */}
        <div className="col-span-4 bg-white p-4 rounded-lg shadow border border-sky-200">
          <div className="text-xl font-semibold text-sky-900 mb-2">
            Danh sách sinh viên theo Chuỗi — Trạm: {stationName || "…"}
          </div>

          {/* Chỉ hiển thị khi đã đủ Round + Chain */}
          {roundId && chainId && loading && (
            <p className="text-sky-600 font-semibold">Đang tải danh sách…</p>
          )}
          {roundId && chainId && !loading && filteredRows.length === 0 && (
            <p className="text-rose-600 italic">Chuỗi này chưa có sinh viên trong đợt đã chọn.</p>
          )}
          {roundId && chainId && !loading && filteredRows.length > 0 && (
            <table className="min-w-full bg-white border border-sky-200 rounded-lg overflow-hidden">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="py-2 px-3 text-left w-1/12">STT</th>
                  <th className="py-2 px-3 text-left w-2/12">Mã SV</th>
                  <th className="py-2 px-3 text-left w-3/12">Họ tên</th>
                  <th className="py-2 px-3 text-left w-2/12">Chuỗi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
                  <tr key={r.session.id} className="border-b hover:bg-sky-50">
                    <td className="py-2 px-3">{idx + 1}</td>
                    <td className="py-2 px-3 font-mono text-sm">{r.student.student_code}</td>
                    <td className="py-2 px-3 font-medium">
                      {r.student.last_name} {r.student.name}
                    </td>
                    <td className="py-2 px-3">
                      {chains.find(c => c.id === r.session.chain_id)?.name ?? "(N/A)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Hints nhẹ nhàng (không nhấp nháy) */}
          {!roundId && (
            <p className="text-sky-700 italic">Vui lòng chọn Đợt thi (Round) ở cột trái.</p>
          )}
          {roundId && !chainId && (
            <p className="text-sky-700 italic">
              Vui lòng chọn Chuỗi (Chain) ở cột trái{!isAdmin && prefilledFromScope ? " — đã được điền sẵn theo phân công." : "."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
