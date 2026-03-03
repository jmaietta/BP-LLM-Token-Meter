import type { EndpointType, UsageEventRecord } from "./metering";

export interface Queryable {
  query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }>;
}

export interface UsageListQuery {
  tenantId: string;
  startDate?: string;
  endDate?: string;
  provider?: string;
  modelName?: string;
  endpointType?: EndpointType;
  cursor?: string;
  limit?: number;
}

export interface UsageSummaryQuery {
  tenantId: string;
  startDate: string;
  endDate: string;
  groupBy: string[];
}

export interface CostBreakdownQuery {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  provider?: string;
  modelName?: string;
}

export interface UsageListResponse {
  data: Array<{
    request_id: string;
    timestamp: string;
    tenant_id: string;
    user_id?: string;
    provider: string;
    model_name: string;
    endpoint_type: string;
    status: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_total: number;
    currency: string;
  }>;
  next_cursor: string | null;
}

export class UsageReadRepository {
  constructor(private readonly db: Queryable) {}

  async listEvents(query: UsageListQuery): Promise<UsageListResponse> {
    const params: unknown[] = [query.tenantId];
    const where: string[] = ["tenant_id = $1"];

    if (query.startDate) {
      params.push(query.startDate);
      where.push(`created_at >= $${params.length}`);
    }
    if (query.endDate) {
      params.push(query.endDate);
      where.push(`created_at <= $${params.length}`);
    }
    if (query.provider) {
      params.push(query.provider);
      where.push(`provider = $${params.length}`);
    }
    if (query.modelName) {
      params.push(query.modelName);
      where.push(`model_name = $${params.length}`);
    }
    if (query.endpointType) {
      params.push(query.endpointType);
      where.push(`endpoint_type = $${params.length}`);
    }
    if (query.cursor) {
      params.push(query.cursor);
      where.push(`created_at < $${params.length}::timestamp`);
    }

    const limit = Math.min(Math.max(query.limit || 100, 1), 500);
    params.push(limit + 1);

    const sql = `
      select
        request_id,
        created_at,
        tenant_id,
        user_id,
        provider,
        model_name,
        endpoint_type,
        status,
        input_tokens,
        output_tokens,
        total_tokens,
        cost_total,
        currency
      from usage_events
      where ${where.join(" and ")}
      order by created_at desc
      limit $${params.length}
    `;

    const result = await this.db.query<{
      request_id: string;
      created_at: string;
      tenant_id: string;
      user_id?: string;
      provider: string;
      model_name: string;
      endpoint_type: string;
      status: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      cost_total: number;
      currency: string;
    }>(sql, params);

    const rows = result.rows.slice(0, limit);
    const next = result.rows.length > limit ? rows[rows.length - 1]?.created_at : null;

    return {
      data: rows.map((row) => ({
        request_id: row.request_id,
        timestamp: row.created_at,
        tenant_id: row.tenant_id,
        user_id: row.user_id,
        provider: row.provider,
        model_name: row.model_name,
        endpoint_type: row.endpoint_type,
        status: row.status,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        total_tokens: row.total_tokens,
        cost_total: row.cost_total,
        currency: row.currency,
      })),
      next_cursor: next,
    };
  }

  async getSummary(query: UsageSummaryQuery): Promise<Record<string, unknown>> {
    const allowed = new Set(["provider", "model_name", "endpoint_type", "user_id"]);
    const groupBy = query.groupBy.filter((item) => allowed.has(item));
    const dimensions = groupBy.length ? groupBy : ["provider", "model_name"];
    const selectDimensions = dimensions.join(", ");

    const sql = `
      select
        ${selectDimensions},
        sum(request_count)::bigint as request_count,
        sum(input_tokens)::bigint as input_tokens,
        sum(output_tokens)::bigint as output_tokens,
        sum(total_tokens)::bigint as total_tokens,
        sum(cost_total)::numeric as cost_total,
        min(currency) as currency
      from usage_daily_rollups
      where tenant_id = $1
        and usage_date >= $2::date
        and usage_date <= $3::date
      group by ${selectDimensions}
      order by cost_total desc
    `;

    const result = await this.db.query<Record<string, unknown>>(sql, [
      query.tenantId,
      query.startDate,
      query.endDate,
    ]);

    return {
      start_date: query.startDate,
      end_date: query.endDate,
      group_by: dimensions,
      data: result.rows,
    };
  }

