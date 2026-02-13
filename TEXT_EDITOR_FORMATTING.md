# Talus Tally Text Editor - Formatting & Markup System

An extended text editor with flexible markup tokens that support automatic text formatting. Perfect for screenplays (Trelby-style), technical documentation, novels, or any structured writing format.

## Quick Start

### Using the Built-in Screenplay Template

1. In your blueprint YAML, reference the screenplay formatting:

```yaml
properties:
  - id: script_content
    label: "Script"
    type: text
    markup_profile: script_default
```

2. Open the text editor - you'll see formatting buttons in the toolbar:
   - **Scene**: Inserts "SCENE:" and converts line to uppercase
   - **Hook**: Inserts "HOOK:" and converts to uppercase
   - **Action**: Inserts "[ACTION]"
   - **Speaker**: Inserts "SPEAKER:" and converts to uppercase
   - And more for visual, audio, text, loops, CTAs, etc.

3. When you click a button:
   - The prefix is inserted at the start of the current line
   - Any formatting rules are applied automatically
   - For screenplay elements, text is converted to uppercase

### Example Screenplay Entry

```
Script content:

[Click Scene button, type "interior coffee shop - morning"]
Result: SCENE: INTERIOR COFFEE SHOP - MORNING

[Click Action button, type "John enters, looking tired"]
Result: [ACTION] John enters, looking tired

[Click Speaker button, type "john"]
Result: SPEAKER: JOHN

[Click Action, type "sits at a table, orders coffee"]
Result: [ACTION] John sits at a table, orders coffee
```

## Markup Tokens with Formatting

Each token can include formatting rules that are applied when inserted:

### Basic Token (No Formatting)

```yaml
- id: action
  label: Action
  prefix: "[ACTION]"
```

When clicked, inserts: `[ACTION] ` at line start

### Token with Uppercase Formatting

```yaml
- id: scene
  label: Scene
  prefix: "SCENE:"
  format_scope: "line"
  format:
    text_transform: "uppercase"
```

When clicked on line "interior apartment - morning":
- Inserts "SCENE:" prefix
- Applies uppercase to "interior apartment - morning"
- Result: `SCENE: INTERIOR APARTMENT - MORNING`

### Token with Multiple Format Rules

```yaml
- id: critical_action
  label: "*** CRITICAL ***"
  prefix: "❌ ACTION:"
  format_scope: "line"
  format:
    text_transform: "uppercase"
    bold: true
    italic: true
    color: "#FF0000"
```

When clicked: Line becomes uppercase, bold, italic, and red

## Available Format Properties

When defining formatting for a token, you can use:

