# Text Editor System Refactor

## Overview

The text editor system has been completely refactored to provide a robust, infrastructure-based text editing experience with proper separation of concerns, undo/redo support, spell checking, and markdown rendering.

## Architecture

### Backend Infrastructure Layer

#### 1. Text Editor Service (`backend/infra/text_editor.py`)
- **Purpose**: Manages text editing sessions with independent undo/redo stacks
- **Features**:
  - Session-based editing (multiple fields can be edited simultaneously)
  - Undo/redo stack management (up to 100 operations per session)
  - Operation tracking with cursor position preservation
  - Automatic session cleanup after 30 minutes of inactivity

**Key Classes**:
- `TextEdit`: Represents a single edit operation with before/after text and cursor info
- `TextEditorSession`: Manages a single editing session with undo/redo stacks
- `TextEditorService`: Service for creating and managing multiple sessions

#### 2. Spell Checker Service (`backend/infra/spell_checker.py`)
- **Purpose**: Provides spell checking with custom dictionaries
- **Features**:
  - Base English dictionary (expandable)
  - Custom project dictionary
  - Session-based ignore list
  - Edit distance algorithm for suggestions
  - Technical term support (project management, screenwriting terms)

**Key Classes**:
- `SpellingSuggestion`: Represents a misspelling with suggestions and context
- `SpellCheckerService`: Main spell checking service with dictionary management

#### 3. Markdown Service (`backend/infra/markdown_service.py`)
- **Purpose**: Markdown parsing, rendering, and validation
- **Features**:
  - Markdown to HTML conversion
  - HTML to plain text conversion
  - Syntax validation (unclosed formatting detection)
  - Formatting detection at cursor position
  - Support for headings, lists, bold, italic, underline, code

**Key Classes**:
- `MarkdownElement`: Represents a parsed markdown element
- `MarkdownService`: Main markdown service with parsing and rendering

### Backend API Layer

#### Text Editor Routes (`backend/api/text_editor_routes.py`)
All endpoints under `/api/v1/text-editor`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/session` | POST | Create new editing session |
| `/session/<id>` | GET | Get session state |
| `/session/<id>` | DELETE | Close session and get final text |
| `/session/<id>/edit` | POST | Apply text edit operation |
| `/session/<id>/undo` | POST | Undo last operation |
| `/session/<id>/redo` | POST | Redo last undone operation |
| `/spell-check` | POST | Check spelling and get suggestions |
| `/spell-check/add-word` | POST | Add word to custom dictionary |
| `/spell-check/ignore` | POST | Ignore word for current session |
| `/markdown/to-html` | POST | Convert markdown to HTML |
| `/markdown/validate` | POST | Validate markdown syntax |
| `/sessions/cleanup` | POST | Cleanup expired sessions |

### Frontend Services Layer

#### 1. Text Editor Service (`frontend/src/services/textEditorService.ts`)
- **Purpose**: Client-side interface to text editing API
- **Features**:
  - Session lifecycle management
  - Edit operations with cursor tracking
  - Undo/redo operations
  - State synchronization

**Key Methods**:
- `createSession()`: Initialize editing session
- `applyEdit()`: Apply edit with undo/redo tracking
- `undo()` / `redo()`: Navigate edit history
- `closeSession()`: Finalize and cleanup

#### 2. Spell Checker Service (`frontend/src/services/spellCheckerService.ts`)
- **Purpose**: Client-side spell checking interface
- **Features**:
  - Real-time spell checking
  - Debounced checking to reduce API calls
  - Dictionary management
  - Ignore list management

**Key Methods**:
- `checkText()`: Check text for misspellings
- `checkTextDebounced()`: Debounced checking for typing
- `addToDictionary()`: Add custom words
- `ignoreWord()`: Temporarily ignore words

#### 3. Markdown Service (`frontend/src/services/markdownService.ts`)
- **Purpose**: Client-side markdown utilities
- **Features**:
  - Client-side preview rendering (no server roundtrip)
  - Server-side HTML conversion for final output
  - Formatting insertion helpers
  - Active formatting detection

**Key Methods**:
- `toHtml()`: Server-side markdown to HTML
- `renderPreview()`: Client-side immediate preview
- `validate()`: Validate markdown syntax
- `insertFormatting()`: Helper for toolbar actions
- `getFormattingAtPosition()`: Detect active formatting

### Frontend UI Layer

#### Enhanced Text Editor (`frontend/src/components/ui/EnhancedTextEditor.tsx`)

**Features**:
- ✅ Server-side undo/redo with cursor position restoration
- ✅ Real-time markdown preview pane
- ✅ Spell checking with inline suggestions
- ✅ Formatting toolbar (bold, italic, underline, lists)
- ✅ Markup token insertion
- ✅ Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- ✅ Character and line count
- ✅ Session management and cleanup

**Props**:
```typescript
interface EnhancedTextEditorProps {
  isOpen: boolean;
  title: string;
  value: string;
  propertyId: string;  // Required for session management
  nodeId: string;      // Required for session management
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  markupTokens?: MarkupToken[];
}
```

**Usage in Inspector**:
```tsx
import { EnhancedTextEditor } from '../ui/EnhancedTextEditor';

<EnhancedTextEditor
  isOpen={editorState.isOpen}
  title={editorState.propName}
  value={editorState.value}
  propertyId={editorState.propId}
  nodeId={nodeId || ''}
  onChange={(newValue) => setEditorState({ ...editorState, value: newValue })}
  onClose={closeEditor}
  onSave={saveEditorContent}
  markupTokens={editorState.markupTokens}
