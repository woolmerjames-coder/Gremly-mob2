import type { World, Chapter } from '../../../lib/supabase/types';

export interface WorldModuleProps {
  world: World;
  currentChapter: Chapter | null;
}
