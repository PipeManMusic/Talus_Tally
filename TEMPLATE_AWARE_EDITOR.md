## TemplateAwareEditor Component

A professional, template-driven text editor component built for the Talus Tally application. Uses a `<textarea>` element with a separate render layer for formatting, ensuring stable cursor behavior and clean text storage.

### Architecture

```
TemplateAwareEditor
├── Container & Modal UI
├── Toolbar (generated from template)
│   ├── Undo/Redo buttons
│   ├── Formatting buttons (Bold, Italic, Underline)
│   ├── List buttons (Bullet, Numbered)
│   ├── Indentation controls
│   └── Save/Cancel buttons
├── Editor Area
│   ├── <textarea> - stable cursor input
│   └── Render Layer - shows styled preview (hidden by default)
├── Status Bar (character count, line count, spelling errors)
└── Context Menu (spell check suggestions)
```

### Key Advantages Over Previous Approaches

1. **Stable Cursor**: Uses `<textarea>` instead of `contentEditable`, so no DOM manipulation on keystroke
2. **Clean Text Storage**: Plain text stored internally, no hidden markup in the DOM
3. **Template-Driven**: All features defined in YAML - no code changes needed for new templates
4. **Professional UX**: Dark theme, white editor area, proper spell checking with context menu
5. **Proper Separation of Concerns**: MVC pattern with service-based mutations

### Template Configuration

The editor respects a template configuration object:

```typescript
interface TemplateConfig {
  name: string;
  features?: {
    spell_check?: boolean;    // Enable inline spell checking
    undo_redo?: boolean;       // Enable undo/redo (always true for now)
  };
  formatting?: Record<string, any>;  // Bold, italic, underline definitions
  lists?: Record<string, any>;       // Bullet, numbered list definitions
  indentation?: {
    enabled?: boolean;
    tab_size?: number;
    max_levels?: number;
  };
  tokens?: MarkupToken[];     // For render layer styling
}
```

### Usage Example

```tsx
import { TemplateAwareEditor } from './components/ui/TemplateAwareEditor';

const wordProcessorTemplate = {
  name: 'word_processor',
  features: {
    spell_check: true,
    undo_redo: true,
  },
  formatting: {
    bold: { prefix: '**' },
    italic: { prefix: '*' },
    underline: { prefix: '__' },
  },
  lists: {
    bullet: { prefix: '- ' },
    numbered: { prefix: '1. ' },
  },
  indentation: {
    enabled: true,
    tab_size: 2,
    max_levels: 5,
  },
  tokens: [],
};

function App() {
  const [text, setText] = useState('');

  return (
    <TemplateAwareEditor
      isOpen={true}
      title="Edit Document"
      value={text}
      propertyId="doc-1"
      nodeId="node-1"
      onChange={setText}
      onClose={() => {}}
      onSave={(newValue) => {
        // Save to backend
        setText(newValue);
      }}
      template={wordProcessorTemplate}
    />
  );
}
```

### Features

#### 1. Text Formatting

Buttons insert markup at cursor or wrap selection:

- **Bold**: Wraps text with `**text**`
- **Italic**: Wraps text with `*text*`
- **Underline**: Wraps text with `__text__`

#### 2. Lists

- **Bullet List**: Inserts `- item` with proper indentation
- **Numbered List**: Inserts `1. item` with auto-numbering
- Both respect current indentation level

#### 3. Indentation

- Level display shows current indentation (0-5)
- Buttons increment/decrement level
- Used by list insertion and bullet/numbered items

#### 4. Undo/Redo

- Buttons disabled/enabled based on session state
- Integrated with backend `textEditorService`
- Maintains cursor position after undo/redo

#### 5. Spell Checking

When enabled in template:
- Checks text with 500ms debounce
- Shows misspelled words in context menu
- Right-click on error word to see suggestions
- "Add to Dictionary" option
- "Ignore" option to dismiss

#### 6. Status Bar

Shows:
- Character count
- Line count
- Number of misspellings (if spell checking enabled)

### Implementation Details

#### Markup Insertion

Buttons use `insertMarkup()` helper:

