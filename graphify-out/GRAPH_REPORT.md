# Graph Report - webcg-k  (2026-05-21)

## Corpus Check
- 289 files · ~428,880 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1104 nodes · 1604 edges · 111 communities (104 shown, 7 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 110 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7120393e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 52|Community 52]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 32 edges
2. `cn()` - 13 edges
3. `callAI()` - 13 edges
4. `buildPluginSrcdoc()` - 12 edges
5. `Input()` - 11 edges
6. `sendRealtimeBroadcast()` - 10 edges
7. `fetchDataByType()` - 9 edges
8. `isRecord()` - 8 edges
9. `buildOverlayReplicantData()` - 8 edges
10. `normalizeBroadcastSourceData()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `handleJsonParsed()` --calls--> `parseAiCuesheetJson()`  [INFERRED]
  webcg-k/src/routes/dashboard/ai-cuesheet.lazy.tsx → webcg-k/src/services/aiCuesheetService.ts
- `buildPreviewSrcdoc()` --calls--> `buildPluginSrcdoc()`  [INFERRED]
  webcg-k/src/routes/dashboard/rundowns/$rundownId.tsx → webcg-k/src/lib/webcgkSrcdoc.ts
- `triggerPreviewShow()` --calls--> `buildOverlayReplicantData()`  [INFERRED]
  webcg-k/src/routes/dashboard/rundowns/$rundownId.tsx → webcg-k/src/lib/rundownOverlayData.ts
- `handleSvgGenerate()` --calls--> `generateSvg()`  [INFERRED]
  webcg-k/src/routes/dashboard/assets/images/index.lazy.tsx → webcg-k/src/services/aiSvgService.ts
- `handleCreate()` --calls--> `createBundle()`  [INFERRED]
  webcg-k/src/routes/dashboard/studio/bundles/index.tsx → webcg-k/src/services/bundleService.ts

## Communities (111 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (50): createInitialState(), wizardReducer(), handleGenerateCuesheet(), handleJsonParsed(), clearLocalWizardSnapshot(), getRestorableNewSessionSnapshot(), readLocalWizardSnapshot(), writeLocalWizardSnapshot() (+42 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (31): AiCharacterLayer(), getBaseUrl(), getSessionRendererUrl(), handleBroadcastClick(), tick(), useClipboard(), useKeyboardNavigation(), useOverlayStore() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (30): extractOverlayPayload(), normalizeBroadcastSourceData(), toStringOrEmpty(), buildOverlayReplicantData(), getDashboardSchemaProperties(), getSchemaDefaultValue(), isRecord(), mergeRecord() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (42): DraggableBlock(), handleTrackClick(), getBlockEdgeStates(), useZoom(), AddTrackButton(), LastBroadcastLine(), Playhead(), changeBlockTrack() (+34 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (15): VisibilityToggle(), RoleGuard(), useCanPerform(), toggleVisibility(), useSessionPresence(), AuthProvider(), useAuth(), useHasAnyRole() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (29): handleCreate(), handleFileUpload(), stripHtml(), validateCgContent(), filterProfanity(), checkSpelling(), validateTemporal(), validateTitleFormat() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (27): handleCreateFolder(), handleDeleteFolder(), handleDeleteTemplate(), handleMoveSelection(), handleSaveTemplate(), deleteOverlayTemplate(), deleteSession(), fetchAllSessions() (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (25): OverlayCanvas(), runMapping(), extractAppliedStyles(), isRichText(), stripHtml(), wrapPlainText(), parseCanvasSize(), parseTemplateElements() (+17 more)

### Community 8 - "Community 8"
Cohesion: 0.07
Nodes (14): dispatchAction(), getActionsForContext(), matchShortcut(), normalizeShortcut(), registerAction(), GridOverlay(), collectSnapLines(), screenToSceneCoords() (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (22): BindingValidationPanel(), useAIGeneration(), useKeyboardShortcuts(), codeHistoryReducer(), isSameCode(), trimHistory(), usePluginCode(), usePreviewBridge() (+14 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (27): appendPointsToStroke(), appendStroke(), clamp(), coerceAnnotationDocument(), coerceAnnotationPoints(), coerceAnnotationStroke(), compactStrokePoints(), createAnnotationCursor() (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (16): handleCustom(), handleCustom(), handleDurationChange(), handleLoadUvcDevices(), handleRefreshNdi(), createClientId(), useAnnotationDocument(), RendererWhiteboard() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (17): openEditModal(), recordToKv(), loadData(), fetchCustomSource(), fetchDataByType(), fetchEarthquakeData(), fetchMockPublicData(), fetchWeatherData() (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (23): handleCreate(), handleDelete(), handleAiSaveVariation(), handleCreateBundle(), handleCreateGraphic(), handleDeleteBundle(), handleFork(), handleForkGraphic() (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (12): applyAnimation(), buildAnimOptions(), calculateAutoFitScale(), checkTextOverflow(), estimateWrappedTextHeight(), getContext(), measureTextWidth(), removeSlot() (+4 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (20): generateCgVariations(), parseElementsFromResponse(), testApiConnection(), callAI(), callOpenAICompatible(), getActiveConfig(), getApiKey(), getStrategy() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (19): accentBarClass(), accentWidthClass(), alignmentToCSS(), bgClass(), boundsWidthToPx(), containerLogicToCSS(), dividerAttr(), filterCustomClasses() (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (14): closeEditModal(), closeUploadModal(), handleEditSave(), handleModalUpload(), handleSvgGenerate(), handleSvgSave(), callGeminiSvg(), extractSvgFromResponse() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (10): handleDelete(), handleToggleFavorite(), handleVisibilityToggle(), async(), addToGallery(), fetchMyGallery(), removeFromGallery(), saveOverlayTemplate() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (11): handleCodeEditorRedo(), handleCodeEditorUndo(), handleGridTemplateSelect(), updateZoneBounds(), applyGridTemplateToZoneProfile(), formatZoneDefinitionForPrompt(), getZoneDefinition(), nameHint() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (14): addModel(), changeRole(), deleteApiKey(), deleteModel(), fetchApiKeys(), fetchModels(), fetchProfilesWithMemberships(), fetchUsageByModel() (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (8): closeUploadModal(), handleDelete(), handleUpload(), addStorageUrls(), deleteFont(), fetchFonts(), groupByFamily(), uploadFont()

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (10): useCuesheetSync(), addPendingChange(), approveAllPendingChanges(), approvePendingChange(), clearProcessedChanges(), dismissAllPendingChanges(), dismissPendingChange(), getPendingChanges() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.16
Nodes (6): Badge(), closeWizard(), handleWizardComplete(), deletePreset(), fetchPresets(), formatDateShort()

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (4): Select(), SelectItem(), SelectTrigger(), SelectValue()

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (7): computeUserStats(), getAvatarGradient(), getInitials(), maskKey(), inviteMember(), removeMember(), Input()

### Community 27 - "Community 27"
Cohesion: 0.23
Nodes (5): createWorkspace(), deleteWorkspace(), fetchAllWorkspaces(), fetchMembers(), updateWorkspace()

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (3): PropertiesPanel(), createKBSNewsTemplate(), createZone()

### Community 31 - "Community 31"
Cohesion: 0.36
Nodes (4): getMouseCoords(), handleMouseMove(), handleMoveStart(), handleResizeStart()

### Community 33 - "Community 33"
Cohesion: 0.4
Nodes (3): openSettings(), parseGenerationConfig(), Slider()

### Community 34 - "Community 34"
Cohesion: 0.47
Nodes (3): alignElements(), deleteElements(), updateElement()

## Knowledge Gaps
- **1 isolated node(s):** `Rive`
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 4` to `Community 1`, `Community 2`, `Community 5`, `Community 6`, `Community 40`, `Community 8`, `Community 12`, `Community 13`, `Community 17`, `Community 20`, `Community 21`?**
  _High betweenness centrality (0.477) - this node is a cross-community bridge._
- **Why does `buildPluginSrcdoc()` connect `Community 2` to `Community 8`, `Community 9`, `Community 6`, `Community 14`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 26` to `Community 0`, `Community 33`, `Community 39`, `Community 40`, `Community 19`, `Community 24`, `Community 25`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `callAI()` (e.g. with `generateCgVariations()` and `testApiConnection()`) actually correct?**
  _`callAI()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Rive` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._