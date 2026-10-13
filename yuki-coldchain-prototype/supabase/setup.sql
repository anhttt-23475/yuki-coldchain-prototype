-- =====================================================================
-- Yuki Cold Chain prototype (LAB-2) — schema + seed data
-- Chạy toàn bộ file này trong Supabase > SQL Editor.
-- Chạy lại bất cứ lúc nào để RESET dữ liệu demo về trạng thái ban đầu.
-- Dữ liệu là dữ liệu mẫu (mock) dựa trên fixture của RFP (R-02, R-04), không phải dữ liệu thật.
-- =====================================================================

drop table if exists lot_events, allocation_logs, dispatch_checks, shipment_history, orders,
  deviations, temperature_readings, import_batches, receipts, lots, route_legs, routes,
  agreements, customers, suppliers, locations, skus, temp_policies, driver_rules cascade;
drop function if exists allocate_lot(text, text, text, jsonb);
drop function if exists ship_order(text, text, numeric, numeric, text, text);
drop function if exists next_id(text);
drop sequence if exists lot_seq, order_seq, dev_seq;

create sequence lot_seq start 100;
create sequence order_seq start 100;
create sequence dev_seq start 100;

-- ---------- Masters ----------
create table temp_policies (
  band text primary key check (band in ('AMBIENT','CHILLED','FROZEN')),
  label_ja text not null,
  min_c numeric, max_c numeric,
  version text not null, effective_from date not null
);
create table driver_rules (
  version text primary key,
  max_continuous_drive_min int not null,   -- 連続運転 4h
  min_break_min int not null,              -- 中断（休憩）30分
  max_daily_restraint_min int not null,    -- 1日の拘束 13h（原則）
  effective_from date not null,
  note text
);
create table skus (
  sku_id text primary key,
  name_ja text not null,
  unit text not null,
  temp_band text not null references temp_policies(band),
  expiry_type text not null check (expiry_type in ('BEST_BEFORE','USE_BY')), -- 賞味期限 / 消費期限
  trace_lane text not null check (trace_lane in ('rice','beef','internal_lot'))
);
create table customers (customer_id text primary key, name_ja text not null);
create table suppliers (supplier_id text primary key, name_ja text not null);
create table agreements (
  agreement_id text primary key,
  customer_id text not null references customers,
  sku_id text not null references skus,
  delivery_term text not null check (delivery_term in ('車上渡し','軒先渡し')),
  window_rule text check (window_rule in ('ONE_THIRD','ONE_HALF','LABEL_DATE_ONLY')), -- NULL = 未確定
  unique (customer_id, sku_id)
);
create table locations (
  location_id text primary key,
  zone text not null,
  temp_band text not null references temp_policies(band),
  is_quarantine boolean not null default false
);

-- ---------- Inventory ----------
create table lots (
  lot_id text primary key,
  sku_id text not null references skus,
  supplier_id text not null references suppliers,
  supplier_lot text not null,
  production_date date not null,
  expiry_date date not null,
  received_at timestamptz not null,
  qty_received numeric not null,
  qty_available numeric not null check (qty_available >= 0),
  location_id text not null references locations,
  status text not null check (status in ('available','quarantine','scrapped')),
  rice_origin text,
  beef_individual_id text
);
create table lot_events (
  id bigserial primary key,
  lot_id text not null references lots,
  event_type text not null,
  from_status text, to_status text,
  reason text, actor text,
  created_at timestamptz not null default now()
);
create table receipts (
  id bigserial primary key,
  lot_id text references lots,
  sku_id text not null references skus,
  supplier_id text not null references suppliers,
  qty numeric not null,
  measured_temp_c numeric not null,
  packaging_ok boolean not null,
  result text not null check (result in ('accepted','quarantined')),
  reasons text,
  inspector text,
  created_at timestamptz not null default now()
);

