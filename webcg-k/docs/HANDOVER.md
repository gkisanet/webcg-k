# 🤝 환경 전환 및 다음 작업 인수인계 (docs/HANDOVER.md)

## 📌 마지막 작업 상태 (Current Status)
* **Git 상태:** 루트 `.gitignore`에 `node_modules/` 등록 및 기존 `node_modules` 캐시 제거 커밋 완료.
* **작업 트리:** 수정사항 반영 후 push 완료 상태.

## 📋 다음에 해야 할 일 (Next Steps)
1. WebCG-K 최신 코드 분석 및 기능 개발.

---

## 💡 뇌 워밍업: 오늘 배운 핵심 개념 요약 (TL;DR)
> [!IMPORTANT]
> **Git Tracking & .gitignore & cached rm**
> * **핵심 문제:** 파일이 이미 Git에 커밋되어 추적(tracked)되는 상태라면, 뒤늦게 `.gitignore`에 규칙을 추가해도 Git은 이를 무시하고 계속 변경사항으로 추적합니다.
> * **해결책:** `git rm -r --cached <dir>`를 통해 로컬의 실물 디렉토리 및 파일은 그대로 두고 Git Index(캐시)에서만 경로를 제거해 줘야 합니다.
> * **이점:** 이 패턴을 사용하면 타사 디펜던시나 로컬 빌드 파일 등을 저장소 유실 없이 형상 관리 대상에서 안전하게 제외할 수 있습니다.
