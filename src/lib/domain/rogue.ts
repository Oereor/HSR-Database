import type { ExtraEffect } from './types';

export type RogueMode = 'su' | 'swarm-disaster' | 'gold-and-gears' | 'du';
export type RogueSuMode = Exclude<RogueMode, 'du'>;
export type RogueRawBlessingCategory = 'Common' | 'Rare' | 'Legendary';
export type RogueRawFormulaCategory = 'Rare' | 'Epic' | 'Legendary' | 'PathEcho';

export interface RoguePresentationTier {
  stars: 1 | 2 | 3 | 4;
  color: '#9797a1' | '#6695c8' | '#c4a275';
  source: 'ordinary-blessing' | 'ordinary-equation' | 'critical-equation' | 'resonance';
}

export interface RoguePath {
  rawType: number;
  code: string;
  name: string;
  order: number;
  assetAvailable: boolean;
}

export interface RogueEffect {
  mazeBuffId: number;
  name: string;
  description: string;
  params: string[];
  upstreamIconPath?: string;
}

export interface RogueBlessingLevel {
  level: 1 | 2;
  rawTag: number;
  effect: RogueEffect;
}

export interface RogueBlessing {
  id: `RogueBuff:${number}` | `RogueTournBuff:${number}`;
  sourceFamily: 'RogueBuff' | 'RogueTournBuff';
  mazeBuffId: number;
  rawCategory: RogueRawBlessingCategory;
  tier: RoguePresentationTier;
  path: RoguePath;
  introducedByModule?: number;
  tournMode?: 'Tourn3';
  levels: [RogueBlessingLevel, RogueBlessingLevel];
  extraEffects: ExtraEffect[];
  order: number;
}

export interface RogueEquationRequirement {
  path: RoguePath;
  count: number;
}

export interface RogueEquation {
  id: `RogueTournFormula:${number}`;
  formulaId: number;
  kind: 'ordinary' | 'critical';
  tournMode: 'Tourn3';
  rawCategory: RogueRawFormulaCategory;
  tier: RoguePresentationTier;
  main: RogueEquationRequirement;
  sub?: RogueEquationRequirement;
  effect: RogueEffect;
  extraEffects: ExtraEffect[];
  order: number;
}

export interface RogueBaseResonance {
  id: `RogueAeon:${number}`;
  kind: 'base';
  aeonId: number;
  path: RoguePath;
  effect: RogueEffect;
  extraEffects: ExtraEffect[];
  tier: RoguePresentationTier;
  order: number;
}

export interface RogueResonanceEnhancement {
  id: `RogueBuff:${number}`;
  rawOrder: number;
  effect: RogueEffect;
  extraEffects: ExtraEffect[];
}

export interface RogueResonanceEnhancementGroup {
  id: `RogueAeonEnhancements:${number}`;
  kind: 'enhancement-group';
  aeonId: number;
  path: RoguePath;
  effects: [RogueResonanceEnhancement, RogueResonanceEnhancement, RogueResonanceEnhancement];
  tier: RoguePresentationTier;
  order: number;
}

export interface RogueCrossResonance {
  id: `${'RogueDLCAeonCross' | 'RogueNousAeonCross'}:${number}:${number}`;
  kind: 'cross';
  sourceFamily: 'RogueDLCAeonCross' | 'RogueNousAeonCross';
  main: RogueEquationRequirement & { aeonId: number };
  sub: RogueEquationRequirement & { aeonId: number };
  effect: RogueEffect;
  extraEffects: ExtraEffect[];
  introducedByModule?: number;
  availableIn: 'swarm-disaster' | 'gold-and-gears';
  tier: RoguePresentationTier;
  order: number;
}

export interface RogueSuDataset {
  schemaVersion: 1;
  kind: 'su';
  paths: RoguePath[];
  blessings: RogueBlessing[];
  baseResonances: RogueBaseResonance[];
  enhancementGroups: RogueResonanceEnhancementGroup[];
  crossResonances: RogueCrossResonance[];
  overlays: Record<RogueSuMode, { aeonIds: number[] }>;
}

export interface RogueDuDataset {
  schemaVersion: 1;
  kind: 'du';
  revision: 'Tourn3';
  revisionLabel: '差分宇宙·乐园漫记';
  paths: RoguePath[];
  blessings: RogueBlessing[];
  equations: RogueEquation[];
}

export interface RogueManifestSummary {
  schemaVersion: 1;
  su: {
    blessings: number;
    baseResonances: number;
    enhancementGroups: number;
    crossResonances: { swarmDisaster: number; goldAndGears: number };
  };
  du: { revision: 'Tourn3'; blessings: number; equations: number; criticalEquations: number };
  diagnostics: { missingPathAssets: string[]; ordinarySuAvailability: 'shared-catalog' };
}

export interface RogueSuPageView {
  kind: 'su';
  mode: RogueSuMode;
  label: string;
  paths: RoguePath[];
  blessings: RogueBlessing[];
  baseResonances: RogueBaseResonance[];
  enhancementGroups: RogueResonanceEnhancementGroup[];
  crossResonances: RogueCrossResonance[];
}

export interface RogueDuPageView {
  kind: 'du';
  mode: 'du';
  label: '差分宇宙';
  revisionLabel: '差分宇宙·乐园漫记';
  paths: RoguePath[];
  blessings: RogueBlessing[];
  equations: RogueEquation[];
}

export type RoguePageView = RogueSuPageView | RogueDuPageView;

export const ROGUE_MODES: RogueMode[] = ['su', 'swarm-disaster', 'gold-and-gears', 'du'];

export const ROGUE_MODE_LABELS: Record<RogueMode, string> = {
  su: '模拟宇宙',
  'swarm-disaster': '模拟宇宙·寰宇蝗灾',
  'gold-and-gears': '模拟宇宙·黄金与机械',
  du: '差分宇宙'
};

export function isRogueMode(value: string): value is RogueMode {
  return ROGUE_MODES.includes(value as RogueMode);
}
