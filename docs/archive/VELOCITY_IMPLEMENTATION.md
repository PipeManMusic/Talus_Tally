# Project Velocity System - Implementation Guide

## Overview

The Project Velocity System is a comprehensive task prioritization framework that calculates dynamic priority scores for nodes based on multiple factors including base scores, inheritance from parents, status values, numerical multipliers, and blocking relationships.

## Architecture

### Data Flow

```
Browser/UI
    ↓
API Client (TypeScript interfaces)
    ↓
REST API Endpoints (Flask)
    ↓
Velocity Engine (Python calculation)
    ↓
Graph & Schema Data
```

## Components Implemented

### 1. **Frontend - TypeScript API Client**
**File:** `frontend/src/api/client.ts`

**New Interfaces:**
- `VelocityConfig` - Node type velocity configuration
- `PropertyVelocityConfig` - Property-level velocity configuration  
- `VelocityScore` - Individual node velocity calculation
- `BlockingRelationship` - Node dependencies
- `VelocityRanking` - Complete ranking response

**New API Methods:**
```typescript
async getVelocityRanking(sessionId: string): Promise<VelocityRanking>
async getNodeVelocity(sessionId: string, nodeId: string): Promise<VelocityScore>
async updateBlockingRelationship(sessionId: string, blockedNodeId: string, blockingNodeId: string | null): Promise<any>
async getBlockingGraph(sessionId: string): Promise<{ relationships: BlockingRelationship[] }>
```

### 2. **Frontend - UI Components**

#### VelocityView Component
**File:** `frontend/src/components/velocity/VelocityView.tsx`

Features:
- Displays all nodes ranked by velocity score (highest first)
- Shows score breakdown: Base, Inherited, Status, Numerical
- Indicates blocking status and relationships
- Auto-refreshes every 5 seconds  
- Shows legend explaining score components

Visual layout:
```
Rank | Node Name | Velocity Score
1    | Task A    | 450
2    | Task B    | 380
3    | Task C    | 250
```

#### NodeBlockingEditor Component
**File:** `frontend/src/components/velocity/NodeBlockingEditor.tsx`

Features:
- Create new blocking relationships (Node A blocks Node B)
- View all current relationships
- Remove blocking relationships
- Visual relationship display

#### ToolsView Updated
**File:** `frontend/src/views/ToolsView.tsx`

Features:
- Tab switcher: Overview → Velocity → Blocking
- Integrates both velocity components
- Pass sessionId and nodes to sub-components
- Subcomponents update dynamically

### 3. **Backend - Velocity Calculation Engine**
**File:** `backend/core/velocity_engine.py`

**Class: VelocityEngine**

```python
class VelocityEngine:
    def calculate_velocity(node_id: str) -> VelocityCalculation
    def calculate_all_velocities() -> Dict[str, VelocityCalculation]
    def get_ranking() -> List[(str, VelocityCalculation)]
```

**Calculation Logic:**
1. **Base Score** - Fixed points from node type configuration
2. **Inherited Score** - Sum of all parent node base scores (walking up tree)
3. **Status Score** - Points assigned to current status value
4. **Numerical Score** - Value × multiplier factor for numerical fields
5. **Blocking Penalty** - Blocked nodes get zero velocity
6. **Blocking Inheritance** - Blocking nodes gain all blocked nodes' scores

**Example Calculation:**
```
Node: "Install Widget"
├─ Base Score: 10 (from node type)
├─ Inherited: 20 (parent "Phase 1": 10, grandparent "Project": 10)
├─ Status Score: 15 (status "In Progress": 15 points)
├─ Numerical Score: 30 (2 items × 15 multiplier)
├─ Blocks Node "Beta Testing": 50
└─ Total Velocity: 10 + 20 + 15 + 30 + 50 = 125
```

### 4. **Backend - REST API Routes**
**File:** `backend/api/velocity_routes.py`

**Endpoints:**

```
GET /api/v1/sessions/{id}/velocity
  Returns: { nodes: [VelocityScore], timestamp }
  Description: All nodes ranked by velocity

GET /api/v1/sessions/{id}/nodes/{id}/velocity
  Returns: VelocityScore
  Description: Single node velocity details

POST /api/v1/sessions/{id}/nodes/{id}/blocking
  Body: { blocking_node_id: string | null }
  Returns: { success: bool }
  Description: Update/create blocking relationship

GET /api/v1/sessions/{id}/blocking-graph
  Returns: { relationships: BlockingRelationship[] }
  Description: All blocking relationships
```

## Configuration (Template Schema)

### Node Type Configuration

