create table if not exists pricing_catalog (
  id uuid primary key,
  provider varchar(50) not null,
  model_name varchar(200) not null,
  model_family varchar(100),
  endpoint_type varchar(50) not null,
  unit_input varchar(50),
  rate_input numeric(18,8),
  unit_output varchar(50),
  rate_output numeric(18,8),
  unit_cached_input varchar(50),
  rate_cached_input numeric(18,8),
  unit_audio_input varchar(50),
  rate_audio_input numeric(18,8),
  unit_audio_output varchar(50),
  rate_audio_output numeric(18,8),
  unit_image varchar(50),
  rate_image numeric(18,8),
  currency varchar(10) not null default 'USD',
  effective_start timestamp not null,
  effective_end timestamp,
  is_active boolean not null default true,
  created_at timestamp not null default now()
);

create index if not exists idx_pricing_catalog_lookup
  on pricing_catalog (provider, model_name, endpoint_type, effective_start, effective_end);

create table if not exists tenant_price_override (
  id uuid primary key,
  tenant_id varchar(100) not null,
  pricing_catalog_id uuid not null references pricing_catalog(id),
  override_rate_input numeric(18,8),
  override_rate_output numeric(18,8),
  override_rate_cached_input numeric(18,8),
  markup_percent numeric(8,4),
  effective_start timestamp not null,
  effective_end timestamp,
  created_at timestamp not null default now()
);

create index if not exists idx_tenant_price_override_lookup
  on tenant_price_override (tenant_id, pricing_catalog_id, effective_start, effective_end);

create table if not exists usage_events (
  id uuid primary key,
  request_id varchar(200) not null unique,
  tenant_id varchar(100) not null,
  business_unit_id varchar(100),
  user_id varchar(100),
  api_key_id varchar(100),
  provider varchar(50) not null,
  model_name varchar(200) not null,
  model_family varchar(100),
  endpoint_type varchar(50) not null,
  route_path varchar(200) not null,
  status varchar(30) not null,
  usage_source varchar(30) not null,
  provider_request_id varchar(200),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  embedding_tokens integer not null default 0,
  audio_input_seconds numeric(18,4) not null default 0,
  audio_output_seconds numeric(18,4) not null default 0,
  image_count integer not null default 0,
  cost_input numeric(18,8) not null default 0,
  cost_output numeric(18,8) not null default 0,
  cost_other numeric(18,8) not null default 0,
  cost_total numeric(18,8) not null default 0,
  currency varchar(10) not null default 'USD',
  price_version varchar(50) not null,
  raw_request jsonb,
  raw_response jsonb,
  metadata jsonb,
  created_at timestamp not null default now()
);

create index if not exists idx_usage_events_tenant_created_at
  on usage_events (tenant_id, created_at desc);

create index if not exists idx_usage_events_summary
  on usage_events (tenant_id, provider, model_name, endpoint_type, created_at desc);

create index if not exists idx_usage_events_user
  on usage_events (tenant_id, user_id, created_at desc);

create table if not exists usage_daily_rollups (
  usage_date date not null,
  tenant_id varchar(100) not null,
  business_unit_id varchar(100),
  user_id varchar(100),
  provider varchar(50) not null,
  model_name varchar(200) not null,
  endpoint_type varchar(50) not null,
  request_count bigint not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  cached_input_tokens bigint not null default 0,
  embedding_tokens bigint not null default 0,
  cost_total numeric(18,8) not null default 0,
  currency varchar(10) not null default 'USD',
  primary key (
    usage_date,
    tenant_id,
    business_unit_id,
    user_id,
    provider,
    model_name,
    endpoint_type
  )
);

create index if not exists idx_usage_daily_rollups_tenant_date
  on usage_daily_rollups (tenant_id, usage_date desc);
