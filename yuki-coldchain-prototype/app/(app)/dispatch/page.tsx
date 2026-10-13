'use client';
import { useState } from 'react';
import { useApi, post, Loading, Msg, Status, Badge, BAND, dt } from '@/components/ui';

const KIND: Record<string, string> = { drive: '運転', service: '荷役・納品', break: '休憩' };

export default function Dispatch() {
  const { data, error, loading, reload } = useApi<any>('/api/routes');
  const [msg, setMsg] = useState<any>(null);
  async function publish(id: string) {
    const r = await post(`/api/routes/${id}/publish`, {});
    setMsg(r.ok ? { kind: 'ok', text: `${id} を公開しました（ルール版 ${r.data.rule_version} にバインド）` } : { kind: 'err', text: <>{r.data.error}{r.data.violations && <ul>{r.data.violations.map((v: any, i: number) => <li key={i}>{v.label} {v.from}〜{v.to}: {v.detail}</li>)}</ul>}</> });
    reload();
  }
  return (
    <>
      <h1>配車・拘束時間チェック | Routes & driver hours</h1>
      <p className="lead">公開前に拘束時間を判定し、違反があるルートは公開禁止（違反の時間範囲を表示）。荷役時間は休憩に含めません。</p>
      <Loading error={error} loading={loading && !data} />
      <Msg m={msg} />
      {data && (
        <div className="msg info">適用ルール版 {data.rule.version}: 連続運転 ≤ {data.rule.max_continuous_drive_min / 60}h（{data.rule.min_break_min}分以上の休憩でリセット）、1日拘束 ≤ {data.rule.max_daily_restraint_min / 60}h。{data.rule.note}</div>
      )}
      {(data?.routes || []).map((r: any) => (
        <div className="card" key={r.route_id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>{r.route_id} ・ {r.driver_name} ・ {r.vehicle_id}（{BAND[r.vehicle_band]}）</h2>
            <div className="row">
              <Status s={r.status} />
              {r.check.violations.length ? <Badge level="block">違反 {r.check.violations.length}件</Badge> : <Badge level="ok">違反なし</Badge>}
              {r.status === 'draft' && <button onClick={() => publish(r.route_id)}>公開 | Publish</button>}
            </div>
          </div>
          <p className="muted">出発 {r.start_time.slice(0, 5)} → 帰庫 {r.check.end} ／ 拘束 {Math.floor(r.check.restraint_min / 60)}h{r.check.restraint_min % 60}m ／ 運転 {Math.floor(r.check.drive_min / 60)}h{r.check.drive_min % 60}m {r.published_at && `／ 公開 ${dt(r.published_at)}（ルール版 ${r.rule_version}, v${r.version}）`}</p>
          {r.check.violations.map((v: any, i: number) => (
            <div key={i} className="msg err">⛔ {v.label}: {v.from}〜{v.to} — {v.detail}</div>
          ))}
          <table>
            <thead><tr><th>#</th><th>時間帯</th><th>区分</th><th>分</th><th>納品先</th><th>連続運転（累計）</th><th>メモ</th></tr></thead>
            <tbody>
              {r.check.timeline.map((l: any) => (
                <tr key={l.seq}>
                  <td>{l.seq}</td><td>{l.from}〜{l.to}</td><td>{KIND[l.kind]}</td><td>{l.minutes}</td><td>{l.customer_id ?? '—'}</td>
                  <td>{l.continuous_after !== null ? (l.continuous_after > data.rule.max_continuous_drive_min ? <Badge level="block">{l.continuous_after}分</Badge> : `${l.continuous_after}分`) : ''}</td>
                  <td>{l.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="mock">モック: 地図サービス（距離・所要時間）連携、ルート作成のドラッグ&ドロップ、休憩自動挿入、年960h/月284h等の長期集計、予期し得ない事象の記録は未実装。運転時間はデータとして手入力済み。</div>
    </>
  );
}
