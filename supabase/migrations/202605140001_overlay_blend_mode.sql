


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE OR REPLACE FUNCTION "public"."fathom_match_chunks"("query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.7, "match_count" integer DEFAULT 10, "decay_rate" double precision DEFAULT 0.01, "required_clearance" "text" DEFAULT 'L1_PRIVATE'::"text") RETURNS TABLE("chunk_id" "uuid", "context_id" "uuid", "story_id" "uuid", "chunk_text" "text", "context_title" "text", "ai_summary" "text", "similarity" double precision, "time_weighted_score" double precision)
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."fathom_match_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "decay_rate" double precision, "required_clearance" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("required_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."has_role"("required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT role = 'system_admin' OR is_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_workspace_member"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_workspace_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    array_agg(workspace_id),
    '{}'::UUID[]
  )
  FROM workspace_members
  WHERE user_id = auth.uid();
$$;


ALTER FUNCTION "public"."my_workspace_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_broadcast_sessions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_broadcast_sessions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_fonts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_fonts_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_character_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "riv_file_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rive_analysis" "jsonb",
    "action_mappings" "jsonb" DEFAULT '[]'::"jsonb",
    "grid_template_id" "uuid",
    "zone_bounds" "jsonb"
);


ALTER TABLE "public"."ai_character_presets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_character_presets"."grid_template_id" IS '캐릭터가 배치될 그리드 템플릿 ID';



COMMENT ON COLUMN "public"."ai_character_presets"."zone_bounds" IS '선택된 Zone 결합 영역 ({x,y,width,height})';



CREATE TABLE IF NOT EXISTS "public"."ai_character_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "visible" boolean DEFAULT false,
    "preset_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_on_air" boolean DEFAULT false,
    "vm_values" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."ai_character_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_cuesheet_session_scenes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "scene_order" integer NOT NULL,
    "trigger_note" "text",
    "scene_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_html" "text",
    "generated_css" "text"
);


ALTER TABLE "public"."ai_cuesheet_session_scenes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_cuesheet_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "program_title" "text" NOT NULL,
    "expert_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_input_json" "text",
    "scene_count" integer DEFAULT 0 NOT NULL,
    "generated_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_cuesheet_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "tier" "text" DEFAULT 'free'::"text",
    "rpm_limit" integer DEFAULT 10,
    "rpd_limit" integer DEFAULT 1500,
    "tpm_limit" integer DEFAULT 0,
    "tpd_limit" integer DEFAULT 0,
    "is_active" boolean DEFAULT false,
    "fallback_model_id" "text",
    "threshold_percent" integer DEFAULT 80,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "provider" "text" DEFAULT 'gemini'::"text",
    "base_url" "text",
    "api_key_id" "uuid",
    "system_prompt" "text",
    "generation_config" "jsonb" DEFAULT '{"topK": 40, "topP": 0.95, "temperature": 0.9, "maxOutputTokens": 8192}'::"jsonb",
    "description" "text"
);


ALTER TABLE "public"."ai_model_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "model_id" "text" NOT NULL,
    "prompt_tokens" integer DEFAULT 0,
    "completion_tokens" integer DEFAULT 0,
    "total_tokens" integer DEFAULT 0,
    "request_type" "text" DEFAULT 'cg_generation'::"text",
    "user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "service" "text" NOT NULL,
    "encrypted_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."broadcast_segments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "cuesheet_item_id" "uuid",
    "label" "text" NOT NULL,
    "reporter" "text",
    "slug" "text",
    "segment_order" integer DEFAULT 0,
    "color" "text" DEFAULT 'rgba(59, 130, 246, 0.12)'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."broadcast_segments" OWNER TO "postgres";


COMMENT ON TABLE "public"."broadcast_segments" IS '타임라인 세그먼트 — 뉴스 아이템 1개 = 1세그먼트. Premiere의 Nested Sequence 개념.';



COMMENT ON COLUMN "public"."broadcast_segments"."cuesheet_item_id" IS 'NRCS 큐시트 아이템 FK. 순서 변경 시 segment_order 자동 동기화 지원.';



COMMENT ON COLUMN "public"."broadcast_segments"."segment_order" IS 'NRCS item_order와 동기되어 탭 바 표시 순서를 결정.';



COMMENT ON COLUMN "public"."broadcast_segments"."color" IS '세그먼트 배경 밴드 색상 (rgba). 타임라인 전체 뷰에서 시각적 구분.';



CREATE TABLE IF NOT EXISTS "public"."broadcast_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "rundown_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'draft'::"text",
    "timeline_data" "jsonb" DEFAULT '[]'::"jsonb",
    "playhead_state" "jsonb" DEFAULT '{}'::"jsonb",
    "workspace_id" "uuid",
    CONSTRAINT "broadcast_sessions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'live'::"text", 'ended'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."broadcast_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."broadcast_sessions" IS '런다운에서 생성된 방송 세션 (프로젝트)';



COMMENT ON COLUMN "public"."broadcast_sessions"."status" IS 'draft=준비중, ready=준비완료, live=송출중, ended=송출종료, completed=완료';



COMMENT ON COLUMN "public"."broadcast_sessions"."timeline_data" IS '타임라인 배치 정보 (아이템별 시작 위치, 트랙 ID 등)';



COMMENT ON COLUMN "public"."broadcast_sessions"."playhead_state" IS 'PGM 송출 상태 스냅샷 (playheadPosition, pgmBlockId, completedBlockIds, airedBlockIds, skippedBlockIds)';



CREATE TABLE IF NOT EXISTS "public"."bundle_slots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bundle_id" "uuid" NOT NULL,
    "cg_type" "text" NOT NULL,
    "graphic_id" "uuid",
    "field_mapping" "jsonb" DEFAULT '{}'::"jsonb",
    "sort_order" integer DEFAULT 0,
    "priority" integer DEFAULT 0
);


ALTER TABLE "public"."bundle_slots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cuesheet_data_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "source_type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb",
    "raw_data" "jsonb" DEFAULT '[]'::"jsonb",
    "column_schema" "jsonb" DEFAULT '[]'::"jsonb",
    "row_count" integer DEFAULT 0,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cuesheet_data_sources_source_type_check" CHECK (("source_type" = ANY (ARRAY['nrcs'::"text", 'csv'::"text"])))
);


ALTER TABLE "public"."cuesheet_data_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_data_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT '🔗'::"text",
    "provider" "text" DEFAULT '커스텀 API'::"text",
    "description" "text",
    "accent" "text" DEFAULT 'rgba(99,102,241,0.5)'::"text",
    "endpoint" "text" NOT NULL,
    "method" "text" DEFAULT 'GET'::"text",
    "headers" "jsonb" DEFAULT '{}'::"jsonb",
    "query_params" "jsonb" DEFAULT '{}'::"jsonb",
    "body_template" "jsonb",
    "response_mapping" "jsonb" DEFAULT '{}'::"jsonb",
    "auth_type" "text" DEFAULT 'none'::"text",
    "api_key_id" "uuid",
    "is_active" boolean DEFAULT true,
    "last_tested" timestamp with time zone,
    "last_status" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    CONSTRAINT "custom_data_sources_auth_type_check" CHECK (("auth_type" = ANY (ARRAY['none'::"text", 'api_key'::"text", 'bearer'::"text"]))),
    CONSTRAINT "custom_data_sources_method_check" CHECK (("method" = ANY (ARRAY['GET'::"text", 'POST'::"text"])))
);


ALTER TABLE "public"."custom_data_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_cg_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "cg_item_id" "uuid" NOT NULL,
    "link_type" "text" DEFAULT 'primary'::"text" NOT NULL,
    "cg_system" "text" DEFAULT 'webcgk'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_cg_links_link_type_check" CHECK (("link_type" = ANY (ARRAY['primary'::"text", 'supplementary'::"text"])))
);


ALTER TABLE "public"."fathom_cg_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."fathom_cg_links" IS 'Fathom 기사 ↔ WebCG-K CG 블록 양방향 연결 (탯줄)';



