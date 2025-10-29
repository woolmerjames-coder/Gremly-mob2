import { parseDue as coreParseDue, type ParsedDue } from '../../cortex/entities/datetime';

export type { ParsedDue } from '../../cortex/entities/datetime';

export function parseDue(input: string, now?: Date): ParsedDue | null {
  return coreParseDue(input, now);
}
