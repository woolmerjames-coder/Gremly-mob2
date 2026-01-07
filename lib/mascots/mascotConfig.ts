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
  // Default - first in list
  {
    id: 'astro',
    displayName: 'Astro',
    source: require('../../assets/mascot/astrogremly.png'),
  },
  {
    id: 'clipboard',
    displayName: 'Clipboard',
    source: require('../../assets/mascot/clipboardgremly.png'),
  },
  {
    id: 'fistbump',
    displayName: 'Fist Bump',
    source: require('../../assets/mascot/fistbumpgremly.png'),
  },
  {
    id: 'mascot',
    displayName: 'Classic',
    source: require('../../assets/mascot/gremly-mascot.png'),
  },
  {
    id: 'chat',
    displayName: 'Chat',
    source: require('../../assets/mascot/Gremlychat.png'),
  },
  {
    id: 'waving',
    displayName: 'Waving',
    source: require('../../assets/mascot/gremlywaving.png'),
  },
  {
    id: 'habit',
    displayName: 'Habit',
    source: require('../../assets/mascot/habitgremly.png'),
  },
  {
    id: 'journal',
    displayName: 'Journal',
    source: require('../../assets/mascot/JournalGremly.png'),
  },
  {
    id: 'morning',
    displayName: 'Morning',
    source: require('../../assets/mascot/morningbriefgremly.png'),
  },
  {
    id: 'runner',
    displayName: 'Runner',
    source: require('../../assets/mascot/running-removebg.png'),
  },
  {
    id: 'spacechat',
    displayName: 'Space Chat',
    source: require('../../assets/mascot/spaceschatchair.png'),
  },
  {
    id: 'sweep',
    displayName: 'Sweep',
    source: require('../../assets/mascot/sweepintrogremly.png'),
  },
  // New Space mascots from assets/Spaces/
  {
    id: 'beach',
    displayName: 'Beach',
    source: require('../../assets/Spaces/beach gremly.png'),
  },
  {
    id: 'ski',
    displayName: 'Ski',
    source: require('../../assets/Spaces/ski gremly.png'),
  },
  {
    id: 'terrarium',
    displayName: 'Gardener',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_holding_a_small_terr_1_0bc2e9f4-5070-4962-ab3a-12aa3b8750e5_0.png'),
  },
  {
    id: 'camera',
    displayName: 'Photographer',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_holding_a_tiny_vinta_2_85e5aff6-c5fa-4f9d-b194-eab24b5d413f_0.png'),
  },
  {
    id: 'meditation',
    displayName: 'Meditation',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_in_peaceful_meditati_3_111ade1e-08dd-4e85-a4c1-e00bc5b5dd3e_0.png'),
  },
  {
    id: 'scarf',
    displayName: 'Cozy Scarf',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_colorful_s_2_555b45eb-3c7f-4b42-858a-ca3355315680_0.png'),
  },
  {
    id: 'explorer',
    displayName: 'Explorer',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_dark_green_1_14c61d19-c3b4-4757-aa8b-8c0c83de6315_0.png'),
  },
  {
    id: 'adventurer',
    displayName: 'Adventurer',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_dark_green_1_d53dd344-bb87-40af-847d-a4f177350b0b_0.png'),
  },
  {
    id: 'safari',
    displayName: 'Safari',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_khaki_safa_3_a905f7b6-05a2-4f20-b985-2f3ca55b5d37_0.png'),
  },
  {
    id: 'chef',
    displayName: 'Chef',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_tall_white_1_d3ea408b-43a6-4684-846b-e43b6563f2aa_0.png'),
  },
  {
    id: 'artist',
    displayName: 'Artist',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_tiny_black_2_8f3096f1-2263-43ac-9dcb-536bcc5afbbd_0.png'),
  },
  {
    id: 'doctor',
    displayName: 'Doctor',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_tiny_steth_3_13eae3db-9352-4d76-beda-065395cc258c_0.png'),
  },
  {
    id: 'fitness',
    displayName: 'Fitness',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_a_white_swea_2_4cb00f1b-ecd6-477d-a0dc-85220c5fb74d_0.png'),
  },
  {
    id: 'hoodie',
    displayName: 'Hoodie',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_an_oversized_1_b1373251-3e11-4e6f-982e-2b2007ec554e_0.png'),
  },
  {
    id: 'headphones',
    displayName: 'Music',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_oversized_cr_2_e01ba0ce-ebec-4bd6-88b7-d125f6129372_0.png'),
  },
  {
    id: 'glasses',
    displayName: 'Scholar',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wearing_small_round_1_a8c97228-2a10-495d-94cf-88f7722db74a_0.png'),
  },
  {
    id: 'mug',
    displayName: 'Coffee',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_with_a_creamcolored_2_f3944e2c-0d2a-4384-be7b-03df32dad7be_0.png'),
  },
  {
    id: 'messy',
    displayName: 'Sleepy',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_with_extra_messy_fra_2_61c76064-4d7c-41e2-aca4-4e2918140d8f_0.png'),
  },
  {
    id: 'blanket',
    displayName: 'Cozy',
    source: require('../../assets/Spaces/Default_Cute_sage_green_gremlin_character_wrapped_in_a_soft_cr_2_1740198d-fac3-49d5-a087-ffa4dd3a0aea_0.png'),
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