COMMENT ON COLUMN "public"."fathom_cg_links"."link_type" IS 'primary=내보내기 자동 생성, manual=기자 직접 연결';



CREATE TABLE IF NOT EXISTS "public"."fathom_context_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "context_id" "uuid" NOT NULL,
    "chunk_index" integer DEFAULT 0 NOT NULL,
    "chunk_text" "text" NOT NULL,
    "embedding" "public"."vector"(768),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fathom_context_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "context_type" "text" DEFAULT 'memo'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "ai_summary" "text",
    "file_path" "text",
    "source_url" "text",
    "clearance_level" "text" DEFAULT 'L1_PRIVATE'::"text" NOT NULL,
    "processing_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_used_in_broadcast" boolean DEFAULT false,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_contexts_clearance_level_check" CHECK (("clearance_level" = ANY (ARRAY['L1_PRIVATE'::"text", 'L2_INTERNAL'::"text", 'L3_PUBLIC_SAFE'::"text"]))),
    CONSTRAINT "fathom_contexts_context_type_check" CHECK (("context_type" = ANY (ARRAY['pdf'::"text", 'excel'::"text", 'transcript'::"text", 'memo'::"text", 'link'::"text", 'note'::"text", 'image'::"text"]))),
    CONSTRAINT "fathom_contexts_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'done'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."fathom_contexts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_entities_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['person'::"text", 'organization'::"text", 'place'::"text", 'concept'::"text", 'statistic'::"text"])))
);


ALTER TABLE "public"."fathom_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_entity_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_entity_id" "uuid" NOT NULL,
    "target_entity_id" "uuid" NOT NULL,
    "relation_type" "text" NOT NULL,
    "confidence" double precision DEFAULT 0.5,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_entity_relations_confidence_check" CHECK ((("confidence" >= (0.0)::double precision) AND ("confidence" <= (1.0)::double precision))),
    CONSTRAINT "fathom_entity_relations_relation_type_check" CHECK (("relation_type" = ANY (ARRAY['mentioned_by'::"text", 'related_to'::"text", 'contradicts'::"text", 'supports'::"text"])))
);


ALTER TABLE "public"."fathom_entity_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "air_time" time without time zone,
    "duration_minutes" integer DEFAULT 30,
    "weekdays" integer[] DEFAULT '{1,2,3,4,5}'::integer[],
    "color" "text" DEFAULT 'rgba(59, 130, 246, 0.15)'::"text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fathom_programs" OWNER TO "postgres";


COMMENT ON TABLE "public"."fathom_programs" IS '뉴스 프로그램 편성표 — NRCS의 Program 엔티티에 대응';



CREATE TABLE IF NOT EXISTS "public"."fathom_second_screen_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "card_type" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "cdn_url" "text",
    "is_published" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_second_screen_cards_card_type_check" CHECK (("card_type" = ANY (ARRAY['summary'::"text", 'chart'::"text", 'timeline'::"text", 'quote'::"text", 'document'::"text", 'raw_data'::"text"])))
);


ALTER TABLE "public"."fathom_second_screen_cards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_stories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "bureau" "text",
    "program" "text",
    "broadcast_script" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "aired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "fathom_stories_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'reviewed'::"text", 'aired'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."fathom_stories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fathom_story_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "story_id" "uuid" NOT NULL,
    "program_id" "uuid" NOT NULL,
    "air_date" "date" NOT NULL,
    "segment_order" integer DEFAULT 0,
    "cg_texts" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "fathom_story_assignments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'aired'::"text", 'killed'::"text"])))
);


ALTER TABLE "public"."fathom_story_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."fathom_story_assignments" IS '기사→프로그램 배정 — NRCS의 Rundown Item에 대응. CG 텍스트 사전 정의 포함';



COMMENT ON COLUMN "public"."fathom_story_assignments"."cg_texts" IS 'CG 텍스트 배열 [{type, text, ...}]. WebCG-K 내보내기 시 타임라인 블록으로 변환';



COMMENT ON COLUMN "public"."fathom_story_assignments"."status" IS 'pending=대기, confirmed=확정, aired=방송완료, killed=폐기';



CREATE TABLE IF NOT EXISTS "public"."fonts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "family_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "style" "text" DEFAULT 'normal'::"text" NOT NULL,
    "weight" integer DEFAULT 400 NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_size" integer,
    "mime_type" "text",
    "category" "text" DEFAULT 'custom'::"text" NOT NULL,
    "license_type" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "license_note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "fonts_category_check" CHECK (("category" = ANY (ARRAY['system'::"text", 'broadcast'::"text", 'custom'::"text"]))),
    CONSTRAINT "fonts_license_type_check" CHECK (("license_type" = ANY (ARRAY['OFL'::"text", 'Apache'::"text", 'Commercial'::"text", 'Unknown'::"text"])))
);


ALTER TABLE "public"."fonts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."graphics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "template_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "thumbnail_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_public" boolean DEFAULT false,
    "workspace_id" "uuid"
);


ALTER TABLE "public"."graphics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grid_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "template_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "thumbnail_path" "text",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "forked_from" "uuid"
);


ALTER TABLE "public"."grid_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."grid_templates"."forked_from" IS '원본 템플릿 ID (Fork된 경우)';



CREATE TABLE IF NOT EXISTS "public"."images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "storage_path" "text" NOT NULL,
    "file_size" integer,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "description" "text",
    "storage_path_2k" "text",
    "storage_path_4k" "text",
    "is_public" boolean DEFAULT true,
    "workspace_id" "uuid"
);


ALTER TABLE "public"."images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nrcs_cuesheet_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cuesheet_id" "uuid" NOT NULL,
    "nrcs_item_id" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "reporter" "text",
    "article_type" "text",
    "item_order" integer DEFAULT 0,
    "cg_data" "jsonb" DEFAULT '[]'::"jsonb",
    "mapping_result" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "linked_rundown_item_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_row_id" "text",
    CONSTRAINT "nrcs_cuesheet_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'mapped'::"text", 'approved'::"text", 'aired'::"text"])))
);


ALTER TABLE "public"."nrcs_cuesheet_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nrcs_cuesheets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "program_name" "text" NOT NULL,
    "program_date" "date" NOT NULL,
    "bundle_id" "uuid",
    "linked_rundown_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text",
    "total_items" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text" DEFAULT 'manual'::"text",
    "source_id" "uuid",
    "workspace_id" "uuid",
    CONSTRAINT "nrcs_cuesheets_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'nrcs'::"text", 'csv'::"text"]))),
    CONSTRAINT "nrcs_cuesheets_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'ready'::"text", 'onair'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."nrcs_cuesheets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overlay_data_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "last_fetched" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "overlay_data_sources_type_check" CHECK (("type" = ANY (ARRAY['weather'::"text", 'earthquake'::"text", 'wildfire'::"text", 'public_data'::"text", 'custom_api'::"text", 'mcp'::"text"])))
);


