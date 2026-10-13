import { createHash } from 'crypto';
import { route, getCtx, check, HttpError } from '@/lib/api';
import { evaluateTemp, BAND_LABEL } from '@/lib/rules';
export const dynamic = 'force-dynamic';

// FR-TEMP-01/02: import CSV logger (mô phỏng upload file), SHA-256 → idempotent, lỗi có số dòng
export const POST = route(async (req) => {
  const { supabase, actor } = await getCtx();
  const { csv } = await req.json();
  if (!csv || !String(csv).trim()) throw new HttpError(400, 'CSVが空です');
  const hash = createHash('sha256').update(String(csv)).digest('hex');
  const dup = check(await supabase.from('import_batches').select('*').eq('file_hash', hash).maybeSingle()) as any;
  if (dup) return { duplicate: true, message: `同じファイル（SHA-256一致）は取込済みです（batch ${dup.id}）。二重登録しません`, batch: dup };

  const locs = check(await supabase.from('locations').select('zone, temp_band')) as any[];
  const zoneBand: Record<string, string> = {};
  locs.forEach((l) => (zoneBand[l.zone] = l.temp_band));
  const policies = check(await supabase.from('temp_policies').select('*')) as any[];
  const lines = String(csv).trim().split(/\r?\n/);
  const header = lines[0].replace(/\s/g, '').toLowerCase();
  if (header !== 'device_id,zone,read_at,value_c') throw new HttpError(400, 'ヘッダーは device_id,zone,read_at,value_c である必要があります（1行目）');
  const rows: any[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, idx) => {
    const n = idx + 2;
    const [device_id, zone, read_at, value] = line.split(',').map((s) => s?.trim());
    const v = Number(value);
    if (!device_id || !zone || !read_at || value === undefined || value === '') return errors.push(`${n}行目: 項目不足`);
    if (!zoneBand[zone]) return errors.push(`${n}行目: 不明なゾーン ${zone}`);
    if (Number.isNaN(v)) return errors.push(`${n}行目: 温度が数値ではありません`);
    const d = new Date(read_at.includes('+') || read_at.endsWith('Z') ? read_at : read_at + '+09:00');
    if (Number.isNaN(d.getTime())) return errors.push(`${n}行目: 日時形式エラー`);
    const band = zoneBand[zone];
    const policy = policies.find((p) => p.band === band);
    rows.push({ device_id, zone, band, read_at: d.toISOString(), value_c: v, evaluation: evaluateTemp(v, policy), policy_version: policy.version });
  });
  const batch = check(await supabase.from('import_batches').insert({ file_hash: hash, row_count: rows.length, error_count: errors.length, imported_by: actor }).select().single()) as any;
  let inserted: any[] = [];
  if (rows.length) {
    inserted = check(await supabase.from('temperature_readings').upsert(rows.map((r) => ({ ...r, batch_id: batch.id })), { onConflict: 'device_id,read_at', ignoreDuplicates: true }).select()) as any[];
  }
  // Mỗi báo động tạo 1 ca sai lệch, liệt kê lô bị ảnh hưởng trong zone (cách ly bằng nút trên màn hình sai lệch)
  const alarms = inserted.filter((r) => r.evaluation === 'alarm');
  for (const a of alarms) {
    const lots = check(await supabase.from('lots').select('lot_id, locations!inner(zone)').eq('status', 'available').eq('locations.zone', a.zone)) as any[];
    const devId = check(await supabase.rpc('next_id', { p_kind: 'deviation' })) as string;
    check(await supabase.from('deviations').insert({
      deviation_id: devId, source: 'TEMPERATURE', reading_id: a.id, lot_ids: lots.map((l) => l.lot_id),
      description: `${a.device_id} ${a.value_c}°C（${BAND_LABEL[a.band]} ポリシー外）`,
    }));
  }
  return { duplicate: false, batch_id: batch.id, imported: inserted.length, alarms: alarms.length, errors };
});
