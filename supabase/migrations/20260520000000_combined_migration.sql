-- ============================================================
-- COMBINED MIGRATION: All migrations merged into one file
-- Generated: 2026-05-20T16:19:12+09:00
-- Total migrations: 77
-- ============================================================

-- ============================================================
-- MIGRATION: 202602040001_profiles.sql
-- ============================================================
-- WebCG-K Database Migration: Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  is_admin BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON profiles(is_admin);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 자신의 프로필만 조회/수정 가능
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- 회원가입 시 자동으로 profiles row 생성 트리거
-- ============================================

-- 트리거 함수: 새 사용자 생성 시 profiles 테이블에 row 추가
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_admin, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    false,
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거: auth.users에 INSERT 시 실행
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 기존 사용자에 대한 profiles row 생성 (1회성)
-- ============================================
INSERT INTO public.profiles (id, display_name, is_admin, created_at, updated_at)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1)),
  false,
  NOW(),
  NOW()
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- MIGRATION: 202602040002_projects.sql
-- ============================================================
-- WebCG-K Database Migration: Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_broadcasting BOOLEAN DEFAULT FALSE,
  timeline_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_broadcasting ON projects(is_broadcasting);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 프로젝트만 조회/수정/삭제 가능
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602040003_images.sql
-- ============================================================
-- WebCG-K Database Migration: Images
CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  keywords TEXT[] DEFAULT '{}',
  storage_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_images_owner_id ON images(owner_id);
CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 이미지만 조회/수정/삭제 가능
CREATE POLICY "Users can view own images" ON images
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own images" ON images
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own images" ON images
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own images" ON images
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602040004_graphics.sql
-- ============================================================
-- WebCG-K Database Migration: Graphics
CREATE TABLE IF NOT EXISTS graphics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL DEFAULT '{}',
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graphics_owner_id ON graphics(owner_id);
ALTER TABLE graphics ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 그래픽만 조회/수정/삭제 가능
CREATE POLICY "Users can view own graphics" ON graphics
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own graphics" ON graphics
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own graphics" ON graphics
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own graphics" ON graphics
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602040005_templates.sql
-- ============================================================
-- WebCG-K Database Migration: Templates
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  timeline_preset JSONB NOT NULL DEFAULT '{}',
  thumbnail_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_owner_id ON templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_public ON templates(is_public);
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 템플릿 또는 공개 템플릿 조회 가능
CREATE POLICY "Users can view own or public templates" ON templates
  FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);

CREATE POLICY "Users can insert own templates" ON templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own templates" ON templates
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own templates" ON templates
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602040007_rundowns.sql
-- ============================================================
-- WebCG-K Database Migration: Rundowns & Project Settings update
-- 1. Projects 테이블 업데이트
ALTER TABLE projects ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active_rundown_id UUID;

-- 2. active_rundown_id 인덱스
CREATE INDEX IF NOT EXISTS idx_projects_active_rundown_id ON projects(active_rundown_id);

-- 3. Rundowns 테이블 생성
CREATE TABLE IF NOT EXISTS rundowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rundowns_project_id ON rundowns(project_id);
ALTER TABLE rundowns ENABLE ROW LEVEL SECURITY;

-- 4. Rundown Items 테이블 생성
CREATE TABLE IF NOT EXISTS rundown_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rundown_id UUID REFERENCES rundowns(id) ON DELETE CASCADE NOT NULL,
  template_id UUID, -- templates 테이블이 먼저 생성되어야 하므로 외래 키는 나중에 추가
  data JSONB DEFAULT '{}',
  item_order INTEGER NOT NULL DEFAULT 0,
  duration INTEGER DEFAULT 5, -- 기본 5초
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rundown_items_rundown_id ON rundown_items(rundown_id);
ALTER TABLE rundown_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책 설정 (간소화: 인증된 사용자 모두 접근 가능하거나, 프로젝트 소유자만 접근)
-- 여기서는 프로젝트 소유권 기반으로 접근 제어

-- Rundowns RLS
CREATE POLICY "Users can view rundowns of own projects" ON rundowns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rundowns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert rundowns to own projects" ON rundowns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update rundowns of own projects" ON rundowns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rundowns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete rundowns of own projects" ON rundowns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rundowns.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Rundown Items RLS
-- (아이템은 런다운에 종속되므로 런다운 접근 권한을 확인하는 방식이 좋으나, 조인이 많아지면 성능 이슈)
-- 간단하게: 런다운을 볼 수 있는 사람은 아이템도 볼 수 있음 prefix
CREATE POLICY "Users can view rundown items of own projects" ON rundown_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert rundown items to own projects" ON rundown_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update rundown items of own projects" ON rundown_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND projects.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete rundown items of own projects" ON rundown_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND projects.owner_id = auth.uid()
    )
  );


-- ============================================================
-- MIGRATION: 202602040008_rundown_items_fkey.sql
-- ============================================================
-- Add foreign key constraint for rundown_items.template_id
-- This must run after templates table is created

ALTER TABLE rundown_items 
ADD CONSTRAINT rundown_items_template_id_fkey 
FOREIGN KEY (template_id) 
REFERENCES templates(id) 
ON DELETE SET NULL;


-- ============================================================
-- MIGRATION: 202602041249_grid_templates.sql
-- ============================================================
-- WebCG-K Database Migration: Grid Templates
-- FancyZones 스타일 그리드 레이아웃 템플릿

CREATE TABLE IF NOT EXISTS grid_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL DEFAULT '{}',
  thumbnail_path TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grid_templates_owner_id ON grid_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_grid_templates_is_public ON grid_templates(is_public);
ALTER TABLE grid_templates ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 템플릿 또는 공개 템플릿 조회 가능
CREATE POLICY "Users can view own or public grid templates" ON grid_templates
  FOR SELECT USING (auth.uid() = owner_id OR is_public = true);

CREATE POLICY "Users can insert own grid templates" ON grid_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own grid templates" ON grid_templates
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own grid templates" ON grid_templates
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602041614_grid_templates_fork.sql
-- ============================================================
-- forked_from 컬럼 추가
-- 다른 사용자 템플릿을 Fork할 때 원본 추적용

ALTER TABLE grid_templates 
ADD COLUMN IF NOT EXISTS forked_from UUID REFERENCES grid_templates(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_grid_templates_forked_from ON grid_templates(forked_from);

COMMENT ON COLUMN grid_templates.forked_from IS '원본 템플릿 ID (Fork된 경우)';


-- ============================================================
-- MIGRATION: 202602050001_graphics_is_public.sql
-- ============================================================
-- WebCG-K Database Migration: Graphics is_public 필드 추가
-- 그래픽 공개/비공개 설정을 위한 필드

ALTER TABLE graphics ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- 공개 그래픽은 모든 사용자가 조회 가능
DROP POLICY IF EXISTS "Users can view own graphics" ON graphics;
CREATE POLICY "Users can view own or public graphics" ON graphics
  FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);


-- ============================================================
-- MIGRATION: 202602050002_rundowns_is_public.sql
-- ============================================================
-- WebCG-K Database Migration: Rundowns is_public 필드 추가
-- 큐시트 공개/비공개 설정을 위한 필드

ALTER TABLE rundowns ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- 공개 큐시트는 모든 사용자가 조회 가능
DROP POLICY IF EXISTS "Users can view rundowns of own projects" ON rundowns;
CREATE POLICY "Users can view own or public rundowns" ON rundowns
  FOR SELECT USING (
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rundowns.project_id
      AND projects.owner_id = auth.uid()
    )
  );


-- ============================================================
-- MIGRATION: 202602050003_rundown_items_source.sql
-- ============================================================
-- WebCG-K Database Migration: Rundown Items 확장
-- source_type, source_id, source_name, thumbnail 컬럼 추가

-- 새 컬럼 추가
ALTER TABLE rundown_items ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'template';
ALTER TABLE rundown_items ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE rundown_items ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE rundown_items ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- 기존 template_id 데이터를 source_id로 마이그레이션
UPDATE rundown_items
SET 
  source_id = template_id,
  source_type = 'template'
WHERE source_id IS NULL AND template_id IS NOT NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_rundown_items_source_type ON rundown_items(source_type);
CREATE INDEX IF NOT EXISTS idx_rundown_items_source_id ON rundown_items(source_id);

-- 코멘트
COMMENT ON COLUMN rundown_items.source_type IS 'image | graphic | template';
COMMENT ON COLUMN rundown_items.source_id IS '이미지/그래픽/템플릿의 ID';
COMMENT ON COLUMN rundown_items.source_name IS '아이템 표시 이름';
COMMENT ON COLUMN rundown_items.thumbnail IS '썸네일 경로 또는 URL';


-- ============================================================
-- MIGRATION: 202602060001_broadcast_sessions.sql
-- ============================================================
-- broadcast_sessions 테이블 생성
-- 런다운에서 생성된 방송 세션 (프로젝트) 관리

CREATE TABLE broadcast_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    -- 원본 런다운 참조
    rundown_id UUID NOT NULL REFERENCES rundowns(id) ON DELETE CASCADE,
    -- 생성자
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- 세션 상태: draft(준비중), ready(준비완료), live(송출중), completed(완료)
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'live', 'completed')),
    -- 타임라인 배치 데이터 (각 아이템의 시작 위치, 트랙 등)
    timeline_data JSONB DEFAULT '[]'::jsonb
);

-- 인덱스
CREATE INDEX idx_broadcast_sessions_created_by ON broadcast_sessions(created_by);
CREATE INDEX idx_broadcast_sessions_rundown_id ON broadcast_sessions(rundown_id);
CREATE INDEX idx_broadcast_sessions_status ON broadcast_sessions(status);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_broadcast_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_broadcast_sessions_updated_at
    BEFORE UPDATE ON broadcast_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_broadcast_sessions_updated_at();

-- RLS 정책
ALTER TABLE broadcast_sessions ENABLE ROW LEVEL SECURITY;

-- 조회: 본인이 생성한 세션 + 런다운 소유자의 세션
CREATE POLICY "Users can view own broadcast sessions"
    ON broadcast_sessions FOR SELECT
    USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM rundowns r
            JOIN projects p ON r.project_id = p.id
            WHERE r.id = broadcast_sessions.rundown_id
            AND p.owner_id = auth.uid()
        )
    );

-- 생성: 인증된 사용자
CREATE POLICY "Authenticated users can create broadcast sessions"
    ON broadcast_sessions FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- 수정: 본인이 생성한 세션만
CREATE POLICY "Users can update own broadcast sessions"
    ON broadcast_sessions FOR UPDATE
    USING (created_by = auth.uid());

-- 삭제: 본인이 생성한 세션만
CREATE POLICY "Users can delete own broadcast sessions"
    ON broadcast_sessions FOR DELETE
    USING (created_by = auth.uid());

-- 코멘트
COMMENT ON TABLE broadcast_sessions IS '런다운에서 생성된 방송 세션 (프로젝트)';
COMMENT ON COLUMN broadcast_sessions.status IS 'draft=준비중, ready=준비완료, live=송출중, completed=완료';
COMMENT ON COLUMN broadcast_sessions.timeline_data IS '타임라인 배치 정보 (아이템별 시작 위치, 트랙 ID 등)';


-- ============================================================
-- MIGRATION: 202602060002_storage_buckets.sql
-- ============================================================
-- WebCG-K Storage Bucket Policies
-- 이미지 버킷 생성 및 RLS 정책