ALTER TABLE "public"."overlay_data_sources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overlay_gallery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "template_id" "uuid",
    "name" "text" NOT NULL,
    "thumbnail" "text",
    "is_favorite" boolean DEFAULT false,
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."overlay_gallery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overlay_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "template_id" "uuid",
    "is_active" boolean DEFAULT false,
    "current_data" "jsonb",
    "animation_state" "text" DEFAULT 'idle'::"text",
    "conflict_mode" "text" DEFAULT 'overlay'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pending_data" "jsonb",
    "active_content_index" integer DEFAULT 0,
    "replicant_data" "jsonb",
    "group_tag" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "render_state" "jsonb",
    CONSTRAINT "overlay_state_conflict_mode_check" CHECK (("conflict_mode" = ANY (ARRAY['overlay'::"text", 'hide_block'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."overlay_state" OWNER TO "postgres";


COMMENT ON COLUMN "public"."overlay_state"."replicant_data" IS 'HTML 플러그인 전용 실시간 데이터. 대시보드에서 갱신 → Realtime → iframe postMessage';



COMMENT ON COLUMN "public"."overlay_state"."group_tag" IS '그룹 태그. 같은 group_tag를 가진 오버레이들은 데이터를 일괄 수신. 예: "debate-timer"';



COMMENT ON COLUMN "public"."overlay_state"."tags" IS '렌더러 필터용 태그 배열. /render?tag=viewer 로 특정 태그만 표시. 예: ["viewer", "lower-third"]';



COMMENT ON COLUMN "public"."overlay_state"."render_state" IS 'Renderer actual rendering state (CQRS Query channel).
JSON: { phase, phaseChangedAt, context }.
Written by Renderer via reportRenderState().';



CREATE TABLE IF NOT EXISTS "public"."overlay_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "layer" integer DEFAULT 2,
    "graphic_data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "data_source" "jsonb",
    "refresh_interval" integer,
    "animation_config" "jsonb" DEFAULT '{"in": {"type": "fade", "duration": 500}, "out": {"type": "fade", "duration": 300}}'::"jsonb",
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "grid_template_id" "uuid",
    "zone_ids" "text"[],
    "zone_bounds" "jsonb",
    "ai_prompt" "text",
    "source_type" "text" DEFAULT 'manual'::"text",
    "ai_metadata" "jsonb",
    "tags" "text"[],
    "plugin_type" "text" DEFAULT 'svg'::"text",
    "source_code" "jsonb",
    "dashboard_schema" "jsonb",
    "replicant_defaults" "jsonb",
    "thumbnail" "text",
    "category" "text" DEFAULT 'cg_panel'::"text",
    "workspace_id" "uuid",
    "blend_mode" "text",
    CONSTRAINT "overlay_templates_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'ai_generated'::"text", 'imported'::"text", 'api_bound'::"text"])))
);


ALTER TABLE "public"."overlay_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."overlay_templates"."plugin_type" IS '렌더링 모드: svg(기존 GraphicPreviewRenderer) | html(sandboxed iframe)';



COMMENT ON COLUMN "public"."overlay_templates"."source_code" IS 'HTML 플러그인 소스 코드 JSON: { html: string, css: string, js: string }';



COMMENT ON COLUMN "public"."overlay_templates"."dashboard_schema" IS '대시보드 자동 생성 JSON Schema: { properties: { fieldName: { type, title, default, ... } } }';



COMMENT ON COLUMN "public"."overlay_templates"."replicant_defaults" IS 'Replicant 기본값 JSON. 세션 추가 시 overlay_state.replicant_data 초기값으로 복사';



COMMENT ON COLUMN "public"."overlay_templates"."blend_mode" IS 'CSS mix-blend-mode: normal | multiply | screen | overlay | soft-light | hard-light | color-dodge | color-burn | difference | luminosity';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "is_admin" boolean DEFAULT false,
    "last_login_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" DEFAULT 'viewer'::"text",
    "active_workspace_id" "uuid",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['system_admin'::"text", 'cg_designer'::"text", 'cuesheet_editor'::"text", 'playout_operator'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_broadcasting" boolean DEFAULT false,
    "timeline_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "active_rundown_id" "uuid",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rundown_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rundown_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "item_order" integer DEFAULT 0 NOT NULL,
    "duration" integer DEFAULT 5,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text" DEFAULT 'template'::"text",
    "source_id" "uuid",
    "source_name" "text",
    "thumbnail" "text",
    "section_id" "text",
    "track_layer" "text",
    "parent_item_id" "uuid"
);


ALTER TABLE "public"."rundown_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rundown_items"."source_type" IS 'image | graphic | template';



COMMENT ON COLUMN "public"."rundown_items"."source_id" IS '이미지/그래픽/템플릿의 ID';



COMMENT ON COLUMN "public"."rundown_items"."source_name" IS '아이템 표시 이름';



COMMENT ON COLUMN "public"."rundown_items"."thumbnail" IS '썸네일 경로 또는 URL';



COMMENT ON COLUMN "public"."rundown_items"."section_id" IS '소속 섹션 ID (rundowns.sections_data 내 id와 매칭)';



CREATE TABLE IF NOT EXISTS "public"."rundowns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "is_public" boolean DEFAULT false,
    "sections_data" "jsonb" DEFAULT '[]'::"jsonb",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."rundowns" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rundowns"."sections_data" IS '런다운 섹션 그룹화 데이터 (JSON 배열: [{id, name, color, order}])';



CREATE TABLE IF NOT EXISTS "public"."session_action_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "action_type" "text" NOT NULL,
    "action_detail" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."session_action_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."template_bundles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "program_name" "text",
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "theme_config" "jsonb" DEFAULT '{}'::"jsonb",
    "workspace_id" "uuid"
);


ALTER TABLE "public"."template_bundles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "is_public" boolean DEFAULT false,
    "timeline_preset" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "thumbnail_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid"
);


ALTER TABLE "public"."templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "description" "text",
    "avatar_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_character_presets"
    ADD CONSTRAINT "ai_character_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_character_state"
    ADD CONSTRAINT "ai_character_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_character_state"
    ADD CONSTRAINT "ai_character_state_session_id_key" UNIQUE ("session_id");



ALTER TABLE ONLY "public"."ai_cuesheet_session_scenes"
    ADD CONSTRAINT "ai_cuesheet_session_scenes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_cuesheet_sessions"
    ADD CONSTRAINT "ai_cuesheet_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_model_config"
    ADD CONSTRAINT "ai_model_config_model_id_key" UNIQUE ("model_id");



ALTER TABLE ONLY "public"."ai_model_config"
    ADD CONSTRAINT "ai_model_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_segments"
    ADD CONSTRAINT "broadcast_segments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."broadcast_sessions"
    ADD CONSTRAINT "broadcast_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bundle_slots"
    ADD CONSTRAINT "bundle_slots_bundle_id_cg_type_graphic_id_key" UNIQUE ("bundle_id", "cg_type", "graphic_id");



ALTER TABLE ONLY "public"."bundle_slots"
    ADD CONSTRAINT "bundle_slots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cuesheet_data_sources"
    ADD CONSTRAINT "cuesheet_data_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_data_sources"
    ADD CONSTRAINT "custom_data_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_cg_links"
    ADD CONSTRAINT "fathom_cg_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_cg_links"
    ADD CONSTRAINT "fathom_cg_links_story_id_cg_item_id_key" UNIQUE ("story_id", "cg_item_id");



ALTER TABLE ONLY "public"."fathom_context_chunks"
    ADD CONSTRAINT "fathom_context_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_contexts"
    ADD CONSTRAINT "fathom_contexts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_entities"
    ADD CONSTRAINT "fathom_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_entity_relations"
    ADD CONSTRAINT "fathom_entity_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_programs"
    ADD CONSTRAINT "fathom_programs_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."fathom_programs"
    ADD CONSTRAINT "fathom_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_second_screen_cards"
    ADD CONSTRAINT "fathom_second_screen_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_stories"
    ADD CONSTRAINT "fathom_stories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_story_assignments"
    ADD CONSTRAINT "fathom_story_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fathom_story_assignments"
    ADD CONSTRAINT "fathom_story_assignments_story_id_program_id_air_date_key" UNIQUE ("story_id", "program_id", "air_date");



ALTER TABLE ONLY "public"."fonts"
    ADD CONSTRAINT "fonts_family_name_weight_style_key" UNIQUE ("family_name", "weight", "style");



ALTER TABLE ONLY "public"."fonts"
    ADD CONSTRAINT "fonts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."graphics"
    ADD CONSTRAINT "graphics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grid_templates"
    ADD CONSTRAINT "grid_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nrcs_cuesheet_items"
    ADD CONSTRAINT "nrcs_cuesheet_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overlay_data_sources"
    ADD CONSTRAINT "overlay_data_sources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overlay_gallery"
    ADD CONSTRAINT "overlay_gallery_owner_id_template_id_key" UNIQUE ("owner_id", "template_id");



ALTER TABLE ONLY "public"."overlay_gallery"
    ADD CONSTRAINT "overlay_gallery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overlay_state"
    ADD CONSTRAINT "overlay_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overlay_state"
    ADD CONSTRAINT "overlay_state_session_id_template_id_key" UNIQUE ("session_id", "template_id");



ALTER TABLE ONLY "public"."overlay_templates"
    ADD CONSTRAINT "overlay_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rundown_items"
    ADD CONSTRAINT "rundown_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rundowns"
    ADD CONSTRAINT "rundowns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_action_logs"
    ADD CONSTRAINT "session_action_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."template_bundles"
    ADD CONSTRAINT "template_bundles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_slug_key" UNIQUE ("slug");



CREATE INDEX "fathom_chunks_embedding_idx" ON "public"."fathom_context_chunks" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='128');



