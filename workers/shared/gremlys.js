/**
 * The Gremlys a World can wear (mascot_slug): each one's slug, how it looks,
 * and the parts of life its look was drawn for. One list for every writer that
 * chooses one: a new person's first Worlds (inngest-jobs/context/firstWorlds.js)
 * and the Sunday classifier while it lasts (inngest-jobs/worldsClassifier.ts).
 * Moved here from the classifier in data fabric stage 4b.
 */

export const GREMLY_CATALOG = Object.freeze([
  {
    slug: 'adventurer_gremly',
    archetype_tags: ['learning', 'study', 'academic', 'curiosity'],
    visual: 'graduation cap with tassel, round glasses, holding a stack of colorful books',
  },
  {
    slug: 'artist_gremly',
    archetype_tags: ['finance', 'wealth', 'investing', 'business'],
    visual: 'top hat, monocle, holding gold coin marked with a dollar sign',
  },
  {
    slug: 'astrogremly',
    archetype_tags: ['exploration', 'frontier', 'ambition', 'wonder'],
    visual: 'round space helmet with bubble visor, serene smile',
  },
  {
    slug: 'beach_gremly',
    archetype_tags: ['vacation', 'leisure', 'relaxation'],
    visual:
      'sunglasses, hawaiian shirt, reclining in a deck chair holding a cocktail with umbrella straw',
  },
  {
    slug: 'chef_gremly',
    archetype_tags: ['cooking', 'nourishment', 'domestic craft'],
    visual: 'chef hat, apron, holding a whisk',
  },
  {
    slug: 'clipboardgremly',
    archetype_tags: ['execution', 'tracking', 'admin', 'task focus'],
    visual: 'holding a clipboard with checkboxes',
  },
  {
    slug: 'coffee_gremly',
    archetype_tags: ['rest', 'pause', 'dormancy', 'recovery'],
    visual: 'curled up sleeping, eyes closed, peaceful',
  },
  {
    slug: 'cozy_gremly',
    archetype_tags: ['home comfort', 'warmth', 'self-care', 'hibernation'],
    visual: 'wrapped in a cream blanket, holding a mug',
  },
  {
    slug: 'cozyscarf_gremly',
    archetype_tags: ['celebration', 'milestone', 'joy'],
    visual: 'striped party hat, arms raised, open-mouthed grin',
  },
  {
    slug: 'doctor_gremly',
    archetype_tags: ['medical care', 'caregiving', 'healing', 'physical health'],
    visual: 'stethoscope around neck, holding a red heart',
  },
  {
    slug: 'explorer_gremly',
    archetype_tags: ['visual art', 'creative craft', 'painting'],
    visual: 'green beret, holding a paintbrush',
  },
  {
    slug: 'fistbumpgremly',
    archetype_tags: ['motivation', 'momentum', 'drive', 'encouragement'],
    visual: 'arms bent at elbows in a motivated pose, eyes closed smiling',
  },
  {
    slug: 'fitness_gremly',
    archetype_tags: ['strength training', 'gym', 'body exertion', 'weights'],
    visual: 'headband, lifting dumbbells in both hands, mid-workout',
  },
  {
    slug: 'gardener_gremly',
    archetype_tags: ['growth', 'nurture', 'patience', 'gentle care', 'recovery'],
    visual: 'holding a potted seedling, eyes closed, peaceful',
  },
  {
    slug: 'gremly-mascot',
    archetype_tags: [],
    visual: 'plain standing gremly with no accessories, neutral friendly smile',
  },
  {
    slug: 'hoodie_gremly',
    archetype_tags: ['playful adventure', 'bold confidence', 'frontier'],
    visual: 'wide brown cowboy hat, winking, yellow star badge on chest',
  },
  {
    slug: 'JournalGremly',
    archetype_tags: ['reflection', 'contemplation', 'journaling', 'stillness'],
    visual: 'small sitting upright, eyes closed, plain green, peaceful',
  },
  {
    slug: 'meditation_gremly',
    archetype_tags: ['mindfulness', 'meditation', 'stillness', 'mental wellness'],
    visual: 'seated in lotus pose, hands together in prayer, eyes closed, serene',
  },
  {
    slug: 'music_gremly',
    archetype_tags: ['music', 'audio', 'creative flow', 'immersion'],
    visual: 'standing with headphones on, eyes closed, content',
  },
  {
    slug: 'photographer_gremly',
    archetype_tags: ['travel', 'transition', 'movement', 'relocation'],
    visual: 'standing with an orange suitcase, waving, alert expression',
  },
  {
    slug: 'running-removebg',
    archetype_tags: ['cardio', 'running', 'body exertion', 'movement'],
    visual: 'headband, wristbands, mid-run with motion lines, energized',
  },
  {
    slug: 'safari_gremly',
    archetype_tags: ['outdoor exploration', 'discovery', 'adventure travel'],
    visual: 'wide-brim safari hat, holding binoculars',
  },
  {
    slug: 'scholar_gremly',
    archetype_tags: ['professional work', 'corporate career', 'office job', 'day job'],
    visual: 'round glasses, green tie, holding a laptop',
  },
  {
    slug: 'ski_gremly',
    archetype_tags: ['winter sport', 'seasonal outdoor adventure', 'skiing'],
    visual: 'goggles, jacket, holding ski poles',
  },
]);

export const GREMLY_SLUGS = Object.freeze(GREMLY_CATALOG.map((g) => g.slug));

/** The Gremly with no outfit, for a World no other look suits. */
export const PLAIN_GREMLY = 'gremly-mascot';
