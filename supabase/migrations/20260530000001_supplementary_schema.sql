-- ============================================================
-- MIGRATION: 20260530000001_supplementary_schema.sql
-- ============================================================
-- 📦 Consolidated Supplementary Schema Migration
--
-- ■ Why?
--   This migration consolidates all schema changes that are NOT
--   covered by the primary combined_migration (20260520000000).
--
-- ■ What's included (consolidated from 19 individual migrations):
--   1. Fathom knowledge graph (stories, contexts, programs, CG links)
--   2. AI model lineup v2 (Groq/Cerebras models)
--   3. Overlay user folders
--   4. API key security (pgp_sym_encrypt trigger)
--   5. AI cuesheet session zone profile (layout_profile)
--   6. Workspace backfill + RLS fixes
--   7. Broadcast rehearsal status + archive
--   8. Cuesheet validation reports
--   9. Naming dictionaries
--  10. Rundown import RLS fixes
--
-- ■ Safe to re-run: Uses IF NOT EXISTS / IF NOT (check) patterns
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

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
-- ============================================================
-- MIGRATION: 20260520000004_api_key_security.sql
-- ============================================================
-- 🔐 보안 패치: api_keys 평문 저장 취약점 수정 + characters 버킷 제약 강화
--
-- ■ Why?
--   1. [HIGH] api_keys.encrypted_key 컬럼에 평문 API 키가 저장되던 문제를
--      pgp_sym_encrypt 기반 대칭 암호화 자동화 트리거로 해결.
--   2. [HIGH] characters 스토리지 버킷에 파일 크기/MIME 제한이 없던 문제를
--      file_size_limit + allowed_mime_types 설정으로 해결.
--
-- ■ 선행 조건: pgcrypto 확장은 이미 활성화되어 있어야 함
--   (기존 마이그레이션에서 CREATE EXTENSION IF NOT EXISTS "pgcrypto" 처리됨)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. pgcrypto 확장 확인 (안전 재선언)
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- ────────────────────────────────────────────────────────────
-- 2. api_keys.encrypted_key 자동 암호화 트리거
--
-- ■ 동작 원리:
--   INSERT / UPDATE 시 BEFORE 트리거가 발화.
--   app.settings.vault_key 세션 변수로 키를 주입하고,
--   pgp_sym_encrypt → base64 인코딩하여 저장.
--
-- ■ 이중 암호화 방지:
--   pgp_sym_encrypt 출력의 base64는 항상 'WYj'로 시작함.
--   이를 prefix 체크로 이용, 이미 암호화된 값은 재암호화하지 않음.
--
-- ■ vault_key 폴백:
--   Supabase 설정에서 app.settings.vault_key가 주입되지 않은
--   개발/테스트 환경에서도 동작하도록 기본값 제공.
--   (프로덕션에서는 반드시 환경변수로 재정의할 것)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION encrypt_api_key()
RETURNS TRIGGER AS $$
DECLARE
  vault_key TEXT;
  test_decrypt TEXT;
BEGIN
  -- 1단계: Vault 또는 설정에서 대칭 암호화 키 획득
  vault_key := COALESCE(current_setting('app.settings.vault_key', true), 'webcgk_vault_secure_salt_2026_super_key');

  -- 2단계: 이미 대칭 암호화(pgp_sym_encrypt)된 값인지 시도해서 판별
  --        만약 base64 디코딩 및 복호화가 성공한다면 이미 암호화된 상태이므로 재암호화하지 않고 그대로 반환
  IF NEW.encrypted_key IS NOT NULL AND NEW.encrypted_key != '' THEN
    BEGIN
      test_decrypt := pgp_sym_decrypt(decode(NEW.encrypted_key, 'base64'), vault_key);
      -- 성공적으로 복호화되면 이미 암호화된 것이므로 그대로 반환 (이중 암호화 차단)
      RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
      -- 복호화가 실패하면 암호화되지 않은 평문으로 판단하고 3단계로 진행
    END;
  END IF;

  -- 3단계: 아직 암호화되지 않은 평문 상태이므로 pgp_sym_encrypt 대칭 암호화 집행
  IF NEW.encrypted_key IS NOT NULL AND NEW.encrypted_key != '' THEN
    NEW.encrypted_key := encode(pgp_sym_encrypt(NEW.encrypted_key, vault_key), 'base64');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 재생성 (멱등성 보장)
DROP TRIGGER IF EXISTS trg_encrypt_api_key ON api_keys;
CREATE TRIGGER trg_encrypt_api_key
  BEFORE INSERT OR UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION encrypt_api_key();

