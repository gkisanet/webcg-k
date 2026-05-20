# 📝 CHANGELOG (기술적 변경 이력)

## [2026-05-18] - Explicit Realtime Broadcast Delivery Policy
### 변경
- `sendRealtimeBroadcast()`를 추가해 채널 준비 상태에 따라 WebSocket `send()`와 명시적 `httpSend()`를 분리했습니다.
- playout/stroke/replace/command/ACK 이벤트는 채널 준비 전에도 `httpSend()`로 전달하고, cursor presence와 heartbeat는 REST fallback 없이 건너뜁니다.
- Supabase Realtime의 암묵적 REST fallback deprecation warning을 발생시키던 직접 `channel.send()` 호출을 정리했습니다.
- `realtimeBroadcast.test.ts`를 추가해 send/fallback/no-fallback/error 정책을 테스트로 고정했습니다.
- 로컬 Supabase DB의 `whiteboards.document_state` 컬럼과 PostgREST schema cache reload를 확인했습니다.

### 검증
- `npm run test -- src/lib/__tests__/realtimeBroadcast.test.ts src/lib/annotation/__tests__/annotationDocument.test.ts src/lib/__tests__/broadcastSourceData.test.ts` 통과.
- WSL Linux Node 기반 `npm run build` 통과.
- Realtime/판서/render 관련 `tsc --noEmit` 필터 결과 신규 오류 없음.

## [2026-05-18] - Annotation Drawing Input Recovery
### 변경
- `whiteboards.document_state` 컬럼 또는 Supabase schema cache가 아직 준비되지 않은 환경에서도 판서 에디터가 입력 가능한 `ready` 상태를 유지하도록 fallback을 추가했습니다.
- fallback 상태에서는 임시 empty document로 그리기를 허용하고, 저장 실패는 non-blocking warning으로 처리합니다.
- mouse/pen/touch pointer move 정책을 분리했습니다. mouse는 왼쪽 버튼을 요구하고, pen/touch는 `buttons=0` 보고에도 활성 stroke를 이어갑니다.

### 검증
- `npm run test -- src/lib/annotation/__tests__/annotationDocument.test.ts src/lib/__tests__/broadcastSourceData.test.ts` 통과.
- WSL Linux Node 기반 `npm run build` 통과.
- 판서/render 관련 `tsc --noEmit` 필터 결과 신규 오류 없음.

## [2026-05-18] - Broadcast Annotation Cursor & Live Render Background
### 변경
- 판서 편집 화면을 컨트롤러 세션에서 열면 `/render?hideAnnotation=1&passive=1`이 배경 iframe으로 표시됩니다.
- `hideAnnotation=1`은 배경 render에서 판서 레이어만 숨겨 실제 방송 그래픽(Broadcast Graphics) 합성 위에 로컬 판서를 정확히 맞추게 합니다.
- `passive=1`은 배경 iframe이 ACK/heartbeat/render_state를 보내지 않게 해 실제 render 상태 판단을 방해하지 않습니다.
- 판서 pointer move를 broadcast cursor event로 전달하고, 실제 render는 펜 모양 커서를 1.5초 TTL로 표시합니다.

### 검증
- `npm run test -- src/lib/annotation/__tests__/annotationDocument.test.ts src/lib/__tests__/broadcastSourceData.test.ts` 통과.
- WSL Linux Node 기반 `npm run build` 통과.

## [2026-05-18] - License-clean Broadcast Annotation Layer
### 변경
- `@tldraw/tldraw`, `y-webrtc`, `yjs`를 제거하고 `perfect-freehand` 기반 경량 판서 레이어로 전환했습니다.
- `whiteboards.document_state` JSONB 마이그레이션을 추가하고, `AnnotationDocument` stroke 모델을 도입했습니다.
- `AnnotationCanvas`, `AnnotationRenderer`, `useAnnotationDocument`를 추가해 기본 흰색 판서가 기존 타임라인 방송 그래픽(Broadcast Graphics) 위에 투명 합성되도록 했습니다.
- 내부 `sourceType: "whiteboard"`는 기존 PVW/PGM/render payload 호환을 위해 유지합니다.

