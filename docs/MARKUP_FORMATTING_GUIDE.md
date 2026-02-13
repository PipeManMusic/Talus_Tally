# Markup Token Formatting System

Extended markup tokens to support flexible formatting rules that can be configured in YAML templates. This enables creating screenplay formatting (like Trelby), technical documentation styles, novel formatting, or any other editor behavior.

## System Overview

**Location**: Markup templates are defined in `/data/markups/*.yaml`

**Architecture**:
- Backend loads YAML templates via `MarkupRegistry`
- Frontend receives tokens as part of API response
- Editor applies formatting when token is inserted
- Formatting is applied to plain text (not visual styling in the editor)

## YAML Template Structure

### Basic Token Definition

```yaml
id: script_default
label: Default Script
description: "Optional description of the template"

tokens:
  - id: unique_token_id
    label: "Display Name for Button"
    prefix: "MARKER:"          # Text inserted as prefix
    pattern: "optional_regex"  # For parsing existing formatted text
    format_scope: "line"       # Where to apply formatting: 'line' or 'prefix'
    format:                    # Optional formatting rules
      text_transform: "uppercase"      # uppercase, lowercase, capitalize, or none
      bold: boolean                    # Will render as **text**
      italic: boolean                  # Will render as *text*
      underline: boolean               # Will render as __text__
      align: "center"                  # left, center, right (documentation only)
      font_size: "14px"                # CSS size value
      color: "#FF5733"                 # Hex color code
      background_color: "#FFFFFF"      # Hex color code
```

## Format Properties

### `format_scope`

Determines where formatting applies when the token is inserted:

- **`"line"`** (default): Format applies to the entire current text line
  ```
  User types: Hello world
  After Scene token with uppercase format:
  SCENE: HELLO WORLD
  ```

- **`"prefix"`**: Format applies only to the inserted prefix
  ```
  User types: hello world
  After Scene token with uppercase format:
  SCENE: hello world
  ```

### `text_transform` Values

- **`"uppercase"`**: Converts text to UPPERCASE
- **`"lowercase"`**: Converts text to lowercase  
- **`"capitalize"`**: First letter uppercase, rest lowercase
- **`"none"`**: No transformation (default)

### Styling Properties

- **`bold`**: true/false - Renders as **formatted**
- **`italic`**: true/false - Renders as *formatted*
- **`underline`**: true/false - Renders as __formatted__
- **`align`**: "left" | "center" | "right" - Text alignment hint
- **`font_size`**: CSS size like "14px" or "1.2em"
- **`color`**: Hex code like "#FF5733"
- **`background_color`**: Hex code for background highlight

## Built-in Templates

### 1. `script_default.yaml`

Default screenplay formatting inspired by Trelby. Includes:
- Scene headers (uppercase)
- Action blocks
- Character names
- Dialogue
- Sound effects and music cues
- Notes and payoffs

**Example Usage**:
```yaml
- id: scene
  label: Scene
  prefix: "SCENE:"
  format_scope: "line"
  format:
    text_transform: "uppercase"
```

### 2. `trelby_screenplay.yaml`

Professional screenplay format matching Trelby screenplay editor. Features:
- INT./EXT. scene headings
- Character names (centered, uppercase)
- Transitions (right-aligned, uppercase)
- Shot descriptions
- Sound effects and music
- Emotional beats

**Example Usage**:
```yaml
- id: character
  label: Character Name
  prefix: "[CHAR]"
  format_scope: "line"
  format:
    text_transform: "uppercase"
    align: "center"
```

### 3. `technical_doc.yaml`

Technical documentation and API reference formatting. Includes:
- Code blocks and inline code
- Warning/Alert boxes (red, bold)
- Info notes (cyan, bold)  
- Tips (green, bold)
- Function and parameter documentation
- Examples and step-by-step instructions

**Example Usage**:
```yaml
- id: warning
  label: Warning
  prefix: "⚠ WARNING:"
  format_scope: "line"
  format:
    text_transform: "uppercase"
    bold: true
    color: "#FF6B6B"
```

### 4. `novel_writing.yaml`

