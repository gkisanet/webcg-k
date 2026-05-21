-- ============================================
-- AI 모델 라인업 v2 — 검증된 고성능 모델 추가
-- 2026-05-20
--
-- Why: 기존에 기본 제공하던 폐기 모델(Llama 4 Scout/Maverick, 구 Kimi K2 등)을
--      제거한 뒤, 2026-05 현재 각 프로바이더에서 실제로 사용 가능하고
--      방송 그래픽(Broadcast Graphics) 워크플로우에 적합한 모델만 엄선하여 추가합니다.
-- ============================================

-- ── Groq (초저지연 LPU 추론 — 실시간 방송 그래픽용) ──
-- Why Groq: TTFT(첫 토큰 생성 시간)이 거의 0에 수렴하여
--   생방송 중 타이핑과 동시에 자막 생성 / 데이터 표출이 가능합니다.
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('qwen3-32b', 'Qwen3 32B (Groq)', 'groq', 'https://api.groq.com/openai/v1', 'free', 30, 14400, false,
   'Groq LPU 초고속 추론. Qwen3 32B — 한국어/코딩 우수. 실시간 방송 그래픽 데이터 파싱에 최적.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb),
  ('qwen-qwq-32b', 'QwQ 32B (Groq)', 'groq', 'https://api.groq.com/openai/v1', 'free', 30, 14400, false,
   'Groq LPU 기반 추론 특화 모델. 수학/논리/복잡한 데이터 분석에 우수.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- ── Cerebras (WSE 초고속 — 대형 모델 기반 큐시트/자막 생성) ──
-- Why Cerebras: Wafer-Scale Engine 덕분에 235B 파라미터도 1,000+ tok/s 속도.
--   한국어/아시아권 언어 장악력이 압도적인 Qwen3 235B를 최대 속도로 돌릴 수 있습니다.
-- Note: 이 모델은 2026-05-27 폐기 예정이므로, 후속 모델 발표 시 교체가 필요합니다.
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('qwen-3-235b-a22b-instruct-2507', 'Qwen3 235B (Cerebras)', 'cerebras', 'https://api.cerebras.ai/v1', 'free', 30, 1000, false,
   'Cerebras WSE 초고속 추론. Qwen3 235B — 한국어/아시아권 언어 장악력 압도. 대형 큐시트/자막 생성용. (2026-05-27 폐기 예정)',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- ── DeepSeek V4 Pro — reasoning config 보강 ──
-- 기존 deepseek-v4-pro INSERT는 유지하되, thinking 모드 설정을 명시적으로 추가합니다.
UPDATE ai_model_config
SET generation_config = '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "deepseekThinking": false, "deepseekReasoningEffort": "high"}'::jsonb
WHERE model_id = 'deepseek-v4-pro';

-- ── OpenRouter (최대 모델 풀 & 라우팅) ──
-- Why OpenRouter: 전 세계 API 중 가장 저렴한 엔드포인트를 자동 연결해주어
--   가성비 세팅에 필수적입니다.
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('moonshotai/kimi-k2.6', 'Kimi K2.6 (OpenRouter)', 'openrouter', 'https://openrouter.ai/api/v1', 'paid', 20, 500, false,
   'Moonshot AI 최신 모델. 262K 컨텍스트. 장기 코딩/UI 생성/에이전트 오케스트레이션. $0.73/1M input, $3.49/1M output.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "reasoning": {"enabled": false}}'::jsonb),
  ('deepseek/deepseek-v4-flash:free', 'DeepSeek V4 Flash (OpenRouter Free)', 'openrouter', 'https://openrouter.ai/api/v1', 'free', 20, 200, false,
   'OpenRouter 무료 DeepSeek V4 Flash. 빠른 응답. Gemini 한도 소진 시 즉시 전환용.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- ── Moonshot AI Direct (Kimi K2.6 — 직접 API) ──
-- Why Direct: OpenRouter 경유 시 추가 레이턴시가 발생할 수 있습니다.
--   Kimi K2.6의 thinking 모드를 직접 제어하고 싶을 때 사용합니다.
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('kimi-k2.6', 'Kimi K2.6 (Direct)', 'moonshot', 'https://api.moonshot.ai/v1', 'paid', 30, 1000, false,
   'Moonshot AI 직접 API. 262K 컨텍스트. 코딩/추론 능력 우수. thinking 모드 지원.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "moonshotThinking": false}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- ── HuggingFace Inference Providers (Router) ──
-- Why HuggingFace: :fastest suffix로 자동 최적 프로바이더가 선택되어
--   오픈소스 모델을 가장 빠른 인프라에서 돌릴 수 있습니다.
-- (현재는 모두 제거됨)