| Property | Values | Purpose |
|----------|--------|---------|
| `text_transform` | uppercase, lowercase, capitalize, none | Case transformation |
| `bold` | true/false | Apply bold formatting marker |
| `italic` | true/false | Apply italic formatting marker |
| `underline` | true/false | Apply underline formatting marker |
| `align` | left, center, right | Text alignment hint |
| `font_size` | CSS value (14px, 1.2em, etc) | Font size hint |
| `color` | Hex code (#FF5733) | Text color hint |
| `background_color` | Hex code (#FFFFFF) | Background color hint |

## Built-in Templates

### `script_default`
Basic screenplay format with scene headers, speakers, actions, visual/audio cues, and more.

### `trelby_screenplay`
Professional screenplay format matching Trelby with INT./EXT. headers, character names, transitions, shots, and more.

### `technical_doc`
Technical documentation with code blocks, warnings, info boxes, parameters, and examples.

### `novel_writing`
Creative writing format with chapters, internal thoughts, scene breaks, plot points, and callbacks.

## Creating Custom Templates

### Step 1: Create YAML File

Create `/data/markups/my_format.yaml`:

```yaml
id: my_format
label: My Custom Format
description: "What this template is for"

tokens:
  - id: element_name
    label: "Button Display Name"
    prefix: "PREFIX:"
    format_scope: "line"      # or "prefix"
    format:
      text_transform: "uppercase"
      bold: true
```

### Step 2: Use in Blueprint

```yaml
properties:
  - id: myfield
    label: "My Field"
    type: text
    markup_profile: my_format
```

### Step 3: Editor Automatically Uses Your Template

When the property is opened in the text editor, your custom buttons appear in the toolbar.

## Advanced Examples

### Example 1: Screenplay with Professional Formatting

```yaml
id: professional_screenplay
label: Professional Screenplay

tokens:
  - id: scene_int
    label: "INT. - Scene"
    prefix: "INT."
    format_scope: "line"
    format:
      text_transform: "uppercase"
      bold: true

  - id: scene_ext
    label: "EXT. - Scene"
    prefix: "EXT."
    format_scope: "line"
    format:
      text_transform: "uppercase"
      bold: true

  - id: transition
    label: "Transition"
    prefix: "TRANS:"
    format_scope: "line"
    format:
      text_transform: "uppercase"
      align: "right"

  - id: character
    label: "Character"
    prefix: ""  # No prefix, just format
    format_scope: "line"
    format:
      text_transform: "uppercase"
      align: "center"

  - id: dialogue
    label: "Dialogue"
    prefix: '  "'  # Indented dialogue
    format_scope: "prefix"

  - id: stage_direction
    label: "Parenthetical"
    prefix: "  ("
    format_scope: "line"
    format:
      italic: true
```

### Example 2: Documentation Format

```yaml
id: project_docs
label: Project Documentation

tokens:
  - id: section
    label: "Section"
    prefix: "## "
    format_scope: "line"
    format:
      bold: true
      font_size: "1.2em"

  - id: warning
    label: "⚠️ Warning"
    prefix: "⚠️ WARNING: "
    format_scope: "line"
    format:
      text_transform: "uppercase"
      bold: true
      color: "#FF0000"

  - id: info
    label: "ℹ️ Info"
    prefix: "ℹ️ INFO: "
    format_scope: "line"
    format:
      bold: true
      color: "#0066CC"

  - id: code_example
    label: "Code"
    prefix: "```"
    format_scope: "line"

  - id: note
    label: "Note"
    prefix: "> "
    format_scope: "line"
    format:
      italic: true
```

### Example 3: Editorial Marks

```yaml
id: editorial_marks
label: Editorial Review Marks

tokens:
  - id: edit_required
    label: "Edit Required"
    prefix: "[EDIT]"
    format_scope: "line"
    format:
      text_transform: "uppercase"
      bold: true
      color: "#FF6B6B"

  - id: factcheck
    label: "Fact Check"
    prefix: "[FC]"
    format_scope: "line"
    format:
      bold: true
      color: "#FFB700"

  - id: approved
    label: "Approved"
    prefix: "[✓]"
    format_scope: "line"
    format:
      bold: true
      color: "#51CF66"

  - id: rewrite
    label: "Rewrite Section"
    prefix: "[REWRITE]"
    format_scope: "line"
    format:
      italic: true
      bold: true
      color: "#9775FA"
```

## Implementation Details

### What Gets Applied

When you insert a markup token with formatting:

1. **Text Transform** applied to the current line or prefix
2. **Styling Properties** (bold, italic, underline) rendered as markdown markers
3. **Metadata** (color, size, align) preserved in the text for display/export later

### Plain Text Content

The editor stores plain text with embedded format codes:

```
**UPPERCASE TEXT**  ← bold + uppercase applied
*italic text*       ← italic applied
__underlined__      ← underline applied
```

### Server-Side Handling

Format codes are preserved through the text handling pipeline, allowing:
- Correct spell checking (sees `UPPERCASE TEXT` not `**UPPERCASE TEXT**`)
- Undo/redo functionality
- Export to various formats
- Future rich-text rendering

## Tips & Tricks

### 1. Format Scope Matters

- **`format_scope: "line"`** - Best for headers, scenes, major elements
- **`format_scope: "prefix"`** - Best for inline markers, inline formatting

### 2. Combining with Spell Check

Markup tokens work alongside spell checking - misspelled words in formatted lines still get underlined and can be corrected.

### 3. Keyboard Workflow

- Insert token with button click
- Type your content
- Continue - formatting is auto-applied
- Use Undo (Ctrl+Z) to reverse if needed

### 4. Empty Line Behavior

Clicking a token when on an empty line:
- Inserts the prefix
- No text to transform
- Ready for you to type

### 5. Mixed Formatting

You can have multiple formatted tokens on different lines:

```
SCENE: INT. OFFICE - DAY
[ACTION] John enters
SPEAKER: JOHN
[DIALOGUE] "Hello!"
[ACTION] He sits down
```

Each line maintains its own formatting rules independently.

## Troubleshooting

### Template Not Appearing

✓ Verify the YAML file is in `/data/markups/`
✓ Confirm the filename matches the `markup_profile` reference (minus .yaml)
✓ Check YAML syntax is valid (test with `yaml` parser)
✓ Restart the application - templates are cached at startup

### Formatting Not Applied

✓ Verify `format_scope` is set ("line" or "prefix")
✓ Check `format` object has valid properties
✓ Ensure you're typing content on the line when clicking the button
- Empty lines won't show transformation effects

### Text Appears Incorrectly

✓ The editor shows raw markdown, not visual rendering (formatting codes visible)
✓ This is intentional - allows editing while preserving format information
✓ Live preview available in preview pane

## File Locations

```
Frontend Components:
├── frontend/src/components/ui/EnhancedTextEditor.tsx
├── frontend/src/services/textEditorService.ts
└── frontend/src/services/spellCheckerService.ts

Backend Infrastructure:
├── backend/infra/text_editor.py
├── backend/infra/spell_checker.py
├── backend/infra/markdown_service.py
└── backend/infra/markup.py

Templates & Configuration:
├── data/markups/script_default.yaml
├── data/markups/trelby_screenplay.yaml
├── data/markups/technical_doc.yaml
├── data/markups/novel_writing.yaml
└── [your custom templates].yaml

Documentation:
├── docs/MARKUP_FORMATTING_GUIDE.md
└── docs/TEXT_EDITOR_REFACTORING.md
```

## Next Steps

1. **Use Existing Templates**: Try `trelby_screenplay` for screenwriting
2. **Create Custom Template**: Add your own format to `/data/markups/`
3. **Configure Blueprint**: Reference template in your project YAML
4. **Test in Editor**: Open properties using the template and try the buttons
5. **Iterate**: Adjust formatting rules based on your workflow

---

For comprehensive markup system documentation, see [MARKUP_FORMATTING_GUIDE.md](MARKUP_FORMATTING_GUIDE.md).
