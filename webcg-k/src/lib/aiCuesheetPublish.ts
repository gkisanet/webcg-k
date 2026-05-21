import type { SceneContent, SceneGraphicState } from "./aiCuesheetTypes";

export interface AiCuesheetPublishReadiness {
  totalScenes: number;
  readyScenes: number;
  canPublishAll: boolean;
  requiresPartialConfirmation: boolean;
  missingScenes: SceneContent[];
  failedScenes: SceneContent[];
}

export function hasGeneratedGraphic(state: SceneGraphicState | undefined): state is SceneGraphicState & { generatedHtml: string } {
  return state?.status === "done" && Boolean(state.generatedHtml);
}

function isPublishedGraphicState(state: SceneGraphicState | undefined): state is SceneGraphicState & { overlayTemplateId: string } {
  return state?.status === "done" && Boolean(state.overlayTemplateId);
}

export function analyzeAiCuesheetPublishReadiness(
  scenes: SceneContent[],
  graphicStates: SceneGraphicState[],
): AiCuesheetPublishReadiness {
  const missingScenes: SceneContent[] = [];
  const failedScenes: SceneContent[] = [];
  let readyScenes = 0;

  scenes.forEach((scene, sceneIndex) => {
    const state = graphicStates[sceneIndex];
    if (hasGeneratedGraphic(state)) {
      readyScenes += 1;
      return;
    }
    missingScenes.push(scene);
    if (state?.status === "error") failedScenes.push(scene);
  });

  return {
    totalScenes: scenes.length,
    readyScenes,
    canPublishAll: scenes.length > 0 && readyScenes === scenes.length,
    requiresPartialConfirmation: readyScenes > 0 && readyScenes < scenes.length,
    missingScenes,
    failedScenes,
  };
}

export function buildPartialPublishMessage(readiness: AiCuesheetPublishReadiness): string {
  const missing = readiness.missingScenes
    .map((scene) => `Scene ${scene.order}: ${scene.trigger}`)
    .join("\n");

  return [
    `${readiness.readyScenes}/${readiness.totalScenes}개 장면만 런다운에 발행됩니다.`,
    "아래 장면은 생성된 HTML 방송 그래픽이 없어 제외됩니다.",
    missing,
    "부분 발행을 계속할까요?",
  ].filter(Boolean).join("\n\n");
}

export function buildRundownOverlayInserts({
  scenes,
  graphicStates,
  rundownId,
  programTitle,
}: {
  scenes: SceneContent[];
  graphicStates: SceneGraphicState[];
  rundownId: string;
  programTitle: string;
}) {
  let itemOrder = 1;

  return scenes.flatMap((scene, sceneIndex) => {
    const state = graphicStates[sceneIndex];
    if (!isPublishedGraphicState(state)) return [];

    return [{
      rundown_id: rundownId,
      source_type: "overlay",
      source_id: state.overlayTemplateId,
      source_name: scene.trigger || `Scene ${scene.order}`,
      data: { scene_data: scene, program_title: programTitle },
      item_order: itemOrder++,
      duration: scene.duration ?? 15,
    }];
  });
}
