-- AI 큐시트 scene instance가 생성한 overlay_templates 레코드를 세션 장면에 연결한다.
-- Why: generated_html/css만 복원하면 프리뷰는 가능하지만, 런다운 발행에 필요한
-- overlay template identity가 사라져 재접속 후 "저장된 AI 그래픽"으로 취급되지 않는다.

ALTER TABLE ai_cuesheet_session_scenes
  ADD COLUMN IF NOT EXISTS overlay_template_id UUID REFERENCES overlay_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aics_scenes_overlay_template
  ON ai_cuesheet_session_scenes(overlay_template_id)
  WHERE overlay_template_id IS NOT NULL;

COMMENT ON COLUMN ai_cuesheet_session_scenes.overlay_template_id IS
  'AI 큐시트 장면 그래픽이 저장된 overlay_templates.id. 세션 재접속 후 generated HTML/CSS와 발행 가능 상태를 함께 복원하기 위한 링크.';

CREATE INDEX IF NOT EXISTS idx_overlay_templates_category
  ON overlay_templates(category);
