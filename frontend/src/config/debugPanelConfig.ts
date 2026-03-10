export type DebugLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type DebugPanelFilterMode = 'allow-all' | 'allow-listed';

export type DebugLogLike = {
  level: DebugLogLevel;
  message: string;
};

export type DebugPanelConfig = {
  // When false, all captured logs are shown.
  enabled: boolean;
  // allow-all: show everything except explicit excludes
  // allow-listed: only include matching includeTags/includeText (+ warnings/errors)
  mode: DebugPanelFilterMode;
  includeLevels: DebugLogLevel[];
  alwaysIncludeLevels: DebugLogLevel[];
  includeTags: string[];
  excludeTags: string[];
  includeText: string[];
  excludeText: string[];
  maxVisibleEntries: number;
};

// Edit this file to tailor what appears in the Debug Panel and Copy Logs output.
export const debugPanelConfig: DebugPanelConfig = {
  enabled: true,
  mode: 'allow-listed',
  includeLevels: ['log', 'info', 'warn', 'error', 'debug'],
  alwaysIncludeLevels: ['warn', 'error'],

  // Prefix tags extracted from messages like: [App::VELOCITY] ...
  includeTags: [
    'App::VELOCITY',
    'App::INIT',
    'App::STATE',
    'File Open',
    'DEBUG',
    'TreeView',
  ],

  // High-volume noise tags to suppress by default.
  excludeTags: ['normalizeGraph'],

  // Optional free-text includes/excludes (case-insensitive substring match)
  includeText: [
    'getVelocityRanking',
    'velocityScores',
    'Filters active',
    'API returned',
    'Loading graph into session',
    'Graph loaded into backend session',
    'Project opened',
    'Raw graphData from backend',
  ],
  excludeText: [],

  // Prevent panel rendering/copy from becoming huge.
  maxVisibleEntries: 2000,
};

const lower = (value: string) => value.toLowerCase();

const hasAnySubstring = (text: string, needles: string[]) => {
  if (needles.length === 0) return false;
  const target = lower(text);
  return needles.some((needle) => target.includes(lower(needle)));
};

const extractTag = (message: string): string | null => {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
};

const shouldIncludeEntry = (entry: DebugLogLike): boolean => {
  const cfg = debugPanelConfig;

  if (!cfg.enabled) {
    return true;
  }

  if (!cfg.includeLevels.includes(entry.level)) {
    return false;
  }

  if (cfg.alwaysIncludeLevels.includes(entry.level)) {
    return true;
  }

  const tag = extractTag(entry.message);

  if (tag && cfg.excludeTags.includes(tag)) {
    return false;
  }

  if (hasAnySubstring(entry.message, cfg.excludeText)) {
    return false;
  }

  if (cfg.mode === 'allow-all') {
    return true;
  }

  const tagAllowed = Boolean(tag && cfg.includeTags.includes(tag));
  const textAllowed = hasAnySubstring(entry.message, cfg.includeText);

  if (cfg.includeTags.length === 0 && cfg.includeText.length === 0) {
    return true;
  }

  return tagAllowed || textAllowed;
};

export const filterDebugPanelLogs = <T extends DebugLogLike>(logs: T[]): T[] => {
  const filtered = logs.filter(shouldIncludeEntry);
  const max = debugPanelConfig.maxVisibleEntries;
  if (filtered.length <= max) {
    return filtered;
  }
  return filtered.slice(filtered.length - max);
};
