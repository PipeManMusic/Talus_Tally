#!/usr/bin/env python3
"""
Template Migration Script

Migrates old template files to the current format by:
1. Removing 'required' field from properties
2. Ensuring required fields exist (label, allowed_children, etc.)
3. Preserving all other data

Usage:
    python3 migrate_templates.py [--dry-run]
"""

import argparse
import sys
import yaml
from pathlib import Path
from backend.infra.template_persistence import TemplatePersistence, get_templates_directory


def migrate_template_data(template: dict) -> tuple[dict, list[str]]:
    """
    Migrate a template data structure to current format.
    
    Returns:
        Tuple of (migrated_template, list_of_changes)
    """
    changes = []
    
    if 'node_types' in template:
        for node_type in template['node_types']:
            node_id = node_type.get('id', 'unknown')
            
            # Ensure required fields exist
            if 'label' not in node_type:
                node_type['label'] = node_type.get('id', 'Unnamed').replace('_', ' ').title()
                changes.append(f"  Added label to node_type '{node_id}'")
                
            if 'allowed_children' not in node_type:
                node_type['allowed_children'] = []
                changes.append(f"  Added allowed_children to node_type '{node_id}'")
                
            if 'properties' not in node_type:
                node_type['properties'] = []
                changes.append(f"  Added properties to node_type '{node_id}'")
            
            # Clean up properties
            for prop in node_type.get('properties', []):
                prop_id = prop.get('id', 'unknown')
                
                # Remove 'required' field
                if 'required' in prop:
                    was_required = prop.pop('required')
                    changes.append(f"  Removed 'required={was_required}' from {node_id}.{prop_id}")
                
                # Ensure label exists
                if 'label' not in prop:
                    prop['label'] = prop.get('id', 'Unnamed').replace('_', ' ').title()
                    changes.append(f"  Added label to property {node_id}.{prop_id}")
                
                # Ensure type exists (required field)
                if 'type' not in prop:
                    prop['type'] = 'text'
                    changes.append(f"  Added missing type='text' to property {node_id}.{prop_id}")
    
    return template, changes


def migrate_templates(dry_run: bool = False):
    """Migrate all templates in the templates directory."""
    templates_dir = Path(get_templates_directory())
    
    if not templates_dir.exists():
        print(f"Templates directory not found: {templates_dir}")
        return 1
    
    print(f"Migrating templates in: {templates_dir}")
    print(f"Mode: {'DRY RUN (no changes will be saved)' if dry_run else 'LIVE (files will be updated)'}\n")
    
    yaml_files = list(templates_dir.glob('*.yaml'))
    
    if not yaml_files:
        print("No template files found.")
        return 0
    
    total_changes = 0
    
    for template_file in yaml_files:
        print(f"\nProcessing: {template_file.name}")
        print("-" * 60)
        
        try:
            # Load template
            with open(template_file, 'r') as f:
                template_data = yaml.safe_load(f)
            
            # Migrate
            migrated_data, changes = migrate_template_data(template_data)
            
            if not changes:
                print("  ✓ No migration needed")
            else:
                print(f"  Found {len(changes)} changes:")
                for change in changes:
                    print(f"    - {change}")
                total_changes += len(changes)
                
                # Save if not dry run
                if not dry_run:
                    with open(template_file, 'w') as f:
                        yaml.dump(migrated_data, f, sort_keys=False, default_flow_style=False)
                    print(f"  ✓ Saved updated template")
                else:
                    print(f"  ⚠ Would save changes (dry run mode)")
        
        except Exception as e:
            print(f"  ✗ Error processing template: {e}")
            if not dry_run:
                return 1
    
    print("\n" + "=" * 60)
    print(f"Migration {'preview' if dry_run else 'complete'}")
    print(f"Total templates processed: {len(yaml_files)}")
    print(f"Total changes {'found' if dry_run else 'applied'}: {total_changes}")
    
    if dry_run and total_changes > 0:
        print("\nRun without --dry-run to apply these changes.")
    
    return 0


def main():
    parser = argparse.ArgumentParser(
        description='Migrate template files to current format',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Preview changes without modifying files
  python3 migrate_templates.py --dry-run
  
  # Apply migrations
  python3 migrate_templates.py
        """
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be changed without modifying files'
    )
    
    args = parser.parse_args()
    
    try:
        sys.exit(migrate_templates(dry_run=args.dry_run))
    except KeyboardInterrupt:
        print("\n\nMigration cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nFatal error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
