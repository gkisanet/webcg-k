# 새 환경에서 WebCG-K 개발 시작하기

> **이 가이드의 목적**: 다른 컴퓨터나 새 개발 환경에서 WebCG-K 프로젝트를 **처음부터 실행 가능한 상태**로 만드는 전 과정을 안내합니다.

### 비유로 이해하기

새 환경에서 WebCG-K를 설정하는 것은 **새 주방(Kitchen)을 차리는 것**과 같습니다.

| 주방 비유 | WebCG-K 대응 |
|----------|-------------|
| 가스레인지, 냉장고 설치 | Node.js, Docker 설치 |
| 식재료 보관실(냉장고) 켜기 | Supabase 시작 (`npx supabase start`) |
| 레시피 준비 | 코드 클론 (`git clone`) |
| 요리 시작 | 웹 앱 실행 (`npm run dev`) |

---

## 🏗 프로젝트 구조 (모노레포)

이 프로젝트는 3개의 앱이 하나의 저장소에 공존하는 **모노레포** 구조입니다.

```
2026.WebCg-K/
├── supabase/                 ← 공유 DB (마이그레이션 + 시드)
│   ├── migrations/           ← 60여개 DB 스키마 파일 (자동 적용)
│   ├── seed.sql              ← 기본 시드 (db reset 시 자동)
│   ├── seed_demo_nrcs.sql    ← 데모: KBS 뉴스9 NRCS 연동
│   └── seed_demo_fathom.sql  ← 데모: Fathom 기사 + 편성
│
├── webcg-k/                  ← 🎬 방송 그래픽 송출 시스템 (포트 3000)
├── fathom/                   ← 🧊 AI 기반 뉴스룸 시스템 (포트 3100)
└── media-server/             ← 📹 미디어 서버 (포트 3200)
```

> [!IMPORTANT]
> **세 앱 모두 같은 Supabase 인스턴스를 공유합니다.**
> Supabase를 먼저 시작해야 모든 앱이 동작합니다.

---

## 🔧 사전 준비사항

### 필수 도구 설치

1. **Node.js 20+** — 왜? React 앱과 빌드 도구를 실행하는 **JavaScript 런타임**입니다.
   ```bash
   node --version  # v20 이상 확인
   ```

2. **Docker Desktop** — 왜? Supabase(DB + 인증 + 스토리지)를 **로컬에서 컨테이너로 실행**하기 위해 필요합니다.
   ```bash
   docker --version
   docker compose version
   ```

> [!TIP]
> **Docker란?** 앱을 "컨테이너"라는 격리된 상자에 넣어 실행하는 도구입니다. Supabase를 설치하는 게 아니라, Docker가 Supabase를 포함한 상자를 자동으로 받아서 띄워줍니다.

> [!NOTE]
> **Supabase CLI는 별도 설치 불필요!**  
> `npx`를 통해 자동으로 다운로드되므로 전역 설치가 필요 없습니다.

---

## 📥 프로젝트 설정

### 1. 저장소 클론
```bash
git clone <repository-url>
cd 2026.WebCg-K
```

### 2. Supabase 시작

> **Supabase란?** 데이터베이스(PostgreSQL), 인증, 파일 저장소, 실시간 통신을 하나로 묶은 **백엔드 서비스**입니다.
> Firebase(구글)의 오픈소스 대안으로, 로컬 Docker에서 실행하면 인터넷 없이도 완전히 작동합니다.

```bash
# 프로젝트 루트에서 (npx 사용 - 설치 불필요)
npx -y supabase start
```