-- 1. 버킷 생성 (이미 존재하면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- 사용자는 자신의 폴더에만 업로드 가능
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 사용자는 자신의 폴더 파일만 수정 가능
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 사용자는 자신의 폴더 파일만 삭제 가능
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'images' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- public 버킷이므로 모든 사용자가 조회 가능
CREATE POLICY "Anyone can view images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');


-- ============================================================
-- MIGRATION: 202602060003_images_multi_resolution.sql
-- ============================================================
-- WebCG-K Database Migration: Images Multi-Resolution
-- 2K/4K 다중 해상도 이미지 지원

-- 설명 필드 추가
ALTER TABLE images ADD COLUMN IF NOT EXISTS description TEXT;

-- 2K 해상도 이미지 경로
ALTER TABLE images ADD COLUMN IF NOT EXISTS storage_path_2k TEXT;

-- 4K 해상도 이미지 경로
ALTER TABLE images ADD COLUMN IF NOT EXISTS storage_path_4k TEXT;

-- 기존 storage_path 데이터를 storage_path_2k로 마이그레이션
UPDATE images SET storage_path_2k = storage_path WHERE storage_path IS NOT NULL AND storage_path_2k IS NULL;

-- 인덱스 추가 (쿼리 성능)
CREATE INDEX IF NOT EXISTS idx_images_has_2k ON images((storage_path_2k IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_images_has_4k ON images((storage_path_4k IS NOT NULL));


-- ============================================================
-- MIGRATION: 202602060004_images_public_access.sql
-- ============================================================
-- WebCG-K Database Migration: Images Public Access
-- 이미지 공개/비공개 및 다른 사용자 조회 허용

-- is_public 필드 추가 (공개 이미지 여부)
ALTER TABLE images ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- 기존 SELECT 정책 삭제 후 새 정책 생성
DROP POLICY IF EXISTS "Users can view own images" ON images;

-- 사용자는 자신의 이미지 + 공개된 다른 사용자 이미지 조회 가능
CREATE POLICY "Users can view own or public images" ON images
  FOR SELECT USING (auth.uid() = owner_id OR is_public = true);


-- ============================================================
-- MIGRATION: 202602070001_overlay_templates.sql
-- ============================================================
-- WebCG-K Database Migration: Overlay Templates (NodeCG-style)
-- 오버레이 템플릿 정의 테이블

CREATE TABLE IF NOT EXISTS overlay_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  layer INT DEFAULT 2,

  -- 그래픽 정의 (GraphicElement[] 형식)
  graphic_data JSONB NOT NULL DEFAULT '[]',

  -- 데이터 바인딩 설정
  data_source JSONB,
  refresh_interval INT,

  -- 애니메이션 설정
  animation_config JSONB DEFAULT '{"in": {"type": "fade", "duration": 500}, "out": {"type": "fade", "duration": 300}}',

  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overlay_templates_owner ON overlay_templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_overlay_templates_public ON overlay_templates(is_public);
ALTER TABLE overlay_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or public overlay templates" ON overlay_templates
  FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);

CREATE POLICY "Users can insert own overlay templates" ON overlay_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own overlay templates" ON overlay_templates
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own overlay templates" ON overlay_templates
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602070002_overlay_state.sql
-- ============================================================
-- WebCG-K Database Migration: Overlay State (Replicant 역할)
-- 세션별 오버레이 실시간 상태 테이블

CREATE TABLE IF NOT EXISTS overlay_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES broadcast_sessions(id) ON DELETE CASCADE,
  template_id UUID REFERENCES overlay_templates(id) ON DELETE CASCADE,

  is_active BOOLEAN DEFAULT FALSE,
  current_data JSONB,
  animation_state TEXT DEFAULT 'idle' CHECK (animation_state IN ('idle', 'in', 'loop', 'out')),

  -- 충돌 시 선택 기록
  conflict_mode TEXT DEFAULT 'overlay' CHECK (conflict_mode IN ('overlay', 'hide_block', 'none')),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(session_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_overlay_state_session ON overlay_state(session_id);
CREATE INDEX IF NOT EXISTS idx_overlay_state_active ON overlay_state(session_id, is_active) WHERE is_active = TRUE;
ALTER TABLE overlay_state ENABLE ROW LEVEL SECURITY;

-- 세션 참여자는 조회 가능
CREATE POLICY "Authenticated users can view overlay state" ON overlay_state
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert overlay state" ON overlay_state
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update overlay state" ON overlay_state
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete overlay state" ON overlay_state
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE overlay_state;


-- ============================================================
-- MIGRATION: 202602070003_api_keys.sql
-- ============================================================
-- WebCG-K Database Migration: API Keys
-- 외부 API 키 저장 (암호화)

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- 소유자만 접근 가능
CREATE POLICY "Users can view own api keys" ON api_keys
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own api keys" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own api keys" ON api_keys
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own api keys" ON api_keys
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602070004_session_action_logs.sql
-- ============================================================
-- WebCG-K Database Migration: Session Action Logs
-- 멀티유저 세션 액션 로그

CREATE TABLE IF NOT EXISTS session_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES broadcast_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  action_type TEXT NOT NULL,
  action_detail JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_logs_session ON session_action_logs(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_logs_user ON session_action_logs(user_id);
ALTER TABLE session_action_logs ENABLE ROW LEVEL SECURITY;

-- 세션 참여자는 조회 가능
CREATE POLICY "Authenticated users can view session logs" ON session_action_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 로그 삽입은 인증된 사용자 누구나 가능
CREATE POLICY "Authenticated users can insert session logs" ON session_action_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- MIGRATION: 202602080001_rundowns_delete_policy_fix.sql
-- ============================================================
-- 큐시트 삭제 RLS 정책 보강: created_by 기반 삭제 허용
-- 기존 정책은 project_id → projects.owner_id 체크만 수행하므로
-- project_id가 null이거나 프로젝트 소유자가 아닌 생성자의 경우 삭제 불가 문제 해결

-- 기존 정책 드롭 후 재생성 (OR 조건 추가)
DROP POLICY IF EXISTS "Users can delete rundowns of own projects" ON rundowns;

CREATE POLICY "Users can delete own rundowns" ON rundowns
  FOR DELETE USING (
    -- 방법 1: 프로젝트 소유자인 경우
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rundowns.project_id
      AND projects.owner_id = auth.uid()
    )
    OR
    -- 방법 2: 큐시트 생성자 본인인 경우
    created_by = auth.uid()
  );


-- ============================================================
-- MIGRATION: 202602090001_broadcast_sessions_ended_status.sql
-- ============================================================
-- broadcast_sessions.status CHECK 제약 업데이트
-- 'ended' 상태 추가 (송출 완료 시 사용)

-- 기존 CHECK 제약 삭제
ALTER TABLE broadcast_sessions DROP CONSTRAINT IF EXISTS broadcast_sessions_status_check;

-- 새 CHECK 제약 추가 (ended 포함)
ALTER TABLE broadcast_sessions ADD CONSTRAINT broadcast_sessions_status_check
  CHECK (status IN ('draft', 'ready', 'live', 'ended', 'completed'));

COMMENT ON COLUMN broadcast_sessions.status IS 'draft=준비중, ready=준비완료, live=송출중, ended=송출완료, completed=최종완료';


-- ============================================================
-- MIGRATION: 202602090002_playhead_state.sql
-- ============================================================
-- broadcast_sessions에 playhead_state 컬럼 추가
-- PGM 송출 시 재진입용 상태 저장 (playheadPosition, pgmBlockId, completedBlockIds 등)

ALTER TABLE broadcast_sessions ADD COLUMN IF NOT EXISTS playhead_state JSONB DEFAULT '{}';

COMMENT ON COLUMN broadcast_sessions.playhead_state IS 'PGM 송출 상태 스냅샷 (playheadPosition, pgmBlockId, completedBlockIds, airedBlockIds, skippedBlockIds)';


-- ============================================================
-- MIGRATION: 202602100001_overlay_ai_extensions.sql
-- ============================================================
-- WebCG-K Database Migration: Overlay AI Extensions
-- overlay_templates 테이블에 AI CG 생성 관련 컬럼 추가

-- 그리드 템플릿 연결
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS grid_template_id UUID REFERENCES grid_templates(id) ON DELETE SET NULL;

-- 선택된 Zone 정보
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS zone_ids TEXT[];
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS zone_bounds JSONB;

-- AI 프롬프트 & 메타데이터
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS ai_prompt TEXT;
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'ai_generated', 'imported', 'api_bound'));
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS ai_metadata JSONB;

-- 검색/분류 태그
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS tags TEXT[];

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_overlay_templates_grid ON overlay_templates(grid_template_id);
CREATE INDEX IF NOT EXISTS idx_overlay_templates_source ON overlay_templates(source_type);


-- ============================================================
-- MIGRATION: 202602100002_overlay_gallery.sql
-- ============================================================
-- WebCG-K Database Migration: Overlay Gallery
-- 개인 오버레이 갤러리 테이블

CREATE TABLE IF NOT EXISTS overlay_gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID REFERENCES overlay_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  thumbnail TEXT,
  is_favorite BOOLEAN DEFAULT FALSE,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(owner_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_overlay_gallery_owner ON overlay_gallery(owner_id);
CREATE INDEX IF NOT EXISTS idx_overlay_gallery_favorite ON overlay_gallery(owner_id, is_favorite) WHERE is_favorite = TRUE;
ALTER TABLE overlay_gallery ENABLE ROW LEVEL SECURITY;

-- 소유자만 접근 가능
CREATE POLICY "Users can view own gallery" ON overlay_gallery
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own gallery" ON overlay_gallery
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own gallery" ON overlay_gallery
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own gallery" ON overlay_gallery
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602100003_overlay_data_sources.sql
-- ============================================================
-- WebCG-K Database Migration: Overlay Data Sources
-- 외부 데이터 소스 정의 테이블

CREATE TABLE IF NOT EXISTS overlay_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('weather', 'earthquake', 'wildfire', 'public_data', 'custom_api', 'mcp')),
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_fetched TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overlay_data_sources_owner ON overlay_data_sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_overlay_data_sources_type ON overlay_data_sources(type);
ALTER TABLE overlay_data_sources ENABLE ROW LEVEL SECURITY;

-- 소유자만 접근 가능
CREATE POLICY "Users can view own data sources" ON overlay_data_sources
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own data sources" ON overlay_data_sources
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own data sources" ON overlay_data_sources
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own data sources" ON overlay_data_sources
  FOR DELETE USING (auth.uid() = owner_id);


-- ============================================================
-- MIGRATION: 202602100004_custom_data_sources.sql
-- ============================================================
-- custom_data_sources: 사용자 커스텀 API 데이터 소스
-- 빌트인 소스(날씨/지진/산불/공공)와 별도로 사용자가 직접 API 등록

CREATE TABLE IF NOT EXISTS custom_data_sources (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- 카드 표시 정보
  name            TEXT NOT NULL,                          -- "기상청 초단기실황"
  icon            TEXT DEFAULT '🔗',                     -- 이모지 아이콘
  provider        TEXT DEFAULT '커스텀 API',              -- 제공자명
  description     TEXT,                                   -- 설명
  accent          TEXT DEFAULT 'rgba(99,102,241,0.5)',    -- 카드 악센트 컬러

  -- HTTP 설정
  endpoint        TEXT NOT NULL,                          -- API URL
  method          TEXT DEFAULT 'GET' CHECK (method IN ('GET', 'POST')),
  headers         JSONB DEFAULT '{}',                     -- 커스텀 헤더
  query_params    JSONB DEFAULT '{}',                     -- 쿼리 파라미터
  body_template   JSONB,                                  -- POST body 템플릿

  -- 응답 처리
  response_mapping JSONB DEFAULT '{}',                    -- 응답 키 매핑 규칙

  -- 인증
  auth_type       TEXT DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'bearer')),
  api_key_id      UUID REFERENCES api_keys(id) ON DELETE SET NULL,

  -- 상태
  is_active       BOOLEAN DEFAULT true,
  last_tested     TIMESTAMPTZ,
  last_status     INTEGER,                                -- 마지막 테스트 HTTP 상태

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_custom_data_sources_owner ON custom_data_sources(owner_id);

-- RLS
ALTER TABLE custom_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom sources" ON custom_data_sources
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own custom sources" ON custom_data_sources
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own custom sources" ON custom_data_sources
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Users can delete own custom sources" ON custom_data_sources
  FOR DELETE USING (owner_id = auth.uid());


-- ============================================================
-- MIGRATION: 202602110001_ai_usage_and_model_config.sql
-- ============================================================
-- AI 사용량 추적 + 모델 설정 테이블
-- 목적: AI 모델별 토큰 사용량 기록 및 모델 전환 설정 관리

-- AI 사용량 로그 테이블
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  request_type TEXT DEFAULT 'cg_generation',  -- cg_generation, test, etc.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI 모델 설정 테이블
CREATE TABLE IF NOT EXISTS ai_model_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  tier TEXT DEFAULT 'free',           -- free, paid
  rpm_limit INTEGER DEFAULT 10,       -- 분당 요청 한도
  rpd_limit INTEGER DEFAULT 1500,     -- 일당 요청 한도
  tpm_limit INTEGER DEFAULT 0,        -- 분당 토큰 한도 (0=무제한)
  tpd_limit INTEGER DEFAULT 0,        -- 일당 토큰 한도 (0=무제한)
  is_active BOOLEAN DEFAULT false,    -- 현재 활성 모델 여부
  fallback_model_id TEXT,             -- 임계치 초과 시 전환할 모델 ID
  threshold_percent INTEGER DEFAULT 80, -- 사용량 몇 % 초과 시 전환
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_config ENABLE ROW LEVEL SECURITY;

-- 사용량 로그: 모든 인증 사용자 INSERT, 관리자만 SELECT
CREATE POLICY "ai_usage_logs_insert" ON ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "ai_usage_logs_select_admin" ON ai_usage_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 모델 설정: 모든 인증 사용자 SELECT (모델 조회), 관리자만 UPDATE
CREATE POLICY "ai_model_config_select" ON ai_model_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ai_model_config_update_admin" ON ai_model_config
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "ai_model_config_insert_admin" ON ai_model_config
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

CREATE POLICY "ai_model_config_delete_admin" ON ai_model_config
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true)
  );

-- 기본 모델 데이터 삽입
INSERT INTO ai_model_config (model_id, display_name, tier, rpm_limit, rpd_limit, is_active, fallback_model_id, threshold_percent)
VALUES 
  ('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', 'free', 30, 1500, true, NULL, 80),
  ('gemini-3.1-pro', 'Gemini 3.1 Pro', 'paid', 15, 2000, false, NULL, 80)
ON CONFLICT (model_id) DO NOTHING;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_model ON ai_usage_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id);


-- ============================================================
-- MIGRATION: 202602110002_admin_profiles_rls.sql
-- ============================================================
-- ============================================
-- 관리자 RLS 재귀 에러 수정
-- profiles 테이블에서 자기참조 재귀 방지를 위해
-- SECURITY DEFINER 함수 사용
-- ============================================

-- 기존 재귀 문제 정책 삭제
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- RLS 우회하는 관리자 체크 함수 (SECURITY DEFINER → 슈퍼유저 권한으로 실행)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 관리자는 모든 프로필 조회 가능
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT
  USING (public.is_admin());

-- 관리자는 다른 사용자의 프로필 수정 가능
CREATE POLICY "Admins can update any profile" ON profiles
  FOR UPDATE
  USING (public.is_admin());


-- ============================================================
-- MIGRATION: 202602110003_multi_provider_ai.sql
-- ============================================================
-- ============================================
-- 다중 AI 프로바이더 지원 확장
-- ai_model_config 테이블에 프로바이더/프롬프트/설정 컬럼 추가
-- 새 프로바이더 모델 시드 데이터
-- ============================================

-- 1. ai_model_config 테이블에 새 컬럼 추가
ALTER TABLE ai_model_config
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS generation_config JSONB DEFAULT '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "topK": 40}'::jsonb,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. 기존 Gemini 모델에 provider/base_url 설정
UPDATE ai_model_config
SET
  provider = 'gemini',
  base_url = 'https://generativelanguage.googleapis.com/v1beta/models'
WHERE provider IS NULL OR provider = 'gemini';

-- 3. 새 프로바이더 모델 시드 데이터

-- DeepSeek (V4 Pro — 최신 모델)
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('deepseek-v4-pro', 'DeepSeek V4 Pro', 'deepseek', 'https://api.deepseek.com', 'free', 60, 1000, false,
   '가성비와 논리의 끝판왕. GPT-4.5급 성능. 128K 컨텍스트. 코딩 능력 통합. 1M 토큰당 ~$0.14.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = 'DeepSeek V4 Pro', description = EXCLUDED.description;



-- 삭제: 구세대/비효율/미사용 모델
DELETE FROM ai_model_config WHERE model_id IN (
  'gpt-5-mini', 'Phi-3-medium-128k-instruct', 'mistralai/devstral-2:free',
  'gemini-2.5-flash-lite',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'moonshotai/kimi-k2-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'qwen/qwen-3.6-plus:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen-3-235b'
);

-- 4. 기존 Gemini 모델에도 description 추가


-- Gemini 3.1 Pro (최신 모델)
INSERT INTO ai_model_config (model_id, display_name, provider, base_url, tier, rpm_limit, rpd_limit, is_active, description, generation_config)
VALUES
  ('gemini-3.1-pro', 'Gemini 3.1 Pro', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/models', 'paid', 15, 2000, false,
   'Google AI 최신 플래그십 모델. 1M 토큰 컨텍스트. 멀티모달 + 고급 추론.',
   '{"temperature": 0.9, "maxOutputTokens": 8192, "topP": 0.95, "topK": 40}'::jsonb)
ON CONFLICT (model_id) DO UPDATE SET display_name = 'Gemini 3.1 Pro', description = EXCLUDED.description;

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_ai_model_config_provider ON ai_model_config(provider);
CREATE INDEX IF NOT EXISTS idx_ai_model_config_api_key ON ai_model_config(api_key_id);


-- ============================================================
-- MIGRATION: 202602120001_renderer_public_access.sql
-- ============================================================
-- 렌더러 공개 접근: live 세션은 비인증 사용자도 조회 가능
-- 목적: 렌더러 URL(예: /render/SESSION_ID)을 OBS 브라우저 소스나
--        외부 인원에게 공유할 때 로그인 없이 시청 가능하도록 함
-- 보안: 세션 ID가 UUID이므로 URL 추측 불가 (128비트 엔트로피)
--        ended/completed 세션은 공개하지 않음 (live만 허용)

-- ─── broadcast_sessions: live 세션 공개 SELECT ─────────────────
-- 기존 정책(인증 사용자 전용)은 유지하고, 추가 정책으로 live 세션 공개
CREATE POLICY "Anyone can view live broadcast sessions"
  ON broadcast_sessions
  FOR SELECT
  USING (status = 'live');

-- ─── overlay_state: live 세션의 오버레이 공개 SELECT ──────────
-- live 세션에 연결된 오버레이 상태도 비인증 사용자가 조회 가능해야
-- 렌더러의 OverlayPlayoutLayer가 정상 동작함
CREATE POLICY "Anyone can view overlay state for live sessions"
  ON overlay_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM broadcast_sessions bs
      WHERE bs.id = overlay_state.session_id
      AND bs.status = 'live'
    )
  );

-- ─── overlay_templates: live 세션 오버레이의 템플릿 공개 SELECT ──
-- OverlayPlayoutLayer가 overlay_state JOIN overlay_templates로
-- 템플릿 데이터(template_data, animation_config 등)를 조회하므로
-- 해당 템플릿도 공개 접근이 필요함
CREATE POLICY "Anyone can view templates used in live sessions"
  ON overlay_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM overlay_state os
      JOIN broadcast_sessions bs ON bs.id = os.session_id
      WHERE os.template_id = overlay_templates.id
      AND bs.status = 'live'
    )
  );


-- ============================================================
-- MIGRATION: 202602130001_overlay_actions_upgrade.sql
-- ============================================================
-- 오버레이 액션 시스템 고도화
-- overlay_state에 pending_data, active_content_index 컬럼 추가

-- 운용자 확인 대기 중인 데이터 (API 결과 변경 시 임시 저장)
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS pending_data JSONB DEFAULT NULL;

-- 콘텐츠 순환(cycle_content) 현재 인덱스
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS active_content_index INT DEFAULT 0;


-- ============================================================
-- MIGRATION: 202602130002_ai_character.sql
-- ============================================================
-- ============================================================
-- AI 캐릭터 시스템: 프리셋 + 라이브 상태
-- Rive 기반 캐릭터 렌더링, 그리드 Zone 바인딩
-- ============================================================

-- 1. Rive 기반 캐릭터 프리셋
CREATE TABLE public.ai_character_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  riv_file_path TEXT NOT NULL,
  state_machine_name TEXT DEFAULT 'CharacterController',
  default_scale NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 세션별 캐릭터 라이브 상태 (Realtime 동기화 대상)
