
// app/assign-chain/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

// ===== Kiểu dữ liệu khớp schema Supabase =====
type UUID = string;
type UserRole = "admin" | "grader" | "uploader" | "assigner" | "score_viewer";

interface Level { id: UUID; name: string }
interface Cohort { id: UUID; level_id: UUID; year: number }
interface Chain { id: UUID; name: string; color?: string | null }
interface ExamRoundView { id: UUID; display_name: string; cohort_id: UUID; round_number?: number | null; date?: string | null }
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
  exam_round_id: UUID;
  student_id: UUID;
  chain_id?: UUID | null;
}

// ===== Trang Assign Chain =====
export default function AssignChain() {
  const router = useRouter();

  // --- ROLE (chỉ dùng để điều chỉnh nút UI; không chặn giao diện) ---
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: roleRes, error } = await supabase.rpc("get_my_role");
        if (!error && typeof roleRes === "string") {
          setUserRole(roleRes as UserRole);
        } else {
          setUserRole(null);
        }
      } catch {
        setUserRole(null);
      } finally {
        setRoleLoading(false);
      }
    })();
  }, []);

  // --- 1. DANH MỤC & LỰA CHỌN ---
  const [levels, setLevels] = useState<Level[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [examRounds, setExamRounds] = useState<ExamRoundView[]>([]);

  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [selectedCohort, setSelectedCohort] = useState<string>("");
  const [batchNumbers, setBatchNumbers] = useState<number[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [examRoundId, setExamRoundId] = useState<string>("");

  // Tổ (Group number)
  const [groupOptions, setGroupOptions] = useState<number[]>([]);
  const [selectedGroupNumber, setSelectedGroupNumber] = useState<string>(""); // "" = ALL

  // --- 2. TRẠNG THÁI XẾP CHUỖI ---
  const [assignedRows, setAssignedRows] = useState<any[]>([]);      // đã xếp
  const [unassignedRows, setUnassignedRows] = useState<any[]>([]);  // chưa xếp
  const [assignments, setAssignments] = useState<{ [studentId: string]: string }>({});
  const [viewMode, setViewMode] = useState<"unassigned" | "assigned">("unassigned");

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // --- 0. RESET UI ---
  const resetAllUI = useCallback(() => {
    setSelectedLevel("");
    setSelectedCohort("");
    setSelectedBatch("");
    setExamRoundId("");
    setSelectedGroupNumber("");
    setBatchNumbers([]);
    setGroupOptions([]);
    setExamRounds([]);
    setAssignedRows([]);
    setUnassignedRows([]);
    setAssignments({});
    setStatus("");
    setLoading(false);
  }, []);

  // --- 0b. THOÁT / VỀ DASHBOARD ---
  const goBackOrExit = useCallback(async () => {
    try {
      // Nếu là admin: về Dashboard Admin; còn lại: Thoát (sign out)
      if (userRole === "admin") {
        router.push("/dashboard/admin");
        return;
      }
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setStatus("❌ Lỗi khi quay lại/thoát");
    }
  }, [router, userRole]);

  // --- 3. FETCH CATALOGS ---
  async function fetchLevels() {
    const { data, error } = await supabase.from("levels").select("id,name").order("name");
    if (error) console.error("Lỗi lấy Level:", error.message);
    setLevels((data ?? []) as Level[]);
  }

  async function fetchChains() {
    const { data, error } = await supabase.from("chains").select("id,name,color").order("name");
    if (error) console.error("Lỗi lấy Chuỗi:", error.message);
    setChains((data ?? []) as Chain[]);
  }

  useEffect(() => {
    fetchLevels();
    fetchChains();
    // Rounds sẽ tải theo Cohort (giống Results)
  }, []);

  // Level -> Cohorts
  useEffect(() => {
    setCohorts([]);
    setSelectedCohort("");
    setExamRoundId("");
    setBatchNumbers([]);
    setSelectedBatch("");
    setGroupOptions([]);
    setSelectedGroupNumber("");
    setExamRounds([]);
    if (!selectedLevel) return;

    (async () => {
      const { data, error } = await supabase
        .from("cohorts")
        .select("id, year, level_id")
        .eq("level_id", selectedLevel)
        .order("year", { ascending: true });
      if (error) console.error("Lỗi lấy Cohort:", error.message);
      setCohorts((data ?? []) as Cohort[]);
    })();
  }, [selectedLevel]);

  // Cohort -> distinct Batch numbers
  const fetchBatchNumbers = useCallback(async (cohortId: string) => {
    setBatchNumbers([]);
    setSelectedBatch("");
    setGroupOptions([]);
    setSelectedGroupNumber("");
    setExamRounds([]);
    setExamRoundId("");
    if (!cohortId) return;

    const { data, error } = await supabase
      .from("students")
      .select("batch_number")
      .eq("cohort_id", cohortId);

    if (error) {
      console.error("Lỗi lấy Batch numbers:", error.message);
      return;
    }

    const uniqueBatches = Array.from(
      new Set((data ?? []).map((i: any) => i.batch_number).filter((b: any) => Number.isFinite(b)))
    ) as number[];
    setBatchNumbers(uniqueBatches.sort((a, b) => a - b));
  }, []);

  useEffect(() => {
    fetchBatchNumbers(selectedCohort);
  }, [selectedCohort, fetchBatchNumbers]);

  // Cohort -> Exam Rounds (giống Results)
  useEffect(() => {
    setExamRounds([]);
    setExamRoundId("");
    if (!selectedCohort) return;

    (async () => {
      const { data, error } = await supabase
        .from("exam_rounds_view")
        .select("id, display_name, cohort_id, round_number, date")
        .eq("cohort_id", selectedCohort)
        .order("round_number", { ascending: true });
      if (error) console.error("Lỗi lấy Đợt thi:", error.message);
      setExamRounds((data ?? []) as ExamRoundView[]);
    })();
  }, [selectedCohort]);

  // Cohort+Batch -> distinct Group numbers
  const fetchGroupOptions = useCallback(async (cohortId: string, batchNumber: string) => {
    setGroupOptions([]);
    setSelectedGroupNumber("");
    if (!cohortId || !batchNumber) return;

    const bn = Number(batchNumber);
    if (!Number.isFinite(bn)) return;

    const { data, error } = await supabase
      .from("students")
      .select("group_number")
      .eq("cohort_id", cohortId)
      .eq("batch_number", bn);

    if (error) {
      console.error("Lỗi lấy Group numbers:", error.message);
      return;
    }

    const groups = Array.from(
      new Set((data ?? []).map((i: any) => i.group_number).filter((g: any) => Number.isFinite(g)))
    ) as number[];
    setGroupOptions(groups.sort((a, b) => a - b));
  }, []);

  useEffect(() => {
    fetchGroupOptions(selectedCohort, selectedBatch);
  }, [selectedCohort, selectedBatch, fetchGroupOptions]);

  // Map chain_id -> chain_name (memo)
  const chainNameById = useMemo(() => {
    const m: Record<string, string> = {};
    (chains ?? []).forEach((c) => (m[c.id] = c.name));
    return m;
  }, [chains]);

  // --- 4. FETCH ĐÃ/CHƯA XẾP ---
  const fetchAssignedUnassigned = useCallback(
    async (cohortId: string, batchNumber: string, roundId: string, groupNumberStr?: string) => {
      setAssignedRows([]);
      setUnassignedRows([]);
      setAssignments({});
      setStatus("");

      if (!cohortId || !batchNumber || !roundId) return;

      setLoading(true);

      const bn = Number(batchNumber);
      if (!Number.isFinite(bn)) {
        setStatus("⚠️ Batch Number không hợp lệ.");
        setLoading(false);
        return;
      }

      const gn = groupNumberStr ? Number(groupNumberStr) : null;
      if (groupNumberStr && !Number.isFinite(gn)) {
        setStatus("⚠️ Tổ (Group number) không hợp lệ.");
        setLoading(false);
        return;
      }

      try {
        // 1) Lấy SV theo Cohort + Batch (+ Group nếu chọn)
        let studentsQuery = supabase
          .from("students")
          .select("id, student_code, last_name, name, cohort_id, batch_number, group_number")
          .eq("cohort_id", cohortId)
          .eq("batch_number", bn)
          .order("student_code", { ascending: true });

        if (gn !== null) studentsQuery = studentsQuery.eq("group_number", gn);

        const { data: allStudents, error: stuErr } = await studentsQuery;
        if (stuErr) throw stuErr;

        const studentIds = (allStudents ?? []).map((s: any) => s.id);
        if (studentIds.length === 0) {
          setAssignedRows([]);
          setUnassignedRows([]);
          setLoading(false);
          return;
        }

        // 2) Lấy exam_sessions (student_id, chain_id) theo round & theo DS SV
        const { data: sessions, error: sesErr } = await supabase
          .from("exam_sessions")
          .select("student_id, chain_id")
          .eq("exam_round_id", roundId)
          .in("student_id", studentIds);
        if (sesErr) throw sesErr;

        const sessionByStudent = new Map<string, any>();
        (sessions ?? []).forEach((s: any) => sessionByStudent.set(s.student_id, s));

        // 3) Tách danh sách
        const assigned: any[] = [];
        const unassigned: any[] = [];

        (allStudents ?? []).forEach((st: any) => {
          const ses = sessionByStudent.get(st.id);
          if (ses?.chain_id) {
            assigned.push({
              ...st,
              chain_id: ses.chain_id,
              chain_name: chainNameById[ses.chain_id] ?? "",
            });
          } else {
            unassigned.push(st);
          }
        });

        setAssignedRows(assigned);
        setUnassignedRows(unassigned);
        setAssignments({});
        setLoading(false);
      } catch (err: any) {
        console.error("AssignChain fetch error:", err);
        setStatus("❌ Lỗi tải danh sách sinh viên: " + (err?.message || "Không rõ nguyên nhân"));
        setLoading(false);
      }
    },
    [chainNameById]
  );

  // Tải lại khi thay đổi bộ lọc
  useEffect(() => {
    fetchAssignedUnassigned(
      selectedCohort,
      selectedBatch,
      examRoundId,
      selectedGroupNumber || undefined
    );
  }, [selectedCohort, selectedBatch, examRoundId, selectedGroupNumber, fetchAssignedUnassigned]);

  // --- 5. LƯU ĐỔI CHUỖI ---
  function handleSelect(studentId: string, chainId: string) {
    setAssignments((prev) => ({ ...prev, [studentId]: chainId }));
  }

  async function saveAssignments() {
    if (!examRoundId || !selectedCohort || !selectedBatch) {
      setStatus("⚠️ Vui lòng chọn Đối tượng/Niên khóa/Batch/Đợt thi trước khi lưu.");
      return;
    }

    const inserts = Object.entries(assignments)
      .filter(([_, chainId]) => !!chainId)
      .map(([studentId, chainId]) => ({
        exam_round_id: examRoundId,
        student_id: studentId,
        chain_id: chainId,
      }));

    if (inserts.length === 0) {
      setStatus("⚠️ Chưa có thay đổi nào để lưu.");
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from("exam_sessions")
      .upsert(inserts, { onConflict: "exam_round_id, student_id" });

    if (error) {
      console.error(error);
      setStatus("❌ Lỗi khi lưu: " + error.message);
      setLoading(false);
      return;
    }

    setStatus(`🎉 Lưu thành công ${inserts.length} thay đổi!`);
    await fetchAssignedUnassigned(
      selectedCohort,
      selectedBatch,
      examRoundId,
      selectedGroupNumber || undefined
    );
    setAssignments({});
    setLoading(false);

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  }

  // --- 6. XUẤT EXCEL (2 sheet: Chưa xếp & Đã xếp) ---
  function exportExcel() {
    const totalRows = (assignedRows?.length ?? 0) + (unassignedRows?.length ?? 0);
    if (totalRows === 0) {
      setStatus("⚠️ Không có dữ liệu để xuất Excel (theo bộ lọc hiện tại).");
      return;
    }

    const levelName = levels.find((l) => l.id === selectedLevel)?.name ?? "";
    const cohortYear = cohorts.find((c) => c.id === selectedCohort)?.year ?? "";
    const roundName = examRounds.find((r) => r.id === examRoundId)?.display_name ?? "";

    const safeSheetName = (name: string) =>
      (name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

    const sheetUnassigned = (unassignedRows ?? []).map((st: any, idx: number) => ({
      STT: idx + 1,
      "Mã SV (Code)": st.student_code,
      "Họ và tên (Full Name)": `${st.last_name ?? ""} ${st.name ?? ""}`.trim(),
      "Chuỗi (Chain)": "",
      "Tổ (Group number)": st.group_number ?? "",
      "Đối tượng (Level)": levelName,
      "Niên khóa (Cohort)": cohortYear,
      "Batch": selectedBatch || "",
      "Đợt thi (Exam Round)": roundName,
      ...(selectedGroupNumber ? { "Tổ lọc (Group filter)": selectedGroupNumber } : {}),
    }));

    const sheetAssigned = (assignedRows ?? []).map((st: any, idx: number) => ({
      STT: idx + 1,
      "Mã SV (Code)": st.student_code,
      "Họ và tên (Full Name)": `${st.last_name ?? ""} ${st.name ?? ""}`.trim(),
      "Chuỗi (Chain)": st.chain_name ?? "",
      "Tổ (Group number)": st.group_number ?? "",
      "Đối tượng (Level)": levelName,
      "Niên khóa (Cohort)": cohortYear,
      "Batch": selectedBatch || "",
      "Đợt thi (Exam Round)": roundName,
      ...(selectedGroupNumber ? { "Tổ lọc (Group filter)": selectedGroupNumber } : {}),
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheetUnassigned);
    const ws2 = XLSX.utils.json_to_sheet(sheetAssigned);

    XLSX.utils.book_append_sheet(wb, ws1, safeSheetName("Chua_xep (Unassigned)"));
    XLSX.utils.book_append_sheet(wb, ws2, safeSheetName("Da_xep (Assigned)"));

    const fileNameBase = `AssignChain_${levelName || "Level"}_C${cohortYear || "Cohort"}_B${
      selectedBatch || "Batch"
    }_R${roundName || "Round"}${
      selectedGroupNumber ? `_G${selectedGroupNumber}` : ""
    }`.replace(/\s+/g, "_");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileNameBase}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- 7. UI (không còn chặn theo quyền ở client) ---
  return (
    <div className="p-6 max-w-6xl mx-auto font-sans bg-sky-50 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-3xl font-bold text-sky-900 border-b pb-2">
          XẾP SINH VIÊN VÀO CHUỖI THI (Assign Chain) 🔗
        </h1>

        <div className="flex items-center gap-2">
          {/* Nút: Admin -> Dashboard Admin; Assigner/khác -> Thoát */}
          {userRole === "admin" ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard/admin")}
              className="bg-sky-100 text-sky-800 px-3 py-2 rounded-md hover:bg-sky-200 font-semibold"
              title="Quay lại Dashboard Admin"
            >
              ← Dashboard Admin
            </button>
          ) : (
            <button
              type="button"
              onClick={goBackOrExit}
              className="bg-rose-100 text-rose-800 px-3 py-2 rounded-md hover:bg-rose-200 font-semibold"
              title="Thoát"
            >
              🚪 Thoát
            </button>
          )}

          {/* Reset */}
          <button
            type="button"
            onClick={resetAllUI}
            className="bg-sky-100 text-sky-800 px-3 py-2 rounded-md hover:bg-sky-200 font-semibold"
            title="Làm mới giao diện về mặc định"
          >
            Làm mới (Reset)
          </button>
        </div>
      </div>

      {/* Thông báo trạng thái */}
      {status && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            status.startsWith("🎉")
              ? "bg-green-50 text-green-700 border border-green-200"
              : status.startsWith("⚠️")
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : status.startsWith("❌")
              ? "bg-rose-50 text-rose-700 border border-rose-200"
              : "bg-sky-50 text-sky-700 border border-sky-200"
          }`}
        >
          {status}
        </div>
      )}

      {/* Bộ lọc */}
      <div className="grid grid-cols-5 gap-4 bg-white p-4 rounded-lg shadow mb-4 border border-sky-200">
        {/* 1. Level */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            1. Đối tượng (Level)
          </label>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
          >
            <option value="">-- Chọn Level --</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Cohort */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            2. Niên khóa (Cohort)
          </label>
          <select
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(e.target.value)}
            disabled={cohorts.length === 0}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
          >
            <option value="">-- Chọn Cohort --</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.year}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Batch */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            3. Batch Number
          </label>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            disabled={batchNumbers.length === 0 || !selectedCohort}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400 disabled:bg-sky-100"
          >
            <option value="">-- Chọn Batch --</option>
            {batchNumbers.map((b) => (
              <option key={b} value={String(b)}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Exam Round */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            4. Đợt thi (Exam Round)
          </label>
          <select
            value={examRoundId}
            onChange={(e) => setExamRoundId(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
            disabled={!selectedCohort || examRounds.length === 0}
          >
            <option value="">-- Chọn Đợt thi --</option>
            {examRounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* 5. Tổ (Group number) */}
        <div>
          <label className="block text-xs font-medium text-sky-900 uppercase mb-1">
            5. Tổ (Group number)
          </label>
          <select
            value={selectedGroupNumber}
            onChange={(e) => setSelectedGroupNumber(e.target.value)}
            className="w-full p-2 border border-sky-300 rounded-md focus:ring-2 focus:ring-sky-400"
            disabled={!selectedCohort || !selectedBatch || groupOptions.length === 0}
          >
            <option value="">-- Tất cả (All) --</option>
            {groupOptions.map((g) => (
              <option key={g} value={String(g)}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Toggle chế độ xem + nút Lưu + nút Xuất Excel */}
      <div className="flex items-center gap-3 mb-4">
        <div className="inline-flex rounded-md border border-sky-300 overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("unassigned")}
            className={`px-3 py-2 font-semibold ${
              viewMode === "unassigned" ? "bg-sky-600 text-white" : "bg-white text-sky-700"
            }`}
            title="Chưa xếp (Unassigned)"
          >
            Chưa xếp (Unassigned)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("assigned")}
            className={`px-3 py-2 font-semibold border-l border-sky-300 ${
              viewMode === "assigned" ? "bg-sky-600 text-white" : "bg-white text-sky-700"
            }`}
            title="Đã xếp (Assigned)"
          >
            Đã xếp (Assigned)
          </button>
        </div>

        <button
          onClick={saveAssignments}
          disabled={
            loading ||
            (!selectedLevel || !selectedCohort || !selectedBatch || !examRoundId)
          }
          className="ml-auto bg-sky-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-sky-700 transition duration-200 disabled:bg-gray-400"
        >
          LƯU THAY ĐỔI (Save)
        </button>

        {/* Nút Xuất Excel */}
        <button
          type="button"
          onClick={exportExcel}
          disabled={(assignedRows.length + unassignedRows.length) === 0}
          className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 transition duration-200 disabled:bg-gray-400"
          title="Xuất Excel (cả hai bảng: Chưa xếp & Đã xếp) theo bộ lọc hiện tại"
        >
          ⬇️ Xuất Excel
        </button>
      </div>

      {/* Bảng CHƯA xếp */}
      {viewMode === "unassigned" && (
        <>
          <h2 className="text-xl font-semibold mb-3 text-sky-900">
            Sinh viên CHƯA xếp chuỗi (Unassigned) — {unassignedRows.length} SV
          </h2>

          {loading && <p className="text-sky-600 font-semibold">Đang tải...</p>}
          {!loading && examRoundId && selectedBatch && unassignedRows.length === 0 && (
            <p className="text-emerald-600 italic">
              Tất cả SV trong bộ lọc đã được xếp chuỗi cho đợt thi này.
            </p>
          )}

          {!loading && unassignedRows.length > 0 && (
            <table className="min-w-full bg-white border border-sky-200 rounded-lg shadow-md overflow-hidden">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="py-3 px-4 text-left w-1/12">STT</th>
                  <th className="py-3 px-4 text-left w-2/12">Mã SV (Code)</th>
                  <th className="py-3 px-4 text-left w-1/12">Tổ</th>
                  <th className="py-3 px-4 text-left w-3/12">Họ tên (Name)</th>
                  <th className="py-3 px-4 text-left w-5/12">Chọn Chuỗi (Select Chain)</th>
                </tr>
              </thead>
              <tbody>
                {unassignedRows.map((st: any, idx: number) => (
                  <tr key={st.id} className="border-b hover:bg-sky-50">
                    <td className="py-3 px-4">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono text-sm">{st.student_code}</td>
                    <td className="py-3 px-4">{st.group_number ?? ""}</td>
                    <td className="py-3 px-4 font-medium">
                      {st.last_name} {st.name}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={assignments[st.id] ?? ""}
                        onChange={(e) => handleSelect(st.id, e.target.value)}
                        className="w-full p-2 border border-sky-300 rounded-md bg-white focus:ring-2 focus:ring-sky-400"
                      >
                        <option value="">-- Chọn Chuỗi --</option>
                        {chains.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Bảng ĐÃ xếp */}
      {viewMode === "assigned" && (
        <>
          <h2 className="text-xl font-semibold mb-3 text-sky-900">
            Sinh viên ĐÃ xếp chuỗi (Assigned) — {assignedRows.length} SV
          </h2>

          {loading && <p className="text-sky-600 font-semibold">Đang tải...</p>}
          {!loading && assignedRows.length === 0 && (
            <p className="text-rose-600 italic">
              Chưa có SV nào được xếp chuỗi trong đợt thi này (theo bộ lọc).
            </p>
          )}

          {!loading && assignedRows.length > 0 && (
            <table className="min-w-full bg-white border border-sky-200 rounded-lg shadow-md overflow-hidden">
              <thead className="bg-sky-600 text-white">
                <tr>
                  <th className="py-3 px-4 text-left w-1/12">STT</th>
                  <th className="py-3 px-4 text-left w-2/12">Mã SV (Code)</th>
                  <th className="py-3 px-4 text-left w-1/12">Tổ</th>
                  <th className="py-3 px-4 text-left w-3/12">Họ tên (Name)</th>
                  <th className="py-3 px-4 text-left w-2/12">Chuỗi hiện tại (Current)</th>
                  <th className="py-3 px-4 text-left w-3/12">Đổi Chuỗi (Change Chain)</th>
                </tr>
              </thead>
              <tbody>
                {assignedRows.map((st: any, idx: number) => (
                  <tr key={st.id} className="border-b hover:bg-sky-50">
                    <td className="py-3 px-4">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono text-sm">{st.student_code}</td>
                    <td className="py-3 px-4">{st.group_number ?? ""}</td>
                    <td className="py-3 px-4 font-medium">
                      {st.last_name} {st.name}
                    </td>
                    <td className="py-3 px-4">{st.chain_name || "(N/A)"}</td>
                    <td className="py-3 px-4">
                      <select
                        value={assignments[st.id] ?? st.chain_id ?? ""}
                        onChange={(e) => handleSelect(st.id, e.target.value)}
                        className="w-full p-2 border border-sky-300 rounded-md bg-white focus:ring-2 focus:ring-sky-400"
                      >
                        <option value="">-- Giữ nguyên (Keep) --</option>
                        {chains.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
