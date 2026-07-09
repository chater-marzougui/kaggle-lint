import { RULE_REGISTRY, createEnabledRules, defaultRuleToggles } from '../rules/registry';

describe('rule registry', () => {
  it('has 9 rules whose ids match their instance names', () => {
    expect(RULE_REGISTRY).toHaveLength(9);
    for (const info of RULE_REGISTRY) {
      expect(info.create().name).toBe(info.id);
    }
  });

  it('defaultRuleToggles enables every rule', () => {
    const toggles = defaultRuleToggles();
    expect(Object.keys(toggles).sort()).toEqual(RULE_REGISTRY.map((r) => r.id).sort());
    expect(Object.values(toggles).every(Boolean)).toBe(true);
  });

  it('createEnabledRules honors toggles and ignores unknown ids', () => {
    const rules = createEnabledRules({ undefinedVariables: true, emptyCells: false, bogus: true });
    expect(rules.map((r) => r.name)).toEqual(['undefinedVariables']);
  });
});