-- ---------- Orders / allocation / shipment ----------
create table orders (
  order_id text primary key,
  customer_id text not null references customers,
  sku_id text not null references skus,
  qty numeric not null check (qty > 0),
  requested_date date not null,
  status text not null default 'created' check (status in ('created','business_review','allocated','shipped')),
  allocated_lot_id text references lots,
  created_at timestamptz not null default now()
);
create table allocation_logs (
  id bigserial primary key,
  order_id text not null references orders,
  lot_id text,
  decision text not null,
  detail jsonb,
  actor text,
  created_at timestamptz not null default now()
);
create table shipment_history (
  id text primary key,
  customer_id text not null references customers,
  sku_id text not null references skus,
  lot_id text,                    -- có thể là lô cũ trước migration (không có trong bảng lots)
  expiry_date date,
  qty numeric not null,
  is_return boolean not null default false,
  accepted boolean not null default true,
  completed_at timestamptz not null,
  order_id text
);
create table dispatch_checks (
  id bigserial primary key,
  order_id text not null references orders,
  vehicle_band text not null,
  vehicle_temp_c numeric not null,
  cargo_temp_c numeric not null,
  seal_no text not null,
  result text not null,
  reasons text,
  actor text,
  created_at timestamptz not null default now()
);

-- ---------- Temperature / HACCP ----------
create table import_batches (
  id bigserial primary key,
  file_hash text unique not null,
  row_count int not null,
  error_count int not null,
  imported_by text,
  created_at timestamptz not null default now()
);
create table temperature_readings (
  id bigserial primary key,
  device_id text not null,
  zone text not null,
  band text not null references temp_policies(band),
  read_at timestamptz not null,
  value_c numeric not null,
  evaluation text not null check (evaluation in ('ok','alarm')),
  policy_version text not null,
  reviewed_at timestamptz,
  reviewed_by text,
  batch_id bigint references import_batches,
  unique (device_id, read_at)
);
create table deviations (
  deviation_id text primary key,
  source text not null,              -- RECEIVING / TEMPERATURE / SHIPPING
  reading_id bigint references temperature_readings,
  lot_ids text[] not null default '{}',
  description text not null,
  status text not null default 'open' check (status in ('open','investigating','closed')),
  disposition text,                  -- release / scrap / continue
  rationale text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text
);

-- ---------- Dispatch (配車) ----------
create table routes (
  route_id text primary key,
  route_date date not null,
  driver_name text not null,
  vehicle_id text not null,
  vehicle_band text not null references temp_policies(band),
  start_time time not null,
  status text not null default 'draft' check (status in ('draft','published')),
  rule_version text references driver_rules,
  published_at timestamptz,
  version int not null default 0
);
create table route_legs (
  id bigserial primary key,
  route_id text not null references routes on delete cascade,
  seq int not null,
  kind text not null check (kind in ('drive','service','break')),
  minutes int not null check (minutes > 0),
  customer_id text references customers,
  note text
);

-- ---------- Atomic allocation (FR-OUT-02): không over-allocate khi gọi song song ----------
create or replace function allocate_lot(p_order_id text, p_lot_id text, p_actor text, p_detail jsonb)
returns text language plpgsql as $$
declare v_qty numeric; v_status text; v_rows int;
begin
  select qty, status into v_qty, v_status from orders where order_id = p_order_id for update;
  if v_status is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_status in ('allocated','shipped') then raise exception 'ORDER_ALREADY_ALLOCATED'; end if;
  update lots set qty_available = qty_available - v_qty
   where lot_id = p_lot_id and status = 'available' and qty_available >= v_qty;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'LOT_NOT_AVAILABLE'; end if;
  update orders set status = 'allocated', allocated_lot_id = p_lot_id where order_id = p_order_id;
  insert into allocation_logs(order_id, lot_id, decision, detail, actor)
    values (p_order_id, p_lot_id, 'allocated', p_detail, p_actor);
  insert into lot_events(lot_id, event_type, reason, actor)
    values (p_lot_id, 'allocated', 'order ' || p_order_id || ' qty ' || v_qty, p_actor);
  return p_lot_id;
end $$;

-- ---------- Ship (出荷確定) ----------
create or replace function ship_order(p_order_id text, p_vehicle_band text, p_vehicle_temp numeric,
  p_cargo_temp numeric, p_seal text, p_actor text)
