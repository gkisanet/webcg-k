/**
 * AI Core Service — 멀티 프로바이더 API 호출 공유 인프라
 *
 * aiCgService, aiOverlayService, aiCuesheetService가 공통으로 사용하는
 * API 키 관리, 모델 설정 캐시, 프로바이더별 호출, 사용량 로깅을 제공한다.
 *
 * 각 서비스는 자신의 도메인 시스템 프롬프트를 callAI()의 첫 번째 인자로 전달한다.
 *
 * ■ 2026-05-20: Strategy Pattern 도입
 *   프로바이더마다 추론(Reasoning/Thinking) 활성화 방법, temperature 제약,
 *   응답 형태가 모두 다릅니다. 이를 ProviderReasoningStrategy 인터페이스로
 *   정규화하여, 새 프로바이더 추가 시 callOpenAICompatible 본문을 건드리지 않고
 *   PROVIDER_STRATEGIES 레지스트리에 Strategy 객체만 등록하면 됩니다.
 *
 * ■ 2026-05: Gemini 네이티브 REST API(generateContent) → OpenAI 호환 엔드포인트로 통합
 *   모든 프로바이더가 단일 callOpenAICompatible() 경로를 통해 호출된다.
 */

import { supabase } from "../lib/supabase";

// ─── 상수 ────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000;

/** Gemini OpenAI 호환 엔드포인트 (네이티브 generateContent API 대체) */
const GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

// ─── 캐시 ────────────────────────────────────────────────────────

interface CachedModelConfig {
	modelId: string;
	provider: string;
	baseUrl: string;
	apiKeyId: string | null;
	systemPrompt: string | null;
	generationConfig: Record<string, unknown>;
}

let _cachedConfig: CachedModelConfig | null = null;
let _cachedConfigTimestamp = 0;
const CONFIG_CACHE_TTL_MS = 60_000;

let _cachedApiKey: string | null = null;
let _cachedApiKeyId: string | null = null;

// ─── 프로바이더별 추론 전략 (Strategy Pattern) ────────────────────
//
// Why Strategy Pattern:
//   기존에는 callOpenAICompatible() 안에 isDeepseekThinking, isOpenRouterReasoning,
//   isGeminiReasoning 등의 boolean 플래그가 산발적으로 분기되어 있었습니다.
//   새 프로바이더(moonshot, huggingface)를 추가할 때마다 조건문이 누적되어
//   유지보수가 어려워지는 문제가 있었습니다.
//
//   비유하자면, 기존 코드는 "만능 리모컨 하나에 모든 가전제품의 버튼을 다 올려놓은 것"이고,
//   Strategy Pattern은 "각 가전제품이 자신의 리모컨을 갖고 있는 것"입니다.
//   새 가전(프로바이더)이 추가되면 새 리모컨(Strategy)만 만들면 됩니다.

/**
 * 프로바이더별 추론(Reasoning/Thinking) 전략 인터페이스
 *
 * 1단계: isReasoning — 이 프로바이더+설정 조합이 추론 모드인지 판단
 * 2단계: applyToBody — request body에 추론 관련 파라미터를 주입
 * 3단계: skipTemperature — 추론 모드일 때 temperature/top_p를 생략할지 결정
 */
interface ProviderReasoningStrategy {
	/** 이 프로바이더+설정 조합이 reasoning 모드인지 */
	isReasoning(config: CachedModelConfig): boolean;
	/** request body에 reasoning 관련 파라미터를 주입 */
	applyToBody(body: Record<string, unknown>, config: CachedModelConfig): void;
	/** reasoning 모드일 때 temperature/top_p를 생략해야 하는지 */
	skipTemperature(config: CachedModelConfig): boolean;
	/** 프로바이더 전용 헤더 (예: OpenRouter의 HTTP-Referer) */
	extraHeaders?(): Record<string, string>;
}

