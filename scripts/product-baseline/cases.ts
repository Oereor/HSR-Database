export const PRODUCT_BASELINE_CASES = {
  characters: [
    { id: '1001', role: 'standard single-profile skill presentation' },
    { id: '1310', role: 'base/enhanced profile and multi-variant presentation' },
    { id: '1415', role: 'memosprite skills, variants and extra-effect presentation' }
  ],
  lightCones: [{ id: '23043', role: 'path, rarity, stats and rich superimposition tokens' }],
  relics: [{ id: '117', role: 'four-piece set with 2pc/4pc formatted effects' }],
  enemies: [
    { id: '1002011', role: 'single concrete monster and initial-delay presentation' },
    { id: '4064012', role: 'selector, multi-phase skills and summons presentation' }
  ],
  endgame: [
    { mode: 'moc', groupId: 1034, role: 'current MoC and turbulence presentation' },
    { mode: 'pf', groupId: 2026, role: 'upcoming PF mechanics and waves presentation' },
    { mode: 'as', groupId: 3020, role: 'current AS axioms and boss-guide presentation' },
    { mode: 'aa', groupId: 8, role: 'unscheduled AA normal/hard and quadrant presentation' }
  ],
  endgameBoundaries: [
    {
      id: 'pf-2026-before-begin',
      mode: 'pf',
      groupId: 2026,
      timestamp: '2026-09-13T19:59:59.999Z'
    },
    { id: 'pf-2026-at-begin', mode: 'pf', groupId: 2026, timestamp: '2026-09-13T20:00:00.000Z' },
    { id: 'pf-2026-before-end', mode: 'pf', groupId: 2026, timestamp: '2026-10-18T19:59:59.999Z' },
    { id: 'pf-2026-at-end', mode: 'pf', groupId: 2026, timestamp: '2026-10-18T20:00:00.000Z' }
  ],
  searchQueries: ['卡芙卡', '锋镝', '银鬃尉官', '迷惘之渊的裁定者', '不存在的搜索词']
} as const;

export const PRODUCT_BASELINE_REFERENCE_TIME = '2026-09-05T00:00:00.000Z' as const;