> [!IMPORTANT]
> **마이그레이션 vs 시드 — 자동 적용 범위가 다릅니다!**
>
> | 명령어 | 마이그레이션 (스키마) | 시드 (초기 데이터) |
> |--------|--------------------|--------------------|
> | `npx supabase start` | ✅ 자동 적용 (48개) | ❌ 적용 안 됨 |
> | `npx supabase db reset` | ✅ 자동 적용 | ✅ `seed.sql`만 자동 |
>
> - **마이그레이션 (`migrations/`)**: 테이블 생성, RLS 정책 등 **DB 구조**를 정의. `start` 시 자동 적용.
> - **시드 (`seed.sql`)**: 초기 데이터 삽입. `db reset` 시에만 `config.toml`의 `sql_paths`에 지정된 파일이 자동 실행.
> - **데모 시드 (`seed_demo_*.sql`)**: 수동으로 실행해야 합니다 (아래 참조).

**처음 실행 시**:
- `supabase` 패키지 자동 다운로드
- Docker 이미지 다운로드 (약 5-10분 소요)
- `supabase/migrations/` 폴더의 모든 `.sql` 파일을 **파일명 순서대로** 자동 적용
- 서비스 엔드포인트 출력

**출력 예시**:
```
Started supabase local development setup.

╭──────────────────────────────────────╮
│ 🔧 Development Tools                 │
├─────────┬────────────────────────────┤
│ Studio  │ http://127.0.0.1:54323     │
│ Mailpit │ http://127.0.0.1:54324     │
╰─────────┴────────────────────────────╯

╭──────────────────────────────────────────────────────╮
│ 🌐 APIs                                              │
├────────────────┬─────────────────────────────────────┤
│ Project URL    │ http://127.0.0.1:54321              │
│ REST           │ http://127.0.0.1:54321/rest/v1      │
╰────────────────┴─────────────────────────────────────╯
```

### 3. DB 타입 생성 (★ 필수)

> **Why?** `database.types.ts`는 Supabase 스키마로부터 자동 생성되는 TypeScript 타입 파일입니다. 이 파일이 없거나 오래된 버전이면 `tsc` 타입 검사가 실패하고 IDE 자동완성이 동작하지 않습니다.

```bash
# 프로젝트 루트에서
npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts

# ⚠️ 생성된 파일의 첫 몇 줄에 Docker pull 로그("Connecting to db...")가
#    섞일 수 있습니다. 해당 라인을 수동으로 삭제하세요.
#    정상 파일은 `export type Json = ...` 으로 시작해야 합니다.
```

### 4. 앱별 설치 및 실행

#### WebCG-K (방송 그래픽 — 포트 3000)
```bash
cd webcg-k
npm install
npm run dev
# → http://localhost:3000
```

#### Fathom (뉴스룸 AI — 포트 3100)
```bash
cd fathom
npm install
npm run dev
# → http://localhost:3100
```

#### Media Server (선택사항)
```bash
cd media-server
npm install
npm run dev
```

> [!NOTE]
> **Fathom과 Media Server는 각각 포트 3100, 3200을 사용하므로 동시 실행에 문제가 없습니다.**
> Fathom의 포트는 `fathom/vite.config.ts`, Media Server는 `media-server/src/index.ts`에서 변경할 수 있습니다.

---

## 👤 초기 사용자 설정

### 1. 회원가입
- http://localhost:3000 (WebCG-K) 또는 http://localhost:3100 (Fathom) 접속
- 회원가입 페이지에서 계정 생성
- **두 앱이 같은 Supabase를 공유**하므로 한 번 가입하면 양쪽 모두 로그인 가능

> [!TIP]
> Supabase 로컬 환경에서는 이메일 인증이 자동 처리됩니다. 가입 즉시 로그인 가능합니다.

### 2. 관리자 권한 부여

새 환경에서는 데이터베이스가 비어있으므로 첫 번째 사용자에게 관리자 권한을 부여해야 합니다.

```bash
# 1. 사용자 ID 확인
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT id, display_name, is_admin, role FROM public.profiles;"

# 2. 관리자 권한 부여 (USER_ID는 위에서 확인한 UUID로 교체)
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "UPDATE public.profiles SET is_admin = true, role = 'system_admin' WHERE id = '<USER_ID>';"

# 3. 확인
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT id, display_name, is_admin, role FROM public.profiles;"
```

