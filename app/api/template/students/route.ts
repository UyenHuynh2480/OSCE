
// app/api/template/students/route.ts
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Template');

  // Header
  const header = [
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
  ws.addRow(header);

  // Một dòng mẫu
  ws.addRow([
    'SV001',
    'Nguyễn Văn',
    'An',
    2001,
    'Nam',     // 'Nam' hoặc 'Nữ'
    'Y4',      // ví dụ: Y4 hoặc Y6
    2025,      // niên khóa
    1,
    1,
  ]);

  // Auto-fit cơ bản
  header.forEach((_, idx) => {
    const col = ws.getColumn(idx + 1);
    col.width = Math.max(12, (col.width ?? 12));
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=student_template.xlsx',
      'Cache-Control': 'no-store',
    },
  });
}
``
