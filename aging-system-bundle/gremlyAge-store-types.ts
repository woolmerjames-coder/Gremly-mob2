  }) => void;
  markMiniSweepCompleted: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // GREMLY AGE & RITUAL PROGRESS
  // ═══════════════════════════════════════════════════════════════════
  gremlyAge: number;
  gremlyAgeLastIncrementedAt: string | null;
  dayBoundaryHour: number;
  onboardingCompletedAt: string | null;
  accountCreatedAt: string | null;
  firstDropCompletedAt: string | null;
  firstTodayVisitCompletedAt: string | null;
  todayRitualDay: string | null;
  todayDropsCount: number;
  todaySweepsCount: number;
  todayRitualCompletedAt: string | null;

  // Ritual actions
  ensureCurrentRitualDay: () => string;
  incrementDropCount: () => Promise<{ dropsCount: number; didAgeUp: boolean; newAge: number }>;
  incrementSweepCount: () => Promise<{ sweepsCount: number; didAgeUp: boolean; newAge: number }>;
  checkAndIncrementAge: () => Promise<{ didAgeUp: boolean; newAge: number }>;
  setDayBoundaryHour: (hour: number) => Promise<void>;
  setOnboardingCompletedAt: (timestamp: string) => Promise<void>;
  markOnboardingComplete: () => Promise<void>;
  markFirstDropComplete: () => Promise<void>;
  markFirstTodayVisitComplete: () => Promise<void>;
  refreshRitualProgress: () => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════
  initialize: (userId: string) => Promise<void>;
  reset: () => void;

  // ═══════════════════════════════════════════════════════════════════
  // TODO MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createTodo: (todo: Partial<Todo>) => Promise<Todo>;
  updateTodo: (id: string, updates: Partial<Todo>) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  completeTodo: (id: string) => Promise<void>;
  uncompleteTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string, reason?: string) => Promise<void>;
  restoreTodo: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // HABIT MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createHabit: (habit: Partial<Habit>) => Promise<Habit>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  completeHabit: (id: string) => Promise<void>;
  uncompleteHabit: (id: string) => Promise<void>;
  /** Toggle habit completion for TODAY - complete if not done, uncomplete if done */
  toggleHabitToday: (id: string) => Promise<void>;
  /** Log habit completion for a specific date (for Habits This Week) */
  logHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
  /** Remove habit completion for a specific date (for Habits This Week) */
  removeHabitCompletionForDate: (habitId: string, dateIso: string) => Promise<void>;
  /** Update last_checked_in_at for a habit (user reviewed it) */
  checkInHabit: (habitId: string) => Promise<void>;
  archiveHabit: (id: string, reason?: string) => Promise<void>;
  restoreHabit: (id: string) => Promise<void>;

  // ═══════════════════════════════════════════════════════════════════
  // NOTE MUTATIONS
  // ═══════════════════════════════════════════════════════════════════
  createNote: (note: Partial<Note> & { photoUris?: string[] }) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
