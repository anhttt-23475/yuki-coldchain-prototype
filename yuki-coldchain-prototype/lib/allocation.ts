import { evaluateLot, fefoSort } from '@/lib/rules';
import { check } from '@/lib/api';

// Nạp dữ liệu cần thiết và đánh giá tất cả lô cùng SKU cho 1 đơn hàng
export async function evaluateOrder(supabase: any, orderId: string) {
  const order = check(await supabase.from('orders').select('*, customers(name_ja), skus(*)').eq('order_id', orderId).single()) as any;
  const [lotsR, agrR, histR, logsR] = await Promise.all([
    supabase.from('lots').select('*, locations(temp_band, is_quarantine)').eq('sku_id', order.sku_id),
    supabase.from('agreements').select('*').eq('customer_id', order.customer_id).eq('sku_id', order.sku_id).maybeSingle(),
    supabase.from('shipment_history').select('*').eq('customer_id', order.customer_id).eq('sku_id', order.sku_id)
      .eq('accepted', true).eq('is_return', false).not('expiry_date', 'is', null).order('completed_at', { ascending: false }).limit(1),
    supabase.from('allocation_logs').select('*').eq('order_id', orderId).order('created_at'),
  ]);
  const lots = check(lotsR) as any[];
  const agreement = check(agrR) as any;
  const last = (check(histR) as any[])[0] ?? null;
  const evaluations = fefoSort(lots).map((lot) => ({
    lot,
    ...evaluateLot({
      lot: { ...lot, location_band: lot.locations.temp_band },
      sku: order.skus,
      order,
      agreement,
      lastShipment: last,
    }),
  }));
  const eligible = evaluations.filter((e) => e.eligible);
  const needsReview = evaluations.some((e) => e.needsReview);
  const recommended = needsReview ? null : eligible[0]?.lot.lot_id ?? null;
  return { order, agreement, lastShipment: last, evaluations, recommended, needsReview, logs: check(logsR) };
}
