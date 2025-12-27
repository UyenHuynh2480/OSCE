
// app/api/upload-students/commit/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServerAdmin';

export const runtime = 'nodejs';

// Kiểu phần tử sẽ upsert lên bảng students (chỉ những trường đang dùng)
type StudentUpsert = {
  student_code: string;
  last_name: string;
  name: string;
  birth_year: number;
  gender: string;
  level_id: string | null | undefined;
  cohort_id: string | null | undefined;
  group_number: number;
  batch_number: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: 'Không có dữ liệu để ghi' }, { status: 400 });
    }

    // Lấy Levels/Cohorts để map
    const [{ data: levels, error: levelErr }, { data: cohorts, error: cohortErr }] = await Promise.all([
      supabaseAdmin.from('levels').select('*'),
      supabaseAdmin.from('cohorts').select('*'),
    ]);
    if (levelErr || cohortErr || !levels || !cohorts) {
      const msg = `Không lấy được Levels/Cohorts: ${levelErr?.message ?? ''} ${cohortErr?.message ?? ''}`;
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const levelMapByName = new Map((levels as any[]).map((l: any) => [String(l.name).trim(), l.id]));
    const cohortMap = new Map((cohorts as any[]).map((c: any) => [`${c.year}-${c.level_id}`, c.id]));

    // Chuẩn hoá dữ liệu sẽ upsert (định kiểu rõ ràng)
    const inserts: StudentUpsert[] = rows.map((r: any): StudentUpsert => {
      const level_id = levelMapByName.get(String(r.level_name ?? '').trim());
      const cohort_id = cohortMap.get(`${r.year}-${level_id}`);
      return {
        student_code: String(r.student_code ?? '').trim(),
        last_name: String(r.last_name ?? '').trim(),
        name: String(r.name ?? '').trim(),
        birth_year: Number(r.birth_year ?? 0),
        gender: String(r.gender ?? '').trim(),
        level_id,
        cohort_id,
        group_number: Number(r.group_number ?? 0),
        batch_number: Number(r.batch_number ?? 0),
      };
    });

    // Kiểm tra sơ bộ
    const invalid = inserts.filter(
      (x: StudentUpsert) =>
        !x.student_code ||
        !x.last_name ||
        !x.name ||
        !x.birth_year ||     // 0 sẽ bị coi là không hợp lệ; nếu muốn cho phép 0, chỉnh lại điều kiện
        !x.gender ||
        !x.level_id ||
        !x.cohort_id ||
        !x.group_number ||   // 0 sẽ bị coi là không hợp lệ
        !x.batch_number      // 0 sẽ bị coi là không hợp lệ
    );
    if (invalid.length) {
      return NextResponse.json(
        { error: `Có ${invalid.length} dòng thiếu/mapping sai (level/cohort). Vui lòng kiểm tra lại.` },
        { status: 400 }
      );
    }

    // Upsert theo chunk
    const CHUNK_SIZE = 500;
    let total = 0;
    for (let i = 0; i < inserts.length; i += CHUNK_SIZE) {
      const chunk = inserts.slice(i, i + CHUNK_SIZE);
      const { error } = await supabaseAdmin
        .from('students')
        .upsert(chunk, { onConflict: 'student_code' });

      if (error) {
        return NextResponse.json(
          { error: `Lỗi upsert chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}` },
          { status: 500 }
        );
      }
      total += chunk.length;
    }

    return NextResponse.json({ message: 'Upsert thành công', count: total });
  } catch (err: any) {
    console.error('Commit students error:', err);
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
