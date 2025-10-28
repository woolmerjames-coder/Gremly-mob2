import type { ID } from '../lib/types';

export type CortexOutput =
  | {
      type: 'habit';
      frequency: 'daily' | 'weekly' | 'monthly';
      aiPlaced: boolean;
      whyString: string;
    }
  | { type: 'todo'; undefinedDue: boolean; aiPlaced: boolean; whyString: string }
  | {
      type: 'note';
      subtype: 'journal' | 'list' | 'catchall';
      aiPlaced: boolean;
      whyString: string;
    };

export interface CortexInput {
  text: string;
  spaceId?: ID | null;
}

export interface ICortexEngine {
  classify(input: CortexInput): Promise<CortexOutput>;
}
