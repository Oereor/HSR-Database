import type { LevelledDescription } from '../../src/lib/domain/types.js';
import {
  formatDescription,
  type DescriptionDiagnostic,
  type DescriptionDiagnosticCode
} from './text.js';

export interface LevelledDescriptionInput {
  level: number;
  template: string;
  params: number[];
}

export interface LevelledDescriptionDiagnostic extends DescriptionDiagnostic {
  level: number;
}

export interface NormalizedLevelledDescriptions {
  scalingParamIndexes: number[];
  levels: LevelledDescription[];
  diagnostics: LevelledDescriptionDiagnostic[];
}

export interface DescriptionDiagnosticSample extends LevelledDescriptionDiagnostic {
  entity: string;
  id: string;
}

export type DescriptionDiagnosticSummary = Record<
  DescriptionDiagnosticCode,
  { count: number; samples: DescriptionDiagnosticSample[] }
>;

export function createDescriptionDiagnosticSummary(): DescriptionDiagnosticSummary {
  return {
    'invalid-param': { count: 0, samples: [] },
    'missing-param': { count: 0, samples: [] }
  };
}

export function addDescriptionDiagnostics(
  summary: DescriptionDiagnosticSummary,
  entity: string,
  id: string,
  diagnostics: readonly LevelledDescriptionDiagnostic[]
): void {
  for (const diagnostic of diagnostics) {
    const bucket = summary[diagnostic.code];
    bucket.count += 1;
    if (bucket.samples.length < 20) bucket.samples.push({ entity, id, ...diagnostic });
  }
}

function findScalingParamIndexes(inputs: readonly LevelledDescriptionInput[]): number[] {
  if (inputs.length < 2) return [];
  const parameterCount = Math.max(0, ...inputs.map((input) => input.params.length));
  const result: number[] = [];
  for (let index = 0; index < parameterCount; index += 1) {
    const values = inputs.map((input) => input.params[index]).filter(Number.isFinite);
    if (values.length >= 2 && values.some((value) => !Object.is(value, values[0]))) {
      result.push(index);
    }
  }
  return result;
}

export function normalizeLevelledDescriptions(
  rawInputs: readonly LevelledDescriptionInput[]
): NormalizedLevelledDescriptions {
  const inputs = [...rawInputs].sort((a, b) => a.level - b.level);
  const scalingParamIndexes = findScalingParamIndexes(inputs);
  const scalingIndexes = new Set(scalingParamIndexes);
  const diagnostics: LevelledDescriptionDiagnostic[] = [];
  const levels = inputs.map((input) => {
    const formatted = formatDescription(input.template, input.params, scalingIndexes);
    diagnostics.push(
      ...formatted.diagnostics.map((diagnostic) => ({ level: input.level, ...diagnostic }))
    );
    return {
      level: input.level,
      params: input.params,
      description: formatted.description,
      descriptionTokens: formatted.descriptionTokens
    };
  });
  return { scalingParamIndexes, levels, diagnostics };
}
