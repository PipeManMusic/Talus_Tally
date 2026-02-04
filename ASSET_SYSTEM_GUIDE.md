# Asset System Implementation - Restomod Template

## Overview

The **Asset System** is a dedicated registry for all reusable resources in a restoration project. Assets can be anything that needs to be managed and tracked: equipment, people, locations, services, vehicles, or consumables.

---

## Project Structure

```
Project Root
├── Assets (Asset Registry)
│   ├── Equipment
│   │   ├── Camera - Sony A7IV
│   │   ├── Camera - Canon 5D
│   │   └── Lighting - LED Panel Set
│   ├── People
│   │   ├── Director of Photography
│   │   └── Gaffer
│   ├── Locations
│   │   ├── Studio A
│   │   └── Outdoor Lot
│   └── Services
│       ├── Color Grading Studio
│       └── Sound Design House
│
├── Phase 1: Pre-Production
│   └── Job: Location Scouting
│       ├── Task: Scout Studio A
│       │   └── Uses Asset: Location - Studio A
│       └── Task: Scout Outdoor Lot
│           └── Uses Asset: Location - Outdoor Lot
│
└── Phase 2: Production
    └── Job: Main Shoot
        └── Task: Primary Shoot
            ├── Uses Asset: Camera - Sony A7IV (qty: 1)
            ├── Uses Asset: Lighting - LED Panel Set (qty: 2)
            ├── Uses Asset: Person - Director of Photography
            └── Uses Asset: Person - Gaffer
```

---

## Node Types

### 1. **Assets** (Container)
- **Purpose:** Container for all asset categories
- **Allowed Children:** `asset_category`
- **Appears Once:** Under project_root
- **Example:** "Assets"

### 2. **Asset Category** (Organizational)
- **Purpose:** Groups related assets by type
- **Allowed Children:** `asset`
- **Examples:** "Equipment", "People", "Locations", "Services", "Vehicles"
- **Properties:**
  - Name (required)
  - Description (optional)

### 3. **Asset** (The Actual Resource)
- **Purpose:** A specific reusable resource
- **Allowed Children:** None (leaf node)
- **Can Be Referenced:** Multiple times across the project
- **Properties:**
  - **Name** (required) - e.g., "Sony A7IV", "John Smith", "Studio A"
  - **Type** - Equipment, Person, Location, Service, Vehicle, Consumable, Other
  - **Description** - Details about the asset
  - **Status** - Available, In Use, Unavailable, Maintenance
  - **Notes** - Additional tracking info

### 4. **Asset Reference** (Link Node)
- **Purpose:** Links a task to an asset it uses
- **Parent:** Can only appear under `task` or `phase`/`job`
- **Allowed Children:** None (leaf node)
- **Properties:**
  - **Name** (required) - Auto-populated from linked asset
  - **Asset ID** (required) - UUID of the asset being linked
  - **Role/Purpose** - How it's used in this task (optional)
  - **Quantity Needed** - How many of this asset are needed

---

## How It Works

### Creating an Asset

1. Open project → Navigate to **Assets**
2. Click Add → Create category (e.g., "Equipment")
3. Click Add under category → Create asset (e.g., "Sony A7IV")
4. Fill in properties: Type, Description, Status, Notes

### Using an Asset in a Task

1. Open a task
2. Click Add Child → Select **"Uses Asset"**
3. Set the "Asset ID" to link to an existing asset
4. Optionally add Role and Quantity
5. The asset reference node appears as a child of the task

### Updating an Asset (Reflected Everywhere)

1. Open the asset under Assets section
2. Edit its properties (status, notes, etc.)
3. All tasks that reference this asset see the updated info
4. No need to update multiple copies - one source of truth

### Finding Where an Asset Is Used

1. Open an asset
2. Backend tracks all `asset_reference` nodes pointing to it
3. Future feature: "Find Uses" button shows all tasks using this asset

---

## Example Workflow

### Initial Setup
```
Assets/Equipment/
  └─ Camera - Sony A7IV
     Status: Available
     Type: Equipment
     Notes: "4K capable, good for detail shots"

Assets/People/
  └─ Director of Photography (Alice)
     Status: Available
     Type: Person
     Notes: "5 years experience"
```

### Task 1: Planning
```
Phase: Pre-Production
└─ Job: Equipment Assessment
   └─ Task: Review Camera Specs
      └─ Uses Asset: Camera - Sony A7IV
         Role: "Primary camera for main shoot"
```

### Task 2: Production (Same Asset)
```
Phase: Production
└─ Job: Main Shoot
   └─ Task: Shoot Scene A
      ├─ Uses Asset: Camera - Sony A7IV
      │  Quantity: 1
      │  Role: "Primary camera"
      │  (Status: In Use, Notes: "4K capable...")
      │
      └─ Uses Asset: Director of Photography
         Role: "Lead cinematographer"
         Status: In Use
```

### Update Asset (Reflects in Both Tasks)
1. Edit Camera asset status → "Maintenance"
2. Both Task 1 and Task 2 show updated status
3. No duplicate updates needed

---

## Benefits

✅ **Single Source of Truth** - One camera definition, used everywhere  
✅ **No Duplication** - Don't recreate the same asset multiple times  
✅ **Real-Time Updates** - Change asset properties once, see everywhere  
✅ **Better Tracking** - Know which assets are available vs. in use  
✅ **Flexible** - Can manage any type of resource  
✅ **Clean Structure** - Assets separated from work breakdown  
✅ **Organized** - Categories keep assets easy to find  

---

## Future Enhancements

- **Asset Library:** Share assets across multiple projects
- **Availability Calendar:** Track when assets are available/booked
- **Usage History:** See which assets were used in completed projects
- **Asset Checkout:** Check equipment in/out with timestamps
- **Cost Tracking:** Aggregate costs for assets used in a project
- **Smart Linking:** Autocomplete search when linking assets
- **Conflict Detection:** Warn if an asset is overbooked for same time

---

## Integration with Existing Features

### Dirty State Tracking
- Creating/updating assets marks the session as dirty
- Updating asset status from a task reference marks as dirty
- Saving the project cleans the dirty state

### Undo/Redo
- Creating an asset_reference → Undo removes it
- Updating an asset property → Undo reverts the change
- Redo re-applies the change

### Indicators
- Asset status can use indicators (Available→filled, In Use→partial, etc.)
- Asset type can have visual indicators

### Search (Future)
- Quick search for assets by name or type
- Filter tasks by which assets they use
- Find all tasks using a specific asset