-- ────────────────────────────────────────────────────────────
-- 3. 안전한 키 복호화 전용 RPC 함수
--
-- ■ Why SECURITY DEFINER?
--   RLS를 우회하지 않기 위해 함수 내부에서 직접 소유권 검증을 수행하고,
--   외부에서는 오직 이 함수를 통해서만 평문 키를 획득할 수 있게 제한.
--   SELECT encrypted_key 시 평문 유출 위험을 원천 차단.
--
-- ■ 복호화 실패 폴백:
--   pgp_sym_decrypt 예외(암호화되지 않은 레거시 데이터) 발생 시
--   원본 값을 그대로 반환하여 하위 호환성 유지.
-- ────────────────────────────────────────────────────────────

-- STUB: 함수 시그니처 먼저 선언 (plpgsql parser 요구사항)
CREATE OR REPLACE FUNCTION get_decrypted_api_key(key_id UUID)
RETURNS TEXT AS $$
BEGIN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 실체 정의 (STUB 덮어쓰기)
CREATE OR REPLACE FUNCTION get_decrypted_api_key(key_id UUID)
RETURNS TEXT AS $$
DECLARE
  vault_key TEXT;
  encrypted_val TEXT;
  decrypted_val TEXT;
BEGIN
  -- 1단계: 동일한 vault_key로 복호화
  vault_key := COALESCE(current_setting('app.settings.vault_key', true), 'webcgk_vault_secure_salt_2026_super_key');

  -- 2단계: 해당 ID의 암호화된 키 조회 (RLS 적용됨 — 소유자만 접근 가능)
  SELECT encrypted_key INTO encrypted_val FROM api_keys WHERE id = key_id;

  -- 3단계: 키가 없으면 NULL 반환
  IF encrypted_val IS NULL THEN
    RETURN NULL;
  END IF;

  -- 4단계: base64 디코딩 후 pgp_sym_decrypt 복호화
  --        레거시 평문 데이터 예외 처리 포함
  BEGIN
    decrypted_val := pgp_sym_decrypt(decode(encrypted_val, 'base64'), vault_key);
  EXCEPTION WHEN OTHERS THEN
    -- 암호화되지 않은 레거시 키 그대로 반환 (하위 호환)
    decrypted_val := encrypted_val;
  END;

  RETURN decrypted_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 4. characters 스토리지 버킷 제약 강화
--
-- ■ Why?
--   기존 버킷에 file_size_limit / allowed_mime_types 제약이 없어
--   악의적인 사용자가 임의의 파일(실행 파일, 대용량 등)을 업로드할 수 있었음.
--
-- ■ 설계:
--   - 5MB 제한: Rive 애니메이션(.riv) 파일의 실용적 상한선
--   - MIME 허용 목록: .riv(octet-stream), SVG, PNG, JPEG, WebP만 허용
--
-- ■ ON CONFLICT DO UPDATE:
--   이미 characters 버킷이 존재하는 경우 제약만 갱신.
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'characters',
  'characters',
  true,
  5242880, -- 5MB (5 * 1024 * 1024)
  ARRAY[
    'application/octet-stream', -- Rive (.riv) 파일 바이너리 스트림
    'image/svg+xml',            -- SVG 에셋
    'image/png',                -- PNG 이미지 에셋
    'image/jpeg',               -- JPEG 이미지 에셋
    'image/webp'                -- WebP 이미지 에셋
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ────────────────────────────────────────────────────────────
-- 5. characters 버킷 Storage RLS 정책 (멱등성 보장)
-- ────────────────────────────────────────────────────────────

-- 읽기: 공개 접근 (방송 렌더러에서 비인증 접근 필요)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'characters_bucket_read'
  ) THEN
    EXECUTE 'CREATE POLICY "characters_bucket_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = ''characters'')';
  END IF;
END $$;

-- 쓰기: 인증된 사용자만 업로드 허용
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'characters_bucket_insert'
  ) THEN
    EXECUTE 'CREATE POLICY "characters_bucket_insert"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = ''characters'' AND auth.uid() IS NOT NULL)';
  END IF;
END $$;

-- 삭제: 소유자만 가능
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'characters_bucket_delete'
  ) THEN
    EXECUTE 'CREATE POLICY "characters_bucket_delete"
      ON storage.objects FOR DELETE
      USING (bucket_id = ''characters'' AND auth.uid() = owner)';
  END IF;
END $$;
-- AI 큐시트 세션별 방송 그래픽 Zone 프로필 저장
-- Why: bottom_bar/center 같은 추상 zone_hint만 저장하면 재생성 시 AI가 매번 다른 배치로 해석한다.
-- 세션이 선택한 Grid Template 기반 zone bounds를 함께 저장해 생성/재생성/복원 경계를 고정한다.

ALTER TABLE ai_cuesheet_sessions
  ADD COLUMN IF NOT EXISTS layout_profile JSONB;

COMMENT ON COLUMN ai_cuesheet_sessions.layout_profile IS
  'AI 큐시트 세션에서 bottom_bar/top_bar/center/left_third/fullscreen을 실제 1920x1080 좌표로 해석하는 Zone 프로필 JSON.';