returns text language plpgsql as $$
declare o orders%rowtype; l lots%rowtype; v_id text;
begin
  select * into o from orders where order_id = p_order_id for update;
  if o.status <> 'allocated' then raise exception 'ORDER_NOT_ALLOCATED'; end if;
  select * into l from lots where lot_id = o.allocated_lot_id;
  insert into dispatch_checks(order_id, vehicle_band, vehicle_temp_c, cargo_temp_c, seal_no, result, actor)
    values (p_order_id, p_vehicle_band, p_vehicle_temp, p_cargo_temp, p_seal, 'passed', p_actor);
  v_id := 'SH-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);
  insert into shipment_history(id, customer_id, sku_id, lot_id, expiry_date, qty, completed_at, order_id)
    values (v_id, o.customer_id, o.sku_id, l.lot_id, l.expiry_date, o.qty, now(), o.order_id);
  update orders set status = 'shipped' where order_id = p_order_id;
  insert into lot_events(lot_id, event_type, reason, actor)
    values (l.lot_id, 'shipped', 'order ' || p_order_id || ' seal ' || p_seal, p_actor);
  return v_id;
end $$;

-- ---------- ID generators ----------
create or replace function next_id(p_kind text) returns text language sql as $$
  select case p_kind
    when 'lot' then 'L-' || lpad(nextval('lot_seq')::text, 4, '0')
    when 'order' then 'ORD-' || lpad(nextval('order_seq')::text, 3, '0')
    when 'deviation' then 'DEV-' || lpad(nextval('dev_seq')::text, 3, '0')
  end $$;

-- ---------- RLS: chỉ user đã đăng nhập mới đọc/ghi được ----------
do $$ declare t text; begin
  foreach t in array array['temp_policies','driver_rules','skus','customers','suppliers','agreements','locations',
    'lots','lot_events','receipts','orders','allocation_logs','shipment_history','dispatch_checks',
    'import_batches','temperature_readings','deviations','routes','route_legs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_auth_all', t);
  end loop;
end $$;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function allocate_lot(text, text, text, jsonb) from public, anon;
revoke execute on function ship_order(text, text, numeric, numeric, text, text) from public, anon;
grant execute on function allocate_lot(text, text, text, jsonb) to authenticated;
grant execute on function ship_order(text, text, numeric, numeric, text, text) to authenticated;
revoke execute on function next_id(text) from public, anon;
grant execute on function next_id(text) to authenticated;

-- =====================================================================
-- SEED (dữ liệu mẫu). Ngày nghiệp vụ demo = 2026-09-15 (xem NEXT_PUBLIC_BUSINESS_DATE)
-- =====================================================================
insert into temp_policies values
 ('AMBIENT','常温',15,25,'TEMP-2026.1','2026-04-01'),
 ('CHILLED','冷蔵',0,5,'TEMP-2026.1','2026-04-01'),
 ('FROZEN','冷凍',null,-18,'TEMP-2026.1','2026-04-01');

insert into driver_rules values
 ('DRV-2024.4', 240, 30, 780, '2024-04-01', '改善基準告示（2024年4月）要約: 連続運転4h以内・30分以上の中断、1日拘束13h原則。RFP FR-SCH-02 の一部のみ実装（プロトタイプ）');

insert into skus values
 ('AMB-001','新潟県産包装精米5kg','bag','AMBIENT','BEST_BEFORE','rice'),
 ('AMB-002','玄米せんべい12枚','pack','AMBIENT','BEST_BEFORE','internal_lot'),
 ('AMB-003','レトルト野菜カレー200g','pouch','AMBIENT','BEST_BEFORE','internal_lot'),
 ('AMB-004','ほうじ茶ティーバッグ20包','box','AMBIENT','BEST_BEFORE','internal_lot'),
 ('CHI-001','国産牛スライス200g','tray','CHILLED','USE_BY','beef'),
 ('CHI-002','プレーンヨーグルト400g','cup','CHILLED','BEST_BEFORE','internal_lot'),
 ('CHI-003','絹ごし豆腐300g','pack','CHILLED','USE_BY','internal_lot'),
 ('CHI-004','カットサラダ150g','bag','CHILLED','USE_BY','internal_lot'),
 ('FRO-001','冷凍えび餃子12個','bag','FROZEN','BEST_BEFORE','internal_lot'),
 ('FRO-002','バニラアイス120ml','cup','FROZEN','BEST_BEFORE','internal_lot'),
 ('FRO-003','冷凍うどん5食','bag','FROZEN','BEST_BEFORE','internal_lot'),
 ('FRO-004','冷凍枝豆400g','bag','FROZEN','BEST_BEFORE','internal_lot');

