# 🎬 WebCG-K

> **Next-Generation Web-Based Broadcast Graphics System**  
> React 19과 Supabase 실시간 동기화 아키텍처로 구현된 방송 자막 송출 및 타임라인 컨트롤러 시스템

---

<p align="center">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4.0-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind v4" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

---

## 🎯 프로젝트 학습 목표 (Learning Objectives)

본 프로젝트는 실리콘밸리 15년 차 시니어 아키텍트의 1:1 전담 멘토링 하에, **"엔터프라이즈급 실시간 방송 플랫폼"**의 설계 및 고성능 최적화 기법을 직접 학습하는 것을 목표로 합니다.

*   **실시간 양방향 데이터 동기화 학습**: Supabase Realtime(CDC & Broadcast) 채널 분리 설계를 통해 극단적으로 낮은 지연 시간(~5ms)의 데이터 전송 파이프라인을 구축합니다.
*   **고성능 벡터 그래픽 렌더링 최적화**: SVG DOM Reflow 병목 현상을 파악하고, React 렌더 타임을 지연시키지 않는 오버레이 렌더러 최적화 기법(Dual-Layer Canvas 패턴)을 학습합니다.
*   **LLM 파이프라인 설계**: Multi-provider AI 연동을 통해 다양한 모델(Gemini, Claude)의 강점을 취사선택하고 비정형 텍스트로부터 정형화된 방송용 스키마(Cuesheet)를 도출하는 프롬프트 엔지니어링을 이해합니다.
*   **안전한 스키마 형상 관리**: Supabase CLI를 통한 로컬 개발 데이터베이스의 단일화(Squashing)와 시딩 충돌 복구를 통해 무결한 배포 파이프라인을 실천합니다.

---

## 🏗️ 시스템 아키텍처 개요 (System Overview)

WebCG-K는 자막 저작(Editor), 타임라인 편집(Controller), 무손실 방송 송출(Renderer) 파이프라인이 하나의 통합 데이터 레이어에서 유기적으로 결합하여 동작합니다.

```
┌────────────────────────────────────────────────────────┐
│             WebCG-K Frontend (React 19 SPA)            │
├────────────────────────────────────────────────────────┤
│  [저작 레이어] Graphics Editor (Visual Vector Canvas)    │
│  [편집 레이어] Multi-track Playout Timeline Controller  │
│  [출력 레이어] Transparent BG OBS Web Renderer          │
└───────────────────────────┬────────────────────────────┘
                            │ (Supabase Realtime CDC / Broadcast)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Database & Backend (Supabase)              │
├────────────────────────────────────────────────────────┤
│  PostgreSQL (Schema)  ·  Auth (RLS 보안 격리)           │
│  Realtime Sync        ·  S3 Storage (폰트 & 이미지)     │
└────────────────────────────────────────────────────────┘
```

---

## 💡 4대 핵심 기술 혁신 (Key Innovations)

### 🎨 1. 방송 자막을 위한 비주얼 벡터 에디터 (Penpot-Style)
기존의 전통적인 방송 CG 도구들은 템플릿 코드나 수치 입력에 의존하는 딱딱한 폼 형태로 운영되었습니다. WebCG-K는 **Penpot 기반 자유형 벡터 에디터**를 도입하여, 디자이너와 오퍼레이터가 투명한 알파 채널 위에서 드래그앤드롭으로 직접 도형을 그리고 텍스트를 정렬하며 송출 화면을 눈으로 확인하면서 다이렉트로 자막을 편집할 수 있는 직관적인 UX를 실현합니다.

### 📐 2. 지역국 표준화를 위한 그리드 템플릿 시스템 (GridEditor)
다양한 지국(Branch Station)을 가진 대규모 방송 환경에서는 각 지국마다 자막 포맷이 파편화되어 전체 브랜드 정체성이 훼손되기 쉽습니다. **GridEditor**는 공통의 그리드 템플릿(FancyZones 레이아웃 모델)을 DB 레이어에서 공유하여, 각 지국의 오퍼레이터가 글자 크기, 글꼴, 마진 오차 없이 **100% 동일한 정렬 규칙과 프로토콜**에 맞춰 자막을 송출하도록 보증합니다.

### ⏱️ 3. 다중 트랙 방송 타임라인 (Multi-Track Timeline)
단방향으로만 흘러가던 기존의 선형 런다운 송출 방식(SPX-GX 등)을 뛰어넘어, 비디오 편집기와 동일한 **Multi-Track 타임라인 UI**를 제공합니다. 배경 효과, 하단 자막(Lower-Third), 우상단 로고, AI 캐릭터 라이브 비디오가 각각 독립된 Track 레이어로 구성되어 서로 겹치거나 깊이감(z-index)이 유지된 상태로 무중단 연속 송출을 가능하게 합니다.

### 🤖 4. AI 기반 자동 큐시트 생성 마법사 (AI Cuesheet)
다듬어지지 않은 날것의 기사 원고, 텍스트 스크립트, 타이밍 메모 등을 복사-붙여넣기만 하면 LLM(Gemini)이 비즈니스 도메인 지식을 바탕으로 자막의 종류를 추론(인트로 → 타이틀 자막, 인터뷰 → 출연자 정보 자막 등)하고, 예상 타이밍이 반영된 **완성형 런다운 큐시트 블록을 1초 만에 자동 빌드**합니다.

---

## 🛠️ 기술 스택 및 기술 선정 이유 (Tech Stack & Rationale)

