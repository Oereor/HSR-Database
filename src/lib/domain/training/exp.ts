import type { Cost, ExpConversion, TrainingExpCosts, TrainingSharedData } from './types.js';
import { mergeCosts, trainingId, trainingInteger, TrainingError } from './index.js';

export const TRAINING_CREDIT_ITEM_ID = '2';

/** Apply the product's total-EXP strategy once, independent of promotion boundaries. */
export function convertTrainingExp(
  requiredExp: number,
  items: readonly { itemId: string; exp: number }[]
): ExpConversion {
  trainingInteger(requiredExp, 'requiredExp');
  if (!Array.isArray(items) || !items.length) throw new TrainingError('missing-exp-items', 'EXP');
  const seen = new Set<string>();
  for (const item of items) {
    trainingId(item.itemId);
    trainingInteger(item.exp, `${item.itemId} EXP`, 1);
    if (seen.has(item.itemId)) throw new TrainingError('duplicate-exp-item', item.itemId);
    seen.add(item.itemId);
  }
  const ordered = [...items].sort(
    (a, b) => b.exp - a.exp || a.itemId.localeCompare(b.itemId, 'en', { numeric: true })
  );
  let remaining = requiredExp;
  let suppliedExp = 0;
  const expItems: ExpConversion['expItems'] = [];
  for (const [index, item] of ordered.entries()) {
    const count = trainingInteger(
      index === ordered.length - 1
        ? Math.ceil(remaining / item.exp)
        : Math.floor(remaining / item.exp),
      `${item.itemId} count`
    );
    const supplied = trainingInteger(count * item.exp, `${item.itemId} supplied EXP`);
    suppliedExp = trainingInteger(suppliedExp + supplied, 'supplied EXP sum');
    remaining = Math.max(0, remaining - supplied);
    if (count) expItems.push({ ...item, count, suppliedExp: supplied });
  }
  if (suppliedExp < requiredExp) throw new TrainingError('insufficient-exp', 'EXP');
  return {
    strategy: 'descending-exp-greedy',
    requiredExp,
    suppliedExp,
    overflowExp: suppliedExp - requiredExp,
    expItemCost: mergeCosts(...expItems.map(({ itemId, count }) => ({ [itemId]: count }))),
    expItems
  };
}

export function calculateTrainingExpCosts(
  kind: 'character' | 'light-cone',
  shared: TrainingSharedData,
  requiredExp: number
): TrainingExpCosts {
  const conversion = convertTrainingExp(
    requiredExp,
    kind === 'character' ? shared.characterExpItems : shared.lightConeExpItems
  );
  let credits: number;
  if (kind === 'character') {
    const divisor = trainingInteger(
      shared.characterExpCreditDivisor,
      'characterExpCreditDivisor',
      1
    );
    if (conversion.suppliedExp % divisor !== 0)
      throw new TrainingError('non-integer-exp-credit', `${conversion.suppliedExp}/${divisor}`);
    credits = trainingInteger(conversion.suppliedExp / divisor, 'character EXP credits');
  } else {
    const costs = new Map(
      shared.lightConeExpItems.map(({ itemId, creditCost }) => [
        itemId,
        trainingInteger(creditCost, `${itemId} creditCost`)
      ])
    );
    credits = 0;
    for (const item of conversion.expItems) {
      const cost = trainingInteger(item.count * costs.get(item.itemId)!, `${item.itemId} credits`);
      credits = trainingInteger(credits + cost, 'light-cone EXP credits sum');
    }
  }
  const expCreditCost: Cost = credits ? { [TRAINING_CREDIT_ITEM_ID]: credits } : {};
  return { ...conversion, expCreditCost };
}
