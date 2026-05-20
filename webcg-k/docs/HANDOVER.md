# 🤝 HANDOVER (작업 인계 문서)

## 📅 마지막 작업 일시
- 2026-05-13 (KST)

## 📝 최근 완료 작업 요약

### Explicit Realtime Broadcast Delivery Policy (2026-05-18)
- Supabase Realtime `channel.send()`가 채널 미가입 상태에서 암묵적으로 REST fallback하며 내던 deprecation warning을 제거했습니다.
- `sendRealtimeBroadcast()`에서 joined WebSocket과 명시적 `httpSend()` fallback을 분리했습니다.
- playout/stroke/replace/command/ACK는 전달 안정성을 위해 `httpSend()` fallback을 허용하고, cursor presence와 heartbeat는 고빈도 이벤트라 fallback 없이 건너뜁니다.
- `realtimeBroadcast.test.ts`로 send/fallback/no-fallback/error 정책을 회귀 테스트에 추가했습니다.
- 로컬 Supabase DB에서 `whiteboards.document_state` 컬럼 존재를 확인하고 PostgREST schema cache reload를 수행했습니다.
- 검증: annotation/broadcast source 테스트, WSL Linux Node 빌드, Realtime/판서/render 관련 타입 오류 필터 통과.

### Annotation Drawing Input Recovery (2026-05-18)
- `document_state` 컬럼 또는 Supabase schema cache가 아직 준비되지 않아도 판서 에디터가 입력 가능한 상태로 열리도록 fallback을 추가했습니다.
- fallback 모드에서는 그리기는 가능하지만 DB 영속 저장은 제한될 수 있습니다. `20260518000002_annotation_document_state.sql` 적용이 근본 해결입니다.
- pen/touch 장치가 pointer move 중 `buttons=0`을 보고해도 stroke가 이어지도록 입력 정책을 보강했습니다.
- 검증: annotation/broadcast source 테스트, WSL Linux Node 빌드, 판서/render 관련 타입 오류 필터 통과.

### Broadcast Annotation Cursor & Live Render Background (2026-05-18)
- 판서 편집 화면에 `/render?hideAnnotation=1&passive=1` 배경 iframe을 연결했습니다.
- 배경 iframe은 실제 방송 그래픽(Broadcast Graphics) 합성 화면을 보여주되, 판서 레이어는 숨기고 ACK/heartbeat/render_state는 보내지 않습니다.
- 실제 render에는 펜 모양 cursor presence를 표시하고 1.5초 TTL 후 자동 숨김 처리합니다.
- 검증: annotation/broadcast source 테스트와 WSL Linux Node 빌드 통과.

### License-clean Broadcast Annotation Layer (2026-05-18)
- `@tldraw/tldraw`, `y-webrtc`, `yjs` 제거.
- `perfect-freehand` 기반 자체 stroke engine과 `AnnotationDocument` JSON 모델 도입.
- 판서는 독립 흰 보드가 아니라 기존 타임라인 방송 그래픽(Broadcast Graphics) 위에 투명 합성됩니다. 기본 stroke 색상은 흰색입니다.
- 검증: annotation/broadcast source 테스트와 WSL Linux Node 빌드 통과.

### Whiteboard PVW/PGM Playout Fix (2026-05-18)
- 화이트보드 탭을 `OFF / PVW / PGM` 스위처로 개편.
- PVW/PGM 모니터가 `RendererWhiteboard`로 `sourceType: whiteboard`를 직접 렌더링.
- `useTldrawWebRTC` 초기 스냅샷 hydrate 누락을 수정해 기존 그림이 빈 화면으로 보이는 문제 해결.
- 검증: 정규화 유틸 테스트 및 WSL Linux Node 빌드 통과.

### Broadcast Source Contract 정규화 완료 (2026-05-18)
- PVW 오버레이 런타임 격리 정책 적용: PGM으로 TAKE된 오버레이는 PVW에서 숨기도록 `previewOverlays`를 `preview && !is_active`로 좁힘.
- 장기 SDK 설계 기록: root `docs/OVERLAY_SDK_STATE_SYNC_DESIGN.md`에 `takeAt`, `takeSeq`, clock offset, lifecycle event, snapshot handoff 방향 정리.
- 오버레이 런다운 아이템의 `sourceData` 계약을 `normalizeBroadcastSourceData()`로 수렴.
- PVW, PGM, `render.tsx`가 `BroadcastHtmlOverlay`를 공유하도록 연결.
- 런다운 상세 미리보기와 `rundownRepository`를 `source_code` 기준으로 보강.
- ACK/Heartbeat 복구 루프 1차 완성: 같은 broadcast topic에서 heartbeat를 수신하고 ACK 누락 시 최대 2회 재전송.
- 검증: 정규화 유틸 테스트 및 WSL Linux Node 빌드 통과.

