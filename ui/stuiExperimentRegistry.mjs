/**
 * Production Playground registry. One row per standard.
 * The page uses this list. Tests may pass another list to the reader
 * to prove the tree, without adding that standard here.
 */
export const STUI_EXPERIMENT_STANDARDS = [
  {
    stuiId: "STUI-20-002",
    standardName: "Konfiguroitava taulukko",
    modelKey: "studio/lists/studio-configurable-table-v1",
    capabilities: ["sectionToggle", "transpose"],
    requiredCapabilities: ["sectionToggle", "transpose"],
    presentationKeys: ["hiddenColumnIds"],
    requiredPresentationKeys: ["hiddenColumnIds"],
    behaviorKeys: ["transpose", "sections"],
    requiredBehaviorKeys: ["transpose", "sections"],
  },
  {
    stuiId: "STUI-20-004",
    standardName: "Muokattava järjestyslista",
    modelKey: "studio/lists/studio-table-list-reorder",
    capabilities: ["gripReorder"],
    requiredCapabilities: ["gripReorder"],
    presentationKeys: [],
    requiredPresentationKeys: [],
    behaviorKeys: [],
    requiredBehaviorKeys: [],
  },
];

export function findStuiExperimentStandard(stuiId, standards = STUI_EXPERIMENT_STANDARDS) {
  if (typeof stuiId !== "string" || !stuiId) return null;
  return standards.find((standard) => standard.stuiId === stuiId) ?? null;
}
