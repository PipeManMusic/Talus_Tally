/**
 * Frontend types for the Node Templates feature.
 *
 * A NodeTemplate is a reusable subtree preset, saved in the project file,
 * that can be instantiated under a compatible parent node to create a
 * grouping of nodes with default property values.
 */

export interface NodeTemplateNode {
  blueprint_type_id: string;
  name: string;
  /** Default property values keyed by property id (or UUID after backend resolution) */
  properties: Record<string, unknown>;
  children: NodeTemplateNode[];
}

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  root: NodeTemplateNode;
}

/**
 * Server response shape for GET /sessions/<id>/node-templates.
 * The backend tags each template with whether it can be instantiated under
 * the parent type passed via the `parent_type` query string.
 */
export interface NodeTemplateListEntry extends NodeTemplate {
  compatible: boolean;
}

/** Convenience helper — produce a fresh empty template node. */
export function emptyTemplateNode(blueprintTypeId: string, name = ""): NodeTemplateNode {
  return {
    blueprint_type_id: blueprintTypeId,
    name,
    properties: {},
    children: [],
  };
}