### 검증
- `npm run test -- src/lib/annotation/__tests__/annotationDocument.test.ts src/lib/__tests__/broadcastSourceData.test.ts` 통과.
- WSL Linux Node 기반 `npm run build` 통과.

## [2026-05-18] - Whiteboard PVW/PGM Playout Fix
### 🔧 Fixes & UX
- 화이트보드 패널을 `OFF / PVW / PGM` 3상태 스위처로 개편했습니다.
- PVW/PGM 모니터가 `sourceType: "whiteboard"`를 `RendererWhiteboard`로 렌더링하도록 연결했습니다.
- `useTldrawWebRTC`가 DB/Yjs 스냅샷을 Tldraw store에 hydrate하도록 수정해 나중에 붙은 화면이 빈 보드로 보이는 문제를 해결했습니다.
- `database.types.ts`에 섞인 Supabase CLI 출력 잡문을 제거했습니다.

## [2026-05-18] - Overlay PVW Runtime Isolation Policy
### 🔧 Refactoring & Architecture
- `useOverlayStore`의 `previewOverlays`를 `animation_state === "preview" && !is_active`로 좁혔습니다.
- PGM으로 TAKE된 오버레이는 PVW에서 숨겨, 타이머/애니메이션 iframe runtime이 PVW와 PGM에서 따로 흐르는 문제가 운영 화면에 중복 노출되지 않도록 했습니다.
- 장기 해결책은 root `docs/OVERLAY_SDK_STATE_SYNC_DESIGN.md`에 SDK 시간/상태 동기화 설계로 기록했습니다.

## [2026-05-18] - ACK/Heartbeat State Convergence Refactor
### 변경
- `useSessionController`가 ACK와 heartbeat를 같은 `broadcast:${sessionId}` topic에서 수신하도록 정렬했습니다.
- ACK 누락 시 동일 `seqNum` playout payload를 최대 2회 재전송하는 pending queue를 추가했습니다.
- 세션 전환/언마운트 시 pending ACK timer를 정리하도록 했습니다.

### 검증
- WSL Linux Node 기반 `npm run build` 통과.

## [2026-05-18] - Broadcast Source Contract Refactor
### 🔧 Refactoring & Fixes
- `src/lib/broadcastSourceData.ts` 추가: 오버레이 런다운 아이템의 최상위 `{html, css, js}`, `payload`, `source_code` 구조를 단일 정규화 함수로 수렴.
- `src/components/Renderer/BroadcastHtmlOverlay.tsx` 추가: PVW, PGM, `render.tsx`가 같은 HTML/CSS iframe 렌더러를 공유.
- `PreviewMonitor`, `PGMMonitor`, `render.tsx`의 sourceData 분기 로직을 정규화 유틸 기반으로 통합.
- `rundownRepository.ts`와 런다운 상세 미리보기 쿼리를 `overlay_templates.source_code` 기준으로 보강.

### ✅ Verification
- `npm run test -- src/lib/__tests__/broadcastSourceData.test.ts` 통과.
- WSL Linux Node 기반 `npm run build` 통과.

## [2026-05-18] - Whiteboard & Cuesheet Workspace Isolation Gating

### 🚀 New Features & Enhancements
- **큐시트 생성 프로세스 워크스페이스 가드 도입 (`cuesheets/index.lazy.tsx`)**:
  - 큐시트 수동 생성 시 활성화된 워크스페이스(`activeWorkspaceId`) 존재 여부를 명확히 검증하는 UX 경고 가드 추가.
  - 생성 시 `workspace_id: activeWorkspaceId`를 명시적으로 파라미터에 실어서 전달하여 멀티테넌시(Multi-tenancy) 데이터 무결성 보장.
- **CSV 임포트 위자드 워크스페이스 격리 보강 (`CsvImportWizard.tsx`)**:
  - CSV 파일을 통한 큐시트 생성 시에도 `activeWorkspaceId` 가드를 강제하고, 해당 워크스페이스에 큐시트가 안전하게 속하도록 패치.

### 🔧 Refactoring & Fixes
- **큐시트 API 조회 범위 최적화 (`cuesheetService.ts`)**:
  - `fetchCuesheets` 함수가 전역의 모든 큐시트를 조회하던 구조에서 `workspaceId` 파라미터를 강제하도록 서명 변경 및 `.eq("workspace_id", workspaceId)` 조회 필터 적용.
