import { TrendingUp, Zap, DollarSign, Calendar, Users, ChartColumn, Kanban, type LucideIcon } from 'lucide-react';

/**
 * Single source of truth for the Tools view tabs. Used by:
 *   - Toolbar (renders the tab buttons)
 *   - SettingsDialog (renders the visibility checkboxes)
 *   - uiPrefsStore (default + storage shape)
 *
 * Order here is the order they appear in the toolbar.
 */
export const TOOLS_TAB_DEFS = [
  { id: 'velocity', label: 'Velocity', icon: TrendingUp, title: 'Switch to velocity view' },
  { id: 'blocking', label: 'Blocking', icon: Zap, title: 'Switch to blocking view' },
  { id: 'budget', label: 'Budget', icon: DollarSign, title: 'Switch to budget view' },
  { id: 'gantt', label: 'Gantt', icon: Calendar, title: 'Switch to Gantt chart' },
  { id: 'manpower', label: 'Manpower', icon: Users, title: 'Switch to manpower view' },
  { id: 'charts', label: 'Charts', icon: ChartColumn, title: 'Switch to charts view' },
  { id: 'agile', label: 'Agile', icon: Kanban, title: 'Switch to Agile Kanban view' },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
}>;

export type ToolsTab = (typeof TOOLS_TAB_DEFS)[number]['id'];

export const TOOLS_TAB_IDS: ToolsTab[] = TOOLS_TAB_DEFS.map((t) => t.id);
