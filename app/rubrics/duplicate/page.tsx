
// app/rubrics/duplicate/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type RubricRow = {
  id: string;
  name: string | null;
  display_name: string;
  task_name: string;
  station_id: string | null;
  station_name: string | null;
  cohort_id: string | null;
  cohort_year: number | null;
  exam_round_id: string | null;
  round_name: string | null;
  level_id: string | null;
  level_name: string | null;
  max_score: number | null;
  updated_at: string | null;
};

// ===== Helpers (copy từ code anh/chị đang dùng trong upload-rubric nếu cần) =====
type UUID = string;

const LEVEL_KEYS = ['Fail', 'Pass', 'Good', 'Excellent'] as const;
type ItemLevelKey = typeof LEVEL_KEYS[number];

type LevelColor = { bg: string; border: string; title: string };

type FixedRubricItem = {
  id: string;
  text: string;
  levels: Record<ItemLevelKey, { score: number; desc: string }>;
};
type LocalRubricItem = FixedRubricItem & {
  autoByPercent?: boolean;
  overridePercents?: Record<ItemLevelKey, number>;
};

function buildRubricFilename(opts: {
  levelName?: string;
  cohortYear?: number;
  roundNo?: number;
  stationName?: string;
  taskName?: string;
}) {
  const parts = [
    opts.levelName,
    opts.cohortYear ? `Y${opts.cohortYear}` : undefined,
    typeof opts.roundNo === 'number' ? `R${opts.roundNo}` : undefined,
    opts.stationName,
    opts.taskName,
  ].filter(Boolean);
  return parts.length ? parts.join(' • ') : undefined;
}

const checkDuplicateByContext = async (ctx: {
  level_id: UUID;
  cohort_id: UUID;
  exam_round_id: UUID;
  station_id: UUID;
  task_name?: string | null;
}) => {
  let q = supabase
    .from('rubrics')
    .select('id')
    .eq('level_id', ctx.level_id)
    .eq('cohort_id', ctx.cohort_id)
    .eq('exam_round_id', ctx.exam_round_id)
    .eq('station_id', ctx.station_id);

  if (typeof ctx.task_name === 'string' && ctx.task_name.trim() !== '') {
    q = q.eq('task_name', ctx.task_name.trim());
  }
  const { data, error } = await q.limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
};

const ensureUniqueName = (base: string | null, note?: string) => {
  const stamp = new Date().toLocaleString();
  const suffix = ` — (Version ${stamp})${note ? ` — NOTE: ${note}` : ''}`;
  return base?.trim() ? `${base.trim()}${suffix}` : suffix;
};

