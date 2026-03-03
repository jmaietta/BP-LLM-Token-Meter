export type EndpointType = "chat" | "embedding" | "audio" | "image";

export type UsageSource =
  | "provider_reported"
  | "backend_reported"
  | "gateway_estimated";

export interface GatewayContext {
  requestId: string;
  tenantId: string;
  businessUnitId?: string;
  userId?: string;
  apiKeyId?: string;
  routePath: string;
  eventTime: Date;
}

export interface NormalizedUsage {
  provider: string;
  modelName: string;
  modelFamily?: string;
  endpointType: EndpointType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  embeddingTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
  imageCount?: number;
  usageSource: UsageSource;
  providerRequestId?: string;
}

export interface PriceCard {
  priceVersion: string;
  currency: string;
  inputRate?: number;
  outputRate?: number;
  cachedInputRate?: number;
  audioInputRate?: number;
  audioOutputRate?: number;
  imageRate?: number;
}

export interface PriceResult {
  costInput: number;
  costOutput: number;
  costOther: number;
  costTotal: number;
  currency: string;
  priceVersion: string;
}

export interface UsageEventRecord {
  requestId: string;
  tenantId: string;
  businessUnitId?: string;
  userId?: string;
  apiKeyId?: string;
  routePath: string;
  provider: string;
  modelName: string;
  modelFamily?: string;
  endpointType: EndpointType;
  status: "success" | "error" | "partial";
  usageSource: UsageSource;
  providerRequestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  embeddingTokens: number;
  audioInputSeconds: number;
  audioOutputSeconds: number;
  imageCount: number;
  costInput: number;
  costOutput: number;
  costOther: number;
  costTotal: number;
  currency: string;
  priceVersion: string;
  rawRequest?: unknown;
  rawResponse?: unknown;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface UsageAdapter {
  supports(provider: string, endpointType: EndpointType): boolean;
  extractUsage(args: {
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
  }): NormalizedUsage | null;
}

export interface PricingCatalogRepository {
  resolvePriceCard(args: {
    tenantId: string;
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    eventTime: Date;
  }): Promise<PriceCard>;
}

export interface UsageEventRepository {
  insert(event: UsageEventRecord): Promise<void>;
}

export class PricingEngine {
  async price(
    usage: NormalizedUsage,
    ctx: GatewayContext,
    catalog: PricingCatalogRepository,
  ): Promise<PriceResult> {
    const card = await catalog.resolvePriceCard({
      tenantId: ctx.tenantId,
      provider: usage.provider,
      modelName: usage.modelName,
      endpointType: usage.endpointType,
      eventTime: ctx.eventTime,
    });

    const promptCost = this.round8(
      ((usage.inputTokens || 0) / 1000) * (card.inputRate || 0),
    );
    const completionCost = this.round8(
      ((usage.outputTokens || 0) / 1000) * (card.outputRate || 0),
    );
    const cachedCost = this.round8(
      ((usage.cachedInputTokens || 0) / 1000) * (card.cachedInputRate || 0),
    );
    const audioInputCost = this.round8(
      (usage.audioInputSeconds || 0) * (card.audioInputRate || 0),
    );
    const audioOutputCost = this.round8(
      (usage.audioOutputSeconds || 0) * (card.audioOutputRate || 0),
    );
    const imageCost = this.round8((usage.imageCount || 0) * (card.imageRate || 0));
    const costOther = this.round8(
      cachedCost + audioInputCost + audioOutputCost + imageCost,
    );

    return {
      costInput: promptCost,
      costOutput: completionCost,
      costOther,
      costTotal: this.round8(promptCost + completionCost + costOther),
      currency: card.currency,
      priceVersion: card.priceVersion,
    };
  }

  private round8(value: number): number {
    return Math.round(value * 100000000) / 100000000;
  }
}

export class UsageNormalizer {
  constructor(private readonly adapters: UsageAdapter[]) {}