insert into customers values
 ('CUS-001','さくらマート本店'),('CUS-002','みなと食品館'),('CUS-003','ひかりストア駅前店'),
 ('CUS-004','あおばスーパー'),('CUS-005','こだまフレッシュ');
insert into suppliers values
 ('SUP-01','越後米穀（模擬）'),('SUP-02','北陸食品（模擬）'),('SUP-03','関東乳業（模擬）'),('SUP-04','東北ミート（模擬）'),('SUP-05','湾岸冷食（模擬）');

-- R-04: 15 hợp đồng; AGR-008, AGR-014 chưa chốt rule (NULL) — không được tự gán mặc định
insert into agreements values
 ('AGR-001','CUS-001','AMB-001','軒先渡し','ONE_THIRD'),
 ('AGR-002','CUS-001','CHI-001','軒先渡し','ONE_HALF'),
 ('AGR-003','CUS-001','FRO-001','軒先渡し','LABEL_DATE_ONLY'),
 ('AGR-004','CUS-002','AMB-002','車上渡し','ONE_THIRD'),
 ('AGR-005','CUS-002','CHI-003','車上渡し','ONE_HALF'),
 ('AGR-006','CUS-002','FRO-002','車上渡し','LABEL_DATE_ONLY'),
 ('AGR-007','CUS-003','CHI-002','軒先渡し','ONE_HALF'),
 ('AGR-008','CUS-003','CHI-004','軒先渡し',null),
 ('AGR-009','CUS-003','FRO-003','軒先渡し','LABEL_DATE_ONLY'),
 ('AGR-010','CUS-004','AMB-003','車上渡し','ONE_THIRD'),
 ('AGR-011','CUS-004','CHI-001','車上渡し','ONE_HALF'),
 ('AGR-012','CUS-004','FRO-004','車上渡し','LABEL_DATE_ONLY'),
 ('AGR-013','CUS-005','AMB-004','軒先渡し','ONE_THIRD'),
 ('AGR-014','CUS-005','CHI-002','軒先渡し',null),
 ('AGR-015','CUS-005','FRO-001','軒先渡し','LABEL_DATE_ONLY');

insert into locations values
 ('A-01-01','A','AMBIENT',false),('A-02-01','A','AMBIENT',false),('A-03-01','A','AMBIENT',false),
 ('A-Q-00','A','AMBIENT',true),  -- 常温は物理-Q区画なし → 論理隔離（質問Q-15の前提）
 ('C-01-01','C','CHILLED',false),('C-02-01','C','CHILLED',false),('C-03-01','C','CHILLED',false),('C-Q-01','C','CHILLED',true),
 ('F-01-01','F','FROZEN',false),('F-02-01','F','FROZEN',false),('F-03-01','F','FROZEN',false),('F-04-01','F','FROZEN',false),('F-Q-01','F','FROZEN',true);