export default function RubricsListPage() {
  const [rows, setRows] = useState<RubricRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [levelId, setLevelId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [roundId, setRoundId] = useState('');
  const [stationId, setStationId] = useState('');
  const [q, setQ] = useState('');

  const [levels, setLevels] = useState<{ id: string; name: string }[]>([]);
  const [cohorts, setCohorts] = useState<{ id: string; year: number }[]>([]);
  const [rounds, setRounds] = useState<{ id: string; display_name: string }[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  useEffect(() => {
    (async () => {
      const [{ data: lvl }, { data: sts }] = await Promise.all([
        supabase.from('levels').select('id,name').order('name'),
        supabase.from('stations').select('id,name').order('name'),
      ]);
      setLevels(lvl ?? []);
      setStations(sts ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!levelId) { setCohorts([]); setRounds([]); setCohortId(''); setRoundId(''); return; }
      const { data: cs } = await supabase
        .from('cohorts')
        .select('id,year,level_id')
        .eq('level_id', levelId)
        .order('year');
      setCohorts(cs ?? []);
    })();
  }, [levelId]);

  useEffect(() => {
    (async () => {
      if (!cohortId) { setRounds([]); setRoundId(''); return; }
      const { data: rs } = await supabase
        .from('exam_rounds_view')
        .select('id,display_name,cohort_id')
        .eq('cohort_id', cohortId)
        .order('display_name');
      setRounds(rs ?? []);
    })();
  }, [cohortId]);

  useEffect(() => {
    const fetchRubrics = async () => {
      setLoading(true);
      try {
        let query = supabase.from('rubrics_view').select('*', { count: 'exact' });

        if (levelId)   query = query.eq('level_id', levelId);
        if (cohortId)  query = query.eq('cohort_id', cohortId);
        if (roundId)   query = query.eq('exam_round_id', roundId);
        if (stationId) query = query.eq('station_id', stationId);
        if (q.trim())  query = query.ilike('display_name', `%${q.trim()}%`);

        query = query.order('updated_at', { ascending: false });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        const { data, count, error } = await query.range(from, to);
        if (error) throw error;

        setRows((data ?? []) as RubricRow[]);
        setTotal(count ?? 0);
      } catch (e: any) {
        alert('Tải danh sách thất bại: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRubrics();
  }, [levelId, cohortId, roundId, stationId, q, page]);

  const goCreate = () => { window.location.href = '/upload-rubric'; };
  const goEdit = (id: string) => { window.location.href = `/upload-rubric?id=${id}`; };

  const onRename = async (id: string) => {
    const newName = prompt('Nhập tên rubric mới (ví dụ: Hỏi bệnh sử 3 lần đầu khám thai):');
    if (newName === null) return;
    const name = newName.trim();
    const { error } = await supabase.from('rubrics').update({ name }).eq('id', id);
    if (error) return alert('Đổi tên thất bại: ' + error.message);
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, display_name: name, name } : r));
  };

  const onDelete = async (id: string) => {
    if (!confirm('Xoá rubric này?')) return;
    const { error } = await supabase.from('rubrics').delete().eq('id', id);
    if (error) return alert('Xoá thất bại: ' + error.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  const onCopyClient = async (sourceId: string) => {
    const targetLevel   = prompt('Level ID (để trống = giữ nguyên):', levelId);
    const targetCohort  = prompt('Cohort ID (để trống = giữ nguyên):', cohortId);
    const targetRound   = prompt('ExamRound ID (để trống = giữ nguyên):', roundId);
    const targetStation = prompt('Station ID (để trống = giữ nguyên):', stationId);
    const targetName    = prompt('Tên rubric mới (để trống = giữ nguyên tên cũ):', '');

    const res = await fetch('/api/rubrics/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        target: {
          level_id: targetLevel || undefined,
          cohort_id: targetCohort || undefined,
          exam_round_id: targetRound || undefined,
          station_id: targetStation || undefined,
          name: targetName || undefined,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) return alert('Copy thất bại: ' + (json.error || 'unknown'));
    alert('Đã copy rubric sang ngữ cảnh mới.');
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Danh sách Rubric</h1>
        <button
          onClick={goCreate}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Tạo Rubric mới
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-white border border-gray-200 rounded-lg p-4">
        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={levelId}
          onChange={(e) => { setLevelId(e.target.value); setPage(1); }}
        >
          <option value="">Level (tất cả)</option>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={cohortId}
          onChange={(e) => { setCohortId(e.target.value); setPage(1); }}
          disabled={!levelId}
        >
          <option value="">Cohort (tất cả)</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.year}</option>)}
        </select>

        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={roundId}
          onChange={(e) => { setRoundId(e.target.value); setPage(1); }}
          disabled={!cohortId}
        >
          <option value="">Round (tất cả)</option>
          {rounds.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
        </select>

        <select
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={stationId}
          onChange={(e) => { setStationId(e.target.value); setPage(1); }}
        >
          <option value="">Station (tất cả)</option>
          {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <input
          type="text"
          placeholder="Tìm theo tên hiển thị..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="w-full rounded-md border px-3 py-2 text-sm placeholder-gray-400"
        />
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tên hiển thị</th>
              <th className="px-3 py-2 text-left font-medium">Level</th>
              <th className="px-3 py-2 text-left font-medium">Cohort</th>
              <th className="px-3 py-2 text-left font-medium">Round</th>
              <th className="px-3 py-2 text-left font-medium">Station</th>
              <th className="px-3 py-2 text-center font-medium">Max</th>
              <th className="px-3 py-2 text-left font-medium">Cập nhật</th>
              <th className="px-3 py-2 text-center font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-4 text-center" colSpan={8}>Đang tải...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-4 text-center" colSpan={8}>Không có rubric.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.display_name}</td>
                  <td className="px-3 py-2">{r.level_name}</td>
                  <td className="px-3 py-2">{r.cohort_year}</td>
                  <td className="px-3 py-2">{r.round_name}</td>
                  <td className="px-3 py-2">{r.station_name}</td>
                  <td className="px-3 py-2 text-center font-mono">{r.max_score ?? '-'}</td>
                  <td className="px-3 py-2">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => goEdit(r.id)} className="rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700">Sửa</button>
                      <button onClick={() => onRename(r.id)} className="rounded bg-sky-600 px-2 py-1 text-white hover:bg-sky-700">Đổi tên</button>
                      <button onClick={() => onCopyClient(r.id)} className="rounded bg-indigo-600 px-2 py-1 text-white hover:bg-indigo-700">Copy</button>
                      <button onClick={() => onDelete(r.id)} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700">Xoá</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">Tổng: {total} • Trang {page}/{totalPages}</div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-100"
            disabled={page <= 1}
          >
            ← Trước
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-100"
            disabled={page >= totalPages}
          >
            Sau →
          </button>
        </div>
      </div>
    </div>
  );
}