- **화이트보드 생성 프로세스 UX 가드 강화 (`whiteboards/index.lazy.tsx`)**:
  - `activeWorkspaceId`가 존재하지 않을 때 조용히 튕겨나가며 무반응이던 코드에 세분화된 예외 가드 및 경고창 (`alert`) 추가.
- **화이트보드 API 안전성 필터링 도입 (`whiteboardService.ts`)**:
  - `fetchWhiteboards` 함수가 모든 워크스페이스 데이터를 무차별적으로 조회하던 구조에서 `workspaceId` 파라미터를 강제하도록 서명 변경 및 `.eq("workspace_id", workspaceId)` 조회 최적화.
- **린트 오류 수정 (`WhiteboardPanel.tsx`)**:
  - 서비스 함수 파라미터 규격 변경에 따른 쿼리 린트 에러 즉각 해소.

## [2026-05-17] - Collaborative Whiteboard Integration (Tldraw + Yjs)

### 🚀 New Features & Enhancements
- **실시간 협업 화이트보드 구축**: `@tldraw/tldraw`와 `y-webrtc`를 결합하여 지연 시간이 없는 P2P 방식의 드로잉 캔버스 구현.
- **가상 커서 (Virtual Cursor) 도입**: 컨트롤러 쪽 사용자의 마우스 궤적을 렌더러 측(방송 화면)에서 실시간으로 볼 수 있도록 Yjs Awareness 프로토콜을 활용.
- **데이터베이스 영속성**: `whiteboards` 테이블 추가 및 10초 Debounce 방식의 바이너리 스냅샷 저장 최적화 도입.

### 🔧 Refactoring & Fixes
- **타임라인 타입 시스템 확장**: `GraphicSourceType` 및 타임라인 블록 `sourceType`에 `whiteboard` 리터럴 타입 추가.
- **렌더러 파이프라인 업데이트**: `render.tsx`에서 `whiteboard` 타입을 감지 시 `RendererWhiteboard.tsx`를 조건부 렌더링하고, 투명 배경(`pointer-events: none`) 및 카메라 락 모드를 강제하도록 수정.
- **메모리 최적화 정책**: 장시간 방송 시 Tombstone 누적을 방지하기 위한 `Hard Reset` 정책(강제 초기화) 도입.

## [2026-05-13] - Repository Synchronization & Documentation Mastery

### 🚀 New Features & Enhancements (Pulled from Origin)
- **Workspace-Based Collaboration Architecture**:
  - 다중 워크스페이스 지원 및 자원 격리 체계 구축.
  - `activeWorkspaceId` 기반의 전역 상태 관리 및 API 보안(RLS) 강화.
  - 워크스페이스 전환 UI 및 멤버 초대 기능 안정화.

### 🔧 Refactoring & Fixes
- **Admin & Service Synchronization**: `AdminWorkspacesTab` JSX 구조 수정 및 서비스 레이어 함수명 표준화.
- **Documentation Sync**: 5대 핵심 문서(`CONTEXT`, `TASKS`, `CHANGELOG`, `HANDOVER`, `LESSONS`)를 최신 워크스페이스 아키텍처에 맞춰 전면 업데이트.
- **Security Audit**: TanStack 공급망 보안 감사 완료 및 프로젝트 안전성 재확인.

## [2026-05-12] - 최신 코드베이스 동기화 & 워크스페이스 아키텍처 안정화

### 🚀 New Features & Enhancements (Pulled from Origin)
- **Workspace Management v2**:
  - 워크스페이스 정보 수정 기능 추가.
  - 멤버 초대 시 실시간 검색 및 초대 링크 생성 로직 보완.
  - API 호출 시 `workspace_id`가 누락되지 않도록 `AuthContext` 및 서비스 레이어 주입 로직 강화.
- **`database.types.ts` 재생성**: `workspace` 관련 신규 테이블 및 컬럼 타입 정보가 포함된 최신 타입 정의서 반영.

