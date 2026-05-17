# 📚 작업 및 학습 목표 관리 (docs/TASKS.md)

## 🔄 현재 작업 진행 상황

### 🟢 Doing
- [ ] **Dual-Layer Canvas 기법 검토 및 프로토타입 작성**
  *   🎯 **학습 목표 (Learning Objective)**: 상호작용 오버레이와 정적 드로잉 레이어를 완벽히 물리적으로 격리하여, DOM Paint 횟수를 극적으로 줄이는 법을 학습한다.

---

### 🟡 Todo (Proposed Future Improvements)
- [ ] **Unified Coordinate Transform (아핀 공간 분리) 구현**
  *   🎯 **학습 목표 (Learning Objective)**: 2D 좌표 변환 행렬 및 줌 배율에 대응하는 마우스 히트 매핑 수식을 완벽히 이해하고, UI 스냅 로직에 적용한다.

---

### 🔴 Done
- [x] **Excalidraw 핵심 차별점 및 렌더러 아키텍처 트레이드오프 분석 완료**
  *   🎯 **학습 목표 (Learning Objective)**: Canvas 2D API 렌더링과 SVG DOM 렌더링의 성능 및 기능적 트레이드오프를 비교 분석하고, 방송 신호에 적합한 방향성을 수립한다.
- [x] **65개 분산 마이그레이션 파일 단일 스쿼시(Squash) 완료**
  *   🎯 **학습 목표 (Learning Objective)**: 데이터베이스 버전 관리 체계에서 마이그레이션 파편화를 방지하고, 초기 구동 성능을 최적화하기 위해 Supabase CLI를 활용해 스키마를 단일 파일로 병합하는 실무 기법을 터득한다.
- [x] **시드 스크립트(seed.sql)와의 Search Path 충돌 디버깅 및 해결**
  *   🎯 **학습 목표 (Learning Objective)**: pg_dump 시 발생하는 `search_path = ''` 세션 격리 부작용을 이해하고, `RESET search_path;` 명령을 활용하여 후속 시딩 배치 처리와의 충돌을 우아하게 복구하는 법을 학습한다.
