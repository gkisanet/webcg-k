# Graphify × Antigravity 통합 가이드

> 이 문서는 Antigravity AI 어시스턴트가 graphify 지식 그래프를 활용하도록 설정하는 방법을 안내합니다.

## 1단계: Global Rules에 추가 (필수)

Antigravity 설정 → Global Rules에 아래 내용을 추가하세요:

```
### 🗺 5. 코드베이스 탐색 — Graphify 지식 그래프

- **`graphify-out/` 폴더**에 프로젝트의 코드 지식 그래프가 있다.
- **아키텍처 질문, 모듈 간 관계 탐색, 새 기능 설계 시**: 코드를 grep하기 전에 `graphify-out/GRAPH_REPORT.md`의 **상위 200줄**(God Nodes, Surprising Connections, Hyperedges, 주요 Community 0~14)을 먼저 읽는다.
- **Why?**: God Nodes는 가장 연결이 많은 핵심 함수/개념이고, Community는 관련 코드의 자연적 클러스터다. 이를 먼저 파악하면 grep 횟수를 줄이고 정확도를 높인다.
- **작업 완료 후**: 코드 파일을 수정했다면 `graphify update .` 실행을 사용자에게 제안한다 (AST-only, API 비용 0).
```

## 2단계: graphify 그래프 업데이트 (선택)

현재 그래프는 2026-04-18 기준이며 fathom/ 코드가 포함되어 있지 않습니다.
graphify CLI가 설치되어 있지 않으므로, 이전에 사용하던 환경에서 아래 명령을 실행하세요:

```bash
cd /home/genk/2026-study/2026.WebCg-K
graphify update .
```

> ⚠️ `.graphify_python` 파일이 `/home/genk/topProject/` 경로를 참조하고 있습니다.
> 현재 workspace는 `/home/genk/2026-study/`이므로, venv 경로를 재설정해야 할 수 있습니다.

## 3단계: KI 자동 참조 확인 (완료)

KI(Knowledge Item)가 이미 등록되었습니다:
- 경로: `knowledge/webcg_k_graphify_codemap/`
- 내용: GRAPH_REPORT.md의 핵심 요약 (~80줄)
- 효과: 다음 대화부터 KI 요약을 통해 코드 맵을 자동 참조합니다

## 동작 원리

```
[대화 시작]
  ↓
[KI 요약 자동 로드] ← ~80줄 (God Nodes + 핵심 Community)
  ↓
[아키텍처 질문 수신]
  ↓
[GRAPH_REPORT.md 상위 200줄 읽기] ← global rules 지시
  ↓
[관련 Community 식별]
  ↓
[해당 Community의 파일만 grep/view] ← 탐색 범위 축소
```
