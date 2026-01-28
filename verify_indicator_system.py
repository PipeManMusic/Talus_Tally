#!/usr/bin/env python3
"""Quick verification that indicator system is fully integrated."""

import os
import sys

def verify_indicator_system():
    """Verify all components of the indicator system."""
    
    print("=" * 60)
    print("INDICATOR SYSTEM VERIFICATION")
    print("=" * 60)
    
    # Check 1: Catalog file exists
    catalog_path = "assets/indicators/catalog.yaml"
    if os.path.exists(catalog_path):
        print("✓ Indicator catalog exists")
    else:
        print("✗ Indicator catalog NOT FOUND")
        return False
    
    # Check 2: SVG files exist
    svg_files = [
        "assets/indicators/status_empty.svg",
        "assets/indicators/status_partial.svg",
        "assets/indicators/status_filled.svg",
        "assets/indicators/status_alert.svg"
    ]
    
    all_svgs_exist = True
    for svg in svg_files:
        if os.path.exists(svg):
            print(f"✓ {svg} exists")
        else:
            print(f"✗ {svg} NOT FOUND")
            all_svgs_exist = False
    
    if not all_svgs_exist:
        return False
    
    # Check 3: IndicatorCatalog class exists
    try:
        from backend.infra.schema_loader import IndicatorCatalog
        print("✓ IndicatorCatalog class importable")
    except ImportError as e:
        print(f"✗ Failed to import IndicatorCatalog: {e}")
        return False
    
    # Check 4: SchemaLoader has indicator_catalog
    try:
        from backend.infra.schema_loader import SchemaLoader
        loader = SchemaLoader()
        if loader.indicator_catalog is not None:
            print("✓ SchemaLoader initializes with indicator_catalog")
        else:
            print("✗ SchemaLoader indicator_catalog is None")
            return False
    except Exception as e:
        print(f"✗ Error initializing SchemaLoader: {e}")
        return False
    
    # Check 5: TreeViewModel accepts catalog
    try:
        from backend.ui.viewmodels.renderer import TreeViewModel
        renderer = TreeViewModel(indicator_catalog=loader.indicator_catalog)
        if renderer.indicator_catalog is not None:
            print("✓ TreeViewModel accepts indicator_catalog")
        else:
            print("✗ TreeViewModel indicator_catalog is None")
            return False
    except Exception as e:
        print(f"✗ Error creating TreeViewModel: {e}")
        return False
    
    # Check 6: Template has indicator_id mappings
    try:
        blueprint = loader.load("data/templates/restomod.yaml")
        
        # Find task node type
        task_type = None
        for nt in blueprint.node_types:
            if nt.id == "task":
                task_type = nt
                break
        
        if task_type is None:
            print("✗ Task node type not found in blueprint")
            return False
        
        # Check status property has indicator_id
        properties = task_type._extra_props.get('properties', [])
        status_prop = None
        for prop in properties:
            if prop.get('id') == 'status':
                status_prop = prop
                break
        
        if status_prop is None:
            print("✗ Status property not found in task")
            return False
        
        has_indicator_ids = False
        for option in status_prop.get('options', []):
            if 'indicator_id' in option:
                has_indicator_ids = True
                break
        
        if has_indicator_ids:
            print("✓ Template options have indicator_id mappings")
        else:
            print("✗ Template options missing indicator_id")
            return False
    
    except Exception as e:
        print(f"✗ Error verifying template: {e}")
        return False
    
    print("\n" + "=" * 60)
    print("ALL CHECKS PASSED ✓")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = verify_indicator_system()
    sys.exit(0 if success else 1)
