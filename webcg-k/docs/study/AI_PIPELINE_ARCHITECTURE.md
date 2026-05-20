# 🤖 WebCG-K 인앱 AI 코드 주입 파이프라인 (Architecture Deep Dive)

> 에디터 내부에서 AI가 코드를 생성하고 각 탭(HTML/CSS/JS/Schema)에 마법처럼 자동으로 주입되는 원리와 구조를 설명합니다.

---

## 1. 뼈대 잡기 (파인만 기법 비유)

AI에게 **"짜장면 세트 만들어줘"**라고 배달 주문을 한다고 상상해 보세요.
그냥 "알아서 갖다줘"라고 하면 요리사가 그릇에 막 담아서 보내기 때문에, 우리가 직접 면, 소스, 단무지를 분류해서 상을 차려야 합니다. (이게 외부 ChatGPT에서 복붙하던 방식입니다.)

하지만 WebCG-K 인앱 AI는 **"정확하게 5칸으로 나뉜 식판(JSON)에 담아서 줘!"**라고 아주 강력한 **'시스템 프롬프트(주문서)'**를 함께 보냅니다.
AI가 식판의 각 칸에 HTML, CSS, JS, Schema를 예쁘게 담아서 보내주면, WebCG-K는 그 식판을 통째로 받아서 **미리 준비된 에디터의 5개 탭에 그대로 부어버리는(State Injection) 구조**입니다.

---

## 2. 파이프라인 작동 원리 (4단계)

### Step 1: 강력한 시스템 프롬프트 (가이드라인 주입)
코드의 뇌 역할을 하는 `src/services/aiOverlayService.ts` 파일을 보면, AI에게 몰래 보내는 **엄격한 규칙(OVERLAY_SYSTEM_PROMPT)**이 숨어 있습니다.

```javascript
// aiOverlayService.ts 내부의 프롬프트 중 일부
"당신은 WebCG-K 방송 오버레이 코드 생성기입니다...
반드시 아래 JSON 형식으로 응답하세요. 다른 설명 텍스트는 절대 쓰지 말고 오직 JSON만 출력하세요:
{
  \"html\": \"<div id='overlay'>...</div>\",
  \"css\": \"#overlay { ... }\",
  \"js\": \"webcgk.onData(...) { ... }\",
  \"dashboard_schema\": { \"properties\": { ... } },
  \"replicant_defaults\": { ... }
}"
```

### Step 2: 사용자 맥락(Context) 추가
사용자가 "테니스 스코어보드 만들어줘"라고 치면, WebCG-K는 단순히 그 말만 전달하지 않습니다.
사용자가 화면의 어느 영역(Zone)을 선택했는지의 **좌표 상태(State)**도 함께 묶어서 보냅니다.

```text
## 요청
테니스 스코어보드 만들어줘

## 배치 영역 (자동 추가됨)
- Zone: "우측 하단 배너"
- 위치: x=1400px, y=800px
- 크기: 400×200px
```

### Step 3: AI의 정형화된 JSON 응답 (Structured Output)
AI는 위 지시를 받고, 잡다한 인사말("네, 만들어드리겠습니다!")을 모두 생략한 채 오직 컴퓨터가 읽을 수 있는 **순수 JSON 포맷**으로만 코드를 뱉어냅니다.

```json
{
  "html": "<div id='overlay'>테니스</div>",
  "css": "body { background: transparent; }",
  "js": "webcgk.onData(...)",
  "dashboard_schema": { "properties": { "score": { "type": "number" } } }
}
```

### Step 4: UI 상태에 자동 바인딩 (State Injection)
응답이 도착하면 `PluginEditor.tsx`는 이 JSON 식판을 쪼개서 React의 상태(State) 변수에 꽂아 넣습니다.

```javascript
// PluginEditor.tsx 내부 로직
const result = await generateOverlayCode(aiPrompt, zoneInfo);

// 1. HTML, CSS, JS 탭에 주입
setCode({
  html: result.html,
  css: result.css,
  js: result.js
});

// 2. 스키마 에디터와 대시보드에 주입
handleSchemaChange(result.dashboard_schema);
setTestData(result.replicant_defaults);
```

이 코드가 실행되는 순간, 화면의 모든 에디터와 대시보드 UI가 새로운 상태를 감지하고 0.1초 만에 **완벽한 CG와 조종판으로 변신(리렌더링)**하게 됩니다.

---

## 3. 핵심 기술 (Jargon)
- **Prompt Engineering (System Prompt)**: AI의 페르소나와 출력 형식을 강제하는 프롬프트 제어 기술.
- **Structured Output (JSON Mode)**: AI 모델에게 응답 형식을 JSON 객체로 강제하여, 프론트엔드에서 파싱 오류 없이 직렬화/역직렬화(Serialization) 할 수 있게 하는 기법.
- **State Synchronization**: 하나의 API 응답 객체를 분해하여, 여러 개의 독립된 React 컴포넌트(Monaco Editor, Schema Editor, Iframe Preview)의 상태를 일관성 있게 동시 업데이트하는 패턴.
