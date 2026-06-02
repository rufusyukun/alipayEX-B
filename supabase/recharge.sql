create extension if not exists pgcrypto;

create table if not exists recharge_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'cny',
  phone text,
  payment_method text not null default 'alipay',
  provider text not null default 'unified_order',
  provider_order_id text,
  payment_status text not null default 'pending' check (
    payment_status in ('pending', 'paying', 'paid', 'failed', 'closed', 'refunded')
  ),
  customer_status text not null default 'pending' check (
    customer_status in ('pending', 'processing', 'completed', 'disputed')
  ),
  support_note text,
  raw_response jsonb,
  mock_trade_no text,
  alipay_trade_no text,
  notify_sign_verified boolean,
  client_ip text,
  user_agent text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recharge_orders add column if not exists currency text default 'cny';
alter table recharge_orders add column if not exists phone text;
alter table recharge_orders add column if not exists payment_method text default 'alipay';
alter table recharge_orders add column if not exists provider text default 'unified_order';
alter table recharge_orders add column if not exists provider_order_id text;
alter table recharge_orders add column if not exists payment_status text default 'pending';
alter table recharge_orders add column if not exists customer_status text default 'pending';
alter table recharge_orders add column if not exists support_note text;
alter table recharge_orders add column if not exists raw_response jsonb;
alter table recharge_orders add column if not exists mock_trade_no text;
alter table recharge_orders add column if not exists alipay_trade_no text;
alter table recharge_orders add column if not exists notify_sign_verified boolean;
alter table recharge_orders add column if not exists client_ip text;
alter table recharge_orders add column if not exists user_agent text;
alter table recharge_orders add column if not exists paid_at timestamptz;
alter table recharge_orders add column if not exists updated_at timestamptz default now();

create index if not exists recharge_orders_created_at_idx on recharge_orders (created_at desc);
create index if not exists recharge_orders_payment_status_idx on recharge_orders (payment_status);
create index if not exists recharge_orders_customer_status_idx on recharge_orders (customer_status);
create index if not exists recharge_orders_phone_idx on recharge_orders (phone);
create index if not exists recharge_orders_provider_order_id_idx on recharge_orders (provider_order_id);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  order_no text,
  provider text not null default 'unified_order',
  event_type text,
  event_status text,
  trade_status text,
  sign_verified boolean default false,
  raw_payload jsonb,
  process_result text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table payment_events add column if not exists provider text default 'unified_order';
alter table payment_events add column if not exists event_type text;
alter table payment_events add column if not exists event_status text;
alter table payment_events add column if not exists trade_status text;
alter table payment_events add column if not exists sign_verified boolean default false;
alter table payment_events add column if not exists raw_payload jsonb;
alter table payment_events add column if not exists process_result text;
alter table payment_events add column if not exists received_at timestamptz default now();
alter table payment_events add column if not exists created_at timestamptz default now();

create index if not exists payment_events_order_no_idx on payment_events (order_no);
create index if not exists payment_events_created_at_idx on payment_events (created_at desc);
create index if not exists payment_events_received_at_idx on payment_events (received_at desc);

create table if not exists balance_ledger (
  id uuid primary key default gen_random_uuid(),
  order_no text references recharge_orders(order_no) on delete set null,
  amount_cents integer not null,
  direction text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists balance_ledger_order_no_idx on balance_ledger (order_no);

create table if not exists support_operation_logs (
  id uuid primary key default gen_random_uuid(),
  order_no text not null references recharge_orders(order_no) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_operation_logs_order_no_idx on support_operation_logs (order_no);
