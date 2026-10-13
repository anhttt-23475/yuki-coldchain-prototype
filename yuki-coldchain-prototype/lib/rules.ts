// Rule engine (thuần TypeScript, không phụ thuộc DB) — để dễ test và review.
// Thứ tự loại trừ theo RFP D3: 消費期限 → 温度帯 → 隔離 → 配送ウィンドウ → 日付逆転 → FEFO/FIFO

export const BUSINESS_DATE = process.env.NEXT_PUBLIC_BUSINESS_DATE || '2026-09-15';

export type Level = 'block' | 'review' | 'warn' | 'ok';
export type Check = { step: number; code: string; label: string; level: Level; detail: string };

const DAY = 86400000;
export function toDate(s: string): Date {
  return new Date(s.slice(0, 10) + 'T00:00:00Z');
}
export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}
export function addDays(s: string, n: number): string {
  return fmt(new Date(toDate(s).getTime() + n * DAY));
}

export const BAND_LABEL: Record<string, string> = { AMBIENT: '常温', CHILLED: '冷蔵', FROZEN: '冷凍' };
export const EXPIRY_LABEL: Record<string, string> = { BEST_BEFORE: '賞味期限', USE_BY: '消費期限' };
export const RULE_LABEL: Record<string, string> = {
  ONE_THIRD: '3分の1ルール',
  ONE_HALF: '2分の1ルール',
  LABEL_DATE_ONLY: 'ラベル日付のみ',
};

// ---------- 配送ウィンドウ (BR-DELWIN-01) — tập quán hợp đồng, KHÔNG phải luật ----------
// Tiền đề (Q-09): tính từ ngày sản xuất, tổng số ngày × tỷ lệ, làm tròn xuống, tính cả ngày hạn.
export function windowDeadline(rule: string | null, production: string, expiry: string): string | null {
  if (!rule) return null;
  if (rule === 'LABEL_DATE_ONLY') return expiry;
  const total = daysBetween(production, expiry);
  const ratio = rule === 'ONE_THIRD' ? 1 / 3 : 1 / 2;
  return addDays(production, Math.floor(total * ratio));
}

export type LotInput = {
  lot_id: string;
  expiry_date: string;
  production_date: string;
  received_at: string;
  qty_available: number;
  status: string;
  location_band: string;
};
export type EvalInput = {
  lot: LotInput;
  sku: { temp_band: string; expiry_type: string };
  order: { qty: number; requested_date: string };
  agreement: { window_rule: string | null; agreement_id: string } | null;
  lastShipment: { expiry_date: string; id: string; completed_at: string } | null;
  businessDate?: string;
};