CREATE INDEX "idx_ai_model_config_api_key" ON "public"."ai_model_config" USING "btree" ("api_key_id");



CREATE INDEX "idx_ai_model_config_provider" ON "public"."ai_model_config" USING "btree" ("provider");



CREATE INDEX "idx_ai_usage_logs_created" ON "public"."ai_usage_logs" USING "btree" ("created_at");



CREATE INDEX "idx_ai_usage_logs_model" ON "public"."ai_usage_logs" USING "btree" ("model_id");



CREATE INDEX "idx_ai_usage_logs_user" ON "public"."ai_usage_logs" USING "btree" ("user_id");



CREATE INDEX "idx_aics_scenes_session" ON "public"."ai_cuesheet_session_scenes" USING "btree" ("session_id");



CREATE INDEX "idx_aics_sessions_owner" ON "public"."ai_cuesheet_sessions" USING "btree" ("owner_id");



CREATE INDEX "idx_api_keys_owner" ON "public"."api_keys" USING "btree" ("owner_id");



CREATE INDEX "idx_assignments_date" ON "public"."fathom_story_assignments" USING "btree" ("air_date");



CREATE INDEX "idx_assignments_program_date" ON "public"."fathom_story_assignments" USING "btree" ("program_id", "air_date");



CREATE INDEX "idx_assignments_story" ON "public"."fathom_story_assignments" USING "btree" ("story_id");



CREATE INDEX "idx_broadcast_sessions_created_by" ON "public"."broadcast_sessions" USING "btree" ("created_by");



CREATE INDEX "idx_broadcast_sessions_rundown_id" ON "public"."broadcast_sessions" USING "btree" ("rundown_id");



CREATE INDEX "idx_broadcast_sessions_status" ON "public"."broadcast_sessions" USING "btree" ("status");



CREATE INDEX "idx_bundles_owner" ON "public"."template_bundles" USING "btree" ("owner_id");



CREATE INDEX "idx_bundles_program" ON "public"."template_bundles" USING "btree" ("program_name");



CREATE INDEX "idx_bundles_ws" ON "public"."template_bundles" USING "btree" ("workspace_id");



CREATE INDEX "idx_cds_ws" ON "public"."custom_data_sources" USING "btree" ("workspace_id");



CREATE INDEX "idx_cg_links_cg_item" ON "public"."fathom_cg_links" USING "btree" ("cg_item_id");



CREATE INDEX "idx_cg_links_story" ON "public"."fathom_cg_links" USING "btree" ("story_id");



CREATE INDEX "idx_cs_ds_owner" ON "public"."cuesheet_data_sources" USING "btree" ("owner_id");



CREATE INDEX "idx_cs_ds_type" ON "public"."cuesheet_data_sources" USING "btree" ("source_type");



CREATE INDEX "idx_custom_data_sources_owner" ON "public"."custom_data_sources" USING "btree" ("owner_id");



CREATE INDEX "idx_fonts_category" ON "public"."fonts" USING "btree" ("category");



CREATE INDEX "idx_fonts_family" ON "public"."fonts" USING "btree" ("family_name");



CREATE INDEX "idx_fonts_owner" ON "public"."fonts" USING "btree" ("owner_id");



CREATE INDEX "idx_graphics_owner_id" ON "public"."graphics" USING "btree" ("owner_id");



CREATE INDEX "idx_graphics_ws" ON "public"."graphics" USING "btree" ("workspace_id");



CREATE INDEX "idx_grid_templates_forked_from" ON "public"."grid_templates" USING "btree" ("forked_from");



CREATE INDEX "idx_grid_templates_is_public" ON "public"."grid_templates" USING "btree" ("is_public");



CREATE INDEX "idx_grid_templates_owner_id" ON "public"."grid_templates" USING "btree" ("owner_id");



CREATE INDEX "idx_images_category" ON "public"."images" USING "btree" ("category");



CREATE INDEX "idx_images_has_2k" ON "public"."images" USING "btree" ((("storage_path_2k" IS NOT NULL)));



CREATE INDEX "idx_images_has_4k" ON "public"."images" USING "btree" ((("storage_path_4k" IS NOT NULL)));



CREATE INDEX "idx_images_owner_id" ON "public"."images" USING "btree" ("owner_id");



CREATE INDEX "idx_images_ws" ON "public"."images" USING "btree" ("workspace_id");



CREATE INDEX "idx_nrcs_ci_cuesheet" ON "public"."nrcs_cuesheet_items" USING "btree" ("cuesheet_id");



CREATE INDEX "idx_nrcs_ci_order" ON "public"."nrcs_cuesheet_items" USING "btree" ("item_order");



CREATE INDEX "idx_nrcs_ci_source_row" ON "public"."nrcs_cuesheet_items" USING "btree" ("source_row_id");



CREATE INDEX "idx_nrcs_cs_date" ON "public"."nrcs_cuesheets" USING "btree" ("program_date");



CREATE INDEX "idx_nrcs_cs_owner" ON "public"."nrcs_cuesheets" USING "btree" ("owner_id");



CREATE INDEX "idx_nrcs_cs_source" ON "public"."nrcs_cuesheets" USING "btree" ("source_id");



CREATE INDEX "idx_nrcs_ws" ON "public"."nrcs_cuesheets" USING "btree" ("workspace_id");



CREATE INDEX "idx_overlay_data_sources_owner" ON "public"."overlay_data_sources" USING "btree" ("owner_id");



CREATE INDEX "idx_overlay_data_sources_type" ON "public"."overlay_data_sources" USING "btree" ("type");



CREATE INDEX "idx_overlay_gallery_favorite" ON "public"."overlay_gallery" USING "btree" ("owner_id", "is_favorite") WHERE ("is_favorite" = true);



CREATE INDEX "idx_overlay_gallery_owner" ON "public"."overlay_gallery" USING "btree" ("owner_id");



