# Backend Text Formatting Architecture

## Overview

Text formatting, spell checking, and text styling now live in the infrastructure layer, not the UI. This keeps the frontend "dumb" and maintains a clean separation of concerns.

## Architecture

```
Frontend (Dumb)
    ↓ sends text + token config
API Routes (text_editor_routes.py)
    ↓ applies formatting via infra layer
Text Editor Service (text_editor.py)
    ↓ delegates to formatting service
Formatting Service (formatting_service.py)
    ↓ applies transformations
Infrastructure Layer
    ├── spell_checker.py (spell checking)
    ├── markdown_service.py (markdown rendering)
    ├── formatting_service.py (NEW - text transformations)
    └── text_editor.py (undo/redo stack management)
```

## Component Breakdown

### 1. FormattingService (`formatting_service.py`)

Handles all text transformations and formatting rules:

```python
FormattingService.apply_text_transform(text, transform)
  - Handles: uppercase, lowercase, capitalize
  
FormattingService.format_line(text, format_config)
  - Applies text transforms
  - Adds markdown-style markers (**bold**, *italic*, __underline__)
  - Returns transformed text for undo/redo stack
  
FormattingService.apply_token_formatting(token_id, token_config, current_line)
  - Integrates with token's format_scope (line vs prefix)
  - Applies appropriate transformations
```

### 2. TextEditorService (`text_editor.py`)

Extended with static method:

```python
TextEditorService.apply_token_formatting(line_text, token_config)
  - Delegates to FormattingService
  - Can be called from API endpoints
  - Handles complex formatting logic
```

### 3. API Endpoints (`text_editor_routes.py`)

#### Updated: `/api/v1/text-editor/session/<session_id>/edit` (POST)

Now optionally accepts `token_config` parameter:

```json
{
  "before_text": "hello world",
  "after_text": "hello world",
  "token_config": {
    "id": "scene",
    "prefix": "SCENE:",
    "format_scope": "line",
    "format": {
      "text_transform": "uppercase"
    }
  }
}
```

When `token_config` is provided:
1. The `after_text` is passed through `apply_token_formatting()`
2. Result: "HELLO WORLD"
3. This formatted text is stored in the undo/redo stack
4. User sees: "HELLO WORLD"

#### New: `/api/v1/text-editor/session/<session_id>/apply-token` (POST)

Preview endpoint for testing formatting without storing edits:

```json
{
  "line_text": "hello world",
  "token_config": { ... }
}

Response:
{
  "success": true,
  "formatted_text": "HELLO WORLD",
  "token_id": "scene"
}
```

## How It Works

### Scenario: User inserts a Scene token with uppercase formatting

1. **Frontend** (stupid)
   ```tsx
   // UI just inserts prefix
   const newValue = before + prefix + after;
   handleTextChange(newValue);
   ```

2. **API receives text**
   ```
   POST /api/v1/text-editor/session/123/edit
   {
     "before_text": "",
     "after_text": "SCENE: ",
     "token_config": {
       "format_scope": "line",
       "format": { "text_transform": "uppercase" }
     }
   }
   ```

3. **Backend applies formatting**
   ```python
   # In apply_edit endpoint:
   if token_config:
       after_text = TextEditorService.apply_token_formatting(after_text, token_config)
       # "SCENE: " remains as "SCENE: " (prefix already uppercase in template)
   ```

4. **Undo/Redo stack stores the formatted version**
   ```python
   # TextEdit stores:
   # before_text: ""
   # after_text: "SCENE: "  (or transformed version)
   ```

5. **User types "camera pans"**
   ```
   Result displayed: "SCENE: camera pans"
   ```

6. **When user clicks Done, final text is saved with formatting markers**
   ```
   Stored: "SCENE: **CAMERA PANS**"
   (if formatting was applied to the line)
   ```

## Undo/Redo Behavior

The undo/redo stack stores **formatted text**, not raw text. This is intentional:

✓ User types "INT. office"
✓ Token formatting applied: "INT. OFFICE"
✓ Undo stack stores: "INT. OFFICE"
✓ User presses Undo
✓ Returns to previous state
✓ Redo brings back: "INT. OFFICE"

The formatting is **part of the edit operation**, not separate metadata.

## Text Transforms

All transforms are stateless functions:

```python
apply_text_transform("hello world", "uppercase") → "HELLO WORLD"
apply_text_transform("HELLO WORLD", "lowercase") → "hello world"
apply_text_transform("hello world", "capitalize") → "Hello world"
apply_text_transform("hello world", None) → "hello world"
```

## Markdown Markers

Formatting output uses markdown-style markers that are **plain text**:

```
Input: "hello world"
Format: { bold: true, italic: true }
Output: "***hello world***"  (bold + italic)

This preserves for undo/redo and shows formatting intent
```

## Spell Checking Integration

Spell checking remains separate from formatting:

- **Spell check**: Returns metadata (misspellings array)
- **Formatting**: Transforms the text itself

Both can coexist:
```
"**SCENE: OFFICE - MORNING**" (formatted line)
With misspellings: ["OFICE"] (hypothetically misspelled)
```

## Markdown Service Integration

Works with formatted text:

```python
input_text = "**SCENE: INT. OFFICE**"
html = markdown_service.renderPreview(input_text)
# Output: <strong>SCENE: INT. OFFICE</strong>
```

## Future Enhancements

1. **Character-level formatting**
   - Format individual words instead of lines

2. **Conditional formatting**
   - Apply formatting based on content patterns

3. **Rich text export**
   - Convert markdown markers to actual rich text in export

4. **Format preservation**
   - Store formatting metadata separately from text

## File Locations

```
Backend:
├── backend/infra/formatting_service.py   (NEW)
├── backend/infra/text_editor.py          (extended)
├── backend/api/text_editor_routes.py     (extended)
├── backend/infra/spell_checker.py        (existing)
├── backend/infra/markdown_service.py     (existing)

Frontend:
├── frontend/src/components/ui/EnhancedTextEditor.tsx (simplified)
└── frontend/src/services/textEditorService.ts        (no changes)
```

## Migration Notes

- **Backward compatible**: Existing text editor routes still work without `token_config`
- **Opt-in formatting**: Token formatting only applies if `token_config` is provided
- **No breaking changes**: Undo/redo stack behavior unchanged from user perspective

## Testing

Test token formatting directly:

```bash
POST /api/v1/text-editor/session/{id}/apply-token
{
  "line_text": "hello world",
  "token_config": {
    "format_scope": "line",
    "format": { "text_transform": "uppercase" }
  }
}

Expected response:
{
  "success": true,
  "formatted_text": "HELLO WORLD"
}
```