> [!NOTE]
> **`is_admin`과 `role`의 관계:**
> - `is_admin = true` → WebCG-K 사이드바에 "관리자" 메뉴 표시
> - `role = 'system_admin'` → RLS 정책에서 전체 데이터 접근 허용

### 3. 재로그인
- 로그아웃 후 다시 로그인하면 관리자 메뉴가 표시됩니다

---

## 🎬 데모 데이터 삽입 (선택사항)

즉시 기능을 시연하고 싶다면 아래 시드 파일을 수동 실행합니다.

### WebCG-K NRCS 연동 데모
KBS 뉴스9 프로그램의 7개 세그먼트(뉴스 아이템) + 23개 CG 블록이 포함된 데모 세션을 생성합니다.

```bash
# ⚠️ 시드가 현재 로그인 유저의 UUID를 사용하므로, 먼저 가입 후 실행
# seed_demo_nrcs.sql 내의 created_by UUID를 자신의 프로필 ID로 변경 후:
docker exec -i supabase_db_2026.WebCg-K psql -U postgres \
  < supabase/seed_demo_nrcs.sql
```

### Fathom 기사 + 편성 데모
기사 7건과 뉴스9 큐시트 배정(CG 텍스트 포함)을 생성합니다.

```bash
# ⚠️ reporter_id도 자신의 프로필 UUID로 변경 필요
docker exec -i supabase_db_2026.WebCg-K psql -U postgres \
  < supabase/seed_demo_fathom.sql
```

> [!CAUTION]
> **시드 파일에 하드코딩된 UUID에 주의하세요!**
> 두 시드 파일 모두 `2cb4adf0-1d06-4f68-b799-d17b43e572e2` (jetski@example.com)를 참조합니다.
> 새 환경에서는 이 값을 자신의 프로필 UUID로 일괄 치환해야 RLS에 의해 데이터가 정상 표시됩니다.
> ```bash
> # sed로 한 번에 치환 (YOUR_USER_ID를 실제 UUID로 교체)
> sed -i 's/2cb4adf0-1d06-4f68-b799-d17b43e572e2/YOUR_USER_ID/g' \
>   supabase/seed_demo_nrcs.sql supabase/seed_demo_fathom.sql
> ```
> 프로필 UUID는 위의 "관리자 권한 부여" 단계에서 확인할 수 있습니다.

---

## 🔄 일상적인 개발 워크플로우

### Supabase 시작/중지
```bash
# 시작
npx -y supabase start

# 중지
npx -y supabase stop

# 상태 확인
npx -y supabase status
```

### 데이터베이스 초기화 (필요시)
```bash
# 모든 데이터 삭제 + 마이그레이션 재적용 + seed.sql 실행
npx -y supabase db reset
```

> [!NOTE]
> `db reset`은 **모든 데이터를 삭제**하고 마이그레이션을 처음부터 다시 적용합니다.
> `seed.sql`은 자동 실행되지만, `seed_demo_*.sql`은 수동 실행이 필요합니다.

### 새 마이그레이션 생성
```bash
# 새 마이그레이션 파일 생성
npx -y supabase migration new <migration_name>

# 예: npx -y supabase migration new add_user_preferences
```

### 앱 실행 (3개 터미널)
```bash
# 터미널 1: WebCG-K
cd webcg-k && npm run dev

# 터미널 2: Fathom
cd fathom && npm run dev

# 터미널 3: Media Server (필요 시)
cd media-server && npm run dev
```

---

## 🗂️ 데이터 마이그레이션

### 기존 환경에서 데이터 백업
```bash
# 원래 환경에서
docker exec supabase_db_2026.WebCg-K pg_dump -U postgres > backup.sql
```

### 새 환경에서 데이터 복구
```bash
# 1. Supabase 시작
npx -y supabase start

# 2. 백업 파일 복구
docker exec -i supabase_db_2026.WebCg-K psql -U postgres < backup.sql
```

