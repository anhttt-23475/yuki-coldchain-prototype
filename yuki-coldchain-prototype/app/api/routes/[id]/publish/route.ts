import { route, getCtx, check, HttpError } from '@/lib/api';
import { checkRoute } from '@/lib/rules';
export const dynamic = 'force-dynamic';

// FR-SCH-02/04: có vi phạm → cấm publish; publish gắn version luật tại thời điểm đó
export const POST = route(async (_req, p) => {
  const { supabase } = await getCtx();
  const r = check(await supabase.from('routes').select('*, route_legs(*)').eq('route_id', p.id).single()) as any;
  const rule = check(await supabase.from('driver_rules').select('*').order('effective_from', { ascending: false }).limit(1).single()) as any;
  const result = checkRoute(r.start_time.slice(0, 5), r.route_legs, rule);
  if (result.violations.length) throw new HttpError(422, '拘束時間の違反があるため公開できません', { violations: result.violations });
  check(await supabase.from('routes').update({ status: 'published', rule_version: rule.version, published_at: new Date().toISOString(), version: r.version + 1 }).eq('route_id', p.id));
  return { ok: true, rule_version: rule.version };
});
