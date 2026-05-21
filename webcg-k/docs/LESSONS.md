# LESSONS (트러블슈팅 & 오답 노트)

## [2026-05-18] Supabase Realtime send() 암묵적 REST fallback 경고
- **증상**: 콘솔에 `Realtime send() is automatically falling back to REST API` 경고가 표시되었다.
- **원인 (Root Cause)**: 채널이 아직 joined 상태가 아닌 순간에 `channel.send()`를 호출하면 Supabase가 자동 REST fallback을 수행한다.
- **해결책**: `sendRealtimeBroadcast()`로 WebSocket send와 명시적 `httpSend()` fallback을 분리했다. cursor presence와 heartbeat는 REST fallback 없이 건너뛰도록 했다.
- **배운 점**: 방송 그래픽(Broadcast Graphics) realtime 이벤트는 playout처럼 전달 보장이 필요한 이벤트와 cursor처럼 손실 허용 가능한 presence 이벤트를 다르게 다뤄야 한다. 정책은 유틸과 테스트로 함께 고정해야 한다.

## [2026-05-18] 판서 레이어가 입력을 받지 않는 문제
- **증상**: 판서 레이어에서 그리려 해도 stroke가 생성되지 않았다.
- **원인 (Root Cause)**: `whiteboards.document_state` 컬럼/schema cache 미준비 오류가 hook 상태를 `error`로 만들었고, `AnnotationCanvas`는 `ready`가 아니면 pointer 입력을 차단했다. pen/touch 장치에서는 `event.buttons=0` 보고로 move가 끊길 수도 있었다.
- **해결책**: document_state 누락은 임시 document fallback으로 낮춰 입력 가능성을 유지했다. pointer move 정책은 mouse와 pen/touch로 분리하고 테스트를 추가했다.
- **배운 점**: 방송 그래픽(Broadcast Graphics) 운영 화면에서 저장 실패와 입력 실패는 분리해야 한다. Pointer Events는 장치별 차이를 코드 정책으로 명시해야 한다.

## [2026-05-18] 판서 에디터 배경 render는 passive 모드여야 한다
- **증상**: 실제 송출 화면을 보며 판서하려고 `/render`를 iframe으로 띄우면, 미리보기 iframe도 ACK/heartbeat를 보내 실제 render처럼 행동할 수 있다.
- **원인 (Root Cause)**: `render.tsx`는 시각 출력과 송출 프로토콜 endpoint 책임을 함께 가진다.
- **해결책**: 에디터 배경은 `/render?hideAnnotation=1&passive=1`로 열고, passive 모드에서 ACK/heartbeat/render_state 보고를 중지했다.
- **배운 점**: 실시간 방송 그래픽(Broadcast Graphics) 미리보기는 화면만 재사용하고 프로토콜 부작용은 차단해야 한다.

## [2026-05-18] 판서 커서는 저장 문서가 아니라 presence다
- **증상**: 실제 render에서 조준 커서를 보여주고 싶지만, 이를 stroke 문서에 저장하면 잔상과 불필요한 DB churn이 생긴다.
- **원인 (Root Cause)**: 커서는 순간적인 operator presence이고, stroke는 영속 문서 상태다.
- **해결책**: cursor event를 broadcast로만 보내고, render는 1.5초 TTL 후 펜 모양 커서를 숨긴다.
- **배운 점**: 같은 realtime 채널을 써도 document state와 presence state는 저장 정책과 수명을 분리해야 한다.