---

## ⚠️ 문제 해결

### "supabase start" 실패 시
```bash
# 1. 기존 컨테이너 정리
npx -y supabase stop
docker ps -a | grep supabase | awk '{print $1}' | xargs docker rm -f

# 2. 볼륨 삭제 (데이터 초기화)
docker volume ls | grep supabase | awk '{print $2}' | xargs docker volume rm

# 3. 재시작
npx -y supabase start
```

### 마이그레이션 에러 시
```bash
# 마이그레이션 상태 확인
docker exec supabase_db_2026.WebCg-K psql -U postgres -c \
  "SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;"

# 문제가 있다면 완전 초기화
npx -y supabase stop
docker volume rm $(docker volume ls -q | grep supabase)
npx -y supabase start
```

### ⚠️ Migration 드리프트 방지 — 멀티 환경 개발 시 필수

> [!TIP]
> 회사/집 컴퓨터를 오가며 개발할 때 migration 드리프트를 방지하는 규칙:

1. **`git pull` 후 반드시 `npx supabase db reset`** — 새 migration이 포함되어 있는지 확인
2. **Migration 타임스탬프에 시/분 포함** — `YYYYMMDDHHMM` 형식으로 충돌 확률 감소
3. **`npx supabase migration list --local`** — Remote 열이 비어있으면 미적용 migration
4. **모든 `CREATE POLICY` 앞에 `DROP POLICY IF EXISTS`** — 멱등성 보장

```bash
# .zshrc에 alias 추가 추천
alias sb-check='cd ~/2026-study/2026.WebCg-K && npx supabase migration list --local'
alias sb-reset='cd ~/2026-study/2026.WebCg-K && npx supabase db reset'
```

> [!WARNING]
> **`is_admin`과 `role` 동기화 주의!**
> 
> `db reset` 직후 프로필 데이터가 초기화됨 → 새로 회원가입 → `handle_new_user()` 트리거가
> `role = 'viewer'`로 INSERT → 이후 Studio에서 `is_admin = true`만 변경해도
> migration 내 `UPDATE ... WHERE is_admin = true AND role = 'viewer'`는 **1회만 실행**되므로 이후 수동 변경은 반영 안 됨.
>
> **해결**: `AdminUsersTab`의 select 드롭다운은 `disabled={isSelf}` — 자기 자신의 role은 변경할 수 없도록 안전 장치가 걸려 있음. DB에서 직접 설정해야 함.

### Fathom AI Worker 설정

Fathom의 AI Worker는 **별도 Node.js 프로세스**로 실행됩니다.

```bash
# 1. 의존성 설치
cd fathom/worker
npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일을 열고 GEMINI_API_KEY를 설정하세요

# 3. Gemini API 키 (선택사항)
# https://aistudio.google.com/apikey 에서 발급
# .env 파일에 GEMINI_API_KEY=your-key-here 추가

# 4. Worker 실행
npm run dev
```

> [!NOTE]
> **Worker는 Gemini 키 없이도 동작합니다** (Graceful Degradation).
> 키 없으면 텍스트 추출+청킹까지만 수행하고, AI 요약/엔티티/임베딩은 스킵합니다.
> WebCG-K의 `VITE_GEMINI_API_KEY`와 동일한 키 값을 사용하지만, Worker는 `GEMINI_API_KEY`라는 변수명을 사용합니다 (Vite prefix 없음).

### 포트 충돌 시

| 서비스 | 기본 포트 | 설정 파일 |
|--------|----------|-----------|
| WebCG-K | 3000 | `webcg-k/vite.config.ts` |
| Fathom | 3100 | `fathom/vite.config.ts` |
| Media Server | 3200 | `media-server/src/index.ts` (`PORT` env) |
| Supabase API | 54321 | `supabase/config.toml` `[api].port` |
| Supabase DB | 54322 | `supabase/config.toml` `[db].port` |
| Supabase Studio | 54323 | `supabase/config.toml` |

