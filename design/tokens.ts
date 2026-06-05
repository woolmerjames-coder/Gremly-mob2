/**
 * Design tokens for the Gremly design system - Updated with brand colors
 */

type _RawTokens = typeof lightTokens;
// Tokens['colors'] only exposes string-valued keys so that structural consumers
// (e.g. Box bg prop: keyof Tokens['colors']) don't accidentally accept object/array
// palette entries (worldPalette, avatarPalette). Access those via lightTokens directly.
type _StringColors = {
  [K in keyof _RawTokens['colors'] as _RawTokens['colors'][K] extends string
    ? K
    : never]: _RawTokens['colors'][K];
};
export type Tokens = Omit<_RawTokens, 'colors'> & { colors: _StringColors };

export const lightTokens = {
  colors: {
    bg: '#FFFDF8',
    surface: '#FFFFFF',
    text: '#0E1116',
    subtle: '#6A6F76',
    // Primary button / accent color (Moss Green)
    primary: '#2E5540',
    // Text color placed on top of primary
    onPrimary: '#F9F6F1',
    accentMint: '#A5F3C1',
    accentPeri: '#AEB8FF',
    success: '#34C759',
    danger: '#E25555',
    warning: '#F59E0B',
    border: '#E7E2D9',
    card: '#FFFFFF',

    // Harmonic Glass chat colors
    linenCream: '#F9F6F1',
    linenCreamLight: '#F3EFE8',
    mossGreen: '#2E5540',
    sageMist: '#BFD8C0',
    sageMistTranslucent: 'rgba(191, 216, 192, 0.85)',
    deepForest: '#1A3328',
    charcoalInk: '#222222',
    periwinkleSmoke: '#9CA6E0',
    // Short-name aliases for theme tokens (used in overlays)
    moss: '#2E5540',
    sage: '#BFD8C0',
    periwinkle: '#9CA6E0',
    linen: '#F9F6F1',
    deep: '#1A3328',
    charcoal: '#222222',

    // Worlds & Chapters (Phase 4a.2)
    // Warmer oat surface tones, intentional brand shift for the Worlds tab.
    // @deprecated — use worldsSurface. Remove after 4a component sweep lands.
    oatDeep: '#EDE6D0', // Worlds tab body background
    // @deprecated — use worldsCard. Remove after 4a component sweep lands.
    oatLight: '#F4EDD7', // Worlds card and detail-page surface
    // @deprecated — use worldsCardBorder for borders. Remove after 4a component sweep lands.
    oatDeeper: '#DDD3B8', // Card borders and inactive phase bars
    warmGrey: '#7A7665', // Section labels and secondary text in Worlds surfaces

    // Ambergold accents for evolution markers, current chapter glow, emerging treatment
    ambergold: '#C19858',
    ambergoldDeep: '#8C6A2A',
    ambergoldTint: 'rgba(193, 152, 88, 0.2)',
    ambergoldGlow: 'rgba(193, 152, 88, 0.28)',

    // Gremly noticed slot (purple observation callout)
    noticedBg: '#E8E3F0',
    noticedBorder: '#A299C9',
    noticedText: '#5A5A6E',
    noticedLabel: '#7A6EB2',

    // Archetype palette (keyed by WorldArchetype)
    worldPalette: {
      creative: {
        base: '#2E5540',
        tint: 'rgba(143,163,136,0.22)',
        dot: '#8FA388',
        textOnBase: '#F4EDD7',
      },
      professional: {
        base: '#3A4C60',
        tint: 'rgba(91,112,144,0.22)',
        dot: '#5B7090',
        textOnBase: '#F4EDD7',
      },
      wellness_body: {
        base: '#8C6A2A',
        tint: 'rgba(193,152,88,0.2)',
        dot: '#C19858',
        textOnBase: '#F4EDD7',
      },
      wellness_mind: {
        base: '#5B4F8C',
        tint: 'rgba(162,153,201,0.22)',
        dot: '#A299C9',
        textOnBase: '#F4EDD7',
      },
      relational: {
        base: '#8C3F1E',
        tint: 'rgba(197,139,125,0.22)',
        dot: '#C58B7D',
        textOnBase: '#F4EDD7',
      },
      domestic: {
        base: '#6A6F76',
        tint: 'rgba(122,118,101,0.12)',
        dot: '#A59E88',
        textOnBase: '#F4EDD7',
      },
      learning: {
        base: '#4A4E8C',
        tint: 'rgba(123,135,212,0.22)',
        dot: '#7B87D4',
        textOnBase: '#F4EDD7',
      },
      generic: {
        base: '#3A4C60',
        tint: 'rgba(138,148,165,0.22)',
        dot: '#8A94A5',
        textOnBase: '#F4EDD7',
      },
    },

    // Sweep day-grid capacity heat tints
    sweepHeat: {
      none: 'rgba(34,34,34,0.03)', // 0 things — neutral, matches inactive pill bg
      low: 'rgba(191,216,192,0.18)', // 1-2 things — faint sage
      med: 'rgba(191,216,192,0.34)', // 3-4 things — stronger sage
      high: 'rgba(224,138,107,0.14)', // 5+ things — warm clay tint (heavy day)
      heavyText: '#C2613F', // warm text color for count label on heavy days
      todayRing: 'rgba(46,85,64,0.25)', // inset ring for the today cell
    },

    // Worlds surfaces — grounded in brand tokens, not mockup-oat
    worldsSurface: '#F9F6F1', // body — same as linenCream, explicit alias for Worlds tab
    worldsCard: '#FFFFFF', // opaque card surface — pure white for layering over linen
    worldsCardBorder: 'rgba(46,85,64,0.08)', // moss at 8% — subtle brand-green hairline on cards

    // Primary ink scale (deepForest-derived — green-inflected black, stays on-brand)
    worldsInk: '#1A3328', // primary text — alias to deepForest for Worlds semantics
    worldsInkSoft: 'rgba(26,58,40,0.68)', // secondary body text on cards
    worldsInkMute: 'rgba(26,58,40,0.6)', // muted labels (e.g. COOLING velocity chip)
    worldsInkOutline: 'rgba(26,58,40,0.25)', // dashed outlines (AddWorldCTA, etc.)

    // Text/icon on a dark (worldsInk) background — used by WeeklySummaryCard new-unread variant
    onInkLabel: 'rgba(249,246,241,0.65)', // linenCream at 65%
    onInkBody: 'rgba(249,246,241,0.82)',
    onInkCta: 'rgba(249,246,241,0.88)',

    // Completion states (todos, strikethrough, dormant treatment)
    sageGreen: '#97AF8F', // mid-tone sage between sageMist and moss — checkbox fill

    // Relationship archetype — memoir hero, WithYou, Eras, AlsoTouched (B.3c-phase1)
    epigraphBorder: '#C19A4D',
    closedTagBg: '#F2D5C5',
    closedTagFg: '#993C1D',
    mossLight: '#DDE4DC',
    mossMid: '#C9D7C5',

    doneTextMuted: 'rgba(26,58,40,0.4)', // strikethrough + dormant world title (deepForest at 40%)

    // Dormant world card (warmGrey at alpha — same semantic as existing warmGrey token)
    dormantSurface: 'rgba(122,118,101,0.08)',
    dormantBorder: 'rgba(122,118,101,0.35)',

    // Emerging / "new" treatment (ambergold at alpha — ambergold is Gremly's golden-pear accent)
    emergingSurface: 'rgba(193,152,88,0.08)',
    emergingBorder: 'rgba(194,152,88,0.55)', // Note: mockup uses 194 not 193; preserve
    emergingTag: 'rgba(193,152,88,0.25)',

    // Noticed slot (periwinkleSmoke at alpha — brand purple)
    noticedSurfaceFaint: 'rgba(156,166,224,0.05)',
    noticedSurfaceSoft: 'rgba(156,166,224,0.1)',
    noticedEdgeSoft: 'rgba(156,166,224,0.25)',
    noticedEdgeStrong: 'rgba(156,166,224,0.35)',

    // Neutral chip — ContextsChipRow + ParentWorldPill (sage-mist with moss text for brand unity)
    chipNeutralBg: 'rgba(191,216,192,0.22)', // sageMist at 22%
    chipNeutralBorder: 'rgba(46,85,64,0.22)', // moss at 22%
    chipNeutralDot: '#BFD8C0', // sageMist solid
    chipNeutralText: '#2E5540', // moss solid

    // Chapter decoration (sageMist at alpha — phase-bar container, action buttons)
    chapterDecorBg: 'rgba(191,216,192,0.18)', // sageMist at 18% — subtle sage wash
    chapterActionBg: 'rgba(191,216,192,0.35)', // sageMist at 35% — action button surface
    chapterActionBorder: 'rgba(46,85,64,0.3)', // moss at 30% — action button border

    // Subtle green (secondary text on chapter hero card)
    subtleGreen: 'rgba(26,58,40,0.55)', // deepForest at 55%

    // Avatar rotation — PeopleRow + PeopleInvolvedModule
    avatarPalette: [
      { bg: '#D5E4D0', fg: '#1A3A28' },
      { bg: '#EBDDC5', fg: '#6B4A2E' },
      { bg: '#E2DFEE', fg: '#5A3B5A' },
      { bg: '#D9E1EA', fg: '#2C4A5C' },
      { bg: '#F1D8C9', fg: '#8C3F1E' },
      { bg: '#D0E0DA', fg: '#2E5540' },
      { bg: '#E8D6DF', fg: '#7B3F57' },
      { bg: '#DDE3D0', fg: '#4B5A33' },
    ] as const,

    // Phase B: chapter arc-shape accents (mockup 06)
    // Experience arc — pink family, used on ClosedExperienceChapter
    experienceAccent: '#D4537E', // timeline markers, CLOSED pill, epigraph left-border
    experienceAccentSoft: '#F4C0D1', // timeline vertical line, experience-arc avatar bg
    experienceAccentDeep: '#72243E', // timeline date/location labels

    // Commitment arc — periwinkle family, used on ClosedCommitmentChapter
    commitmentAccent: '#7F77DD', // CLOSED pill, epigraph left-border, phase-spine fill
    commitmentHeldFill: '#C0DD97', // held-vs-slip strip success bar
    commitmentSlipMarker: '#EF9F27', // slip tick marks

    // Outcome arc — reuses existing moss/forest greens, aliased for clarity
    outcomeAccent: '#2E5540', // alias of mossGreen
    outcomeAccentSoft: 'rgba(46,85,64,0.22)', // alias of worldPalette.creative.tint

    // Process arc — reuses sageGreen, aliased for clarity
    processAccent: '#97AF8F', // alias of sageGreen

    // Phase B: chapter closed-banner (dark background on closed-chapter hero)
    chapterBannerBg: '#222222', // alias of charcoalInk
    chapterBannerText: '#F5F0E6', // near-linen for banner text
    chapterBannerMuted: '#B4B2A9', // subdued text on banner (duration, subtitle)
    chapterBannerDivider: '#5F5E5A', // held-vs-slip strip background

    // Phase B: blocker badges and accents (mockup 05 project chapter UNFOLDING)
    blockerRed: '#A32D2D', // blocker pill text
    blockerRedBg: '#FCEBEB', // blocker pill background
    blockerRedBorder: 'rgba(163,45,45,0.28)', // blocker left-border on todo rows
    blockerMarkerBg: '#F2A793', // blocker row square marker fill (mockup 07 C.2a)
    blockerMarkerFg: '#4F1402', // blocker row square marker "!" glyph (mockup 07 C.2a)

    // Phase B: ALSO TOUCHED chip palette (per world_type, mockup 06)
    chipProjectBorder: '#C0DD97',
    chipProjectText: '#173404',
    chipPracticeBorder: '#FAC775',
    chipPracticeText: '#854F0B',
    chipRelationshipBorder: '#CECBF6',
    chipRelationshipText: '#3C3489',
    chipDomesticBorder: 'rgba(122,118,101,0.35)', // reuses warmGrey at alpha
    chipDomesticText: '#7A7665', // reuses warmGrey

    // Phase B: dashed-frame borders (NO OPEN CHAPTER block on domestic worlds, mockup 05)
    dashedFrameBorder: '#B4B2A9', // dashed frame around "no chapter" empty state
    dashedFrameLabel: '#5F5E5A', // label text inside dashed frame

    // Phase B: velocity dot colors — hero status line (mockup 05)
    velocityDotGrowing: '#97AF8F', // sageGreen — "Growing" status
    velocityDotSteady: '#888780', // warmGrey-ish — "Steady" status
    velocityDotCooling: '#B4B2A9', // paler grey — "Cooling" status
    velocityDotDormant: 'rgba(122,118,101,0.35)', // warmGrey at 35% — "Dormant"

    // Phase B.3a: serif summary underlines (archetype-specific tints on ArchetypeWorldHero)
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineProject: 'rgba(46,85,64,0.5)', // moss at 50% — project world dashed underline
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineDomestic: 'rgba(122,118,101,0.5)', // warmGrey at 50% — domestic world dashed underline
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineRelationship: 'rgba(140,63,30,0.5)', // relational clay at 50% — for B.3b

    // @deprecated — use sageGreen. Remove after 4a component sweep lands.
    doneCheck: '#97AF8F',
    // @deprecated — use worldsCard / worldsCardBorder. Remove after 4a component sweep lands.
    oatCard: '#FFFFFF',
    oatCardBorder: 'rgba(46,85,64,0.08)',
  },
  chat: {
    assistantText: '#1F1F1F',
    assistantTextBold: '#1A3328',
    userText: '#FFFFFF',
    userBubble: '#2E5540',
    gremlyMark: 'rgba(46, 85, 64, 0.55)',
    gremlyMarkGem: '#9CA6E0',
    bodyFontSize: 16,
    bodyLineHeight: 25,
    markFontSize: 10.5,
    markLetterSpacing: 0.6,
    userBubbleRadius: 16,
    userBubbleTailRadius: 4,
  },
  spacing: [0, 4, 8, 12, 16, 20, 24, 32] as const,
  radius: [0, 6, 12, 16, 20] as const,
  typography: {
    fontFamily: {
      regular: 'Inter-Regular',
      medium: 'Inter-Medium',
      bold: 'PlusJakartaSans-Bold',
    },
    size: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32,
    },
    lineHeight: {
      tight: 1.1,
      snug: 1.25,
      normal: 1.4,
      relaxed: 1.6,
    },
  },
  elevation: {
    none: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    },
    // Chat bubble shadows
    chatUser: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
  },
  blur: {
    none: 0,
    sm: 10,
    md: 20,
    lg: 40,
  },
} as const;

