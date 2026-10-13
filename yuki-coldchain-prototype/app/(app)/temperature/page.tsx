'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Badge, BAND, dt } from '@/components/ui';

const SAMPLE = `device_id,zone,read_at,value_c
DL-C01,C,2026-09-15T10:00,3.9
DL-C01,C,2026-09-15T10:15,6.8
DL-F01,F,2026-09-15T10:00,-19.2
DL-A01,A,2026-09-15T10:00,abc`;

export default function Temperature() {
  const { data, error, loading, reload } = useApi<any>('/api/temperature');
  const [csv, setCsv] = useState(SAMPLE);
  const [msg, setMsg] = useState<any>(null);
  const now = data ? new Date(data.now).getTime() : Date.now();

  async function importCsv() {
    const r = await post('/api/temperature/import', { csv });
    if (!r.ok) return setMsg({ kind: 'err', text: r.data.error });
    if (r.data.duplicate) return setMsg({ kind: 'info', text: r.data.message });
    setMsg({ kind: r.data.alarms ? 'err' : 'ok', text: <>取込 {r.data.imported} 件、アラーム {r.data.alarms} 件{r.data.alarms ? <>（<Link href="/deviations">逸脱を作成</Link>）</> : ''}{r.data.errors.length > 0 && <ul>{r.data.errors.map((e: string) => <li key={e}>{e}</li>)}</ul>}</> });
    reload();
  }
  async function review(id: number) {
    const r = await post(`/api/temperature/${id}/review`, {});
    if (!r.ok) setMsg({ kind: 'err', text: r.data.error });
    reload();
  }
  function sla(r: any) {
    if (r.evaluation !== 'alarm') return null;
    const due = new Date(r.read_at).getTime() + 15 * 60000;
    if (r.reviewed_at) return new Date(r.reviewed_at).getTime() > due ? <Badge level="block">SLA超過でレビュー</Badge> : <Badge level="ok">15分以内レビュー</Badge>;
    const left = Math.round((due - now) / 60000);
    return left >= 0 ? <Badge level="warn">残り{left}分</Badge> : <Badge level="block">SLA超過（{-left}分）</Badge>;
  }
  const rows = data?.readings || [];
  const alarms = rows.filter((r: any) => r.evaluation === 'alarm');
  return (
    <>
      <h1>温度アラーム | Temperature alarms</h1>
      <p className="lead">ロガーCSVを取込み、温度帯ポリシー（TEMP-2026.1: 常温15–25 / 冷蔵0–5 / 冷凍≤-18°C）で評価。アラームは15分以内にレビュー。</p>
      <Loading error={error} loading={loading && !data} />
      <div className="card">
        <h2>未確認・最近のアラーム | Báo động</h2>
        <table>
          <thead><tr><th>計測日時</th><th>機器</th><th>ゾーン</th><th>値</th><th>SLA（15分）</th><th>レビュー</th><th></th></tr></thead>
          <tbody>
            {alarms.map((r: any) => (
              <tr key={r.id}>
                <td>{dt(r.read_at)}</td><td>{r.device_id}</td><td>{r.zone}（{BAND[r.band]}）</td><td><b style={{ color: 'var(--red)' }}>{r.value_c}°C</b></td>
                <td>{sla(r)}</td><td>{r.reviewed_at ? `${dt(r.reviewed_at)} ${r.reviewed_by}` : '—'}</td>
                <td>{!r.reviewed_at && <button className="secondary" onClick={() => review(r.id)}>確認（レビュー）</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">SLAの「現在時刻」はデモ業務日 + 実時刻(JST)で計算。</p>
      </div>
      <div className="card">
        <h2>ロガーCSV取込 | Import CSV logger</h2>
        <p className="muted">同じ内容（SHA-256一致）は二重取込しません。形式エラー行は行番号付きで拒否。</p>
        <textarea style={{ minHeight: 130, fontFamily: 'monospace' }} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div style={{ marginTop: 8 }}><button onClick={importCsv}>取込 | Import</button></div>
        <Msg m={msg} />
        <div className="mock">モック: 実ファイルのアップロード（IF-LOG-01 管理されたupload）ではなく、CSVテキスト貼付けで代替。ロガー本体とのオンライン連携は基本スコープ外。</div>
      </div>
      <div className="card">
        <h2>全計測値（最新100件）| Tất cả số đo</h2>
        <table><thead><tr><th>日時</th><th>機器</th><th>ゾーン</th><th>値</th><th>評価</th><th>版</th></tr></thead>
          <tbody>{rows.map((r: any) => (<tr key={r.id}><td>{dt(r.read_at)}</td><td>{r.device_id}</td><td>{r.zone}</td><td>{r.value_c}°C</td><td>{r.evaluation === 'alarm' ? <Badge level="block">alarm</Badge> : <Badge level="ok">ok</Badge>}</td><td>{r.policy_version}</td></tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
