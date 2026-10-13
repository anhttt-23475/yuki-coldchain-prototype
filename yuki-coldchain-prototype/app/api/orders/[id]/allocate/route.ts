import { route, getCtx, check, HttpError } from '@/lib/api';
import { evaluateOrder } from '@/lib/allocation';
export const dynamic = 'force-dynamic';

// Phân bổ: luôn đánh giá lại ở server (không tin dữ liệu client), rồi gọi hàm SQL atomic allocate_lot
export const POST = route(async (req, p) => {
  const { supabase, actor } = await getCtx();
  const b = await req.json().catch(() => ({}));
  const ev = await evaluateOrder(supabase, p.id);
  if (['allocated', 'shipped'].includes(ev.order.status)) throw new HttpError(409, 'この受注は引当済みです');

  if (ev.needsReview && !b.reviewReason) {
    check(await supabase.from('orders').update({ status: 'business_review' }).eq('order_id', p.id));
    check(await supabase.from('allocation_logs').insert({ order_id: p.id, decision: 'business_review', detail: { reason: '配送ウィンドウ未確定または契約なし' }, actor }));
    throw new HttpError(422, '配送ウィンドウルールが未確定のため business-review で保留しました。業務確認の理由を入力すると手動引当できます', { status: 'business_review' });
  }
  const lotId = b.lotId || ev.recommended || (ev.needsReview ? ev.evaluations.find((e) => e.eligible)?.lot.lot_id : null);
  const target = ev.evaluations.find((e) => e.lot.lot_id === lotId);
  if (!target) throw new HttpError(422, '引当可能なロットがありません');
  if (!target.eligible) throw new HttpError(422, `ロット ${lotId} は引当不可: ${target.firstBlock}`);

  const detail = { checks: target.checks, reviewReason: b.reviewReason ?? null, fefoRank: ev.evaluations.filter((e) => e.eligible).findIndex((e) => e.lot.lot_id === lotId) + 1 };
  const r = await supabase.rpc('allocate_lot', { p_order_id: p.id, p_lot_id: lotId, p_actor: actor, p_detail: detail });
  if (r.error) {
    const msg = r.error.message.includes('LOT_NOT_AVAILABLE') ? '他の受注が先に引当てたため在庫不足です（過剰引当を防止）。再評価してください' : r.error.message;
    throw new HttpError(409, msg);
  }
  return { allocated_lot_id: lotId };
});
