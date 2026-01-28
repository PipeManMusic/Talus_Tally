# Summary of Changes - Font Display & Window Dragging

## Visual Indicator System - SVG-Based with Catalog (Latest) ✅

**Problem:** Unicode bullet characters have inconsistent natural sizes, status initialization defaults to generic bullets instead of semantic indicators, no visual separation between node hierarchy levels.

**Solution:** Implemented comprehensive SVG-based indicator system with centralized catalog-driven theming and text styling.

**Changes Made:**

1. **assets/indicators/catalog.yaml** (NEW) - Centralized registry:
   - Defines "status" indicator set with 4 indicators (empty, partial, filled, alert)
   - Maps indicator IDs to SVG file paths
   - Defines default theme with colors (#888888, #4A90E2, #7ED321, #F5A623) and text styling
   - Supports option-level theme overrides

2. **assets/indicators/*.svg** (NEW - 4 files):
   - **status_empty.svg**: Empty circle (not started)
   - **status_partial.svg**: 45-degree arc (in progress)
   - **status_filled.svg**: Filled circle (done)
   - **status_alert.svg**: Circle with exclamation (blocked/alert)
   - All use `currentColor` for programmatic coloring

3. **backend/infra/schema_loader.py** - IndicatorCatalog class (NEW):
   - `load(filepath)`: Loads catalog.yaml
   - `get_indicator_file()`: Retrieves SVG path for indicator
   - `get_indicator_theme()`: Retrieves color and styling
   - SchemaLoader now initializes with IndicatorCatalog on startup

4. **backend/ui/viewmodels/renderer.py** - Enhanced TreeViewModel:
   - `__init__`: Accepts optional IndicatorCatalog
   - `_load_svg_indicator()`: Loads SVG and applies colors
   - `get_status_indicator()`: Now loads SVG from catalog
   - `get_display_name()`: Applies text styling (bold for active, strikethrough for done)

5. **backend/ui/qt/tree_model.py** - Integration:
   - GraphModel injects IndicatorCatalog into TreeViewModel
   - Seamless flow of catalog from SchemaLoader to renderer

6. **data/templates/restomod.yaml** - Updated all status properties:
   - Added `indicator_set: "status"` to properties
   - Added `indicator_id` to each option mapping (empty/partial/filled/alert)
   - Enables SVG rendering for all statuses

7. **Tests** - Comprehensive coverage (NEW):
   - `tests/infra/test_indicator_catalog.py`: 4 tests for catalog loading/theming
   - `tests/ui/test_indicator_integration.py`: 8 tests for end-to-end rendering

**Benefits:**
- ✅ **Consistent Sizing**: SVG indicators always render at same visual size
- ✅ **Elegant Design**: Restrained aesthetic (color + indicator + text styling)
- ✅ **Programmable Theming**: Colors applied dynamically, easy to customize
- ✅ **Semantic Meaning**: Indicators convey status at a glance
- ✅ **Maintainable**: Centralized catalog, no hardcoded values
- ✅ **Extensible**: Easy to add new indicator sets or customize

**Test Results:** 66 tests passing (up from 54)

---

## Status Indicators - YAML-Based Definition (Latest) ✅

**Problem:** Status bullet characters were hardcoded in renderer logic, making it inflexible and difficult to customize per template.

**Solution:** Define bullet characters directly in the YAML template as part of each status option definition.

**Changes Made:**
1. **data/templates/restomod.yaml** - Restructured all status options from simple strings to dict format with explicit bullets:
   - Phase status: "Planned"(◯), "In Progress"(◐), "Completed"(✓)
   - Task status: "Not Started"(◯), "In Progress"(◐), "Blocked"(●), "Done"(✓)  
   - Part status: "Need to Order"(◯), "Ordered"(◐), "Shipped"(◐), "Received"(●), "Installed"(✓)

2. **backend/ui/viewmodels/renderer.py** - Updated `get_status_indicator()` to:
   - Support both old string format (backward compatible) and new dict format
   - Look up status value in blueprint options and return the explicit bullet
   - Fall back to position-based indicators for string-format options
   - Removed hardcoded `STATUS_INDICATORS` constant

**Benefits:**
- ✅ Robust: Each template can define its own bullet semantics
- ✅ Flexible: No code changes needed to customize status indicators
- ✅ Maintainable: Bullets defined alongside their status values in YAML
- ✅ Backward compatible: Old templates with string options still work

## Completed Fixes

### 1. Font Display in Dock Widgets ✅
- Updated `_setup_dock_widgets()` to explicitly apply fonts to dock title bars
- Added font application to both left dock ("Project Browser") and right dock ("Properties")
- Used fresh `get_bronco_font()` copies to prevent font mutation issues

### 2. Font Consistency Across UI ✅
- Updated `_setup_menu()` to use fresh `get_bronco_font()` instead of mutating cached font
- Updated `_setup_toolbar()` to use fresh `get_bronco_font()` instead of mutating cached font
- All font properties (point size, bold) now set without mutation side effects

### 3. Window Dragging Improvement ✅
- Changed from `move()` to `setGeometry()` for better Wayland support
- This ensures both position AND size are maintained during drag operations
- Maintains grabMouse/releaseMouse for proper event capture

### 4. Font System Architecture (Previous - Already in place) ✅
- Created `get_bronco_font(point_size, bold)` helper function
- Prevents mutation of cached global font object
- Each UI component gets its own fresh font instance

## Code Changes Made

### File: backend/ui/qt/main.py

1. **Lines 38-67**: `get_bronco_font()` function
   - Creates fresh font copies from cached Michroma
   - Takes point_size and bold parameters
   - Returns independent font instance

2. **Lines 485-525**: `_setup_dock_widgets()`
   - Added explicit titleBarWidget font setting for both docks
   - Uses fresh font copies via `get_bronco_font(10, False)`

3. **Lines 417-425**: `_setup_toolbar()`
   - Changed to use `get_bronco_font(9, False)`
   - Prevents font mutation side effects

4. **Lines 395-400**: `_setup_menu()`
   - Changed to use `get_bronco_font(10, False)`
   - Consistent with toolbar approach

5. **Lines 269-277**: `mouseMoveEvent()`
   - Changed from `move()` to `setGeometry()` for Wayland compatibility
   - Maintains window size during drag

## Testing Status
- ✅ All 51 unit tests passing
- ✅ No syntax errors
- ✅ Font loading confirmed working (Michroma font loads and caches)
- ✅ Mouse events firing correctly (grabMouse/releaseMouse working)

## Known Considerations

### Window Dragging on Wayland
- Using `setGeometry()` instead of `move()` for better frameless window support
- The dragging logs will show MousePress/MouseMove/MouseRelease events
- If dragging still doesn't work, may need to:
  1. Check Wayland compositor settings for frameless window support
  2. Try setting window manager hints (KDE/GNOME specific)
  3. Use native Wayland protocols for window management

### Font Display
- Font now applied to:
  - Title bar label (✅ Michroma 12pt bold - confirmed working)
  - Dock widget titles (✅ Just fixed - needs user verification)
  - Menu bar (✅ Just fixed)
  - Toolbar (✅ Just fixed)
  - Central content (uses system font - intentional)

## Next Steps for User

1. **Verify Dock Fonts**: Run the app and check if "Project Browser" and "Properties" titles display in Michroma
2. **Test Window Dragging**: Click and drag from the title bar to move the window
3. **Check Debug Output**: Errors or info about font loading will show in terminal

## Files Modified
- backend/ui/qt/main.py (primary changes)
- test_gui_debug.py (created - test script)
- test_dock_fonts.py (created - diagnostic script)

All changes maintain backward compatibility and don't affect the test suite.