CREATE TABLE public.ai_character_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.broadcast_sessions(id) ON DELETE CASCADE NOT NULL,
  visible BOOLEAN DEFAULT false,
  position_x NUMERIC DEFAULT 50,
  position_y NUMERIC DEFAULT 50,
  scale NUMERIC DEFAULT 1.0,
  flip_x BOOLEAN DEFAULT false,
  expression TEXT DEFAULT 'neutral',
  gesture TEXT,
  speech_bubble JSONB,
  grid_template_id UUID REFERENCES public.grid_templates(id),
  zone_bounds JSONB,
  preset_id UUID REFERENCES public.ai_character_presets(id),
  z_index INT DEFAULT 100,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id)
);

-- 3. RLS 정책
ALTER TABLE public.ai_character_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_character_state ENABLE ROW LEVEL SECURITY;

-- 프리셋: 소유자만 CRUD
CREATE POLICY "ai_character_presets_owner_crud"
  ON public.ai_character_presets FOR ALL
  USING (auth.uid() = owner_id);

-- 캐릭터 상태: 인증된 사용자 모두 접근 (세션 참여자)
CREATE POLICY "ai_character_state_authenticated"
  ON public.ai_character_state FOR ALL
  USING (auth.uid() IS NOT NULL);

-- 렌더러 공개 접근 (live 세션 한정, 비인증 SELECT)
CREATE POLICY "ai_character_state_renderer_public"
  ON public.ai_character_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.broadcast_sessions bs
      WHERE bs.id = ai_character_state.session_id
        AND bs.status = 'live'
    )
  );

-- 4. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_character_state;

-- 5. Storage 버킷 (characters)
INSERT INTO storage.buckets (id, name, public)
VALUES ('characters', 'characters', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 인증된 사용자 업로드, 모두 읽기
CREATE POLICY "characters_bucket_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'characters');

CREATE POLICY "characters_bucket_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'characters' AND auth.uid() IS NOT NULL);

CREATE POLICY "characters_bucket_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'characters' AND auth.uid() = owner);


-- ============================================================
-- MIGRATION: 202602140001_ai_character_preset_config.sql
-- ============================================================
-- ============================================================
-- AI 캐릭터 프리셋 설정 확장
-- 그리드/Zone 영역 바인딩 + 기본 위치 설정을 프리셋 단위로 저장
-- ============================================================

-- 프리셋에 그리드/Zone 설정 필드 추가
ALTER TABLE public.ai_character_presets
  ADD COLUMN IF NOT EXISTS grid_template_id UUID REFERENCES public.grid_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zone_bounds JSONB,
  ADD COLUMN IF NOT EXISTS default_position_x NUMERIC DEFAULT 50,
  ADD COLUMN IF NOT EXISTS default_position_y NUMERIC DEFAULT 50;

-- zone_bounds 예시: {"x": 0, "y": 0, "width": 50, "height": 100} (% 기반)
COMMENT ON COLUMN public.ai_character_presets.grid_template_id IS '캐릭터가 활동할 그리드 템플릿 ID';
COMMENT ON COLUMN public.ai_character_presets.zone_bounds IS '선택된 Zone들의 결합 Bounds (% 기반, JSONB)';
COMMENT ON COLUMN public.ai_character_presets.default_position_x IS '캐릭터 기본 X 좌표 (Zone 내 0~100%)';
COMMENT ON COLUMN public.ai_character_presets.default_position_y IS '캐릭터 기본 Y 좌표 (Zone 내 0~100%)';


-- ============================================================
-- MIGRATION: 202602140002_ai_character_viewmodel.sql
-- ============================================================
-- =============================================================
-- AI 캐릭터 시스템: SM Input → ViewModel 전환 마이그레이션
-- ai_character_presets: 분석 결과 + 액션 매핑 JSON 추가
-- ai_character_state: 간소화 (position/expression/gesture 제거)
-- =============================================================

-- ─── ai_character_presets 구조 변경 ────────────────────────────

-- 기존 SM Input 관련 컬럼 제거
ALTER TABLE ai_character_presets
  DROP COLUMN IF EXISTS state_machine_name,
  DROP COLUMN IF EXISTS default_scale,
  DROP COLUMN IF EXISTS grid_template_id,
  DROP COLUMN IF EXISTS zone_bounds,
  DROP COLUMN IF EXISTS default_position_x,
  DROP COLUMN IF EXISTS default_position_y;

-- ViewModel 분석 결과 + 액션 매핑 컬럼 추가
ALTER TABLE ai_character_presets
  ADD COLUMN IF NOT EXISTS rive_analysis JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS action_mappings JSONB DEFAULT '[]';

-- ─── ai_character_state 간소화 ─────────────────────────────────

-- 기존 하드코딩 상태 컬럼 제거
ALTER TABLE ai_character_state
  DROP COLUMN IF EXISTS position_x,
  DROP COLUMN IF EXISTS position_y,
  DROP COLUMN IF EXISTS scale,
  DROP COLUMN IF EXISTS flip_x,
  DROP COLUMN IF EXISTS expression,
  DROP COLUMN IF EXISTS gesture,
  DROP COLUMN IF EXISTS speech_bubble,
  DROP COLUMN IF EXISTS grid_template_id,
  DROP COLUMN IF EXISTS zone_bounds,
  DROP COLUMN IF EXISTS z_index;

-- ViewModel 기반 상태 컬럼 추가
ALTER TABLE ai_character_state
  ADD COLUMN IF NOT EXISTS is_on_air BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vm_values JSONB DEFAULT '{}';


-- ============================================================
-- MIGRATION: 202602140003_fix_preset_fk.sql
-- ============================================================
-- ai_character_state.preset_id FK를 ON DELETE SET NULL로 변경
-- 프리셋 삭제 시 자동으로 참조 해제

ALTER TABLE public.ai_character_state
  DROP CONSTRAINT IF EXISTS ai_character_state_preset_id_fkey;

ALTER TABLE public.ai_character_state
  ADD CONSTRAINT ai_character_state_preset_id_fkey
    FOREIGN KEY (preset_id)
    REFERENCES public.ai_character_presets(id)
    ON DELETE SET NULL;


-- ============================================================
-- MIGRATION: 202602140004_preset_zone_columns.sql
-- ============================================================
-- ============================================================
-- AI 캐릭터 프리셋에 Zone 배치 컬럼 재추가
-- 202602140002에서 DROP했으나 위자드 Zone 선택 기능 추가로 재필요
-- ============================================================

ALTER TABLE public.ai_character_presets
  ADD COLUMN IF NOT EXISTS grid_template_id UUID REFERENCES public.grid_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zone_bounds JSONB;

COMMENT ON COLUMN public.ai_character_presets.grid_template_id IS '캐릭터가 배치될 그리드 템플릿 ID';
COMMENT ON COLUMN public.ai_character_presets.zone_bounds IS '선택된 Zone 결합 영역 ({x,y,width,height})';


-- ============================================================
-- MIGRATION: 202602190001_fonts_storage.sql
-- ============================================================
-- WebCG-K Fonts Storage Bucket & RLS 정책
-- 폰트 파일 업로드/조회를 위한 Storage 버킷 생성

-- 1. fonts 버킷 생성 (이미 존재하면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fonts',
  'fonts',
  true,
  20971520, -- 20MB limit (폰트 파일은 크기가 큰 경우가 있음)
  ARRAY[
    'font/woff2',
    'font/woff',
    'font/ttf',
    'font/otf',
    'application/font-woff2',
    'application/font-woff',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 2. 인증된 사용자는 자신의 폴더에만 업로드 가능
CREATE POLICY "Users can upload fonts to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'fonts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. 인증된 사용자는 자신의 폴더 파일만 수정 가능
CREATE POLICY "Users can update own font files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'fonts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. 인증된 사용자는 자신의 폴더 파일만 삭제 가능
CREATE POLICY "Users can delete own font files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'fonts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 5. public 버킷 — 모든 사용자가 폰트 조회 가능
CREATE POLICY "Anyone can view fonts"
ON storage.objects FOR SELECT
USING (bucket_id = 'fonts');


-- ============================================================
-- MIGRATION: 202602190002_fonts_table.sql
-- ============================================================
-- WebCG-K Fonts 메타데이터 테이블
-- 업로드된 폰트의 메타데이터 및 라이선스 정보 관리

-- 1. fonts 테이블 생성
CREATE TABLE IF NOT EXISTS fonts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 폰트 식별 정보
  family_name TEXT NOT NULL,           -- CSS font-family 이름 (예: "NotoSansKR")
  display_name TEXT NOT NULL,          -- UI 표시명 (예: "본고딕")
  style TEXT NOT NULL DEFAULT 'normal', -- normal | italic
  weight INTEGER NOT NULL DEFAULT 400, -- 100~900

  -- Storage 정보
  storage_path TEXT NOT NULL,          -- Supabase Storage 경로
  file_size INTEGER,                   -- 바이트 단위
  mime_type TEXT,                      -- font/woff2 등

  -- 분류 및 라이선스
  category TEXT NOT NULL DEFAULT 'custom'
    CHECK (category IN ('system', 'broadcast', 'custom')),
  license_type TEXT NOT NULL DEFAULT 'Unknown'
    CHECK (license_type IN ('OFL', 'Apache', 'Commercial', 'Unknown')),
  license_note TEXT,                   -- 라이선스 추가 메모 (구매처, 수량 등)

  -- 상태
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,

  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- 동일 family + weight + style 중복 방지
  UNIQUE (family_name, weight, style)
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_fonts_family ON fonts(family_name);
CREATE INDEX IF NOT EXISTS idx_fonts_category ON fonts(category);
CREATE INDEX IF NOT EXISTS idx_fonts_owner ON fonts(owner_id);

-- 3. RLS 활성화
ALTER TABLE fonts ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책: 모든 인증 사용자가 활성 폰트 조회 가능
CREATE POLICY "Authenticated users can view active fonts"
ON fonts FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true);

-- 5. RLS 정책: 인증 사용자는 자신의 폰트만 INSERT 가능
CREATE POLICY "Users can insert own fonts"
ON fonts FOR INSERT
WITH CHECK (auth.uid() = owner_id);

-- 6. RLS 정책: 자신의 폰트만 UPDATE 가능
CREATE POLICY "Users can update own fonts"
ON fonts FOR UPDATE
USING (auth.uid() = owner_id);

-- 7. RLS 정책: 자신의 폰트만 DELETE 가능
CREATE POLICY "Users can delete own fonts"
ON fonts FOR DELETE
USING (auth.uid() = owner_id);

-- 8. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_fonts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_fonts_updated_at
  BEFORE UPDATE ON fonts
  FOR EACH ROW
  EXECUTE FUNCTION update_fonts_updated_at();


-- ============================================================
-- MIGRATION: 202602230001_fix_broadcast_status_check.sql
-- ============================================================
-- broadcast_sessions.status CHECK 제약 수정
-- 기존: ('draft', 'ready', 'live', 'completed')
-- 변경: ('draft', 'ready', 'live', 'ended', 'completed')
-- 원인: 코드에서 'ended' 상태를 사용하지만 DB CHECK에서 누락

-- 기존 CHECK 제약 삭제
ALTER TABLE broadcast_sessions DROP CONSTRAINT IF EXISTS broadcast_sessions_status_check;

-- 새 CHECK 제약 추가 ('ended' 포함)
ALTER TABLE broadcast_sessions
  ADD CONSTRAINT broadcast_sessions_status_check
  CHECK (status IN ('draft', 'ready', 'live', 'ended', 'completed'));

-- 코멘트 갱신
COMMENT ON COLUMN broadcast_sessions.status IS 'draft=준비중, ready=준비완료, live=송출중, ended=송출종료, completed=완료';


-- ============================================================
-- MIGRATION: 202602240001_user_roles.sql
-- ============================================================
-- ============================================================
-- Phase A: 사용자 역할 세분화 마이그레이션
-- profiles 테이블에 role 컬럼 추가 (기존 is_admin 하위 호환 유지)
-- ============================================================

-- 1. role 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'viewer'
  CHECK (role IN (
    'system_admin',      -- 시스템 관리자 (전체 접근)
    'cg_designer',       -- CG 디자이너 (그래픽/템플릿 번들 제작)
    'cuesheet_editor',   -- 큐시트 편집자 (큐시트/NRCS 연동)
    'playout_operator',  -- 송출 오퍼레이터 (컨트롤러 조작)
    'viewer'             -- 뷰어 (읽기 전용)
  ));

-- 2. 기존 is_admin=true → system_admin 자동 마이그레이션
UPDATE profiles SET role = 'system_admin' WHERE is_admin = true AND role = 'viewer';

-- 3. role 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 4. handle_new_user 트리거 업데이트 (새 사용자 기본 role = 'viewer')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_admin, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    false,
    'viewer',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. is_admin() 함수를 role 기반으로 확장 (하위 호환)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT role = 'system_admin' OR is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 6. role 기반 권한 확인 함수
CREATE OR REPLACE FUNCTION public.has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT
      CASE
        WHEN role = 'system_admin' THEN true  -- 관리자는 모든 역할 포함
        WHEN required_role = role THEN true
        ELSE false
      END
    FROM profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 7. 프로필 관리 RLS: 관리자는 모든 프로필 조회 가능
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (public.is_admin());


-- ============================================================
-- MIGRATION: 202602240002_template_bundles.sql
-- ============================================================
-- ============================================================
-- Phase B: 템플릿 번들 시스템
-- 여러 그래픽을 CG 타입별 슬롯으로 묶는 "뉴스 CG 세트"
-- ============================================================

-- 1. 템플릿 번들 테이블
CREATE TABLE IF NOT EXISTS template_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  program_name TEXT,                     -- NRCS 프로그램 매칭 키
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bundles_owner ON template_bundles(owner_id);
CREATE INDEX IF NOT EXISTS idx_bundles_program ON template_bundles(program_name);
ALTER TABLE template_bundles ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 또는 관리자
CREATE POLICY "bundle_select" ON template_bundles
  FOR SELECT USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "bundle_insert" ON template_bundles
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "bundle_update" ON template_bundles
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "bundle_delete" ON template_bundles
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

-- 2. 번들 슬롯 테이블 (CG 타입 ↔ 그래픽 매핑)
CREATE TABLE IF NOT EXISTS bundle_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID REFERENCES template_bundles(id) ON DELETE CASCADE NOT NULL,
  cg_type TEXT NOT NULL,                 -- nrcsTypes CgTextType
  graphic_id UUID REFERENCES graphics(id) ON DELETE SET NULL,
  field_mapping JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  priority INT DEFAULT 0,
  UNIQUE(bundle_id, cg_type, graphic_id)
);

CREATE INDEX IF NOT EXISTS idx_slots_bundle ON bundle_slots(bundle_id);
ALTER TABLE bundle_slots ENABLE ROW LEVEL SECURITY;

-- RLS: 부모 번들 소유자
CREATE POLICY "slot_select" ON bundle_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (owner_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY "slot_insert" ON bundle_slots
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND owner_id = auth.uid())
  );
CREATE POLICY "slot_update" ON bundle_slots
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (owner_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY "slot_delete" ON bundle_slots
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (owner_id = auth.uid() OR public.is_admin()))
  );


-- ============================================================
-- MIGRATION: 202602240003_nrcs_cuesheets.sql
-- ============================================================
-- ============================================================
-- Phase D: NRCS 큐시트 자동 생성
-- NRCS 기사 기반 자동 큐시트 + 기존 rundowns 연결
-- ============================================================

-- 1. NRCS 큐시트 (프로그램 단위)
CREATE TABLE IF NOT EXISTS nrcs_cuesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  program_name TEXT NOT NULL,           -- NRCS 프로그램명
  program_date DATE NOT NULL,           -- 방송일
  bundle_id UUID REFERENCES template_bundles(id) ON DELETE SET NULL,
  linked_rundown_id UUID REFERENCES rundowns(id) ON DELETE SET NULL,  -- 기존 런다운 연결
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'onair', 'done')),
  total_items INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nrcs_cs_owner ON nrcs_cuesheets(owner_id);
CREATE INDEX IF NOT EXISTS idx_nrcs_cs_date ON nrcs_cuesheets(program_date);
ALTER TABLE nrcs_cuesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nrcs_cs_select" ON nrcs_cuesheets
  FOR SELECT USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "nrcs_cs_insert" ON nrcs_cuesheets
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "nrcs_cs_update" ON nrcs_cuesheets
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "nrcs_cs_delete" ON nrcs_cuesheets
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

