import type { DashboardSchema } from "../../../lib/overlayTypes";

export const DEFAULT_HTML = `<div id="overlay">
  <div class="scoreboard">
    <div class="team home">
      <span class="team-name" data-cg-bind="homeName">HOME</span>
      <span class="score" data-cg-bind="homeScore">0</span>
    </div>
    <div class="separator">:</div>
    <div class="team away">
      <span class="score" data-cg-bind="awayScore">0</span>
      <span class="team-name" data-cg-bind="awayName">AWAY</span>
    </div>
  </div>
</div>`;

export const DEFAULT_CSS = `/* 스코어보드 기본 스타일 */
#overlay {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 40px;
  font-family: 'Inter', sans-serif;
}

.scoreboard {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  padding: 12px 32px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.1);
}

.team {
  display: flex;
  align-items: center;
  gap: 12px;
}

.team-name {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.score {
  font-size: 48px;
  font-weight: 800;
  color: #fff;
  min-width: 60px;
  text-align: center;
}

.separator {
  font-size: 36px;
  font-weight: 300;
  color: rgba(255,255,255,0.4);
}`;

export const DEFAULT_JS = `// WebCG-K Declarative Binding
// 데이터 바인딩은 HTML의 data-cg-bind 속성이 자동 처리합니다.
// JS는 애니메이션, 타이머, 상태머신 같은 고급 로직에만 사용하세요.

webcgk.onShow(function() {
  var overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.style.animation = "fadeInUp 0.5s ease-out forwards";
  }
});

webcgk.onHide(function() {
  var overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.style.animation = "fadeOutDown 0.5s ease-in forwards";
  }
});`;

export const DEFAULT_SCHEMA: DashboardSchema = {
  properties: {
    homeName: { type: "string", title: "홈팀 이름", default: "HOME" },
    homeScore: { type: "number", title: "홈팀 점수", default: 0, min: 0, max: 99 },
    awayName: { type: "string", title: "원정팀 이름", default: "AWAY" },
    awayScore: { type: "number", title: "원정팀 점수", default: 0, min: 0, max: 99 },
  },
};
