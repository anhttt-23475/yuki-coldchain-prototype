'use client';
import { useCallback, useEffect, useState } from 'react';

export function useApi<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(j.error || `HTTP ${r.status}`);
    else {
      setError('');
      setData(j);
    }
    setLoading(false);
  }, [url]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, loading, reload: load };
}

export async function post(url: string, body: any) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
}

const LEVEL: Record<string, string> = { ok: 'b-ok', block: 'b-block', warn: 'b-warn', review: 'b-review', info: 'b-info', gray: 'b-gray' };
export function Badge({ level, children }: { level: string; children: React.ReactNode }) {
  return <span className={`badge ${LEVEL[level] ?? 'b-info'}`}>{children}</span>;
}

const STATUS: Record<string, [string, string]> = {
  available: ['ok', '利用可能'],
  quarantine: ['block', '隔離中'],
  scrapped: ['gray', '廃棄'],
  created: ['info', '未引当'],
  business_review: ['review', 'business-review'],
  allocated: ['warn', '引当済'],
  shipped: ['ok', '出荷済'],
  open: ['block', '未対応'],
  investigating: ['warn', '調査中'],
  closed: ['gray', 'クローズ'],
  draft: ['info', '下書き'],
  published: ['ok', '公開済'],
  accepted: ['ok', '受入'],
  quarantined: ['block', '隔離'],
  passed: ['ok', '合格'],
  blocked: ['block', 'ブロック'],
};
export function Status({ s }: { s: string }) {
  const [lv, label] = STATUS[s] ?? ['info', s];
  return <Badge level={lv}>{label}</Badge>;
}

export function Loading({ error, loading }: { error?: string; loading?: boolean }) {
  if (error)
    return (
      <div className="msg err">
        {error}
        <br />
        <span className="muted">DB接続エラーの場合: Supabaseプロジェクトが一時停止していないか確認（Resume project） | Nếu lỗi kết nối DB: vào Supabase bấm Resume project</span>
      </div>
    );
  if (loading) return <p className="muted">読み込み中… | Đang tải…</p>;
  return null;
}

export function Msg({ m }: { m: { kind: 'ok' | 'err' | 'info'; text: React.ReactNode } | null }) {
  if (!m) return null;
  return <div className={`msg ${m.kind}`}>{m.text}</div>;
}

export const BAND = { AMBIENT: '常温', CHILLED: '冷蔵', FROZEN: '冷凍' } as Record<string, string>;
export const EXP = { BEST_BEFORE: '賞味期限', USE_BY: '消費期限' } as Record<string, string>;
export function dt(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
}
