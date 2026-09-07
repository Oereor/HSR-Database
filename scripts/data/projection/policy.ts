import type { SkillCategory, KnownSkillEffect } from '../../../src/lib/domain/types.js';
import {
  ENDGAME_MISSING_VALUE,
  type EndgameViewPresentation
} from '../../../src/lib/domain/endgame-view.js';
import type { Locale } from '../locale-registry.js';

export interface LocaleProjectionPolicy {
  skillCategoryLabels: Record<SkillCategory, string>;
  skillEffectLabels: Record<KnownSkillEffect, string>;
  elementLabels: Record<string, string>;
  specialResistanceLabels: Record<string, string>;
  enemyName: (id: string) => string;
  skillName: (id: string) => string;
  composeCharacterPathName: (baseName: string, pathName: string) => string;
  normalizeCharacterBaseName: (name: string) => string;
  endgameView: EndgameViewPresentation;
}

const common = {
  elementLabels: {
    Physical: 'Physical',
    Fire: 'Fire',
    Ice: 'Ice',
    Lightning: 'Lightning',
    Wind: 'Wind',
    Quantum: 'Quantum',
    Imaginary: 'Imaginary'
  }
};

export const LOCALE_PROJECTION_POLICIES: Record<Locale, LocaleProjectionPolicy> = {
  'zh-CN': {
    skillCategoryLabels: {
      basic: '普攻',
      skill: '战技',
      ultimate: '终结技',
      talent: '天赋',
      technique: '秘技',
      'memosprite-skill': '忆灵技',
      'memosprite-talent': '忆灵天赋',
      'elation-skill': '欢愉技',
      assist: '助战技'
    },
    skillEffectLabels: {
      SingleAttack: '单攻',
      Blast: '扩散',
      AoEAttack: '群攻',
      Bounce: '弹射',
      Enhance: '强化',
      Impair: '妨害',
      Support: '辅助',
      Defence: '防御',
      Restore: '回复',
      Summon: '召唤',
      MazeAttack: '秘技攻击'
    },
    elementLabels: {
      Physical: '物理',
      Fire: '火',
      Ice: '冰',
      Lightning: '雷',
      Wind: '风',
      Quantum: '量子',
      Imaginary: '虚数'
    },
    specialResistanceLabels: {
      STAT_CTRL: '控制抵抗',
      STAT_CTRL_Frozen: '冻结抵抗',
      STAT_Confine: '禁锢抵抗',
      STAT_Entangle: '纠缠抵抗',
      STAT_DOT_Burn: '灼烧抵抗',
      STAT_DOT_Electric: '触电抵抗',
      STAT_DOT_Poison: '风化抵抗'
    },
    enemyName: (id) => `敌人 ${id}`,
    skillName: (id) => `技能 ${id}`,
    composeCharacterPathName: (baseName, pathName) => `${baseName}·${pathName}`,
    normalizeCharacterBaseName: (name) => name.replace(/·.*$/, ''),
    endgameView: {
      unknownEnemy: '未知敌方单位',
      unavailable: ENDGAME_MISSING_VALUE,
      groupName: (groupId) => `数据组 ${groupId}`
    }
  },
  en: {
    skillCategoryLabels: {
      basic: 'Basic ATK',
      skill: 'Skill',
      ultimate: 'Ultimate',
      talent: 'Talent',
      technique: 'Technique',
      'memosprite-skill': 'Memosprite Skill',
      'memosprite-talent': 'Memosprite Talent',
      'elation-skill': 'Elation Skill',
      assist: 'Assist Skill'
    },
    skillEffectLabels: {
      SingleAttack: 'Single Target',
      Blast: 'Blast',
      AoEAttack: 'AoE',
      Bounce: 'Bounce',
      Enhance: 'Enhance',
      Impair: 'Impair',
      Support: 'Support',
      Defence: 'Defense',
      Restore: 'Restore',
      Summon: 'Summon',
      MazeAttack: 'Technique Attack'
    },
    ...common,
    specialResistanceLabels: {
      STAT_CTRL: 'Crowd Control RES',
      STAT_CTRL_Frozen: 'Frozen RES',
      STAT_Confine: 'Imprisonment RES',
      STAT_Entangle: 'Entanglement RES',
      STAT_DOT_Burn: 'Burn RES',
      STAT_DOT_Electric: 'Shock RES',
      STAT_DOT_Poison: 'Wind Shear RES'
    },
    enemyName: (id) => `Enemy ${id}`,
    skillName: (id) => `Skill ${id}`,
    composeCharacterPathName: (baseName, pathName) => `${baseName} - ${pathName}`,
    normalizeCharacterBaseName: (name) => name,
    endgameView: {
      unknownEnemy: 'Unknown enemy',
      unavailable: ENDGAME_MISSING_VALUE,
      groupName: (groupId) => `Data group ${groupId}`
    }
  }
};

export function getLocaleProjectionPolicy(locale: Locale): LocaleProjectionPolicy {
  return LOCALE_PROJECTION_POLICIES[locale];
}