## [2026-05-18] tldraw를 방송 판서 레이어로 쓰면 라이선스/무게/도메인 경계가 맞지 않는다
- **증상**: tldraw 적용 후 프로덕션 라이선스 경고가 나타날 수 있고, 실제 요구보다 많은 에디터 기능이 번들에 들어왔다.
- **원인 (Root Cause)**: 문제를 “화이트보드 앱”으로 모델링했지만, 실제 요구는 1920x1080 좌표계의 transparent annotation overlay였다.
- **해결책**: `@tldraw/tldraw`, `y-webrtc`, `yjs`를 제거하고 `perfect-freehand`, `AnnotationDocument`, `AnnotationCanvas`, `AnnotationRenderer`로 교체했다.
- **배운 점**: 방송 그래픽(Broadcast Graphics) 송출 경로에서는 기능 많은 SDK보다 송출 합성 모델에 정확히 맞는 작은 도메인 모델이 더 안전하다.

## [2026-05-18] 화이트보드 그림이 PVW/PGM/render에 표시되지 않는 문제
- **증상**: 화이트보드에서 그린 선이 컨트롤러 PVW/PGM 또는 renderer에 표시되지 않았다.
- **원인 (Root Cause)**: DB 스냅샷은 `Y.Doc`에 적용됐지만 Tldraw store로 초기 hydrate되지 않았다. 또한 PVW/PGM 모니터는 `whiteboard` source kind를 직접 렌더링하지 않았다.
- **해결책**: Yjs map 초기 레코드를 Tldraw store에 넣고, PVW/PGM/render가 모두 `RendererWhiteboard` 경로를 공유하도록 했다. 패널은 `OFF/PVW/PGM` 스위처로 정리했다.
- **배운 점**: 실시간 CRDT 렌더링은 저장소 로드, UI store hydrate, 이후 remote update 반영이 모두 필요하다.

## [2026-05-18] 상태를 가진 오버레이 iframe은 PVW/PGM 복제로 동기화되지 않는다
- **증상**: PVW에서 타이머 오버레이를 동작시킨 뒤 PGM으로 TAKE하면 PGM의 타이머와 애니메이션 상태가 PVW와 다르게 시작될 수 있다.
- **원인 (Root Cause)**: PVW, PGM, `render.tsx`가 각각 별도 iframe runtime을 생성해 `setInterval`, CSS animation, WAAPI timeline의 시작 기준이 달라진다.
- **해결책**: 단기적으로 PVW의 `previewOverlays`에서 `is_active` 오버레이를 제외했다. 장기적으로는 SDK가 `takeAt`, clock offset, lifecycle event, state snapshot 계약을 제공해야 한다.
- **배운 점**: 상태ful 방송 그래픽(Broadcast Graphics)은 데이터 동기화만으로 충분하지 않다. 시간 기준과 runtime lifecycle이 SDK 인터페이스의 일부가 되어야 한다.

## [2026-05-18] Heartbeat topic 불일치와 ACK 미사용으로 상태 수렴이 약해지는 문제
- **증상**: renderer가 heartbeat를 보내도 controller의 heartbeat monitor가 수신하지 못할 수 있고, ACK가 기록만 된 채 재전송에는 사용되지 않았다.
- **원인 (Root Cause)**: renderer는 `broadcast:${sessionId}` 채널에 heartbeat를 발행했지만 controller는 `heartbeat:${sessionId}` 채널을 구독했다. 또한 `acknowledgedSeqNumsRef`는 채워졌지만 pending payload queue가 없었다.
- **해결책**: controller가 broadcast channel에서 ACK와 heartbeat를 함께 수신하도록 정렬하고, ACK timeout 시 같은 `seqNum` payload를 최대 2회 재전송하도록 했다.
- **배운 점**: 실시간 송출 프로토콜에서는 이벤트 이름뿐 아니라 channel topic까지 데이터 계약의 일부다. ACK는 저장하는 것만으로는 의미가 없고, retry 또는 reconcile 루프와 연결되어야 한다.


