import { route, getCtx, check, HttpError } from '@/lib/api';
export const dynamic = 'force-dynamic';

// FR-INV-05: chỉ cho phép chuyển trạng thái hợp lệ, không xoá cứng, lưu lịch sử bất biến
const ALLOWED: Record<string, string[]> = {
  available: ['quarantine'],
  quarantine: ['available', 'scrapped'],
  scrapped: [],
};

export const POST = route(async (req, p) => {
  const { supabase, actor } = await getCtx();
  const { to, reason } = await req.json();
  if (!reason || !String(reason).trim()) throw new HttpError(400, '理由（根拠）は必須です');
  const lot = check(await supabase.from('lots').select('*, skus(temp_band)').eq('lot_id', p.id).single()) as any;
  if (!ALLOWED[lot.status]?.includes(to))
    throw new HttpError(422, `不正な状態遷移です: ${lot.status} → ${to}（例: 隔離を経由しない廃棄は不可）`);
  const band = lot.skus.temp_band;
  const locs = check(await supabase.from('locations').select('*').eq('temp_band', band).eq('is_quarantine', to === 'quarantine').order('location_id')) as any[];
  const patch: any = { status: to };
  if (to !== 'scrapped' && locs.length) patch.location_id = locs[0].location_id;
  if (to === 'scrapped') patch.qty_available = 0;
  const upd = await supabase.from('lots').update(patch).eq('lot_id', p.id).eq('status', lot.status).select();
  if (check(upd).length === 0) throw new HttpError(409, '他のユーザーが先に更新しました。再読み込みしてください');
  check(await supabase.from('lot_events').insert({
    lot_id: p.id, event_type: to === 'available' ? 'released' : to === 'scrapped' ? 'scrapped' : 'quarantined',
    from_status: lot.status, to_status: to, reason, actor,
  }));
  return { ok: true };
});