### 🔧 Bug Fixes
- **AdminWorkspacesTab Stability & Service Sync**: 
  - 초대 모달 섹션 내 중복/누락된 `</div>` 태그 및 잘못된 중첩 구조 수정. (Vite/Babel의 `Unterminated regular expression` 오탐지 오류 해결)
  - `workspaceService.ts`와 불일치하던 함수명(`fetchWorkspaceMembers` → `fetchMembers` 등) 전수 수정.
- **Security Audit**: 2026-05-11 발생한 TanStack npm 공급망 공격에 대한 전수 보안 감사 수행 및 프로젝트 안전성(Safe) 확인 완료.

### 🛠 Chore
- **Conflict Resolution**: `git pull` 시 `docs/CHANGELOG.md` 및 `docs/HANDOVER.md`에서 발생한 충돌을 Remote(Theirs) 기준으로 강제 해결 및 동기화.
- **`.gitignore`**: root에 `noonnu-fonts.css` 추가.
- **`SETUP.md` 감사**: 마이그레이션 개수(62개) 및 포트 설정(3200) 최신화.

## [2026-05-10] - AI Cuesheet Localization & Bug Fix

### 🚀 New Features
- **[A] AI Cuesheet i18n (Internationalization)**:
  - **다국어 지원**: AI 큐시트 페이지의 모든 하드코딩된 영어 텍스트를 `react-i18next`를 통해 `dashboard` 네임스페이스로 통합 및 한글화.
  - **Step Indicator**: 위자드 단계별 레이블에 `labelKey` 도입하여 런타임 언어 전환 지원.
  - **Status & Badges**: 세션 상태(Draft, In Progress, Completed) 및 매칭 상태(Matched, Needs Check, Missing)에 대한 다국어 대응 완료.

### 🔧 Bug Fixes
- **[F] Session Service Type Error**:
  - `aiCuesheetSessionService.ts`: `expert_name` 추출 시 `expert_data`의 `Json` 타입 불일치로 인한 TS 에러 해결 (`String()` 캐스팅 및 `any` 우회 적용).
  - `ai-cuesheet.lazy.tsx`: `handleSubmitRundown` 내 `rundownId` 스코프 오류 및 `supabase` 미정의 에러 수정.

### 🏗 Architecture Decisions
- **i18n Namespace Consolidation**: AI 큐시트 전용 JSON 파일을 만드는 대신, 기존 `dashboard.json` 내 `aiCuesheet` 계층을 확장하여 관리 포인트 최소화.
- **Defensive Type Casting**: Supabase Join 데이터와 로컬 Interface 간의 타입 불일치를 해결하기 위해 명시적 `String()` 캐스팅 전략 채택 (Runtime Stability 확보).

### 📊 Knowledge Map
- **[M] Graphify 갱신**: 서비스 레이어의 타입 수정 및 UI 컴포넌트의 i18n 의존성 추가 반영.