## [2026-05-18] sourceData 계약이 화면마다 다르면 미리보기와 실제 송출이 갈라진다
- **증상**: 오버레이 런다운 아이템이 `payload`에 HTML/CSS를 갖고 있을 때 PVW/PGM/render 중 일부 화면에서 그래픽 데이터 없음 상태가 될 수 있었다.
- **원인 (Root Cause)**: `rundownRepository`와 renderer 계층이 서로 다른 `sourceData` 위치를 기대했고, PVW/PGM에는 HTML/CSS 오버레이 블록 직접 렌더링 경로가 없었다.
- **해결책**: `normalizeBroadcastSourceData()`와 `BroadcastHtmlOverlay`를 도입해 데이터 계약 해석과 iframe 렌더링을 공통화했다.
- **배운 점**: 실시간 송출 경로에서는 데이터 정규화 모듈이 깊어야 한다. 화면별 분기 조건이 얕게 흩어지면 장애가 조용히 미리보기/실출력 불일치로 나타난다.

## [2026-05-18] 큐시트 생성 및 CSV 임포트 시 멀티테넌시(Workspace) 격리 설계 누락
- **증상**: 큐시트 생성 대시보드 및 CSV 임포트 위자드에서 새로운 큐시트를 생성할 때, 활성화된 워크스페이스(`activeWorkspaceId`) 정보를 바인딩 및 가딩하지 않고 `workspace_id`가 `null`로 저장되거나 전역 조회되는 현상.
- **원인 (Root Cause)**: 큐시트 도메인 서비스(`cuesheetService.ts`)와 UI 컴포넌트(`index.lazy.tsx`, `CsvImportWizard.tsx`) 구현 시 초기 릴리즈 단계에서 다중 워크스페이스 격리 아키텍처에 대한 고려가 누락된 채 단순 전역 데이터 수준의 CRUD로 작성되었기 때문임. 이로 인해 한 사용자가 생성한 큐시트가 타 워크스페이스 사용자에게도 무단 노출될 수 있는 중대한 논리적 데이터 유출 및 격리 파괴 버그가 있었습니다.
- **해결책**:
  1. `cuesheetService.ts`의 `fetchCuesheets` 함수 시그니처에 `workspaceId: string` 입력을 강제하고, `.eq("workspace_id", workspaceId)` 조회 필터를 주입하여 다른 테넌트의 침범을 원천 격리.
  2. 큐시트 메인 라우트(`index.lazy.tsx`) 및 CSV 임포트 위자드(`CsvImportWizard.tsx`) 컴포넌트에 `useAuth()` 훅을 연동하여 `activeWorkspaceId`가 없을 경우 생성 프로세스 진입 자체를 에러 가드로 차단.
  3. `createCuesheet` 파라미터에 `workspace_id: activeWorkspaceId`를 명시적으로 태깅하여 데이터베이스 적재 무결성을 완성.
- **배운 점**: 다중 사용자 워크스페이스 기반 시스템을 설계할 때는 **어떤 신규 리소스(화이트보드, 큐시트, 오버레이 등)가 추가되든 간에 최초 API 설계부터 격리 식별자(Workspace ID)가 바인딩되는 파이프라인과 안전 가드 조건이 함께 탑재되어야 한다**는 점을 항상 아키텍처 원칙으로 엄수해야 함.

## [2026-05-18] 화이트보드(경기 분석 보드) 생성 시 activeWorkspaceId 부재로 인한 무반응 현상
- **증상**: 새 화이트보드 생성 모달에서 보드 명을 입력하고 '생성' 버튼을 눌렀을 때 아무런 작동도 하지 않고 에러창도 발생하지 않는 현상.
- **원인 (Root Cause)**: `handleCreateNew` 함수 내에서 `!activeWorkspaceId` 조건에 걸려 즉시 `return` 처리되었기 때문임. 대시보드 로드 초기에 활성화된 워크스페이스(`activeWorkspaceId`) 상태가 지정되지 않았거나 가져오지 못한 유저의 경우, 예외 안내 메시지가 부재하여 조용히 생성이 무시되는 사용자 경험(UX) 버그가 있었습니다.
- **해결책**:
  1. `handleCreateNew` 내부에서 이름이 비었을 때와 `activeWorkspaceId`가 없을 때 각각 명확한 얼럿(`alert`) 경고창을 띄우도록 가드를 세분화하여 추가.
  2. `whiteboardService.ts`의 `fetchWhiteboards` 함수 및 `index.lazy.tsx`의 `useQuery`에서 특정 `workspaceId`로만 조회할 수 있도록 필터링 파라미터를 추가하여 DB 쿼리 안전성 및 성능 강화.
