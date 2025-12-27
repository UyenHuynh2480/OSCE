
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

type Profile = {
  user_id: string;
  role: string;
  display_name?: string | null;
};

type ScopeRow = {
  user_id: string;
  level_id?: string | null;
  chain_id?: string | null;
  station_code?: string | null; // A–F
  station_id?: string | null;   // nếu bạn lưu khóa trạm
};

type Station = {
  id: string;
  name: string;
};

type ExamRoundView = {
  id: string;
  display_name: string;
};

type Level = { id: string; name: string };
type Chain = { id: string; name: string };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SetScopePage() {
  /** Danh sách để chọn */
  const [graders, setGraders] = useState<Profile[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [rounds, setRounds] = useState<ExamRoundView[]>([]);

  /** Bảng mô tả để hiển thị tên */
  const [levels, setLevels] = useState<Level[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);

  /** Lựa chọn hiện tại */
  const [userId, setUserId] = useState<string>('');
  const [stationId, setStationId] = useState<string>('');
  const [examRoundId, setExamRoundId] = useState<string>('');

  /** Scope đã lưu cho user (lấy từ station_account_scopes) */
  const [savedScope, setSavedScope] = useState<ScopeRow | null>(null);

  /** Trạng thái UI */
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  /** Map id -> name */
  const levelNameById = useMemo(() => {
    const m = new Map<string, string>();
    levels.forEach((l) => m.set(String(l.id), l.name));
    return m;
  }, [levels]);

  const chainNameById = useMemo(() => {
    const m = new Map<string, string>();
    chains.forEach((c) => m.set(String(c.id), c.name));
    return m;
  }, [chains]);

  /** Tải dữ liệu nền */
  useEffect(() => {
    const load = async () => {
      setStatus('');

      const [pRes, sRes, rRes, lRes, cRes] = await Promise.all([
        // Graders để chọn
        supabase.from('profiles').select('user_id, role, display_name').eq('role', 'grader'),

        // Danh sách trạm
        supabase.from('stations').select('id, name').order('name', { ascending: true }),

        // Đợt thi
        supabase
          .from('exam_rounds_view')
          .select('id, display_name')
          .order('display_name', { ascending: true }),

        // Tên Level/Chain để hiển thị
        supabase.from('levels').select('id, name').order('name', { ascending: true }),
        supabase.from('chains').select('id, name').order('name', { ascending: true }),
      ]);

      if (pRes.error) setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải graders: ' + pRes.error.message);
      else setGraders((pRes.data || []) as Profile[]);

      if (sRes.error) setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải stations: ' + sRes.error.message);
      else setStations((sRes.data || []) as Station[]);

      if (rRes.error) setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải rounds: ' + rRes.error.message);
      else setRounds((rRes.data || []) as ExamRoundView[]);

      if (lRes.error) setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải Level: ' + lRes.error.message);
      else setLevels((lRes.data || []) as Level[]);

      if (cRes.error) setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải Chain: ' + cRes.error.message);
      else setChains((cRes.data || []) as Chain[]);

      // Prefill từ query string
      try {
        const params = new URLSearchParams(window.location.search);
        const qUserId = params.get('user_id');
        if (qUserId) setUserId(qUserId);
      } catch {}
    };

    load();
  }, []);

  /** Khi chọn userId -> lấy scope đã lưu từ station_account_scopes */
  useEffect(() => {
    const loadScope = async () => {
      setSavedScope(null);
      if (!userId) return;

      // Bảng đúng: station_account_scopes
      const { data, error } = await supabase
        .from('station_account_scopes')
        .select('user_id, level_id, chain_id, station_code, station_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (error) {
        setStatus((prev) => (prev ? prev + '\n' : '') + '❌ Lỗi tải scope đã lưu: ' + error.message);
        setSavedScope(null);
        return;
      }

      setSavedScope((data || null) as ScopeRow);

      // Prefill dropdown "Chọn trạm":
      if (data?.station_id) {
        setStationId(String(data.station_id));
      } else if (data?.station_code) {
        const found = stations.find(
          (s) => (s.name || '').trim().toUpperCase() === String(data.station_code).trim().toUpperCase()
        );
        if (found) setStationId(found.id);
      } else {
        setStationId('');
      }
    };

    void loadScope();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stations.length]);

  /** Submit thiết lập scope */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !stationId) {
      alert('Chọn grader và trạm');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/set-station-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          station_id: stationId,
          exam_round_id: examRoundId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        alert('Thiết lập scope lỗi: ' + (j.error || res.statusText));
      } else {
        alert('Thiết lập scope thành công!');
      }
    } finally {
      setLoading(false);
    }
  };

  /** Tên hiển thị thông tin đã lưu */
  const levelName = savedScope?.level_id
    ? levelNameById.get(String(savedScope.level_id)) ?? savedScope.level_id
    : '—';

  const chainName = savedScope?.chain_id
    ? chainNameById.get(String(savedScope.chain_id)) ?? savedScope.chain_id
    : '—';

  const stationDisplay = (() => {
    if (savedScope?.station_code) return savedScope.station_code;
    if (savedScope?.station_id) {
      const s = stations.find((x) => String(x.id) === String(savedScope.station_id));
      return s?.name ?? savedScope.station_id;
    }
    return '—';
  })();

  return (
    <main className="max-w-3xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Thiết lập Scope trạm cho Grader</h1>
          <p className="text-sm text-muted-foreground">
            Hiển thị thông tin đã lưu (Đối tượng, Chuỗi, Trạm) từ <code>station_account_scopes</code> và thiết lập phạm vi chấm.
          </p>
        </div>
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border border-border bg-card hover:border-ring transition"
        >
          ← Về Admin Dashboard
        </Link>
      </div>

      {/* Trạng thái */}
      {status && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm border ${
            status.includes('❌')
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : status.includes('⚠️')
              ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
              : 'bg-card text-card-foreground border-border'
          }`}
        >
          {status}
        </div>
      )}

      {/* Card: Thông tin đã lưu cho tài khoản */}
      <div className="mb-4 rounded-xl border border-border bg-card p-4">
        {!userId ? (
          <p className="text-sm text-muted-foreground">Chọn grader để xem thông tin đã lưu…</p>
        ) : savedScope === null ? (
          <p className="text-sm text-muted-foreground">
            {status ? 'Đang tải / có lỗi ở trên.' : 'Chưa có scope đã lưu cho tài khoản này.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Grader</div>
              <div className="text-sm font-medium">
                {graders.find((g) => g.user_id === userId)?.display_name || userId}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Đối tượng (Level)</div>
              <div className="text-sm font-medium">{levelName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Chuỗi (Chain)</div>
              <div className="text-sm font-medium">{chainName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Trạm (Station)</div>
              <div className="text-sm font-medium">{stationDisplay}</div>
            </div>
          </div>
        )}
      </div>

      {/* Form thiết lập scope */}
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Chọn grader */}
        <div>
          <label className="block text-sm font-medium mb-1">Chọn grader</label>
          <select
            className="w-full px-3 py-2 rounded border border-border bg-card"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">— Chọn —</option>
            {graders.map((g) => (
              <option key={g.user_id} value={g.user_id}>
                {g.display_name || g.user_id}
              </option>
            ))}
          </select>
        </div>

        {/* Chọn trạm & đợt thi */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Chọn trạm</label>
            <select
              className="w-full px-3 py-2 rounded border border-border bg-card"
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
            >
              <option value="">— Chọn —</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Nếu scope đã lưu có <code>station_id</code> hoặc <code>station_code</code> (A–F), dropdown sẽ tự điền.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Chọn đợt thi (tuỳ chọn — để trống nếu scope theo trạm chung)
            </label>
            <select
              className="w-full px-3 py-2 rounded border border-border bg-card"
              value={examRoundId}
              onChange={(e) => setExamRoundId(e.target.value)}
            >
              <option value="">— Không ràng buộc đợt —</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading || !userId}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Đang thiết lập…' : 'Thiết lập Scope'}
          </button>

          <Link
            href="/dashboard/admin/users"
            className="px-4 py-2 rounded-lg border border-border bg-card hover:border-ring transition"
          >
            Xem danh sách
          </Link>
        </div>
      </form>
    </main>
  );
}