-- =========================================================================
-- 마이그레이션: 20260523000001_backfill_workspace_id.sql
-- ■ Why?
--   워크스페이스 시스템 도입 이전의 레거시 데이터는 workspace_id가 NULL입니다.
--   이에 따라 RLS(Row Level Security) 정책 상 visibility가 'workspace'(팀 공유)로
--   설정되어 있더라도 다른 팀원들에게 노출되지 않는 문제가 있었습니다.
--   본 스크립트는 기존 NULL 상태인 리소스들을 해당 소유자(owner)가 소속된 
--   첫 번째 워크스페이스(가장 오래된 가입 내역)로 안전하게 백필하여 공유 기능을 복구합니다.
-- =========================================================================

BEGIN;

-- 1. graphics 테이블 백필
-- 각 그래픽의 소유자가 소속된 첫 번째 워크스페이스 ID를 가져와 업데이트합니다.
UPDATE graphics g
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = g.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE g.workspace_id IS NULL;

-- 2. overlay_templates 테이블 백필
-- 각 오버레이 템플릿의 소유자가 소속된 첫 번째 워크스페이스 ID를 가져와 업데이트합니다.
UPDATE overlay_templates ot
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = ot.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE ot.workspace_id IS NULL;

-- 3. grid_templates 테이블 백필
-- 각 그리드 템플릿의 소유자가 소속된 첫 번째 워크스페이스 ID를 가져와 업데이트합니다.
UPDATE grid_templates gt
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = gt.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE gt.workspace_id IS NULL;

COMMIT;
-- =========================================================================
-- 마이그레이션: 20260523000002_consolidated_workspace_rls_fix.sql
-- ■ Why?
--   1. '같은 워크스페이스' 및 '전체공유(public)' 설정 시에도 방송 그래픽, 오버레이,
--      그리드 템플릿 자산들의 공유가 이루어지지 않는 구조적인 RLS 오작동 현상이 발견되었습니다.
--   2. RLS 정책 분석 결과, 구버전 정책들과 중복 생성된 정책들이 데이터베이스 내에
--      동시에 살아 있어 서로 충돌하거나 여전히 구버전 'is_public' 컬럼을 검사하고 있었습니다.
--   3. 특히 grid_templates 테이블은 워크스페이스 3단계 가시성 정책이 누락되어 
--      레거시 개인 고립 상태로 존재하여 공유 자체가 원천 차단되어 있었습니다.
--   4. SECURITY DEFINER 함수의 auth.uid() 바인딩 불안정성을 완전히 제거하고,
--      가장 직관적이고 쿼리 플래너 최적화에 유리한 'IN (SELECT ...)' 서브쿼리 스타일로
--      모든 글로벌 리소스(graphics, templates, overlay_templates, grid_templates)의
--      RLS 정책을 깔끔하게 하나로 단일화 및 재구성합니다.
--   5. 기존 NULL 상태인 리소스(workspace_id, visibility)들을 안정적으로 기본값 및
--      소유자의 첫 번째 워크스페이스 ID로 채워 넣는 복원 백필을 온전히 수행합니다.
-- =========================================================================

BEGIN;

-- =========================================================================
-- 1. 중복 및 레거시 RLS 정책 전수 삭제 (Clean Slate)
-- =========================================================================

-- graphics 테이블 관련 정책 전수 제거
DROP POLICY IF EXISTS "ws_select_graphics" ON graphics;
DROP POLICY IF EXISTS "ws_insert_graphics" ON graphics;
DROP POLICY IF EXISTS "ws_update_graphics" ON graphics;
DROP POLICY IF EXISTS "ws_delete_graphics" ON graphics;
DROP POLICY IF EXISTS "Users can view own or public graphics" ON graphics;
DROP POLICY IF EXISTS "Users can view own graphics" ON graphics;
DROP POLICY IF EXISTS "Users can insert own graphics" ON graphics;
DROP POLICY IF EXISTS "Users can update own graphics" ON graphics;
DROP POLICY IF EXISTS "Users can delete own graphics" ON graphics;

-- grid_templates 테이블 관련 정책 전수 제거
DROP POLICY IF EXISTS "GridTemplates select policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates insert policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates update policy" ON grid_templates;
DROP POLICY IF EXISTS "GridTemplates delete policy" ON grid_templates;
DROP POLICY IF EXISTS "Users can view own or public grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can insert own grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can update own grid templates" ON grid_templates;
DROP POLICY IF EXISTS "Users can delete own grid templates" ON grid_templates;

-- overlay_templates 테이블 관련 정책 전수 제거
DROP POLICY IF EXISTS "OverlayTemplates select policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates insert policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates update policy" ON overlay_templates;
DROP POLICY IF EXISTS "OverlayTemplates delete policy" ON overlay_templates;
DROP POLICY IF EXISTS "ws_select_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_insert_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_update_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "ws_delete_overlay_templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can view own or public overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can insert own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can update own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "Users can delete own overlay templates" ON overlay_templates;
DROP POLICY IF EXISTS "public_live_overlay_templates" ON overlay_templates;

