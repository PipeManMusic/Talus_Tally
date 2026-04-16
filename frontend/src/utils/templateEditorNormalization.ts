type LooseRecord = Record<string, any>;

const getUniqueOptionName = (candidate: string, used: Set<string>, ordinal: number): string => {
  const base = candidate.trim() || `Option ${ordinal}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let suffix = 2;
  let next = `${base} (${suffix})`;
  while (used.has(next)) {
    suffix += 1;
    next = `${base} (${suffix})`;
  }
  used.add(next);
  return next;
};

const normalizeSelectOptions = (options: unknown): Array<Record<string, any>> => {
  const sourceOptions = Array.isArray(options) ? options : [];
  const usedNames = new Set<string>();
  const normalized = sourceOptions.map((option, index) => {
    const optionRecord = typeof option === 'object' && option != null ? { ...(option as LooseRecord) } : {};
    const rawName = typeof option === 'string' ? option : String(optionRecord.name || '');
    const name = getUniqueOptionName(rawName, usedNames, index + 1);

    const nextOption: Record<string, any> = {
      ...optionRecord,
      name,
    };

    if (typeof nextOption.indicator_id !== 'string' || !nextOption.indicator_id.trim()) {
      delete nextOption.indicator_id;
    }

    return nextOption;
  });

  if (normalized.length === 0) {
    return [{ name: 'Option 1' }];
  }

  return normalized;
};

const normalizeProperty = (property: unknown): LooseRecord | null => {
  if (!property || typeof property !== 'object') {
    return null;
  }

  const nextProperty: LooseRecord = { ...(property as LooseRecord) };
  nextProperty.type = String(nextProperty.type || 'text');

  if (nextProperty.type === 'select') {
    nextProperty.indicator_set =
      typeof nextProperty.indicator_set === 'string' && nextProperty.indicator_set.trim()
        ? nextProperty.indicator_set
        : 'status';
    nextProperty.options = normalizeSelectOptions(nextProperty.options);

    const statusScores = nextProperty.velocityConfig?.statusScores;
    if (statusScores && typeof statusScores === 'object') {
      const normalizedScores: Record<string, number> = {};
      nextProperty.options.forEach((option: Record<string, any>) => {
        const optionName = String(option.name || '');
        const rawScore = (statusScores as Record<string, unknown>)[optionName];
        if (typeof rawScore === 'number') {
          normalizedScores[optionName] = rawScore;
        }
      });
      nextProperty.velocityConfig = {
        ...nextProperty.velocityConfig,
        statusScores: normalizedScores,
      };
    }
  }

  return nextProperty;
};

const shouldReplaceMergedValue = (current: unknown, incoming: unknown): boolean => {
  if (current === undefined || current === null || current === '') {
    return true;
  }

  if (Array.isArray(current) && Array.isArray(incoming)) {
    if (current.length === 0 && incoming.length > 0) {
      return true;
    }

    const currentHasPlaceholderOnly =
      current.length === 1 &&
      typeof current[0] === 'object' &&
      current[0] != null &&
      (current[0] as Record<string, unknown>).name === 'Option 1';

    if (currentHasPlaceholderOnly && incoming.length > 1) {
      return true;
    }
  }

  if (
    typeof current === 'object' &&
    current != null &&
    !Array.isArray(current) &&
    typeof incoming === 'object' &&
    incoming != null &&
    !Array.isArray(incoming) &&
    Object.keys(current as Record<string, unknown>).length === 0 &&
    Object.keys(incoming as Record<string, unknown>).length > 0
  ) {
    return true;
  }

  return false;
};

const dedupeProperties = (properties: LooseRecord[]): LooseRecord[] => {
  const deduped: LooseRecord[] = [];
  const byId = new Map<string, LooseRecord>();

  properties.forEach((property) => {
    const propertyId = typeof property.id === 'string' ? property.id.trim() : '';
    if (!propertyId) {
      deduped.push(property);
      return;
    }

    const existing = byId.get(propertyId);
    if (!existing) {
      byId.set(propertyId, property);
      deduped.push(property);
      return;
    }

    Object.entries(property).forEach(([key, value]) => {
      const current = existing[key];
      if (shouldReplaceMergedValue(current, value)) {
        existing[key] = value;
      }
    });
  });

  return deduped;
};

export function normalizeTemplateNodeTypes<T extends LooseRecord>(nodeTypes: T[]): T[] {
  const sourceNodeTypes = Array.isArray(nodeTypes) ? nodeTypes : [];
  const validTypeIds = new Set(
    sourceNodeTypes
      .map((nodeType) => String(nodeType?.id || '').trim())
      .filter(Boolean),
  );

  return sourceNodeTypes.map((nodeType) => {
    const rawAllowedChildren = Array.isArray(nodeType.allowed_children) ? nodeType.allowed_children : [];
    const rawAllowedAssetTypes = Array.isArray(nodeType.allowed_asset_types) ? nodeType.allowed_asset_types : [];
    const properties = Array.isArray(nodeType.properties)
      ? nodeType.properties.map(normalizeProperty).filter((property): property is LooseRecord => property !== null)
      : [];
    const dedupedProperties = dedupeProperties(properties);

    const statusPropertyIds = dedupedProperties
      .filter((property) => property.type === 'select' && (property.indicator_set || 'status') === 'status')
      .map((property) => property.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const primaryStatusPropertyId =
      typeof nodeType.primary_status_property_id === 'string' && statusPropertyIds.includes(nodeType.primary_status_property_id)
        ? nodeType.primary_status_property_id
        : undefined;

    return {
      ...nodeType,
      allowed_children: Array.from(
        new Set(
          rawAllowedChildren.filter(
            (childId): childId is string =>
              typeof childId === 'string' &&
              childId.trim().length > 0 &&
              childId !== nodeType.id &&
              validTypeIds.has(childId),
          ),
        ),
      ),
      allowed_asset_types: Array.from(
        new Set(
          rawAllowedAssetTypes.filter(
            (assetType): assetType is string => typeof assetType === 'string' && assetType.trim().length > 0,
          ),
        ),
      ),
      properties: dedupedProperties,
      primary_status_property_id: primaryStatusPropertyId,
    };
  });
}