// ── 각 프로바이더의 Strategy 구현 ──
//
// 프로바이더마다 다른 점:
//   - Gemini: reasoning_effort + thinking_config.include_thoughts, temperature 공존 가능
//   - DeepSeek: reasoning_effort + extra_body.thinking, temperature/top_p 무시됨
//   - Moonshot (Kimi): DeepSeek와 유사한 thinking 구조
//   - OpenRouter: reasoning.enabled + reasoning.effort, temperature 무시됨
//   - Groq/Cerebras/HuggingFace: reasoning 미지원, 순수 OpenAI chat 호환

const PROVIDER_STRATEGIES: Record<string, ProviderReasoningStrategy> = {
	gemini: {
		isReasoning: (c) => !!(c.generationConfig as any).thinkingEnabled,
		applyToBody: (body, c) => {
			const gc = c.generationConfig as any;
			// 1. reasoning_effort: Gemini는 "low", "medium", "high" 지원
			body.reasoning_effort = gc.thinkingEffort || "high";
			// 2. include_thoughts: 사고 과정 요약을 응답에 포함할지
			if (gc.includeThoughts) {
				body.extra_body = {
					google: {
						thinking_config: {
							include_thoughts: true,
						},
					},
				};
			}
			// 3. service_tier: flex(저비용) / priority(고속)
			if (gc.serviceTier) {
				body.service_tier = gc.serviceTier;
			}
		},
		// Gemini는 reasoning + temperature 공존 가능
		skipTemperature: () => false,
	},

	deepseek: {
		isReasoning: (c) => !!(c.generationConfig as any).deepseekThinking,
		applyToBody: (body, c) => {
			const gc = c.generationConfig as any;
			// DeepSeek V4 Pro: reasoning_effort("high"|"max") + extra_body.thinking
			// 응답: reasoning_content(사고 과정) + content(최종 답변) 분리
			body.reasoning_effort = gc.deepseekReasoningEffort || "high";
			body.extra_body = { thinking: { type: "enabled" } };
		},
		// DeepSeek reasoning 시 temperature/top_p/presence_penalty/frequency_penalty 모두 무시됨
		skipTemperature: () => true,
	},

	moonshot: {
		// Kimi K2.6: DeepSeek와 유사한 thinking 구조를 사용
		isReasoning: (c) => !!(c.generationConfig as any).moonshotThinking,
		applyToBody: (body) => {
			// Moonshot thinking mode: extra_body.thinking으로 활성화
			// 응답: reasoning_content + content 분리 (DeepSeek와 동일)
			body.extra_body = { thinking: { type: "enabled" } };
		},
		skipTemperature: () => true,
	},

	openrouter: {
		isReasoning: (c) => {
			const gc = c.generationConfig as any;
			// 1. 명시적 설정이 있으면 따름
			if (gc.reasoning?.enabled === true) return true;
			if (gc.reasoning?.enabled === false) return false;
			// 2. 모델 ID 패턴으로 추론 모델 자동 감지
			//    (Kimi K2.6, QwQ, DeepSeek R1, O1/O3 등)
			return /kimi|qwq|r1|reasoner|o1|o3/.test(c.modelId);
		},
		applyToBody: (body, c) => {
			const reasoningConfig: Record<string, unknown> = (c.generationConfig as any).reasoning || {};
			// OpenRouter reasoning API: reasoning.enabled + optional effort/max_tokens
			body.reasoning = {
				enabled: true,
				...(reasoningConfig.max_tokens !== undefined ? { max_tokens: reasoningConfig.max_tokens } : {}),
				...(reasoningConfig.effort ? { effort: reasoningConfig.effort } : {}),
			};
		},
		skipTemperature: () => true,
		// OpenRouter 필수 헤더: HTTP-Referer, X-Title
		extraHeaders: () => ({
			"HTTP-Referer": "https://webcg-k.local",
			"X-Title": "WebCG-K",
		}),
	},

	// ── 순수 OpenAI chat 호환 프로바이더 (reasoning 미지원) ──
	// Groq, Cerebras, HuggingFace는 추론 모드가 없으므로
	// 모든 Strategy 메서드가 no-op입니다.

	groq: {
		isReasoning: () => false,
		applyToBody: () => {},
		skipTemperature: () => false,
	},

	cerebras: {
		isReasoning: () => false,
		applyToBody: () => {},
		skipTemperature: () => false,
	},

	huggingface: {
		isReasoning: () => false,
		applyToBody: () => {},
		skipTemperature: () => false,
	},

	github: {
		isReasoning: () => false,
		applyToBody: () => {},
		skipTemperature: () => false,
	},
};

