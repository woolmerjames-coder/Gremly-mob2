/**
 * useOverwhelmFlow - Manages Overwhelm UI state and AI-powered planning
 * Helps users break down overwhelming tasks into manageable micro-steps
 *
 * @example
 * ```tsx
 * function OverwhelmButton() {
 *   const overwhelm = useOverwhelmFlow();
 *   const now = useNowData();
 *
 *   const handlePress = () => {
 *     overwhelm.open();
 *   };
 *
 *   const handleGeneratePlan = async () => {
 *     const selectedItems = now.activeItems
 *       .filter(item => overwhelm.selectedIds.includes(item.id))
 *       .map(item => ({ id: item.id, title: item.name }));
 *
 *     await overwhelm.requestPlan(selectedItems);
 *   };
 *
 *   return (
 *     <>
 *       <Button onPress={handlePress}>Feeling Overwhelmed?</Button>
 *
 *       {overwhelm.step === 'select' && (
 *         <SelectItemsModal
 *           items={now.activeItems}
 *           selectedIds={overwhelm.selectedIds}
 *           onToggle={overwhelm.toggleSelection}
 *           onConfirm={handleGeneratePlan}
 *           onClose={overwhelm.close}
 *         />
 *       )}
 *
 *       {overwhelm.step === 'planning' && (
 *         <PlanModal
 *           plan={overwhelm.plan}
 *           onEnterFocus={overwhelm.enterFocusMode}
 *           onClose={overwhelm.close}
 *         />
 *       )}
 *
 *       {overwhelm.step === 'focus' && (
 *         <FocusMode
 *           plan={overwhelm.plan}
 *           onExit={overwhelm.exitFocusMode}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { callChat, type ChatMessage } from '../cortex/CortexClient';
import { PERSONA_PROMPT } from '../cortex/persona/prompt';

export type OverwhelmStep = 'idle' | 'select' | 'planning' | 'focus';

export interface OverwhelmPlanItem {
  itemId: string;
  title: string;
  steps: string[];
  encouragement?: string;
}

export interface UseOverwhelmFlowReturn {
  step: OverwhelmStep;
  selectedIds: string[];
  plan: OverwhelmPlanItem[] | null;
  isLoading: boolean;

  open: () => void;
  close: () => void;
  toggleSelection: (id: string) => void;
  requestPlan: (items: { id: string; title: string }[]) => Promise<void>;
  enterFocusMode: () => void;
  exitFocusMode: () => void;
}

/**
 * Hook for managing the Overwhelm flow
 */
export function useOverwhelmFlow(): UseOverwhelmFlowReturn {
  const [step, setStep] = useState<OverwhelmStep>('idle');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<OverwhelmPlanItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback(() => {
    setStep('select');
    setSelectedIds([]);
    setPlan(null);
  }, []);

  const close = useCallback(() => {
    setStep('idle');
    setSelectedIds([]);
    setPlan(null);
    setIsLoading(false);
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  const requestPlan = useCallback(async (items: { id: string; title: string }[]) => {
    if (items.length === 0) return;

    setIsLoading(true);

    try {
      // Build the prompt
      const itemsList = items.map((item, idx) => `${idx + 1}. ${item.title}`).join('\n');
      const userPrompt = `User has selected these focus items for today:\n\n${itemsList}\n\nFor each item, provide 2-3 tiny starting steps and one short encouraging sentence. Return ONLY valid JSON in this exact format:\n\n[{"itemId": "id1", "title": "Item 1", "steps": ["step 1", "step 2", "step 3"], "encouragement": "You've got this!"}, ...]`;

      const messages: ChatMessage[] = [
        { role: 'system', content: PERSONA_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      const response = await callChat(messages, {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 800,
      });

      if (response.ok && response.data) {
        // Parse the response - it should be JSON
        let parsedPlan: OverwhelmPlanItem[];

        try {
          // The response format is { type: 'chat', content: string }
          const content =
            typeof response.data === 'string' ? response.data : (response.data as any).content;

          // Try to parse as JSON
          const parsed = JSON.parse(content);

          // Handle different response shapes
          if (Array.isArray(parsed)) {
            parsedPlan = parsed;
          } else if (parsed.items && Array.isArray(parsed.items)) {
            parsedPlan = parsed.items;
          } else if (parsed.plan && Array.isArray(parsed.plan)) {
            parsedPlan = parsed.plan;
          } else {
            throw new Error('Unexpected response format');
          }

          // Map to ensure we have the correct structure and include original IDs
          parsedPlan = parsedPlan.map((planItem, index) => ({
            itemId: items[index]?.id ?? planItem.itemId ?? `item-${index}`,
            title: items[index]?.title ?? planItem.title ?? 'Untitled',
            steps: Array.isArray(planItem.steps) ? planItem.steps : [],
            encouragement: planItem.encouragement,
          }));

          setPlan(parsedPlan);
          setStep('planning');
        } catch (parseError) {
          console.error('[Overwhelm] Failed to parse AI response:', parseError);

          // Fallback: create basic plan from items
          const fallbackPlan: OverwhelmPlanItem[] = items.map((item) => ({
            itemId: item.id,
            title: item.title,
            steps: ['Start with the first small step', 'Build momentum', 'Keep going'],
            encouragement: "You've got this!",
          }));

          setPlan(fallbackPlan);
          setStep('planning');
        }
      } else {
        const errorMsg = !response.ok ? (response as any).error : 'Unknown error';
        console.error('[Overwhelm] AI request failed:', errorMsg);

        // Fallback: create basic plan from items
        const fallbackPlan: OverwhelmPlanItem[] = items.map((item) => ({
          itemId: item.id,
          title: item.title,
          steps: ['Start with the first small step', 'Build momentum', 'Keep going'],
          encouragement: "You've got this!",
        }));

        setPlan(fallbackPlan);
        setStep('planning');
      }
    } catch (error) {
      console.error('[Overwhelm] requestPlan error:', error);

      // Fallback: create basic plan from items
      const fallbackPlan: OverwhelmPlanItem[] = items.map((item) => ({
        itemId: item.id,
        title: item.title,
        steps: ['Start with the first small step', 'Build momentum', 'Keep going'],
        encouragement: "You've got this!",
      }));

      setPlan(fallbackPlan);
      setStep('planning');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const enterFocusMode = useCallback(() => {
    setStep('focus');
  }, []);

  const exitFocusMode = useCallback(() => {
    if (plan) {
      setStep('planning');
    } else {
      setStep('idle');
    }
  }, [plan]);

  return {
    step,
    selectedIds,
    plan,
    isLoading,
    open,
    close,
    toggleSelection,
    requestPlan,
    enterFocusMode,
    exitFocusMode,
  };
}
