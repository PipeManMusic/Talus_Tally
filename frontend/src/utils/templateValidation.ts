/**
 * Frontend template schema validation to prevent UI crashes from malformed data.
 */

import type { TemplateSchema } from '../api/client';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate template schema structure before using it in the UI.
 * Catches missing required fields and malformed data that could cause rendering errors.
 */
export function validateTemplateSchema(schema: any): ValidationResult {
  const errors: string[] = [];

  // Check if schema exists and is an object
  if (!schema || typeof schema !== 'object') {
    return {
      isValid: false,
      errors: ['Template schema is null or not an object']
    };
  }

  // Check required top-level fields
  if (!schema.id) errors.push('Missing required field: id');
  if (!schema.name) errors.push('Missing required field: name');
  
  // Check node_types exists and is an array
  if (!schema.node_types) {
    errors.push('Missing required field: node_types');
  } else if (!Array.isArray(schema.node_types)) {
    errors.push('node_types must be an array');
  } else if (schema.node_types.length === 0) {
    errors.push('node_types cannot be empty');
  } else {
    // Validate each node type
    schema.node_types.forEach((nodeType: any, idx: number) => {
      const path = `node_types[${idx}]`;
      
      if (!nodeType || typeof nodeType !== 'object') {
        errors.push(`${path}: must be an object`);
        return;
      }
      
      if (!nodeType.id) {
        errors.push(`${path}: missing required field 'id'`);
      }
      
      if (!nodeType.name) {
        errors.push(`${path}: missing required field 'name'`);
      }
      
      // Validate properties if present
      if (nodeType.properties) {
        if (!Array.isArray(nodeType.properties)) {
          errors.push(`${path}.properties: must be an array`);
        } else {
          nodeType.properties.forEach((prop: any, propIdx: number) => {
            const propPath = `${path}.properties[${propIdx}]`;
            
            if (!prop || typeof prop !== 'object') {
              errors.push(`${propPath}: must be an object`);
              return;
            }
            
            if (!prop.id) {
              errors.push(`${propPath}: missing required field 'id'`);
            }
            
            if (!prop.name) {
              errors.push(`${propPath}: missing required field 'name'`);
            }
            
            // Validate select properties have options
            if (prop.type === 'select') {
              if (!prop.options) {
                errors.push(`${propPath}: select type requires 'options' field`);
              } else if (!Array.isArray(prop.options)) {
                errors.push(`${propPath}.options: must be an array`);
              } else if (prop.options.length === 0) {
                errors.push(`${propPath}.options: cannot be empty for select type`);
              } else {
                // Validate each option has required fields
                const optionNames = new Set<string>();
                prop.options.forEach((opt: any, optIdx: number) => {
                  const optPath = `${propPath}.options[${optIdx}]`;
                  
                  // Option must be object or string
                  if (typeof opt === 'string') {
                    // String options need to be converted to {name, value} format
                    // Check for duplicates
                    if (optionNames.has(opt)) {
                      errors.push(`${optPath}: duplicate option value '${opt}'`);
                    }
                    optionNames.add(opt);
                  } else if (opt && typeof opt === 'object') {
                    // Object options must have 'name' field
                    if (!opt.name) {
                      errors.push(`${optPath}: missing required field 'name'`);
                    } else {
                      // Check for duplicate names
                      if (optionNames.has(opt.name)) {
                        errors.push(`${optPath}: duplicate option name '${opt.name}'`);
                      }
                      optionNames.add(opt.name);
                    }
                  } else {
                    errors.push(`${optPath}: must be a string or object, got ${typeof opt}`);
                  }
                });
              }
            }
          });
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Safely extract options from a property, with fallback for malformed data.
 * Returns normalized options array with {value, label} format.
 */
export function safeExtractOptions(prop: any): Array<{value: string; label: string}> {
  if (!prop || !prop.options || !Array.isArray(prop.options)) {
    console.warn('Property has no valid options array:', prop);
    return [];
  }

  return prop.options.map((opt: any, idx: number) => {
    // Handle string options
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    
    // Handle object options
    if (opt && typeof opt === 'object') {
      const label = opt.name || opt.label || `Option ${idx + 1}`;
      // Use opt.id as value if available (unique UUID from backend), otherwise use label
      const value = opt.id || label;
      return {
        value,
        label
      };
    }
    
    // Fallback for malformed options
    console.warn('Malformed option:', opt);
    return { value: `option-${idx}`, label: `Option ${idx + 1}` };
  });
}
