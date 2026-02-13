/**
 * Text Editor Services Export
 * 
 * Centralized export for all text editing related services
 */

export { textEditorService, type TextEditState, type UndoRedoResult, type TextEditOperation } from './textEditorService';
export { spellCheckerService, type SpellingSuggestion, type SpellCheckResult } from './spellCheckerService';
export { markdownService, type MarkdownValidation, type MarkdownValidationIssue } from './markdownService';
export { markupRenderService, type MarkupToken, type StyledRange } from './markupRenderService';
