import { route, getCtx, check, HttpError } from '@/lib/api';
export const dynamic = 'force-dynamic';

// FR-TEMP-04: action = investigate | quarantine_lots | close (bắt buộc lý do + xử lý; không đóng khi thiếu)
export const POST = route(async (req, p) => {
  const { supabase, actor } = await getCtx();
  const b = await req.json();
  const dev = check(await supabase.from('deviations').select('*').eq('deviation_id', p.id).single()) as any;
  if (dev.status === 'closed') throw new HttpError(409, 'クローズ済みです');

  if (b.action === 'investigate') {
    check(await supabase.from('deviations').update({ status: 'investigating' }).eq('deviation_id', p.id));
    return { ok: true };
  }
  if (b.action === 'quarantine_lots') {
    const lots = check(await supabase.from('lots').select('lot_id, status, skus(temp_band)').in('lot_id', dev.lot_ids)) as any[];
    let n = 0;
    for (const l of lots.filter((x) => x.status === 'available')) {
      const q = check(await supabase.from('locations').select('location_id').eq('temp_band', l.skus.temp_band).eq('is_quarantine', true).limit(1)) as any[];
      check(await supabase.from('lots').update({ status: 'quarantine', location_id: q[0]?.location_id }).eq('lot_id', l.lot_id).eq('status', 'available'));
      check(await supabase.from('lot_events').insert({ lot_id: l.lot_id, event_type: 'quarantined', from_status: 'available', to_status: 'quarantine', reason: `逸脱 ${p.id} により隔離`, actor }));
      n++;
    }
    check(await supabase.from('deviations').update({ status: 'investigating' }).eq('deviation_id', p.id));
    return { quarantined: n };
  }
  if (b.action === 'close') {
    if (!String(b.rationale ?? '').trim() || !b.disposition) throw new HttpError(400, '判定（disposition）と根拠（rationale）がないとクローズできません');
    if (!b.evidence_attached) throw new HttpError(400, '必須添付ファイル（モック）の確認がないとクローズできません');
    check(await supabase.from('deviations').update({ status: 'closed', disposition: b.disposition, rationale: b.rationale, closed_at: new Date().toISOString(), closed_by: actor }).eq('deviation_id', p.id));
    return { ok: true };
  }
  throw new HttpError(400, '不明な操作');
});
