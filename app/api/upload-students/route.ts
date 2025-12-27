
// app/api/upload-students/route.ts
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

export const runtime = 'nodejs';

type RawRow = Record<string, any>;
type ErrorItem = { row: number; column: string; message: string };

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File quá lớn (>5MB)' }, { status: 413 });
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
      'application/vnd.ms-excel',
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `Sai định dạng: ${file.type}` }, { status: 415 });
    }

    // ✅ Đọc file thành ArrayBuffer và nạp trực tiếp (tránh kiểu Buffer<T>)
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);

    const sheet = workbook.getWorksheet(1);
    if (!sheet) {
      return NextResponse.json({ error: 'Không tìm thấy sheet 1' }, { status: 400 });
    }

    const [{ data: levels, error: levelErr }, { data: cohorts, error: cohortErr }] = await Promise.all([
      supabaseAdmin.from('levels').select('*'),
      supabaseAdmin.from('cohorts').select('*'),
    ]);
    if (levelErr || cohortErr || !levels || !cohorts) {
      const msg = `Không lấy được Levels/Cohorts: ${levelErr?.message ?? ''} ${cohortErr?.message ?? ''}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const levelMap = new Map((levels as any[]).map((l: any) => [String(l.name).trim(), l.id]));
    const cohortMap = new Map((cohorts as any[]).map((c: any) => [`${c.year}-${c.level_id}`, c.id]));

    const rows: RawRow[] = [];
    const errors: ErrorItem[] = [];

    const cellText = (row: ExcelJS.Row, col: number) =>
      row.getCell(col).text ? String(row.getCell(col).text).trim() : '';

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const line = rowNumber;

      const dataRow: RawRow = {
        id: line,
        __line: line,
        student_code: cellText(row, 1),
        last_name: cellText(row, 2),
        name: cellText(row, 3),
        birth_year: Number(cellText(row, 4) || 0),
        gender: cellText(row, 5),
        level_name: cellText(row, 6),
        year: Number(cellText(row, 7) || 0),
        group_number: Number(cellText(row, 8) || 0),
        batch_number: Number(cellText(row, 9) || 0),
      };

      const requiredFields = [
        'student_code',
        'last_name',
        'name',
        'birth_year',
        'gender',
        'level_name',
        'year',
        'group_number',
        'batch_number',
      ];
      for (const f of requiredFields) {
        const v = (dataRow as any)[f];
        if (v == null || (typeof v === 'string' && v.trim() === '') || v === 0) {
          errors.push({ row: line, column: f, message: 'Thiếu dữ liệu' });
        }
      }

      if (dataRow.birth_year && (dataRow.birth_year < 1980 || dataRow.birth_year > 2010)) {
        errors.push({ row: line, column: 'birth_year', message: 'birth_year ngoài phạm vi 1980-2010' });
      }
      if (dataRow.gender && !['Nam', 'Nữ'].includes(dataRow.gender)) {
        errors.push({ row: line, column: 'gender', message: 'Giới tính phải Nam/Nữ' });
      }
      if (dataRow.group_number && dataRow.group_number <= 0) {
        errors.push({ row: line, column: 'group_number', message: 'group_number phải > 0' });
      }
      if (dataRow.batch_number && dataRow.batch_number <= 0) {
        errors.push({ row: line, column: 'batch_number', message: 'batch_number phải > 0' });
      }

      const levelId = levelMap.get(String(dataRow.level_name).trim());
      if (dataRow.level_name && !levelId) {
        errors.push({ row: line, column: 'level_name', message: 'Level không tồn tại' });
      }
      const cohortKey = `${dataRow.year}-${levelId}`;
      if (dataRow.level_name && dataRow.year && !cohortMap.get(cohortKey)) {
        errors.push({ row: line, column: 'year', message: 'Cohort không hợp lệ' });
      }

      rows.push(dataRow);
    });

    return NextResponse.json({
      message: 'Parse Excel thành công',
      rows,
      errors,
      ready: errors.length === 0,
      total: rows.length,
      errorCount: errors.length,
    });
  } catch (err: any) {
    console.error('Upload Excel error:', err);
    return NextResponse.json(
      { error: `Lỗi đọc Excel: ${err?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }
}
