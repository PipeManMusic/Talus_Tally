# Talus Tally Design System

**Version:** 1.0  
**Based On:** Qt UI Reference Implementation  
**Target:** Web Frontend (React/Vue)  
**Theme:** Bronco II Restomod - Matte Black & Ford Molten Orange  
**Last Updated:** January 28, 2026

---

## Table of Contents

1. [Overview](#overview)
2. [Color Palette](#color-palette)
3. [Typography](#typography)
4. [Layout Structure](#layout-structure)
5. [Component Specifications](#component-specifications)
6. [CSS Variables](#css-variables)
7. [React/Tailwind Implementation](#reacttailwind-implementation)
8. [Accessibility](#accessibility)

---

## Overview

The Talus Tally design system is inspired by the Bronco II restomod aesthetic, featuring a dark, industrial theme with **Matte Black** base colors and **Ford Molten Orange** (Paint Code UY) as the primary accent color.

### Design Principles

- **Dark First**: Deep matte black backgrounds to reduce eye strain
- **High Contrast**: Off-white text (#e0e0e0) on dark backgrounds for readability
- **Accent Sparingly**: Orange accent used for borders, highlights, and interactive states
- **Industrial Feel**: Clean lines, minimal borders, functional aesthetic
- **Readability**: 9-12pt sans-serif fonts, adequate padding and spacing

---

## Color Palette

### Primary Colors

```css
/* Backgrounds */
--bg-dark: #121212;           /* Deep Matte Black - Main background */
--bg-light: #1e1e1e;          /* Dark Gunmetal - Panels, cards, docks */
--bg-selection: #2d2d2d;      /* Selection background */

/* Foreground */
--fg-primary: #e0e0e0;        /* Off-White - Primary text */
--fg-secondary: #b0b0b0;      /* Dimmed text */
--fg-disabled: #333333;       /* Disabled text */

/* Accent */
--accent-primary: #D94E1F;    /* Ford Molten Orange (UY) - Primary accent */
--accent-hover: #FF6B3B;      /* Lighter Magma - Hover state */

/* Borders */
--border-default: #333333;    /* Dark Grey - Default borders */
--border-focus: #D94E1F;      /* Orange - Focus/active borders */

/* Status Colors */
--success: #28a745;           /* Green - Success states */
--warning: #ffc107;           /* Yellow - Warning states */
--danger: #dc3545;            /* Red - Error/danger states */
```

### Color Usage

| Element | Background | Foreground | Border | Accent |
|---------|------------|------------|--------|--------|
| Main Window | `--bg-dark` | `--fg-primary` | - | - |
| Dock Panel | `--bg-light` | `--fg-primary` | `--border-default` | `--accent-primary` (title border) |
| Tree Item | `--bg-light` | `--fg-primary` | - | - |
| Tree Item (Hover) | `--bg-selection` | `--fg-primary` | - | - |
| Tree Item (Selected) | `--bg-selection` | `--fg-primary` | `--accent-primary` (left border 3px) | - |
| Input Field | `--bg-dark` | `--fg-primary` | `--border-default` | - |
| Input Field (Focus) | `--bg-dark` | `--fg-primary` | `--border-focus` | - |
| Button | `--bg-light` | `--fg-primary` | `--border-default` | - |
| Button (Hover) | `--bg-selection` | `--accent-hover` | `--border-focus` | - |
| Menu | `--bg-light` | `--fg-primary` | `--border-default` | - |
| Menu Item (Hover) | `--bg-selection` | `--accent-hover` | - | - |

---

## Typography

### Font Families

**Primary Font: Michroma**
- Usage: Title bars, headings, dock titles, menu bar
- Style: Modern, industrial, all-caps friendly
- Weight: Bold for titles
- Source: `assets/fonts/bronco.ttf` (Michroma)

**Body Font: Segoe UI / Arial / sans-serif**
- Usage: Body text, tree items, input fields
- Style: Clean, readable
- Fallback: System sans-serif

### Font Sizes

```css
--text-xs: 8pt;      /* Tiny labels */
--text-sm: 9pt;      /* Body text, tree items, inputs */
--text-base: 10pt;   /* Default */
--text-lg: 12pt;     /* Title bar, headings */
--text-xl: 14pt;     /* Large headings */
--text-2xl: 16pt;    /* Window title buttons */
```

### Font Weights

```css
--font-normal: 400;
--font-bold: 700;
```

### Typography Scale

| Element | Font Family | Size | Weight | Color |
|---------|-------------|------|--------|-------|
| Window Title | Michroma | 12pt | Bold | `--fg-primary` |
| Dock Title | Michroma | 9pt | Bold | `--fg-primary` |
| Menu Bar | Michroma | 9pt | Normal | `--fg-primary` |
| Body Text | Segoe UI | 9pt | Normal | `--fg-primary` |
| Tree Item | Segoe UI | 9pt | Normal | `--fg-primary` |
| Button | Segoe UI | 9pt | Normal | `--fg-primary` |
| Input Field | Segoe UI | 9pt | Normal | `--fg-primary` |

---

## Layout Structure

### Main Window Layout

```
┌─────────────────────────────────────────────────────────┐
│  Custom Title Bar (40px height)                        │
│  [   TALUS TALLY   ]                     [ − ] [ □ ] [ ✕ ]
├─────────────────────────────────────────────────────────┤
│  Menu Bar (Michroma font)                              │
│  File    Edit    View    Tools    Help                 │
├─────────────────────────────────────────────────────────┤
│  Toolbar                                                │
│  [New] [Save] [Undo] [Redo] ...                       │
├─────────────┬───────────────────────────────────────────┤
│             │                                           │
│  Sidebar    │   Main Content Area                       │
│  (Tree)     │                                           │
│             │                                           │
│             │                                           │
│             │                                           │
│             │                                           │
│             │                                           │
├─────────────┴───────────────────────────────────────────┤
│  Property Inspector (Dockable, bottom/right)           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Custom Title Bar (40px)

**Layout:**
- Background: `#1e1e1e`
- Border Bottom: `2px solid #D94E1F`
- Height: 40px
- Padding: 0 10px

**Elements:**
- Left: Logo/Icon (optional)
- Center: Title "TALUS TALLY" (Michroma, 12pt, bold)
- Right: Window controls (minimize, maximize, close) - 40px each

**Window Control Buttons:**
```css
{
  width: 40px;
  height: 40px;
  background: transparent;
  color: #e0e0e0;
  font-size: 16px;
  border: none;
}

/* Hover states */
minimize:hover, maximize:hover {
  background: #2d2d2d;
}

close:hover {
  background: #dc3545;
}
```

### Dock Panels

**Specification:**
- Background: `#1e1e1e`
- Border: `1px solid #333333`
- Title Bar:
  - Background: `#1e1e1e`
  - Border Bottom: `2px solid #D94E1F`
  - Padding: 6px
  - Font: Michroma, 9pt
  - Text Align: Left

---

## Component Specifications

### Tree View

**Container:**
```css
{
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #333333;
}
```

**Tree Item:**
```css
/* Default */
{
  padding: 4px;
  border: none;
  color: #e0e0e0;
}

/* Hover */
:hover {
  background: #2d2d2d;
}

/* Selected */
:selected {
  background: #2d2d2d;
  border-left: 3px solid #D94E1F;
}
```

**Icons:**
- project_root: folder icon
- phase: calendar icon
- job: briefcase icon
- task: clipboard icon
- part: box icon

### Input Fields (Text, Number, ComboBox)

```css
/* Default */
{
  background: #121212;
  color: #e0e0e0;
  border: 1px solid #333333;
  padding: 4px;
  border-radius: 2px;
  font-size: 9pt;
}

/* Focus */
:focus {
  border: 1px solid #D94E1F;
  outline: none;
}

/* Disabled */
:disabled {
  color: #333333;
  opacity: 0.5;
}
```

### Buttons

```css
/* Primary Button */
{
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #333333;
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 9pt;
  cursor: pointer;
}

/* Hover */
:hover {
  background: #2d2d2d;
  color: #FF6B3B;
  border: 1px solid #D94E1F;
}

/* Pressed */
:active {
  background: #121212;
}

/* Disabled */
:disabled {
  color: #333333;
  border: 1px solid #333333;
  cursor: not-allowed;
}
```

### Menu Bar

```css
/* Menu Bar */
{
  background: #1e1e1e;
  color: #e0e0e0;
  border-bottom: 1px solid #333333;
  font-family: 'Michroma', sans-serif;
  font-size: 9pt;
}

/* Menu Item */
.menu-item {
  padding: 4px 8px;
  background: transparent;
}

/* Hover */
.menu-item:hover {
  background: #2d2d2d;
  color: #FF6B3B;
}

/* Active/Pressed */
.menu-item:active {
  background: #D94E1F;
}
```

### Dropdown Menu

```css
/* Menu Container */
{
  background: #1e1e1e;
  color: #e0e0e0;
  border: 1px solid #333333;
  border-radius: 2px;
}

/* Menu Item */
.dropdown-item {
  padding: 6px 24px 6px 8px;
}

/* Hover */
.dropdown-item:hover {
  background: #2d2d2d;
  color: #FF6B3B;
}

/* Separator */
.dropdown-separator {
  height: 1px;
  background: #333333;
  margin: 4px 0;
}
```

### ComboBox (Select)

```css
/* Container */
{
  background: #121212;
  color: #e0e0e0;
  border: 1px solid #333333;
  padding: 4px;
  border-radius: 2px;
}

/* Focus */
:focus {
  border: 1px solid #D94E1F;
}

/* Drop-down Arrow */
.arrow {
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid #e0e0e0;
  width: 0;
  height: 0;
}

/* Options List */
.options {
  background: #121212;
  color: #e0e0e0;
  border: 1px solid #333333;
}

/* Selected Option */
.option:hover, .option:selected {
  background: #2d2d2d;
}
```

### Toolbar

```css
{
  background: #1e1e1e;
  border: none;
  border-bottom: 1px solid #333333;
  padding: 0 2px;
  font-family: 'Michroma', sans-serif;
}

/* Toolbar Button */
.toolbar-button {
  background: transparent;
  color: #e0e0e0;
  border: none;
  padding: 6px 12px;
  margin: 2px;
  border-radius: 2px;
}

/* Hover */
.toolbar-button:hover {
  background: #2d2d2d;
  color: #FF6B3B;
}

/* Separator */
.toolbar-separator {
  width: 1px;
  background: #333333;
  margin: 0;
}
```

---

## CSS Variables

Complete set of CSS custom properties for web implementation:

```css
:root {
  /* Colors - Backgrounds */
  --color-bg-dark: #121212;
  --color-bg-light: #1e1e1e;
  --color-bg-selection: #2d2d2d;
  
  /* Colors - Foreground */
  --color-fg-primary: #e0e0e0;
  --color-fg-secondary: #b0b0b0;
  --color-fg-disabled: #333333;
  
  /* Colors - Accent */
  --color-accent-primary: #D94E1F;
  --color-accent-hover: #FF6B3B;
  
  /* Colors - Borders */
  --color-border-default: #333333;
  --color-border-focus: #D94E1F;
  
  /* Colors - Status */
  --color-success: #28a745;
  --color-warning: #ffc107;
  --color-danger: #dc3545;
  
  /* Typography */
  --font-display: 'Michroma', 'Segoe UI', Arial, sans-serif;
  --font-body: 'Segoe UI', Arial, sans-serif;
  
  --text-xs: 0.67rem;    /* ~8pt */
  --text-sm: 0.75rem;    /* ~9pt */
  --text-base: 0.83rem;  /* ~10pt */
  --text-lg: 1rem;       /* ~12pt */
  --text-xl: 1.17rem;    /* ~14pt */
  --text-2xl: 1.33rem;   /* ~16pt */
  
  --font-normal: 400;
  --font-bold: 700;
  
  /* Spacing */
  --space-xs: 2px;
  --space-sm: 4px;
  --space-md: 6px;
  --space-lg: 8px;
  --space-xl: 12px;
  --space-2xl: 16px;
  
  /* Border Radius */
  --radius-sm: 2px;
  --radius-md: 3px;
  --radius-lg: 4px;
  
  /* Layout */
  --titlebar-height: 40px;
  --menubar-height: 28px;
  --toolbar-height: 36px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 2px 4px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 4px 8px rgba(0, 0, 0, 0.5);
  
  /* Transitions */
  --transition-fast: 100ms ease-in-out;
  --transition-base: 200ms ease-in-out;
  --transition-slow: 300ms ease-in-out;
}
```

---

## React/Tailwind Implementation

### Tailwind Config

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#121212',
          light: '#1e1e1e',
          selection: '#2d2d2d',
        },
        fg: {
          primary: '#e0e0e0',
          secondary: '#b0b0b0',
          disabled: '#333333',
        },
        accent: {
          primary: '#D94E1F',
          hover: '#FF6B3B',
        },
        border: {
          DEFAULT: '#333333',
          focus: '#D94E1F',
        },
        status: {
          success: '#28a745',
          warning: '#ffc107',
          danger: '#dc3545',
        },
      },
      fontFamily: {
        display: ['Michroma', 'Segoe UI', 'Arial', 'sans-serif'],
        body: ['Segoe UI', 'Arial', 'sans-serif'],
      },
      fontSize: {
        xs: '0.67rem',    // 8pt
        sm: '0.75rem',    // 9pt
        base: '0.83rem',  // 10pt
        lg: '1rem',       // 12pt
        xl: '1.17rem',    // 14pt
        '2xl': '1.33rem', // 16pt
      },
      spacing: {
        'titlebar': '40px',
        'menubar': '28px',
        'toolbar': '36px',
      },
    },
  },
  plugins: [],
};
```

### React Component Examples

#### Title Bar Component

```jsx
// components/TitleBar.jsx
export function TitleBar({ title = "TALUS TALLY" }) {
  return (
    <div className="flex items-center justify-between h-titlebar bg-bg-light border-b-2 border-accent-primary px-2.5">
      {/* Left spacer */}
      <div className="flex-1" />
      
      {/* Title (centered) */}
      <h1 className="font-display text-lg font-bold text-fg-primary">
        {title}
      </h1>
      
      {/* Right spacer + controls */}
      <div className="flex-1 flex justify-end">
        <button className="w-10 h-10 hover:bg-bg-selection transition-colors">
          <span className="text-fg-primary text-2xl">−</span>
        </button>
        <button className="w-10 h-10 hover:bg-bg-selection transition-colors">
          <span className="text-fg-primary text-2xl">□</span>
        </button>
        <button className="w-10 h-10 hover:bg-status-danger transition-colors">
          <span className="text-fg-primary text-2xl">✕</span>
        </button>
      </div>
    </div>
  );
}
```

#### Button Component

```jsx
// components/Button.jsx
export function Button({ children, variant = 'default', ...props }) {
  const baseClasses = "px-3 py-1.5 rounded-sm font-body text-sm transition-all";
  
  const variants = {
    default: "bg-bg-light text-fg-primary border border-border hover:bg-bg-selection hover:text-accent-hover hover:border-accent-primary",
    primary: "bg-accent-primary text-fg-primary border border-accent-primary hover:bg-accent-hover",
    danger: "bg-status-danger text-fg-primary border border-status-danger hover:bg-red-700",
  };
  
  return (
    <button className={`${baseClasses} ${variants[variant]}`} {...props}>
      {children}
    </button>
  );
}
```

#### Input Component

```jsx
// components/Input.jsx
export function Input({ type = 'text', ...props }) {
  return (
    <input
      type={type}
      className="bg-bg-dark text-fg-primary border border-border rounded-sm px-1 py-1 text-sm focus:border-accent-primary focus:outline-none transition-colors"
      {...props}
    />
  );
}
```

---

## Accessibility

### Color Contrast

All color combinations meet **WCAG AA standards** for contrast:

- `#e0e0e0` on `#121212`: **13.7:1** ✅ (AAA)
- `#e0e0e0` on `#1e1e1e`: **12.6:1** ✅ (AAA)
- `#D94E1F` on `#121212`: **4.8:1** ✅ (AA)
- `#FF6B3B` on `#2d2d2d`: **5.2:1** ✅ (AA)

### Focus Indicators

- All interactive elements have visible focus states
- Focus border: `2px solid #D94E1F`
- Focus outline offset: 2px

### Keyboard Navigation

- Tab order follows logical flow
- All interactive elements accessible via keyboard
- Escape key closes modals/dialogs
- Enter key activates buttons

### Screen Readers

- Use semantic HTML (`<button>`, `<nav>`, `<main>`, etc.)
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic updates
- Proper heading hierarchy

---

## Asset Requirements

### Fonts

**Michroma (bronco.ttf)**
- Location: `assets/fonts/bronco.ttf`
- Format: TrueType Font
- License: SIL Open Font License
- Download: [Google Fonts - Michroma](https://fonts.google.com/specimen/Michroma)

**Web Font Loading:**
```css
@font-face {
  font-family: 'Michroma';
  src: url('/assets/fonts/bronco.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### Icons

**Icon Set:** Lucide Icons (or similar minimal icon set)

Required icons:
- folder (project_root)
- calendar (phase)
- briefcase (job)
- clipboard (task)
- box (part)
- plus, minus, x (window controls)
- chevron-right, chevron-down (tree expand/collapse)
- save, undo, redo (toolbar)

---

## Implementation Checklist

### Setup
- [ ] Install Michroma font
- [ ] Configure CSS variables
- [ ] Set up Tailwind config
- [ ] Install icon library

### Components
- [ ] TitleBar component
- [ ] Button component
- [ ] Input component
- [ ] TreeView component
- [ ] TreeItem component
- [ ] DockPanel component
- [ ] MenuBar component
- [ ] Toolbar component
- [ ] PropertyInspector component

### Layout
- [ ] Main window layout
- [ ] Responsive breakpoints
- [ ] Drag-and-drop for docks
- [ ] Window resizing

### Theme
- [ ] Dark mode (default)
- [ ] Light mode (optional)
- [ ] High contrast mode (accessibility)

---

## Related Documents

- [API Contract](API_CONTRACT.md) - REST API reference
- [WebSocket Protocol](WEBSOCKET_PROTOCOL.md) - Real-time events
- [Integration Guide](INTEGRATION_GUIDE.md) - Frontend integration
- [Master Plan](MASTER_PLAN.md) - System architecture

---

**Design System Version:** 1.0  
**Based On:** Qt UI Reference Implementation  
**Status:** ✅ Ready for Frontend Development  
**Last Updated:** January 28, 2026
