# Template Loading Robustness Implementation

## Overview
The template loading system has been hardened to prevent UI freezes and provide clear error feedback when templates have issues. Since the entire application depends on templates, robust validation ensures users are informed of problems rather than experiencing silent failures and frozen UIs.

## Components Implemented

### 1. Backend Template Validation (`backend/infra/template_validator.py`)
Validates template YAML structure before processing:

**Validates:**
- Required top-level fields: `id`, `name`, `node_types`
- Node type definitions: `id`, `label` or `name`
- Property definitions: `id`, `label` or `name`, valid `type`
- Select properties: `options` field exists, is non-empty array
- Option structure: each option has `name` field, no duplicate names
- No malformed data types (arrays are arrays, objects are objects, etc.)

**When validation fails:**
- Raises `TemplateValidationError` with detailed error messages
- Each error specifies the exact path (e.g., `node_types[0].properties[1].options[2]`)
- Backend logs the full error for debugging

**API Response (400 Bad Request):**
```json
{
  "error": {
    "code": "TEMPLATE_VALIDATION_ERROR",
    "message": "Template validation failed: ...",
    "details": "Full error messages with field paths"
  }
}
```

### 2. Backend Error Handling
API endpoints updated to catch and properly report validation errors:

**Endpoints protected:**
- `POST /projects/new` - Creating new projects
- `POST /projects/load` - Loading existing projects  
- `GET /templates/<id>/schema` - Fetching template schemas

**Error handling strategy:**
- Validation errors: Return 400 Bad Request with details ✓
- File not found: Return 404 Not Found ✓
- Other errors: Return 500 Internal Server Error with details ✓

### 3. Frontend Template Validation (`frontend/src/utils/templateValidation.ts`)
Client-side validation of schemas received from API:

**Functions:**
- `validateTemplateSchema(schema)` - Validates complete template schema structure
- `safeExtractOptions(prop)` - Safely extracts select options with fallbacks for malformed data

**Validation checks:**
- Schema exists and is an object
- All required fields present
- Arrays are actually arrays
- Select properties have valid options
- Options have required fields and no duplicates

**Returns:**
```typescript
{
  isValid: boolean,
  errors: string[]
}
```

### 4. Frontend Error Display
Three layers of error visibility:

**Layer 1: Alert dialogs**
- Shown immediately when templates fail to load
- Clear error messages with user guidance
- Indicates if template is corrupted, invalid, or incompatible

**Layer 2: React Error Boundary**
- Catches any rendering errors that slip through
- Located at `frontend/src/components/dev/ErrorBoundary.tsx`
- Shows detailed error info with reload button
- Prevents entire application crash

**Layer 3: Console logging**
- All validation errors logged with context
- Developer tools accessible for debugging

### 5. Integration Points

**New Project Creation:**
1. User selects template ID
2. Backend creates graph
3. Backend validates template YAML
4. Frontend fetches template schema
5. Frontend validates received schema
6. If any validation fails → user gets error alert instead of freeze

**Project Loading:**
1. User selects file with `template_id` reference
2. File loaded and parsed
3. Graph normalized
4. Template schema fetched from backend
5. Frontend validates schema
6. If validation fails → alert shown but project still loads (graceful degradation)

**Session Restoration:**
1. On app startup, previous session restored if available
2. Template schema for that session fetched
3. Schema validated before setting state
4. If invalid → warning logged, schema set to null, fallback used

## Error Messages

Users see clear, actionable error messages:

### Template Validation Error (on new project)
```
Template Error: Template validation failed:
  - node_types[0]: missing required field 'label' or 'name'
  - node_types[0].properties[1].options: cannot be empty for 'select' type

The template may be invalid. Please check the template file.
```

### API Error Response Example
```
Template validation failed for project_talus:
  node_types[0].properties[2]: missing required field 'id'
```

### Rendering Error (if something slips through)
```
⚠ Application Error

An error occurred while rendering this component. This might be due to:
- Invalid or corrupted template data
- Missing required fields in the data
- Incompatible template version
- Network connection issues

[Error Details...] [Reload Application]
```

## Testing

### Test Template: `data/templates/broken_template.yaml`
Created a deliberately broken template to verify error handling:
- Missing required node type fields
- Empty select options
- Other structural errors

**To test:**
1. Try to create new project with `broken_template` template ID
2. Should see validation error alert instead of freezing UI
3. Check browser console for detailed validation errors
4. Check server logs for backend validation messages

### Testing Error Paths
1. **Corrupted template file** → Backend validation catches it
2. **Missing schema fields** → Frontend validation catches it
3. **Rendering error** → Error Boundary catches it
4. **Network error** → Caught in try-catch with error alert

## Configuration

No configuration needed. Validation is always enabled and happens automatically.

## Debugging

### To enable debug logging:
Check browser console (Developer Tools), which shows:
- Template schema fetch status
- Validation results (pass/fail with details)
- All errors with full context

### Backend logging:
Check server logs for:
```
[SchemaLoader.load] VALIDATION ERROR: ...
Template validation error for project_talus: ...
```

## Examples

### Valid select property (CORRECT):
```yaml
- id: "status"
  label: "Status"
  type: "select"
  options:
    - name: "Available"
      indicator_id: "filled"
    - name: "In Use"
      indicator_id: "partial"
```

### Invalid select property (WRONG):
```yaml
- id: "status"
  label: "Status"
  type: "select"
  options: []  # ❌ Empty options
```

```yaml
- id: "status"
  # ❌ Missing label/name
  type: "select"
  options:
    - name: "Option 1"
```

## Performance Impact

Minimal overhead:
- Schema validation: < 1ms for typical templates
- Only runs on template load/fetch, not on every render
- Fallback option extraction: handles malformed data safely without crashing

## Summary

The application now:
✅ Validates templates before using them  
✅ Shows clear error messages to users  
✅ Prevents UI freezes from template errors  
✅ Logs detailed errors for debugging  
✅ Has fallback behavior for graceful degradation  
✅ Catches and displays rendering errors  

This makes the system robust and user-friendly, preventing the silent failures and freezes that occurred before.
