import { create } from 'zustand';

const FILTER_TAB_VISIBLE_STORAGE_KEY = 'talus-tally:filter-tab-visible';
const FILTER_RULES_STORAGE_KEY = 'talus-tally:filter-rules';
const FILTER_MODE_STORAGE_KEY = 'talus-tally:filter-mode';
const SAVED_FILTER_SETS_STORAGE_KEY = 'talus-tally:saved-filter-sets';

const loadFilterTabVisible = (): boolean => {
  try {
    const stored = localStorage.getItem(FILTER_TAB_VISIBLE_STORAGE_KEY);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  } catch {
    return true;
  }
};

const persistFilterTabVisible = (visible: boolean) => {
  try {
    localStorage.setItem(FILTER_TAB_VISIBLE_STORAGE_KEY, String(visible));
  } catch {
    // Ignore storage failures and keep in-memory state working.
  }
};

const loadFilterRules = (): FilterRule[] => {
  try {
    const stored = localStorage.getItem(FILTER_RULES_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as FilterRule[]) : [];
  } catch {
    return [];
  }
};

const persistFilterRules = (rules: FilterRule[]) => {
  try {
    localStorage.setItem(FILTER_RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {}
};

const loadFilterMode = (): 'hide' | 'ghost' => {
  try {
    const stored = localStorage.getItem(FILTER_MODE_STORAGE_KEY);
    return stored === 'hide' ? 'hide' : 'ghost';
  } catch {
    return 'ghost';
  }
};

const persistFilterMode = (mode: 'hide' | 'ghost') => {
  try {
    localStorage.setItem(FILTER_MODE_STORAGE_KEY, mode);
  } catch {}
};

const loadSavedFilterSets = (): SavedFilterSet[] => {
  try {
    const stored = localStorage.getItem(SAVED_FILTER_SETS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as SavedFilterSet[]) : [];
  } catch {
    return [];
  }
};

const persistSavedFilterSets = (sets: SavedFilterSet[]) => {
  try {
    localStorage.setItem(SAVED_FILTER_SETS_STORAGE_KEY, JSON.stringify(sets));
  } catch {}
};

export type FilterOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

export interface FilterRule {
  id: string;
  property: string;
  operator: FilterOperator;
  value: any;
}

export interface SavedFilterSet {
  id: string;
  name: string;
  rules: FilterRule[];
  filterMode: 'hide' | 'ghost';
  createdAt: string;
}

export interface FilterState {
  rules: FilterRule[];
  filterMode: 'hide' | 'ghost';
  isExpanded: boolean;
  filterTabVisible: boolean;
  savedFilterSets: SavedFilterSet[];

  // Actions
  addRule: (rule: Omit<FilterRule, 'id'>) => void;
  updateRule: (id: string, updates: Partial<Omit<FilterRule, 'id'>>) => void;
  removeRule: (id: string) => void;
  clearRules: () => void;
  setFilterMode: (mode: 'hide' | 'ghost') => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  setFilterTabVisible: (visible: boolean) => void;
  toggleFilterTabVisible: () => void;
  // Saved filter set (workflow) actions
  saveCurrentAsFilterSet: (name: string) => void;
  applySavedFilterSet: (id: string) => void;
  deleteSavedFilterSet: (id: string) => void;
  renameSavedFilterSet: (id: string, newName: string) => void;
  /** Replace all saved filter sets (used when loading from a project file). */
  setSavedFilterSets: (sets: SavedFilterSet[]) => void;
}

export const useFilterStore = create<FilterState>((set, get) => ({
  rules: loadFilterRules(),
  filterMode: loadFilterMode(),
  isExpanded: false,
  filterTabVisible: loadFilterTabVisible(),
  savedFilterSets: loadSavedFilterSets(),

  addRule: (rule) => {
    const newRule: FilterRule = {
      ...rule,
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    set((state) => {
      const next = [...state.rules, newRule];
      persistFilterRules(next);
      return { rules: next };
    });
  },

  updateRule: (id, updates) => {
    set((state) => {
      const next = state.rules.map((rule) =>
        rule.id === id ? { ...rule, ...updates } : rule
      );
      persistFilterRules(next);
      return { rules: next };
    });
  },

  removeRule: (id) => {
    set((state) => {
      const next = state.rules.filter((rule) => rule.id !== id);
      persistFilterRules(next);
      return { rules: next };
    });
  },

  clearRules: () => {
    persistFilterRules([]);
    set({ rules: [] });
  },

  setFilterMode: (mode) => {
    persistFilterMode(mode);
    set({ filterMode: mode });
  },

  toggleExpanded: () => {
    set((state) => ({
      isExpanded: !state.isExpanded,
    }));
  },

  setExpanded: (expanded) => {
    set({ isExpanded: expanded });
  },

  setFilterTabVisible: (visible) => {
    persistFilterTabVisible(visible);
    set({ filterTabVisible: visible });
  },

  toggleFilterTabVisible: () => {
    set((state) => {
      const nextVisible = !state.filterTabVisible;
      persistFilterTabVisible(nextVisible);
      return { filterTabVisible: nextVisible };
    });
  },

  saveCurrentAsFilterSet: (name) => {
    const { rules, filterMode, savedFilterSets } = get();
    const newSet: SavedFilterSet = {
      id: `fset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: name.trim() || 'Unnamed Filter',
      rules: rules.map((r) => ({ ...r })),
      filterMode,
      createdAt: new Date().toISOString(),
    };
    const next = [...savedFilterSets, newSet];
    persistSavedFilterSets(next);
    set({ savedFilterSets: next });
  },

  applySavedFilterSet: (id) => {
    const { savedFilterSets } = get();
    const found = savedFilterSets.find((s) => s.id === id);
    if (!found) return;
    persistFilterRules(found.rules);
    persistFilterMode(found.filterMode);
    set({ rules: found.rules, filterMode: found.filterMode });
  },

  deleteSavedFilterSet: (id) => {
    set((state) => {
      const next = state.savedFilterSets.filter((s) => s.id !== id);
      persistSavedFilterSets(next);
      return { savedFilterSets: next };
    });
  },

  renameSavedFilterSet: (id, newName) => {
    set((state) => {
      const next = state.savedFilterSets.map((s) =>
        s.id === id ? { ...s, name: newName.trim() || s.name } : s
      );
      persistSavedFilterSets(next);
      return { savedFilterSets: next };
    });
  },

  setSavedFilterSets: (sets) => {
    persistSavedFilterSets(sets);
    set({ savedFilterSets: sets });
  },
}));