## [2026-05-09] - AI Workflow Integration & Prompt Engineering
3: 
4: ### 🚀 New Features
5: - **[A] Bundle-Aware AI Cuesheet**:
6:   - **자동 슬롯 등록**: AI 큐시트를 통해 생성된 오버레이가 현재 편집 중인 Bundle에 자동으로 등록되도록 워크플로우 통합.
7:   - **`overlay_id` 지원**: `bundle_slots` 테이블에 `graphic_id` 외에 `overlay_id`(AI 생성 템플릿)를 직접 참조할 수 있는 컬럼 연동 (`bundleService.ts`).
8: - **[A] Zone-Aware AI Overlay Generation**:
9:   - **물리적 제약 조건 주입**: 시스템 프롬프트에 대상 영역의 좌표(x, y)와 크기(w, h)를 동적으로 주입하여, AI가 절대 좌표 기반의 방송 그래픽을 더 정확하게 설계하도록 유도.
10:   - **Overflow 방지 로직**: 고정 픽셀(px) 남용으로 인한 레이아웃 깨짐을 방지하기 위해 Flexbox/Ratio 기반의 반응형 디자인 가이드를 프롬프트에 명문화.
11: 
12: ### 🔧 Refactoring
13: - **[M] Semantic Types & Bundle Logic**:
14:   - `BundleSlot` 인터페이스에 `overlay_id` 필드 추가하여 AI 생성 에셋의 정식 지원 체계 마련.
15:   - `ai-cuesheet.lazy.tsx`: 5단계 스테이트 머신 내부에서 번들 ID 감지 및 슬롯 추가 API 연동.
16: 
17: ### 🏗 Architecture Decisions
18: - **Loose Coupling via Optional FK**: Bundle Slot이 기존 Graphics(정적)와 Overlay(AI 동적)를 동시에 수용할 수 있도록 `graphic_id`와 `overlay_id`를 모두 nullable로 처리하고 상호 배타적/공존 가능하도록 설계.
19: 
20: ### 🛠 Etc
21: - **[M] package.json**: 의존성 최적화 및 빌드 스크립트 점검.
22: 
2: ## [2026-05-08] - AI 서비스 아키텍처 통합 및 고도화 (Core-Domain 분리)
3: 
4: ### 🚀 New Features
5: - **[A] AI Core Service (`aiCoreService.ts`)**:
6:   - **멀티 프로바이더 추상화**: Gemini, DeepSeek, Groq, GitHub, OpenRouter 등 다양한 API 공급자를 단일 `callAI()` 인터페이스로 통합.
7:   - **API 키 동적 관리**: Supabase `api_keys` 테이블과 `.env` 환경 변수를 연동하여 런타임에 키를 조회 및 캐싱.
8:   - **추론 모델(Reasoning) 최적화**: Kimi K2.6, QwQ, DeepSeek R1 등 '생각하는 모델' 감지 및 모델별 최적화 파라미터(temperature, reasoning_effort) 자동 분기.
9:   - **사용량 로깅**: 모든 AI 호출 결과를 `ai_usage_logs` 테이블에 기록하여 토큰 소모량 추적 기반 마련.
10: - **[A] Truncated JSON Repair (잘린 JSON 복구)**:
11:   - AI 모델의 출력 토큰 한계로 인해 JSON이 중간에 잘릴 경우, 정규식과 중괄호 스택 분석을 통해 `html`, `css`, `js` 등 핵심 필드만이라도 부분 복구하는 로직 도입 (`aiOverlayService`, `aiCuesheetService`).
12: 
13: ### 🔧 Refactoring
14: - **[M] Domain Services (`aiOverlayService`, `aiCgService`, `aiCuesheetService`)**:
15:   - 개별 서비스에서 직접 수행하던 `fetch` 호출을 `aiCoreService.callAI()`로 이관.
16:   - **시스템 프롬프트 이원화**: 일반 모델용 프롬프트와 추론 모델용 압축 프롬프트를 분리하여 컨텍스트 효율 극대화.
17:   - **타이머 동기화 패턴**: PVW/PGM 창 간의 타이머 오차 보정(200ms) 및 상태 복원 로직을 시스템 프롬프트에 명문화하여 생성 코드 품질 향상.
18: 
19: ### 🏗 Architecture Decisions
20: - **Fire-and-Forget Logging**: 사용량 로깅 실패가 메인 비즈니스 로직(코드 생성)에 영향을 주지 않도록 비동기 즉시 실행 패턴 적용.
21: - **Prompt Compression**: 추론 모델은 내부 reasoning에 토큰을 많이 소비하므로, 시스템 프롬프트를 50% 수준으로 압축하여 생성 성능 확보.
22: 
23: ### 🛠 Etc
24: - **[A] .claudeignore**: AI 도구(Claude 등)가 불필요하게 인덱싱하거나 읽지 않아도 되는 파일 목록 정의.
25: 
26: ## [2026-05-08] - Tennis Scoreboard Test Assets
27: 
28: ### 🚀 New Features
29: - **[A] Test Overlay Assets (`test/`)**:
30:   - JSON 형태의 테니스 스코어보드 샘플을 독립된 HTML/CSS/JS 파일로 분리.
31:   - **v2 업데이트**: 매치 타이머 및 절대 시간 동기화 로직(`computeTimerRemaining`)이 포함된 고도화된 버전으로 갱신.
32:   - **Mock webcgk API**: 시스템이 주입하는 `webcgk` 객체 없이도 일반 브라우저에서 오버레이 애니메이션과 데이터 바인딩을 테스트할 수 있도록 Mocking 코드 추가.