CREATE INDEX "idx_overlay_state_active" ON "public"."overlay_state" USING "btree" ("session_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_overlay_state_group_tag" ON "public"."overlay_state" USING "btree" ("session_id", "group_tag") WHERE ("group_tag" IS NOT NULL);



CREATE INDEX "idx_overlay_state_session" ON "public"."overlay_state" USING "btree" ("session_id");



CREATE INDEX "idx_overlay_state_tags" ON "public"."overlay_state" USING "gin" ("tags") WHERE ("tags" <> '{}'::"text"[]);



CREATE INDEX "idx_overlay_templates_grid" ON "public"."overlay_templates" USING "btree" ("grid_template_id");



CREATE INDEX "idx_overlay_templates_owner" ON "public"."overlay_templates" USING "btree" ("owner_id");



CREATE INDEX "idx_overlay_templates_plugin_type" ON "public"."overlay_templates" USING "btree" ("plugin_type");



CREATE INDEX "idx_overlay_templates_public" ON "public"."overlay_templates" USING "btree" ("is_public");



CREATE INDEX "idx_overlay_templates_source" ON "public"."overlay_templates" USING "btree" ("source_type");



CREATE INDEX "idx_overlay_ws" ON "public"."overlay_templates" USING "btree" ("workspace_id");



CREATE INDEX "idx_profiles_is_admin" ON "public"."profiles" USING "btree" ("is_admin");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_programs_active" ON "public"."fathom_programs" USING "btree" ("is_active");



CREATE INDEX "idx_projects_active_rundown_id" ON "public"."projects" USING "btree" ("active_rundown_id");



CREATE INDEX "idx_projects_is_broadcasting" ON "public"."projects" USING "btree" ("is_broadcasting");



CREATE INDEX "idx_projects_owner_id" ON "public"."projects" USING "btree" ("owner_id");



CREATE INDEX "idx_projects_ws" ON "public"."projects" USING "btree" ("workspace_id");



CREATE INDEX "idx_rundown_items_parent" ON "public"."rundown_items" USING "btree" ("parent_item_id") WHERE ("parent_item_id" IS NOT NULL);



CREATE INDEX "idx_rundown_items_rundown_id" ON "public"."rundown_items" USING "btree" ("rundown_id");



CREATE INDEX "idx_rundown_items_section_id" ON "public"."rundown_items" USING "btree" ("section_id") WHERE ("section_id" IS NOT NULL);



CREATE INDEX "idx_rundown_items_source_id" ON "public"."rundown_items" USING "btree" ("source_id");



CREATE INDEX "idx_rundown_items_source_type" ON "public"."rundown_items" USING "btree" ("source_type");



CREATE INDEX "idx_rundown_items_track_layer" ON "public"."rundown_items" USING "btree" ("track_layer") WHERE ("track_layer" IS NOT NULL);



CREATE INDEX "idx_rundowns_project_id" ON "public"."rundowns" USING "btree" ("project_id");



CREATE INDEX "idx_rundowns_ws" ON "public"."rundowns" USING "btree" ("workspace_id");



CREATE INDEX "idx_segments_order" ON "public"."broadcast_segments" USING "btree" ("session_id", "segment_order");



CREATE INDEX "idx_segments_session" ON "public"."broadcast_segments" USING "btree" ("session_id");



CREATE INDEX "idx_session_logs_session" ON "public"."session_action_logs" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_session_logs_user" ON "public"."session_action_logs" USING "btree" ("user_id");



CREATE INDEX "idx_sessions_ws" ON "public"."broadcast_sessions" USING "btree" ("workspace_id");



CREATE INDEX "idx_slots_bundle" ON "public"."bundle_slots" USING "btree" ("bundle_id");



CREATE INDEX "idx_templates_is_public" ON "public"."templates" USING "btree" ("is_public");



CREATE INDEX "idx_templates_owner_id" ON "public"."templates" USING "btree" ("owner_id");



CREATE INDEX "idx_templates_ws" ON "public"."templates" USING "btree" ("workspace_id");



CREATE INDEX "idx_wm_user" ON "public"."workspace_members" USING "btree" ("user_id");



CREATE INDEX "idx_wm_workspace" ON "public"."workspace_members" USING "btree" ("workspace_id");



CREATE OR REPLACE TRIGGER "trigger_broadcast_sessions_updated_at" BEFORE UPDATE ON "public"."broadcast_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."update_broadcast_sessions_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_fonts_updated_at" BEFORE UPDATE ON "public"."fonts" FOR EACH ROW EXECUTE FUNCTION "public"."update_fonts_updated_at"();



ALTER TABLE ONLY "public"."ai_character_presets"
    ADD CONSTRAINT "ai_character_presets_grid_template_id_fkey" FOREIGN KEY ("grid_template_id") REFERENCES "public"."grid_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_character_presets"
    ADD CONSTRAINT "ai_character_presets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_character_state"
    ADD CONSTRAINT "ai_character_state_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "public"."ai_character_presets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_character_state"
    ADD CONSTRAINT "ai_character_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_cuesheet_session_scenes"
    ADD CONSTRAINT "ai_cuesheet_session_scenes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_cuesheet_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_cuesheet_sessions"
    ADD CONSTRAINT "ai_cuesheet_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_model_config"
    ADD CONSTRAINT "ai_model_config_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_segments"
    ADD CONSTRAINT "broadcast_segments_cuesheet_item_id_fkey" FOREIGN KEY ("cuesheet_item_id") REFERENCES "public"."nrcs_cuesheet_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."broadcast_segments"
    ADD CONSTRAINT "broadcast_segments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_sessions"
    ADD CONSTRAINT "broadcast_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."broadcast_sessions"
    ADD CONSTRAINT "broadcast_sessions_rundown_id_fkey" FOREIGN KEY ("rundown_id") REFERENCES "public"."rundowns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."broadcast_sessions"
    ADD CONSTRAINT "broadcast_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bundle_slots"
    ADD CONSTRAINT "bundle_slots_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."template_bundles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bundle_slots"
    ADD CONSTRAINT "bundle_slots_graphic_id_fkey" FOREIGN KEY ("graphic_id") REFERENCES "public"."graphics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cuesheet_data_sources"
    ADD CONSTRAINT "cuesheet_data_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_data_sources"
    ADD CONSTRAINT "custom_data_sources_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_data_sources"
    ADD CONSTRAINT "custom_data_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_data_sources"
    ADD CONSTRAINT "custom_data_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."fathom_cg_links"
    ADD CONSTRAINT "fathom_cg_links_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."fathom_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_context_chunks"
    ADD CONSTRAINT "fathom_context_chunks_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "public"."fathom_contexts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_contexts"
    ADD CONSTRAINT "fathom_contexts_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."fathom_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_entities"
    ADD CONSTRAINT "fathom_entities_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."fathom_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_entity_relations"
    ADD CONSTRAINT "fathom_entity_relations_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "public"."fathom_entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_entity_relations"
    ADD CONSTRAINT "fathom_entity_relations_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "public"."fathom_entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_second_screen_cards"
    ADD CONSTRAINT "fathom_second_screen_cards_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."fathom_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_stories"
    ADD CONSTRAINT "fathom_stories_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_story_assignments"
    ADD CONSTRAINT "fathom_story_assignments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."fathom_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fathom_story_assignments"
    ADD CONSTRAINT "fathom_story_assignments_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "public"."fathom_stories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fonts"
    ADD CONSTRAINT "fonts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."graphics"
    ADD CONSTRAINT "graphics_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."graphics"
    ADD CONSTRAINT "graphics_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grid_templates"
    ADD CONSTRAINT "grid_templates_forked_from_fkey" FOREIGN KEY ("forked_from") REFERENCES "public"."grid_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grid_templates"
    ADD CONSTRAINT "grid_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."images"
    ADD CONSTRAINT "images_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nrcs_cuesheet_items"
    ADD CONSTRAINT "nrcs_cuesheet_items_cuesheet_id_fkey" FOREIGN KEY ("cuesheet_id") REFERENCES "public"."nrcs_cuesheets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nrcs_cuesheet_items"
    ADD CONSTRAINT "nrcs_cuesheet_items_linked_rundown_item_id_fkey" FOREIGN KEY ("linked_rundown_item_id") REFERENCES "public"."rundown_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."template_bundles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_linked_rundown_id_fkey" FOREIGN KEY ("linked_rundown_id") REFERENCES "public"."rundowns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."cuesheet_data_sources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."nrcs_cuesheets"
    ADD CONSTRAINT "nrcs_cuesheets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."overlay_data_sources"
    ADD CONSTRAINT "overlay_data_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overlay_gallery"
    ADD CONSTRAINT "overlay_gallery_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overlay_gallery"
    ADD CONSTRAINT "overlay_gallery_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."overlay_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overlay_state"
    ADD CONSTRAINT "overlay_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overlay_state"
    ADD CONSTRAINT "overlay_state_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."overlay_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overlay_templates"
    ADD CONSTRAINT "overlay_templates_grid_template_id_fkey" FOREIGN KEY ("grid_template_id") REFERENCES "public"."grid_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."overlay_templates"
    ADD CONSTRAINT "overlay_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."overlay_templates"
    ADD CONSTRAINT "overlay_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_active_workspace_id_fkey" FOREIGN KEY ("active_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rundown_items"
    ADD CONSTRAINT "rundown_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "public"."rundown_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rundown_items"
    ADD CONSTRAINT "rundown_items_rundown_id_fkey" FOREIGN KEY ("rundown_id") REFERENCES "public"."rundowns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rundown_items"
    ADD CONSTRAINT "rundown_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rundowns"
    ADD CONSTRAINT "rundowns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rundowns"
    ADD CONSTRAINT "rundowns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rundowns"
    ADD CONSTRAINT "rundowns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_action_logs"
    ADD CONSTRAINT "session_action_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."broadcast_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_action_logs"
    ADD CONSTRAINT "session_action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."template_bundles"
    ADD CONSTRAINT "template_bundles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."template_bundles"
    ADD CONSTRAINT "template_bundles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."templates"
    ADD CONSTRAINT "templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Admins can update any profile" ON "public"."profiles" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "Anyone can view overlay state for live sessions" ON "public"."overlay_state" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions" "bs"
  WHERE (("bs"."id" = "overlay_state"."session_id") AND ("bs"."status" = 'live'::"text")))));