/** 알 수 없는 프로바이더에 대한 안전한 기본 전략 */
const DEFAULT_STRATEGY: ProviderReasoningStrategy = {
	isReasoning: () => false,
	applyToBody: () => {},
	skipTemperature: () => false,
};

/** 프로바이더에 해당하는 Strategy를 조회. 등록되지 않은 프로바이더는 기본 전략 반환. */
function getStrategy(provider: string): ProviderReasoningStrategy {
	return PROVIDER_STRATEGIES[provider] || DEFAULT_STRATEGY;
}

// ─── 동적 모델 설정 조회 ─────────────────────────────────────────

export async function getActiveConfig(): Promise<CachedModelConfig> {
	const now = Date.now();
	if (_cachedConfig && now - _cachedConfigTimestamp < CONFIG_CACHE_TTL_MS) {
		return _cachedConfig!;
	}
	try {
		const { data } = await supabase
			.from("ai_model_config")
			.select("model_id, provider, base_url, api_key_id, system_prompt, generation_config")
			.eq("is_active", true)
			.single();
		if (data) {
			_cachedConfig = {
				modelId: data.model_id,
				provider: data.provider || "gemini",
				baseUrl: data.base_url || "",
				apiKeyId: data.api_key_id,
				systemPrompt: data.system_prompt,
				generationConfig: (data.generation_config || {}) as Record<string, unknown>,
			};
			_cachedConfigTimestamp = now;
			if (data.api_key_id !== _cachedApiKeyId) {
				_cachedApiKey = null;
				_cachedApiKeyId = data.api_key_id;
			}
			return _cachedConfig!;
		}
	} catch (err) {
		console.warn("[AI-Core] 활성 모델 조회 실패, 기본값 사용:", err);
	}
	return {
		modelId: "gemini-3-flash-preview",
		provider: "gemini",
		baseUrl: GEMINI_OPENAI_BASE,
		apiKeyId: null,
		systemPrompt: null,
		generationConfig: { temperature: 0.9, maxOutputTokens: 8192 },
	};
}

/** 모델 캐시 강제 초기화 (관리자 모델 전환 시 호출) */
export function invalidateModelCache() {
	_cachedConfig = null;
	_cachedConfigTimestamp = 0;
	_cachedApiKey = null;
	_cachedApiKeyId = null;
}

/**
 * 현재 활성 모델이 추론 모델인지 확인.
 * 서비스별 시스템 프롬프트 분기에 사용.
 * config 생략 시 내부 캐시를 사용 (getActiveConfig() 호출 후라면 캐시 히트).
 *
 * Why Strategy로 통합: 기존에는 provider별 if/else 분기가 이 함수와
 * callOpenAICompatible() 양쪽에 중복되어 있었습니다. Strategy로 통합하면
 * reasoning 판단 로직이 한 곳(PROVIDER_STRATEGIES)에만 존재합니다.
 */
export function isCurrentModelReasoning(config?: CachedModelConfig): boolean {
	const cfg = config || _cachedConfig;
	if (!cfg) return false;
	return getStrategy(cfg.provider).isReasoning(cfg);
}

// ─── API 키 조회 ─────────────────────────────────────────────────