export function evaluateLot(i: EvalInput) {
  const bd = i.businessDate || BUSINESS_DATE;
  const checks: Check[] = [];
  const { lot, sku, order } = i;

  // 1. 消費期限 (BR-EXP-02) — chặn cứng; 賞味期限 chỉ cảnh báo (BR-EXP-01)
  if (sku.expiry_type === 'USE_BY') {
    if (lot.expiry_date <= bd) {
      checks.push({ step: 1, code: 'USE_BY_REACHED', label: '消費期限 到達/超過', level: 'block', detail: `消費期限 ${lot.expiry_date} ≤ 業務日 ${bd}（例外なしブロック）` });
    } else if (lot.expiry_date < order.requested_date) {
      checks.push({ step: 1, code: 'USE_BY_BEFORE_DELIVERY', label: '納品日に消費期限切れ', level: 'block', detail: `消費期限 ${lot.expiry_date} < 納品要求日 ${order.requested_date}` });
    } else {
      checks.push({ step: 1, code: 'USE_BY_OK', label: '消費期限', level: 'ok', detail: `消費期限 ${lot.expiry_date}` });
    }
  } else {
    const left = daysBetween(bd, lot.expiry_date);
    checks.push(
      left <= 7
        ? { step: 1, code: 'BEST_BEFORE_NEAR', label: '賞味期限 接近', level: 'warn', detail: `賞味期限まで残り${left}日（アラートのみ・ブロックしない）` }
        : { step: 1, code: 'BEST_BEFORE_OK', label: '賞味期限', level: 'ok', detail: `賞味期限 ${lot.expiry_date}` },
    );
  }

  // 2. 温度帯 (BR-TEMP-02)
  checks.push(
    lot.location_band !== sku.temp_band
      ? { step: 2, code: 'BAND_MISMATCH', label: '温度帯の乖離', level: 'block', detail: `SKU温度帯 ${BAND_LABEL[sku.temp_band]} ≠ 保管ロケーション ${BAND_LABEL[lot.location_band]}` }
      : { step: 2, code: 'BAND_OK', label: '温度帯', level: 'ok', detail: BAND_LABEL[sku.temp_band] },
  );

  // 3. 隔離 (FR-INV-05) + 数量
  if (lot.status !== 'available') {
    checks.push({ step: 3, code: 'NOT_AVAILABLE', label: lot.status === 'quarantine' ? '隔離中ロット' : '廃棄済みロット', level: 'block', detail: `ロット状態: ${lot.status}（期限が早くても対象外）` });
  } else if (Number(lot.qty_available) < Number(order.qty)) {
    checks.push({ step: 3, code: 'QTY_SHORT', label: '数量不足', level: 'block', detail: `利用可能 ${lot.qty_available} < 受注 ${order.qty}` });
  } else {
    checks.push({ step: 3, code: 'STATUS_OK', label: '在庫状態', level: 'ok', detail: `利用可能 ${lot.qty_available}` });
  }

  // 4. 配送ウィンドウ (BR-DELWIN-01)
  if (!i.agreement) {
    checks.push({ step: 4, code: 'NO_AGREEMENT', label: '契約なし', level: 'review', detail: '顧客×SKUの契約がありません → business-review' });
  } else if (!i.agreement.window_rule) {
    checks.push({ step: 4, code: 'WINDOW_UNSET', label: '配送ウィンドウ未確定', level: 'review', detail: `${i.agreement.agreement_id}: ルール未確定。ONE_THIRD/ONE_HALFを推論しない → business-review` });
  } else {
    const dl = windowDeadline(i.agreement.window_rule, lot.production_date, lot.expiry_date)!;
    const label = RULE_LABEL[i.agreement.window_rule];
    checks.push(
      order.requested_date > dl
        ? { step: 4, code: 'WINDOW_VIOLATION', label: '配送ウィンドウ違反', level: 'block', detail: `${label}: 納品期限 ${dl} < 納品要求日 ${order.requested_date}（製造 ${lot.production_date}〜期限 ${lot.expiry_date}）` }
        : { step: 4, code: 'WINDOW_OK', label: '配送ウィンドウ', level: 'ok', detail: `${label}: 納品期限 ${dl} ≥ 納品要求日 ${order.requested_date}` },
    );
  }

  // 5. 日付逆転禁止 (BR-DATE-01) — so với lần giao gần nhất của CÙNG khách × SKU, không so với hôm nay
  if (!i.lastShipment) {
    checks.push({ step: 5, code: 'DATE_NO_HISTORY', label: '日付逆転', level: 'ok', detail: '同一顧客×SKUの配送履歴なし（他顧客の履歴は使用しない）' });
  } else if (lot.expiry_date < i.lastShipment.expiry_date) {
    checks.push({ step: 5, code: 'DATE_REVERSAL', label: '日付逆転禁止 違反', level: 'block', detail: `前回受入済み配送 ${i.lastShipment.id}（期限 ${i.lastShipment.expiry_date}）より古い期限 ${lot.expiry_date}` });
  } else {
    checks.push({ step: 5, code: 'DATE_OK', label: '日付逆転', level: 'ok', detail: `前回 ${i.lastShipment.expiry_date} ≤ 今回 ${lot.expiry_date}` });
  }

  const blocked = checks.some((c) => c.level === 'block');
  const review = checks.some((c) => c.level === 'review');
  const firstBlock = checks.find((c) => c.level === 'block');
  return { lot_id: lot.lot_id, eligible: !blocked, needsReview: review, firstBlock: firstBlock?.label ?? null, checks };
}