-- 2. NRCS 큐시트 아이템 (기사 단위)
CREATE TABLE IF NOT EXISTS nrcs_cuesheet_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuesheet_id UUID REFERENCES nrcs_cuesheets(id) ON DELETE CASCADE NOT NULL,
  nrcs_item_id TEXT NOT NULL,              -- NRCS 기사 원본 ID
  slug TEXT NOT NULL,                      -- "PKG-뉴스9-추경안"
  title TEXT NOT NULL,
  reporter TEXT,
  article_type TEXT,
  item_order INT DEFAULT 0,
  cg_data JSONB DEFAULT '[]',             -- 원본 CgTextItem[] 스냅샷
  mapping_result JSONB DEFAULT '{}',       -- MappedCgResult[] 매핑 결과 캐시
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'mapped', 'approved', 'aired')),
  linked_rundown_item_id UUID REFERENCES rundown_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nrcs_ci_cuesheet ON nrcs_cuesheet_items(cuesheet_id);
CREATE INDEX IF NOT EXISTS idx_nrcs_ci_order ON nrcs_cuesheet_items(item_order);
ALTER TABLE nrcs_cuesheet_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nrcs_ci_select" ON nrcs_cuesheet_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (owner_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY "nrcs_ci_insert" ON nrcs_cuesheet_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND owner_id = auth.uid())
  );
CREATE POLICY "nrcs_ci_update" ON nrcs_cuesheet_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (owner_id = auth.uid() OR public.is_admin()))
  );
CREATE POLICY "nrcs_ci_delete" ON nrcs_cuesheet_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (owner_id = auth.uid() OR public.is_admin()))
  );


-- ============================================================
-- MIGRATION: 202604070001_cuesheet_data_source_binding.sql
-- ============================================================
-- ============================================================
-- NRCS 큐시트 고도화: 데이터 소스 바인딩 아키텍처
-- 큐시트와 외부 데이터(NRCS, CSV)의 단단한 결합을 위한 스키마 확장
--
-- Why 별도 테이블(cuesheet_data_sources)?
--   기존 custom_data_sources는 오버레이 API 연동 전용(endpoint/headers 중심).
--   큐시트용 데이터소스는 raw_data(행 배열)와 column_schema(컬럼 정의)를
--   저장하여 엑셀 테이블 뷰를 지원해야 하므로 구조가 근본적으로 다름.
-- ============================================================

-- 1. 큐시트 데이터 소스 테이블 신설
-- 비유: 엑셀 파일 하나 = cuesheet_data_sources 레코드 하나
-- raw_data = 시트의 모든 행, column_schema = 헤더 행
CREATE TABLE IF NOT EXISTS cuesheet_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- 식별 정보
  name TEXT NOT NULL,                              -- "KBS 뉴스9 2026-04-07"
  source_type TEXT NOT NULL CHECK (source_type IN ('nrcs', 'csv')),

  -- 소스 설정 (타입별 구조가 다름)
  -- NRCS: {"bureau": "HQ", "program_id": "...", "program_name": "KBS 뉴스9", "date": "2026-04-07"}
  -- CSV:  {"filename": "news_items.csv", "delimiter": ",", "encoding": "utf-8"}
  config JSONB DEFAULT '{}',

  -- 원본 데이터 (엑셀 테이블의 행 배열)
  -- 각 행: {"_row_id": "uuid", "slug": "PKG-추경", "title": "추경안 통과", ...}
  -- _row_id는 행 추적용 고유 키 — 데이터 변경 시 diff 매칭에 사용
  raw_data JSONB DEFAULT '[]',

  -- 컬럼 스키마 (엑셀 테이블의 헤더)
  -- [{"key": "slug", "label": "슬러그", "type": "text"}, {"key": "title", "label": "제목", "type": "text"}, ...]
  column_schema JSONB DEFAULT '[]',

  row_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_ds_owner ON cuesheet_data_sources(owner_id);
CREATE INDEX IF NOT EXISTS idx_cs_ds_type ON cuesheet_data_sources(source_type);
ALTER TABLE cuesheet_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs_ds_select" ON cuesheet_data_sources
  FOR SELECT USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "cs_ds_insert" ON cuesheet_data_sources
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "cs_ds_update" ON cuesheet_data_sources
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin());
CREATE POLICY "cs_ds_delete" ON cuesheet_data_sources
  FOR DELETE USING (auth.uid() = owner_id OR public.is_admin());

-- 2. nrcs_cuesheets 테이블 확장
-- 큐시트가 어떤 소스에서 왔는지 추적
ALTER TABLE nrcs_cuesheets
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'nrcs', 'csv')),
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES cuesheet_data_sources(id) ON DELETE SET NULL;

-- 기존 큐시트는 자동으로 source_type = 'manual' (DEFAULT)

CREATE INDEX IF NOT EXISTS idx_nrcs_cs_source ON nrcs_cuesheets(source_id);

-- 3. nrcs_cuesheet_items 테이블 확장
-- 각 아이템이 데이터소스의 어떤 행에서 왔는지 추적 (diff 동기화용)
ALTER TABLE nrcs_cuesheet_items
  ADD COLUMN IF NOT EXISTS source_row_id TEXT;

-- source_row_id로 빠른 매칭을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_nrcs_ci_source_row ON nrcs_cuesheet_items(source_row_id);

-- 4. Realtime 활성화 (이미 활성화되어 있을 수 있으므로 IF NOT EXISTS 사용 불가 — 별도 처리)
-- Supabase에서 테이블별 Realtime은 supabase_realtime publication에 추가
-- 이 부분은 Dashboard UI에서 수동 설정하거나 아래 명령 사용:
DO $$
BEGIN
  -- cuesheet_data_sources를 Realtime 발행에 추가
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'cuesheet_data_sources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cuesheet_data_sources;
  END IF;
END $$;


-- ============================================================
-- MIGRATION: 202604160001_broadcast_segments.sql
-- ============================================================
-- ============================================================
-- Phase D-Tab: 타임라인 세그먼트 (Nested Sequence Tab 모델)
--
-- ■ Why 별도 테이블?
--   JSON 필드(broadcast_sessions.timeline_data)에 세그먼트를 넣으면:
--   1) nrcs_cuesheet_items FK 불가 → 순서 변경/삭제 시 무결성 깨짐
--   2) 세그먼트 단위 Realtime 구독 불가 → 세션 전체를 감시해야 함
--   3) 멀티 사용자 동시 편집 시 JSON 전체 교체 → 충돌 위험
--   별도 테이블은 이 3가지를 모두 해결한다.
-- ============================================================

-- 1. 세그먼트 테이블 (뉴스 아이템 1개 = 세그먼트 1개)
CREATE TABLE IF NOT EXISTS broadcast_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 소속 세션
  session_id UUID REFERENCES broadcast_sessions(id) ON DELETE CASCADE NOT NULL,
  -- NRCS 큐시트 아이템 연결 (null이면 수동 생성된 세그먼트)
  cuesheet_item_id UUID REFERENCES nrcs_cuesheet_items(id) ON DELETE SET NULL,
  -- 표시 정보
  label TEXT NOT NULL,
  reporter TEXT,
  slug TEXT,
  -- 표시 순서 (NRCS item_order와 동기화)
  segment_order INT DEFAULT 0,
  -- 시각적 구분색 (rgba 문자열)
  color TEXT NOT NULL DEFAULT 'rgba(59, 130, 246, 0.12)',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_segments_session ON broadcast_segments(session_id);
CREATE INDEX IF NOT EXISTS idx_segments_order ON broadcast_segments(session_id, segment_order);

-- 3. RLS
ALTER TABLE broadcast_segments ENABLE ROW LEVEL SECURITY;

-- 조회: 세션 소유자 + 관리자
CREATE POLICY "segments_select" ON broadcast_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM broadcast_sessions WHERE id = session_id AND created_by = auth.uid())
    OR public.is_admin()
  );

-- 생성: 세션 소유자
CREATE POLICY "segments_insert" ON broadcast_segments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM broadcast_sessions WHERE id = session_id AND created_by = auth.uid())
  );

-- 수정: 세션 소유자 + 관리자
CREATE POLICY "segments_update" ON broadcast_segments
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM broadcast_sessions WHERE id = session_id AND created_by = auth.uid())
    OR public.is_admin()
  );

-- 삭제: 세션 소유자 + 관리자
CREATE POLICY "segments_delete" ON broadcast_segments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM broadcast_sessions WHERE id = session_id AND created_by = auth.uid())
    OR public.is_admin()
  );

-- 4. 코멘트
COMMENT ON TABLE broadcast_segments IS '타임라인 세그먼트 — 뉴스 아이템 1개 = 1세그먼트. Premiere의 Nested Sequence 개념.';
COMMENT ON COLUMN broadcast_segments.cuesheet_item_id IS 'NRCS 큐시트 아이템 FK. 순서 변경 시 segment_order 자동 동기화 지원.';
COMMENT ON COLUMN broadcast_segments.segment_order IS 'NRCS item_order와 동기되어 탭 바 표시 순서를 결정.';
COMMENT ON COLUMN broadcast_segments.color IS '세그먼트 배경 밴드 색상 (rgba). 타임라인 전체 뷰에서 시각적 구분.';


-- ============================================================
-- MIGRATION: 202604200001_fathom_schema.sql
-- ============================================================
-- ======================================================================
-- Fathom: 빙산 모델 AI 뉴스룸 — 전체 스키마
-- ======================================================================
-- Why: WebCG-K의 기존 Supabase에 fathom_ prefix 테이블을 추가하여
-- context_id(탯줄) FK 무결성과 공유 인증을 활용

-- pgvector 확장 활성화 (이미 활성화되어 있을 수 있음)
CREATE EXTENSION IF NOT EXISTS vector;

-- ======================================================================
-- 1. fathom_stories — 뉴스 기사 (빙산의 수면 위 10%)
-- ======================================================================
CREATE TABLE IF NOT EXISTS fathom_stories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bureau TEXT,                -- 총국 (서울/정치/경제/사회/국제...)
  program TEXT,               -- 프로그램 (뉴스9/뉴스데스크...)
  broadcast_script TEXT,      -- 방송 원고 (10% — 450자 내외)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'aired', 'archived')),
  metadata JSONB DEFAULT '{}',
  aired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Why: 기자 본인 기사만 수정 가능, 전체 조회는 인증 사용자 누구나 가능
-- (뉴스룸 내부에서는 다른 기자의 기사도 참조해야 하므로)
ALTER TABLE fathom_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fathom_stories_select_authenticated"
  ON fathom_stories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "fathom_stories_insert_own"
  ON fathom_stories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "fathom_stories_update_own"
  ON fathom_stories FOR UPDATE
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE POLICY "fathom_stories_delete_own"
  ON fathom_stories FOR DELETE
  TO authenticated
  USING (auth.uid() = reporter_id);

-- ======================================================================
-- 2. fathom_contexts — 맥락 자료 부모 (빙산의 90% 메타데이터)
-- ======================================================================
CREATE TABLE IF NOT EXISTS fathom_contexts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL DEFAULT 'memo'
    CHECK (context_type IN ('pdf', 'excel', 'transcript', 'memo', 'link', 'note', 'image')),
  title TEXT NOT NULL DEFAULT '',
  ai_summary TEXT,              -- AI 전체 요약 (Gemini Flash)
  file_path TEXT,               -- Supabase Storage 경로
  source_url TEXT,              -- 원본 URL (link 타입)
  -- 3단계 보안 등급 — 다크 데이터 법적 리스크 방지
  clearance_level TEXT NOT NULL DEFAULT 'L1_PRIVATE'
    CHECK (clearance_level IN ('L1_PRIVATE', 'L2_INTERNAL', 'L3_PUBLIC_SAFE')),
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'done', 'failed')),
  is_used_in_broadcast BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE fathom_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fathom_contexts_select_authenticated"
  ON fathom_contexts FOR SELECT TO authenticated USING (true);

CREATE POLICY "fathom_contexts_insert_authenticated"
  ON fathom_contexts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "fathom_contexts_update_authenticated"
  ON fathom_contexts FOR UPDATE TO authenticated USING (true);

CREATE POLICY "fathom_contexts_delete_story_owner"
  ON fathom_contexts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM fathom_stories
      WHERE fathom_stories.id = fathom_contexts.story_id
      AND fathom_stories.reporter_id = auth.uid()
    )
  );

-- ======================================================================
-- 3. fathom_context_chunks — RAG 벡터 검색 단위 (1:N)
-- ======================================================================
-- Why: 50페이지 PDF를 통째로 임베딩하면 토큰 한계로 맥락이 희석됨
-- 문단 단위로 분리하여 HNSW 인덱스로 초고속 시멘틱 검색
CREATE TABLE IF NOT EXISTS fathom_context_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  context_id UUID NOT NULL REFERENCES fathom_contexts(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),       -- text-embedding-3-large
  metadata JSONB DEFAULT '{}',  -- page_number, sheet_name 등
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- HNSW 인덱스 — 순수 벡터 거리 연산(<=>)에서만 가속
-- Why: ORDER BY 절에 exp() 같은 함수를 섞으면 인덱스 무력화 → Full Table Scan
CREATE INDEX IF NOT EXISTS fathom_chunks_embedding_idx
  ON fathom_context_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

ALTER TABLE fathom_context_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fathom_chunks_select_authenticated"
  ON fathom_context_chunks FOR SELECT TO authenticated USING (true);

CREATE POLICY "fathom_chunks_insert_authenticated"
  ON fathom_context_chunks FOR INSERT TO authenticated WITH CHECK (true);

-- ======================================================================
-- 4. fathom_entities — 지식 그래프 엔티티
-- ======================================================================
CREATE TABLE IF NOT EXISTS fathom_entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('person', 'organization', 'place', 'concept', 'statistic')),
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE fathom_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fathom_entities_select_authenticated"
  ON fathom_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "fathom_entities_insert_authenticated"
  ON fathom_entities FOR INSERT TO authenticated WITH CHECK (true);

-- ======================================================================
-- 5. fathom_entity_relations — 엔티티 관계
-- ======================================================================
CREATE TABLE IF NOT EXISTS fathom_entity_relations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_entity_id UUID NOT NULL REFERENCES fathom_entities(id) ON DELETE CASCADE,
  target_entity_id UUID NOT NULL REFERENCES fathom_entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL
    CHECK (relation_type IN ('mentioned_by', 'related_to', 'contradicts', 'supports')),
  confidence FLOAT DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE fathom_entity_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fathom_entity_relations_select_authenticated"
  ON fathom_entity_relations FOR SELECT TO authenticated USING (true);

-- ======================================================================
-- 6. fathom_cg_links — 탯줄 (Fathom ↔ WebCG-K)
-- ======================================================================
-- Why: 이 테이블이 빙산 모델의 핵심 브릿지
-- WebCG-K의 CG 블록과 Fathom 기사를 연결하여
-- 생방송 송출 시 세컨드 스크린이 맥락을 역추적하는 통로
CREATE TABLE IF NOT EXISTS fathom_cg_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  cg_item_id UUID NOT NULL,  -- WebCG-K CG 블록/큐시트 아이템 ID
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary', 'supplementary')),
  cg_system TEXT NOT NULL DEFAULT 'webcgk',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(story_id, cg_item_id)
);

ALTER TABLE fathom_cg_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fathom_cg_links_select_authenticated"
  ON fathom_cg_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "fathom_cg_links_insert_authenticated"
  ON fathom_cg_links FOR INSERT TO authenticated WITH CHECK (true);

-- ======================================================================
-- 7. fathom_second_screen_cards — 세컨드 스크린 카드 (Pre-baked)
-- ======================================================================
-- Why: 생방송 시 DB 직접 조회 대신 사전 구운(Pre-baked) JSON을
-- CDN에 배포하여 Thundering Herd 문제 방지
CREATE TABLE IF NOT EXISTS fathom_second_screen_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL
    CHECK (card_type IN ('summary', 'chart', 'timeline', 'quote', 'document', 'raw_data')),
  content JSONB NOT NULL DEFAULT '{}',
  display_order INT NOT NULL DEFAULT 0,
  cdn_url TEXT,                -- Pre-baked CDN URL
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE fathom_second_screen_cards ENABLE ROW LEVEL SECURITY;

-- 세컨드 스크린: L3_PUBLIC_SAFE + is_published 카드만 비인증 조회 가능
CREATE POLICY "fathom_cards_select_public"
  ON fathom_second_screen_cards FOR SELECT
  USING (is_published = true);

