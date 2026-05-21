-- 오버레이 관리 화면의 사용자 폴더 모델.
-- Why: category는 오버레이 종류 분류이고, 사용자가 직접 만드는 관리 폴더와 섞이면
-- 재사용 템플릿, AI 큐시트 초안, 위젯을 자유롭게 정리하기 어렵다.

CREATE TABLE IF NOT EXISTS overlay_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overlay_folders_owner
  ON overlay_folders(owner_id);

CREATE INDEX IF NOT EXISTS idx_overlay_folders_workspace
  ON overlay_folders(workspace_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_overlay_folders_owner_workspace_name
  ON overlay_folders(owner_id, COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

ALTER TABLE overlay_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OverlayFolders select policy" ON overlay_folders;
DROP POLICY IF EXISTS "OverlayFolders insert policy" ON overlay_folders;
DROP POLICY IF EXISTS "OverlayFolders update policy" ON overlay_folders;
DROP POLICY IF EXISTS "OverlayFolders delete policy" ON overlay_folders;

CREATE POLICY "OverlayFolders select policy" ON overlay_folders FOR SELECT USING (
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

CREATE POLICY "OverlayFolders insert policy" ON overlay_folders FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);

CREATE POLICY "OverlayFolders update policy" ON overlay_folders FOR UPDATE USING (
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

CREATE POLICY "OverlayFolders delete policy" ON overlay_folders FOR DELETE USING (
  owner_id = auth.uid()
);

ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES overlay_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_overlay_templates_folder
  ON overlay_templates(folder_id)
  WHERE folder_id IS NOT NULL;

COMMENT ON TABLE overlay_folders IS
  '사용자가 오버레이 관리 화면에서 직접 만들고 오버레이를 이동시키는 폴더.';

COMMENT ON COLUMN overlay_templates.folder_id IS
  '오버레이 관리용 사용자 폴더. category는 종류 분류, folder_id는 사용자가 만든 정리 위치다.';
