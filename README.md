# 🏗 2026.WebCg-K — 차세대 방송 시스템 모노레포

> **방송 그래픽 제작·송출·맥락 보존·SDI 출력을 아우르는 통합 생태계**

---

## 🌊 생태계 개요

```
┌──────────────────────────────────────────────────────────────────┐
│                   2026.WebCg-K Monorepo                           │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │   🎬 webcg-k       │  │   🧊 fathom         │                  │
│  │   방송 CG 제어      │  │   AI 뉴스룸         │                  │
│  │   React 19 + Vite  │  │   Vite + React 19  │                  │
│  │   :3000            │  │   :3100            │                  │
│  └────────┬───────────┘  └────────┬───────────┘                  │
│           │                       │                               │
│           └───────────┬───────────┘                               │
│                       ▼                                           │
│           ┌──────────────────────┐                                │
│           │   ☁️ supabase        │  ← 공유 백엔드                  │
│           │   PostgreSQL         │                                │
│           │   Auth · Realtime    │                                │
│           │   Storage · pgvector │                                │
│           └──────────────────────┘                                │
│                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐                  │
│  │   🛡️ casparcg      │  │   📡 media-server   │                  │
│  │   SDI 출력 이중화    │  │   NDI/NRCS 연동    │                  │
│  │   Watchdog Daemon  │  │   Node.js :3200   │                  │
│  └────────────────────┘  └────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
```

| 프로젝트 | 역할 | 포트 | 핵심 기술 |
|----------|------|------|-----------|
| **webcg-k** | 방송 그래픽 제작·편집·송출 (CG) | 3000 | React 19, TanStack, Tailwind |
| **fathom** | AI 뉴스룸 — 기자 맥락 보존·세컨드 스크린 | 3100 | React 19, pgvector, TipTap |
| **supabase** | 공유 백엔드 (DB·인증·실시간·스토리지) | 54321 | PostgreSQL, Docker |
| **casparcg** | SDI 하드웨어 출력 이중화 (Watchdog) | — | Node.js, AMCP |
| **media-server** | NDI 스트림·NRCS 보도정보 연동 | 3200 | Node.js |

---

## 📁 프로젝트 구조

```
2026.WebCg-K/
├── webcg-k/              # 🎬 방송 그래픽 제어 시스템
│   ├── src/              # React 19 SPA (Dashboard + Controller + Renderer)
│   ├── docs/             # 사용 메뉴얼 + 기술 가이드
│   └── package.json
│
├── fathom/               # 🧊 빙산 모델 AI 뉴스룸
│   ├── src/              # Vite + React 19 SPA
│   ├── docs/             # 아키텍처 + 개발 가이드
│   └── package.json
│
├── supabase/             # ☁️ 공유 백엔드 (Self-hosted Docker)
│   ├── migrations/       # 63개 SQL 마이그레이션 (자동 적용)
│   ├── docs/             # DB 스키마 문서
│   └── config.toml
│
├── casparcg/             # 🛡️ SDI 출력 이중화
│   ├── src/              # Watchdog Daemon (Node.js)
│   └── docs/             # CasparCG 통합 문서
│
├── media-server/         # 📡 NDI/NRCS 미디어 서버
│   └── src/
│
├── README.md             # ← 지금 이 파일 (생태계 허브)
└── DESIGN.md             # 디자인 시스템 명세
```

---

## 🎬 webcg-k — 방송 그래픽 제어 시스템

방송 CG(Character Generator)의 모든 워크플로우를 웹 브라우저에서 수행합니다.

### 3-Page 아키텍처

```
Dashboard (저작)  →  Controller (송출)  →  Renderer (출력)
/dashboard           /controller           /render
그래픽 편집·런다운·   타임라인·PGM Take·    OBS 브라우저 소스
오버레이·AI Wizard    오버레이 ON/OFF       투명 배경 CG 출력
```

**핵심 기능:**
- **그래픽 편집기**: Penpot/Figma 스타일 벡터 에디터 (SVG + CSS 애니메이션)
- **런다운·큐시트**: SPX-GC 스타일 순차적 그래픽 관리, NRCS 연동
- **오버레이 시스템**: 실시간 레이어 ON/OFF 제어, AI Wizard 생성, Plugin Editor
- **AI 큐시트**: 자연어 프롬프트 → 완성된 큐시트 + CG 자동 생성
- **타임라인 컨트롤러**: 멀티트랙 NLE 스타일, Preview/PGM 듀얼 모니터, OBS Realtime 동기화

> 📖 상세: [webcg-k/README.md](webcg-k/README.md) | 사용법: [USAGE.md](webcg-k/docs/USAGE.md)

---

## 🧊 fathom — 빙산 모델 AI 뉴스룸

방송 뉴스 제작 과정에서 **90%의 원천 자료가 소멸(Dark Data)** 되는 문제를 해결합니다. 기자가 수집한 자료를 AI로 자동 아카이빙하고, WebCG-K와 `context_id`로 연결하여 세컨드 스크린의 부가 정보원으로 활용합니다.