CREATE POLICY "fathom_cards_insert_authenticated"
  ON fathom_second_screen_cards FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "fathom_cards_update_authenticated"
  ON fathom_second_screen_cards FOR UPDATE
  TO authenticated USING (true);

-- ======================================================================
-- 8. 2-Pass Re-ranking RAG 함수
-- ======================================================================
-- Why: HNSW 인덱스는 순수 벡터 거리에서만 작동
-- 1-Pass: 순수 거리로 Top 100 추출 (인덱스 가속)
-- 2-Pass: 100개에 대해서만 Time-Decay 적용 후 Top 10 (메모리 연산)
CREATE OR REPLACE FUNCTION fathom_match_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  decay_rate float DEFAULT 0.01,
  required_clearance text DEFAULT 'L1_PRIVATE'
)
RETURNS TABLE (
  chunk_id uuid,
  context_id uuid,
  story_id uuid,
  chunk_text text,
  context_title text,
  ai_summary text,
  similarity float,
  time_weighted_score float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH top_matches AS (
    -- 1-Pass: 순수 벡터 거리 → HNSW 인덱스 가속
    SELECT
      cc.id AS chunk_id,
      cc.context_id,
      c.story_id,
      cc.chunk_text,
      c.title AS context_title,
      c.ai_summary,
      1 - (cc.embedding <=> query_embedding) AS similarity,
      c.created_at
    FROM fathom_context_chunks cc
    JOIN fathom_contexts c ON c.id = cc.context_id
    WHERE c.clearance_level >= required_clearance
      AND c.processing_status = 'done'
    ORDER BY cc.embedding <=> query_embedding
    LIMIT 100
  )
  -- 2-Pass: Time-Decay 적용 (메모리상 100개만 정렬)
  SELECT
    tm.chunk_id,
    tm.context_id,
    tm.story_id,
    tm.chunk_text,
    tm.context_title,
    tm.ai_summary,
    tm.similarity::float,
    (tm.similarity * exp(-decay_rate * extract(epoch from now() - tm.created_at) / 86400))::float
      AS time_weighted_score
  FROM top_matches tm
  WHERE tm.similarity > match_threshold
  ORDER BY time_weighted_score DESC
  LIMIT match_count;
END;
$$;

-- ======================================================================
-- 9. Storage 버킷
-- ======================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('fathom-files', 'fathom-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: 인증 사용자만 업로드/다운로드
CREATE POLICY "fathom_files_select" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'fathom-files');

CREATE POLICY "fathom_files_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'fathom-files');


-- ============================================================
-- MIGRATION: 202604210001_fathom_embedding_768d.sql
-- ============================================================
-- ======================================================================
-- Fathom: vector 차원 변경 (1536 → 768)
-- ======================================================================
-- Why: OpenAI text-embedding-3-large(1536d, $0.13/1M) 에서
-- Google text-embedding-004(768d, 무료)로 교체
-- API 키 1개로 통일, 비용 $0

-- 1. 기존 인덱스 삭제
DROP INDEX IF EXISTS fathom_chunks_embedding_idx;

-- 2. 컬럼 타입 변경
ALTER TABLE fathom_context_chunks
  ALTER COLUMN embedding TYPE vector(768);

-- 3. 새 HNSW 인덱스 생성
CREATE INDEX fathom_chunks_embedding_idx
  ON fathom_context_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- 4. RPC 함수 업데이트 (768차원)
CREATE OR REPLACE FUNCTION fathom_match_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  decay_rate float DEFAULT 0.01,
  required_clearance text DEFAULT 'L1_PRIVATE'
)
RETURNS TABLE (
  chunk_id uuid,
  context_id uuid,
  story_id uuid,
  chunk_text text,
  context_title text,
  ai_summary text,
  similarity float,
  time_weighted_score float
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH top_matches AS (
    SELECT
      cc.id AS chunk_id,
      cc.context_id,
      c.story_id,
      cc.chunk_text,
      c.title AS context_title,
      c.ai_summary,
      1 - (cc.embedding <=> query_embedding) AS similarity,
      c.created_at
    FROM fathom_context_chunks cc
    JOIN fathom_contexts c ON c.id = cc.context_id
    WHERE c.clearance_level >= required_clearance
      AND c.processing_status = 'done'
    ORDER BY cc.embedding <=> query_embedding
    LIMIT 100
  )
  SELECT
    tm.chunk_id,
    tm.context_id,
    tm.story_id,
    tm.chunk_text,
    tm.context_title,
    tm.ai_summary,
    tm.similarity::float,
    (tm.similarity * exp(-decay_rate * extract(epoch from now() - tm.created_at) / 86400))::float
      AS time_weighted_score
  FROM top_matches tm
  WHERE tm.similarity > match_threshold
  ORDER BY time_weighted_score DESC
  LIMIT match_count;
END;
$$;


-- ============================================================
-- MIGRATION: 202604220001_ai_preset_public_read.sql
-- ============================================================
-- ============================================================
-- AI 캐릭터 프리셋: 렌더러 공개 읽기 정책 추가
-- Why? OBS 렌더러는 비인증 상태로 접속하는데,
--   ai_character_presets 테이블에는 owner_id 기반 CRUD 정책만 있어서
--   비인증 클라이언트에서 프리셋(riv_file_path 포함)을 읽을 수 없음.
--   → Rive 캐릭터가 렌더러에서 보이지 않는 근본 원인.
-- ============================================================

-- 렌더러 공개 접근: 프리셋 읽기 (비인증 SELECT 허용)
-- 보안: 프리셋 데이터는 민감하지 않음 (Rive 파일 경로, 표시 이름 등)
-- 쓰기/삭제는 여전히 소유자만 가능 (기존 정책 유지)
DROP POLICY IF EXISTS "ai_character_presets_public_read" ON public.ai_character_presets;

CREATE POLICY "ai_character_presets_public_read"
  ON public.ai_character_presets FOR SELECT
  USING (true);


-- ============================================================
-- MIGRATION: 202604220002_fathom_programs.sql
-- ============================================================
-- ============================================================
-- Fathom NRCS 고도화: 프로그램 편성 + 기사 배정 스키마
-- ============================================================
-- ■ Why 별도 테이블?
--   fathom_stories.program은 단순 TEXT 필드 → 편성표(Grid) 관리 불가.
--   프로그램을 정규화하면 요일별/시간대별 그리드 표시,
--   기사→프로그램 N:M 매핑, CG 텍스트 사전 정의가 가능해진다.
--
-- ■ 실무 비유:
--   실제 NRCS(iNEWS, ENPS)에서 편성표는 "어떤 프로그램이 언제 방송되는가"를 정의하고,
--   큐시트(Rundown)는 "그 프로그램에 어떤 기사들이 어떤 순서로 들어가는가"를 관리한다.
--   이 마이그레이션은 두 계층을 Fathom에 추가한다.
-- ============================================================

-- 1. 프로그램 테이블 (뉴스 프로그램 = 방송 시간대)
-- ■ Why weekdays 배열?
--   같은 프로그램이 평일에만 방송되거나 주말만 방송될 수 있으므로
--   INTEGER 배열로 유연하게 표현 (1=월~7=일)
CREATE TABLE IF NOT EXISTS fathom_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                      -- '뉴스9', '뉴스12' 등
  code TEXT UNIQUE,                        -- 'NEWS9', 'NEWS12' — API 연동용 고유 코드
  air_time TIME,                           -- 방송 시작 시간 (21:00, 12:00...)
  duration_minutes INT DEFAULT 30,         -- 방송 시간(분)
  weekdays INTEGER[] DEFAULT '{1,2,3,4,5}', -- 방송 요일 (1=월~7=일)
  color TEXT DEFAULT 'rgba(59, 130, 246, 0.15)', -- UI 구분색
  is_active BOOLEAN DEFAULT true,          -- 현재 편성 중 여부
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 기사 배정 테이블 (기사 → 프로그램 매핑)
-- ■ Why N:M?
--   동일 기사가 뉴스9과 뉴스12에 모두 배정될 수 있다.
--   각 프로그램에서 CG 텍스트가 다를 수 있으므로 배정별로 분리.
CREATE TABLE IF NOT EXISTS fathom_story_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES fathom_programs(id) ON DELETE CASCADE,
  air_date DATE NOT NULL,               -- 방송일 (2026-04-22 등)
  segment_order INT DEFAULT 0,          -- 프로그램 내 기사 순서
  -- CG 텍스트 배열: [{type: "band", text: "..."}, {type: "super", name: "...", title: "..."}, ...]
  cg_texts JSONB DEFAULT '[]'::jsonb,
  -- ■ Why status?
  --   편성 확정 전 '대기' 상태로 두었다가 데스크 승인 시 '확정'으로 전환.
  --   방송 후 '완료'로 변경하여 히스토리 추적.
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'aired', 'killed')),
  notes TEXT,                           -- 편집 메모
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 복합 유니크: 같은 기사가 같은 프로그램+날짜에 중복 배정 방지
  UNIQUE(story_id, program_id, air_date)
);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_programs_active ON fathom_programs(is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_program_date ON fathom_story_assignments(program_id, air_date);
CREATE INDEX IF NOT EXISTS idx_assignments_story ON fathom_story_assignments(story_id);
CREATE INDEX IF NOT EXISTS idx_assignments_date ON fathom_story_assignments(air_date);

-- 4. RLS
ALTER TABLE fathom_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fathom_story_assignments ENABLE ROW LEVEL SECURITY;

-- 프로그램: 인증 사용자 전체 조회 가능 (방송 편성표는 사내 공개)
DROP POLICY IF EXISTS "programs_select" ON fathom_programs;
CREATE POLICY "programs_select" ON fathom_programs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "programs_insert" ON fathom_programs;
CREATE POLICY "programs_insert" ON fathom_programs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "programs_update" ON fathom_programs;
CREATE POLICY "programs_update" ON fathom_programs
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- 배정: 인증 사용자 전체 조회 + 편집 가능
DROP POLICY IF EXISTS "assignments_select" ON fathom_story_assignments;
CREATE POLICY "assignments_select" ON fathom_story_assignments
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assignments_insert" ON fathom_story_assignments;
CREATE POLICY "assignments_insert" ON fathom_story_assignments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assignments_update" ON fathom_story_assignments;
CREATE POLICY "assignments_update" ON fathom_story_assignments
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "assignments_delete" ON fathom_story_assignments;
CREATE POLICY "assignments_delete" ON fathom_story_assignments
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 5. 시드 데이터 — KBS 주요 뉴스 프로그램
INSERT INTO fathom_programs (name, code, air_time, duration_minutes, weekdays, color) VALUES
  ('KBS 뉴스9',      'NEWS9',     '21:00', 50, '{1,2,3,4,5,6,7}', 'rgba(59, 130, 246, 0.15)'),
  ('KBS 뉴스12',     'NEWS12',    '12:00', 25, '{1,2,3,4,5}',     'rgba(16, 185, 129, 0.15)'),
  ('KBS 930뉴스',    'NEWS930',   '09:30', 25, '{1,2,3,4,5,6}',   'rgba(245, 158, 11, 0.15)'),
  ('KBS 뉴스라인',   'NEWSLINE',  '17:00', 60, '{1,2,3,4,5}',     'rgba(139, 92, 246, 0.15)'),
  ('KBS 뉴스광장',   'NEWSPLAZA', '06:00', 120, '{1,2,3,4,5,6,7}', 'rgba(236, 72, 153, 0.15)'),
  ('KBS 재난방송',   'EMERGENCY', NULL,    0,  '{1,2,3,4,5,6,7}', 'rgba(239, 68, 68, 0.15)')
ON CONFLICT (code) DO NOTHING;

-- 6. 코멘트
COMMENT ON TABLE fathom_programs IS '뉴스 프로그램 편성표 — NRCS의 Program 엔티티에 대응';
COMMENT ON TABLE fathom_story_assignments IS '기사→프로그램 배정 — NRCS의 Rundown Item에 대응. CG 텍스트 사전 정의 포함';
COMMENT ON COLUMN fathom_story_assignments.cg_texts IS 'CG 텍스트 배열 [{type, text, ...}]. WebCG-K 내보내기 시 타임라인 블록으로 변환';
COMMENT ON COLUMN fathom_story_assignments.status IS 'pending=대기, confirmed=확정, aired=방송완료, killed=폐기';


-- ============================================================
-- MIGRATION: 202604270001_fathom_cg_links.sql
-- ============================================================
-- ============================================================
-- Fathom Phase 3: CG 탯줄 (Umbilical Cord) 테이블
-- ============================================================
-- ■ Why "탯줄"?
--   Fathom 기사(story)와 WebCG-K CG 블록(timeline block) 사이의
--   양방향 연결 고리. 이 링크가 있어야:
--   1) 세컨드 스크린이 "지금 방송 중인 CG → 원본 기사" 역추적 가능
--   2) 기사 수정 시 연결된 CG 블록에 "핫 수정 알림" 전달 가능
--   3) 편성 변경 시 영향받는 CG 블록 목록 자동 조회 가능
-- ============================================================

