begin;

create table if not exists app_profiles (
  id text primary key,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists app_profiles_email_lower_idx
  on app_profiles (lower(email));

create table if not exists credit_accounts (
  id text primary key,
  user_id text not null unique references app_profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id text primary key,
  account_id text not null references credit_accounts(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'trial_grant',
      'subscription_grant',
      'purchase_grant',
      'reserve',
      'consume',
      'release',
      'refund',
      'expire',
      'chargeback',
      'manual_adjustment'
    )
  ),
  available_delta integer not null default 0,
  reserved_delta integer not null default 0,
  consumed_amount integer not null default 0 check (consumed_amount >= 0),
  order_id text,
  task_id text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (available_delta <> 0 or reserved_delta <> 0 or consumed_amount <> 0)
);

create unique index if not exists credit_ledger_idempotency_idx
  on credit_ledger (account_id, idempotency_key, event_type);

create index if not exists credit_ledger_account_created_idx
  on credit_ledger (account_id, created_at desc);

create table if not exists billing_orders (
  id text primary key,
  user_id text not null references app_profiles(id) on delete restrict,
  plan_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  credits integer not null check (credits > 0),
  status text not null check (
    status in (
      'created',
      'pending_payment',
      'paid',
      'credited',
      'payment_failed',
      'closed',
      'refund_pending',
      'refunded',
      'chargeback'
    )
  ),
  provider text not null default 'simulation',
  provider_transaction_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists ai_tasks (
  id text primary key,
  user_id text not null references app_profiles(id) on delete restrict,
  task_type text not null,
  status text not null check (
    status in ('reserved', 'settled', 'released')
  ),
  reserved_credits integer not null check (reserved_credits > 0),
  consumed_credits integer not null default 0 check (consumed_credits >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

commit;