Novel and creative writing formatting. Features:
- Chapter headings (centered, large, bold)
- Internal thoughts (italic)
- Scene breaks and time transitions
- Character introductions
- Plot points and callbacks
- Foreshadowing and author notes

**Example Usage**:
```yaml
- id: thought
  label: Internal Thought
  prefix: "*"
  format_scope: "line"
  format:
    italic: true
```

## Creating Custom Templates

### Step 1: Create Template File

Create a new YAML file in `/data/markups/` with your custom template ID:

```bash
/data/markups/my_custom_template.yaml
```

### Step 2: Define Template Structure

```yaml
id: my_custom_template
label: "My Custom Template"
description: "Description of what this template is for"

tokens:
  - id: token_1
    label: "Token Display Name"
    prefix: "PREFIX:"
    format_scope: "line"
    format:
      text_transform: "uppercase"
```

### Step 3: Use in Project

Reference the template in your blueprint YAML using the template ID:

```yaml
properties:
  - id: scene_description
    label: "Scene"
    type: text
    markup_profile: my_custom_template  # Uses all tokens from template
```

Or inline specific tokens:

```yaml
properties:
  - id: dialogue
    label: "Dialogue"
    type: text
    markup:
      tokens:
        - id: speaker
          label: "Speaker"
          prefix: ">"
          format_scope: "line"
          format:
            text_transform: "uppercase"
```

## Use Cases

### Screenplay Writing
Use `trelby_screenplay.yaml` for industry-standard script formatting with character names centered and scene headings uppercase.

### Technical Writing
Use `technical_doc.yaml` to highlight warnings, code examples, and documentation structure with color-coded sections.

### Novel Writing
Use `novel_writing.yaml` for chapter breaks, internal thoughts (italic), scene transitions, and plot point markers.

### Custom Business Process
Create a template with tokens for status updates, risk indicators, decision points, etc., all auto-formatted when inserted.

## Example Workflow

### Creating a Screenplay Scene

1. Start with blank line
2. Click "Scene Heading" button → Inserts "INT." prefix
3. Type "RESTAURANT - DAY"
4. Button auto-formats to: "INT. RESTAURANT - DAY" (uppercase applied to entire line)
5. Press Enter to new line
6. Click "Action" button
7. Type "John sits at the table"
8. Line remains as-is (no formatting for action)

### Creating Technical Documentation

1. Click "Code Block" button → Inserts "```"
2. Type your code
3. Click "Warning" button → Inserts "⚠ WARNING:" in red, bold
4. Type "Don't use this in production"
5. Result: `⚠ WARNING: DON'T USE THIS IN PRODUCTION` (red, bold, uppercase)

## Advanced Features

### Regex Pattern Matching

For tokens with complex structure, use regex to parse existing text:

```yaml
- id: speaker
  label: "Speaker"
  pattern: '^(?P<name>[A-Z][A-Z0-9_ ]+):\s*(?P<text>.*)$'
  # Parses: "JOHN: Hello there"
  # Extracts: name="JOHN", text="Hello there"
```

### Combining Format Properties

Stack multiple formatting options:

```yaml
- id: critical
  label: "Critical"
  prefix: "❌ CRITICAL:"
  format_scope: "line"
  format:
    text_transform: "uppercase"
    bold: true
    italic: true
    color: "#FF0000"
    background_color: "#FFFFCC"
```

## File Organization

```
/data/markups/
├── script_default.yaml        # Default screenplay format
├── trelby_screenplay.yaml     # Professional screenplay (Trelby-inspired)
├── technical_doc.yaml         # Technical/API documentation
├── novel_writing.yaml         # Novel and creative writing
└── [your_custom_template].yaml # Your custom templates
```

## Implementation Notes

- Templates are loaded once at startup and cached
- Formatting is applied to plain text content
- Multiple templates can coexist and be selected per-project
- Text transforms are case-sensitive (use lowercase for text before applying uppercase)
- Color and alignment properties are hints for future visual formatting enhancements

## Future Enhancements

- Visual styling in editor (inline colors, alignment display)
- Character-level formatting (format specific words)
- Conditional formatting (format based on content)
- Template inheritance (extend existing templates)
- Formatting preview panel before applying
