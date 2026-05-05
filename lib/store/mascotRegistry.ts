import { ImageSourcePropType } from 'react-native';

export const MASCOT_ASSETS: Record<string, ImageSourcePropType> = {
  adventurer_gremly: require('../../assets/mascot/adventurer_gremly.png'),
  artist_gremly: require('../../assets/mascot/artist_gremly.png'),
  astrogremly: require('../../assets/mascot/astrogremly.png'),
  beach_gremly: require('../../assets/mascot/beach_gremly.png'),
  chef_gremly: require('../../assets/mascot/chef_gremly.png'),
  clipboardgremly: require('../../assets/mascot/clipboardgremly.png'),
  coffee_gremly: require('../../assets/mascot/coffee_gremly.png'),
  cozy_gremly: require('../../assets/mascot/cozy_gremly.png'),
  cozyscarf_gremly: require('../../assets/mascot/cozyscarf_gremly.png'),
  doctor_gremly: require('../../assets/mascot/doctor_gremly.png'),
  explorer_gremly: require('../../assets/mascot/explorer_gremly.png'),
  fistbumpgremly: require('../../assets/mascot/fistbumpgremly.png'),
  fitness_gremly: require('../../assets/mascot/fitness_gremly.png'),
  gardener_gremly: require('../../assets/mascot/gardener_gremly.png'),
  'gremly-mascot': require('../../assets/mascot/gremly-mascot.png'),
  hoodie_gremly: require('../../assets/mascot/hoodie_gremly.png'),
  JournalGremly: require('../../assets/mascot/JournalGremly.png'),
  meditation_gremly: require('../../assets/mascot/meditation_gremly.png'),
  music_gremly: require('../../assets/mascot/music_gremly.png'),
  photographer_gremly: require('../../assets/mascot/photographer_gremly.png'),
  'running-removebg': require('../../assets/mascot/running-removebg.png'),
  safari_gremly: require('../../assets/mascot/safari_gremly.png'),
  scholar_gremly: require('../../assets/mascot/scholar_gremly.png'),
  ski_gremly: require('../../assets/mascot/ski_gremly.png'),
};

export const DEFAULT_MASCOT_SLUG = 'gremly-mascot';

export function resolveMascotAsset(slug: string | null | undefined): ImageSourcePropType {
  if (!slug) return MASCOT_ASSETS[DEFAULT_MASCOT_SLUG];
  return MASCOT_ASSETS[slug] ?? MASCOT_ASSETS[DEFAULT_MASCOT_SLUG];
}

export const ALL_MASCOT_SLUGS = Object.keys(MASCOT_ASSETS);