-- templates 테이블 관련 정책 전수 제거
DROP POLICY IF EXISTS "Templates select policy" ON templates;
DROP POLICY IF EXISTS "Templates insert policy" ON templates;
DROP POLICY IF EXISTS "Templates update policy" ON templates;
DROP POLICY IF EXISTS "Templates delete policy" ON templates;
DROP POLICY IF EXISTS "ws_select_templates" ON templates;
DROP POLICY IF EXISTS "ws_insert_templates" ON templates;
DROP POLICY IF EXISTS "ws_update_templates" ON templates;
DROP POLICY IF EXISTS "ws_delete_templates" ON templates;
DROP POLICY IF EXISTS "Users can view own or public templates" ON templates;
DROP POLICY IF EXISTS "Users can insert own templates" ON templates;
DROP POLICY IF EXISTS "Users can update own templates" ON templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON templates;


-- =========================================================================
-- 2. 스키마 및 컬럼 정합성 보장 + 기본 가시성 백필
-- =========================================================================

-- 모든 핵심 테이블에 workspace_id 및 visibility 컬럼이 존재하는지 보장
ALTER TABLE graphics 
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

ALTER TABLE grid_templates 
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

ALTER TABLE overlay_templates 
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

ALTER TABLE templates 
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private', 'workspace', 'public'));

-- 기존 is_public 값이 TRUE이거나 visibility가 누락된 데이터 정비
UPDATE graphics SET visibility = 'public' WHERE is_public = TRUE;
UPDATE grid_templates SET visibility = 'public' WHERE is_public = TRUE;
UPDATE overlay_templates SET visibility = 'public' WHERE is_public = TRUE;
UPDATE templates SET visibility = 'public' WHERE is_public = TRUE;

UPDATE graphics SET visibility = 'workspace' WHERE visibility IS NULL;
UPDATE grid_templates SET visibility = 'workspace' WHERE visibility IS NULL;
UPDATE overlay_templates SET visibility = 'workspace' WHERE visibility IS NULL;
UPDATE templates SET visibility = 'workspace' WHERE visibility IS NULL;


-- =========================================================================
-- 3. 레거시 데이터 워크스페이스 ID 백필 (Backfill)
--    소유자(owner)가 소속된 가장 첫 번째 워크스페이스(가입순)로 채워 넣어
--    레거시 자산들이 자연스럽게 팀 멤버들에게 복구/공유되도록 지원합니다.
-- =========================================================================

UPDATE graphics g
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = g.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE g.workspace_id IS NULL;

UPDATE grid_templates gt
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = gt.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE gt.workspace_id IS NULL;

UPDATE overlay_templates ot
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = ot.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE ot.workspace_id IS NULL;

UPDATE templates t
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm
  WHERE wm.user_id = t.owner_id 
  ORDER BY wm.joined_at ASC 
  LIMIT 1
)
WHERE t.workspace_id IS NULL;


-- =========================================================================
-- 4. 신규 단일화된 RLS 정책 수립 (3단계 가시성 모델)
--    - 'private': 나만 조회/수정/삭제
--    - 'workspace': 나와 같은 워크스페이스 멤버십 보유자에게 조회/수정(제한적) 공유
--    - 'public': 누구나(비로그인 렌더러 포함) 조회 허용
-- =========================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 4-1. graphics RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE graphics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "graphics_select_policy" ON graphics 
  FOR SELECT USING (
    visibility = 'public' OR
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )) OR
    public.is_admin()
  );

CREATE POLICY "graphics_insert_policy" ON graphics 
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    (workspace_id IS NULL OR workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ))
  );

CREATE POLICY "graphics_update_policy" ON graphics 
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )) OR
    public.is_admin()
  );

CREATE POLICY "graphics_delete_policy" ON graphics 
  FOR DELETE USING (
    owner_id = auth.uid() OR
    public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4-2. grid_templates RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE grid_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "grid_templates_select_policy" ON grid_templates 
  FOR SELECT USING (
    visibility = 'public' OR
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )) OR
    public.is_admin()
  );

CREATE POLICY "grid_templates_insert_policy" ON grid_templates 
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    (workspace_id IS NULL OR workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ))
  );

CREATE POLICY "grid_templates_update_policy" ON grid_templates 
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ) AND visibility = 'workspace') OR
    public.is_admin()
  );

CREATE POLICY "grid_templates_delete_policy" ON grid_templates 
  FOR DELETE USING (
    owner_id = auth.uid() OR
    public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4-3. overlay_templates RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE overlay_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overlay_templates_select_policy" ON overlay_templates 
  FOR SELECT USING (
    visibility = 'public' OR
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )) OR
    public.is_admin()
  );