async function getApiKey(config: CachedModelConfig): Promise<string> {
	if (config.apiKeyId) {
		if (_cachedApiKey && _cachedApiKeyId === config.apiKeyId) {
			return _cachedApiKey;
		}
		try {
			const { data, error } = await supabase
				.rpc("get_decrypted_api_key" as any, { key_id: config.apiKeyId });
			if (error) throw error;
			if (data) {
				const trimmedData = (data as unknown as string).trim();
				// 1단계 방어 가드: 'WYj'로 시작하는 base64 암호문이 그대로 노출되거나 에러 메시지가 키에 유입된 경우를 차단
				if (trimmedData.startsWith("WYj") || trimmedData.startsWith("❌")) {
					throw new Error(
						`올바른 API 키가 아닙니다. DB 내 암호화 키 정합성이 맞지 않거나 복호화에 실패했습니다.`
					);
				}
				_cachedApiKey = trimmedData;
				_cachedApiKeyId = config.apiKeyId;
				return trimmedData;
			}
		} catch (err: any) {
			console.warn("[AI-Core] DB API 키 조회 실패, env fallback:", err);
			// 명시적인 복호화 가드 실패 에러는 조용히 덮지 않고 상위 호출자로 전파하여 명확한 오류 피드백 유도
			if (err.message && err.message.includes("올바른 API 키가 아닙니다")) {
				throw err;
			}
		}
	}

	// 프로바이더별 환경변수 매핑
	// Why 환경변수 분리: 각 프로바이더는 독립적인 API 키를 요구합니다.
	// DB에 키가 없으면 .env 파일의 환경변수로 fallback합니다.
	const envKeys: Record<string, string> = {
		gemini: "VITE_GEMINI_API_KEY",
		deepseek: "VITE_DEEPSEEK_API_KEY",
		groq: "VITE_GROQ_API_KEY",
		github: "VITE_GITHUB_TOKEN",
		openrouter: "VITE_OPENROUTER_API_KEY",
		cerebras: "VITE_CEREBRAS_API_KEY",
		moonshot: "VITE_MOONSHOT_API_KEY",
		huggingface: "VITE_HUGGINGFACE_API_KEY",
	};

	const envVar = envKeys[config.provider] || "VITE_GEMINI_API_KEY";
	const key = import.meta.env[envVar];
	if (!key) {
		throw new Error(
			`API 키가 설정되지 않았습니다. 관리자 → API 키 탭에서 ${config.provider} 키를 등록하거나 .env에 ${envVar}를 설정하세요.`
		);
	}
	return key;
}

// ─── 사용량 기록 ──────────────────────────────────────────────────

function logUsage(modelId: string, requestType: string, usage: any) {
	const promptTokens = usage?.promptTokenCount ?? usage?.prompt_tokens ?? 0;
	const completionTokens = usage?.candidatesTokenCount ?? usage?.completion_tokens ?? 0;
	const totalTokens = usage?.totalTokenCount ?? usage?.total_tokens ?? (promptTokens + completionTokens);

	void (async () => {
		try {
			const { data: { user } } = await supabase.auth.getUser();
			await supabase
				.from("ai_usage_logs")
				.insert({
					model_id: modelId,
					prompt_tokens: promptTokens,
					completion_tokens: completionTokens,
					total_tokens: totalTokens,
					request_type: requestType,
					user_id: user?.id ?? null,
				});
		} catch {
			/* fire-and-forget: 로깅 실패는 무시 */
		}
	})();
}

// ─── API 호출 — 통합 OpenAI 호환 (모든 프로바이더) ──────────────

export async function readJsonResponseWithRawFallback(res: Response, provider: string): Promise<any> {
	let rawBody = "";
	try {
		rawBody = await res.clone().text();
	} catch {
		rawBody = "(body read failed)";
	}

	try {
		return JSON.parse(rawBody);
	} catch {
		console.error(`[AI-Core] ${provider} 응답 JSON 파싱 실패.`, {
			status: res.status,
			rawBody: rawBody.substring(0, 500),
		});
		throw new Error(`${provider} 응답이 유효한 JSON이 아닙니다 (status ${res.status}). 서버가 빈 응답을 반환했을 수 있습니다.${rawBody ? " 응답 본문: " + rawBody.substring(0, 200) : ""}`);
	}
}

