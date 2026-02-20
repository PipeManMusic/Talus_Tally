# Project Velocity System Design

## Overview
The velocity system calculates task priority based on:
1. **Base Scores** - Fixed points assigned to node types/individual nodes
2. **Status Scores** - Points assigned based on current status
3. **Numerical Multipliers** - Points multiplied by numerical field values
4. **Inheritance** - Scores accumulated from parent nodes
5. **Blocking Logic** - Blocked nodes zeroed, blocking nodes gain blocked scores

## Data Model

### Template Schema Extensions
```typescript
// In NodeTypeSchema:
velocityConfig?: {
  baseScore?: number;        // Fixed points for this node type
  scoreMode?: 'inherit' | 'fixed';  // inherit = sum parents, fixed = only own
  penaltyScore?: boolean;    // If true, score is subtracted
}

// In property definition:
velocityConfig?: {
  enabled: boolean;
  mode: 'multiplier' | 'status';
  multiplierFactor?: number;  // For numerical fields
  penaltyMode?: boolean;      // If true, higher values = lower scores
  statusScores?: Record<string, number>;  // For option/status fields
}
```

### Node Blocking Relationships
```typescript
node.metadata.blockingRelationships = {
  blockedBy?: string[];  // IDs of nodes blocking this one
  blocks?: string[];     // IDs of nodes this one blocks
}
```

### API Response
```typescript
VelocityScore {
  nodeId: string;
  baseScore: number;
  inheritedScore: number;
  statusScore: number;
  numericalScore: number;
  blockingPenalty: number;
  totalVelocity: number;
  isBlocked: boolean;
  blockedByNodes?: string[];
}
```

## Implementation Phases

### Phase 1: Template System
- [ ] Update `NodeTypeSchema` with velocity config
- [ ] Update template editor to configure velocity
- [ ] Update template storage/loading

### Phase 2: Backend Calculation
- [ ] Create calculation engine in Python
- [ ] Handle inheritance logic
- [ ] Handle blocking logic
- [ ] Create caching mechanism

### Phase 3: API Endpoints
- [ ] `GET /api/sessions/{id}/velocity` - Get all velocity scores
- [ ] `GET /api/sessions/{id}/nodes/{id}/velocity` - Get single node velocity
- [ ] `POST /api/sessions/{id}/nodes/{id}/blocking` - Update blocking relationships
- [ ] `GET /api/sessions/{id}/blocking-graph` - Get all blocking relationships

### Phase 4: UI Components
- [ ] **VelocityView** - List nodes sorted by velocity
- [ ] **NodeBlockingEditor** - Visual editor for blocking relationships
- [ ] **VelocityPropertyEditor** - Configure velocity in template editor

## Calculation Algorithm

```
CALCULATE_VELOCITY(node):
  score = 0
  
  # Base score
  if node.type has baseScore:
    score += baseScore
  
  # Inherited scores from parents
  parent = get_parent(node)
  while parent is not null:
    if parent.type has baseScore:
      score += baseScore
    parent = get_parent(parent)
  
  # Status score
  if current_status has statusScore:
    score += statusScore
  
  # Numerical multiplier
  for each property with velocityConfig.multiplier:
    value = node.properties[prop]
    score += value * multiplierFactor
  
  # Blocking penalty
  if node is blocked:
    score = 0
  
  # Apply blocked nodes' scores
  for each blocked_node:
    score += CALCULATE_VELOCITY(blocked_node)
  
  return score
```

## Files to Create/Modify

### Backend
- `backend/core/velocity_engine.py` - Calculation logic
- `backend/api/velocity_routes.py` - API endpoints
- Update `backend/api/routes.py` - Register velocity routes

### Frontend
- `frontend/src/api/client.ts` - Add velocity interfaces and API methods
- `frontend/src/components/velocity/VelocityView.tsx` - Main velocity list
- `frontend/src/components/velocity/NodeBlockingEditor.tsx` - Blocking UI
- `frontend/src/components/template/VelocityPropertyEditor.tsx` - Template config

### Data
- Update templates with velocity configuration

## Next Steps
1. Start with TypeScript interfaces
2. Implement backend calculation engine
3. Add API endpoints
4. Build UI components
