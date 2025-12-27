
"use client";
import * as React from "react";
import { useMemo, useState, useRef, useEffect } from "react";
import Papa, { ParseResult } from "papaparse";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// MUI Core
import {
  Box,
  Container,
  Stack,
  Typography,
  Button,
  Card,
  CardContent,
  Alert,
  AlertTitle,
  Chip,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  CssBaseline,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";

// MUI X DataGrid
import {
  DataGrid,
  GridColDef,
  GridToolbarContainer,
  GridToolbarQuickFilter,
  GridToolbarExport,
} from "@mui/x-data-grid";

/** ===== Theme: nền xanh nhạt + nút xanh đậm ===== */
const theme = createTheme({
  palette: {
    primary: {
      light: "#0ea5e9", // sky-500
      main: "#0369a1",  // sky-700
      dark: "#075985",  // sky-800
      contrastText: "#ffffff",
    },
  },
});

function CustomGridToolbar() {
  return (
    <GridToolbarContainer sx={{ p: 1 }}>
      <GridToolbarQuickFilter />
      <Box sx={{ flexGrow: 1 }} />
      <GridToolbarExport />
    </GridToolbarContainer>
  );
}

type RawRow = Record<string, any>;
type ErrorItem = { row: number; column: string; message: string };

// Types for list view
type Student = {
  id?: string;
  student_code: string;
  last_name: string;
  name: string;
  birth_year: number;
  gender: string;
  level_id: string;
  cohort_id: string;
  group_number: number;
  batch_number: number;
};
type Level = { id: string; name: string };
type Cohort = { id: string; year: number; level_id: string };
type StudentView = Student & { level_name?: string; cohort_year?: number };

/** Sắp xếp tiếng Việt (không phân biệt dấu) */
const collator = new Intl.Collator("vi", { sensitivity: "base", usage: "sort" });

export default function UploadStudents() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>("");
  const [previewData, setPreviewData] = useState<RawRow[]>([]);
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [readyToUpload, setReadyToUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** 🔙 Quay lại Dashboard theo role (admin/uploader) */
  const goBackDashboard = async () => {
    try {
      const { data: roleRes, error } = await supabase.rpc("get_my_role");
      if (error) {
        setStatus(`❌ Không lấy được role: ${error.message}`);
        return;
      }
      const role = (roleRes as string | null) ?? null;
      const dashboardHref = role === "admin" ? "/dashboard/admin" : "/dashboard/uploader";
      router.push(dashboardHref);
    } catch (err) {
      setStatus("❌ Lỗi lấy role khi quay lại Dashboard");
    }
  };

  // ===== Handlers =====
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setFiles(Array.from(e.target.files));
  };

  /** 📥 Tải CSV Template (an toàn, nhẹ) */
  const downloadTemplateCSV = () => {
    const header = [
      "student_code",
      "last_name",
      "name",
      "birth_year",
      "gender",
      "level_name",
      "year",
      "group_number",
      "batch_number",
    ];
    const sample = [
      [
        "SV001",
        "Nguyễn Văn",
        "An",
        "2001",
        "Nam",
        "Y4",
        "2025",
        "1",
        "1",
      ],
    ];
    const csv = [header.join(","), ...sample.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (file: File) =>
    new Promise<any[]>((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => String(h).trim(),
        complete: (results: ParseResult<any>) => resolve(results.data as any[]),
        error: reject,
      });
    });

  /** 🧪 Validate client-side cho CSV & cho các chỉnh sửa */
  const validateRowsClient = async (rows: RawRow[]) => {
    const [{ data: levels }, { data: cohorts }] = await Promise.all([
      supabase.from("levels").select("*"),
      supabase.from("cohorts").select("*"),
    ]);

    const levelMap = new Map((levels as any[]).map((l: any) => [String(l.name).trim(), l.id]));
    const cohortMap = new Map((cohorts as any[]).map((c: any) => [`${c.year}-${c.level_id}`, c.id]));

    const requiredFields = [
      "student_code",
      "last_name",
      "name",
      "birth_year",
      "gender",
      "level_name",
      "year",
      "group_number",
      "batch_number",
    ];

    const newPreview: RawRow[] = [];
    const newErrors: ErrorItem[] = [];

    rows.forEach((row, idx) => {
      const line = Number(row.__line ?? row.id ?? idx + 2); // Excel header ở dòng 1
      const levelName = String(row.level_name ?? "").trim();
      const levelId = levelMap.get(levelName);

      const dataRow: RawRow = {
        ...row,
        id: line,
        __line: line,
        student_code: String(row.student_code ?? "").trim(),
        last_name: String(row.last_name ?? "").trim(),
        name: String(row.name ?? "").trim(),
        birth_year: Number(row.birth_year ?? 0),
        gender: String(row.gender ?? "").trim(),
        level_name: levelName,
        year: Number(row.year ?? 0),
        group_number: Number(row.group_number ?? 0),
        batch_number: Number(row.batch_number ?? 0),
      };

      // Required
      requiredFields.forEach((f) => {
        const v = dataRow[f];
        if (v == null || (typeof v === "string" && v.trim() === "") || v === 0) {
          newErrors.push({ row: line, column: f, message: "Thiếu dữ liệu" });
        }
      });

      // Constraints
      if (dataRow.birth_year && (dataRow.birth_year < 1980 || dataRow.birth_year > 2010)) {
        newErrors.push({ row: line, column: "birth_year", message: "birth_year ngoài phạm vi 1980-2010" });
      }
      if (dataRow.gender && !["Nam", "Nữ"].includes(dataRow.gender)) {
        newErrors.push({ row: line, column: "gender", message: "Giới tính phải Nam/Nữ" });
      }
      if (dataRow.group_number && dataRow.group_number <= 0) {
        newErrors.push({ row: line, column: "group_number", message: "group_number phải > 0" });
      }
      if (dataRow.batch_number && dataRow.batch_number <= 0) {
        newErrors.push({ row: line, column: "batch_number", message: "batch_number phải > 0" });
      }

      // Level/Cohort tồn tại
      if (dataRow.level_name && !levelId) {
        newErrors.push({ row: line, column: "level_name", message: "Level không tồn tại" });
      }
      const cohortKey = `${dataRow.year}-${levelId}`;
      if (dataRow.level_name && dataRow.year && !cohortMap.get(cohortKey)) {
        newErrors.push({ row: line, column: "year", message: "Cohort không hợp lệ" });
      }

      newPreview.push(dataRow);
    });

    return { rows: newPreview, errors: newErrors };
  };

  const handleParseFiles = async () => {
    if (files.length === 0) {
      setStatus("❌ Chưa chọn file!");
      return;
    }
    setLoading(true);
    setStatus("⏳ Đang đọc & validate...");
    const allRows: RawRow[] = [];
    const allErrors: ErrorItem[] = [];

    try {
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.endsWith(".csv")) {
          // CSV: parse client + validate client
          const csvRows = await parseCSV(file);
          const { rows, errors } = await validateRowsClient(csvRows);
          allRows.push(...rows);
          allErrors.push(...errors);
        } else {
          // Excel: gửi lên server để parse & validate
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/upload-students", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) {
            setStatus(`❌ Lỗi parse Excel: ${data.error ?? "unknown"}`);
            setLoading(false);
            return;
          }
          allRows.push(...(data.rows ?? []));
          allErrors.push(...(data.errors ?? []));
        }
      }

      if (!allRows.length) {
        setStatus("❌ Không có dữ liệu");
        setLoading(false);
        return;
      }

      setPreviewData(allRows);
      setErrors(allErrors);
      setReadyToUpload(allErrors.length === 0);
      setStatus(`✅ Validate xong. Dòng lỗi: ${allErrors.length}`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Lỗi đọc file / kết nối API");
    } finally {
      setLoading(false);
    }
  };

  const processRowUpdate = (newRow: RawRow) => {
    setPreviewData((prev) => {
      const newData = [...prev];
      const idx = newData.findIndex((r) => r.__line === newRow.__line);
      if (idx !== -1) newData[idx] = { ...newRow };
      return newData;
    });
    setReadyToUpload(false);
    return newRow;
  };

  const handleRevalidate = async () => {
    if (!previewData.length) return;
    setLoading(true);
    setStatus("🔍 Đang kiểm tra lại lỗi...");
    try {
      const { rows, errors } = await validateRowsClient(previewData);
      setPreviewData(rows);
      setErrors(errors);
      setReadyToUpload(errors.length === 0);
      setStatus(`🔍 Re-validate xong. Dòng lỗi: ${errors.length}`);
    } catch (err) {
      console.error(err);
      setStatus("❌ Lỗi khi re-validate");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUpload = async () => {
    if (!previewData.length || errors.length > 0) {
      setStatus("❌ Không thể upload vì còn lỗi hoặc chưa có dữ liệu. Vui lòng sửa và Check lại lỗi.");
      return;
    }
    setLoading(true);
    setStatus("⏳ Upload lên Supabase (server)...");
    try {
      const res = await fetch("/api/upload-students/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: previewData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(`❌ Lỗi commit: ${data.error ?? "unknown"}`);
        setLoading(false);
        return;
      }
      setStatus(`🎉 Upload thành công ${data.count} sinh viên`);
      setReadyToUpload(false);
      setFiles([]);
      setPreviewData([]);
      setErrors([]);
      setLoading(false);
      try {
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch {}
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
      // Làm mới danh sách đã upload
      await loadStudents();
    } catch (err) {
      console.error(err);
      setStatus("❌ Lỗi upload dữ liệu");
      setLoading(false);
    }
  };

  // ===== DataGrid columns (Preview) =====
  const columns: GridColDef[] = useMemo(
    () => [
      { field: "student_code", headerName: "Mã SV (Student code)", width: 120, editable: true },
      { field: "last_name", headerName: "Họ (Last name)", width: 140, editable: true },
      { field: "name", headerName: "Tên (Given name)", width: 120, editable: true },
      { field: "birth_year", headerName: "Năm sinh (Birth year)", width: 110, editable: true, type: "number" },
      { field: "gender", headerName: "Giới tính (Gender)", width: 110, editable: true },
      { field: "level_name", headerName: "Đối tượng (Level)", width: 130, editable: true },
      { field: "year", headerName: "Niên khóa (Cohort year)", width: 130, editable: true, type: "number" },
      { field: "group_number", headerName: "Tổ (Group #)", width: 110, editable: true, type: "number" },
      { field: "batch_number", headerName: "Đợt học (Batch #)", width: 120, editable: true, type: "number" },
    ],
    []
  );

  const getCellClassName = (params: any) =>
    errors.some((e) => e.row === Number(params.id) && e.column === params.field)
      ? "error-cell"
      : "";

  const stats = useMemo(
    () => ({ total: previewData.length, errorCount: errors.length }),
    [previewData, errors]
  );

  /** ==========================
   * Danh sách đã upload — List View
   * ========================== */
  const [levels, setLevels] = useState<Level[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [students, setStudents] = useState<StudentView[]>([]);
  const [studentsLoading, setStudentsLoading] = useState<boolean>(false);
  const [studentsStatus, setStudentsStatus] = useState<string>("");

  // Filters
  const [levelFilter, setLevelFilter] = useState<string>(""); // level_name
  const [yearFilter, setYearFilter] = useState<number | "">("");
  const [groupFilter, setGroupFilter] = useState<number | "">("");
  const [batchFilter, setBatchFilter] = useState<number | "">("");

  const loadStudents = async () => {
    setStudentsLoading(true);
    setStudentsStatus("⏳ Đang tải danh sách sinh viên đã upload...");
    try {
      const [{ data: levelRes, error: levelErr }, { data: cohortRes, error: cohortErr }] =
        await Promise.all([
          supabase.from("levels").select("*"),
          supabase.from("cohorts").select("*"),
        ]);
      if (levelErr || cohortErr) {
        setStudentsStatus(`❌ Lỗi tải Levels/Cohorts: ${levelErr?.message ?? ""} ${cohortErr?.message ?? ""}`);
        setStudentsLoading(false);
        return;
      }

      const { data: studentRes, error: studentErr } = await supabase
        .from("students")
        .select("*")
        .limit(5000); // tuỳ nhu cầu

      if (studentErr) {
        setStudentsStatus(`❌ Lỗi tải Students: ${studentErr.message}`);
        setStudentsLoading(false);
        return;
      }

      const levelMap = new Map((levelRes as Level[]).map((l) => [l.id, l.name]));
      const cohortMap = new Map((cohortRes as Cohort[]).map((c) => [c.id, c.year]));

      const merged = (studentRes as Student[]).map((s) => ({
        ...s,
        id: s.student_code ?? s.id, // đảm bảo có id cho DataGrid
        level_name: levelMap.get(s.level_id) ?? "",
        cohort_year: cohortMap.get(s.cohort_id) ?? undefined,
      }));

      setLevels(levelRes as Level[]);
      setCohorts(cohortRes as Cohort[]);
      setStudents(merged);
      setStudentsStatus(`✅ Tải xong ${merged.length} sinh viên`);
    } catch (err: any) {
      console.error(err);
      setStudentsStatus("❌ Lỗi hệ thống khi tải danh sách sinh viên");
    } finally {
      setStudentsLoading(false);
    }
  };

  // Tải lần đầu
  useEffect(() => {
    loadStudents();
  }, []);

  // Options cho bộ lọc (lấy từ dữ liệu đã tải)
  const levelOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.level_name).filter(Boolean))).sort((a, b) => collator.compare(a!, b!)),
    [students]
  );

  const yearOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.cohort_year).filter((y): y is number => typeof y === "number"))).sort(),
    [students]
  );

  const groupOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.group_number).filter((n): n is number => typeof n === "number"))).sort((a, b) => a - b),
    [students]
  );

  const batchOptions = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch_number).filter((n): n is number => typeof n === "number"))).sort((a, b) => a - b),
    [students]
  );

  // Áp dụng lọc phía client
  const filteredStudents = useMemo(
    () =>
      students.filter((s) => {
        if (levelFilter && s.level_name !== levelFilter) return false;
        if (yearFilter !== "" && s.cohort_year !== Number(yearFilter)) return false;
        if (groupFilter !== "" && s.group_number !== Number(groupFilter)) return false;
        if (batchFilter !== "" && s.batch_number !== Number(batchFilter)) return false;
        return true;
      }),
    [students, levelFilter, yearFilter, groupFilter, batchFilter]
  );

  /** ===== EDIT/DELETE HANDLERS & STATE ===== */
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<Partial<StudentView>>({});
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [targetStudent, setTargetStudent] = useState<StudentView | null>(null);

  const openEdit = (s: StudentView) => {
    setEditForm({
      id: s.id,
      student_code: s.student_code,
      last_name: s.last_name,
      name: s.name,
      birth_year: s.birth_year,
      gender: s.gender,
      level_name: s.level_name,
      cohort_year: s.cohort_year,
      group_number: s.group_number,
      batch_number: s.batch_number,
    });
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditForm({});
  };

  const saveEdit = async () => {
    const errs: string[] = [];
    const f = editForm;

    if (!f.student_code) errs.push("Thiếu Mã SV (student_code).");
    if (!f.last_name) errs.push("Thiếu Họ (last_name).");
    if (!f.name) errs.push("Thiếu Tên (name).");
    if (!f.birth_year || f.birth_year < 1980 || f.birth_year > 2010)
      errs.push("Năm sinh phải trong phạm vi 1980–2010.");
    if (!f.gender || !["Nam", "Nữ"].includes(String(f.gender)))
      errs.push("Giới tính phải là Nam/Nữ.");
    if (!f.level_name) errs.push("Thiếu Đối tượng (level_name).");
    if (!f.cohort_year) errs.push("Thiếu Niên khóa (cohort_year).");
    if (!f.group_number || f.group_number <= 0) errs.push("Tổ (group_number) phải > 0.");
    if (!f.batch_number || f.batch_number <= 0) errs.push("Đợt thi (batch_number) phải > 0.");

    if (errs.length) {
      setStudentsStatus(`❌ Lỗi dữ liệu chỉnh sửa: ${errs.join(" ")}`);
      return;
    }

    try {
      const levelMapByName = new Map(levels.map((l) => [String(l.name).trim(), l.id]));
      const level_id = levelMapByName.get(String(f.level_name).trim());
      const cohort_id = cohorts.find(
        (c) => c.level_id === level_id && c.year === Number(f.cohort_year)
      )?.id;

      if (!level_id) {
        setStudentsStatus("❌ Level không tồn tại cho giá trị đã chọn.");
        return;
      }
      if (!cohort_id) {
        setStudentsStatus("❌ Cohort (niên khóa) không hợp lệ với Level đã chọn.");
        return;
      }

      const { error } = await supabase
        .from("students")
        .update({
          last_name: f.last_name,
          name: f.name,
          birth_year: f.birth_year,
          gender: f.gender,
          level_id,
          cohort_id,
          group_number: f.group_number,
          batch_number: f.batch_number,
        })
        .eq("student_code", f.student_code);

      if (error) {
        setStudentsStatus(`❌ Lỗi cập nhật: ${error.message}`);
        return;
      }

      setStudentsStatus("✅ Cập nhật sinh viên thành công");
      closeEdit();
      await loadStudents();
    } catch (err: any) {
      console.error(err);
      setStudentsStatus("❌ Lỗi hệ thống khi cập nhật sinh viên");
    }
  };

  const openDelete = (s: StudentView) => {
    setTargetStudent(s);
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setTargetStudent(null);
  };

  const confirmDelete = async () => {
    if (!targetStudent?.student_code) return;
    try {
      const { error } = await supabase
        .from("students")
        .delete()
        .eq("student_code", targetStudent.student_code);

      if (error) {
        setStudentsStatus(`❌ Lỗi xóa sinh viên: ${error.message}`);
        return;
      }

      setStudentsStatus(`✅ Đã xóa sinh viên: ${targetStudent.student_code}`);
      closeDelete();
      await loadStudents();
    } catch (err: any) {
      console.error(err);
      setStudentsStatus("❌ Lỗi hệ thống khi xóa sinh viên");
    }
  };

  // ===== Columns cho danh sách đã upload =====
  const listColumns: GridColDef[] = useMemo(
    () => [
      { field: "student_code", headerName: "Mã SV", width: 105, sortable: true },
      { field: "last_name", headerName: "Họ", width: 140, sortable: true },
      { field: "name", headerName: "Tên", width: 110, sortable: true },
      { field: "gender", headerName: "Giới tính", width: 82, sortable: true },
      { field: "birth_year", headerName: "Năm sinh", type: "number", width: 92, sortable: true },
      { field: "level_name", headerName: "Đối tượng", width: 98, sortable: true },
      { field: "cohort_year", headerName: "Niên khóa", type: "number", width: 98, sortable: true },
      { field: "group_number", headerName: "Tổ", type: "number", width: 72, sortable: true },
      { field: "batch_number", headerName: "Đợt thi", type: "number", width: 92, sortable: true },
      {
        field: "actions",
        headerName: "Thao tác",
        width: 120,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        headerAlign: "center",
        align: "center",
        renderCell: (params) => {
          const s = params.row as StudentView;
          return (
            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{
                "& .action-link": {
                  fontSize: "0.80rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  textTransform: "none",
                  lineHeight: 1.2,
                  padding: 0,
                  cursor: "pointer",
                },
                "& .action-link.primary:hover": { textDecoration: "underline", color: "#0369a1" },
                "& .action-link.error:hover": { textDecoration: "underline", color: "#d32f2f" },
              }}
            >
              <button
                className="action-link primary"
                onClick={() => openEdit(s)}
                style={{ background: "transparent", border: "none", color: "#0369a1" }}
              >
                Sửa
              </button>
              <Box sx={{ color: "divider" }}>·</Box>
              <button
                className="action-link error"
                onClick={() => openDelete(s)}
                style={{ background: "transparent", border: "none", color: "#d32f2f" }}
              >
                Xóa
              </button>
            </Stack>
          );
        },
      },
    ],
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* Nền xanh nhạt toàn trang */}
      <Box sx={{ bgcolor: "#f0f9ff" }}>
        <Container maxWidth="lg" sx={{ py: 4 }}>
          {/* Header + Actions (có nút quay lại Dashboard) */}
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 2, gap: 2, flexWrap: "wrap" }}
          >
            <Typography variant="h5" fontWeight={700} color="primary">
              📥 Upload Danh sách Sinh viên
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="primary" onClick={goBackDashboard}>
                ← Quay lại Dashboard
              </Button>
              <Button variant="outlined" color="primary" onClick={downloadTemplateCSV}>
                📥 Tải CSV Template
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleParseFiles}
                disabled={files.length === 0}
              >
                🔎 Xem trước & Validate
              </Button>
            </Stack>
          </Stack>

          {/* Chọn file */}
          <Card sx={{ mb: 2, border: "1px solid", borderColor: "#bae6fd" }}>
            <CardContent>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems="center"
              >
                <Button component="label" variant="outlined" color="primary">
                  📤 Chọn file Excel/CSV
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    multiple
                    onChange={handleFileChange}
                  />
                </Button>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {files.map((f, i) => (
                    <Chip key={i} label={f.name} variant="outlined" color="primary" />
                  ))}
                </Stack>
              </Stack>

              {loading && <LinearProgress sx={{ mt: 2 }} color="primary" />}
            </CardContent>
          </Card>

          {/* Status */}
          {status && (
            <Alert
              severity={
                status.startsWith("❌")
                  ? "error"
                  : status.startsWith("🎉")
                  ? "success"
                  : "info"
              }
              sx={{ mb: 2 }}
            >
              <AlertTitle>Trạng thái</AlertTitle>
              {status}
            </Alert>
          )}

          {/* Preview + Stats */}
          {previewData.length > 0 && (
            <React.Fragment>
              <Card sx={{ mb: 2, border: "1px solid", borderColor: "#bae6fd" }}>
                <CardContent>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={2}>
                      <Chip label={`Tổng dòng: ${stats.total}`} color="primary" />
                      <Chip
                        label={`Tổng lỗi: ${stats.errorCount}`}
                        color={stats.errorCount ? "warning" : "success"}
                      />
                      <Chip
                        label={readyToUpload ? "Sẵn sàng upload" : "Cần sửa lỗi/validate lại"}
                        color={readyToUpload ? "success" : "default"}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" color="primary" onClick={handleRevalidate}>
                        🔁 Check lại lỗi
                      </Button>
                      {/* Nút xác nhận: xanh đậm */}
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={handleConfirmUpload}
                        disabled={!readyToUpload}
                      >
                        ☁️⬆️ Xác nhận Upload
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              <Paper
                elevation={0}
                sx={{
                  height: 440,
                  width: "100%",
                  mb: 2,
                  border: "1px solid",
                  borderColor: "#bae6fd",
                }}
              >
                <DataGrid
                  rows={previewData.map((r) => ({ ...r, id: r.__line ?? r.id }))}
                  columns={columns}
                  processRowUpdate={processRowUpdate}
                  disableRowSelectionOnClick
                  density="compact"
                  rowHeight={32}
                  columnHeaderHeight={36}
                  slots={{ toolbar: CustomGridToolbar }}
                  getCellClassName={getCellClassName}
                  sx={{
                    "& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell": {
                      py: 0.25,
                      px: 0.75,
                      fontSize: "0.83rem",
                      lineHeight: 1.25,
                    },
                  }}
                />
              </Paper>

              {/* Bảng lỗi chi tiết */}
              <Card sx={{ border: "1px solid", borderColor: "#bae6fd" }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }} color="primary">
                    Lỗi chi tiết (Validation details)
                  </Typography>
                  {errors.length ? (
                    <Box
                      sx={{
                        maxHeight: 300,
                        overflow: "auto",
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "#bae6fd",
                      }}
                    >
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Dòng (Row)</TableCell>
                            <TableCell>Cột (Column)</TableCell>
                            <TableCell>Lý do (Message)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {errors.map((e, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>{e.row}</TableCell>
                              <TableCell>{e.column}</TableCell>
                              <TableCell>{e.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  ) : (
                    <Alert severity="success">✅ Không còn lỗi</Alert>
                  )}
                </CardContent>
              </Card>
            </React.Fragment>
          )}

          {/* =========================
          Danh sách sinh viên đã upload
          ========================= */}
          <Card sx={{ mt: 3, border: "1px solid", borderColor: "#bae6fd" }}>
            <CardContent>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ xs: "stretch", md: "center" }}
                justifyContent="space-between"
                sx={{ mb: 2 }}
              >
                <Typography variant="h6" fontWeight={700} color="primary">
                  📚 Danh sách sinh viên đã upload
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button variant="outlined" color="primary" onClick={loadStudents} disabled={studentsLoading}>
                    🔄 Làm mới
                  </Button>
                </Stack>
              </Stack>

              {/* Filters */}
              <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="level-filter-label">Đối tượng</InputLabel>
                  <Select
                    labelId="level-filter-label"
                    label="Đối tượng"
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                  >
                    <MenuItem value=""><em>Tất cả</em></MenuItem>
                    {levelOptions.map((lv) => (
                      <MenuItem key={lv} value={lv}>{lv}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="year-filter-label">Niên khóa</InputLabel>
                  <Select
                    labelId="year-filter-label"
                    label="Niên khóa"
                    value={yearFilter === "" ? "" : String(yearFilter)}
                    onChange={(e) => setYearFilter(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <MenuItem value=""><em>Tất cả</em></MenuItem>
                    {yearOptions.map((y) => (
                      <MenuItem key={y} value={String(y)}>{y}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="group-filter-label">Tổ</InputLabel>
                  <Select
                    labelId="group-filter-label"
                    label="Tổ"
                    value={groupFilter === "" ? "" : String(groupFilter)}
                    onChange={(e) => setGroupFilter(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <MenuItem value=""><em>Tất cả</em></MenuItem>
                    {groupOptions.map((g) => (
                      <MenuItem key={g} value={String(g)}>{g}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="batch-filter-label">Đợt thi</InputLabel>
                  <Select
                    labelId="batch-filter-label"
                    label="Đợt thi"
                    value={batchFilter === "" ? "" : String(batchFilter)}
                    onChange={(e) => setBatchFilter(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <MenuItem value=""><em>Tất cả</em></MenuItem>
                    {batchOptions.map((b) => (
                      <MenuItem key={b} value={String(b)}>{b}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              {/* DataGrid List */}
              <Paper
                elevation={0}
                sx={{
                  height: 480,
                  width: "100%",
                  border: "1px solid",
                  borderColor: "#bae6fd",
                }}
              >
                <DataGrid
                  rows={filteredStudents}
                  columns={listColumns}
                  disableRowSelectionOnClick
                  density="compact"
                  rowHeight={32}
                  columnHeaderHeight={36}
                  slots={{ toolbar: CustomGridToolbar }}
                  loading={studentsLoading}
                  hideFooterSelectedRowCount
                  sx={{
                    "& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell": {
                      py: 0.25,
                      px: 0.6,
                      fontSize: "0.82rem",
                      lineHeight: 1.25,
                    },
                  }}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 25 } },
                  }}
                  pageSizeOptions={[10, 25, 50]}
                />
              </Paper>

              {/* Status */}
              {studentsStatus && (
                <Alert
                  severity={
                    studentsStatus.startsWith("❌")
                      ? "error"
                      : studentsStatus.startsWith("✅")
                      ? "success"
                      : "info"
                  }
                  sx={{ mt: 2 }}
                >
                  <AlertTitle>Trạng thái danh sách</AlertTitle>
                  {studentsStatus}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* CSS bổ sung: tô màu ô lỗi trong DataGrid (chỉ áp dụng cho Preview) */}
          <style>{`
            .error-cell {
              background-color: rgba(244, 63, 94, 0.12); /* rose-500/12 */
            }
          `}</style>

          {/* ===== Dialog: Edit Student ===== */}
          <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="sm">
            <DialogTitle>✏️ Chỉnh sửa thông tin sinh viên</DialogTitle>
            <DialogContent sx={{ pt: 1 }}>
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField
                  label="Mã SV (Student code)"
                  value={editForm.student_code ?? ""}
                  size="small"
                  disabled
                />
                <TextField
                  label="Họ (Last name)"
                  value={editForm.last_name ?? ""}
                  size="small"
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, last_name: e.target.value }))
                  }
                />
                <TextField
                  label="Tên (Given name)"
                  value={editForm.name ?? ""}
                  size="small"
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
                <TextField
                  label="Năm sinh (Birth year)"
                  type="number"
                  value={editForm.birth_year ?? ""}
                  size="small"
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      birth_year: Number(e.target.value || 0),
                    }))
                  }
                />

                <FormControl size="small">
                  <InputLabel id="gender-edit-label">Giới tính</InputLabel>
                  <Select
                    labelId="gender-edit-label"
                    label="Giới tính"
                    value={editForm.gender ?? ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, gender: e.target.value }))
                    }
                  >
                    <MenuItem value="Nam">Nam</MenuItem>
                    <MenuItem value="Nữ">Nữ</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small">
                  <InputLabel id="level-edit-label">Đối tượng (Level)</InputLabel>
                  <Select
                    labelId="level-edit-label"
                    label="Đối tượng (Level)"
                    value={editForm.level_name ?? ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, level_name: e.target.value }))
                    }
                  >
                    {levelOptions.map((lv) => (
                      <MenuItem key={lv} value={lv}>
                        {lv}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small">
                  <InputLabel id="year-edit-label">Niên khóa (Cohort year)</InputLabel>
                  <Select
                    labelId="year-edit-label"
                    label="Niên khóa (Cohort year)"
                    value={
                      editForm.cohort_year === undefined
                        ? ""
                        : String(editForm.cohort_year)
                    }
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        cohort_year:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      }))
                    }
                  >
                    {yearOptions.map((y) => (
                      <MenuItem key={y} value={String(y)}>
                        {y}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  label="Tổ (Group #)"
                  type="number"
                  value={editForm.group_number ?? ""}
                  size="small"
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      group_number: Number(e.target.value || 0),
                    }))
                  }
                />
                <TextField
                  label="Đợt thi (Batch #)"
                  type="number"
                  value={editForm.batch_number ?? ""}
                  size="small"
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      batch_number: Number(e.target.value || 0),
                    }))
                  }
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeEdit}>Hủy</Button>
              <Button variant="contained" color="primary" onClick={saveEdit}>
                Lưu thay đổi
              </Button>
            </DialogActions>
          </Dialog>

          {/* ===== Dialog: Delete Confirm ===== */}
          <Dialog open={deleteOpen} onClose={closeDelete}>
            <DialogTitle>🗑️ Xóa sinh viên</DialogTitle>
            <DialogContent>
              <Typography>
                Bạn có chắc muốn xóa sinh viên{" "}
                <strong>{targetStudent?.student_code}</strong> —{" "}
                {targetStudent?.last_name} {targetStudent?.name}?
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeDelete}>Hủy</Button>
              <Button variant="contained" color="error" onClick={confirmDelete}>
                Xóa
              </Button>
            </DialogActions>
          </Dialog>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
