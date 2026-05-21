-- AI 큐시트 세션별 방송 그래픽 Zone 프로필 저장
-- Why: bottom_bar/center 같은 추상 zone_hint만 저장하면 재생성 시 AI가 매번 다른 배치로 해석한다.
-- 세션이 선택한 Grid Template 기반 zone bounds를 함께 저장해 생성/재생성/복원 경계를 고정한다.

ALTER TABLE ai_cuesheet_sessions
  ADD COLUMN IF NOT EXISTS layout_profile JSONB;

COMMENT ON COLUMN ai_cuesheet_sessions.layout_profile IS
  'AI 큐시트 세션에서 bottom_bar/top_bar/center/left_third/fullscreen을 실제 1920x1080 좌표로 해석하는 Zone 프로필 JSON.';
