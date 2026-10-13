import { route, getCtx, check, HttpError } from '@/lib/api';
export const dynamic = 'force-dynamic';

// FR-TRC-01: tra theo lô / lô NCC / mã cá thể bò / xuất xứ gạo / SKU; chỉ rõ điểm liên kết bị đứt
export const GET = route(async (req) => {
  const { supabase } = await getCtx();
  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!q) throw new HttpError(400, '検索キーを入力してください');
  const safe = q.replace(/[%,()]/g, '');
  const lots = check(await supabase.from('lots').select('*, skus(name_ja, trace_lane), suppliers(name_ja), locations(location_id)')
    .or(`lot_id.ilike.%${safe}%,supplier_lot.ilike.%${safe}%,beef_individual_id.eq.${safe},rice_origin.ilike.%${safe}%,sku_id.eq.${safe}`)) as any[];
  const lotIds = lots.map((l) => l.lot_id);
  const [ships, receipts, legacy] = await Promise.all([
    lotIds.length ? supabase.from('shipment_history').select('*, customers(name_ja)').in('lot_id', lotIds) : Promise.resolve({ data: [], error: null }),
    lotIds.length ? supabase.from('receipts').select('*').in('lot_id', lotIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('shipment_history').select('*, customers(name_ja)').ilike('lot_id', `%${safe}%`),
  ]);
  const legacyRows = (check(legacy) as any[]).filter((s) => !lotIds.includes(s.lot_id));
  return {
    lots: lots.map((l) => ({
      ...l,
      receipts: (check(receipts) as any[]).filter((r) => r.lot_id === l.lot_id),
      shipments: (check(ships) as any[]).filter((s) => s.lot_id === l.lot_id),
    })),
    brokenLinks: legacyRows.map((s) => ({ ...s, note: '出荷履歴はあるが、ロット・仕入先データが本システムに存在しない（上流リンク終端）' })),
  };
});