- **배운 점**: 전역 컨텍스트 상태(예: 활성 워크스페이스 ID)를 필요로 하는 로직에서는 `if (!id) return;`과 같이 조용히 무시하는 코드를 작성할 것이 아니라, 사용자에게 활성화 방법을 인지시키는 명확한 예외 피드백(경고창, 유도 UI)을 반드시 설계해야 UX적인 신뢰성을 보장할 수 있음.

## [2026-05-12] `git pull` 시 문서 파일 충돌 (Conflict) 및 해결 전략
- **증상**: `git pull` 실행 시 `docs/CHANGELOG.md` 및 `docs/HANDOVER.md`에서 로컬 변경사항과 원격 변경사항이 충돌하여 pull 중단.
- **원인 (Root Cause)**: AI 어시스턴트가 매 작업마다 문서를 자동 업데이트하기 때문에, 원격 저장소에 반영된 문서와 로컬에서 새로 작성된 문서 간의 바이트 단위 불일치가 빈번히 발생함.
- **해결책**:
  1. `git stash`로 로컬 문서를 대피시킨 후 `git pull` 시도.
  2. 만약 이미 병합 중 충돌이 발생했다면, `git checkout --theirs docs/*.md`를 통해 원격 저장소의 최신 형상을 우선 수용.
  3. 이후 AI가 현재의 최종 상태(Current State)를 분석하여 문서를 다시 덮어쓰는 방식으로 정합성 확보.
- **배운 점**: 문서 파일은 코드와 달리 덮어쓰기가 비교적 안전하므로, 충돌 시 `theirs` 전략을 사용하여 빠르게 동기화한 뒤 AI의 맥락 분석을 통해 재작성하는 것이 효율적임.

## [2026-05-12] AuthContext Provider value 누락 — 새 값을 추가했으나 Provider에 전달 안 함
- **증상**: `useAuth().activeWorkspaceId`와 `useAuth().setActiveWorkspace`가 런타임에서 항상 `undefined` 반환. 워크스페이스 스위처 버튼이 동작하지 않고, 사이드바 드롭다운이 현재 워크스페이스를 표시하지 못함.
- **원인 (Root Cause)**: `auth.tsx`에서 `activeWorkspaceId` 상태와 `setActiveWorkspace` 함수를 **선언은 했으나**, `<AuthContext.Provider value={{...}}>`의 value 객체에 **포함하지 않았음**. React Context의 특성상 value prop에 포함되지 않은 값은 소비 컴포넌트에 전달되지 않는다. TypeScript 인터페이스(`AuthContextType`)에는 정의되어 있어 타입 에러도 발생하지 않았기 때문에 빌드 단계에서 검출 불가.
- **해결책**: Provider의 value에 `activeWorkspaceId, setActiveWorkspace` 추가.
- **함께 발견된 버그**:
  - `inviteMember()`는 `Promise<void>`(에러 시 throw)를 반환하는데, `AdminWorkspacesTab`에서 `const { error } = await inviteMember(...)` 구조 분해를 시도 → `error`가 항상 `undefined`여서 실패가 묵살됨. `await`으로 교체하고 onError 콜백에서 처리.
  - `setActiveWorkspace` 내부에서 `user?.id`가 `undefined`일 수 있는데 `.eq("id", user?.id)` 전달 → TypeScript 에러. `if (!user?.id) return` 가드 추가.