CREATE POLICY "Authenticated users can delete overlay state" ON "public"."overlay_state" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can insert overlay state" ON "public"."overlay_state" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can update overlay state" ON "public"."overlay_state" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view active fonts" ON "public"."fonts" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("is_active" = true)));



CREATE POLICY "Authenticated users can view overlay state" ON "public"."overlay_state" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can create own sessions" ON "public"."ai_cuesheet_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can create session scenes" ON "public"."ai_cuesheet_session_scenes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ai_cuesheet_sessions" "s"
  WHERE (("s"."id" = "ai_cuesheet_session_scenes"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own api keys" ON "public"."api_keys" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own data sources" ON "public"."overlay_data_sources" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own fonts" ON "public"."fonts" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own gallery" ON "public"."overlay_gallery" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own grid templates" ON "public"."grid_templates" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can delete own rundowns" ON "public"."rundowns" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "rundowns"."project_id") AND ("projects"."owner_id" = "auth"."uid"())))) OR ("created_by" = "auth"."uid"())));



CREATE POLICY "Users can delete own session scenes" ON "public"."ai_cuesheet_session_scenes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ai_cuesheet_sessions" "s"
  WHERE (("s"."id" = "ai_cuesheet_session_scenes"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own sessions" ON "public"."ai_cuesheet_sessions" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own api keys" ON "public"."api_keys" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own data sources" ON "public"."overlay_data_sources" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own fonts" ON "public"."fonts" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own gallery" ON "public"."overlay_gallery" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own grid templates" ON "public"."grid_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own api keys" ON "public"."api_keys" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own data sources" ON "public"."overlay_data_sources" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own fonts" ON "public"."fonts" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own gallery" ON "public"."overlay_gallery" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own grid templates" ON "public"."grid_templates" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own sessions" ON "public"."ai_cuesheet_sessions" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own api keys" ON "public"."api_keys" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own data sources" ON "public"."overlay_data_sources" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own gallery" ON "public"."overlay_gallery" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can view own or public grid templates" ON "public"."grid_templates" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("is_public" = true)));



CREATE POLICY "Users can view own or public images" ON "public"."images" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("is_public" = true)));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own session scenes" ON "public"."ai_cuesheet_session_scenes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ai_cuesheet_sessions" "s"
  WHERE (("s"."id" = "ai_cuesheet_session_scenes"."session_id") AND ("s"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Users can view own sessions" ON "public"."ai_cuesheet_sessions" FOR SELECT USING (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."ai_character_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_character_presets_owner_crud" ON "public"."ai_character_presets" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "ai_character_presets_public_read" ON "public"."ai_character_presets" FOR SELECT USING (true);



ALTER TABLE "public"."ai_character_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_character_state_authenticated" ON "public"."ai_character_state" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ai_character_state_renderer_public" ON "public"."ai_character_state" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions" "bs"
  WHERE (("bs"."id" = "ai_character_state"."session_id") AND ("bs"."status" = 'live'::"text")))));



ALTER TABLE "public"."ai_cuesheet_session_scenes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_cuesheet_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_model_config" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_model_config_delete_admin" ON "public"."ai_model_config" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "ai_model_config_insert_admin" ON "public"."ai_model_config" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



CREATE POLICY "ai_model_config_select" ON "public"."ai_model_config" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ai_model_config_update_admin" ON "public"."ai_model_config" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_usage_logs_insert" ON "public"."ai_usage_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "ai_usage_logs_select_admin" ON "public"."ai_usage_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_admin" = true)))));



ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assignments_delete" ON "public"."fathom_story_assignments" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "assignments_insert" ON "public"."fathom_story_assignments" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "assignments_select" ON "public"."fathom_story_assignments" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "assignments_update" ON "public"."fathom_story_assignments" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."broadcast_segments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."broadcast_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bundle_slots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cg_links_delete" ON "public"."fathom_cg_links" FOR DELETE USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "cg_links_insert" ON "public"."fathom_cg_links" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "cg_links_select" ON "public"."fathom_cg_links" FOR SELECT USING (true);



CREATE POLICY "cs_ds_delete" ON "public"."cuesheet_data_sources" FOR DELETE USING ((("auth"."uid"() = "owner_id") OR "public"."is_admin"()));



CREATE POLICY "cs_ds_insert" ON "public"."cuesheet_data_sources" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "cs_ds_select" ON "public"."cuesheet_data_sources" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR "public"."is_admin"()));



CREATE POLICY "cs_ds_update" ON "public"."cuesheet_data_sources" FOR UPDATE USING ((("auth"."uid"() = "owner_id") OR "public"."is_admin"()));



ALTER TABLE "public"."cuesheet_data_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_data_sources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_cards_insert_authenticated" ON "public"."fathom_second_screen_cards" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fathom_cards_select_public" ON "public"."fathom_second_screen_cards" FOR SELECT USING (("is_published" = true));



CREATE POLICY "fathom_cards_update_authenticated" ON "public"."fathom_second_screen_cards" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."fathom_cg_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_cg_links_insert_authenticated" ON "public"."fathom_cg_links" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fathom_cg_links_select_authenticated" ON "public"."fathom_cg_links" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "fathom_chunks_insert_authenticated" ON "public"."fathom_context_chunks" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fathom_chunks_select_authenticated" ON "public"."fathom_context_chunks" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fathom_context_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fathom_contexts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_contexts_delete_story_owner" ON "public"."fathom_contexts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."fathom_stories"
  WHERE (("fathom_stories"."id" = "fathom_contexts"."story_id") AND ("fathom_stories"."reporter_id" = "auth"."uid"())))));



CREATE POLICY "fathom_contexts_insert_authenticated" ON "public"."fathom_contexts" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fathom_contexts_select_authenticated" ON "public"."fathom_contexts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "fathom_contexts_update_authenticated" ON "public"."fathom_contexts" FOR UPDATE TO "authenticated" USING (true);



ALTER TABLE "public"."fathom_entities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_entities_insert_authenticated" ON "public"."fathom_entities" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "fathom_entities_select_authenticated" ON "public"."fathom_entities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fathom_entity_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_entity_relations_select_authenticated" ON "public"."fathom_entity_relations" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."fathom_programs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fathom_second_screen_cards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fathom_stories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fathom_stories_delete_own" ON "public"."fathom_stories" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "reporter_id"));



CREATE POLICY "fathom_stories_insert_own" ON "public"."fathom_stories" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "reporter_id"));



CREATE POLICY "fathom_stories_select_authenticated" ON "public"."fathom_stories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "fathom_stories_update_own" ON "public"."fathom_stories" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "reporter_id"));



ALTER TABLE "public"."fathom_story_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fonts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."graphics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grid_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nrcs_cuesheet_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."nrcs_cuesheets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."overlay_data_sources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."overlay_gallery" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."overlay_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."overlay_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "programs_insert" ON "public"."fathom_programs" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "programs_select" ON "public"."fathom_programs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "programs_update" ON "public"."fathom_programs" FOR UPDATE USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public_live_overlay_templates" ON "public"."overlay_templates" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."overlay_state" "os"
     JOIN "public"."broadcast_sessions" "bs" ON (("bs"."id" = "os"."session_id")))
  WHERE (("os"."template_id" = "overlay_templates"."id") AND ("bs"."status" = 'live'::"text")))));



CREATE POLICY "public_live_sessions" ON "public"."broadcast_sessions" FOR SELECT USING (("status" = 'live'::"text"));