insert into lots values
 ('L-0001','AMB-001','SUP-01','NG-2608A','2026-08-01','2027-01-31','2026-08-05 08:10+09',100,80,'A-01-01','available','新潟県',null),
 ('L-0002','AMB-002','SUP-02','HK-0701','2026-07-01','2027-01-01','2026-07-10 08:30+09',60,60,'A-02-01','available',null,null),
 ('L-0003','AMB-003','SUP-02','HK-0601','2026-06-01','2027-12-01','2026-06-15 09:00+09',120,120,'A-03-01','available',null,null),
 ('L-0004','AMB-004','SUP-02','HK-0501','2026-05-01','2027-05-01','2026-05-20 09:00+09',40,40,'A-03-01','available',null,null),
 ('L-0005','CHI-001','SUP-04','TM-0912','2026-09-12','2026-09-19','2026-09-13 06:40+09',40,30,'C-01-01','available',null,'1234567890'),
 ('L-0006','CHI-001','SUP-04','TM-0914','2026-09-14','2026-09-21','2026-09-14 06:35+09',30,30,'C-01-01','available',null,'1234567891'),
 ('L-0007','CHI-002','SUP-03','KN-0912','2026-09-12','2026-09-18','2026-09-13 07:00+09',50,50,'C-02-01','available',null,null),
 ('L-0008','CHI-002','SUP-03','KN-0908','2026-09-08','2026-09-25','2026-09-14 07:05+09',50,50,'C-02-01','available',null,null),
 ('L-0009','CHI-003','SUP-03','KN-T0910','2026-09-10','2026-09-15','2026-09-11 06:50+09',40,40,'C-03-01','available',null,null),
 ('L-0010','CHI-003','SUP-03','KN-T0914','2026-09-14','2026-09-20','2026-09-14 06:55+09',40,40,'C-03-01','available',null,null),
 ('L-0011','CHI-004','SUP-02','HK-S0913','2026-09-13','2026-09-17','2026-09-14 07:10+09',25,25,'C-03-01','available',null,null),
 ('L-0012','CHI-002','SUP-03','KN-0905','2026-09-05','2026-09-22','2026-09-15 06:30+09',20,20,'C-Q-01','quarantine',null,null),
 ('L-0013','FRO-001','SUP-05','WG-0301','2026-03-01','2027-03-01','2026-03-10 08:00+09',80,80,'F-01-01','available',null,null),
 ('L-0014','FRO-001','SUP-05','WG-0401','2026-04-01','2027-04-01','2026-04-12 08:00+09',80,80,'F-01-01','available',null,null),
 ('L-0015','FRO-002','SUP-05','WG-I0601','2026-06-01','2027-06-01','2026-06-20 08:00+09',100,100,'F-02-01','available',null,null),
 ('L-0016','FRO-003','SUP-05','WG-U0501','2026-05-01','2027-05-01','2026-05-15 08:00+09',60,60,'F-03-01','available',null,null),
 ('L-0017','FRO-004','SUP-05','WG-E0701','2026-07-01','2027-07-01','2026-07-18 08:00+09',70,70,'F-04-01','available',null,null),
 ('L-0018','CHI-002','SUP-03','KN-0909','2026-09-09','2026-09-26','2026-09-14 07:20+09',10,10,'A-02-01','available',null,null);

insert into lot_events(lot_id,event_type,from_status,to_status,reason,actor,created_at) values
 ('L-0012','received',null,'quarantine','入荷時実測温度 7.2°C（冷蔵帯 0–5°C 外）→ 自動隔離','system','2026-09-15 06:30+09'),
 ('L-0018','moved','available','available','【データ不整合デモ】冷蔵SKUが常温ロケーションに記録されている','system','2026-09-14 07:20+09');

insert into receipts(lot_id,sku_id,supplier_id,qty,measured_temp_c,packaging_ok,result,reasons,inspector,created_at) values
 ('L-0008','CHI-002','SUP-03',50,3.1,true,'accepted',null,'入荷担当A','2026-09-14 07:05+09'),
 ('L-0012','CHI-002','SUP-03',20,7.2,true,'quarantined','実測温度 7.2°C は 冷蔵(0–5°C) の範囲外','入荷担当A','2026-09-15 06:30+09');

-- Lịch sử giao (DR-HIST-01) — dùng cho kiểm tra 日付逆転禁止
insert into shipment_history values
 ('SH-0001','CUS-003','CHI-002','L-LEGACY-77','2026-09-20',12,false,true,'2026-09-12 17:30+09',null),
 ('SH-0002','CUS-001','CHI-001','L-0005','2026-09-19',10,false,true,'2026-09-13 16:10+09',null),
 ('SH-0003','CUS-002','CHI-003','L-LEGACY-81','2026-09-16',20,false,true,'2026-09-11 17:00+09',null),
 ('SH-0004','CUS-005','CHI-002','L-LEGACY-78','2026-09-18',8,false,true,'2026-09-10 16:40+09',null),
 ('SH-0005','CUS-001','AMB-001','L-0001','2027-01-31',20,false,true,'2026-09-01 15:00+09',null),
 ('SH-0006','CUS-003','CHI-002','L-LEGACY-79','2026-09-24',-5,true,true,'2026-09-13 10:00+09',null);

insert into orders(order_id,customer_id,sku_id,qty,requested_date,status) values
 ('ORD-001','CUS-003','CHI-002',10,'2026-09-15','created'),
 ('ORD-002','CUS-005','CHI-002',5,'2026-09-16','created'),
 ('ORD-003','CUS-002','CHI-003',10,'2026-09-15','created'),
 ('ORD-004','CUS-001','CHI-001',5,'2026-09-16','created'),
 ('ORD-005','CUS-003','CHI-004',5,'2026-09-16','created'),
 ('ORD-006','CUS-001','FRO-001',10,'2026-09-17','created'),
 ('ORD-007','CUS-004','AMB-003',20,'2026-09-17','created'),
 ('ORD-008','CUS-002','FRO-002',10,'2026-09-16','created');