- **배운 점**: React Context에 새 값을 추가할 때는 반드시 **① 인터페이스 정의 → ② 상태/함수 선언 → ③ Provider value 전달** 3단계를 모두 확인할 것. 특히 ③번은 TypeScript가 잡아주지 않는 런타임 버그이므로 코드 리뷰 체크리스트에 포함해야 한다.

## [2026-05-12] React useEffect 의존성 관리 오류로 인한 iframe 무한 리로드 및 애니메이션 반복
- **증상**: 오버레이 코드 에디터(/dashboard/studio/overlays) 우측 패널에서 대시보드 스키마 값을 변경할 때마다, 미리보기 iframe의 애니메이션이 계속 초기화되며 Show/Hide를 반복하는 현상 발생. 시각 편집 모드 연동 시 로직 꼬임.
- **원인 (Root Cause)**: 코드 변경 시 400ms debounce 후 iframe의 `srcdoc`을 갱신하는 `useEffect`의 의존성 배열(dependency array)에 `testData`가 포함되어 있었음. 대시보드 입력마다 `testData` 상태가 변경되면서 해당 이펙트가 불필요하게 재실행되었고, 이로 인해 iframe 전체가 재생성(`srcdoc` 교체)되면서 플러그인의 초기 로드 애니메이션이 매번 발생함. 원래 목적은 `postMessage`로 데이터만 전달하는 것이었으나, 의존성 설계 실수로 DOM 리로드가 일어남.
- **해결책**:
  - `testData` 상태를 담는 `testDataRef`를 생성하여 최신 상태를 추적.
  - `useEffect`의 의존성 배열에서 `testData`를 제거하고, `setTimeout` 내부에서는 `testDataRef.current`를 사용하여 클로저 문제(Stale Closure) 없이 최신 데이터를 `postMessage`로 전달하도록 수정.
- **배운 점**: DOM 리로드를 유발하는 무거운 작업(iframe `srcdoc` 교체 등)을 관리하는 `useEffect`의 의존성 배열에는 UI 상태(`testData`)를 직접 넣지 말고, `useRef`를 활용해 "값은 읽되 리렌더링 이펙트는 트리거하지 않도록" 관리해야 의도치 않은 화면 깜빡임과 리소스를 절약할 수 있음.## [2026-05-10] TypeScript Type Mismatch (Json to String) & i18n Scope
- **증상**: Supabase Join 결과인 `expert_data` (Json)에서 `name`을 추출하여 `expert_name` (string)에 할당할 때, "Type '{}' is not comparable to type 'string'" 에러 발생. 또한 i18n 적용 과정에서 `StepIndicator` 등 하위 컴포넌트에서 `t` 함수 미정의 에러 발생.
- **원인 (Root Cause)**: 
  - Supabase가 반환하는 `Json` 타입은 TS 관점에서 `{}` (empty object)를 포함할 수 있는 넓은 범위이므로, 명시적인 타입 단언 없이 `string` 타입 필드에 직접 할당이 불가능함.
  - `const { t } = useTranslation()`은 훅이므로 함수형 컴포넌트 내부에서만 사용 가능하며, 컴포넌트 외부나 훅이 호출되지 않은 영역에서는 접근할 수 없음.
- **해결책**:
  - **Defensive Casting**: `String((row.expert_data as any)?.name || "")`와 같이 명시적으로 `String` 생성자를 사용하거나 `as string`으로 타입을 좁혀서 할당.
  - **Hook Localization**: `StepIndicator` 등 각 하위 컴포넌트 내부에 `useTranslation`을 각각 호출하여 독립적인 번역 컨텍스트 확보.
- **배운 점**: 
  - 외부 라이브러리(Supabase)의 유연한 타입(Json)을 내부 도메인 모델(Interface)로 변환할 때는 반드시 명시적인 타입 캐스팅과 런타임 값 검증(String 생성자 등)을 거치는 것이 안전함.
  - 대규모 컴포넌트 파일을 i18n화할 때는 각 서브 컴포넌트의 스코프를 사전에 점검하여 필요한 훅이 누락되지 않도록 주의해야 함.

