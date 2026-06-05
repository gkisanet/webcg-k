-- ============================================
-- WebCG-K AI 모델 설정 시드 데이터 (Seed Data)
-- 2026-05-21 복구 완료
--
-- Why: combined_migration 스키마 정리 과정에서 유실된 
--      최종 AI 모델 라인업(v2)을 멱등성(Idempotency) 있게 복구합니다.
-- ============================================

-- ── 1. Gemini 3.1 Pro (Google 플래그십) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'gemini-3.1-pro', 
  'Gemini 3.1 Pro', 
  'gemini', 
  'https://generativelanguage.googleapis.com/v1beta/models', 
  'paid', 
  15, 
  2000, 
  true, -- 기본 활성화
  'Google AI 최신 플래그십 모델. 1M 토큰 컨텍스트. 멀티모달 + 고급 추론.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "topK": 40}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  is_active = EXCLUDED.is_active, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 2. DeepSeek V4 Pro (가성비 reasoning) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'deepseek-v4-pro', 
  'DeepSeek V4 Pro', 
  'deepseek', 
  'https://api.deepseek.com', 
  'free', 
  60, 
  1000, 
  false, 
  '가성비와 논리의 끝판왕. GPT-4.5급 성능. 128K 컨텍스트. 코딩 능력 통합. 1M 토큰당 ~$0.14.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "deepseekThinking": false, "deepseekReasoningEffort": "high"}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 3. Qwen3 32B (Groq 초저지연 LPU) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'qwen3-32b', 
  'Qwen3 32B (Groq)', 
  'groq', 
  'https://api.groq.com/openai/v1', 
  'free', 
  30, 
  14400, 
  false,
  'Groq LPU 초고속 추론. Qwen3 32B — 한국어/코딩 우수. 실시간 방송 그래픽 데이터 파싱에 최적.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 4. QwQ 32B (Groq 분석특화) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'qwen-qwq-32b', 
  'QwQ 32B (Groq)', 
  'groq', 
  'https://api.groq.com/openai/v1', 
  'free', 
  30, 
  14400, 
  false,
  'Groq LPU 기반 추론 특화 모델. 수학/논리/복잡한 데이터 분석에 우수.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 5. Qwen3 235B (Cerebras WSE 초고속) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'qwen-3-235b-a22b-instruct-2507', 
  'Qwen3 235B (Cerebras)', 
  'cerebras', 
  'https://api.cerebras.ai/v1', 
  'free', 
  30, 
  1000, 
  false,
  'Cerebras WSE 초고속 추론. Qwen3 235B — 한국어/아시아권 언어 장악력 압도. 대형 큐시트/자막 생성용. (2026-05-27 폐기 예정)',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 6. Kimi K2.6 (OpenRouter 장기 컨텍스트) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'moonshotai/kimi-k2.6', 
  'Kimi K2.6 (OpenRouter)', 
  'openrouter', 
  'https://openrouter.ai/api/v1', 
  'paid', 
  20, 
  500, 
  false,
  'Moonshot AI 최신 모델. 262K 컨텍스트. 장기 코딩/UI 생성/에이전트 오케스트레이션. $0.73/1M input, $3.49/1M output.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "reasoning": {"enabled": false}}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 7. DeepSeek V4 Flash (OpenRouter 무료) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'deepseek/deepseek-v4-flash:free', 
  'DeepSeek V4 Flash (OpenRouter Free)', 
  'openrouter', 
  'https://openrouter.ai/api/v1', 
  'free', 
  20, 
  200, 
  false,
  'OpenRouter 무료 DeepSeek V4 Flash. 빠른 응답. Gemini 한도 소진 시 즉시 전환용.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;

-- ── 8. Kimi K2.6 Direct (직접 API & thinking 제어) ──
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES (
  'kimi-k2.6', 
  'Kimi K2.6 (Direct)', 
  'moonshot', 
  'https://api.moonshot.ai/v1', 
  'paid', 
  30, 
  1000, 
  false,
  'Moonshot AI 직접 API. 262K 컨텍스트. 코딩/추론 능력 우수. thinking 모드 지원.',
  '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "moonshotThinking": false}'::jsonb
)
ON CONFLICT (model_id) 
DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  provider = EXCLUDED.provider, 
  base_url = EXCLUDED.base_url, 
  tier = EXCLUDED.tier, 
  rpm_limit = EXCLUDED.rpm_limit, 
  rpd_limit = EXCLUDED.rpd_limit, 
  description = EXCLUDED.description, 
  generation_config = EXCLUDED.generation_config;