insert into import_batches(file_hash,row_count,error_count,imported_by,created_at) values
 ('seed-batch-0001',9,0,'system','2026-09-15 05:30+09');
insert into temperature_readings(device_id,zone,band,read_at,value_c,evaluation,policy_version,reviewed_at,reviewed_by,batch_id) values
 ('DL-A01','A','AMBIENT','2026-09-15 08:00+09',21.4,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-A01','A','AMBIENT','2026-09-15 08:15+09',21.8,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-C01','C','CHILLED','2026-09-15 08:00+09',6.1,'alarm','TEMP-2026.1','2026-09-15 09:05+09','品質管理B',(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-C01','C','CHILLED','2026-09-15 08:15+09',4.2,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-C01','C','CHILLED','2026-09-15 08:30+09',3.8,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-F01','F','FROZEN','2026-09-15 09:00+09',-19.5,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-F01','F','FROZEN','2026-09-15 09:15+09',-18.4,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-F01','F','FROZEN','2026-09-15 09:30+09',-15.2,'alarm','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001')),
 ('DL-F01','F','FROZEN','2026-09-15 09:45+09',-18.9,'ok','TEMP-2026.1',null,null,(select id from import_batches where file_hash='seed-batch-0001'));

insert into deviations(deviation_id,source,reading_id,lot_ids,description,status,created_at) values
 ('DEV-001','RECEIVING',null,'{L-0012}','入荷検品: CHI-002 実測温度 7.2°C（冷蔵帯外）→ 自動隔離','investigating','2026-09-15 06:30+09'),
 ('DEV-002','TEMPERATURE',(select id from temperature_readings where device_id='DL-C01' and value_c=6.1),'{}','DL-C01 6.1°C（冷蔵 0–5°C 外）','open','2026-09-15 08:00+09'),
 ('DEV-003','TEMPERATURE',(select id from temperature_readings where device_id='DL-F01' and value_c=-15.2),'{L-0013,L-0014,L-0015,L-0016,L-0017}','DL-F01 -15.2°C（冷凍 ≤-18°C 外）','open','2026-09-15 09:30+09');

insert into routes values
 ('RT-001','2026-09-15','ドライバーA','車両-冷蔵01','CHILLED','06:00','draft',null,null,0),
 ('RT-002','2026-09-15','ドライバーB','車両-冷凍02','FROZEN','05:30','draft',null,null,0),
 ('RT-003','2026-09-15','ドライバーC','車両-常温03','AMBIENT','05:00','draft',null,null,0);
insert into route_legs(route_id,seq,kind,minutes,customer_id,note) values
 ('RT-001',1,'service',30,null,'センター積込'),
 ('RT-001',2,'drive',60,null,null),
 ('RT-001',3,'service',20,'CUS-001','納品'),
 ('RT-001',4,'drive',90,null,null),
 ('RT-001',5,'break',30,null,'休憩'),
 ('RT-001',6,'service',20,'CUS-003','納品'),
 ('RT-001',7,'drive',60,null,'帰庫'),
 ('RT-002',1,'service',30,null,'センター積込'),
 ('RT-002',2,'drive',120,null,null),
 ('RT-002',3,'service',10,'CUS-002','納品'),
 ('RT-002',4,'drive',90,null,null),
 ('RT-002',5,'service',10,'CUS-005','納品'),
 ('RT-002',6,'drive',60,null,'帰庫（連続運転 4h30m → 違反デモ）'),
 ('RT-003',1,'service',60,null,'センター積込'),
 ('RT-003',2,'drive',180,null,null),
 ('RT-003',3,'break',45,null,'休憩'),
 ('RT-003',4,'service',90,'CUS-004','納品・待機'),
 ('RT-003',5,'drive',200,null,null),
 ('RT-003',6,'break',30,null,'休憩'),
 ('RT-003',7,'service',60,'CUS-001','納品'),
 ('RT-003',8,'drive',180,null,'帰庫（拘束 14h05m → 違反デモ）');

-- Yêu cầu API (PostgREST) nạp lại cấu trúc bảng
notify pgrst, 'reload schema';