  normalize(args: {
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
  }): NormalizedUsage {
    for (const adapter of this.adapters) {
      if (!adapter.supports(args.provider, args.endpointType)) {
        continue;
      }

      const usage = adapter.extractUsage(args);
      if (!usage) {
        continue;
      }

      return {
        ...usage,
        totalTokens:
          usage.totalTokens || (usage.inputTokens || 0) + (usage.outputTokens || 0),
      };
    }

    throw new Error(
      `Unable to normalize usage for provider=${args.provider} endpoint=${args.endpointType}`,
    );
  }
}

export class UsageMeteringService {
  constructor(
    private readonly normalizer: UsageNormalizer,
    private readonly pricing: PricingEngine,
    private readonly catalog: PricingCatalogRepository,
    private readonly events: UsageEventRepository,
  ) {}

  async record(args: {
    ctx: GatewayContext;
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
    status: "success" | "error" | "partial";
  }): Promise<void> {
    const usage = this.normalizer.normalize({
      provider: args.provider,
      modelName: args.modelName,
      endpointType: args.endpointType,
      requestBody: args.requestBody,
      responseBody: args.responseBody,
    });
    const price = await this.pricing.price(usage, args.ctx, this.catalog);

    await this.events.insert({
      requestId: args.ctx.requestId,
      tenantId: args.ctx.tenantId,
      businessUnitId: args.ctx.businessUnitId,
      userId: args.ctx.userId,
      apiKeyId: args.ctx.apiKeyId,
      routePath: args.ctx.routePath,
      provider: usage.provider,
      modelName: usage.modelName,
      modelFamily: usage.modelFamily,
      endpointType: usage.endpointType,
      status: args.status,
      usageSource: usage.usageSource,
      providerRequestId: usage.providerRequestId,
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      cachedInputTokens: usage.cachedInputTokens || 0,
      reasoningTokens: usage.reasoningTokens || 0,
      embeddingTokens: usage.embeddingTokens || 0,
      audioInputSeconds: usage.audioInputSeconds || 0,
      audioOutputSeconds: usage.audioOutputSeconds || 0,
      imageCount: usage.imageCount || 0,
      costInput: price.costInput,
      costOutput: price.costOutput,
      costOther: price.costOther,
      costTotal: price.costTotal,
      currency: price.currency,
      priceVersion: price.priceVersion,
      rawRequest: args.requestBody,
      rawResponse: args.responseBody,
      createdAt: args.ctx.eventTime,
    });
  }
}

export class OpenAICompatibleAdapter implements UsageAdapter {
  supports(provider: string, _endpointType: EndpointType): boolean {
    return [
      "openai",
      "azure_openai",
      "vllm",
      "tgi",
      "ollama",
      "openai_compatible",
    ].includes(provider);
  }

  extractUsage(args: {
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
  }): NormalizedUsage | null {
    const response = args.responseBody as {
      id?: string;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    if (!response?.usage) {
      return null;
    }

    return {
      provider: args.provider,
      modelName: response.model || args.modelName,
      endpointType: args.endpointType,
      inputTokens: response.usage.prompt_tokens || 0,
      outputTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
      usageSource: "provider_reported",
      providerRequestId: response.id,
    };
  }
}

export class AnthropicAdapter implements UsageAdapter {
  supports(provider: string, _endpointType: EndpointType): boolean {
    return provider === "anthropic";
  }

  extractUsage(args: {
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
  }): NormalizedUsage | null {
    const response = args.responseBody as {
      id?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    if (!response?.usage) {
      return null;
    }

    const inputTokens = response.usage.input_tokens || 0;
    const outputTokens = response.usage.output_tokens || 0;

    return {
      provider: args.provider,
      modelName: args.modelName,
      endpointType: args.endpointType,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      usageSource: "provider_reported",
      providerRequestId: response.id,
    };
  }
}

export class BackendReportedAdapter implements UsageAdapter {
  supports(_provider: string, _endpointType: EndpointType): boolean {
    return true;
  }

  extractUsage(args: {
    provider: string;
    modelName: string;
    endpointType: EndpointType;
    requestBody: unknown;
    responseBody: unknown;
  }): NormalizedUsage | null {
    const response = args.responseBody as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      llm_usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const usage = response?.usage || response?.llm_usage;

    if (!usage) {
      return null;
    }

    return {
      provider: args.provider,
      modelName: args.modelName,
      endpointType: args.endpointType,
      inputTokens: usage.prompt_tokens || 0,
      outputTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
      usageSource: "backend_reported",
    };
  }
}
