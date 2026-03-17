import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useFilterStore } from '../store/filterStore';
import type { FilterRule } from '../store/filterStore';

const FILTER_TAB_VISIBLE_STORAGE_KEY = 'talus-tally:filter-tab-visible';

// Helper: always read fresh state after mutations
const $ = () => useFilterStore.getState();

describe('useFilterStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store before each test using direct state access (no React context needed)
    $().clearRules();
    $().setFilterMode('ghost');
    $().setExpanded(false);
    $().setFilterTabVisible(true);
  });

  describe('initial state', () => {
    it('has empty rules array', () => {
      
      expect($().rules).toEqual([]);
    });

    it('has ghost mode as default', () => {
      
      expect($().filterMode).toBe('ghost');
    });

    it('has collapsed state by default', () => {
      
      expect($().isExpanded).toBe(false);
    });

    it('has filterTabVisible true by default', async () => {
      vi.resetModules();
      localStorage.clear();

      const reloadedModule = await import('../store/filterStore');

      expect(reloadedModule.useFilterStore.getState().filterTabVisible).toBe(true);
    });
  });

  describe('addRule', () => {
    it('adds a new rule with auto-generated ID', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      expect($().rules).toHaveLength(1);
      expect($().rules[0]).toMatchObject({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });
      expect($().rules[0].id).toBeTruthy();
      expect($().rules[0].id).toMatch(/^filter-/);
    });

    it('generates unique IDs for each rule', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      $().addRule({
        property: 'priority',
        operator: 'greater_than',
        value: 3,
      });

      expect($().rules[0].id).not.toBe($().rules[1].id);
    });

    it('preserves existing rules when adding new one', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const firstRuleId = $().rules[0].id;

      $().addRule({
        property: 'priority',
        operator: 'greater_than',
        value: 3,
      });

      expect($().rules).toHaveLength(2);
      expect($().rules[0].id).toBe(firstRuleId);
      expect($().rules[1].id).not.toBe(firstRuleId);
    });

    it('supports all operator types', () => {
      
      const operators = ['equals', 'not_equals', 'contains', 'greater_than', 'less_than'] as const;

      operators.forEach((op) => {
        $().addRule({
          property: 'test_prop',
          operator: op,
          value: 'test',
        });
      });

      expect($().rules).toHaveLength(5);
      operators.forEach((op, i) => {
        expect($().rules[i].operator).toBe(op);
      });
    });

    it('handles various value types', () => {
      

      $().addRule({ property: 'str', operator: 'equals', value: 'string' });
      $().addRule({ property: 'num', operator: 'equals', value: 123 });
      $().addRule({ property: 'bool', operator: 'equals', value: true });
      $().addRule({ property: 'null', operator: 'equals', value: null });

      expect($().rules[0].value).toBe('string');
      expect($().rules[1].value).toBe(123);
      expect($().rules[2].value).toBe(true);
      expect($().rules[3].value).toBe(null);
    });
  });

  describe('updateRule', () => {
    it('updates rule property', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const ruleId = $().rules[0].id;

      $().updateRule(ruleId, {
        property: 'status_new',
      });

      expect($().rules[0].property).toBe('status_new');
      expect($().rules[0].operator).toBe('equals'); // Unchanged
      expect($().rules[0].value).toBe('active'); // Unchanged
    });

    it('updates rule operator', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const ruleId = $().rules[0].id;

      $().updateRule(ruleId, {
        operator: 'not_equals',
      });

      expect($().rules[0].operator).toBe('not_equals');
      expect($().rules[0].property).toBe('status'); // Unchanged
    });

    it('updates rule value', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const ruleId = $().rules[0].id;

      $().updateRule(ruleId, {
        value: 'inactive',
      });

      expect($().rules[0].value).toBe('inactive');
    });

    it('updates multiple properties at once', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const ruleId = $().rules[0].id;

      $().updateRule(ruleId, {
        property: 'priority',
        operator: 'greater_than',
        value: 5,
      });

      expect($().rules[0]).toMatchObject({
        property: 'priority',
        operator: 'greater_than',
        value: 5,
      });
    });

    it('does nothing if rule ID does not exist', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const originalLength = $().rules.length;

      $().updateRule('nonexistent-id', {
        property: 'new_prop',
      });

      expect($().rules).toHaveLength(originalLength);
      expect($().rules[0].property).toBe('status'); // Unchanged
    });

    it('preserves rule ID when updating', () => {
      

      $().addRule({
        property: 'status',
        operator: 'equals',
        value: 'active',
      });

      const originalId = $().rules[0].id;

      $().updateRule(originalId, {
        property: 'priority',
      });

      expect($().rules[0].id).toBe(originalId);
    });

    it('does not affect other rules when updating one', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });

      const secondRuleId = $().rules[1].id;

      $().updateRule($().rules[0].id, {
        property: 'name',
      });

      expect($().rules[1].id).toBe(secondRuleId); // Unchanged
      expect($().rules[1].property).toBe('priority'); // Unchanged
    });
  });

  describe('removeRule', () => {
    it('removes rule by ID', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });

      const ruleToRemove = $().rules[0].id;

      $().removeRule(ruleToRemove);

      expect($().rules).toHaveLength(1);
      expect($().rules[0].property).toBe('priority');
    });

    it('does nothing if rule ID does not exist', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });

      const originalLength = $().rules.length;

      $().removeRule('nonexistent-id');

      expect($().rules).toHaveLength(originalLength);
    });

    it('can remove all rules one by one', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });
      $().addRule({ property: 'name', operator: 'contains', value: 'test' });

      expect($().rules).toHaveLength(3);

      $().rules.forEach((rule) => {
        $().removeRule(rule.id);
      });

      expect($().rules).toHaveLength(0);
    });

    it('does not affect other rules when removing one', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });
      $().addRule({ property: 'name', operator: 'contains', value: 'test' });

      const secondRuleId = $().rules[1].id;
      const thirdRuleId = $().rules[2].id;

      $().removeRule($().rules[0].id);

      expect($().rules).toHaveLength(2);
      expect($().rules[0].id).toBe(secondRuleId);
      expect($().rules[1].id).toBe(thirdRuleId);
    });
  });

  describe('clearRules', () => {
    it('removes all rules', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });
      $().addRule({ property: 'name', operator: 'contains', value: 'test' });

      expect($().rules).toHaveLength(3);

      $().clearRules();

      expect($().rules).toHaveLength(0);
      expect($().rules).toEqual([]);
    });

    it('does nothing if rules array is already empty', () => {
      

      $().clearRules();

      expect($().rules).toHaveLength(0);
    });

    it('only clears rules, does not affect other state', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().setFilterMode('hide');
      $().setExpanded(true);

      $().clearRules();

      expect($().rules).toHaveLength(0);
      expect($().filterMode).toBe('hide'); // Unchanged
      expect($().isExpanded).toBe(true); // Unchanged
    });
  });

  describe('setFilterMode', () => {
    it('sets filter mode to hide', () => {
      

      $().setFilterMode('hide');

      expect($().filterMode).toBe('hide');
    });

    it('sets filter mode to ghost', () => {
      

      $().setFilterMode('hide');
      $().setFilterMode('ghost');

      expect($().filterMode).toBe('ghost');
    });

    it('can toggle between modes', () => {
      

      $().setFilterMode('hide');
      expect($().filterMode).toBe('hide');

      $().setFilterMode('ghost');
      expect($().filterMode).toBe('ghost');

      $().setFilterMode('hide');
      expect($().filterMode).toBe('hide');
    });

    it('does not affect rules when changing mode', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });

      const rulesBefore = JSON.stringify($().rules);

      $().setFilterMode('hide');

      expect(JSON.stringify($().rules)).toBe(rulesBefore);
    });
  });

  describe('toggleExpanded', () => {
    it('toggles expanded state from false to true', () => {
      

      expect($().isExpanded).toBe(false);

      $().toggleExpanded();

      expect($().isExpanded).toBe(true);
    });

    it('toggles expanded state from true to false', () => {
      

      $().setExpanded(true);
      $().toggleExpanded();

      expect($().isExpanded).toBe(false);
    });

    it('toggles multiple times', () => {
      

      $().toggleExpanded(); // false -> true
      expect($().isExpanded).toBe(true);

      $().toggleExpanded(); // true -> false
      expect($().isExpanded).toBe(false);

      $().toggleExpanded(); // false -> true
      expect($().isExpanded).toBe(true);
    });

    it('does not affect rules when toggling', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });

      const rulesBefore = JSON.stringify($().rules);

      $().toggleExpanded();

      expect(JSON.stringify($().rules)).toBe(rulesBefore);
    });
  });

  describe('setExpanded', () => {
    it('sets expanded to true', () => {
      

      $().setExpanded(true);

      expect($().isExpanded).toBe(true);
    });

    it('sets expanded to false', () => {
      

      $().setExpanded(true);
      $().setExpanded(false);

      expect($().isExpanded).toBe(false);
    });

    it('handles setting same value twice', () => {
      

      $().setExpanded(true);
      $().setExpanded(true);

      expect($().isExpanded).toBe(true);
    });

    it('does not affect other state', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().setFilterMode('hide');

      $().setExpanded(true);

      expect($().rules).toHaveLength(1);
      expect($().filterMode).toBe('hide');
    });
  });

  describe('complex scenarios', () => {
    it('builds a complex filter with multiple rules', () => {
      

      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });
      $().addRule({ property: 'description', operator: 'contains', value: 'urgent' });

      expect($().rules).toHaveLength(3);

      $().setFilterMode('hide');
      $().setExpanded(true);

      expect($().filterMode).toBe('hide');
      expect($().isExpanded).toBe(true);
      expect($().rules[0].property).toBe('status');
      expect($().rules[1].property).toBe('priority');
      expect($().rules[2].property).toBe('description');
    });

    it('edits filter rules in sequence', () => {
      

      // Add rules
      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      const ruleId = $().rules[0].id;

      // Edit rule
      $().updateRule(ruleId, { value: 'inactive' });

      expect($().rules[0].value).toBe('inactive');

      // Add more rules
      $().addRule({ property: 'priority', operator: 'greater_than', value: 5 });

      // Remove first rule
      $().removeRule(ruleId);

      expect($().rules).toHaveLength(1);
      expect($().rules[0].property).toBe('priority');
    });

    it('clears and rebuilds filters', () => {
      

      // Initial filters
      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().addRule({ property: 'priority', operator: 'greater_than', value: 3 });

      expect($().rules).toHaveLength(2);

      // Clear
      $().clearRules();

      expect($().rules).toHaveLength(0);

      // Rebuild
      $().addRule({ property: 'name', operator: 'contains', value: 'test' });

      expect($().rules).toHaveLength(1);
      expect($().rules[0].property).toBe('name');
    });
  });

  describe('toggleFilterTabVisible', () => {
    it('toggles filterTabVisible from false to true', () => {
      useFilterStore.setState({ filterTabVisible: false });
      expect($().filterTabVisible).toBe(false);
      $().toggleFilterTabVisible();
      expect($().filterTabVisible).toBe(true);
    });

    it('toggles filterTabVisible from true to false', () => {
      useFilterStore.setState({ filterTabVisible: true });
      $().toggleFilterTabVisible();
      expect($().filterTabVisible).toBe(false);
    });

    it('toggles multiple times correctly', () => {
      useFilterStore.setState({ filterTabVisible: false });

      $().toggleFilterTabVisible(); // false -> true
      expect($().filterTabVisible).toBe(true);
      $().toggleFilterTabVisible(); // true -> false
      expect($().filterTabVisible).toBe(false);
      $().toggleFilterTabVisible(); // false -> true
      expect($().filterTabVisible).toBe(true);
    });

    it('does not affect rules or filterMode when toggling', () => {
      $().addRule({ property: 'status', operator: 'equals', value: 'active' });
      $().setFilterMode('hide');

      $().toggleFilterTabVisible();

      expect($().rules).toHaveLength(1);
      expect($().filterMode).toBe('hide');
    });

    it('persists visibility state to localStorage', () => {
      useFilterStore.setState({ filterTabVisible: false });

      $().toggleFilterTabVisible();

      expect(localStorage.getItem(FILTER_TAB_VISIBLE_STORAGE_KEY)).toBe('true');

      $().toggleFilterTabVisible();

      expect(localStorage.getItem(FILTER_TAB_VISIBLE_STORAGE_KEY)).toBe('false');
    });
  });

  describe('store initialization', () => {
    it('restores filterTabVisible from localStorage on module load', async () => {
      localStorage.setItem(FILTER_TAB_VISIBLE_STORAGE_KEY, 'true');

      vi.resetModules();
      const reloadedModule = await import('../store/filterStore');

      expect(reloadedModule.useFilterStore.getState().filterTabVisible).toBe(true);
    });
  });
});