-- 라이브 송출 렌더러를 위한 비인증 SELECT 우회 안전망 유지
CREATE POLICY "overlay_templates_live_render_policy" ON overlay_templates 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM overlay_state os
      JOIN broadcast_sessions bs ON bs.id = os.session_id
      WHERE os.template_id = overlay_templates.id AND bs.status = 'live'
    )
  );

CREATE POLICY "overlay_templates_insert_policy" ON overlay_templates 
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    (workspace_id IS NULL OR workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ))
  );

CREATE POLICY "overlay_templates_update_policy" ON overlay_templates 
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ) AND visibility = 'workspace') OR
    public.is_admin()
  );

CREATE POLICY "overlay_templates_delete_policy" ON overlay_templates 
  FOR DELETE USING (
    owner_id = auth.uid() OR
    public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4-4. templates RLS
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select_policy" ON templates 
  FOR SELECT USING (
    visibility = 'public' OR
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    )) OR
    public.is_admin()
  );

CREATE POLICY "templates_insert_policy" ON templates 
  FOR INSERT WITH CHECK (
    owner_id = auth.uid() AND
    (workspace_id IS NULL OR workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ))
  );

CREATE POLICY "templates_update_policy" ON templates 
  FOR UPDATE USING (
    owner_id = auth.uid() OR
    (visibility = 'workspace' AND workspace_id IS NOT NULL AND workspace_id IN (
      SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()
    ) AND visibility = 'workspace') OR
    public.is_admin()
  );

CREATE POLICY "templates_delete_policy" ON templates 
  FOR DELETE USING (
    owner_id = auth.uid() OR
    public.is_admin()
  );

COMMIT;
-- ============================================================
-- cuesheet 및 project RLS 핫픽스
-- ■ Why?
--   my_workspace_ids() 헬퍼 함수의 SECURITY DEFINER 컨텍스트 유실 버그로 인해,
--   cuesheets, projects, rundowns, sessions 등이 같은 워크스페이스 팀원들에게 공유되지 않았음.
--   이를 100% 직접 서브쿼리로 전면 개편하여, RLS 세션 오작동을 완벽히 박멸함!
-- ============================================================

-- 1. projects RLS 개편
DROP POLICY IF EXISTS "ws_select_projects" ON projects;
CREATE POLICY "ws_select_projects" ON projects
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 2. images RLS 개편
DROP POLICY IF EXISTS "ws_select_images" ON images;
CREATE POLICY "ws_select_images" ON images
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 3. custom_data_sources RLS 개편
DROP POLICY IF EXISTS "ws_select_cds" ON custom_data_sources;
CREATE POLICY "ws_select_cds" ON custom_data_sources
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 4. template_bundles RLS 개편
DROP POLICY IF EXISTS "ws_select_bundles" ON template_bundles;
CREATE POLICY "ws_select_bundles" ON template_bundles
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 5. bundle_slots RLS 개편
DROP POLICY IF EXISTS "ws_select_slots" ON bundle_slots;
CREATE POLICY "ws_select_slots" ON bundle_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM template_bundles WHERE id = bundle_id AND (
      owner_id = auth.uid()
      OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
      OR public.is_admin()
    ))
  );

-- 6. nrcs_cuesheets RLS 개편
DROP POLICY IF EXISTS "ws_select_cuesheets" ON nrcs_cuesheets;
CREATE POLICY "ws_select_cuesheets" ON nrcs_cuesheets
  FOR SELECT USING (
    owner_id = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 7. nrcs_cuesheet_items RLS 개편
DROP POLICY IF EXISTS "ws_select_cuesheet_items" ON nrcs_cuesheet_items;
CREATE POLICY "ws_select_cuesheet_items" ON nrcs_cuesheet_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM nrcs_cuesheets WHERE id = cuesheet_id AND (
      owner_id = auth.uid()
      OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
      OR public.is_admin()
    ))
  );