/>
```

## Key Improvements

### 1. Proper Undo/Redo
- **Before**: No undo/redo support for text editing
- **After**: Full undo/redo with server-side stack management
- **Benefits**: 
  - Each text field has independent history
  - Cursor position is restored on undo/redo
  - Edit history persists across component re-renders
  - Separate from graph command undo/redo

### 2. Infrastructure Layer Separation
- **Before**: All text manipulation happened in UI components
- **After**: Infrastructure layer handles business logic
- **Benefits**:
  - Testable business logic
  - Reusable across different UI components
  - Easier to maintain and extend
  - Clear separation of concerns

### 3. Spell Checking
- **Before**: Browser's built-in spell check only
- **After**: Custom spell checker with project-specific terms
- **Benefits**:
  - Project terminology support
  - Custom dictionary for technical terms
  - Intelligent suggestions
  - Session-based ignore lists

### 4. Markdown Support
- **Before**: Basic formatting buttons with direct DOM manipulation
- **After**: Proper markdown parsing and rendering
- **Benefits**:
  - Live preview pane
  - Syntax validation
  - Server-side HTML generation
  - Client-side instant preview

### 5. Session Management
- **Before**: Single global text state
- **After**: Independent editing sessions
- **Benefits**:
  - Multiple fields can be edited simultaneously
  - Session cleanup prevents memory leaks
  - Better state management
  - Scalable architecture

## Migration Guide

### For Developers

#### Replacing TextEditorModal with EnhancedTextEditor

**Old Code**:
```tsx
import { TextEditorModal } from '../ui/TextEditorModal';

<TextEditorModal
  isOpen={isOpen}
  title="Description"
  value={value}
  onChange={setValue}
  onClose={handleClose}
  onSave={handleSave}
  markupTokens={tokens}
/>
```

**New Code**:
```tsx
import { EnhancedTextEditor } from '../ui/EnhancedTextEditor';

<EnhancedTextEditor
  isOpen={isOpen}
  title="Description"
  value={value}
  propertyId="description"  // Add this
  nodeId={currentNodeId}     // Add this
  onChange={setValue}
  onClose={handleClose}
  onSave={handleSave}
  markupTokens={tokens}
/>
```

### Adding Custom Dictionary Words

**Python (Backend)**:
```python
from backend.infra.spell_checker import spell_checker

spell_checker.add_to_custom_dictionary("Talus")
spell_checker.add_to_custom_dictionary("Bronco")
```

**TypeScript (Frontend)**:
```typescript
import { spellCheckerService } from '@/services';

await spellCheckerService.addToDictionary("Talus");
```

### Registering Custom Markup Tokens

**Python (Backend)**:
```python
from backend.infra.markdown_service import markdown_service

markdown_service.register_markup_token("character", "CHARACTER:")
```

## Testing

### Backend Tests

```bash
cd backend
python -m pytest tests/infra/test_text_editor.py
python -m pytest tests/infra/test_spell_checker.py
python -m pytest tests/infra/test_markdown_service.py
python -m pytest tests/api/test_text_editor_routes.py
```

### Frontend Tests

```bash
cd frontend
npm test -- services/textEditorService.test.ts
npm test -- services/spellCheckerService.test.ts
npm test -- services/markdownService.test.ts
npm test -- components/ui/EnhancedTextEditor.test.tsx
```

## Performance Considerations

1. **Debouncing**: Edit operations are debounced (300ms) to reduce API calls
2. **Spell Checking**: Debounced (1000ms) to avoid excessive checking while typing
3. **Preview Rendering**: Client-side for instant feedback
4. **Session Cleanup**: Automatic cleanup of sessions inactive for 30+ minutes
5. **Undo Stack Limit**: Maximum 100 operations per session to prevent memory issues

## Future Enhancements

### Planned Features
- [ ] Collaborative editing with real-time sync
- [ ] Advanced markdown features (tables, code blocks, images)
- [ ] Grammar checking in addition to spell checking
- [ ] Text-to-speech for accessibility
- [ ] Dark/light theme support for preview
- [ ] Export to various formats (PDF, Word, etc.)
- [ ] Macro/snippet system for common patterns
- [ ] Version history and diff view
- [ ] Advanced search and replace with regex
- [ ] Multiple cursor support

### Enhancement Ideas
- Integration with external spell checking libraries (aspell, hunspell)
- AI-powered writing suggestions
- Markdown table editor
- Image upload and embedding
- Code syntax highlighting in code blocks
- LaTeX equation support
- Autosave to local storage
- Offline mode support

## Troubleshooting

### Common Issues

#### Sessions Not Creating
**Symptom**: Text editor opens but undo/redo doesn't work
**Solution**: Ensure `propertyId` and `nodeId` props are provided

#### Spell Check Not Working
**Symptom**: No spell check suggestions appear
**Solution**: 
1. Check backend is running
2. Verify `/api/v1/text-editor/spell-check` endpoint is accessible
3. Check browser console for errors

#### Preview Not Updating
**Symptom**: Markdown preview doesn't reflect text changes
**Solution**: Toggle preview off and back on to refresh

#### Undo/Redo Not Working
**Symptom**: Ctrl+Z doesn't undo
**Solution**:
1. Check that edit operations are being applied (check Network tab)
2. Verify session was created successfully
3. Check backend logs for errors

## API Reference

Complete API documentation available at: `/api/v1/text-editor/docs` (when running in development mode)

## License

Same as parent project (Talus Tally)
