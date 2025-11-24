import type { ID } from '../lib/types';

export type CortexOutput =
  | {
      type: 'habit';
      frequency: 'daily' | 'weekly' | 'monthly';
      aiPlaced: boolean;
      whyString: string;
      /** AI-suggested tags the user can edit before saving */
      tags?: string[];
    }
  | {
      type: 'todo';
      undefinedDue: boolean;
      aiPlaced: boolean;
      whyString: string;
      /** AI-suggested tags the user can edit before saving */
      tags?: string[];
    }
  | {
      type: 'note';
      subtype: 'journal' | 'idea' | 'catchall' | 'reference';
      aiPlaced: boolean;
      whyString: string;
      /** AI-suggested tags the user can edit before saving */
      tags?: string[];
    };

export interface CortexInput {
  text: string;
  spaceId?: ID | null;
}

export interface ICortexEngine {
  classify(input: CortexInput): Promise<CortexOutput>;
}
