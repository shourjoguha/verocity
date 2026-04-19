/**
 * LIFTLOG — central config.
 * Single source of truth. Components must import from here, not hardcode.
 */

export const appConfig = {
  app: {
    name: "LIFTLOG",
    tagline: "plan. log. progress.",
    storageKeys: {
      access: "liftlog.access.v1",
      currentUser: "liftlog.user.v1",
      activePlan: "liftlog.activePlan.v1",
    },
  },

  access: {
    // Default global key. To rotate: update sha256(key) hex in app_settings.access_key_hash.
    defaultKey: "BARBELL",
    maxAttempts: 6,
  },

  // Block names from the user's plan
  blocks: {
    sections: ["Warm-up", "Main", "Secondary", "Finisher"] as const,
    accumulation: { weeks: [1, 2, 3, 4], label: "Accumulation" },
    intensification: { weeks: [5, 6, 7, 8, 9, 10], label: "Intensification" },
    peak: { weeks: [11, 12, 13, 14], label: "Peak" },
    taper: { weeks: [15, 16], label: "Taper" },
    deloadWeeks: [4, 10, 14, 16],
  },

  metrics: {
    list: ["weight", "reps", "rpe", "distance", "time"] as const,
    units: {
      weight: "kg",
      reps: "x",
      rpe: "RPE",
      distance: "trips",
      time: "s",
    },
    labels: {
      weight: "WT",
      reps: "REPS",
      rpe: "RPE",
      distance: "DIST",
      time: "TIME",
    },
    // Auto-detect primary metric for a movement based on tags or name keywords.
    primaryHints: [
      { match: /hold|plank|carry|carries|zone\s*2/i, primary: "time" },
      { match: /sled|farmer|trip/i, primary: "distance" },
      { match: /bodyweight|pull-?up|dip|push-?up/i, primary: "reps" },
    ],
  },

  // Notation glossary (parsed inline, displayed as chips)
  notations: [
    { token: "(p)", label: "p", meaning: "Paused reps (2-3s pause)" },
    { token: "(t)", label: "t", meaning: "Tempo / slow eccentric (3-4s)" },
    { token: "+5%", label: "+5%", meaning: "Increase load ~5%" },
    { token: "/side", label: "/side", meaning: "Per side" },
    { token: "→", label: "→", meaning: "Variation swap" },
  ],

  rpe: {
    min: 1, max: 10,
    descriptions: {
      6: "Easy, 4 reps in reserve",
      7: "Moderate, 3 reps in reserve",
      8: "Hard, 2 reps in reserve",
      9: "Very hard, 1 rep in reserve",
      10: "Maximal effort",
    },
  },

  timer: {
    // Per user: manual start, configurable per movement
    behavior: "manual" as const,
    defaults: {
      betweenSetsSeconds: 90,
      withinSupersetSeconds: 15,
      afterSupersetSeconds: 120,
    },
    presets: [30, 45, 60, 75, 90, 120, 150, 180, 240, 300],
  },

  session: {
    autoSaveIntervalSeconds: 15,
    pauseWarningAfterMinutes: 30,
  },

  ui: {
    longPressMs: 450,
    transitionMs: 700,
    scrollSnap: false,
  },

  // Mapping for parser: section labels -> internal kind
  sectionAliases: {
    "warm-up": "Warm-up",
    "warmup": "Warm-up",
    "warm up": "Warm-up",
    "main": "Main",
    "secondary": "Secondary",
    "accessory": "Secondary",
    "finisher": "Finisher",
    "conditioning": "Finisher",
    "cardio": "Warm-up",
    "mobility": "Warm-up",
    "skill": "Secondary",
  } as Record<string, string>,
} as const;

export type Metric = (typeof appConfig.metrics.list)[number];
export type SectionName = (typeof appConfig.blocks.sections)[number];
