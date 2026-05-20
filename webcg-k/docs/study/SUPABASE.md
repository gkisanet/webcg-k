# WebCG-K Supabase 기술 가이드

> Supabase를 처음 접하는 개발자를 위한 WebCG-K 프로젝트 기준 상세 가이드

---

## 목차

1. [Supabase란?](#supabase란)
2. [프로젝트 설정](#프로젝트-설정)
3. [인증 (Auth)](#1-인증-auth)
4. [데이터베이스 (Database)](#2-데이터베이스-database)
5. [행 수준 보안 (RLS)](#3-행-수준-보안-rls)
6. [실시간 통신 (Realtime)](#4-실시간-통신-realtime)
7. [파일 저장소 (Storage)](#5-파일-저장소-storage)
8. [로컬 개발 환경](#로컬-개발-환경)

---

## Supabase란?

**Supabase**는 Firebase의 오픈소스 대안으로, PostgreSQL 데이터베이스를 기반으로 한 **BaaS (Backend as a Service)** 플랫폼입니다.

```
┌──────────────────────────────────────────────┐
│                 Supabase                      │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │   Auth   │  │ Database │  │  Realtime   │  │
│  │ (인증)   │  │(PostgreSQL)│  │ (WebSocket) │  │
│  └──────────┘  └──────────┘  └────────────┘  │
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Storage  │  │   Edge   │  │    RLS      │  │
│  │(파일저장)│  │Functions │  │ (행수준보안)│  │
│  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────────────────────────────────┘
```

### WebCG-K에서 사용하는 Supabase 기능

| 기능 | 용도 | 사용 위치 |
|---|---|---|
| **Auth** | 이메일/비밀번호 로그인, 회원가입 | `lib/auth.tsx`, `login.tsx` |
| **Database** | 프로젝트, 그래픽, 큐시트 등 CRUD | 대시보드 전체 |
| **Realtime (Broadcast)** | 송출 명령 실시간 전달 (컨트롤러→렌더러) | `BroadcastButton.tsx`, `$sessionId.tsx` |
| **Realtime (Presence)** | 세션 접속자 표시 | `useSessionPresence.ts` |
| **Storage** | 이미지 업로드/관리 (2K/4K) | `images.tsx` |
| **RLS** | 데이터 소유권 기반 접근 제어 | 모든 테이블 |

---

## 프로젝트 설정

### 클라이언트 초기화

Supabase 클라이언트는 `src/lib/supabase.ts`에서 싱글톤으로 생성됩니다.

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "http://localhost:54321";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJ...";

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,   // JWT 토큰 자동 갱신
    persistSession: true,     // 브라우저 새로고침 시 세션 유지
  },
  realtime: {
    params: {
      eventsPerSecond: 100,   // 방송 송출용 고빈도 이벤트
    },
  },
});
```

> **초심자 팁**: `createClient`는 앱 전체에서 **한 번만** 호출하세요. 여러 번 호출하면 WebSocket 연결이 중복 생성됩니다.

### 환경 변수

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 1. 인증 (Auth)

### 개요

Supabase Auth는 PostgreSQL의 `auth.users` 테이블을 기반으로 한 인증 시스템입니다. WebCG-K에서는 **이메일/비밀번호** 방식을 사용합니다.

### 구현 구조

```
src/lib/auth.tsx
├── AuthProvider (React Context Provider)
│   ├── signIn()   — 로그인
│   ├── signUp()   — 회원가입
│   ├── signOut()  — 로그아웃
│   └── onAuthStateChange() — 인증 상태 변화 감지
└── useAuth() Hook — 컴포넌트에서 인증 정보 사용
```

### 회원가입 / 로그인

```typescript
// 회원가입
const { error } = await supabase.auth.signUp({ email, password });

// 로그인
const { error } = await supabase.auth.signInWithPassword({ email, password });

// 로그아웃
await supabase.auth.signOut();
```

### 인증 상태 구독

```typescript
// 인증 상태가 변경될 때마다 호출 (로그인, 로그아웃, 토큰 갱신 등)
supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
});
```

### 자동 프로필 생성 (트리거)

회원가입 시 `profiles` 테이블에 자동으로 행이 생성됩니다. 이는 PostgreSQL **트리거 함수**로 구현되어 있습니다.

```sql
-- auth.users에 INSERT 시 profiles 테이블에 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, is_admin)
  VALUES (
    NEW.id,
    split_part(NEW.email, '@', 1),  -- 이메일 앞부분을 표시명으로
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

> **SECURITY DEFINER**: 이 트리거 함수는 RLS 정책을 우회(bypass)하여 실행됩니다. 사용자가 직접 profiles에 INSERT하는 것이 아니라, 시스템이 대신 해줍니다.

### 사용 패턴

```tsx
// 컴포넌트에서 사용
function MyComponent() {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;

  return <div>안녕하세요, {profile?.display_name}님!</div>;
}
```

---

## 2. 데이터베이스 (Database)

### 개요

Supabase는 PostgreSQL을 직접 사용하며, JavaScript 클라이언트에서 **SQL 없이** REST API로 CRUD를 수행합니다.

### CRUD 패턴

```typescript
// CREATE (삽입)
const { data, error } = await supabase
  .from("projects")
  .insert({ name: "새 프로젝트", owner_id: user.id })
  .select()
  .single();

// READ (조회)
const { data } = await supabase
  .from("projects")
  .select("*")
  .eq("owner_id", user.id)
  .order("created_at", { ascending: false });

// UPDATE (수정)
await supabase
  .from("broadcast_sessions")
  .update({ status: "live" })
  .eq("id", sessionId);

// DELETE (삭제)
await supabase
  .from("projects")
  .delete()
  .eq("id", projectId);
```

### 관계 쿼리 (JOIN)

```typescript
// session_action_logs 조회 시 profiles 테이블과 JOIN
const { data } = await supabase
  .from("session_action_logs")
  .select(`
    id,
    action_type,
    action_detail,
    created_at,
    user_id,
    profiles!user_id ( display_name, email )
  `)
  .eq("session_id", sessionId)
  .order("created_at", { ascending: false });
```

> **초심자 팁**: Supabase의 `.select()` 구문 안에서 `테이블명!외래키 ( 컬럼 )` 형식으로 JOIN을 수행할 수 있습니다.

### WebCG-K에서의 주요 쿼리 모음

| 작업 | 파일 | 쿼리 |
|---|---|---|
| 프로젝트 목록 | `broadcast.tsx` | `.from("broadcast_sessions").select("*")` |
| 그래픽 CRUD | `GraphicsEditor.tsx` | `.from("graphics").insert/update/delete` |
| 세션 로드 | `$sessionId.tsx` | `.from("broadcast_sessions").select("*").eq("id", id).single()` |
| 액션 로그 저장 | `actionLogStore.ts` | `.from("session_action_logs").insert(...)` |
| 이미지 관리 | `images.tsx` | `.from("images").select/insert/delete` |

---

## 3. 행 수준 보안 (RLS)

### 개요

**Row Level Security (RLS)** 는 PostgreSQL의 기능으로, **행 단위**로 접근 제어를 설정합니다. Supabase는 기본적으로 RLS가 활성화되어 있어, 정책을 설정하지 않으면 **모든 데이터에 접근 불가능**합니다.

### 비유로 이해하기

> RLS는 **호텔 카드키 시스템**과 같습니다.
>
> | 호텔 비유 | RLS 대응 |
> |----------|---------|
> | 카드키 = 내 방만 열림 | `auth.uid() = owner_id` → 내 데이터만 조회 |
> | 로비 라운지 = 누구나 입장 | `is_public = TRUE` → 공개 데이터 |
> | 프론트 데스크 = 로비에 서류 제출 | `auth.uid() IS NOT NULL` → 로그인만 하면 접근 |
> | 카드키 없는 손님 = 어디도 입장 불가 | RLS 정책 없음 → 모든 접근 차단 |

### RLS의 작동 원리

```
사용자 요청 → Supabase API → PostgreSQL
                                │
                     ┌──────────┴──────────┐
                     │  RLS 정책 검사       │
                     │  auth.uid() = ?      │
                     │  owner_id 비교       │
                     └──────────┬──────────┘
                                │
                     ✅ 허용된 행만 반환
```

### WebCG-K의 RLS 정책 패턴

#### 패턴 1: 소유자 전용 (Owner-Only)

가장 기본적인 패턴. 자신이 생성한 데이터만 접근 가능합니다.

```sql
-- 사용 테이블: profiles, projects, images, graphics, api_keys
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = owner_id);
```

- `auth.uid()` — 현재 로그인한 사용자의 UUID
- `owner_id` — 행의 소유자 ID 컬럼

#### 패턴 2: 소유자 + 공개 (Owner + Public)

자신의 데이터와 공개된 데이터 모두 조회 가능합니다.

```sql
-- 사용 테이블: templates, grid_templates, graphics, images, rundowns, overlay_templates
CREATE POLICY "Users can view own or public templates" ON templates
  FOR SELECT USING (auth.uid() = owner_id OR is_public = TRUE);
```

#### 패턴 3: 계층적 접근 제어 (Hierarchical)

상위 테이블의 소유권을 기준으로 하위 테이블의 접근을 제어합니다.

```sql
-- 사용 테이블: rundowns, rundown_items
-- 런다운 아이템은 → 런다운 → 프로젝트 소유자를 확인
CREATE POLICY "Users can view rundown items of own projects" ON rundown_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rundowns
      JOIN projects ON projects.id = rundowns.project_id
      WHERE rundowns.id = rundown_items.rundown_id
      AND projects.owner_id = auth.uid()
    )
  );
```

#### 패턴 4: 인증된 사용자 전체 (Authenticated)

로그인한 사용자 누구나 접근 가능합니다.

```sql
-- 사용 테이블: overlay_state, session_action_logs
CREATE POLICY "Authenticated users can view overlay state" ON overlay_state
  FOR SELECT USING (auth.uid() IS NOT NULL);
```

### 주의사항

> ⚠️ **RLS가 활성화된 상태에서 정책이 없으면 데이터가 보이지 않습니다.** 새 테이블을 만들면 반드시 SELECT, INSERT, UPDATE, DELETE 정책을 모두 설정하세요.

---

## 4. 실시간 통신 (Realtime)

Supabase Realtime은 WebSocket을 통해 **서버 없이** 클라이언트 간 실시간 통신을 구현합니다. WebCG-K에서는 두 가지 방식을 사용합니다.

### 4-1. Broadcast (방송 명령 전달)

**컨트롤러 → 렌더러** 간 송출 명령을 실시간으로 전달합니다.

```
┌─────────────┐     WebSocket      ┌─────────────┐
│  Controller │ ──────────────────→ │   Renderer  │
│  (컨트롤러) │   broadcast:sessionId  │  (렌더러)   │
│             │   event: "playout"  │             │
│             │   payload: {        │             │
│  Space 누름 │     action: "PLAY"  │  그래픽 표시 │
│             │     item: {...}     │             │
│             │   }                 │             │
└─────────────┘                     └─────────────┘
```

#### 송신 (컨트롤러)

```typescript
// $sessionId.tsx — PGM 블록 변경 시 렌더러에 전달
const channel = supabase.channel(`broadcast:${sessionId}`);
await channel.subscribe();
await channel.send({
  type: "broadcast",
  event: "playout",
  payload: {
    action: "PLAY",  // 또는 "STOP"
    item: {
      id: block.id,
      name: block.name,
      sourceData: block.sourceData,
    },
  },
});
```

#### 수신 (렌더러)

```typescript
// render/$sessionId.tsx — 송출 명령 수신
const channel = supabase.channel(`broadcast:${sessionId}`);
channel
  .on("broadcast", { event: "playout" }, ({ payload }) => {
    if (payload.action === "PLAY") {
      displayGraphic(payload.item);  // 그래픽 표시
    } else {
      clearGraphic();                // 그래픽 제거
    }
  })
  .subscribe();
```

> **핵심**: Broadcast는 **데이터베이스를 사용하지 않고** 순수하게 WebSocket만으로 메시지를 전달합니다. 서버에 저장되지 않으며, 실시간 전달만 수행합니다.

### 4-2. Presence (접속자 감지)

현재 세션에 접속 중인 사용자 목록을 실시간으로 추적합니다.

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│  User A  │   │  User B  │   │  User C  │
│  🟢 접속  │   │  🟢 접속  │   │  🔴 퇴장  │
└──────────┘   └──────────┘   └──────────┘
     │              │              │
     └──────────────┴──────────────┘
                    │
            ┌───────┴───────┐
            │  Presence     │
            │  Channel      │
            │  presenceState│
            │  = {          │
            │    userA: ... │
            │    userB: ... │
            │  }            │
            └───────────────┘
```

#### 구현 (`useSessionPresence.ts`)

```typescript
const presenceChannel = supabase.channel(`session:${sessionId}:presence`, {
  config: { presence: { key: user.id } },
});

// 동기화 이벤트 — 접속자 목록 변경 시 호출
presenceChannel
  .on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState();
    // state = { userId1: [{ email, color, ... }], userId2: [...] }
  })
  .on("presence", { event: "join" }, ({ newPresences }) => {
    console.log("접속:", newPresences);
  })
  .on("presence", { event: "leave" }, ({ leftPresences }) => {
    console.log("퇴장:", leftPresences);
  });

// 내 상태 등록 (track)
presenceChannel.subscribe(async (status) => {
  if (status === "SUBSCRIBED") {
    await presenceChannel.track({
      id: user.id,
      email: user.email,
      displayName: user.email?.split("@")[0],
      color: "#3b82f6",
      playheadPosition: 0,
    });
  }
});
```

### Broadcast vs Presence 비교

| 항목 | Broadcast | Presence |
|---|---|---|
| **용도** | 명령/데이터 전달 | 접속자 상태 공유 |
| **방향** | 단방향 (발신자→수신자) | 양방향 (모든 참여자) |
| **지속성** | ❌ 저장 안함 | 상태 (track) 유지 |
| **채널 이름** | `broadcast:${sessionId}` | `session:${sessionId}:presence` |
| **이벤트** | `broadcast` | `presence` (sync/join/leave) |

---

## 5. 파일 저장소 (Storage)

### 개요

Supabase Storage는 S3 호환 객체 저장소입니다. WebCG-K에서는 **images** 버킷에 이미지를 업로드하고 관리합니다.

### 버킷 설정

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images', 'images', true,
  10485760,  -- 10MB 제한
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
);
```

### 폴더 구조

```
images/
├── {user_uuid}/           ← 사용자별 폴더
│   ├── original/          ← 원본 이미지
│   │   └── photo.jpg
│   ├── 2k/                ← 2K 해상도 버전
│   │   └── photo_2k.jpg
│   └── 4k/                ← 4K 해상도 버전
│       └── photo_4k.jpg
```

### 이미지 업로드

```typescript
// Storage에 파일 업로드
const { data, error } = await supabase.storage
  .from("images")
  .upload(`${user.id}/original/${fileName}`, file);

// 공개 URL 생성
const { data: urlData } = supabase.storage
  .from("images")
  .getPublicUrl(`${user.id}/original/${fileName}`);
```

### Storage RLS

```sql
-- 사용자는 자신의 폴더에만 업로드 가능
CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'images' AND
    auth.uid()::text = (storage.foldername(name))[1]  -- 폴더명 = 사용자 UUID
  );

-- public 버킷이므로 모든 사용자가 조회 가능
CREATE POLICY "Anyone can view images" ON storage.objects
  FOR SELECT USING (bucket_id = 'images');
```

> **초심자 팁**: `storage.foldername(name)[1]`은 Storage 경로에서 첫 번째 폴더명을 추출합니다. 이를 통해 사용자가 **자신의 폴더에만** 파일을 업로드할 수 있도록 제한합니다.

---

## 로컬 개발 환경

### 필수 요구사항

- Docker Desktop (Supabase 로컬 실행용)
- Node.js v22+
- Supabase CLI (`npx supabase`)

### 시작 명령

```bash
# Supabase 로컬 시작
npx supabase start

# 마이그레이션 적용 (DB 스키마 생성)
npx supabase db push

# Supabase Studio (DB 관리 UI)
# http://localhost:54323

# 프론트엔드 개발 서버
cd webcg-k && npm run dev
```

### 주요 포트

| 서비스 | 포트 |
|---|---|
| Supabase API | `54321` |
| Supabase Studio | `54323` |
| Supabase Inbucket (이메일) | `54324` |
| PostgreSQL | `54322` |
| 프론트엔드 (Vite) | `3000` |

### 마이그레이션 파일 관리

```
supabase/migrations/
├── 202602040001_profiles.sql     ← 날짜 + 순번 형식
├── 202602040002_projects.sql
├── ...
└── 202602080001_*.sql
```

> **규칙**: 마이그레이션 파일명은 `YYYYMMDD####_설명.sql` 형식입니다. 순번이 순차적이어야 합니다.

---

## 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Supabase Auth 가이드](https://supabase.com/docs/guides/auth)
- [Supabase Realtime 가이드](https://supabase.com/docs/guides/realtime)
- [PostgreSQL RLS 문서](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