## [2026-05-09] 물리적 공간 인지(Zone-Aware) 프롬프트와 레이아웃 깨짐(Overflow) 방지
3: - **증상**: AI가 생성한 오버레이가 렌더러의 특정 영역(Zone)에 배치될 때, 배경 카드나 텍스트 박스가 영역 밖으로 삐져나가는(Overflow) 현상이 빈번히 발생. 특히 고정 픽셀(px)을 남용할 때 두드러짐.
4: - **원인 (Root Cause)**: LLM은 캔버스의 전체 크기는 알지만, 특정 Zone의 제약 조건(x, y, w, h)을 모른 채 '보기 좋은' 디자인을 하려다 보니 물리적 공간을 초과하는 코드를 작성함.
5: - **해결책**:
6:   - **Dynamic Context Injection**: 시스템 프롬프트에 `Zone: {name} (x, y, w, h)` 정보를 동적으로 주입하여 AI가 현재 작업 공간의 물리적 좌표와 크기를 명확히 인지하게 함.
7:   - **반응형 가이드라인 명문화**: "컨테이너에는 고정 px 대신 %, flex: 1 등을 사용하고, 폰트/여백에만 px을 사용하라"는 구체적인 CSS 규칙을 프롬프트에 추가.
8: - **배운 점**: 시각적 결과물을 생성하는 AI에게는 "예쁘게 만들어라"는 추상적 명령보다 "이 좁은 칸(300x100px) 안에 딱 맞춰라"는 물리적 제약 조건을 수치로 제공하는 것이 품질 향상의 핵심임.
9: 
10: ## [2026-05-09] Bundle Slot의 확장성: 상호 배타적 Foreign Key(Graphic vs Overlay) 설계
11: - **증상**: 기존에는 `bundle_slots`가 정적 그래픽(`graphic_id`)만 참조할 수 있어, AI가 생성한 동적 오버레이(`overlay_id`)를 번들에 포함시키려면 별도의 테이블이 필요하거나 기존 구조를 크게 바꿔야 했음.
12: - **원인 (Root Cause)**: 시스템이 고도화되면서 '정적 자산'과 'AI 생성 자산'이 공존해야 하는 상황 발생.
13: - **해결책**:
14:   - `bundle_slots` 테이블에 `overlay_id` 컬럼을 추가하고, `graphic_id`와 함께 둘 다 nullable로 설정.
15:   - 비즈니스 로직(Bundle Service)에서 두 ID 중 하나만 있어도 유효한 슬롯으로 간주하도록 처리.
16: - **배운 점**: 초기 설계 시 특정 타입에 고착되지 않고, '추상적인 슬롯' 개념으로 접근하여 선택적 FK(Optional Foreign Key)를 허용함으로써 아키텍처의 유연성을 확보할 수 있었음.
17: 
2: ## [2026-05-08] AI 응답 토큰 한계로 인한 JSON 잘림(Truncation) 및 복구 전략
3: - **증상**: 복잡한 방송 오버레이(HTML+CSS+JS+Schema) 생성 시 Gemini 2.5 Flash Lite의 출력 토큰 한계(8192)에 도달하여 JSON이 중간에 끊김. `JSON.parse` 실패로 화면에 아무것도 렌더링되지 않음.
4: - **원인 (Root Cause)**: 생성형 AI 모델은 단일 호출에서 생성할 수 있는 최대 토큰 수가 정해져 있음. 방송 오버레이는 가독성 가이드라인과 타이머 동기화 로직이 포함되어 코드가 길어지는 경향이 있어 한계에 쉽게 도달함.
5: - **해결책**:
6:   - **Truncated JSON Repair 도입**: `JSON.parse` 실패 시 정규식(`/"html"\s*:\s*"/`)을 사용하여 각 필드를 개별 추출.
7:   - **중괄호 스택 분석**: 객체 형태인 `dashboard_schema` 등은 중괄호(`{`, `}`) 짝을 추적하여 잘리지 않은 부분까지만이라도 추출.
8:   - **시스템 프롬프트 압축**: 추론 모델(Kimi K2.6 등)은 내부 reasoning에 토큰을 많이 쓰므로, 프롬프트를 50% 수준으로 압축하여 '생각할 공간' 확보.
9: - **배운 점**: AI 응답이 항상 완전할 것이라고 가정하지 말 것. 특히 코드를 생성하는 서비스에서는 불완전한 결과에서도 핵심 가치(HTML/CSS 등)를 뽑아내는 방어적 파싱(Robust Parsing)이 필수적임.
10: 