  async getCostBreakdown(query: CostBreakdownQuery): Promise<Record<string, unknown>> {
    const params: unknown[] = [query.tenantId, query.periodStart, query.periodEnd];
    const where: string[] = [
      "tenant_id = $1",
      "created_at >= $2::date",
      "created_at < ($3::date + interval '1 day')",
    ];

    if (query.provider) {
      params.push(query.provider);
      where.push(`provider = $${params.length}`);
    }
    if (query.modelName) {
      params.push(query.modelName);
      where.push(`model_name = $${params.length}`);
    }

    const sql = `
      select
        provider,
        model_name,
        sum(input_tokens)::bigint as input_tokens,
        sum(output_tokens)::bigint as output_tokens,
        sum(cost_input)::numeric as cost_input,
        sum(cost_output)::numeric as cost_output,
        sum(cost_total)::numeric as cost_total,
        min(currency) as currency
      from usage_events
      where ${where.join(" and ")}
      group by provider, model_name
      order by cost_total desc
    `;

    const result = await this.db.query<{
      provider: string;
      model_name: string;
      input_tokens: number;
      output_tokens: number;
      cost_input: number;
      cost_output: number;
      cost_total: number;
      currency: string;
    }>(sql, params);

    const currency = result.rows[0]?.currency || "USD";
    const grandTotal = result.rows.reduce((sum, row) => sum + Number(row.cost_total || 0), 0);

    return {
      tenant_id: query.tenantId,
      period_start: query.periodStart,
      period_end: query.periodEnd,
      currency,
      line_items: result.rows.map((row) => ({
        provider: row.provider,
        model_name: row.model_name,
        input_tokens: row.input_tokens,
        output_tokens: row.output_tokens,
        rate_input: row.input_tokens ? Number(row.cost_input) / (row.input_tokens / 1000) : 0,
        rate_output:
          row.output_tokens ? Number(row.cost_output) / (row.output_tokens / 1000) : 0,
        cost_input: row.cost_input,
        cost_output: row.cost_output,
        cost_total: row.cost_total,
      })),
      grand_total: grandTotal,
    };
  }
}

export interface HttpRequest {
  tenantId: string;
  query: Record<string, string | string[] | undefined>;
}

export function parseUsageListQuery(req: HttpRequest): UsageListQuery {
  return {
    tenantId: req.tenantId,
    startDate: readSingle(req.query.start_date),
    endDate: readSingle(req.query.end_date),
    provider: readSingle(req.query.provider),
    modelName: readSingle(req.query.model_name),
    endpointType: readSingle(req.query.endpoint_type) as EndpointType | undefined,
    cursor: readSingle(req.query.cursor),
    limit: toNumber(readSingle(req.query.limit)),
  };
}

export function parseUsageSummaryQuery(req: HttpRequest): UsageSummaryQuery {
  const startDate = readSingle(req.query.start_date);
  const endDate = readSingle(req.query.end_date);

  if (!startDate || !endDate) {
    throw new Error("start_date and end_date are required");
  }

  return {
    tenantId: req.tenantId,
    startDate,
    endDate,
    groupBy: readMany(req.query.group_by),
  };
}

export function parseCostBreakdownQuery(req: HttpRequest): CostBreakdownQuery {
  const periodStart = readSingle(req.query.period_start);
  const periodEnd = readSingle(req.query.period_end);

  if (!periodStart || !periodEnd) {
    throw new Error("period_start and period_end are required");
  }

  return {
    tenantId: req.tenantId,
    periodStart,
    periodEnd,
    provider: readSingle(req.query.provider),
    modelName: readSingle(req.query.model_name),
  };
}

function readSingle(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function readMany(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function toNumber(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toUsageEventResponse(event: UsageEventRecord): Record<string, unknown> {
  return {
    request_id: event.requestId,
    timestamp: event.createdAt.toISOString(),
    tenant_id: event.tenantId,
    user_id: event.userId,
    provider: event.provider,
    model_name: event.modelName,
    endpoint_type: event.endpointType,
    status: event.status,
    input_tokens: event.inputTokens,
    output_tokens: event.outputTokens,
    total_tokens: event.totalTokens,
    cost_total: event.costTotal,
    currency: event.currency,
  };
}