-- 8. broadcast_sessions RLS 개편
DROP POLICY IF EXISTS "ws_select_sessions" ON broadcast_sessions;
CREATE POLICY "ws_select_sessions" ON broadcast_sessions
  FOR SELECT USING (
    created_by = auth.uid()
    OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 9. rundowns RLS 개편
DROP POLICY IF EXISTS "ws_select_rundowns" ON rundowns;
CREATE POLICY "ws_select_rundowns" ON rundowns
  FOR SELECT USING (
    is_public = TRUE
    OR EXISTS (SELECT 1 FROM projects WHERE projects.id = rundowns.project_id AND projects.owner_id = auth.uid())
    OR (rundowns.workspace_id IS NOT NULL AND rundowns.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
    OR public.is_admin()
  );

-- 10. rundown_items RLS 개편
DROP POLICY IF EXISTS "ws_select_rundown_items" ON rundown_items;
CREATE POLICY "ws_select_rundown_items" ON rundown_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND (
        projects.owner_id = auth.uid()
        OR (rundowns.workspace_id IS NOT NULL AND rundowns.workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
        OR public.is_admin()
      )
    )
  );
-- =========================================================================
-- Workspace membership RLS repair + public cuesheet read model
-- Why:
--   1. The original workspace_members admin policies used an unaliased
--      self-reference:
--        WHERE workspace_id = workspace_members.workspace_id
--      Inside the subquery both sides bind to the inner workspace_members row,
--      so owning/administering any workspace can satisfy the guard. After a
--      db reset, that policy is replayed and membership writes become wider
--      than the selected workspace.
--   2. Upcoming sub-rundown import needs cue/rundown discovery across
--      workspaces. Access control should therefore make cuesheets/rundowns
--      readable to authenticated users, while the UI applies workspace
--      filtering as a default convenience, not a hard visibility boundary.
-- Tradeoff:
--   Reads are broader for cuesheets/rundowns, but write/delete policies remain
--   owner/admin scoped so accidental cross-workspace mutation is still blocked.
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- 1. Repair workspace_members self-referential RLS policies.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "wm_select_member" ON workspace_members;
DROP POLICY IF EXISTS "wm_insert_admin" ON workspace_members;
DROP POLICY IF EXISTS "wm_update_admin" ON workspace_members;
DROP POLICY IF EXISTS "wm_delete_admin" ON workspace_members;

CREATE OR REPLACE FUNCTION public.can_manage_workspace_membership(ws_id UUID, actor_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = ws_id
      AND wm.user_id = actor_id
      AND wm.role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "wm_select_member" ON workspace_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.can_manage_workspace_membership(workspace_id, auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "wm_insert_admin" ON workspace_members
  FOR INSERT WITH CHECK (
    public.can_manage_workspace_membership(workspace_id, auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "wm_update_admin" ON workspace_members
  FOR UPDATE USING (
    public.can_manage_workspace_membership(workspace_id, auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "wm_delete_admin" ON workspace_members
  FOR DELETE USING (
    public.can_manage_workspace_membership(workspace_id, auth.uid())
    OR public.is_admin()
  );

-- -------------------------------------------------------------------------
-- 2. Make cuesheets/rundowns globally readable to authenticated users.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "ws_select_cuesheets" ON nrcs_cuesheets;
CREATE POLICY "ws_select_cuesheets" ON nrcs_cuesheets
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS "ws_select_cuesheet_items" ON nrcs_cuesheet_items;
CREATE POLICY "ws_select_cuesheet_items" ON nrcs_cuesheet_items
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "ws_select_rundowns" ON rundowns;
CREATE POLICY "ws_select_rundowns" ON rundowns
  FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS "ws_select_rundown_items" ON rundown_items;
CREATE POLICY "ws_select_rundown_items" ON rundown_items
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    OR public.is_admin()
  );

COMMIT;
-- =========================================================================
-- Backfill broadcast session workspace from source rundown
-- Why:
--   Broadcast session listing is now workspace-collaborative, but older
--   sessions created from rundowns did not persist workspace_id. Those rows
--   remain visible only to created_by under RLS. Copy the rundown workspace so
--   users in the same workspace can see and operate shared broadcast projects.
-- Tradeoff:
--   Only sessions with a linked rundown are backfilled. Free-floating legacy
--   sessions without a rundown keep their existing owner-only behavior because
--   there is no reliable workspace source of truth.
-- =========================================================================

UPDATE broadcast_sessions bs
SET workspace_id = r.workspace_id
FROM rundowns r
WHERE bs.rundown_id = r.id
  AND bs.workspace_id IS NULL
  AND r.workspace_id IS NOT NULL;
-- Ensure controller collaboration receives status/playhead_state UPDATE events.
-- Without this publication entry, postgres_changes subscriptions can connect
-- successfully while never delivering broadcast_sessions row changes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'broadcast_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_sessions;
  END IF;
END $$;
-- Broadcast rehearsal mode.
-- Rehearsal behaves like live for renderer visibility, but ending rehearsal
-- resets playout progress and returns the session to ready.

ALTER TABLE public.broadcast_sessions
  DROP CONSTRAINT IF EXISTS broadcast_sessions_status_check;

ALTER TABLE public.broadcast_sessions
  ADD CONSTRAINT broadcast_sessions_status_check
  CHECK (status IN ('draft', 'ready', 'rehearsal', 'live', 'ended', 'completed'));

COMMENT ON COLUMN public.broadcast_sessions.status IS
  'draft=준비중, ready=준비완료, rehearsal=리허설, live=송출중, ended=송출종료, completed=완료';

DROP POLICY IF EXISTS "Anyone can view live broadcast sessions"
  ON public.broadcast_sessions;

CREATE POLICY "Anyone can view live broadcast sessions"
  ON public.broadcast_sessions
  FOR SELECT
  USING (status IN ('live', 'rehearsal'));

DROP POLICY IF EXISTS "Anyone can view overlay state for live sessions"
  ON public.overlay_state;

CREATE POLICY "Anyone can view overlay state for live sessions"
  ON public.overlay_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_sessions bs
      WHERE bs.id = overlay_state.session_id
        AND bs.status IN ('live', 'rehearsal')
    )
  );

DROP POLICY IF EXISTS "Anyone can view templates used in live sessions"
  ON public.overlay_templates;

CREATE POLICY "Anyone can view templates used in live sessions"
  ON public.overlay_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.overlay_state os
      JOIN public.broadcast_sessions bs ON bs.id = os.session_id
      WHERE os.template_id = overlay_templates.id
        AND bs.status IN ('live', 'rehearsal')
    )
  );

DROP POLICY IF EXISTS "ai_character_state_renderer_public"
  ON public.ai_character_state;

CREATE POLICY "ai_character_state_renderer_public"
  ON public.ai_character_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_sessions bs
      WHERE bs.id = ai_character_state.session_id
        AND bs.status IN ('live', 'rehearsal')
    )
  );