### Architecture Deepening (6 Candidates, commit `b17950f`)
route component에서 data access를 분리하고 god module을 분해. 6개 신규 module 생성, 2개 ghost route 삭제.

| # | Candidate | 결과 |
|---|-----------|------|
| 1 | `RundownRepository` (rundowns + items + broadcast CRUD) | `$rundownId.tsx` 1713→1478줄, 신규 314줄 |
| 2 | `useSessionController` + `useCuesheetSync` hooks | `$sessionId.tsx` 1279→923줄, hooks 359줄 |
| 3 | `graphicService` (graphics CRUD + AI 좌표 변환) | `graphics/index.lazy.tsx` 1324→1250줄, 신규 124줄 |
| 4 | `useOverlayStore` 분해 (timerUtils 추출) | 572→538줄, `timerUtils.ts` 32줄 |
| 5 | `gridTemplateService` (grid_templates CRUD) | `graphics/index.lazy.tsx` 최종 1250줄, 신규 62줄 |
| 6 | Dead code 정리 | `ai-theme.lazy.tsx`(1042줄), `ai-overlay.lazy.tsx`(268줄) 삭제 |

**신규 모듈 (6개):**
```
src/services/rundownRepository.ts   — rundown + broadcast session data seam
src/services/graphicService.ts      — graphics CRUD + AI zone offset transform
src/services/gridTemplateService.ts  — grid_templates CRUD seam
src/hooks/useSessionController.ts    — session loading + broadcast/heartbeat channels
src/hooks/useCuesheetSync.ts         — rundown_items postgres_changes 구독
src/lib/timerUtils.ts               — computeRemaining/isTimerReplicant 순수함수
```

## 🚀 현재 상태 (Status)

### 완료 확인된 작업
- [x] 라이선스 안전한 방송 판서 레이어 구축 (`perfect-freehand` + JSON document)
- [x] PVW/PGM/render 공통 투명 SVG 판서 합성 경로 구현
- [x] AI 큐시트 v4 (세션 영속화 + 4단계 위자드)
- [x] WAAPI Animation Phase 3 (`5dc9b02` — element.animate() + onfinish)
- [x] Graphic Tagging (`graphic-tagging.lazy.tsx` 604줄)
- [x] CQRS is_active/render_state 분리 (`dd2ba5d`)
- [x] Architecture deepening 6 candidates (`b17950f`)

### 미해결 이슈
- `database.types.ts` `theme_templates` 테이블 타입 누락 → `themeService.ts` TS2769 (4건). `supabase gen types` 필요.
- WAAPI 런타임 동작 검증은 브라우저에서 미확인 (코드는 완료).
- `$rundownId.tsx`의 `loadLibraryData`는 다른 필터/컬럼 조합으로 인해 graphicService와 분리 유지.
- PostCSS `__root.tsx:72` externalize 경고 — `cssAstUtils.ts` → `PluginEditor` import chain. `@adobe/css-tools` 교체 검토.

## 🎯 다음 작업 추천 (Next Steps)

1. **오버레이 SDK 시간/상태 동기화**: `takeAt` 기준 deterministic timer와 `onTake` lifecycle을 `webcgk` runtime에 추가.
1. **판서 레이어 브라우저 테스트**: 대시보드에서 흰색 판서를 그리고 컨트롤러 PVW/PGM 및 `/render`에서 기존 방송 그래픽 위에 합성되는지 확인. 먼저 `20260518000002_annotation_document_state.sql` 적용 여부를 확인해 fallback 모드와 영속 저장 모드를 구분합니다.
2. **WAAPI 런타임 검증**: `npm run dev` → CG 송출 → enter/exit/loop 애니메이션 Chrome DevTools에서 확인
3. **database.types.ts 재생성**: `supabase gen types` → theme_templates 타입 포함
4. **PostCSS 브라우저 경고 해결**: `cssAstUtils.ts`의 postcss를 `@adobe/css-tools`로 교체 (이미 `e6fa19b`에서 시도된 패턴)

## 💡 현재 세션 핵심 통찰
- **방송 환경의 특수성을 고려한 실시간 통신**: 판서는 stroke 종료 시 snapshot을 저장하고 broadcast로 즉시 반영합니다. 고빈도 포인터 스트림 전체를 동기화하기보다 송출에 필요한 stroke 단위 문서를 안정적으로 공유합니다.
- **Seam 패턴 확립**: 6개 module이 각 테이블의 단일 데이터 접근 지점 제공. DB 스키마 변경 시 해당 service 파일만 수정.
- **Hook vs Service**: 실시간 구독이 필요한 경우 hook(`useSessionController`), 순수 CRUD는 평면 함수(`rundownRepository`).
- **CQRS 채널 무결성**: Controller(Route)는 `is_active`만, Renderer는 `render_state`만 쓰는 경계가 import 레벨에서도 확인됨.