export const darkTokens = {
  colors: {
    bg: '#0C1110',
    surface: '#121716',
    text: '#F8FAF9',
    subtle: '#9BA4A9',
    // Keep primary consistent across modes (use moss as primary)
    primary: '#2E5540',
    // On-primary color in dark mode (linen/light)
    onPrimary: '#F9F6F1',
    accentMint: '#A5F3C1',
    accentPeri: '#AEB8FF',
    success: '#34C759',
    danger: '#E25555',
    warning: '#F59E0B',
    border: '#23302E',
    card: '#161B1A',
    // Provide same short aliases in dark mode where appropriate
    moss: '#2E5540',
    sage: '#BFD8C0',
    periwinkle: '#9CA6E0',
    linen: '#1A3328',
    deep: '#1A3328',
    charcoal: '#F8FAF9',

    // Worlds & Chapters (Phase 4a.2) - dark mode variants
    // @deprecated — use worldsSurface. Remove after 4a component sweep lands.
    oatDeep: '#2A2722',
    // @deprecated — use worldsCard. Remove after 4a component sweep lands.
    oatLight: '#332F28',
    // @deprecated — use worldsCardBorder for borders. Remove after 4a component sweep lands.
    oatDeeper: '#44402F',
    warmGrey: '#A89B7C',
    ambergold: '#C19858',
    ambergoldDeep: '#8C6A2A',
    ambergoldTint: 'rgba(193, 152, 88, 0.2)',
    ambergoldGlow: 'rgba(193, 152, 88, 0.28)',
    noticedBg: '#2F2B3A',
    noticedBorder: '#7A6EB2',
    noticedText: '#B5B0D0',
    noticedLabel: '#A299C9',

    worldPalette: lightTokens.colors.worldPalette,
    sweepHeat: lightTokens.colors.sweepHeat,

    // Worlds surfaces (dark mode)
    worldsSurface: '#121716', // surface dark
    worldsCard: '#1A201F', // lifted card
    worldsCardBorder: 'rgba(191,216,192,0.08)', // sageMist at 8%

    // Ink inverted: text is near-linen, background is deep
    worldsInk: '#F8FAF9',
    worldsInkSoft: 'rgba(248,250,249,0.68)',
    worldsInkMute: 'rgba(248,250,249,0.6)',
    worldsInkOutline: 'rgba(248,250,249,0.25)',

    // On-ink in dark mode — text on a sageMist or linen dark-accent bg
    onInkLabel: 'rgba(26,58,40,0.65)',
    onInkBody: 'rgba(26,58,40,0.82)',
    onInkCta: 'rgba(26,58,40,0.88)',

    // Completion
    sageGreen: '#97AF8F',

    // Relationship archetype — memoir hero, WithYou, Eras, AlsoTouched (B.3c-phase1)
    epigraphBorder: '#A88440',
    closedTagBg: '#5A2B18',
    closedTagFg: '#F0B89C',
    mossLight: '#2A3A30',
    mossMid: '#3A4F3F',

    doneTextMuted: 'rgba(248,250,249,0.4)',

    // Dormant
    dormantSurface: 'rgba(168,155,124,0.08)',
    dormantBorder: 'rgba(168,155,124,0.35)',

    // Emerging
    emergingSurface: 'rgba(193,152,88,0.12)',
    emergingBorder: 'rgba(194,152,88,0.55)',
    emergingTag: 'rgba(193,152,88,0.3)',

    // Noticed
    noticedSurfaceFaint: 'rgba(156,166,224,0.08)',
    noticedSurfaceSoft: 'rgba(156,166,224,0.14)',
    noticedEdgeSoft: 'rgba(156,166,224,0.3)',
    noticedEdgeStrong: 'rgba(156,166,224,0.4)',

    // Neutral chip
    chipNeutralBg: 'rgba(191,216,192,0.15)',
    chipNeutralBorder: 'rgba(191,216,192,0.3)',
    chipNeutralDot: '#BFD8C0',
    chipNeutralText: '#BFD8C0',

    // Chapter decoration
    chapterDecorBg: 'rgba(191,216,192,0.12)',
    chapterActionBg: 'rgba(191,216,192,0.25)',
    chapterActionBorder: 'rgba(191,216,192,0.4)',

    subtleGreen: 'rgba(248,250,249,0.55)',

    avatarPalette: lightTokens.colors.avatarPalette,

    // Phase B: chapter arc-shape accents (mockup 06)
    // Experience arc — pink family, used on ClosedExperienceChapter
    experienceAccent: '#D4537E',
    experienceAccentSoft: '#F4C0D1',
    experienceAccentDeep: '#72243E',

    // Commitment arc — periwinkle family, used on ClosedCommitmentChapter
    commitmentAccent: '#7F77DD',
    commitmentHeldFill: '#C0DD97',
    commitmentSlipMarker: '#EF9F27',

    // Outcome arc — reuses existing moss/forest greens, aliased for clarity
    outcomeAccent: '#2E5540',
    outcomeAccentSoft: 'rgba(46,85,64,0.22)',

    // Process arc — reuses sageGreen, aliased for clarity
    processAccent: '#97AF8F',

    // Phase B: chapter closed-banner
    chapterBannerBg: '#222222',
    chapterBannerText: '#F5F0E6',
    chapterBannerMuted: '#B4B2A9',
    chapterBannerDivider: '#5F5E5A',

    // Phase B: blocker badges and accents
    blockerRed: '#A32D2D',
    blockerRedBg: '#FCEBEB',
    blockerRedBorder: 'rgba(163,45,45,0.28)',
    blockerMarkerBg: '#F2A793',
    blockerMarkerFg: '#4F1402',

    // Phase B: ALSO TOUCHED chip palette (per world_type)
    chipProjectBorder: '#C0DD97',
    chipProjectText: '#173404',
    chipPracticeBorder: '#FAC775',
    chipPracticeText: '#854F0B',
    chipRelationshipBorder: '#CECBF6',
    chipRelationshipText: '#3C3489',
    chipDomesticBorder: 'rgba(168,155,124,0.35)', // matches darkTokens warmGrey
    chipDomesticText: '#A89B7C', // matches darkTokens warmGrey

    // Phase B: dashed-frame borders
    dashedFrameBorder: '#B4B2A9',
    dashedFrameLabel: '#5F5E5A',

    // Phase B: velocity dot colors — hero status line
    velocityDotGrowing: '#97AF8F',
    velocityDotSteady: '#888780',
    velocityDotCooling: '#B4B2A9',
    velocityDotDormant: 'rgba(122,118,101,0.35)',

    // Phase B.3a: serif summary underlines (archetype-specific tints on ArchetypeWorldHero)
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineProject: 'rgba(46,85,64,0.5)',
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineDomestic: 'rgba(122,118,101,0.5)',
    // unused after B.3a-fix; remove in B.10
    summaryUnderlineRelationship: 'rgba(140,63,30,0.5)',

    // @deprecated — use sageGreen. Remove after 4a component sweep lands.
    doneCheck: '#97AF8F',
    // @deprecated — use worldsCard / worldsCardBorder. Remove after 4a component sweep lands.
    oatCard: '#1A201F',
    oatCardBorder: 'rgba(191,216,192,0.08)',
  },
  chat: {
    assistantText: '#EDEDED',
    assistantTextBold: '#D4E5D6',
    userText: '#F9F6F1',
    userBubble: '#2E5540',
    gremlyMark: 'rgba(191, 216, 192, 0.65)',
    gremlyMarkGem: '#AEB8FF',
    bodyFontSize: 16,
    bodyLineHeight: 25,
    markFontSize: 10.5,
    markLetterSpacing: 0.6,
    userBubbleRadius: 16,
    userBubbleTailRadius: 4,
  },
  spacing: lightTokens.spacing,
  radius: lightTokens.radius,
  typography: lightTokens.typography,
  elevation: lightTokens.elevation,
  blur: lightTokens.blur,
} as const;

// Legacy exports for backward compatibility
export const colors = {
  deepTeal: {
    DEFAULT: '#0A2F2E',
    600: '#0D3B3A',
    700: '#0B3332',
    900: '#072524',
  },
  mint: '#B7F7E1',
  cream: '#FFF9F0',
  periwinkle: '#C9D4FF',
  bg: {
    DEFAULT: '#FFFDF8',
    secondary: '#FFF4E6',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#4B5563',
    tertiary: '#9CA3AF',
  },
  border: {
    DEFAULT: '#E7E2D9',
    light: '#F3F4F6',
    focus: '#0D3B3A',
  },
  white: '#FFFFFF',
  black: '#000000',
  // Top-level status colors for convenience (mirrors status.* below)
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  gray: '#9CA3AF',
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
} as const;

export const fontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;
