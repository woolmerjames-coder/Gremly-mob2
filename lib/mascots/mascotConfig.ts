/**
 * Mascot Configuration
 *
 * Centralized config for all Gremly mascot variants.
 * Used by GremlyPicker and anywhere mascots need to be displayed.
 */

export interface MascotOption {
  id: string;
  displayName: string;
  source: any; // require() result
}

/**
 * All available Gremly mascots.
 * Default (astro) should be first in the array.
 */
export const MASCOT_OPTIONS: MascotOption[] = [
  // Default - must be first
  {
    id: 'astro',
    displayName: 'Astro',
    source: require('../../assets/mascot/astrogremly.png'),
  },
  {
    id: 'beach',
    displayName: 'Beach',
    source: require('../../assets/mascot/beach_gremly.png'),
  },
  {
    id: 'ski',
    displayName: 'Ski',
    source: require('../../assets/mascot/ski_gremly.png'),
  },
  {
    id: 'gardener',
    displayName: 'Gardener',
    source: require('../../assets/mascot/gardener_gremly.png'),
  },
  {
    id: 'photographer',
    displayName: 'Photographer',
    source: require('../../assets/mascot/photographer_gremly.png'),
  },
  {
    id: 'meditation',
    displayName: 'Meditation',
    source: require('../../assets/mascot/meditation_gremly.png'),
  },
  {
    id: 'cozyscarf',
    displayName: 'Cozy Scarf',
    source: require('../../assets/mascot/cozyscarf_gremly.png'),
  },
  {
    id: 'explorer',
    displayName: 'Explorer',
    source: require('../../assets/mascot/explorer_gremly.png'),
  },
  {
    id: 'adventurer',
    displayName: 'Adventurer',
    source: require('../../assets/mascot/adventurer_gremly.png'),
  },
  {
    id: 'safari',
    displayName: 'Safari',
    source: require('../../assets/mascot/safari_gremly.png'),
  },
  {
    id: 'chef',
    displayName: 'Chef',
    source: require('../../assets/mascot/chef_gremly.png'),
  },
  {
    id: 'artist',
    displayName: 'Artist',
    source: require('../../assets/mascot/artist_gremly.png'),
  },
  {
    id: 'doctor',
    displayName: 'Doctor',
    source: require('../../assets/mascot/doctor_gremly.png'),
  },
  {
    id: 'fitness',
    displayName: 'Fitness',
    source: require('../../assets/mascot/fitness_gremly.png'),
  },
  {
    id: 'hoodie',
    displayName: 'Hoodie',
    source: require('../../assets/mascot/hoodie_gremly.png'),
  },
  {
    id: 'music',
    displayName: 'Music',
    source: require('../../assets/mascot/music_gremly.png'),
  },
  {
    id: 'scholar',
    displayName: 'Scholar',
    source: require('../../assets/mascot/scholar_gremly.png'),
  },
  {
    id: 'coffee',
    displayName: 'Coffee',
    source: require('../../assets/mascot/coffee_gremly.png'),
  },
  {
    id: 'sleepy',
    displayName: 'Sleepy',
    source: require('../../assets/mascot/sleepy_gremly.png'),
  },
  {
    id: 'cozy',
    displayName: 'Cozy',
    source: require('../../assets/mascot/cozy_gremly.png'),
  },
];

export const DEFAULT_MASCOT_ID = 'astro';

/**
 * Get a mascot option by ID.
 * Returns default (astro) if ID not found.
 */
export const getMascotById = (id: string): MascotOption => {
  return MASCOT_OPTIONS.find((m) => m.id === id) || MASCOT_OPTIONS[0];
};

/**
 * Get the image source for a mascot by ID.
 * Returns default (astro) source if ID not found.
 */
export const getMascotSource = (id: string): any => {
  return getMascotById(id).source;
};