## [2026-05-07] - SemanticRenderer v3: Semantic & Fluid CG 아키텍처 구현

### 🚀 New Features
- **[A] 타입 시스템 (`semanticTypes.ts`)**: `SemanticRole`(6종), `StyleHint`(4종), `ThemeTokens`, `SemanticNode`(재귀적 children), `LayoutIntent`, `SemanticScene`, `ZoneBoundingBox`, `ThemePresetId` 타입 정의
- **[A] 테마 프리셋 (`themePresets.ts`)**: NEWS(보수적 serif, blue accent), VARIETY(볼드 rounded, pink accent), SPORTS(condensed, red/yellow) 3개 내장 테마
- **[A] 테마 스토어 (`themeStore.ts`)**: `@tanstack/react-store` 기반. `setThemePreset()`, `applyBundleTheme()`, `clearBundleTheme()`
- **[A] ThemeProvider (`ThemeProvider.tsx`)**: themeStore 구독 → `document.documentElement.style.setProperty()`로 `--cg-*` CSS 변수 런타임 주입
- **[A] Layout Mapper (`layoutUtils.ts`)**: `zoneToBounds()`(L3/Full_Screen/Side_Panel_Right/OTS), `containerLogicToCSS()`, `alignmentToCSS()`, `gapToCSS()`, `sizingToCSS()`, `layoutIntentToCSS()`(composite), `fontSizeStrategy()`(CSS clamp 기반 Text-Fit)
- **[A] NodeRenderer (`NodeRenderer.tsx`)**: 재귀적 SemanticNode→DOM 변환. semantic_role→HTML tag, importance→fontWeight+opacity, StyleHint→CSS class. maxDepth=4 가드, SilentErrorBoundary 격리, Container Query 기반 Text-Fit
- **[A] SemanticRenderer (`SemanticRenderer.tsx`)**: Scene-level 진입점. layout_intent→container CSS, AnimPhase(entering→stable→leaving) 생명주기, GPU 가속 IN/OUT 애니메이션
- **[A] CSS Foundation (`semanticRenderer.css`)**: `.cg-scene`, `.cg-text-*`, `.cg-style-*`, `.cg-child-container`, Container Queries(400px/250px)

### 🔧 Modified
- **[M] CompositorLayer.tsx**: `plugin_type === "semantic"` 브랜치 추가 → SemanticOverlayLayer로 라우팅
- **[M] bundleService.ts**: `getBundleTheme()`/`saveBundleTheme()` 추가 (DB theme_config JSONB R/W)
- **[M] render.tsx**: `<ThemeProvider>` 래퍼 추가 → OBS 브라우저 소스에 `--cg-*` CSS 변수 주입
- **[M] styles.css**: `:root`에 `--cg-*` fallback 변수 추가, `semanticRenderer.css` import

### 📐 Architecture Decisions
- **CSS Custom Properties 우선**: 테마 변경 시 GPU 가속 repaint만 발생, React reconciliation overhead 없음
- **Direct React DOM vs iframe**: AI 생성 코드가 아닌 결정론적 매핑이므로 샌드박스 불필요
- **`--cg-` prefix**: 대시보드 UI 토큰(`--app-*`, `--text-*`)과 방송 그래픽 토큰 네임스페이스 분리
- **TanStack Store**: 기존 stores/ 패턴과 일관성 유지 (timelineStore, actionLogStore와 동일)

### 📊 Knowledge Map
- **[M] Graphify 갱신**: 758 노드, 980 엣지, 84 커뮤니티 (SemanticRenderer 컴포넌트 트리 반영)

## [2026-05-07] - AI 큐시트 Phase 2 파이프라인 구현 완료

