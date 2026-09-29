/** Multiply a non-negative decimal ratio by 100 without binary floating-point rounding. */
export function formatEnemySkillPercent(value: string): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`无效的敌人技能比例：${value}`);
  const fraction = match[2] ?? '';
  const whole = BigInt(`${match[1]}${fraction.padEnd(2, '0').slice(0, 2)}`);
  const remainder = fraction.slice(2).replace(/0+$/, '');
  const formattedWhole = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(whole);
  return `${formattedWhole}${remainder ? `.${remainder}` : ''}%`;
}

/** Keep the unit outside a list of possible totals. */
export function formatEnemySkillTotals(totals: readonly string[]): string {
  return totals.map(formatEnemySkillPercent).join(' / ');
}
