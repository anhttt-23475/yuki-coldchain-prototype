// Kiểm tra rule engine bằng fixture RFP (chạy: npm run test:rules)
import { evaluateLot, windowDeadline, checkRoute } from '../lib/rules.ts';
let fail = 0;
const ok = (name: string, cond: boolean) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fail++; };
const base = { production_date: '2026-09-12', received_at: '2026-09-13T07:00', qty_available: 50, status: 'available', location_band: 'CHILLED' };
const chi002 = { temp_band: 'CHILLED', expiry_type: 'BEST_BEFORE' };
const agr7 = { agreement_id: 'AGR-007', window_rule: 'ONE_HALF' };
const last = { id: 'SH-0001', expiry_date: '2026-09-20', completed_at: '2026-09-12' };
// CUS-003 / CHI-002: lô hạn 09-18 bị chặn vì 日付逆転 dù còn xa hạn so với hôm nay
let r = evaluateLot({ lot: { ...base, lot_id: 'L-0007', expiry_date: '2026-09-18' }, sku: chi002, order: { qty: 10, requested_date: '2026-09-15' }, agreement: agr7, lastShipment: last });
ok('date reversal blocks L-0007', !r.eligible && r.firstBlock === '日付逆転禁止 違反');
// CUS-004 không có lịch sử → không mượn lịch sử CUS-003
r = evaluateLot({ lot: { ...base, lot_id: 'L-0007', expiry_date: '2026-09-18' }, sku: chi002, order: { qty: 10, requested_date: '2026-09-15' }, agreement: agr7, lastShipment: null });
ok('no history → pass', r.eligible);
// 消費期限 = ngày nghiệp vụ → chặn
r = evaluateLot({ lot: { ...base, lot_id: 'L-0009', expiry_date: '2026-09-15', production_date: '2026-09-10' }, sku: { temp_band: 'CHILLED', expiry_type: 'USE_BY' }, order: { qty: 10, requested_date: '2026-09-15' }, agreement: { agreement_id: 'AGR-005', window_rule: 'ONE_HALF' }, lastShipment: null, businessDate: '2026-09-15' });
ok('use-by reached blocks', !r.eligible && r.checks[0].code === 'USE_BY_REACHED');
// 賞味期限 gần hạn → chỉ cảnh báo
r = evaluateLot({ lot: { ...base, lot_id: 'X', expiry_date: '2026-09-18' }, sku: chi002, order: { qty: 1, requested_date: '2026-09-15' }, agreement: agr7, lastShipment: null, businessDate: '2026-09-15' });
ok('best-before near only warns', r.eligible && r.checks[0].level === 'warn');
// Rule chưa chốt → review, không tự gán
r = evaluateLot({ lot: { ...base, lot_id: 'X', expiry_date: '2026-09-25' }, sku: chi002, order: { qty: 1, requested_date: '2026-09-16' }, agreement: { agreement_id: 'AGR-014', window_rule: null }, lastShipment: null });
ok('unset window → review', r.needsReview);
ok('1/2 deadline', windowDeadline('ONE_HALF', '2026-09-12', '2026-09-19') === '2026-09-15');
ok('1/3 deadline', windowDeadline('ONE_THIRD', '2026-09-01', '2026-09-31'.replace('31', '30')) === '2026-09-10');
// Quarantine lot excluded
r = evaluateLot({ lot: { ...base, lot_id: 'L-0012', expiry_date: '2026-09-22', status: 'quarantine' }, sku: chi002, order: { qty: 1, requested_date: '2026-09-15' }, agreement: agr7, lastShipment: null });
ok('quarantine excluded', !r.eligible);
const rule = { version: 'v', max_continuous_drive_min: 240, min_break_min: 30, max_daily_restraint_min: 780 };
const rt2 = checkRoute('05:30', [{ seq: 1, kind: 'service', minutes: 30 }, { seq: 2, kind: 'drive', minutes: 120 }, { seq: 3, kind: 'service', minutes: 10 }, { seq: 4, kind: 'drive', minutes: 90 }, { seq: 5, kind: 'service', minutes: 10 }, { seq: 6, kind: 'drive', minutes: 60 }], rule);
ok('RT-002 continuous drive violation', rt2.violations.length === 1 && rt2.violations[0].code === 'CONTINUOUS_DRIVE');
const rt1 = checkRoute('06:00', [{ seq: 1, kind: 'drive', minutes: 150 }, { seq: 2, kind: 'break', minutes: 30 }, { seq: 3, kind: 'drive', minutes: 200 }], rule);
ok('break resets continuous', rt1.violations.length === 0);
process.exit(fail ? 1 : 0);
