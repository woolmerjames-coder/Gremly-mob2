export type EnergyType = 'deep_focus' | 'administrative' | 'physical' | 'social' | 'quick';

interface BufferResult {
  prep_buffer_minutes: number;
  cooldown_buffer_minutes: number;
}

/**
 * Calculate prep and cooldown buffers based on energy type and task title.
 * Buffers are deterministic - no AI involved.
 */
export function calculateBuffers(
  energyType: EnergyType | string | null | undefined,
  title: string,
  visibleMinutes: number
): BufferResult {
  const energy = validateEnergyType(energyType);
  const titleLower = (title || '').toLowerCase();
  
  // Physical tasks - scale by intensity keywords
  if (energy === 'physical') {
    const highIntensity = /\b(gym|run|running|workout|hiit|training|weights|exercise|lifting)\b/.test(titleLower);
    const mediumIntensity = /\b(yoga|swim|swimming|bike|biking|cycling|jog|jogging)\b/.test(titleLower);
    
    if (highIntensity) {
      return { prep_buffer_minutes: 15, cooldown_buffer_minutes: 20 };
    }
    if (mediumIntensity) {
      return { prep_buffer_minutes: 10, cooldown_buffer_minutes: 15 };
    }
    // Light physical (walk, errands, cleaning)
    return { prep_buffer_minutes: 5, cooldown_buffer_minutes: 5 };
  }
  
  // Social tasks - scale by intensity
  if (energy === 'social') {
    const heavyMeeting = /\b(presentation|interview|pitch|review|1:1|one-on-one|important|client)\b/.test(titleLower);
    if (heavyMeeting) {
      return { prep_buffer_minutes: 10, cooldown_buffer_minutes: 10 };
    }
    // Regular calls/meetings
    return { prep_buffer_minutes: 5, cooldown_buffer_minutes: 5 };
  }
  
  // Deep focus - small buffer to get into flow
  if (energy === 'deep_focus') {
    return { prep_buffer_minutes: 5, cooldown_buffer_minutes: 5 };
  }
  
  // Administrative and quick - no buffers needed
  return { prep_buffer_minutes: 0, cooldown_buffer_minutes: 0 };
}

/**
 * Compute total minutes for planning (visible + buffers)
 */
export function computeTotalMinutes(
  visibleMinutes: number,
  prepBuffer: number,
  cooldownBuffer: number
): number {
  return (visibleMinutes || 0) + (prepBuffer || 0) + (cooldownBuffer || 0);
}

/**
 * Validate and normalize energy type to valid enum value
 */
export function validateEnergyType(energyType: string | null | undefined): EnergyType {
  const validTypes: EnergyType[] = ['deep_focus', 'administrative', 'physical', 'social', 'quick'];
  if (energyType && validTypes.includes(energyType as EnergyType)) {
    return energyType as EnergyType;
  }
  return 'administrative'; // safe default
}

/**
 * Infer energy type from title keywords (for backfill or when AI doesn't provide)
 */
export function inferEnergyTypeFromTitle(title: string): EnergyType {
  const t = (title || '').toLowerCase();
  
  if (/\b(run|running|gym|workout|exercise|walk|walking|yoga|swim|bike|cycling|weights|training|hiit)\b/.test(t)) {
    return 'physical';
  }
  if (/\b(call|meet|meeting|chat|talk|interview|presentation|1:1|sync|standup|huddle)\b/.test(t)) {
    return 'social';
  }
  if (/\b(write|writing|code|coding|design|plan|planning|create|build|draft|review|research|think|analyze)\b/.test(t)) {
    return 'deep_focus';
  }
  if (/\b(email|schedule|book|booking|pay|submit|file|form|invoice|expense|admin)\b/.test(t)) {
    return 'administrative';
  }
  
  return 'administrative'; // default
}