### 🚀 New Features
- **[A] AI 큐시트 서비스 (`aiCuesheetService.ts`)**:
  - `buildSystemPrompt()`: CG 패널 템플릿 카탈로그 기반 외부 AI용 시스템 프롬프트 자동 생성 (최대 30개, `updated_at` 기준)
  - `parseAiCuesheetJson()`: 3단계 JSON Truncation Recovery 파서 — 정상 파싱 → 마지막 유효 중괄호 복구 → 필드별 문자열/객체 추출
  - `matchOverlays()`: 구조적 계약(`input_contract`) 기반 3단계 매칭 엔진 — required 키셋 정확 매칭(100%) → 부분 매칭(50%+) → bigram 이름 유사도
  - `generateMissingOverlays()`: `aiOverlayService.generateOverlayCode()` 활용 일괄 생성 + SHA-256 중복 방지 + 자기 기술 메타데이터 자동 생성
  - `buildRundownBlocks()`: 런다운 아이템 일괄 생성 (`source_type: 'overlay'`, `data.replicant_data` + `trigger_note` 주입)
- **[A] AI 큐시트 UI (`ai-cuesheet.lazy.tsx`)**: 5단계 스테이트 머신 (시스템 프롬프트 → JSON 입력 → 템플릿 매칭 → 생성 진행률 → 런다운 제출)
- **[A] 타입 정의 (`aiCuesheetTypes.ts`)**: `AiCuesheet`, `AiCuesheetScene`, `MatchResult`, `AiCuesheetGenerationTask` 등

### 🗄 DB Changes
- **[A] 마이그레이션 `20260507000001_ai_cuesheet_metadata.sql`**:
  - `overlay_templates`: `input_contract JSONB`, `semantic_role TEXT`, `last_modified_by TEXT`, `generation_source_hash TEXT` 추가
  - `ai_cuesheet_sessions` / `ai_cuesheet_session_scenes` 테이블 선제 정의 (Phase 4 저장 기능 대비, RLS 포함)

### 📐 Architecture Decisions (확정)
- 런다운 삽입 방식: "새 런다운 생성" + "기존 런다운에 추가" 버튼 모두 제공
- 미싱 템플릿 생성: N개 일괄 생성 (진행률 UI) + 개별 생성 모두 지원
- 저장 전략: MVP에서는 인메모리만 유지, Phase 4 테이블 스키마만 선제 정의

### 📊 Knowledge Map
- **[M] Graphify 갱신**: 896 노드, 978 엣지, 166 커뮤니티로 확장 (+24 노드, +42 엣지)

## [2026-05-07] - Knowledge Map Refresh & Cost Analysis
- **[M] Graphify Knowledge Map 갱신**: `graphify-out` 결과 전체 삭제 후 재생성 완료. (707 노드, 905 엣지로 확장)
- **[A] 개발 비용 분석 보고**: Claude Opus 4.6(Thinking) 모델 기반의 3개월 개발 비용 추정치 산출 및 보고.

## [2026-05-06] - Repository Synchronization & Architecture Refinement

### 🚀 New Features & Enhancements
- **[A] Color Utility 추가 (`colorUtils.ts`)**: RGBA 문자열을 Hex 코드로 변환하는 유틸리티 도입. 렌더러에서의 일관된 색상 처리를 위함.
- **[M] AI CG Service 고도화 (`aiCgService.ts`)**: 
  - 다중 변형(Variations) 생성 로직 안정화.
  - 생성 실패 시 개별 에러 트래킹 및 로깅 강화.
- **[M] Renderer 고도화 (`render.tsx`)**: 
  - 배경색 처리 시 `rgbaToHex` 유틸리티를 적용하여 브라우저 호환성 및 시각적 일관성 확보.

### 🏗 Architecture Changes
- **라우팅 구조 재배치 완료 (Studio Tier)**:
  - `graphics`, `overlays`, `grid-templates` -> `dashboard/studio/` 하위 폴더로 이동.
  - TanStack Router의 파일 기반 라우팅을 활용하여 'Studio' 핵심 기능들을 논리적으로 그룹화.
  - `images`, `fonts` 등 정적 자산은 `dashboard/assets/`로 격리.
  - **이점**: 프로젝트 규모 확장에 따른 파일 탐색 용이성 증대 및 기능별 관심사 분리(SoC) 달성.

### 🛠 Refactoring & Fixes
- **TanStack Router Link 수동 수정**: 하위 라우트 이동에 따른 `to` 속성 및 절대/상대 경로 의존성 전수 조사 및 수정.
- **CSS Import 경로 최적화**: 공통 대시보드 스타일에 대한 참조 경로 갱신.

---
*기록자: Antigravity (AI Senior Mentor)*