| 분류 | 기술 스택 | 도입 이유 및 교육적 가치 (Rationale) |
| :--- | :--- | :--- |
| **Framework** | **React 19 + Vite** | 방송 송출 엔진의 특성상 UI 페인팅 연산이 극도로 가벼워야 하므로, React 19의 향상된 렌더러와 Vite의 즉각적인 HMR 빌드 환경을 조합하여 무손실 프레임워크를 경험합니다. |
| **Routing** | **TanStack Router** | 파일 시스템 기반 라우팅과 강력한 TypeScript Type-Safety를 통해 복잡한 컨트롤러 및 렌더러 라우트 상태 매개변수를 오류 없이 관리합니다. |
| **State** | **TanStack Store & Query** | 클라이언트 상태와 서버 상태(Supabase Realtime)의 관심사 분리를 달성하고, 잦은 동기화 요청 속에서도 성능 오버헤드 없는 정밀한 구조적 공유(Structural Sharing)를 달성합니다. |
| **Backend** | **Supabase (PostgreSQL)** | DB 트랜잭션의 ACID 원칙을 준수함과 동시에, PostgreSQL에 적재된 그래픽 정보의 변화를 즉시 송출 클라이언트에 전파(DB CDC)하는 아키텍처를 학습합니다. |
| **Styling** | **Tailwind CSS v4** | 최신 브라우저의 GPU 가속 기능이 결합된 CSS Variables와 Modern CSS 아키텍처를 사용하여 UI 구조 개발 속도를 단축합니다. |
| **Animation** | **Rive (WebGL2) & GSAP** | 고화질 방송 오버레이용 다이내믹 벡터 모션 그래픽을 웹 브라우저에서 60fps로 매끄럽게 처리하기 위해 GPU 웹 렌더러 기반 애니메이션을 도입합니다. |

---

## 📂 프로젝트 폴더 구조 (Project Structure)

```
webcg-k/
├── webcg-k/                 # 프론트엔드 애플리케이션 (React 19 SPA)
│   ├── src/
│   │   ├── routes/          # 페이지 라우트 (Dashboard, Controller, Renderer)
│   │   ├── components/      # GraphicsEditor, Timeline 등 도메인별 컴포넌트
│   │   ├── services/        # AI, Supabase API 등 인프라스트럭처 연동부
│   │   ├── stores/          # TanStack 글로벌 상태 관리 스토어
│   │   └── locales/         # 다국어 번역 키 세트 (ko, en)
│   └── docs/                # 아키텍처, 트러블슈팅 등 학습 및 아카이빙 폴더
│
└── supabase/                # 백엔드 인프라 (Self-hosted Docker)
    ├── migrations/          # squashed 단일 데이터베이스 마이그레이션 DDL
    └── docs/                # DB 스키마 테이블 구조서 (DB.md)
```

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 사전 준비 사항
*   Node.js 20 이상
*   Docker 및 Docker Compose (로컬 Supabase 실행용)

### 설치 및 로컬 부트스트랩

```bash
# 1. 저장소 복제 및 폴더 이동
git clone <repository-url>
cd webcg-k

# 2. 로컬 Supabase Docker 구동 및 단일 마이그레이션 적용
npx -y supabase start
# 단일 Squashed Migration이 즉시 반영되어 컨테이너가 시작됩니다.

# 3. 프론트엔드 의존성 패키지 설치
cd webcg-k
npm install

# 4. 환경 변수 구성
cp .env.example .env
# .env 파일에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 값을 채웁니다.

# 5. 개발 서버 기동
npm run dev
# → http://localhost:3000 에서 실행됩니다.
```

---

## 🔗 지식 베이스 및 문서 가이드 (Documentation Map)

WebCG-K는 프로젝트 전체가 하나의 훌륭한 **기술 교과서**가 되도록 세부 학습 및 가이드를 분리하여 보존하고 있습니다.

### 📚 핵심 지식 베이스 (Core Educational Docs)
*   **[CONTEXT.md](webcg-k/docs/CONTEXT.md)**: 전체 렌더링 파이프라인 Mermaid 다이어그램 및 Excalidraw 비교 분석서
*   **[TASKS.md](webcg-k/docs/TASKS.md)**: 현재 진행 중인 마일스톤 및 아키텍처 달성을 통한 학습 목표 가이드
*   **[CHANGELOG.md](webcg-k/docs/CHANGELOG.md)**: 시간/공간 복잡도(Big-O) 관점을 반영한 기술적 리팩토링 변경 이력
*   **[HANDOVER.md](webcg-k/docs/HANDOVER.md)**: 작업 복귀 시 뇌 워밍업을 위한 이전 아키텍처 설계 상태 공유서
*   **[LESSONS.md](webcg-k/docs/LESSONS.md)**: 데이터베이스 `search_path` 세션 충돌 오류를 디버깅한 트러블슈팅 오답 노트

### 💻 실무 매뉴얼 및 워크플로우
*   **[USAGE.md](webcg-k/docs/USAGE.md)**: 웹 자막 편집기의 실무 단축키, 마우스 스냅 가이드 등 통합 사용자 설명서
*   **[DB.md](supabase/docs/DB.md)**: 데이터베이스 ERD, RLS(행 단위 보안 정책) 사양서
*   **[REALTIME_SYNC.md](webcg-k/docs/guide/REALTIME_SYNC_ARCHITECTURE.md)**: 초저지연 데이터 동기화 아키텍처 가이드
*   **[GRID_EDITOR.md](webcg-k/docs/guide/GRID_EDITOR.md)**: Branch Station 표준화를 위한 그리드 에디터 기술 규격서

---

## 📝 라이선스 (License)

[MIT License](LICENSE)