```typescript
const insertMarkup = (prefix: string, suffix: string = prefix) => {
  const textarea = textareaRef.current;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = value.substring(start, end) || 'text';
  const before = value.substring(0, start);
  const after = value.substring(end);

  const newText = `${before}${prefix}${selectedText}${suffix}${after}`;
  onChange(newText);

  // Restore focus and position
  setTimeout(() => {
    textarea.focus();
    const cursorPos = start + prefix.length;
    textarea.setSelectionRange(cursorPos, cursorPos + selectedText.length);
  }, 0);
};
```

#### Session Management

- Creates session on mount with `textEditorService.createSession()`
- Applies edits via `textEditorService.applyEdit()`
- Undo/redo through `textEditorService.undo()/redo()`
- Closes session on unmount

#### Spell Checking

```typescript
// Debounced spell check
spellCheckTimer.current = setTimeout(async () => {
  const result = await spellCheckerService.checkText(value);
  setSpellingErrors(result.misspellings || []);
}, 500);
```

#### Scroll Sync

Render layer scrolls in sync with textarea:

```typescript
const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
  if (renderLayerRef.current) {
    renderLayerRef.current.scrollTop = e.currentTarget.scrollTop;
    renderLayerRef.current.scrollLeft = e.currentTarget.scrollLeft;
  }
};
```

### Styling

Styles defined in `/frontend/src/styles/template-aware-editor.css`:

- Dark theme (#1e1e1e background)
- White editor area (#fff background)
- Accent color #0d7377 for highlights
- Professional toolbar with icon buttons
- Responsive design (works on mobile)

### Testing

Run tests with:

```bash
npm test TemplateAwareEditor.test.tsx
```

Tests cover:
- Rendering and visibility
- Text editing and onChange callbacks
- Formatting button functionality
- List insertion
- Indentation controls
- Undo/redo
- Spell checking
- Save/cancel operations
- Session management
- Scroll sync

### Integration with Inspector

The Inspector uses TemplateAwareEditor for "editor" type properties:

```tsx
const openEditor = (propId: string, propName: string, value: string | number) => {
  setEditorState({
    isOpen: true,
    propId,
    propName,
    value: String(value),
    isLinkedAsset: false,
  });
};

// In render:
<TemplateAwareEditor
  isOpen={editorState.isOpen}
  title={editorState.propName}
  value={editorState.value}
  propertyId={editorState.propId}
  nodeId={nodeId || ''}
  onChange={(newValue) => {
    setEditorState({ ...editorState, value: newValue });
  }}
  onClose={closeEditor}
  onSave={saveEditorContent}
  template={undefined}  // Uses default word processor
/>
```

### Future Enhancements

1. **Template Loading**: Load markup templates from `/data/markups/*.yaml`
2. **Custom Templates**: Support screenwriting, novel, and other domain-specific templates
3. **Find & Replace**: Add find/replace functionality
4. **Word Count**: Add word count to status bar
5. **Formatting Bar**: Show active formatting at cursor position
6. **Collaborative Editing**: Support multiple users editing same document
7. **Change Tracking**: Track and display document changes
8. **Export**: Export to PDF, Word, HTML with template-specific formatting

### Type Definitions

```typescript
interface TemplateConfig {
  name: string;
  features?: {
    spell_check?: boolean;
    undo_redo?: boolean;
  };
  formatting?: Record<string, any>;
  lists?: Record<string, any>;
  indentation?: {
    enabled?: boolean;
    tab_size?: number;
    max_levels?: number;
  };
  tokens?: MarkupToken[];
}

interface EditorProps {
  isOpen: boolean;
  title: string;
  value: string;
  propertyId: string;
  nodeId: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (value: string) => void;
  template?: TemplateConfig;
}
```

### Troubleshooting

**Spell checking not working:**
- Verify `template.features.spell_check = true`
- Check console for spellCheckerService errors
- Ensure spellCheckerService is properly initialized

**Cursor jumping:**
- This should not occur - using `<textarea>` prevents this
- If it happens, file a bug (likely in scrolling sync)

**Toolbar buttons don't work:**
- Check that template is properly passed
- Verify button handlers are called (dev tools)
- Check for errors in insertMarkup() calls

**Undo/redo disabled:**
- Session may not have initialized
- Check that textEditorService is accessible
- Look for console errors in session creation

### Performance Notes

- Spell checking debounced to 500ms to avoid excessive API calls
- Render layer hidden by default (no performance impact)
- Session mutations through service layer (no local state conflicts)
- Textarea element is native DOM (no unnecessary re-renders)

### Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Any modern browser with ES2020 support.