---

## 📦 환경 변수 (.env)

### WebCG-K (`webcg-k/.env.local`)

> `.env.example` 파일을 `.env.local`로 복사 후 수정하세요. Vite는 `.env.local`을 자동으로 읽습니다.

```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# AI 기능 사용 시 필수 (Gemini API 키)
# https://aistudio.google.com/apikey 에서 발급
VITE_GEMINI_API_KEY=your-gemini-api-key
```

### Fathom (`fathom/.env.local`)
```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_...
```

> [!TIP]
> **Anon Key 확인하는 법:**
> ```bash
> npx -y supabase status
> ```
> 출력에서 `anon key` 값을 복사하여 `.env.local` 파일에 붙여넣으세요.

기본값이 코드에 하드코딩되어 있으므로 로컬 개발 시에는 `.env.local` 파일 없이도 작동할 수 있지만,
**새 환경에서는 Anon Key가 달라질 수 있으므로** `.env.local` 파일 생성을 권장합니다.

> [!NOTE]
> **AI 기능(Gemini)은 키 없이도 앱 실행은 되지만**, AI 그래픽 생성, AI 큐시트 분석 등의 기능이 비활성화됩니다.
> `VITE_GEMINI_API_KEY`를 설정하지 않으면 "API key not configured" 경고가 표시됩니다.

---

## 🚀 빠른 시작 (TL;DR)

```bash
# 1. 저장소 클론
git clone <repository-url>
cd 2026.WebCg-K

# 2. Supabase 시작 (마이그레이션 자동 적용, 시드는 수동)
npx -y supabase start

# 3. DB 타입 생성 (★ 필수)
npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts
# ⚠️ 생성된 파일 첫 줄의 Docker 로그("Connecting...", "Pulling...") 제거 필요

# 4. WebCG-K 실행
cd webcg-k && npm install && npm run dev
# → http://localhost:3000

# 5. (선택) Fathom 실행 — 별도 터미널에서
cd fathom && npm install && npm run dev
# → http://localhost:3100

# 6. 브라우저에서 회원가입 후 관리자 권한 부여

# 7. (선택) 데모 시드 삽입 (UUID 치환 필수)
docker exec -i supabase_db_2026.WebCg-K psql -U postgres < supabase/seed_demo_nrcs.sql
docker exec -i supabase_db_2026.WebCg-K psql -U postgres < supabase/seed_demo_fathom.sql
```

---

## ✅ 빠른 시작 체크리스트

- [ ] Node.js 20+ 설치
- [ ] Docker Desktop 설치 및 실행
- [ ] Git 저장소 클론
- [ ] `npx -y supabase start` 실행 (마이그레이션 자동)
- [ ] `npx -y supabase gen types typescript --local > webcg-k/src/lib/database.types.ts`
- [ ] `database.types.ts` 첫 줄 Docker 로그 제거 확인
- [ ] WebCG-K: `cd webcg-k && npm install && npm run dev`
- [ ] Fathom (선택): `cd fathom && npm install && npm run dev`
- [ ] `webcg-k/.env.local`에 `VITE_GEMINI_API_KEY` 설정 (AI 기능용)
- [ ] 브라우저에서 회원가입
- [ ] 관리자 권한 부여 (`is_admin = true`, `role = 'system_admin'`)
- [ ] 재로그인하여 관리자 메뉴 확인
- [ ] (선택) 데모 시드 UUID 치환 후 삽입

---

## 📚 추가 참고 자료

- [SUPABASE.md](./SUPABASE.md) — Supabase 상세 가이드
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — 문제 해결 가이드
- [HANDOVER.md](../HANDOVER.md) — 개발 인수인계
- [webcg-k/docs/TASKS.md](../TASKS.md) — WebCG-K 태스크 현황
- [fathom/docs/TASKS.md](../../../fathom/docs/TASKS.md) — Fathom 태스크 현황
