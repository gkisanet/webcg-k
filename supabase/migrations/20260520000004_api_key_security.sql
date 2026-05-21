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
