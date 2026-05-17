/**
 * AI Core Service — 멀티 프로바이더 API 호출 공유 인프라
 *
 * aiCgService, aiOverlayService, aiCuesheetService가 공통으로 사용하는
 * API 키 관리, 모델 설정 캐시, 프로바이더별 호출, 사용량 로깅을 제공한다.
 *
 * 각 서비스는 자신의 도메인 시스템 프롬프트를 callAI()의 첫 번째 인자로 전달한다.
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
 */
export function isCurrentModelReasoning(config?: CachedModelConfig): boolean {
	const cfg = config || _cachedConfig;
	if (!cfg) return false;
	const genConf = (cfg.generationConfig || {}) as any;

	// Gemini thinking 모델 (gemini-3-flash 등 + thinking.enabled)
	if (cfg.provider === "gemini") {
		return !!genConf.thinkingEnabled;
	}

	// DeepSeek thinking mode
	if (cfg.provider === "deepseek") {
		return !!genConf.deepseekThinking;
	}

	// OpenRouter reasoning model (Kimi K2.6, QwQ, DeepSeek R1, O1/O3 등)
	if (cfg.provider === "openrouter") {
		if (genConf.reasoning?.enabled === true) return true;
		if (genConf.reasoning?.enabled === false) return false;
		return /kimi|qwq|r1|reasoner|o1|o3/.test(cfg.modelId);
	}

	return false;
}

// ─── API 키 조회 ─────────────────────────────────────────────────

async function getApiKey(config: CachedModelConfig): Promise<string> {
	if (config.apiKeyId) {
		if (_cachedApiKey && _cachedApiKeyId === config.apiKeyId) {
			return _cachedApiKey;
		}
		try {
			const { data } = await supabase
				.from("api_keys")
				.select("encrypted_key")
				.eq("id", config.apiKeyId)
				.single();
			if (data?.encrypted_key) {
				_cachedApiKey = data.encrypted_key;
				_cachedApiKeyId = config.apiKeyId;
				return data.encrypted_key;
			}
		} catch (err) {
			console.warn("[AI-Core] DB API 키 조회 실패, env fallback:", err);
		}
	}

	const envKeys: Record<string, string> = {
		gemini: "VITE_GEMINI_API_KEY",
		deepseek: "VITE_DEEPSEEK_API_KEY",
		groq: "VITE_GROQ_API_KEY",
		github: "VITE_GITHUB_TOKEN",
		openrouter: "VITE_OPENROUTER_API_KEY",
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

/**
 * 모든 프로바이더에 대한 통합 API 호출
 *
 * 프로바이더별 자동 처리:
 * - Gemini: OpenAI 호환 엔드포인트(https://generativelanguage.googleapis.com/v1beta/openai)
 * - DeepSeek: reasoning_effort + extra_body.thinking
 * - OpenRouter: HTTP-Referer/X-Title 헤더, reasoning.enabled
 * - Groq/GitHub/Cerebras: 표준 OpenAI 호환
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
	// Gemini: 항상 OpenAI 호환 엔드포인트 사용 (네이티브 API 대체)
	const baseUrl = config.provider === "gemini" ? GEMINI_OPENAI_BASE : config.baseUrl;
	const url = `${baseUrl}/chat/completions`;
	const genConf = config.generationConfig as any;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
	};
	if (config.provider === "openrouter") {
		headers["HTTP-Referer"] = "https://webcg-k.local";
		headers["X-Title"] = "WebCG-K";
	}

	// ── Reasoning 모드 감지 ──
	const isDeepseekThinking = config.provider === "deepseek" && !!genConf.deepseekThinking;
	const isOpenRouterReasoning = config.provider === "openrouter" && (
		genConf.reasoning?.enabled === true ||
		(genConf.reasoning?.enabled !== false && /kimi|qwq|r1|reasoner|o1|o3/.test(config.modelId))
	);
	const isGeminiReasoning = config.provider === "gemini" && !!genConf.thinkingEnabled;
	const isReasoning = isDeepseekThinking || isOpenRouterReasoning || isGeminiReasoning;

	// ── 요청 바디 ──
	const body: Record<string, unknown> = {
		model: config.modelId,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userPrompt },
		],
		max_tokens: maxOutputTokens,
	};

	// Reasoning 모드: DeepSeek/OpenRouter는 temperature, top_p 미지원 → 생략
	// Gemini는 reasoning_effort와 temperature/top_p 공존 가능
	if (!isReasoning || isGeminiReasoning) {
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

	// ── Thinking / Reasoning (프로바이더별 분기) ──
	if (isDeepseekThinking) {
		const effort = genConf.deepseekReasoningEffort || "high";
		body.reasoning_effort = effort;
		body.extra_body = { thinking: { type: "enabled" } };
	}
	if (isOpenRouterReasoning) {
		const reasoningConfig: Record<string, unknown> = genConf.reasoning || {};
		body.reasoning = {
			enabled: true,
			...(reasoningConfig.max_tokens !== undefined ? { max_tokens: reasoningConfig.max_tokens } : {}),
			...(reasoningConfig.effort ? { effort: reasoningConfig.effort } : {}),
		};
	}
	if (isGeminiReasoning) {
		const effort = genConf.thinkingEffort || "high";
		body.reasoning_effort = effort;
		// include_thoughts: Gemini 사고 요약 반환 (extra_body)
		if (genConf.includeThoughts) {
			body.extra_body = {
				google: {
					thinking_config: {
						include_thoughts: true,
					},
				},
			};
		}
	}

	// Gemini service tier — flex(저비용) / priority(고속)
	if (config.provider === "gemini" && genConf.serviceTier) {
		body.service_tier = genConf.serviceTier;
	}

	// ── fetch ──
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

	let json: any;
	try {
		json = await res.json();
	} catch (parseErr) {
		const rawBody = await res.clone().text().catch(() => "(body read failed)");
		console.error(`[AI-Core] ${config.provider} 응답 JSON 파싱 실패.`, { status: res.status, rawBody: rawBody.substring(0, 500) });
		throw new Error(`${config.provider} 응답이 유효한 JSON이 아닙니다 (status ${res.status}). 서버가 빈 응답을 반환했을 수 있습니다.${rawBody ? " 응답 본문: " + rawBody.substring(0, 200) : ""}`);
	}

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
 * 모든 프로바이더(Gemini, DeepSeek, OpenRouter, Groq 등)를
 * 단일 OpenAI 호환 경로로 통합 호출한다.
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
