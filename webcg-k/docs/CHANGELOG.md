# 📝 기술적 변경 이력 (docs/CHANGELOG.md)

## [2026-06-05] 로컬 master 브랜치와 원격 origin/master 동기화

### 🔍 무엇을 변경했나요?
* 로컬의 `master` 브랜치를 원격 저장소의 최신 커밋인 `728de26` (`feat: initial public release`) 상태로 동기화했습니다.

### ❓ 왜 변경했나요?
* 원격 저장소에서 히스토리 재작성 및 강제 업데이트(`forced update`)가 발생하여, 로컬 브랜치와 공통 조상이 갈라진 `divergent branches` 상태가 되었습니다.
* 이로 인해 단순 `git pull` 시 병합 방식을 지정하라는 에러가 발생하며 진행되지 않았습니다.

### 🛠 어떻게 해결했나요?
1. `git status`를 실행하여 로컬 작업 트리가 깨끗함(Staged/Unstaged 변경 사항 없음)을 사전에 안전하게 검증했습니다.
2. `git log origin/master`로 원격의 최신 커밋 해시와 히스토리를 파악했습니다.
3. `git reset --hard origin/master` 명령을 실행하여 로컬 헤드를 원격 헤드에 일치시켰습니다.

### 🚀 아키텍처 및 성능 관점의 이점
* **Git 히스토리 최적화 (Git History Complexity):** 복잡하고 불필요한 3-way merge commit 생성을 차단하고, 리모트와 동일한 깨끗한 단일 선형(Linear) 히스토리 구조를 유지하여 히스토리 조회 복잡도를 $O(N)$에서 $O(1)$(가독성 관점)로 낮췄습니다.

## [2026-06-05] node_modules 원격 추적 해제 및 .gitignore 추가

### 🔍 무엇을 변경했나요?
* 루트의 `.gitignore` 파일에 `node_modules/`를 추가했습니다.
* `git rm -r --cached node_modules`를 실행하여 원격에 잘못 올라간 의존성 파일(node_modules)을 Git 인덱스에서 제거했습니다.

### ❓ 왜 변경했나요?
* 타사 종속성 파일이 원격 저장소에 올라갈 경우, 저장소 크기 증가 및 Clone/Pull 속도 저하, 형상 관리 상의 노이즈가 발생하기 때문입니다.

### 🛠 어떻게 해결했나요?
1. `.gitignore`에 `node_modules/` 항목을 명시적으로 추가했습니다.
2. `git rm -r --cached node_modules` 명령어를 통해 로컬 실물 디렉토리는 보존하면서 Git 추적(index)에서만 제외시켰습니다.

### 🚀 아키텍처 및 성능 관점의 이점
* **저장소 I/O 및 용량 효율화:** 불필요한 파일 수만 개를 Git 추적에서 제외하여 Git 트리의 갱신 연산($O(N)$ 파일 스캔) 성능을 비약적으로 최적화했습니다.