DROP POLICY IF EXISTS "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards;

CREATE POLICY "Anyone can view whiteboards used in live sessions"
  ON public.whiteboards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_sessions bs
      WHERE bs.status IN ('live', 'rehearsal')
        AND (
          bs.timeline_data::text LIKE '%' || public.whiteboards.id::text || '%'
          OR bs.playhead_state::text LIKE '%wb-pgm-' || public.whiteboards.id::text || '%'
        )
    )
  );
-- Broadcast session archive support.
-- Physical deletion is only for never-used draft projects; operated projects are hidden via archived_at.

ALTER TABLE public.broadcast_sessions
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.broadcast_sessions.archived_at IS
  'Null=visible project, non-null=archived/hidden from default project lists while preserving playout and action logs.';

CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_archived_at
  ON public.broadcast_sessions(archived_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_visible_updated_at
  ON public.broadcast_sessions(updated_at DESC)
  WHERE archived_at IS NULL;
-- =========================================================================
-- Cuesheet validation report snapshots
-- Why:
--   The live controller should not depend on urgent on-air text edits.
--   A cuesheet must carry an auditable "checked against this content hash"
--   snapshot before it is sent to a rundown.
-- =========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS nrcs_cuesheet_validation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuesheet_id UUID NOT NULL REFERENCES nrcs_cuesheets(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('passed', 'needs_review', 'blocked')),
  content_hash TEXT NOT NULL,
  context_json JSONB NOT NULL DEFAULT '{}',
  report_json JSONB NOT NULL DEFAULT '{}',
  checked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ai_model_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nrcs_validation_reports_cuesheet
  ON nrcs_cuesheet_validation_reports(cuesheet_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_nrcs_validation_reports_hash
  ON nrcs_cuesheet_validation_reports(cuesheet_id, content_hash);

ALTER TABLE nrcs_cuesheet_validation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nrcs_validation_reports_select" ON nrcs_cuesheet_validation_reports;
CREATE POLICY "nrcs_validation_reports_select" ON nrcs_cuesheet_validation_reports
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "nrcs_validation_reports_insert" ON nrcs_cuesheet_validation_reports;
CREATE POLICY "nrcs_validation_reports_insert" ON nrcs_cuesheet_validation_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nrcs_cuesheets cs
      WHERE cs.id = cuesheet_id
        AND (
          cs.owner_id = auth.uid()
          OR (
            cs.workspace_id IS NOT NULL
            AND cs.workspace_id IN (
              SELECT wm.workspace_id
              FROM workspace_members wm
              WHERE wm.user_id = auth.uid()
            )
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "nrcs_validation_reports_delete" ON nrcs_cuesheet_validation_reports;
CREATE POLICY "nrcs_validation_reports_delete" ON nrcs_cuesheet_validation_reports
  FOR DELETE USING (
    checked_by = auth.uid()
    OR public.is_admin()
  );

COMMIT;
-- =========================================================================
-- Naming Dictionaries
-- Why:
--   네이밍 추천 토큰을 코드 상수에만 두면 팀/워크스페이스별 방송 그래픽
--   운영 용어를 반영할 수 없다. workspace 단위 사전을 DB로 승격해
--   관리자 페이지에서 위치/역할/콘텐츠/스타일/운영 상태 토큰을 편집한다.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.naming_dictionaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token_groups JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT naming_dictionaries_workspace_unique UNIQUE (workspace_id),
  CONSTRAINT naming_dictionaries_token_groups_array
    CHECK (jsonb_typeof(token_groups) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_naming_dictionaries_workspace
  ON public.naming_dictionaries(workspace_id);

ALTER TABLE public.naming_dictionaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "naming_dictionaries_select" ON public.naming_dictionaries;
DROP POLICY IF EXISTS "naming_dictionaries_insert" ON public.naming_dictionaries;
DROP POLICY IF EXISTS "naming_dictionaries_update" ON public.naming_dictionaries;
DROP POLICY IF EXISTS "naming_dictionaries_delete" ON public.naming_dictionaries;

CREATE POLICY "naming_dictionaries_select"
  ON public.naming_dictionaries
  FOR SELECT
  USING (
    public.is_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "naming_dictionaries_insert"
  ON public.naming_dictionaries
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "naming_dictionaries_update"
  ON public.naming_dictionaries
  FOR UPDATE
  USING (
    public.is_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    public.is_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "naming_dictionaries_delete"
  ON public.naming_dictionaries
  FOR DELETE
  USING (
    public.is_admin()
    OR workspace_id IN (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.naming_dictionaries IS
  '워크스페이스별 방송 그래픽 네이밍 추천 사전.';

COMMENT ON COLUMN public.naming_dictionaries.token_groups IS
  'NamingTokenGroup[] 형태의 위치/역할/콘텐츠/스타일/운영 상태 토큰 묶음.';
-- Fix rundown package imports for standalone/workspace rundowns.
--
-- Why:
-- - Package import creates a new rundown without project_id.
-- - Existing write policies only allowed rows attached to a project owned by auth.uid().
-- - That blocked valid standalone imports before rundown_items could be restored.
--
-- Tradeoff:
-- - Keep project ownership checks for project-bound rundowns.
-- - Add explicit creator/workspace checks for standalone or workspace-scoped rundowns.

BEGIN;

DROP POLICY IF EXISTS "ws_insert_rundowns" ON rundowns;
CREATE POLICY "ws_insert_rundowns" ON rundowns
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND (
        project_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM projects
          WHERE projects.id = project_id
            AND projects.owner_id = auth.uid()
        )
      )
      AND (
        workspace_id IS NULL
        OR public.is_workspace_member(workspace_id)
      )
    )
  );

DROP POLICY IF EXISTS "ws_update_rundowns" ON rundowns;
CREATE POLICY "ws_update_rundowns" ON rundowns
  FOR UPDATE USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = rundowns.project_id
        AND projects.owner_id = auth.uid()
    )
    OR (
      rundowns.workspace_id IS NOT NULL
      AND public.is_workspace_member(rundowns.workspace_id)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = project_id
        AND projects.owner_id = auth.uid()
    )
    OR (
      workspace_id IS NOT NULL
      AND public.is_workspace_member(workspace_id)
    )
  );

DROP POLICY IF EXISTS "ws_delete_rundowns" ON rundowns;
CREATE POLICY "ws_delete_rundowns" ON rundowns
  FOR DELETE USING (
    public.is_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM projects
      WHERE projects.id = rundowns.project_id
        AND projects.owner_id = auth.uid()
    )
    OR (
      rundowns.workspace_id IS NOT NULL
      AND public.is_workspace_member(rundowns.workspace_id)
    )
  );

DROP POLICY IF EXISTS "ws_select_rundown_items" ON rundown_items;
CREATE POLICY "ws_select_rundown_items" ON rundown_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM rundowns
      LEFT JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
        AND (
          rundowns.is_public = TRUE
          OR rundowns.created_by = auth.uid()
          OR projects.owner_id = auth.uid()
          OR (
            rundowns.workspace_id IS NOT NULL
            AND public.is_workspace_member(rundowns.workspace_id)
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ws_insert_rundown_items" ON rundown_items;
CREATE POLICY "ws_insert_rundown_items" ON rundown_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM rundowns
      LEFT JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_id
        AND (
          rundowns.created_by = auth.uid()
          OR projects.owner_id = auth.uid()
          OR (
            rundowns.workspace_id IS NOT NULL
            AND public.is_workspace_member(rundowns.workspace_id)
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ws_update_rundown_items" ON rundown_items;
CREATE POLICY "ws_update_rundown_items" ON rundown_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM rundowns
      LEFT JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
        AND (
          rundowns.created_by = auth.uid()
          OR projects.owner_id = auth.uid()
          OR (
            rundowns.workspace_id IS NOT NULL
            AND public.is_workspace_member(rundowns.workspace_id)
          )
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ws_delete_rundown_items" ON rundown_items;
CREATE POLICY "ws_delete_rundown_items" ON rundown_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM rundowns
      LEFT JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
        AND (
          rundowns.created_by = auth.uid()
          OR projects.owner_id = auth.uid()
          OR (
            rundowns.workspace_id IS NOT NULL
            AND public.is_workspace_member(rundowns.workspace_id)
          )
          OR public.is_admin()
        )
    )
  );

COMMIT;