/**
 * 모든 프로바이더에 대한 통합 API 호출
 *
 * 프로바이더별 처리는 PROVIDER_STRATEGIES 레지스트리에 위임합니다.
 * 새 프로바이더를 추가할 때 이 함수를 수정할 필요가 없습니다.
 *
 * 흐름:
 *   1. Strategy 조회 → isReasoning 판단
 *   2. 공통 request body 구성
 *   3. Strategy.applyToBody()로 프로바이더별 파라미터 주입
 *   4. Strategy.extraHeaders()로 프로바이더별 헤더 추가
 *   5. fetch → 응답 파싱 → reasoning fallback 처리
 */
async function callOpenAICompatible(
	systemPrompt: string,
	userPrompt: string,
	config: CachedModelConfig,
	apiKey: string,
	maxOutputTokens: number,
	temperature: number,
	enforceJsonObject: boolean,
	retryCount = 0,
): Promise<{ text: string; usage: any }> {
	// ── 1. Strategy 조회 ──
	const strategy = getStrategy(config.provider);
	const isReasoning = strategy.isReasoning(config);

	// Gemini: 항상 OpenAI 호환 엔드포인트 사용 (네이티브 API 대체)
	const baseUrl = config.provider === "gemini" ? GEMINI_OPENAI_BASE : config.baseUrl;
	const url = `${baseUrl}/chat/completions`;
	const genConf = config.generationConfig as any;

	// ── 2. 공통 헤더 ──
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
	};

	// 프로바이더 전용 헤더 추가 (예: OpenRouter의 HTTP-Referer)
	if (strategy.extraHeaders) {
		Object.assign(headers, strategy.extraHeaders());
	}

	// ── 3. 공통 요청 바디 ──
	const body: Record<string, unknown> = {
		model: config.modelId,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		max_tokens: maxOutputTokens,
	};

	// temperature/top_p: reasoning 모드이면서 해당 프로바이더가 제약하면 생략
	if (!isReasoning || !strategy.skipTemperature(config)) {
		body.temperature = temperature ?? genConf.temperature ?? 0.9;
		body.top_p = genConf.topP ?? 0.95;
	}

	// JSON object 모드 — 추론 모델에서는 사용 불가 (생각 과정 출력과 충돌)
	if (enforceJsonObject) {
		if (isReasoning) {
			console.warn(`[AI-Core] 추론 모델(${config.modelId})에서는 json_object 모드를 무시합니다.`);
		} else {
			body.response_format = { type: "json_object" };
		}
	}

	// ── 4. Thinking / Reasoning 파라미터 주입 (Strategy에 위임) ──
	if (isReasoning) {
		strategy.applyToBody(body, config);
	}

	// ── 5. fetch ──
	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	// Rate Limit 재시도 (429)
	if (res.status === 429 && retryCount < MAX_RETRIES) {
		console.warn(`[AI-Core] ${config.provider} Rate limit, 재시도 (${retryCount + 1}/${MAX_RETRIES})`);
		await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
		return callOpenAICompatible(systemPrompt, userPrompt, config, apiKey, maxOutputTokens, temperature, enforceJsonObject, retryCount + 1);
	}

	if (!res.ok) {
		const errorBody = await res.text();
		throw new Error(`${config.provider} API 에러 (${res.status}): ${errorBody}`);
	}

	const json = await readJsonResponseWithRawFallback(res, config.provider);

	const choice = json.choices?.[0];
	const finishReason: string | undefined = choice?.finish_reason;
	let text: string | undefined = choice?.message?.content;

	// ── 추론 모델: content가 비어있으면 reasoning_content / reasoning_details fallback ──
	// 단, finish_reason이 "length"/"MAX_TOKENS"이면 추론 도중 토큰 고갈 → 잘린 것임을 명확히 표시
	if (!text) {
		let reasoningFallback = "";
		if (choice?.message?.reasoning_content) {
			reasoningFallback = choice.message.reasoning_content;
		} else if (choice?.message?.reasoning_details) {
			const details = choice.message.reasoning_details;
			reasoningFallback = Array.isArray(details)
				? details.map((d: any) => d.text || d.content || "").filter(Boolean).join("")
				: (typeof details === "string" ? details : JSON.stringify(details));
		}

		if (reasoningFallback) {
			if (finishReason === "length" || finishReason === "MAX_TOKENS") {
				console.error(`[AI-Core] ${config.provider} 추론 도중 토큰 제한 도달! (max_tokens=${maxOutputTokens} 부족). reasoning 내용을 부분 반환합니다.`);
				text = reasoningFallback + "\n\n[⚠️ 모델이 생각 도중 토큰 한도에 도달하여 답변이 잘렸습니다. 토큰 한도를 늘리거나 시스템 프롬프트를 간소화하세요.]";
			} else {
				console.warn(`[AI-Core] ${config.provider} content가 비어있어 reasoning 내용을 대신 사용합니다 (finish_reason=${finishReason}).`);
				text = reasoningFallback;
			}
		}
	}

	if (!text) {
		console.error(`[AI-Core] ${config.provider} 응답 구조:`, JSON.stringify(choice?.message || json).substring(0, 500));
		throw new Error(`${config.provider} 응답에서 텍스트를 찾을 수 없습니다. 모델이 reasoning mode에서 content를 반환하지 않았을 수 있습니다.`);
	}

	// 종료 사유 경고 — content가 있는데 잘린 경우 (추론 fallback과 별도 처리)
	if (finishReason === "length" || finishReason === "MAX_TOKENS") {
		console.warn(`[AI-Core] ${config.provider} 출력이 ${finishReason}(으)로 잘렸습니다. (응답 길이: ${text.length})`);
	}

	return { text, usage: json.usage };
}

