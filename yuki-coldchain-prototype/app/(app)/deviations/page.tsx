'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, dt } from '@/components/ui';

function CloseForm({ d, onDone }: { d: any; onDone: () => void }) {
  const [f, setF] = useState<any>({ disposition: '', rationale: '', evidence_attached: false });
  const [msg, setMsg] = useState<any>(null);
  async function close() {
    const r = await post(`/api/deviations/${d.deviation_id}`, { action: 'close', ...f });
    setMsg(r.ok ? { kind: 'ok', text: 'クローズしました' } : { kind: 'err', text: r.data.error });
    if (r.ok) onDone();
  }
  return (
    <div className="form" style={{ marginTop: 8 }}>
      <div><label>判定（disposition）*</label><select value={f.disposition} onChange={(e) => setF({ ...f, disposition: e.target.value })}><option value="">選択</option><option value="release">解除（使用可）</option><option value="scrap">廃棄</option><option value="continue">隔離継続</option></select></div>
      <div style={{ gridColumn: 'span 2' }}><label>根拠（rationale）*</label><input value={f.rationale} onChange={(e) => setF({ ...f, rationale: e.target.value })} placeholder="例: 再測定で温度帯内、扉開放時間3分（ログ確認）" /></div>
      <div><label>必須添付</label><label className="row" style={{ color: 'var(--text)' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.evidence_attached} onChange={(e) => setF({ ...f, evidence_attached: e.target.checked })} />添付済み（モック）</label></div>
      <div><label>&nbsp;</label><button onClick={close}>クローズ</button></div>
      <div style={{ gridColumn: '1/-1' }}><Msg m={msg} /></div>
    </div>
  );
}

export default function Deviations() {
  const { data, error, loading, reload } = useApi<any[]>('/api/deviations');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<any>(null);
  async function quarantine(id: string) {
    const r = await post(`/api/deviations/${id}`, { action: 'quarantine_lots' });
    setMsg(r.ok ? { kind: 'ok', text: `${r.data.quarantined} ロットを隔離しました` } : { kind: 'err', text: r.data.error });
    reload();
  }
  return (
    <>
      <h1>逸脱ケース | Deviation cases</h1>
      <p className="lead">アラーム → 調査 → 是正 → 判定 → クローズ。根拠・必須添付がないケースはクローズ不可。品質の判定は人が行います。</p>
      <Loading error={error} loading={loading && !data} />
      <Msg m={msg} />
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>発生元</th><th>内容</th><th>関連ロット</th><th>状態</th><th>発生</th><th>判定・根拠</th><th></th></tr></thead>
          <tbody>
            {(data || []).map((d: any) => (
              <Fragment key={d.deviation_id}>
                <tr>
                  <td>{d.deviation_id}</td><td>{d.source}</td><td>{d.description}</td>
                  <td>{d.lot_ids.map((l: string) => <div key={l}><Link href={`/inventory/${l}`}>{l}</Link></div>)}</td>
                  <td><Status s={d.status} /></td><td>{dt(d.created_at)}</td>
                  <td>{d.status === 'closed' ? `${d.disposition}: ${d.rationale}（${d.closed_by}）` : '—'}</td>
                  <td>
                    {d.status !== 'closed' && (
                      <div className="row">
                        {d.lot_ids.length > 0 && <button className="danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => quarantine(d.deviation_id)}>関連ロット隔離</button>}
                        <button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(open === d.deviation_id ? null : d.deviation_id)}>判定・クローズ</button>
                      </div>
                    )}
                  </td>
                </tr>
                {open === d.deviation_id && <tr key={d.deviation_id + 'f'}><td colSpan={8}><CloseForm d={d} onDone={() => { setOpen(null); setMsg({ kind: 'ok', text: 'クローズしました（判定・根拠を記録）' }); reload(); }} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
        <div className="mock">簡略化: 温度アラーム時の関連ロット隔離はボタン操作で実行（RFPでは自動隔離）。重大度別の承認ロール・是正措置タスク・添付ファイル保存は未実装（質問Q-07）。</div>
      </div>
    </>
  );
}
