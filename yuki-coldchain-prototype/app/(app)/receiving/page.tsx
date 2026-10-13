'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApi, post, Loading, Msg, Status, BAND, EXP, dt } from '@/components/ui';

const EMPTY = { sku_id: '', supplier_id: '', supplier_lot: '', expiry_type: '', production_date: '', expiry_date: '', qty: '', measured_temp_c: '', packaging_ok: true, photo_taken: false, rice_origin: '', beef_individual_id: '' };

export default function Receiving() {
  const masters = useApi<any>('/api/masters');
  const list = useApi<any[]>('/api/receipts');
  const [f, setF] = useState<any>(EMPTY);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const sku = useMemo(() => masters.data?.skus.find((s: any) => s.sku_id === f.sku_id), [masters.data, f.sku_id]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const E = ({ k }: { k: string }) => (errs[k] ? <div className="err">{errs[k]}</div> : null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    setErrs({});
    const r = await post('/api/receipts', f);
    setBusy(false);
    if (!r.ok) {
      setErrs(r.data.fieldErrors || {});
      setMsg({ kind: 'err', text: r.data.error });
      return;
    }
    const d = r.data;
    setMsg(
      d.result === 'accepted'
        ? { kind: 'ok', text: <>受入OK → ロット <Link href={`/inventory/${d.lot_id}`}>{d.lot_id}</Link> をロケーション {d.location_id} に登録しました</> }
        : { kind: 'err', text: <>⚠ {d.reasons.join(' / ')} → ロット <Link href={`/inventory/${d.lot_id}`}>{d.lot_id}</Link> を自動隔離（{d.location_id}）、逸脱 <Link href="/deviations">{d.deviation_id}</Link> を作成。引当・ピッキング対象外です。</> },
    );
    setF(EMPTY);
    list.reload();
  }

  return (
    <>
      <h1>入荷検品 | Receiving inspection</h1>
      <p className="lead">P0項目は空欄不可。温度帯外・梱包NGは自動隔離（自動リリースなし）。米・牛は法定トレース項目必須。| Hàng sai nhiệt độ tự động cách ly.</p>
      <Loading error={masters.error} loading={masters.loading && !masters.data} />
      {masters.data && (
        <div className="card">
          <h2>検品入力 | Nhập kết quả kiểm hàng</h2>
          <div className="form">
            <div>
              <label>SKU *</label>
              <select value={f.sku_id} onChange={(e) => set('sku_id', e.target.value)}>
                <option value="">選択</option>
                {masters.data.skus.map((s: any) => (
                  <option key={s.sku_id} value={s.sku_id}>{s.sku_id} {s.name_ja}</option>
                ))}
              </select>
              {sku && <div className="muted">温度帯: {BAND[sku.temp_band]} ／ マスター期限種別: {EXP[sku.expiry_type]} ／ lane: {sku.trace_lane}</div>}
              <E k="sku_id" />
            </div>
            <div>
              <label>仕入先 | NCC *</label>
              <select value={f.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
                <option value="">選択</option>
                {masters.data.suppliers.map((s: any) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_id} {s.name_ja}</option>
                ))}
              </select>
              <E k="supplier_id" />
            </div>
            <div><label>仕入先ロット | Lô NCC *</label><input value={f.supplier_lot} onChange={(e) => set('supplier_lot', e.target.value)} /><E k="supplier_lot" /></div>
            <div>
              <label>期限種別（ラベル確認）| Loại hạn *</label>
              <select value={f.expiry_type} onChange={(e) => set('expiry_type', e.target.value)}>
                <option value="">選択</option>
                <option value="BEST_BEFORE">賞味期限（best before）</option>
                <option value="USE_BY">消費期限（use by）</option>
              </select>
              <E k="expiry_type" />
            </div>
            <div><label>製造日 | Ngày SX *</label><input type="date" value={f.production_date} onChange={(e) => set('production_date', e.target.value)} /><E k="production_date" /></div>
            <div><label>期限日 | Ngày hết hạn *</label><input type="date" value={f.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} /><E k="expiry_date" /></div>
            <div><label>数量 | Số lượng *</label><input type="number" value={f.qty} onChange={(e) => set('qty', e.target.value)} /><E k="qty" /></div>
            <div><label>実測温度 °C | Nhiệt độ đo *</label><input type="number" step="0.1" value={f.measured_temp_c} onChange={(e) => set('measured_temp_c', e.target.value)} /><E k="measured_temp_c" /></div>
            {sku?.trace_lane === 'rice' && (<div><label>米の産地 | Xuất xứ gạo *</label><input value={f.rice_origin} onChange={(e) => set('rice_origin', e.target.value)} placeholder="新潟県" /><E k="rice_origin" /></div>)}
            {sku?.trace_lane === 'beef' && (<div><label>牛個体識別番号（10桁）*</label><input value={f.beef_individual_id} onChange={(e) => set('beef_individual_id', e.target.value)} placeholder="1234567890" /><E k="beef_individual_id" /></div>)}
            <div>
              <label>梱包状態 | Bao bì</label>
              <select value={f.packaging_ok ? '1' : '0'} onChange={(e) => set('packaging_ok', e.target.value === '1')}>
                <option value="1">OK</option>
                <option value="0">NG（破損・汚れ）</option>
              </select>
            </div>
            <div>
              <label>写真 | Ảnh *</label>
              <label className="row" style={{ color: 'var(--text)' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={f.photo_taken} onChange={(e) => set('photo_taken', e.target.checked)} /> 撮影済み（モック）
              </label>
              <E k="photo_taken" />
            </div>
          </div>
          <div className="mock">モック: 写真アップロード・バーコードスキャンは未実装（チェックボックス／手入力で代替）。本番はハンディ端末のカメラ・スキャナ連携が必要。</div>
          <Msg m={msg} />
          <button onClick={submit} disabled={busy}>{busy ? '登録中…' : '入荷確定 | Xác nhận nhập'}</button>
        </div>
      )}
      <div className="card">
        <h2>最近の検品記録 | Lịch sử kiểm hàng</h2>
        <Loading error={list.error} loading={list.loading && !list.data} />
        <table>
          <thead><tr><th>日時</th><th>ロット</th><th>SKU</th><th>数量</th><th>実測温度</th><th>結果</th><th>理由</th><th>担当</th></tr></thead>
          <tbody>
            {(list.data || []).map((r: any) => (
              <tr key={r.id}>
                <td>{dt(r.created_at)}</td>
                <td>{r.lot_id ? <Link href={`/inventory/${r.lot_id}`}>{r.lot_id}</Link> : '—'}</td>
                <td>{r.sku_id} {r.skus?.name_ja}</td>
                <td>{r.qty}</td>
                <td>{r.measured_temp_c}°C</td>
                <td><Status s={r.result} /></td>
                <td>{r.reasons || '—'}</td>
                <td>{r.inspector}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