CREATE TABLE IF NOT EXISTS fathom_cg_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Fathom 기사 (출발점)
  story_id UUID NOT NULL REFERENCES fathom_stories(id) ON DELETE CASCADE,
  -- WebCG-K CG 블록 ID (timeline_data 내 블록의 id 문자열)
  -- ■ Why TEXT?
  --   timeline_data JSONB 안의 블록 id는 UUID가 아니라
  --   "fathom-{assignmentId}-cg-{index}" 형식의 문자열이므로 TEXT 사용
  cg_item_id TEXT NOT NULL,
  -- 연결 유형: primary(내보내기 자동 생성), manual(기자가 직접 연결)
  link_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (link_type IN ('primary', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스: 양방향 조회 최적화
CREATE INDEX IF NOT EXISTS idx_cg_links_story ON fathom_cg_links(story_id);
CREATE INDEX IF NOT EXISTS idx_cg_links_cg_item ON fathom_cg_links(cg_item_id);

-- RLS
ALTER TABLE fathom_cg_links ENABLE ROW LEVEL SECURITY;

-- Why DROP IF EXISTS?
-- 멱등성 보장 — 로컬 개발 환경에서 db reset 없이 재적용 가능
DROP POLICY IF EXISTS "cg_links_select" ON fathom_cg_links;
CREATE POLICY "cg_links_select" ON fathom_cg_links
  FOR SELECT USING (true);  -- 읽기는 전체 허용 (세컨드 스크린 역추적에 필요)

DROP POLICY IF EXISTS "cg_links_insert" ON fathom_cg_links;
CREATE POLICY "cg_links_insert" ON fathom_cg_links
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cg_links_delete" ON fathom_cg_links;
CREATE POLICY "cg_links_delete" ON fathom_cg_links
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 코멘트
COMMENT ON TABLE fathom_cg_links IS 'Fathom 기사 ↔ WebCG-K CG 블록 양방향 연결 (탯줄)';
COMMENT ON COLUMN fathom_cg_links.link_type IS 'primary=내보내기 자동 생성, manual=기자 직접 연결';


-- ============================================================
-- MIGRATION: 202604290001_rundown_sections.sql
-- ============================================================
-- WebCG-K: 런다운 섹션 데이터 컬럼 추가
-- Why JSON 컬럼?
-- 런다운과 1:1 라이프사이클이므로 별도 rundown_sections 테이블보다
-- JSON이 스키마 변경 최소화에 적합. 삭제/복사 시 런다운과 함께 이동.

-- 런다운에 섹션 메타데이터 저장 (배열: [{id, name, color, order}])
ALTER TABLE rundowns
  ADD COLUMN IF NOT EXISTS sections_data JSONB DEFAULT '[]'::jsonb;

-- 런다운 아이템에 소속 섹션 ID 저장
ALTER TABLE rundown_items
  ADD COLUMN IF NOT EXISTS section_id TEXT;

-- section_id 인덱스 (섹션별 아이템 필터링 성능)
CREATE INDEX IF NOT EXISTS idx_rundown_items_section_id
  ON rundown_items (section_id)
  WHERE section_id IS NOT NULL;

COMMENT ON COLUMN rundowns.sections_data IS '런다운 섹션 그룹화 데이터 (JSON 배열: [{id, name, color, order}])';
COMMENT ON COLUMN rundown_items.section_id IS '소속 섹션 ID (rundowns.sections_data 내 id와 매칭)';


-- ============================================================
-- MIGRATION: 202604300001_overlay_plugin_system.sql
-- ============================================================
-- ============================================================
-- WebCG-K Migration: Overlay Plugin System (Phase 0)
-- overlay_templates + overlay_state 테이블에 플러그인 전용 컬럼 추가
--
-- ■ Why ALTER TABLE + ADD COLUMN (새 테이블 X)?
--   기존 SVG 오버레이(graphic_data 기반)와 신규 HTML 플러그인(source_code 기반)을
--   하나의 테이블에서 plugin_type 필드로 분기하여 공존시킨다.
--   별도 테이블을 만들면 overlay_state와의 조인/RLS/Realtime 설정을 중복해야 하므로
--   기존 테이블 확장이 유지보수 비용이 낮다.
--
-- ■ 하위 호환 전략:
--   plugin_type DEFAULT 'svg' → 기존 행은 자동으로 SVG 모드 유지
--   source_code 등 신규 컬럼은 NULL 허용 → 기존 데이터 무영향
-- ============================================================

-- ─── 1. overlay_templates 확장 ─────────────────────────────────

-- plugin_type: 렌더링 분기 키.
--   'svg'  → 기존 GraphicPreviewRenderer로 렌더링 (graphic_data 사용)
--   'html' → 신규 sandboxed iframe으로 렌더링 (source_code 사용)
ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS plugin_type TEXT DEFAULT 'svg';

-- source_code: HTML 플러그인의 소스 코드 (JSON: { html, css, js })
-- ■ Why JSONB?
--   3개 파일(HTML/CSS/JS)을 하나의 컬럼에 원자적으로 저장.
--   부분 업데이트가 필요 없고, 항상 3파일을 함께 읽고 쓰므로 JSONB가 적합.
ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS source_code JSONB;

-- dashboard_schema: 대시보드 패널 자동 생성용 JSON Schema
-- 플러그인 제어 UI의 필드 목록/타입/기본값을 정의.
-- 예: { "properties": { "homeScore": { "type": "number", "title": "홈 점수", "default": 0 } } }
ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS dashboard_schema JSONB;

-- replicant_defaults: Replicant(실시간 데이터 바인딩) 기본값
-- 세션에 오버레이를 추가할 때 overlay_state.replicant_data의 초기값으로 복사.
ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS replicant_defaults JSONB;

-- thumbnail: 플러그인 프리뷰 썸네일 URL
-- 갤러리/카드에서 시각적으로 구분하기 위한 스크린샷.
-- Phase 1에서는 수동 업로드, 추후 자동 캡처 연동 예정.
ALTER TABLE overlay_templates
  ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- ─── 2. overlay_state 확장 ──────────────────────────────────────

-- replicant_data: 현재 Replicant 데이터 (대시보드에서 갱신)
-- current_data와 분리하여 기존 SVG 오버레이 로직에 영향을 주지 않음.
-- ■ Why 별도 컬럼?
--   current_data는 기존 SVG 오버레이의 데이터 흐름에서 사용 중.
--   플러그인 전용 데이터 채널을 분리하여 충돌 방지.
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS replicant_data JSONB;

-- pending_data: 승인 대기 중인 데이터 (대시보드에서 변경했으나 아직 적용 안 됨)
-- 이미 존재할 수 있으므로 IF NOT EXISTS 사용
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS pending_data JSONB;

-- active_content_index: 콘텐츠 순환 인덱스 (cycle_content 액션용)
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS active_content_index INT DEFAULT 0;

-- animation_state 체크 제약 조건 확장 (기존 'idle','in','loop','out' + 커스텀 상태)
-- ■ Why DROP + RE-ADD?
--   기존 CHECK가 4개 고정값만 허용. 플러그인에서 커스텀 애니메이션 이름을
--   사용할 수 있도록 제약을 완화한다.
ALTER TABLE overlay_state DROP CONSTRAINT IF EXISTS overlay_state_animation_state_check;

-- ─── 3. 인덱스 추가 ────────────────────────────────────────────

-- plugin_type별 조회 최적화 (플러그인 목록 필터링)
CREATE INDEX IF NOT EXISTS idx_overlay_templates_plugin_type
  ON overlay_templates(plugin_type);

-- ─── 4. 코멘트 ──────────────────────────────────────────────────

COMMENT ON COLUMN overlay_templates.plugin_type IS
  '렌더링 모드: svg(기존 GraphicPreviewRenderer) | html(sandboxed iframe)';

COMMENT ON COLUMN overlay_templates.source_code IS
  'HTML 플러그인 소스 코드 JSON: { html: string, css: string, js: string }';

COMMENT ON COLUMN overlay_templates.dashboard_schema IS
  '대시보드 자동 생성 JSON Schema: { properties: { fieldName: { type, title, default, ... } } }';

COMMENT ON COLUMN overlay_templates.replicant_defaults IS
  'Replicant 기본값 JSON. 세션 추가 시 overlay_state.replicant_data 초기값으로 복사';

COMMENT ON COLUMN overlay_state.replicant_data IS
  'HTML 플러그인 전용 실시간 데이터. 대시보드에서 갱신 → Realtime → iframe postMessage';


-- ============================================================
-- MIGRATION: 202604300002_rundown_track_layer.sql
-- ============================================================
-- 런다운 아이템에 트랙 레이어 (Wrap/Main) 트리 구조 추가
-- ■ Why?
--   런다운 편집 시 아이템의 트랙 역할을 미리 지정하면,
--   세션 생성 시 자동으로 Track 1(Wrap CG)과 Track 2(Main CG)에 배치.
--   타임라인에서 일일이 트랙을 이동하는 편집 시간을 절약.

-- track_layer: "wrap" = 배경/코너 그래픽 (Track 1), "main" = 자막/하단 CG (Track 2, 기본)
ALTER TABLE rundown_items
  ADD COLUMN IF NOT EXISTS track_layer TEXT DEFAULT NULL;

-- parent_item_id: Wrap CG의 부모 ID (self-referencing FK)
-- ■ Why ON DELETE SET NULL? 부모(Wrap CG)가 삭제되면 자식은 독립 아이템으로 복구
ALTER TABLE rundown_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES rundown_items(id) ON DELETE SET NULL;

-- 부모 ID 인덱스 (자식 조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_rundown_items_parent
  ON rundown_items (parent_item_id) WHERE parent_item_id IS NOT NULL;

-- track_layer 인덱스 (Wrap CG 필터링 최적화)
CREATE INDEX IF NOT EXISTS idx_rundown_items_track_layer
  ON rundown_items (track_layer) WHERE track_layer IS NOT NULL;


-- ============================================================
-- MIGRATION: 202605010001_fix_gemini_model_id.sql
-- ============================================================
-- =====================================================================
-- Migration: Gemini 3.1 Pro 모델 ID 수정
-- =====================================================================
-- ■ Why?
--   Gemini 3.1 Pro는 아직 Preview 상태이므로 API 모델 ID가
--   'gemini-3.1-pro'가 아니라 'gemini-3.1-pro-preview'이다.
--   잘못된 ID로 API 호출 시 404 에러 발생.
-- =====================================================================

UPDATE ai_model_config
SET model_id = 'gemini-3.1-pro-preview'
WHERE model_id = 'gemini-3.1-pro';


-- ============================================================
-- MIGRATION: 202605030001_overlay_group_tags.sql
-- ============================================================
-- WebCG-K 마이그레이션: 오버레이 그룹 태그 + 렌더러 필터 지원
-- 
-- ■ Why?
--   토론회 카운트다운 같은 시나리오에서 하나의 명령으로 여러 오버레이를
--   동시에 제어해야 한다. group_tag가 같은 오버레이들은 데이터를 일괄 수신.
--   tags는 렌더러 필터용 — OBS 소스별로 다른 오버레이 서브셋을 표시.
--
-- ■ 비유:
--   group_tag = "같은 무전 채널" — 하나의 명령이 채널 전체에 전파
--   tags = "이름표" — 렌더러가 "viewer 이름표가 있는 것만 보여줘"

-- 1. group_tag: 같은 group_tag를 가진 오버레이끼리 데이터 일괄 동기화
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS group_tag TEXT;

-- 2. tags: 렌더러 필터용 (예: ["viewer", "lower-third"])
ALTER TABLE overlay_state
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 3. 인덱스: 그룹 태그 기반 조회 최적화
CREATE INDEX IF NOT EXISTS idx_overlay_state_group_tag
  ON overlay_state(session_id, group_tag)
  WHERE group_tag IS NOT NULL;

-- 4. 인덱스: 태그 기반 필터링 (GIN 인덱스 — 배열 검색에 최적)
CREATE INDEX IF NOT EXISTS idx_overlay_state_tags
  ON overlay_state USING GIN(tags)
  WHERE tags != '{}';

COMMENT ON COLUMN overlay_state.group_tag IS
  '그룹 태그. 같은 group_tag를 가진 오버레이들은 데이터를 일괄 수신. 예: "debate-timer"';

COMMENT ON COLUMN overlay_state.tags IS
  '렌더러 필터용 태그 배열. /render?tag=viewer 로 특정 태그만 표시. 예: ["viewer", "lower-third"]';


-- ============================================================
-- MIGRATION: 20260505161300_theme_plugin_architecture.sql
-- ============================================================
-- 마이그레이션: 디자인 테마 기반 HTML 오버레이 및 갤러리 분리 (v2)

BEGIN;

-- 1. template_bundles 테이블 업데이트 (테마 컨테이너 승격)
ALTER TABLE template_bundles 
ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}'::jsonb;

-- 2. bundle_slots 테이블 업데이트 (HTML 오버레이 맵핑 지원)
ALTER TABLE bundle_slots 
ADD COLUMN IF NOT EXISTS overlay_id UUID REFERENCES overlay_templates(id) ON DELETE SET NULL;

-- 3. overlay_templates 테이블 업데이트 (카테고리 및 HTML 렌더링 지원)
ALTER TABLE overlay_templates
ADD COLUMN IF NOT EXISTS plugin_type TEXT DEFAULT 'svg',
ADD COLUMN IF NOT EXISTS source_code JSONB DEFAULT '{"html": "", "css": "", "js": ""}'::jsonb,
ADD COLUMN IF NOT EXISTS dashboard_schema JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS replicant_defaults JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cg_panel';

-- 4. 기존 오버레이 데이터의 기본 카테고리를 cg_panel로 일괄 설정
-- (이미 타이머 등 기능성 위젯이 있다면, 수동으로 'widget'으로 업데이트 필요)
UPDATE overlay_templates SET category = 'cg_panel' WHERE category IS NULL;
UPDATE overlay_templates SET plugin_type = 'html' WHERE plugin_type IS NULL;

COMMIT;


-- ============================================================
-- MIGRATION: 20260507000001_ai_cuesheet_metadata.sql
-- ============================================================
-- AI 큐시트 메타데이터 마이그레이션
-- Phase 2: overlay_templates에 자기 기술 및 변경 감지 컬럼 추가
-- Phase 4 대비: ai_cuesheet_sessions / ai_cuesheet_session_scenes 테이블 선제 정의
BEGIN;

-- 1. overlay_templates: AI 자기 기술 + 변경 감지 컬럼
ALTER TABLE overlay_templates
ADD COLUMN IF NOT EXISTS input_contract JSONB,
ADD COLUMN IF NOT EXISTS semantic_role TEXT,
ADD COLUMN IF NOT EXISTS last_modified_by TEXT,
ADD COLUMN IF NOT EXISTS generation_source_hash TEXT;

-- 2. ai_cuesheet_sessions (Phase 4 저장 기능 대비 스키마 선언)
CREATE TABLE IF NOT EXISTS ai_cuesheet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_title TEXT NOT NULL,
  expert_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_input_json TEXT,
  scene_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  generated_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ai_cuesheet_session_scenes
CREATE TABLE IF NOT EXISTS ai_cuesheet_session_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_cuesheet_sessions(id) ON DELETE CASCADE,
  scene_order INTEGER NOT NULL,
  trigger_note TEXT,
  template_hint TEXT,
  scene_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  matched_template_id UUID REFERENCES overlay_templates(id) ON DELETE SET NULL,
  match_status TEXT,
  generated_template_id UUID REFERENCES overlay_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_ot_semantic_role ON overlay_templates(semantic_role) WHERE semantic_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ot_last_modified_by ON overlay_templates(last_modified_by);
CREATE INDEX IF NOT EXISTS idx_aics_sessions_owner ON ai_cuesheet_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_aics_scenes_session ON ai_cuesheet_session_scenes(session_id);

-- 5. RLS 정책
ALTER TABLE ai_cuesheet_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can view own sessions" ON ai_cuesheet_sessions
    FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can create own sessions" ON ai_cuesheet_sessions
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can update own sessions" ON ai_cuesheet_sessions
    FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE ai_cuesheet_session_scenes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users can view own session scenes" ON ai_cuesheet_session_scenes
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM ai_cuesheet_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Users can create session scenes" ON ai_cuesheet_session_scenes
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM ai_cuesheet_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;


-- ============================================================
-- MIGRATION: 20260507000002_semantic_scene_column.sql
-- ============================================================
-- SemanticRenderer v3: semantic_scene JSONB 컬럼 추가
-- AI가 출력한 SemanticScene JSON을 overlay_templates에 직접 저장
-- SemanticRenderer가 이 컬럼을 읽어 ThemeTokens + CSS 변수로 렌더링

ALTER TABLE overlay_templates
ADD COLUMN IF NOT EXISTS semantic_scene JSONB;

-- semantic_scene 존재 여부 + category 기반 인덱스 (AI 오버레이 목록 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_ot_semantic_scene
  ON overlay_templates (plugin_type, category)
  WHERE semantic_scene IS NOT NULL;


-- ============================================================
-- MIGRATION: 202605080001_render_state_column.sql
-- ============================================================
-- CQRS Phase 4a: render_state JSONB 컬럼 추가
-- Renderer가 실제 렌더링 상태를 기록하는 Query 채널.
-- Controller는 is_active(의도/Command)만 쓰고, Renderer는 render_state(실제 상태/Query)를 쓴다.
--
-- Schema: docs/CQRS_DESIGN.md
-- JSON shape: { phase: "idle"|"entering"|"stable"|"leaving", phaseChangedAt, context }

ALTER TABLE overlay_state
ADD COLUMN IF NOT EXISTS render_state JSONB;

COMMENT ON COLUMN overlay_state.render_state IS
'Renderer actual rendering state (CQRS Query channel).
JSON: { phase, phaseChangedAt, context }.
Written by Renderer via reportRenderState().';


-- ============================================================
-- MIGRATION: 202605100001_ai_cuesheet_delete_policy.sql
-- ============================================================
-- AI 큐시트 세션 RLS DELETE 정책 추가
-- ai_cuesheet_sessions / ai_cuesheet_session_scenes 양 테이블에
-- DELETE policy가 누락되어 세션 삭제가 불가능했던 문제 수정
BEGIN;

-- 1. ai_cuesheet_sessions DELETE policy
DO $$ BEGIN
  CREATE POLICY "Users can delete own sessions" ON ai_cuesheet_sessions
    FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. ai_cuesheet_session_scenes DELETE policy
-- (saveSessionScenes()에서 기존 scene들을 delete-and-reinsert 할 때 필요)
DO $$ BEGIN
  CREATE POLICY "Users can delete own session scenes" ON ai_cuesheet_session_scenes
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM ai_cuesheet_sessions s WHERE s.id = session_id AND s.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;


-- ============================================================
-- MIGRATION: 202605100002_theme_templates.sql
-- ============================================================
-- Theme Template 라이브러리
-- 장르별 큐레이션된 CG Theme 저장소.
-- AI가 장르를 분석하고 2~3개 Theme variation을 생성/추천하면,
-- 사용자가 선택한 Theme을 모든 씬에 일관되게 적용한다.
BEGIN;

CREATE TABLE IF NOT EXISTS theme_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  genre_tags TEXT[] NOT NULL DEFAULT '{}',
  theme_tokens JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_decoration JSONB,
  default_layout JSONB,
  cg_text_formats TEXT[] NOT NULL DEFAULT '{}',
  is_exemplar BOOLEAN NOT NULL DEFAULT false,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tt_genre_tags ON theme_templates USING GIN (genre_tags);
CREATE INDEX IF NOT EXISTS idx_tt_exemplar ON theme_templates (is_exemplar) WHERE is_exemplar = true;
CREATE INDEX IF NOT EXISTS idx_tt_owner ON theme_templates (owner_id);

-- RLS
ALTER TABLE theme_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Anyone can read public themes" ON theme_templates
    FOR SELECT USING (is_exemplar = true OR owner_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can read own themes" ON theme_templates
    FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create themes" ON theme_templates
    FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own themes" ON theme_templates
    FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own themes" ON theme_templates
    FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;


-- ============================================================
-- MIGRATION: 202605110001_v4_cleanup.sql
-- ============================================================
-- AI 큐시트 v4 정리: v2/v3에서 확장된 불필요 컬럼/테이블 제거
--
-- 제거 대상:
--   1. theme_templates 테이블 (AI Theme 자동 생성 — 제거)
--   2. overlay_templates AI 자기기술 컬럼 5개 (템플릿 매칭 엔진 — 제거)
--   3. ai_cuesheet_session_scenes v2/v3 컬럼 4개 + FK (제거)
--   4. ai_cuesheet_sessions.matched_count (항상 0 — 제거)
--   5. bundle_slots.overlay_id FK → overlay_templates (AI 오버레이 슬롯 — 제거)
--   6. v2/v3 인덱스 6개 (사용 안 함 — 제거)
--
-- 추가 대상:
--   ai_cuesheet_session_scenes.generated_html / generated_css (v4 신규)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. theme_templates 테이블 완전 제거
-- ═══════════════════════════════════════════════════════════════════

-- RLS 정책 먼저 제거 (테이블이 존재할 때만)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'theme_templates' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS "Anyone can read public themes" ON theme_templates;
    DROP POLICY IF EXISTS "Users can read own themes" ON theme_templates;
    DROP POLICY IF EXISTS "Users can create themes" ON theme_templates;
    DROP POLICY IF EXISTS "Users can update own themes" ON theme_templates;
    DROP POLICY IF EXISTS "Users can delete own themes" ON theme_templates;
  END IF;
END $$;

DROP TABLE IF EXISTS theme_templates CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- 2. ai_cuesheet_session_scenes 정리 + 신규 컬럼
-- ═══════════════════════════════════════════════════════════════════

-- FK 제거 (참조 무결성 제약 먼저)
DO $$ BEGIN
  ALTER TABLE ai_cuesheet_session_scenes
    DROP CONSTRAINT IF EXISTS ai_cuesheet_session_scenes_matched_template_id_fkey;
  ALTER TABLE ai_cuesheet_session_scenes
    DROP CONSTRAINT IF EXISTS ai_cuesheet_session_scenes_generated_template_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- v2/v3 컬럼 제거
ALTER TABLE ai_cuesheet_session_scenes
  DROP COLUMN IF EXISTS template_hint,
  DROP COLUMN IF EXISTS matched_template_id,
  DROP COLUMN IF EXISTS match_status,
  DROP COLUMN IF EXISTS generated_template_id;

-- v4 신규 컬럼 추가 (기존 데이터 호환을 위해 nullable)
ALTER TABLE ai_cuesheet_session_scenes
  ADD COLUMN IF NOT EXISTS generated_html TEXT,
  ADD COLUMN IF NOT EXISTS generated_css TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- 3. ai_cuesheet_sessions 정리
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE ai_cuesheet_sessions
  DROP COLUMN IF EXISTS matched_count;

-- ═══════════════════════════════════════════════════════════════════
-- 4. overlay_templates AI 자기기술 컬럼 제거
-- ═══════════════════════════════════════════════════════════════════

-- 인덱스 먼저 제거
DROP INDEX IF EXISTS idx_ot_semantic_role;
DROP INDEX IF EXISTS idx_ot_last_modified_by;
DROP INDEX IF EXISTS idx_ot_semantic_scene;

ALTER TABLE overlay_templates
  DROP COLUMN IF EXISTS input_contract,
  DROP COLUMN IF EXISTS semantic_role,
  DROP COLUMN IF EXISTS last_modified_by,
  DROP COLUMN IF EXISTS generation_source_hash,
  DROP COLUMN IF EXISTS semantic_scene;

-- ═══════════════════════════════════════════════════════════════════
-- 5. bundle_slots AI 오버레이 슬롯 제거
-- ═══════════════════════════════════════════════════════════════════

-- FK 제거
DO $$ BEGIN
  ALTER TABLE bundle_slots
    DROP CONSTRAINT IF EXISTS bundle_slots_overlay_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE bundle_slots
  DROP COLUMN IF EXISTS overlay_id;

-- ═══════════════════════════════════════════════════════════════════
-- 완료
-- ═══════════════════════════════════════════════════════════════════

COMMIT;


-- ============================================================
-- MIGRATION: 202605120001_workspaces.sql
-- ============================================================
-- ============================================================
-- Workspace 시스템 도입
-- ■ Why 워크스페이스?
--   기존 owner_id 기반 RLS는 "개인 소유"만 표현 가능하여,
--   같은 제작팀이 큐시트·세션·리소스를 공유할 수 없었다.
--   워크스페이스는 "팀 단위 데이터 격리"를 제공하여
--   같은 워크스페이스 멤버는 자동으로 자료를 공유한다.
-- ============================================================

-- 1. 워크스페이스 테이블
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- 2. 워크스페이스 멤버십 (M:N)
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_user ON workspace_members(user_id);
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 3. 헬퍼 함수: "이 사용자가 이 워크스페이스의 멤버인가?"
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. 사용자의 모든 워크스페이스 ID 배열 반환
CREATE OR REPLACE FUNCTION public.my_workspace_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(
    array_agg(workspace_id),
    '{}'::UUID[]
  )
  FROM workspace_members
  WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. profiles에 active_workspace_id 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  active_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- 6. 주요 리소스 테이블에 workspace_id 컬럼 추가 (nullable → 하위 호환)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE graphics ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE template_bundles ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE nrcs_cuesheets ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE broadcast_sessions ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE rundowns ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE custom_data_sources ADD COLUMN IF NOT EXISTS
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_projects_ws ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_graphics_ws ON graphics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_images_ws ON images(workspace_id);
CREATE INDEX IF NOT EXISTS idx_templates_ws ON templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_overlay_ws ON overlay_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bundles_ws ON template_bundles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_nrcs_ws ON nrcs_cuesheets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ws ON broadcast_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_rundowns_ws ON rundowns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cds_ws ON custom_data_sources(workspace_id);


-- ============================================================
-- MIGRATION: 202605120002_workspace_rls.sql
-- ============================================================
-- ============================================================
-- Workspace RLS 정책 업데이트
-- ■ Why?
--   기존 owner_id 기반 개인 격리 → workspace_id 기반 팀 공유로 전환.
--   모든 테이블의 SELECT 정책에 "같은 워크스페이스 멤버" 조건 추가.
--   INSERT 시 workspace_id가 내 멤버십에 있는지 검증.
--   하위 호환: workspace_id IS NULL 인 기존 데이터는 owner_id 조건 유지.
-- ============================================================

-- ============================================================
-- 1. workspaces 자체의 RLS
-- ============================================================
CREATE POLICY "ws_select_own" ON workspaces
  FOR SELECT USING (public.is_workspace_member(id) OR public.is_admin());
CREATE POLICY "ws_insert_auth" ON workspaces
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "ws_update_admin" ON workspaces
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workspace_members
            WHERE workspace_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin'))
    OR public.is_admin()
  );
CREATE POLICY "ws_delete_owner" ON workspaces
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workspace_members
            WHERE workspace_id = id AND user_id = auth.uid() AND role = 'owner')
    OR public.is_admin()
  );

-- ============================================================
-- 2. workspace_members RLS
-- ============================================================
CREATE POLICY "wm_select_member" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_workspace_member(workspace_id)
    OR public.is_admin()
  );