**핵심 기능:**
- **AI 자동 아카이빙**: 기사·자료 청킹 → 임베딩 → 벡터 검색 (pgvector + HNSW)
- **맥락 패널**: 드래그앤드롭으로 CG에 자료 연결
- **세컨드 스크린**: QR 코드로 시청자에게 부가 정보 제공 (PWA + 위젯)
- **협업 리치 텍스트**: TipTap + Yjs CRDT 동시 편집

> 📖 상세: [fathom/README.md](fathom/README.md)

---

## ☁️ supabase — 공유 백엔드

모든 프로젝트가 공유하는 Self-hosted Supabase 인스턴스입니다.

- **PostgreSQL**: 63개 마이그레이션, RLS 정책, pgvector 확장
- **Auth**: 이메일 인증, RBAC (system_admin / playout_operator / cg_designer)
- **Realtime**: Broadcast 채널로 PGM 상태·오버레이 ON/OFF 실시간 동기화
- **Storage**: 이미지·폰트·Rive 파일 저장소 (2K/4K 멀티 해상도)

> 📖 상세: [supabase/docs/DB.md](supabase/docs/DB.md)

---

## 🛡️ casparcg — SDI 출력 이중화

방송국 SDI 하드웨어(CasparCG Server)의 무중단 출력을 보장하는 Watchdog Daemon입니다.

- **장애 감지**: CasparCG Server health check → 3초 내 자동 절체
- **AMCP Controller**: CasparCG 제어 프로토콜 (PLAY/STOP/LOAD)
- **ACO Commander**: Blackmagic Videohub 라우팅 제어

---

## 📡 media-server — NDI/NRCS 연동

외부 방송 장비·시스템과의 연동을 담당합니다.

- **NDI 스트림**: NDI 소스를 WebCG-K 타임라인의 비디오 입력으로 활용
- **NRCS 연동**: KBS·MBC 등 보도정보 시스템(iNews, ENPS)에서 런다운·큐시트 자동 수신

---

## 📊 기술 스택 비교

| | webcg-k | fathom |
|---|---------|--------|
| **역할** | 방송 CG 송출 (수면 위 1%) | 기자 맥락 보존 (수면 아래 99%) |
| **프레임워크** | React 19 + Vite + TanStack Start | Vite + React 19 SPA |
| **라우팅** | TanStack Router (File-based) | TanStack Router |
| **상태 관리** | TanStack Store + Query + Mutative | TanStack Query |
| **에디터** | Penpot 스타일 SVG 편집기 | TipTap + Yjs (CRDT 협업) |
| **AI** | Multi-provider (Gemini/Claude/GPT) | Gemini Flash (요약) + 임베딩 |
| **백엔드** | Supabase (공유) | Supabase (공유) |
| **스타일링** | Tailwind v4 + shadcn/ui | Vanilla CSS (Glassmorphism) |

---

## 🚀 빠른 시작

### 요구사항
- Node.js 20+
- Docker & Docker Compose

### 설치 & 실행

```bash
# 1. 저장소 클론
git clone https://github.com/gkisanet/2026.WebCg-K.git
cd 2026.WebCg-K

# 2. Supabase 시작 (로컬 Docker)
npx -y supabase start
# → 63개 마이그레이션 자동 적용

# 3. WebCG-K 실행
cd webcg-k && npm install && npm run dev
# → http://localhost:3000

# 4. Fathom 실행 (별도 터미널)
cd fathom && npm install && npm run dev
# → http://localhost:3100
```

### 서비스 엔드포인트

| 서비스 | URL |
|--------|-----|
| **WebCG-K** | http://localhost:3000 |
| **Fathom** | http://localhost:3100 |
| **Media Server** | http://localhost:3200 |
| **Supabase Studio** | http://127.0.0.1:54323 |
| **REST API** | http://127.0.0.1:54321/rest/v1 |
| **PostgreSQL** | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

---

## 📖 문서 가이드

### webcg-k

| 문서 | 설명 |
|------|------|
| [README.md](webcg-k/README.md) | 아키텍처·코드 구조·기술 스택 |
| [USAGE.md](webcg-k/docs/USAGE.md) | 전체 워크플로우·단축키·사용법 |
| [SETUP.md](webcg-k/docs/guide/SETUP.md) | 환경 설정 가이드 |
| [TROUBLESHOOTING.md](webcg-k/docs/guide/TROUBLESHOOTING.md) | 문제 해결 |

### fathom

| 문서 | 설명 |
|------|------|
| [README.md](fathom/README.md) | 프로젝트 개요·기술 스택 |
| [CONTEXT.md](fathom/docs/CONTEXT.md) | 아키텍처 컨텍스트 |
| [GUIDE.md](fathom/docs/GUIDE.md) | 개발 가이드 |

### 시스템 설계

| 문서 | 설명 |
|------|------|
| [DESIGN.md](DESIGN.md) | 디자인 시스템 (컬러·타이포그래피·컴포넌트) |
| [DB.md](supabase/docs/DB.md) | DB 스키마·ERD·RLS |

---

## 📜 라이선스

MIT License
