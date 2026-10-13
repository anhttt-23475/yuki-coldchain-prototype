'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, Badge, BAND, EXP, dt } from '@/components/ui';
import { RULE_LABEL } from '@/lib/rules';

export default function OrderDetail({ params }: { params: { orderId: string } }) {
  const { data, error, loading, reload } = useApi<any>(`/api/orders/${params.orderId}`);
  const [msg, setMsg] = useState<any>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function allocate(lotId?: string) {
    setBusy(true);
    const r = await post(`/api/orders/${params.orderId}/allocate`, { lotId, reviewReason: reviewReason || undefined });
    setBusy(false);
    setMsg(r.ok ? { kind: 'ok', text: <>ロット <b>{r.data.allocated_lot_id}</b> を引当てました → <Link href="/shipping">出荷前チェックへ</Link></> } : { kind: 'err', text: r.data.error });
    reload();
  }

  const o = data?.order;
  const done = o && ['allocated', 'shipped'].includes(o.status);
  return (
    <>
      <p><Link href="/orders">← 受注一覧</Link></p>
      <h1>引当判定 | Phân bổ lô — {params.orderId}</h1>
      <Loading error={error} loading={loading && !data} />
      {o && (
        <>
          <div className="card">
            <div className="form">
              <div><label>顧客</label>{o.customer_id} {o.customers.name_ja}</div>
              <div><label>SKU</label>{o.sku_id} {o.skus.name_ja}（{BAND[o.skus.temp_band]}・{EXP[o.skus.expiry_type]}）</div>
              <div><label>数量 / 納品要求日</label>{o.qty} / {o.requested_date}</div>
              <div><label>状態</label><Status s={o.status} /> {o.allocated_lot_id && `→ ${o.allocated_lot_id}`}</div>
              <div><label>契約 / 配送ウィンドウ</label>{data.agreement ? `${data.agreement.agreement_id}（${data.agreement.delivery_term}）: ${data.agreement.window_rule ? RULE_LABEL[data.agreement.window_rule] : '未確定'}` : '契約なし'}</div>
              <div><label>前回受入済み配送（同一顧客×SKU）</label>{data.lastShipment ? `${data.lastShipment.id}: 期限 ${data.lastShipment.expiry_date}` : 'なし（他顧客の履歴は使わない）'}</div>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>※ 1/3・1/2ルールは契約上の商慣行であり法定要件ではありません。返品行（負数量）は日付逆転の比較対象外。</p>
          </div>

          <div className="card">
            <h2>候補ロットの評価（FEFO順）| Đánh giá lô ứng viên</h2>
            <table>
              <thead><tr><th>ロット</th><th>期限</th><th>製造日</th><th>入荷</th><th>利用可能</th><th>①消費/賞味</th><th>②温度帯</th><th>③状態</th><th>④ウィンドウ</th><th>⑤日付逆転</th><th>判定</th></tr></thead>
              <tbody>
                {data.evaluations.map((e: any) => (
                  <tr key={e.lot_id} style={{ background: data.recommended === e.lot_id ? '#eef8f1' : undefined }}>
                    <td><Link href={`/inventory/${e.lot_id}`}>{e.lot_id}</Link></td>
                    <td>{e.lot.expiry_date}</td>
                    <td>{e.lot.production_date}</td>
                    <td>{dt(e.lot.received_at).slice(0, 10)}</td>
                    <td>{e.lot.qty_available}</td>
                    {e.checks.map((c: any) => (
                      <td key={c.step} title={c.detail}>
                        <Badge level={c.level}>{c.label}</Badge>
                        <div className="muted" style={{ maxWidth: 190 }}>{c.level !== 'ok' ? c.detail : ''}</div>
                      </td>
                    ))}
                    <td>
                      {e.eligible ? (data.recommended === e.lot_id ? <Badge level="ok">推奨（FEFO 1位）</Badge> : <Badge level="ok">引当可</Badge>) : <Badge level="block">除外: {e.firstBlock}</Badge>}
                      {!done && e.eligible && (data.needsReview ? reviewReason.trim() : true) && (
                        <div style={{ marginTop: 6 }}><button className="secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={() => allocate(e.lot_id)}>このロットで引当</button></div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!done && (
            <div className="card">
              <h2>引当実行 | Thực hiện phân bổ</h2>
              {data.needsReview ? (
                <>
                  <div className="msg info">配送ウィンドウルールが未確定（または契約なし）のため自動引当しません（business-review）。業務担当が確認した理由を入力すると、ロットを選んで手動引当できます。</div>
                  <label>業務確認の理由 *</label>
                  <textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} placeholder="例: CUS-005 営業担当に確認、今回はラベル日付のみで可（2026-09-15 電話）" />
                  <div style={{ marginTop: 8 }}><button disabled={busy} onClick={() => allocate()}>{reviewReason.trim() ? '確認済みとして引当（FEFO先頭）' : 'business-review として保留'}</button></div>
                </>
              ) : data.recommended ? (
                <button disabled={busy} onClick={() => allocate()}>推奨ロット {data.recommended} で引当 | Phân bổ</button>
              ) : (
                <div className="msg err">引当可能なロットがありません（全ロット除外）。</div>
              )}
              <p className="muted">引当はサーバー側で再評価し、DB関数で原子的に在庫を減算（同時実行でも過剰引当しない）。</p>
            </div>
          )}
          <Msg m={msg} />

          <div className="card">
            <h2>判定ログ | Log</h2>
            {data.logs.length === 0 ? <p className="muted">なし</p> : (
              <table><thead><tr><th>日時</th><th>判定</th><th>ロット</th><th>実施者</th><th>業務確認理由</th></tr></thead>
                <tbody>{data.logs.map((g: any) => (<tr key={g.id}><td>{dt(g.created_at)}</td><td>{g.decision}</td><td>{g.lot_id ?? '—'}</td><td>{g.actor}</td><td>{g.detail?.reviewReason ?? g.detail?.reason ?? '—'}</td></tr>))}</tbody></table>
            )}
          </div>
        </>
      )}
    </>
  );
}