// 6. FEFO → cùng hạn thì FIFO theo thời điểm nhập (BR-FEFO-01)
export function fefoSort<T extends { expiry_date: string; received_at: string }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.received_at.localeCompare(b.received_at));
}

// ---------- 温度評価 (FR-TEMP-02) ----------
export function evaluateTemp(value: number, policy: { min_c: number | null; max_c: number | null }): 'ok' | 'alarm' {
  if (policy.min_c !== null && policy.min_c !== undefined && value < Number(policy.min_c)) return 'alarm';
  if (policy.max_c !== null && policy.max_c !== undefined && value > Number(policy.max_c)) return 'alarm';
  return 'ok';
}

// ---------- 拘束時間チェック (FR-SCH-02 một phần) ----------
export type Leg = { seq: number; kind: 'drive' | 'service' | 'break'; minutes: number; customer_id?: string | null; note?: string | null };
export type Rule = { version: string; max_continuous_drive_min: number; min_break_min: number; max_daily_restraint_min: number };

function clock(startMin: number) {
  const h = Math.floor(startMin / 60) % 24;
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function checkRoute(startTime: string, legs: Leg[], rule: Rule) {
  const [hh, mm] = startTime.split(':').map(Number);
  let t = hh * 60 + mm;
  const start = t;
  let cont = 0;
  let contStart = t;
  let driveTotal = 0;
  const timeline: any[] = [];
  const violations: { code: string; label: string; from: string; to: string; detail: string }[] = [];
  for (const leg of [...legs].sort((a, b) => a.seq - b.seq)) {
    const from = t;
    t += leg.minutes;
    if (leg.kind === 'drive') {
      if (cont === 0) contStart = from;
      const before = cont;
      cont += leg.minutes;
      driveTotal += leg.minutes;
      if (cont > rule.max_continuous_drive_min && before <= rule.max_continuous_drive_min) {
        const over = contStart + rule.max_continuous_drive_min;
        violations.push({ code: 'CONTINUOUS_DRIVE', label: '連続運転 超過', from: clock(over), to: clock(t), detail: `連続運転 ${Math.floor(cont / 60)}h${cont % 60}m（上限 ${rule.max_continuous_drive_min / 60}h、${rule.min_break_min}分以上の中断なし）` });
      }
    } else if (leg.kind === 'break' && leg.minutes >= rule.min_break_min) {
      cont = 0; // chỉ nghỉ ≥30 phút mới reset; thời gian giao/nhận hàng không tính là nghỉ
    }
    timeline.push({ ...leg, from: clock(from), to: clock(t), continuous_after: leg.kind === 'drive' ? cont : null });
  }
  const restraint = t - start;
  if (restraint > rule.max_daily_restraint_min) {
    violations.push({ code: 'RESTRAINT', label: '1日拘束時間 超過', from: clock(start + rule.max_daily_restraint_min), to: clock(t), detail: `拘束 ${Math.floor(restraint / 60)}h${restraint % 60}m（上限 ${rule.max_daily_restraint_min / 60}h）` });
  }
  return { timeline, violations, restraint_min: restraint, drive_min: driveTotal, end: clock(t), rule_version: rule.version };
}

// "Bây giờ" theo ngày nghiệp vụ demo + giờ thực JST (để tính SLA 15 phút)
export function businessNow(): Date {
  const real = new Date();
  const jst = new Date(real.getTime() + 9 * 3600000);
  const hms = jst.toISOString().slice(11, 19);
  return new Date(`${BUSINESS_DATE}T${hms}+09:00`);
}
