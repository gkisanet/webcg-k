# 🌟 트러블슈팅 및 오답 노트 (docs/LESSONS.md)

## 🚨 Git Pull 에러: Divergent Branches 및 forced update 감지

### 1. 증상 (Symptom)
* `git pull` 실행 시 아래와 같은 오류 메시지와 함께 병합 프로세스가 강제 중단됨.
  ```text
  hint: You have divergent branches and need to specify how to reconcile them.
  fatal: Need to specify how to reconcile divergent branches.
  ```
* 원격 브랜치 이력을 확인해 보니 `+ 4c972c7...728de26 master -> origin/master (forced update)` 처럼 원격 히스토리가 강제로 리프레시(force push)된 상태였음.

---

### 2. 원인 (Root Cause)
* 원격 저장소(`origin/master`)의 히스토리가 덮어쓰여져, 로컬 브랜치의 최신 커밋(`4c972c7`)과 공통 분기점이 끊어지고(Divergent) 전혀 다른 이력 흐름을 가지게 되었습니다.
* Git은 이 두 독립된 히스토리를 어떻게 병합(Merge/Rebase)할지 알지 못해 작업을 거부한 것입니다.

---

### 3. 해결책 (Resolution)
1. 로컬에 저장하지 않은 변경사항이 있는지 `git status`로 교차 확인하였습니다.
   * 결과: untracked 디렉토리만 존재하고, 수정 중인 파일은 없음.
2. 로컬의 이전 히스토리를 원격에 맞춰 완전히 리팩토링하기 위해 아래 명령어를 실행하여 원격 origin/master로 강제 이동시켰습니다.
   ```bash
   git reset --hard origin/master
   ```
3. `git log`와 `git status`로 로컬이 최신 원격 커밋(`728de26`)과 완벽히 동기화된 것을 검증하였습니다.

---

### 4. 배운 점 (Key Takeaways)
* 원격 저장소가 강제 업데이트되었을 때는 일반적인 `git pull`이 실패합니다.
* 이때 무턱대고 merge/rebase를 설정하여 덮어쓰는 것보다, 로컬의 변경 유실 위험을 먼저 진단(`git status`)한 후 `reset --hard`를 통해 원격 브랜치의 원천 소스(Single Source of Truth)로 깨끗하게 맞추는 것이 불필요한 Git 충돌을 막는 가장 효율적인 의사결정임을 배울 수 있었습니다.

---

## 🚨 Git: .gitignore를 무시하고 node_modules가 원격 저장소에 커밋되어 올라가는 문제

### 1. 증상 (Symptom)
* `.gitignore` 파일이 프로젝트 내에 존재함에도 불구하고, `node_modules` 디렉토리와 하위 패키지 소스 파일들이 Git 추적(Tracked) 상태로 남아 원격 저장소에 업로드되어 있음.

---

### 2. 원인 (Root Cause)
1. 루트 디렉토리 `.gitignore` 파일에 `node_modules/` 규칙이 누락되어 있었음.
2. 특정 파일이나 디렉토리가 `.gitignore`에 등록되기 전에 이미 Git 인덱스에 추가(`git add`)되어 추적(tracked)이 시작되었기 때문. Git은 이미 추적 대상이 된 파일에 대해서는 `.gitignore` 설정을 무시함.

---

### 3. 해결책 (Resolution)
1. 루트 `.gitignore` 파일에 `node_modules/` 항목을 추가하여 형상 관리에서 제외할 규칙을 셋업함.
2. 로컬 파일 시스템 상의 물리적인 `node_modules` 폴더와 설치된 패키지는 그대로 유지하면서, Git 추적 이력에서만 안전하게 제외하기 위해 캐시 제거 옵션(`--cached`)을 사용하여 인덱스에서 제거함.
   ```bash
   git rm -r --cached node_modules
   ```
3. 변경된 `.gitignore`와 인덱스 제거 내역을 커밋하고 원격지에 푸시함.

---

### 4. 배운 점 (Key Takeaways)
* `.gitignore`는 '아직 추적되지 않은 파일(untracked files)'에만 적용된다는 것을 배움.
* 이미 추적 중인 파일을 무시하기 위해서는 단순히 `.gitignore`에 추가하는 것뿐만 아니라, `git rm --cached` 처리를 병행하여 명시적으로 Git 인덱스의 추적 대상에서 걷어내는 과정이 필수적임을 학습함.