ALTER TABLE "public"."rundown_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rundowns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "segments_delete" ON "public"."broadcast_segments" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions"
  WHERE (("broadcast_sessions"."id" = "broadcast_segments"."session_id") AND ("broadcast_sessions"."created_by" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "segments_insert" ON "public"."broadcast_segments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions"
  WHERE (("broadcast_sessions"."id" = "broadcast_segments"."session_id") AND ("broadcast_sessions"."created_by" = "auth"."uid"())))));



CREATE POLICY "segments_select" ON "public"."broadcast_segments" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions"
  WHERE (("broadcast_sessions"."id" = "broadcast_segments"."session_id") AND ("broadcast_sessions"."created_by" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "segments_update" ON "public"."broadcast_segments" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."broadcast_sessions"
  WHERE (("broadcast_sessions"."id" = "broadcast_segments"."session_id") AND ("broadcast_sessions"."created_by" = "auth"."uid"())))) OR "public"."is_admin"()));



ALTER TABLE "public"."session_action_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_bundles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wm_delete_admin" ON "public"."workspace_members" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "workspace_members_1"
  WHERE (("workspace_members_1"."workspace_id" = "workspace_members_1"."workspace_id") AND ("workspace_members_1"."user_id" = "auth"."uid"()) AND ("workspace_members_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR "public"."is_admin"()));



CREATE POLICY "wm_insert_admin" ON "public"."workspace_members" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "workspace_members_1"
  WHERE (("workspace_members_1"."workspace_id" = "workspace_members_1"."workspace_id") AND ("workspace_members_1"."user_id" = "auth"."uid"()) AND ("workspace_members_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR "public"."is_admin"()));



CREATE POLICY "wm_select_member" ON "public"."workspace_members" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_workspace_member"("workspace_id") OR "public"."is_admin"()));



CREATE POLICY "wm_update_admin" ON "public"."workspace_members" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "workspace_members_1"
  WHERE (("workspace_members_1"."workspace_id" = "workspace_members_1"."workspace_id") AND ("workspace_members_1"."user_id" = "auth"."uid"()) AND ("workspace_members_1"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR "public"."is_admin"()));



ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ws_delete_bundles" ON "public"."template_bundles" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_cds" ON "public"."custom_data_sources" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_cuesheet_items" ON "public"."nrcs_cuesheet_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."nrcs_cuesheets"
  WHERE (("nrcs_cuesheets"."id" = "nrcs_cuesheet_items"."cuesheet_id") AND (("nrcs_cuesheets"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_delete_cuesheets" ON "public"."nrcs_cuesheets" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_graphics" ON "public"."graphics" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_images" ON "public"."images" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_overlay_templates" ON "public"."overlay_templates" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_owner" ON "public"."workspaces" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "workspace_members"."id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = 'owner'::"text")))) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_projects" ON "public"."projects" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_rundown_items" ON "public"."rundown_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."rundowns"
     JOIN "public"."projects" ON (("projects"."id" = "rundowns"."project_id")))
  WHERE (("rundowns"."id" = "rundown_items"."rundown_id") AND (("projects"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_delete_rundowns" ON "public"."rundowns" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "rundowns"."project_id") AND ("projects"."owner_id" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_sessions" ON "public"."broadcast_sessions" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_delete_slots" ON "public"."bundle_slots" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."template_bundles"
  WHERE (("template_bundles"."id" = "bundle_slots"."bundle_id") AND (("template_bundles"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_delete_templates" ON "public"."templates" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_insert_action_logs" ON "public"."session_action_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "ws_insert_auth" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ws_insert_bundles" ON "public"."template_bundles" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_cds" ON "public"."custom_data_sources" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_cuesheet_items" ON "public"."nrcs_cuesheet_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."nrcs_cuesheets"
  WHERE (("nrcs_cuesheets"."id" = "nrcs_cuesheet_items"."cuesheet_id") AND ("nrcs_cuesheets"."owner_id" = "auth"."uid"())))));



CREATE POLICY "ws_insert_cuesheets" ON "public"."nrcs_cuesheets" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_graphics" ON "public"."graphics" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_images" ON "public"."images" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_overlay_templates" ON "public"."overlay_templates" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_projects" ON "public"."projects" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_insert_rundown_items" ON "public"."rundown_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."rundowns"
     JOIN "public"."projects" ON (("projects"."id" = "rundowns"."project_id")))
  WHERE (("rundowns"."id" = "rundown_items"."rundown_id") AND ("projects"."owner_id" = "auth"."uid"())))));



CREATE POLICY "ws_insert_rundowns" ON "public"."rundowns" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "rundowns"."project_id") AND ("projects"."owner_id" = "auth"."uid"())))));



CREATE POLICY "ws_insert_sessions" ON "public"."broadcast_sessions" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ws_insert_slots" ON "public"."bundle_slots" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."template_bundles"
  WHERE (("template_bundles"."id" = "bundle_slots"."bundle_id") AND ("template_bundles"."owner_id" = "auth"."uid"())))));



CREATE POLICY "ws_insert_templates" ON "public"."templates" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) AND (("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))));



CREATE POLICY "ws_select_action_logs" ON "public"."session_action_logs" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "ws_select_bundles" ON "public"."template_bundles" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_cds" ON "public"."custom_data_sources" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_cuesheet_items" ON "public"."nrcs_cuesheet_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."nrcs_cuesheets"
  WHERE (("nrcs_cuesheets"."id" = "nrcs_cuesheet_items"."cuesheet_id") AND (("nrcs_cuesheets"."owner_id" = "auth"."uid"()) OR (("nrcs_cuesheets"."workspace_id" IS NOT NULL) AND ("nrcs_cuesheets"."workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"())))));



CREATE POLICY "ws_select_cuesheets" ON "public"."nrcs_cuesheets" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_graphics" ON "public"."graphics" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("is_public" = true) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_images" ON "public"."images" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_overlay_templates" ON "public"."overlay_templates" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("is_public" = true) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_own" ON "public"."workspaces" FOR SELECT USING (("public"."is_workspace_member"("id") OR "public"."is_admin"()));



CREATE POLICY "ws_select_projects" ON "public"."projects" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_rundown_items" ON "public"."rundown_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."rundowns"
     JOIN "public"."projects" ON (("projects"."id" = "rundowns"."project_id")))
  WHERE (("rundowns"."id" = "rundown_items"."rundown_id") AND (("projects"."owner_id" = "auth"."uid"()) OR (("rundowns"."workspace_id" IS NOT NULL) AND ("rundowns"."workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"())))));



CREATE POLICY "ws_select_rundowns" ON "public"."rundowns" FOR SELECT USING ((("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "rundowns"."project_id") AND ("projects"."owner_id" = "auth"."uid"())))) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_sessions" ON "public"."broadcast_sessions" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_select_slots" ON "public"."bundle_slots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."template_bundles"
  WHERE (("template_bundles"."id" = "bundle_slots"."bundle_id") AND (("template_bundles"."owner_id" = "auth"."uid"()) OR (("template_bundles"."workspace_id" IS NOT NULL) AND ("template_bundles"."workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"())))));



CREATE POLICY "ws_select_templates" ON "public"."templates" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("is_public" = true) OR (("workspace_id" IS NOT NULL) AND ("workspace_id" = ANY ("public"."my_workspace_ids"()))) OR "public"."is_admin"()));



CREATE POLICY "ws_update_admin" ON "public"."workspaces" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "workspace_members"."id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) OR "public"."is_admin"()));



