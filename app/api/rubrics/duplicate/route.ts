
// app/api/rubrics/duplicate/route.ts
import { NextResponse } from 'next/server';

/**
 * API để duplicate rubric.
 * Hiện tại: stub tối thiểu để build qua.
 * TODO: Thay bằng logic thật (đọc source_id, target, rồi thao tác DB).
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // body dự kiến có dạng:
    // {
    //   source_id: string,
    //   target: {
    //     level_id?: string,
    //     cohort_id?: string,
    //     exam_round_id?: string,
    //     station_id?: string,
    //     name?: string
    //   }
    // }

    // TODO (sau này):
    // 1) Lấy rubric nguồn theo source_id
    // 2) Tạo rubric mới (override theo target)
    // 3) Copy rubric_items sang rubric mới
    // 4) Trả về { ok: true, new_id }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Lỗi không xác định.' },
      { status: 500 }
    );
  }
}