## [2026-05-07] SemanticRenderer: getComputedStyle reflow → CSS calc() 기반 Text-Fit
- **증상**: NodeRenderer에서 `getComputedStyle(document.documentElement).getPropertyValue('--cg-font-size-headline_primary')`로 폰트 사이즈를 읽어온 후 `fontSizeStrategy()`에 전달. 렌더링 시마다 강제 reflow 발생.
- **원인 (Root Cause)**: `getComputedStyle`은 브라우저가 현재 계산된 스타일을 반환하기 위해 강제로 reflow를 발생시킴. React render phase에서 호출하면 매 렌더링마다 layout thrashing.
- **해결책**:
  - `fontSizeStrategy`가 CSS 변수 참조 문자열(`var(--cg-font-size-xxx)`)을 인식하여 `calc()`로 감싸서 반환.
  - 예: `fontSizeStrategy(50, "var(--cg-font-size-headline_primary)")` → `"clamp(calc(var(--cg-font-size-headline_primary) * 0.5), calc(var(--cg-font-size-headline_primary) * 0.55), var(--cg-font-size-headline_primary))"`
  - 모든 계산이 CSS 엔진에서 일어나므로 JS reflow 완전 방지.
- **배운 점**: 디자인 토큰(CSS Custom Properties)을 JS에서 계산에 사용해야 할 때는 참조 문자열을 그대로 CSS `calc()`로 전달하여 브라우저가 최적화된 paint frame에서 처리하게 할 것.

## [2026-05-07] Edit tool whitespace encoding 실패와 우회 전략
- **증상**: `render.tsx`에 `</ThemeProvider>` 닫기 태그 삽입 시 Edit tool이 "String to replace not found" 반복 실패. 한국어 주석, 탭, 공백이 섞인 라인에서 whitespace encoding mismatch.
- **원인 (Root Cause)**: Edit tool의 `old_string` 매칭은 바이트 단위 정확 일치를 요구. 파일의 탭/공백 인코딩과 tool에 전달된 문자열의 whitespace 표현이 불일치.
- **해결책**: 파일의 정확한 바이트 표현을 확인한 후 매칭 시도. 여러 번 실패 시 대체 접근법(sed 등) 사용.
- **배운 점**: 한국어+특수문자가 포함된 파일에서 Edit tool 사용 시 whitespace encoding에 특히 주의. 실패가 반복되면 read로 재확인 후 접근.

## [2026-05-05] TanStack Router 파일 구조 재배치 시 중첩 라우팅 및 의존성 오류
- **증상**: `src/routes/dashboard/graphics` 디렉토리를 `src/routes/dashboard/studio/graphics`로 한 단계 더 깊숙이 이동시킨 후 `npm run build` 시 CSS 및 다른 컴포넌트의 상대 경로 참조를 찾을 수 없다는 빌드 에러(`Could not resolve "../../dashboard-common.css"`) 발생.
- **원인 (Root Cause)**: TanStack Router는 폴더 구조가 곧 URL 경로와 마운트 계층을 결정함. 라우트 컴포넌트 파일의 깊이가 깊어지면 내부에서 참조하던 상대 경로(`../`)들의 뎁스가 틀어짐.
- **해결책**:
  - `index.lazy.tsx` 등의 내부에서 렌더링되던 파일들의 `import "../dashboard-common.css"` 구문을 `import "../../dashboard-common.css"`로 수정.
  - `<Link to="/dashboard/graphics/...">`와 같은 하드코딩된 내부 라우팅 경로를 `/dashboard/studio/graphics/...`로 모두 업데이트하여 TanStack Router의 파라미터 매칭 타입 에러를 수정함.