CREATE POLICY "wm_insert_admin" ON workspace_members
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workspace_members
            WHERE workspace_id = workspace_members.workspace_id
            AND user_id = auth.uid() AND role IN ('owner', 'admin'))
    OR public.is_admin()
  );
CREATE POLICY "wm_update_admin" ON workspace_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workspace_members
            WHERE workspace_id = workspace_members.workspace_id
            AND user_id = auth.uid() AND role IN ('owner', 'admin'))
    OR public.is_admin()
  );
CREATE POLICY "wm_delete_admin" ON workspace_members
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workspace_members
            WHERE workspace_id = workspace_members.workspace_id
            AND user_id = auth.uid() AND role IN ('owner', 'admin'))
    OR public.is_admin()
  );

-- ============================================================
-- 3. projects (owner_id, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "ws_select_projects" ON projects
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
CREATE POLICY "ws_insert_projects" ON projects
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "ws_update_projects" ON projects
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "ws_delete_projects" ON projects
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 4. graphics (owner_id, is_public, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own or public graphics" ON graphics;
DROP POLICY IF EXISTS "Users can view own graphics" ON graphics;
CREATE POLICY "ws_select_graphics" ON graphics
  FOR SELECT USING (
    owner_id = auth.uid()
    OR is_public = TRUE
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own graphics" ON graphics;
CREATE POLICY "ws_insert_graphics" ON graphics
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own graphics" ON graphics;
CREATE POLICY "ws_update_graphics" ON graphics
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own graphics" ON graphics;
CREATE POLICY "ws_delete_graphics" ON graphics
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 5. images (owner_id, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own images" ON images;
CREATE POLICY "ws_select_images" ON images
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own images" ON images;
CREATE POLICY "ws_insert_images" ON images
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own images" ON images;
CREATE POLICY "ws_update_images" ON images
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own images" ON images;
CREATE POLICY "ws_delete_images" ON images
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 6. templates (owner_id, is_public, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own or public templates" ON templates;
CREATE POLICY "ws_select_templates" ON templates
  FOR SELECT USING (
    owner_id = auth.uid()
    OR is_public = TRUE
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own templates" ON templates;
CREATE POLICY "ws_insert_templates" ON templates
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own templates" ON templates;
CREATE POLICY "ws_update_templates" ON templates
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own templates" ON templates;
CREATE POLICY "ws_delete_templates" ON templates
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 7. overlay_templates (owner_id, is_public, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own or public overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Anyone can view templates used in live sessions" ON overlay_templates;
CREATE POLICY "ws_select_overlay_templates" ON overlay_templates
  FOR SELECT USING (
    owner_id = auth.uid()
    OR is_public = TRUE
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );
-- live 세션 템플릿 공개 접근 유지 (렌더러용)
CREATE POLICY "public_live_overlay_templates" ON overlay_templates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM overlay_state os
      JOIN broadcast_sessions bs ON bs.id = os.session_id
      WHERE os.template_id = overlay_templates.id AND bs.status = 'live'
    )
  );

DROP POLICY IF EXISTS "Users can insert own overlay templates" ON overlay_templates;
CREATE POLICY "ws_insert_overlay_templates" ON overlay_templates
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own overlay templates" ON overlay_templates;
CREATE POLICY "ws_update_overlay_templates" ON overlay_templates
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own overlay templates" ON overlay_templates;
CREATE POLICY "ws_delete_overlay_templates" ON overlay_templates
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 8. template_bundles (owner_id → profiles.id, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "bundle_select" ON template_bundles;
CREATE POLICY "ws_select_bundles" ON template_bundles
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "bundle_insert" ON template_bundles;
CREATE POLICY "ws_insert_bundles" ON template_bundles
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "bundle_update" ON template_bundles;
CREATE POLICY "ws_update_bundles" ON template_bundles
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "bundle_delete" ON template_bundles;
CREATE POLICY "ws_delete_bundles" ON template_bundles
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 9. bundle_slots (nested: template_bundles.owner_id)
-- ============================================================
DROP POLICY IF EXISTS "slot_select" ON bundle_slots;
CREATE POLICY "ws_select_slots" ON bundle_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (
      owner_id = auth.uid()
      OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
      OR public.is_admin()
    ))
  );

DROP POLICY IF EXISTS "slot_insert" ON bundle_slots;
CREATE POLICY "ws_insert_slots" ON bundle_slots
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "slot_update" ON bundle_slots;
CREATE POLICY "ws_update_slots" ON bundle_slots
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (
      owner_id = auth.uid() OR public.is_admin()
    ))
  );

DROP POLICY IF EXISTS "slot_delete" ON bundle_slots;
CREATE POLICY "ws_delete_slots" ON bundle_slots
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (
      owner_id = auth.uid() OR public.is_admin()
    ))
  );

-- ============================================================
-- 10. nrcs_cuesheets (owner_id, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "nrcs_cs_select" ON nrcs_cuesheets;
CREATE POLICY "ws_select_cuesheets" ON nrcs_cuesheets
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "nrcs_cs_insert" ON nrcs_cuesheets;
CREATE POLICY "ws_insert_cuesheets" ON nrcs_cuesheets
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "nrcs_cs_update" ON nrcs_cuesheets;
CREATE POLICY "ws_update_cuesheets" ON nrcs_cuesheets
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "nrcs_cs_delete" ON nrcs_cuesheets;
CREATE POLICY "ws_delete_cuesheets" ON nrcs_cuesheets
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 11. nrcs_cuesheet_items (nested: nrcs_cuesheets.owner_id)
-- ============================================================
DROP POLICY IF EXISTS "nrcs_ci_select" ON nrcs_cuesheet_items;
CREATE POLICY "ws_select_cuesheet_items" ON nrcs_cuesheet_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (
      owner_id = auth.uid()
      OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
      OR public.is_admin()
    ))
  );

DROP POLICY IF EXISTS "nrcs_ci_insert" ON nrcs_cuesheet_items;
CREATE POLICY "ws_insert_cuesheet_items" ON nrcs_cuesheet_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "nrcs_ci_update" ON nrcs_cuesheet_items;
CREATE POLICY "ws_update_cuesheet_items" ON nrcs_cuesheet_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (
      owner_id = auth.uid() OR public.is_admin()
    ))
  );

DROP POLICY IF EXISTS "nrcs_ci_delete" ON nrcs_cuesheet_items;
CREATE POLICY "ws_delete_cuesheet_items" ON nrcs_cuesheet_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (
      owner_id = auth.uid() OR public.is_admin()
    ))
  );

-- ============================================================
-- 12. broadcast_sessions (created_by, workspace_id)
--     ■ 특별 취급: live 세션 공개 접근(렌더러용) 유지
-- ============================================================
DROP POLICY IF EXISTS "Users can view own broadcast sessions" ON broadcast_sessions;
DROP POLICY IF EXISTS "Anyone can view live broadcast sessions" ON broadcast_sessions;
CREATE POLICY "ws_select_sessions" ON broadcast_sessions
  FOR SELECT USING (
    created_by = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );
-- live 세션 공개 접근 유지 (렌더러 + 컨트롤러 접속용)
CREATE POLICY "public_live_sessions" ON broadcast_sessions
  FOR SELECT USING (status = 'live');

DROP POLICY IF EXISTS "Authenticated users can create broadcast sessions" ON broadcast_sessions;
CREATE POLICY "ws_insert_sessions" ON broadcast_sessions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own broadcast sessions" ON broadcast_sessions;
CREATE POLICY "ws_update_sessions" ON broadcast_sessions
  FOR UPDATE USING (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own broadcast sessions" ON broadcast_sessions;
CREATE POLICY "ws_delete_sessions" ON broadcast_sessions
  FOR DELETE USING (created_by = auth.uid() OR public.is_admin());

-- ============================================================
-- 13. session_action_logs (user_id)
--     ■ 모든 인증 사용자 SELECT 허용 유지 (운영 로그 공유)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view session logs" ON session_action_logs;
CREATE POLICY "ws_select_action_logs" ON session_action_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert session logs" ON session_action_logs;
CREATE POLICY "ws_insert_action_logs" ON session_action_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 14. custom_data_sources (owner_id, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own custom sources" ON custom_data_sources;
CREATE POLICY "ws_select_cds" ON custom_data_sources
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert own custom sources" ON custom_data_sources;
CREATE POLICY "ws_insert_cds" ON custom_data_sources
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id))
  );

DROP POLICY IF EXISTS "Users can update own custom sources" ON custom_data_sources;
CREATE POLICY "ws_update_cds" ON custom_data_sources
  FOR UPDATE USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can delete own custom sources" ON custom_data_sources;
CREATE POLICY "ws_delete_cds" ON custom_data_sources
  FOR DELETE USING (owner_id = auth.uid() OR public.is_admin());