// ─── 통합 AI 호출 (Public API) ───────────────────────────────────

export interface CallAiOptions {
	/** 출력 토큰 최대치 (기본 8192) */
	maxOutputTokens?: number;
	/** 생성 temperature (기본: DB 설정값 또는 0.9) */
	temperature?: number;
	/** OpenAI-compatible: JSON object 모드 강제 */
	enforceJsonObject?: boolean;
	/** 사용량 로그 request_type (기본 "ai_call") */
	requestType?: string;
}

/**
 * 활성 AI 모델을 호출하여 응답 텍스트를 반환한다.
 *
 * 모든 프로바이더(Gemini, DeepSeek, OpenRouter, Groq, Cerebras,
 * Moonshot, HuggingFace 등)를 단일 OpenAI 호환 경로로 통합 호출한다.
 *
 * @param systemPrompt - 도메인별 시스템 프롬프트 (필수)
 * @param userPrompt  - 사용자 프롬프트
 * @param options     - maxOutputTokens, temperature, enforceJsonObject, requestType
 */
export async function callAI(
	systemPrompt: string,
	userPrompt: string,
	options?: CallAiOptions,
): Promise<{ text: string; usage: any }> {
	const config = await getActiveConfig();
	const apiKey = await getApiKey(config);

	const maxTokens = options?.maxOutputTokens ?? (config.generationConfig as any).maxOutputTokens ?? 8192;
	const temperature = options?.temperature ?? (config.generationConfig as any).temperature ?? 0.9;

	// 모든 프로바이더 통합 — Gemini도 OpenAI 호환 엔드포인트 사용
	const result = await callOpenAICompatible(
		systemPrompt,
		userPrompt,
		config,
		apiKey,
		maxTokens,
		temperature,
		options?.enforceJsonObject ?? false,
	);

	if (result.usage) {
		logUsage(config.modelId, options?.requestType ?? "ai_call", result.usage);
	}

	return result;
}