Add to `NodeTypeSchema`:
```json
{
  "id": "task",
  "name": "Task",
  "velocityConfig": {
    "baseScore": 10,
    "scoreMode": "inherit",
    "penaltyScore": false
  },
  "properties": [...]
}
```

### Property Configuration

Add to property definition:
```json
{
  "id": "quantity",
  "name": "Quantity",
  "type": "number",
  "velocityConfig": {
    "enabled": true,
    "mode": "multiplier",
    "multiplierFactor": 5,
    "penaltyMode": false
  }
}
```

Or for status fields:
```json
{
  "id": "status",
  "name": "Status",
  "type": "status",
  "velocityConfig": {
    "enabled": true,
    "mode": "status",
    "statusScores": {
      "todo": 0,
      "in_progress": 10,
      "done": 5,
      "blocked": -20
    }
  }
}
```

## Usage Flow

### 1. View Task Rankings
1. Navigate to Tools tab
2. Click "Velocity" subtab
3. See all tasks ranked by priority
4. Tasks with higher velocity scores float to top
5. Automatic refresh every 5 seconds

### 2. Create Blocking Relationships
1. Navigate to Tools → Blocking tab
2. Select "Node Being Blocked" (e.g., "Beta Testing")
3. Select "Node Doing the Blocking" (e.g., "Install Widget")
4. Click "Create Relationship"
5. "Install Widget" now inherits "Beta Testing" score
6. "Beta Testing" gets zeroed out

### 3. Example Scenario

**Initial Setup:**
- Phase 1 (base: 10)
  - Design (base: 10, status: 5)
  - Implementation (base: 10, status: 10)
  - Testing (base: 10, status: 0)

**Rankings before blocking:**
```
1. Implementation: 10 + 10 + 10 = 30
2. Design: 10 + 10 + 5 = 25
3. Testing: 10 + 10 + 0 = 20
```

**After marking "Testing blocks Implementation":**
```
1. Implementation: 0 (blocked) + 20 (from Testing) = 20
2. Design: 10 + 10 + 5 = 25
3. Testing: 10 + 10 + 0 = 20 (zeroed)
```

Final rankings:
```
1. Design: 25
2. Implementation: 20 (but gains Testing's score)
3. Testing: 0 (blocked)
```

## Integration Points

### Session Data Storage
Blocking relationships stored in session metadata:
```python
session_data['blocking_relationships'] = [
    {'blockedNodeId': 'node1', 'blockingNodeId': 'node2'},
    ...
]
```

### Caching
VelocityEngine uses internal cache to avoid recalculation:
```python
engine = VelocityEngine(graph, schema, blocking_graph)
calc1 = engine.calculate_velocity(node_id)  # Calculates
calc2 = engine.calculate_velocity(node_id)  # Returns cached
```

## Future Enhancements

1. **Visual Blocking Editor** - Draw lines between nodes
2. **Custom Formulas** - User-defined velocity calculations
3. **Velocity History** - Track score changes over time
4. **Alerts & Notifications** - When highest priority tasks change
5. **Export Reports** - Priority rankings by team/phase
6. **Velocity Forecasting** - Predict completion order

## Testing

### Unit Tests
- VelocityEngine calculation accuracy
- Inheritance logic verification
- Blocking relationship resolution
- Schema validation

### Integration Tests
- API endpoint functionality
- Session data persistence
- Frontend state management
- Real-time updates

## Performance Considerations

- **Caching**: Engine caches calculations per session
- **Lazy Loading**: Only calculate visible nodes initially
- **Batching**: Get all velocities in single API call
- **Auto-refresh**: 5-second interval balances responsiveness vs server load

## Files Modified

**Frontend:**
- `frontend/src/api/client.ts` - Added velocity interfaces and API methods
- `frontend/src/views/ToolsView.tsx` - Added velocity tab switcher
- `frontend/src/App.tsx` - Pass sessionId and nodes to ToolsView

**Backend:**
- `backend/core/velocity_engine.py` - NEW calculation engine
- `backend/api/velocity_routes.py` - NEW API endpoints

**New UI Components:**
- `frontend/src/components/velocity/VelocityView.tsx` - Ranking display
- `frontend/src/components/velocity/NodeBlockingEditor.tsx` - Blocking UI

## Next Steps

1. Register velocity routes in `backend/app.py`:
   ```python
   from backend.api.velocity_routes import velocity_bp
   app.register_blueprint(velocity_bp)
   ```

2. Update template definitions to include velocity configurations

3. Test with sample project data

4. Implement visual blocking editor (canvas-based)

5. Add velocity calculation triggers on node property changes
