import { route, getCtx, check, HttpError } from '@/lib/api';
import { evaluateTemp, BAND_LABEL } from '@/lib/rules';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  return check(await supabase.from('receipts').select('*, skus(name_ja)').order('created_at', { ascending: false }).limit(30));
});

// 入荷検品 (FR-REC-02/04/05, BR-TEMP-02, BR-TRACE-01/02)
export const POST = route(async (req) => {
  const { supabase, actor } = await getCtx();
  const b = await req.json();
  const fieldErrors: Record<string, string> = {};
  const req_ = (k: string, label: string) => {
    if (b[k] === undefined || b[k] === null || String(b[k]).trim() === '') fieldErrors[k] = `${label} は必須です`;
  };
  req_('sku_id', 'SKU');
  req_('supplier_id', '仕入先');
  req_('supplier_lot', '仕入先ロット');
  req_('expiry_type', '期限種別');
  req_('production_date', '製造日');
  req_('expiry_date', '期限日');
  req_('qty', '数量');
  req_('measured_temp_c', '実測温度');
  if (!b.photo_taken) fieldErrors.photo_taken = '写真（モック）の確認が必要です';
  if (Object.keys(fieldErrors).length) throw new HttpError(400, '必須項目が不足しています（入荷確認ブロック）', { fieldErrors });

  const sku = check(await supabase.from('skus').select('*').eq('sku_id', b.sku_id).single()) as any;
  const policy = check(await supabase.from('temp_policies').select('*').eq('band', sku.temp_band).single()) as any;
  if (b.expiry_type !== sku.expiry_type)
    fieldErrors.expiry_type = `期限種別がSKUマスター（${sku.expiry_type === 'USE_BY' ? '消費期限' : '賞味期限'}）と一致しません`;
  if (b.expiry_date <= b.production_date) fieldErrors.expiry_date = '期限日は製造日より後である必要があります';
  if (Number(b.qty) <= 0) fieldErrors.qty = '数量は1以上';
  if (sku.trace_lane === 'beef' && !/^\d{10}$/.test(String(b.beef_individual_id ?? '')))
    fieldErrors.beef_individual_id = '牛個体識別番号は10桁の数字が必須です（自動補正しません）';
  if (sku.trace_lane === 'rice' && !String(b.rice_origin ?? '').trim()) fieldErrors.rice_origin = '米の産地情報は必須です';
  if (Object.keys(fieldErrors).length) throw new HttpError(400, '入力内容に誤りがあります（入荷確認ブロック）', { fieldErrors });

  const temp = Number(b.measured_temp_c);
  const reasons: string[] = [];
  if (evaluateTemp(temp, policy) === 'alarm')
    reasons.push(`実測温度 ${temp}°C は ${BAND_LABEL[sku.temp_band]}（${policy.min_c ?? ''}〜${policy.max_c}°C）の範囲外`);
  if (!b.packaging_ok) reasons.push('梱包状態 NG');
  const quarantined = reasons.length > 0;

  const locs = check(await supabase.from('locations').select('*').eq('temp_band', sku.temp_band).eq('is_quarantine', quarantined).order('location_id')) as any[];
  if (!locs.length) throw new HttpError(500, 'ロケーションが見つかりません');
  const lotId = check(await supabase.rpc('next_id', { p_kind: 'lot' })) as string;

  check(await supabase.from('lots').insert({
    lot_id: lotId, sku_id: sku.sku_id, supplier_id: b.supplier_id, supplier_lot: b.supplier_lot,
    production_date: b.production_date, expiry_date: b.expiry_date, received_at: new Date().toISOString(),
    qty_received: Number(b.qty), qty_available: Number(b.qty), location_id: locs[0].location_id,
    status: quarantined ? 'quarantine' : 'available',
    rice_origin: sku.trace_lane === 'rice' ? b.rice_origin : null,
    beef_individual_id: sku.trace_lane === 'beef' ? b.beef_individual_id : null,
  }));
  check(await supabase.from('receipts').insert({
    lot_id: lotId, sku_id: sku.sku_id, supplier_id: b.supplier_id, qty: Number(b.qty), measured_temp_c: temp,
    packaging_ok: !!b.packaging_ok, result: quarantined ? 'quarantined' : 'accepted', reasons: reasons.join(' / ') || null, inspector: actor,
  }));
  check(await supabase.from('lot_events').insert({
    lot_id: lotId, event_type: 'received', to_status: quarantined ? 'quarantine' : 'available',
    reason: quarantined ? reasons.join(' / ') + ' → 自動隔離' : '入荷検品OK', actor,
  }));
  let deviationId: string | null = null;
  if (quarantined) {
    deviationId = check(await supabase.rpc('next_id', { p_kind: 'deviation' })) as string;
    check(await supabase.from('deviations').insert({
      deviation_id: deviationId, source: 'RECEIVING', lot_ids: [lotId], description: `入荷検品: ${sku.sku_id} ${reasons.join(' / ')} → 自動隔離`,
    }));
  }
  return { lot_id: lotId, location_id: locs[0].location_id, result: quarantined ? 'quarantined' : 'accepted', reasons, deviation_id: deviationId };
});