- **배운 점**:
  - 라우터 폴더를 이동하는 대규모 리팩토링 시, 단순히 파일만 이동하는 것이 아니라 **상대 경로 임포트(Relative Import)와 라우팅 링크 참조를 모두 업데이트**해야 함.
  - 이러한 문제를 근본적으로 방지하려면 프로젝트 설정에서 `@/`와 같은 절대 경로 별칭(Path Alias)을 최대한 활용하여 상대 경로 지옥(Relative Path Hell)을 회피하는 것이 좋음.

## [2026-05-13] React JSX Adjacent Elements Error — 불필요한 닫는 태그로 인한 구문 오류
- **증상**: Vite 개발 서버에서  또는  에러 발생하며 화면 렌더링 중단.
- **원인 (Root Cause)**: `AdminWorkspacesTab.tsx`의 초대 모달 구조 수정 중 `</div>` 태그의 개수가 열린 태그와 맞지 않게(중복 또는 누락) 삽입됨. 특히 JSX 파서가 malformed 상태에서 `/` 문자를 만나면 이를 정규표현식의 시작으로 오인하여 `Unterminated regular expression`이라는 엉뚱한 에러를 뱉는 경우가 있음.
- **해결책**: `cat -A` 등을 통해 실제 탭(`^I`) 개수와 태그 짝을 1:1로 대조하여 전수 교정.
- **배운 점**: 
  1. 에러 메시지가 `regular expression`이라 하더라도, JSX 파일에서는 태그 밸런스가 깨졌을 때 발생하는 '파서 혼란'일 확률이 높음.
  2. 복잡한 중첩 구조에서는 들여쓰기(Indent)를 맹신하지 말고 실제 태그의 개수를 수동으로 카운트하거나 전용 린터를 활용해 검증해야 함.

## [2026-05-13] 보안 감사: TanStack Supply Chain Attack 대응 및 검증
- **증상**: 2026-05-11 발생한 `@tanstack/*` npm 패키지 공급망 해킹 사건으로 인한 클라우드 자격 증명 탈취 우려 발생.
- **원인 (Root Cause)**: 공격자가 `pull_request_target` 워크플로우의 취약점을 이용해 캐시를 오염시키고 OIDC 토큰을 탈취하여 악성 버전을 레지스트리에 무단 배포함. (악성 페이로드: `router_init.js`, 연결 매개체: `@tanstack/setup`)
- **해결책**:
  1. `npm list @tanstack/setup` 및 `find node_modules -name "router_init.js"` 명령어를 통해 악성 패키지와 페이로드가 시스템에 존재하지 않음을 확인.
  2. `package-lock.json` 검사 결과 감염된 버전(`1.161.x`)을 피해 이미 패치된 상위 버전(`1.169.1`)을 사용 중임을 검증.
  3. `npm audit`을 통해 공식적인 위험 요소가 없음을 교차 검증.
- **배운 점**: 
  1. 오픈소스 생태계에서는 유명 패키지라도 공급망 공격의 대상이 될 수 있으므로, 항상 의존성 버전을 고정하고 주기적으로 취약점을 스캔해야 함.
  2. 유사 사고 예방을 위해 로컬 `~/.npmrc`에 `min-release-age`(최소 릴리즈 대기 시간) 설정 및 `ignore-scripts` 옵션 도입을 고려할 수 있음.
