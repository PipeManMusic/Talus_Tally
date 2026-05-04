import { create } from 'zustand';
import type { ToolsTab } from '../types/toolsTabs';
import { TOOLS_TAB_IDS } from '../types/toolsTabs';

/**
 * UI preferences store — persistent toggles that customize which parts of
 * the application chrome are visible.
 *
 * **Scope: per-project.** These preferences are stored alongside other
 * project data (filter_sets, expanded_map, blocking_relationships) inside
 * the project JSON file, NOT in localStorage. This means a project author
 * can ship a curated UI to collaborators and each project can opt out of
 * tools that aren't relevant to that work (e.g. a budget-only project can
 * disable Velocity / Blocking / Charts / Agile so only Budget + Gantt show).
 *
 * When *all* tools are disabled the main "Tools" view button is hidden too.
 */

const buildDefaultEnabledTools = (): Record<ToolsTab, boolean> => {
  const defaults = {} as Record<ToolsTab, boolean>;
  TOOLS_TAB_IDS.forEach((id) => {
    defaults[id] = true;
  });
  return defaults;
};

/**
 * Coerces an arbitrary persisted value (typically loaded from a project
 * file) into a complete `Record<ToolsTab, boolean>`. Unknown keys are
 * dropped, missing keys default to enabled, non-boolean values default to
 * enabled. Returns the defaults when the input is invalid.
 */
export const normalizeEnabledTools = (
  value: unknown,
): Record<ToolsTab, boolean> => {
  const defaults = buildDefaultEnabledTools();
  if (!value || typeof value !== 'object') return defaults;
  const input = value as Partial<Record<string, unknown>>;
  TOOLS_TAB_IDS.forEach((id) => {
    if (typeof input[id] === 'boolean') {
      defaults[id] = input[id] as boolean;
    }
  });
  return defaults;
};

export interface UiPrefsState {
  /** Map of tool tab id → whether it should be visible in the Tools view. */
  enabledTools: Record<ToolsTab, boolean>;
  setToolEnabled: (tab: ToolsTab, enabled: boolean) => void;
  /** Replace all tool-visibility flags. Used when loading a project file. */
  setEnabledTools: (value: Record<ToolsTab, boolean>) => void;
  resetEnabledTools: () => void;
}

export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  enabledTools: buildDefaultEnabledTools(),

  setToolEnabled: (tab, enabled) => {
    set((state) => ({
      enabledTools: { ...state.enabledTools, [tab]: enabled },
    }));
  },

  setEnabledTools: (value) => {
    set({ enabledTools: normalizeEnabledTools(value) });
  },

  resetEnabledTools: () => {
    set({ enabledTools: buildDefaultEnabledTools() });
  },
}));

/** Convenience selector — returns the ordered list of currently enabled tabs. */
export const selectEnabledToolIds = (state: UiPrefsState): ToolsTab[] =>
  TOOLS_TAB_IDS.filter((id) => state.enabledTools[id]);
