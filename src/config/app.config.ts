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
    defaultKey: "BARBELL",
    maxAttempts: 6,
  },

  // Block names from the user's plan (default seed for plan-driven sessions).
  // Custom workouts can define their own section names.
  blocks: {
    sections: ["Warm-up", "Main", "Secondary", "Finisher"] as const,
    accumulation: { weeks: [1, 2, 3, 4], label: "Accumulation" },
    intensification: { weeks: [5, 6, 7, 8, 9, 10], label: "Intensification" },
    peak: { weeks: [11, 12, 13, 14], label: "Peak" },
    taper: { weeks: [15, 16], label: "Taper" },
    deloadWeeks: [4, 10, 14, 16],
    /** Visual markers for the Plan overview's left-edge accent bar. */
    sectionMarkers: {
      "Warm-up":   { className: "bg-muted",          label: "Warm-up" },
      "Main":      { className: "bg-foreground",     label: "Main" },
      "Secondary": { className: "bg-accent",         label: "Secondary" },
      "Finisher":  { className: "bg-foreground/40 [background-image:repeating-linear-gradient(45deg,transparent,transparent_2px,hsl(var(--background))_2px,hsl(var(--background))_4px)]", label: "Finisher" },
    } as Record<string, { className: string; label: string }>,
  },

  metrics: {
    list: ["weight", "reps", "rpe", "distance", "time"] as const,
    /** Always present on a movement (cannot be swapped away). */
    fixed: ["weight"] as const,
    /** Mutually-swappable metrics (only one of these in a movement at a time). */
    swappable: ["reps", "time", "distance"] as const,
    units: {
      weight: "kg",
      reps: "x",
      rpe: "RPE",
      distance: "m",
      time: "s",
    },
    labels: {
      weight: "WT",
      reps: "REPS",
      rpe: "RPE",
      distance: "DIST",
      time: "TIME",
    },
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
    behavior: "manual" as const,
    defaults: {
      betweenSetsSeconds: 90,
      withinSupersetSeconds: 15,
      afterSupersetSeconds: 120,
      bySection: {
        "Warm-up": 30,
        "Main": 120,
        "Secondary": 90,
        "Finisher": 60,
      } as Record<string, number>,
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

  // Activity tagging — applied to every workout_logs row.
  activity: {
    tags: ["sport", "recovery", "mobility", "strength", "conditioning"] as const,
    /** Color per activity tag — used by the Calendar bar markers. HSL recommended elsewhere,
     *  but these are bar fills (not theme tokens), so hex is acceptable here for clarity. */
    tagColors: {
      strength: "hsl(0 0% 7%)",
      conditioning: "hsl(28 92% 44%)",
      sport: "hsl(217 91% 50%)",
      mobility: "hsl(142 71% 38%)",
      recovery: "hsl(262 75% 55%)",
    } as Record<string, string>,
    fallbackColor: "hsl(0 0% 45%)",
    defaultType: "strength",
    /** Infer a tag from a plan day's "type" string. */
    dayTypeTag: (type: string): "strength" | "conditioning" | "recovery" | "mobility" => {
      const t = type.toLowerCase();
      if (/recovery/.test(t)) return "recovery";
      if (/mobility/.test(t)) return "mobility";
      if (/conditioning|cardio|zone/.test(t)) return "conditioning";
      return "strength";
    },
  },

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
export type SwappableMetric = (typeof appConfig.metrics.swappable)[number];
export type SectionName = (typeof appConfig.blocks.sections)[number];
export type ActivityTag = (typeof appConfig.activity.tags)[number];