-- ============================================================
-- 15. rundowns (nested: projects.owner_id, is_public, workspace_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own or public rundowns" ON rundowns;
DROP POLICY IF EXISTS "Users can view rundowns of own projects" ON rundowns;
CREATE POLICY "ws_select_rundowns" ON rundowns
  FOR SELECT USING (
    is_public = TRUE
    OR EXISTS (SELECT 1 FROM projects WHERE projects.id = rundowns.project_id AND projects.owner_id = auth.uid())
    OR (rundowns.workspace_id IS NOT NULL AND rundowns.workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can insert rundowns to own projects" ON rundowns;
CREATE POLICY "ws_insert_rundowns" ON rundowns
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = project_id AND projects.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update rundowns of own projects" ON rundowns;
CREATE POLICY "ws_update_rundowns" ON rundowns
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = rundowns.project_id AND projects.owner_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can delete rundowns of own projects" ON rundowns;
CREATE POLICY "ws_delete_rundowns" ON rundowns
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = rundowns.project_id AND projects.owner_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================================
-- 16. rundown_items (nested: rundowns → projects.owner_id)
-- ============================================================
DROP POLICY IF EXISTS "Users can view rundown items of own projects" ON rundown_items;
CREATE POLICY "ws_select_rundown_items" ON rundown_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND (
        projects.owner_id = auth.uid()
        OR (rundowns.workspace_id IS NOT NULL AND rundowns.workspace_id = ANY(public.my_workspace_ids()))
        OR public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert rundown items to own projects" ON rundown_items;
CREATE POLICY "ws_insert_rundown_items" ON rundown_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_id AND projects.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update rundown items of own projects" ON rundown_items;
CREATE POLICY "ws_update_rundown_items" ON rundown_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND (projects.owner_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "Users can delete rundown items of own projects" ON rundown_items;
CREATE POLICY "ws_delete_rundown_items" ON rundown_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND (projects.owner_id = auth.uid() OR public.is_admin())
    )
  );


-- ============================================================
-- MIGRATION: 202605140001_overlay_blend_mode.sql
-- ============================================================
-- overlay_templates.blend_mode 컬럼 추가
-- 오버레이 간 mix-blend-mode 합성을 CompositorLayer 레벨에서 지원
ALTER TABLE overlay_templates ADD COLUMN IF NOT EXISTS blend_mode text;
COMMENT ON COLUMN overlay_templates.blend_mode IS 'CSS mix-blend-mode: normal | multiply | screen | overlay | soft-light | hard-light | color-dodge | color-burn | difference | luminosity';


-- ============================================================
-- MIGRATION: 20260517000001_whiteboards.sql
-- ============================================================
-- Whiteboards 테이블 및 RLS 정책 생성

CREATE TABLE IF NOT EXISTS public.whiteboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    yjs_state BYTEA, -- Legacy binary snapshot column, kept for old deployments
    thumbnail_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;

-- Select Policy: Workspace 멤버만 읽기 가능
CREATE POLICY "Users can view whiteboards in their workspaces" ON public.whiteboards
    FOR SELECT USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Insert Policy: Workspace 멤버만 생성 가능
CREATE POLICY "Users can create whiteboards in their workspaces" ON public.whiteboards
    FOR INSERT WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Update Policy: Workspace 멤버만 수정 가능
CREATE POLICY "Users can update whiteboards in their workspaces" ON public.whiteboards
    FOR UPDATE USING (
        workspace_id IN (
            SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        )
    );

-- Delete Policy: Workspace Admin 이상 또는 시스템 관리자만 삭제 가능
CREATE POLICY "Admins can delete whiteboards" ON public.whiteboards
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = public.whiteboards.workspace_id
              AND user_id = auth.uid()
              AND role IN ('admin', 'owner')
        )
        OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        )
    );

-- updated_at 갱신 함수 및 트리거
CREATE OR REPLACE FUNCTION update_whiteboards_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

CREATE TRIGGER update_whiteboards_updated_at
    BEFORE UPDATE ON public.whiteboards
    FOR EACH ROW
    EXECUTE FUNCTION update_whiteboards_updated_at();


-- ============================================================
-- MIGRATION: 20260518000001_whiteboards_generation.sql
-- ============================================================
-- Whiteboards: add generation column for hard reset support
-- generation is incremented on each hard reset to change the WebRTC room name,
-- forcing all clients to reconnect with a fresh Y.Doc (tombstone-free).

ALTER TABLE public.whiteboards
    ADD COLUMN IF NOT EXISTS generation INTEGER DEFAULT 0;


-- ============================================================
-- MIGRATION: 20260518000002_annotation_document_state.sql
-- ============================================================
-- Annotation layers: replace legacy binary snapshots with a lightweight
-- JSON document that PVW, PGM, and render.tsx can all hydrate deterministically.

ALTER TABLE public.whiteboards
    ADD COLUMN IF NOT EXISTS document_state JSONB NOT NULL DEFAULT '{"version":1,"strokes":[]}'::jsonb;


-- ============================================================
-- MIGRATION: 20260518000004_global_assets_visibility.sql
-- ============================================================
-- 마이그레이션 20260518000004_global_assets_visibility.sql
-- templates, overlay_templates, grid_templates 에 3단계 visibility 모델 도입

-- 1. templates 테이블 마이그레이션
ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

-- 기존 is_public 값을 visibility로 마이그레이션
UPDATE templates 
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'workspace' END;

-- 2. overlay_templates 테이블 마이그레이션
ALTER TABLE overlay_templates 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

UPDATE overlay_templates 
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'workspace' END;

-- 3. grid_templates 테이블 마이그레이션
ALTER TABLE grid_templates 
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

UPDATE grid_templates 
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'workspace' END;


-- =========================================================================
-- RLS 정책 재설정
-- =========================================================================

-- 1. templates 정책
DROP POLICY IF EXISTS "Users can view own or public templates" ON templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON templates;
DROP POLICY IF EXISTS "Users can update own templates" ON templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON templates;
DROP POLICY IF EXISTS "Templates select policy" ON templates;
DROP POLICY IF EXISTS "Templates insert policy" ON templates;
DROP POLICY IF EXISTS "Templates update policy" ON templates;
DROP POLICY IF EXISTS "Templates delete policy" ON templates;

CREATE POLICY "Templates select policy" ON templates FOR SELECT USING (
  visibility = 'public' OR 
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

CREATE POLICY "Templates insert policy" ON templates FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);

CREATE POLICY "Templates update policy" ON templates FOR UPDATE USING (
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) AND visibility = 'workspace')
);

CREATE POLICY "Templates delete policy" ON templates FOR DELETE USING (
  owner_id = auth.uid()
);


-- 2. overlay_templates 정책
DROP POLICY IF EXISTS "Users can view own or public overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can insert own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can update own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can delete own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates select policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates insert policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates update policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates delete policy" ON overlay_templates;

CREATE POLICY "OverlayTemplates select policy" ON overlay_templates FOR SELECT USING (
  visibility = 'public' OR 
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

CREATE POLICY "OverlayTemplates insert policy" ON overlay_templates FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);

CREATE POLICY "OverlayTemplates update policy" ON overlay_templates FOR UPDATE USING (
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) AND visibility = 'workspace')
);

CREATE POLICY "OverlayTemplates delete policy" ON overlay_templates FOR DELETE USING (
  owner_id = auth.uid()
);


-- 3. grid_templates 정책
DROP POLICY IF EXISTS "Users can view own or public grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can insert own grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can update own grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can delete own grid templates" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates select policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates insert policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates update policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates delete policy" ON grid_templates;

CREATE POLICY "GridTemplates select policy" ON grid_templates FOR SELECT USING (
  visibility = 'public' OR 
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

CREATE POLICY "GridTemplates insert policy" ON grid_templates FOR INSERT WITH CHECK (
  owner_id = auth.uid()
);

CREATE POLICY "GridTemplates update policy" ON grid_templates FOR UPDATE USING (
  owner_id = auth.uid() OR
  (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()) AND visibility = 'workspace')
);

CREATE POLICY "GridTemplates delete policy" ON grid_templates FOR DELETE USING (
  owner_id = auth.uid()
);


-- ============================================================
-- MIGRATION: 20260518112335_20260518000003_whiteboards_visibility.sql
-- ============================================================
-- 화이트보드 3단계 공유(Visibility) 지원을 위한 컬럼 추가 및 RLS 재설정

-- 1. 새로운 컬럼 추가
ALTER TABLE public.whiteboards
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

-- 2. 기존 정책 삭제
DROP POLICY IF EXISTS "Users can view whiteboards in their workspaces" ON public.whiteboards;
DROP POLICY IF EXISTS "Users can create whiteboards in their workspaces" ON public.whiteboards;
DROP POLICY IF EXISTS "Users can update whiteboards in their workspaces" ON public.whiteboards;
DROP POLICY IF EXISTS "Admins can delete whiteboards" ON public.whiteboards;

-- 3. 새로운 가시성(Visibility) 기반 정책 추가

-- SELECT (읽기 권한): 
-- 1) 전체 공개(public) 이거나
-- 2) 워크스페이스 공개(workspace) 이면서 내가 그 워크스페이스 소속이거나
-- 3) 비공개(private) 이면서 내가 소유자인 경우
CREATE POLICY "View whiteboards based on visibility" ON public.whiteboards
    FOR SELECT USING (
        visibility = 'public'
        OR (visibility = 'workspace' AND public.is_workspace_member(workspace_id))
        OR (visibility = 'private' AND owner_id = auth.uid())
    );

-- INSERT (생성 권한): 자신이 속한 워크스페이스에만 생성 가능
CREATE POLICY "Insert whiteboards in workspace" ON public.whiteboards
    FOR INSERT WITH CHECK (
        public.is_workspace_member(workspace_id)
    );

-- UPDATE (수정 권한):
-- 1) 자신이 소유자(owner_id)이거나
-- 2) 팀 공개(workspace) 상태인 워크스페이스 보드이면서, 내가 그 워크스페이스 소속일 때 (팀원간 다중 협업을 위해 허용)
-- 3) 소유자가 없는 레거시 보드이면서 내가 그 워크스페이스 소속일 때
CREATE POLICY "Update whiteboards based on ownership and workspace" ON public.whiteboards
    FOR UPDATE USING (
        owner_id = auth.uid()
        OR (visibility = 'workspace' AND public.is_workspace_member(workspace_id))
        OR (owner_id IS NULL AND public.is_workspace_member(workspace_id))
    );

-- DELETE (삭제 권한):
-- 자신이 소유자이거나, 해당 워크스페이스의 Admin/Owner 일 때만 가능
CREATE POLICY "Delete whiteboards by owner or admin" ON public.whiteboards
    FOR DELETE USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.workspace_members
            WHERE workspace_id = public.whiteboards.workspace_id
              AND user_id = auth.uid()
              AND role IN ('admin', 'owner')
        )
    );


-- ============================================================
-- MIGRATION: 20260519000001_whiteboards_renderer_public_access.sql
-- ============================================================
-- 렌더러 공개 접근: live 세션의 타임라인에 포함된 화이트보드는 비인증 사용자도 조회 가능
-- 목적: 렌더러 URL(/render/SESSION_ID)을 사용하는 OBS 브라우저 소스 등에서 
--        로그인 없이도 화이트보드 데이터(판서 레이어)를 조회 및 실시간 구독할 수 있게 함

DROP POLICY IF EXISTS "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards;

CREATE POLICY "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.broadcast_sessions bs
      WHERE bs.status = 'live'
        AND (
          bs.timeline_data::text LIKE '%' || public.whiteboards.id::text || '%'
          OR bs.playhead_state::text LIKE '%wb-pgm-' || public.whiteboards.id::text || '%'
        )
    )
  );


-- ============================================================
-- MIGRATION: 20260519000002_whiteboards_renderer_playhead_access.sql
-- ============================================================
-- 렌더러 공개 접근 보강: 동적 화이트보드 PGM 블록은 timeline_data가 아니라
-- playhead_state.pgmBlockIds에 wb-pgm-<whiteboardId> 형태로 저장된다.
-- 익명 렌더러가 현재 PGM 화이트보드의 document_state를 읽을 수 있도록
-- 기존 live-session 예외 정책이 playhead_state도 검사하게 재정의한다.

DROP POLICY IF EXISTS "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards;

CREATE POLICY "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_sessions bs
      WHERE bs.status = 'live'
        AND (
          bs.timeline_data::text LIKE '%' || public.whiteboards.id::text || '%'
          OR bs.playhead_state::text LIKE '%wb-pgm-' || public.whiteboards.id::text || '%'
        )
    )
  );


-- ============================================================
-- MIGRATION: 20260519000003_graphics_visibility_fix.sql
-- ============================================================
-- 마이그레이션 20260519000001_graphics_visibility_fix.sql
-- graphics 테이블 3단계 visibility 모델 도입 + templates/overlay_templates/grid_templates SELECT RLS 가드 수정

-- =========================================================================
-- 1. graphics: visibility 컬럼 추가 및 데이터 백필
-- =========================================================================
ALTER TABLE graphics
ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

-- 기존 is_public 값을 visibility로 마이그레이션
UPDATE graphics
SET visibility = CASE WHEN is_public THEN 'public' ELSE 'workspace' END;

-- =========================================================================
-- 2. graphics RLS 재설정 (visibility 기반)
-- =========================================================================
DROP POLICY IF EXISTS "ws_select_graphics" ON graphics;
CREATE POLICY "ws_select_graphics" ON graphics
  FOR SELECT USING (
    owner_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

-- UPDATE 정책에도 workspace 멤버가 workspace visibility 항목을 수정할 수 있도록 확장
DROP POLICY IF EXISTS "ws_update_graphics" ON graphics;
CREATE POLICY "ws_update_graphics" ON graphics
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id = ANY(public.my_workspace_ids()))
    OR public.is_admin()
  );

-- =========================================================================
-- 3. templates SELECT RLS: visibility = 'workspace' 가드 추가
-- =========================================================================
DROP POLICY IF EXISTS "Templates select policy" ON templates;
CREATE POLICY "Templates select policy" ON templates FOR SELECT USING (
  visibility = 'public' OR
  owner_id = auth.uid() OR
  (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

-- =========================================================================
-- 4. overlay_templates SELECT RLS: visibility = 'workspace' 가드 추가
-- =========================================================================
DROP POLICY IF EXISTS "OverlayTemplates select policy" ON overlay_templates;
CREATE POLICY "OverlayTemplates select policy" ON overlay_templates FOR SELECT USING (
  visibility = 'public' OR
  owner_id = auth.uid() OR
  (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);

-- =========================================================================
-- 5. grid_templates SELECT RLS: visibility = 'workspace' 가드 추가
-- =========================================================================
DROP POLICY IF EXISTS "GridTemplates select policy" ON grid_templates;
CREATE POLICY "GridTemplates select policy" ON grid_templates FOR SELECT USING (
  visibility = 'public' OR
  owner_id = auth.uid() OR
  (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
);


-- ============================================================
-- MIGRATION: 20260519000004_cleanup_stale_ws_policies.sql
-- ============================================================
-- 마이그레이션 20260519000004_cleanup_stale_ws_policies.sql
-- templates/overlay_templates 구 ws_* 정책 제거 (visibility 가드가 없는 중복 정책)
-- grid_templates는 이미 정리되어 있음

-- =========================================================================
-- 1. templates: 구 ws_* 정책 제거
-- =========================================================================
DROP POLICY IF EXISTS "ws_select_templates" ON templates;
DROP POLICY IF EXISTS "ws_insert_templates" ON templates;
DROP POLICY IF EXISTS "ws_update_templates" ON templates;
DROP POLICY IF EXISTS "ws_delete_templates" ON templates;

-- =========================================================================
-- 2. overlay_templates: 구 ws_* 정책 제거
-- =========================================================================
DROP POLICY IF EXISTS "ws_select_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_insert_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_update_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_delete_overlay_templates" ON overlay_templates;


-- ============================================================
-- MIGRATION: 20260520000001_ai_cuesheet_scene_overlay_link.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260520000002_ai_model_lineup_v2.sql
-- ============================================================
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


-- ============================================================
-- MIGRATION: 20260520000003_overlay_user_folders.sql
-- ============================================================
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