CREATE POLICY "ws_update_bundles" ON "public"."template_bundles" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_cds" ON "public"."custom_data_sources" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_cuesheet_items" ON "public"."nrcs_cuesheet_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."nrcs_cuesheets"
  WHERE (("nrcs_cuesheets"."id" = "nrcs_cuesheet_items"."cuesheet_id") AND (("nrcs_cuesheets"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_update_cuesheets" ON "public"."nrcs_cuesheets" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_graphics" ON "public"."graphics" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_images" ON "public"."images" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_overlay_templates" ON "public"."overlay_templates" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_projects" ON "public"."projects" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_rundown_items" ON "public"."rundown_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."rundowns"
     JOIN "public"."projects" ON (("projects"."id" = "rundowns"."project_id")))
  WHERE (("rundowns"."id" = "rundown_items"."rundown_id") AND (("projects"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_update_rundowns" ON "public"."rundowns" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."projects"
  WHERE (("projects"."id" = "rundowns"."project_id") AND ("projects"."owner_id" = "auth"."uid"())))) OR "public"."is_admin"()));



CREATE POLICY "ws_update_sessions" ON "public"."broadcast_sessions" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "ws_update_slots" ON "public"."bundle_slots" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."template_bundles"
  WHERE (("template_bundles"."id" = "bundle_slots"."bundle_id") AND (("template_bundles"."owner_id" = "auth"."uid"()) OR "public"."is_admin"())))));



CREATE POLICY "ws_update_templates" ON "public"."templates" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_admin"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ai_character_state";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cuesheet_data_sources";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."overlay_state";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."fathom_match_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "decay_rate" double precision, "required_clearance" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fathom_match_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "decay_rate" double precision, "required_clearance" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fathom_match_chunks"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "decay_rate" double precision, "required_clearance" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_workspace_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_workspace_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_workspace_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_broadcast_sessions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_broadcast_sessions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_broadcast_sessions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_fonts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_fonts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_fonts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";









GRANT ALL ON TABLE "public"."ai_character_presets" TO "anon";
GRANT ALL ON TABLE "public"."ai_character_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_character_presets" TO "service_role";



GRANT ALL ON TABLE "public"."ai_character_state" TO "anon";
GRANT ALL ON TABLE "public"."ai_character_state" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_character_state" TO "service_role";



GRANT ALL ON TABLE "public"."ai_cuesheet_session_scenes" TO "anon";
GRANT ALL ON TABLE "public"."ai_cuesheet_session_scenes" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_cuesheet_session_scenes" TO "service_role";



GRANT ALL ON TABLE "public"."ai_cuesheet_sessions" TO "anon";
GRANT ALL ON TABLE "public"."ai_cuesheet_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_cuesheet_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."ai_model_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_config" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_segments" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_segments" TO "service_role";



GRANT ALL ON TABLE "public"."broadcast_sessions" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."bundle_slots" TO "anon";
GRANT ALL ON TABLE "public"."bundle_slots" TO "authenticated";
GRANT ALL ON TABLE "public"."bundle_slots" TO "service_role";



GRANT ALL ON TABLE "public"."cuesheet_data_sources" TO "anon";
GRANT ALL ON TABLE "public"."cuesheet_data_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."cuesheet_data_sources" TO "service_role";



GRANT ALL ON TABLE "public"."custom_data_sources" TO "anon";
GRANT ALL ON TABLE "public"."custom_data_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_data_sources" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_cg_links" TO "anon";
GRANT ALL ON TABLE "public"."fathom_cg_links" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_cg_links" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_context_chunks" TO "anon";
GRANT ALL ON TABLE "public"."fathom_context_chunks" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_context_chunks" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_contexts" TO "anon";
GRANT ALL ON TABLE "public"."fathom_contexts" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_contexts" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_entities" TO "anon";
GRANT ALL ON TABLE "public"."fathom_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_entities" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_entity_relations" TO "anon";
GRANT ALL ON TABLE "public"."fathom_entity_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_entity_relations" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_programs" TO "anon";
GRANT ALL ON TABLE "public"."fathom_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_programs" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_second_screen_cards" TO "anon";
GRANT ALL ON TABLE "public"."fathom_second_screen_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_second_screen_cards" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_stories" TO "anon";
GRANT ALL ON TABLE "public"."fathom_stories" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_stories" TO "service_role";



GRANT ALL ON TABLE "public"."fathom_story_assignments" TO "anon";
GRANT ALL ON TABLE "public"."fathom_story_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."fathom_story_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."fonts" TO "anon";
GRANT ALL ON TABLE "public"."fonts" TO "authenticated";
GRANT ALL ON TABLE "public"."fonts" TO "service_role";



GRANT ALL ON TABLE "public"."graphics" TO "anon";
GRANT ALL ON TABLE "public"."graphics" TO "authenticated";
GRANT ALL ON TABLE "public"."graphics" TO "service_role";



GRANT ALL ON TABLE "public"."grid_templates" TO "anon";
GRANT ALL ON TABLE "public"."grid_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."grid_templates" TO "service_role";



GRANT ALL ON TABLE "public"."images" TO "anon";
GRANT ALL ON TABLE "public"."images" TO "authenticated";
GRANT ALL ON TABLE "public"."images" TO "service_role";



GRANT ALL ON TABLE "public"."nrcs_cuesheet_items" TO "anon";
GRANT ALL ON TABLE "public"."nrcs_cuesheet_items" TO "authenticated";
GRANT ALL ON TABLE "public"."nrcs_cuesheet_items" TO "service_role";



GRANT ALL ON TABLE "public"."nrcs_cuesheets" TO "anon";
GRANT ALL ON TABLE "public"."nrcs_cuesheets" TO "authenticated";
GRANT ALL ON TABLE "public"."nrcs_cuesheets" TO "service_role";



GRANT ALL ON TABLE "public"."overlay_data_sources" TO "anon";
GRANT ALL ON TABLE "public"."overlay_data_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."overlay_data_sources" TO "service_role";



GRANT ALL ON TABLE "public"."overlay_gallery" TO "anon";
GRANT ALL ON TABLE "public"."overlay_gallery" TO "authenticated";
GRANT ALL ON TABLE "public"."overlay_gallery" TO "service_role";



GRANT ALL ON TABLE "public"."overlay_state" TO "anon";
GRANT ALL ON TABLE "public"."overlay_state" TO "authenticated";
GRANT ALL ON TABLE "public"."overlay_state" TO "service_role";



GRANT ALL ON TABLE "public"."overlay_templates" TO "anon";
GRANT ALL ON TABLE "public"."overlay_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."overlay_templates" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."rundown_items" TO "anon";
GRANT ALL ON TABLE "public"."rundown_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rundown_items" TO "service_role";



GRANT ALL ON TABLE "public"."rundowns" TO "anon";
GRANT ALL ON TABLE "public"."rundowns" TO "authenticated";
GRANT ALL ON TABLE "public"."rundowns" TO "service_role";



GRANT ALL ON TABLE "public"."session_action_logs" TO "anon";
GRANT ALL ON TABLE "public"."session_action_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."session_action_logs" TO "service_role";



GRANT ALL ON TABLE "public"."template_bundles" TO "anon";
GRANT ALL ON TABLE "public"."template_bundles" TO "authenticated";
GRANT ALL ON TABLE "public"."template_bundles" TO "service_role";



GRANT ALL ON TABLE "public"."templates" TO "anon";
GRANT ALL ON TABLE "public"."templates" TO "authenticated";
GRANT ALL ON TABLE "public"."templates" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE POLICY "Anyone can view fonts" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'fonts'::"text"));



CREATE POLICY "Anyone can view images" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'images'::"text"));



CREATE POLICY "Users can delete own files" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'images'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can delete own font files" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'fonts'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can update own files" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'images'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can update own font files" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'fonts'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can upload fonts to own folder" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'fonts'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "Users can upload to own folder" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'images'::"text") AND (("auth"."uid"())::"text" = ("storage"."foldername"("name"))[1])));



CREATE POLICY "characters_bucket_delete" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'characters'::"text") AND ("auth"."uid"() = "owner")));



CREATE POLICY "characters_bucket_insert" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'characters'::"text") AND ("auth"."uid"() IS NOT NULL)));



CREATE POLICY "characters_bucket_read" ON "storage"."objects" FOR SELECT USING (("bucket_id" = 'characters'::"text"));



CREATE POLICY "fathom_files_insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK (("bucket_id" = 'fathom-files'::"text"));



CREATE POLICY "fathom_files_select" ON "storage"."objects" FOR SELECT TO "authenticated" USING (("bucket_id" = 'fathom-files'::"text"));

-- Restore search_path to default session settings for subsequent scripts (e.g. seed.sql)
RESET search_path;




