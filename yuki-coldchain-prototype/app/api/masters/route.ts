import { route, getCtx, check } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { supabase } = await getCtx();
  const [skus, customers, suppliers, agreements, locations, policies, driverRules] = await Promise.all([
    supabase.from('skus').select('*').order('sku_id'),
    supabase.from('customers').select('*').order('customer_id'),
    supabase.from('suppliers').select('*').order('supplier_id'),
    supabase.from('agreements').select('*').order('agreement_id'),
    supabase.from('locations').select('*').order('location_id'),
    supabase.from('temp_policies').select('*'),
    supabase.from('driver_rules').select('*'),
  ]);
  return {
    skus: check(skus), customers: check(customers), suppliers: check(suppliers), agreements: check(agreements),
    locations: check(locations), policies: check(policies), driverRules: check(driverRules),
  };
});
