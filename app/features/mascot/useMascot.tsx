/**
 * Mascot React Hook and Provider (Phase 10.6)
 *
 * Connects the mascot state machine to React components and
 * subscribes to chat events to drive state changes.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { env } from '../../../lib/env';
import { subscribeToChatEvents, type ChatEvent } from '../../lib/chat/events';
import {
  MascotMachine,
  createMascotController,
  shouldShowMascot,
  type MascotState,
} from './mascotMachine';

// Context types
interface MascotContextValue {
  state: MascotState;
  isVisible: boolean;
  isEnabled: boolean;
  debugInfo?: {
    listenerCount: number;
    lastTransition: number;
    hasTimeout: boolean;
  };
}

interface MascotProviderProps {
  children: ReactNode;
  lane?: string; // Current UI lane (space_chat, catchall, etc.)
}

// Create context
const MascotContext = createContext<MascotContextValue | null>(null);

/**
 * MascotProvider - Manages mascot state machine and chat event subscriptions
 */
export function MascotProvider({ children, lane }: MascotProviderProps): React.JSX.Element {
  const [state, setState] = useState<MascotState>('idle');
  const [debugInfo, setDebugInfo] = useState<any>(undefined);
  const machineRef = useRef<MascotMachine | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize mascot machine on mount
  useEffect(() => {
    if (!env.feature.mascot.enabled) {
      return;
    }

    // Create mascot state machine
    const machine = createMascotController('idle');
    machineRef.current = machine;

    // Subscribe to state changes
    const unsubscribeFromMachine = machine.subscribe((newState) => {
      setState(newState);
      // Update debug info when state changes
      if (env.feature.mascot.debug) {
        setDebugInfo(machine.getStateInfo());
      }
    });

    // Subscribe to chat events
    const unsubscribeFromEvents = subscribeToChatEvents((event: ChatEvent) => {
      // Only process events when mascot should be visible for current lane
      if (shouldShowMascot(lane)) {
        machine.dispatch({ type: 'CHAT_EVENT', event });
      }
    });

    unsubscribeRef.current = () => {
      unsubscribeFromMachine();
      unsubscribeFromEvents();
    };

    // Cleanup on unmount
    return () => {
      unsubscribeRef.current?.();
      machine.destroy();
    };
  }, [lane]);

  // Update lane visibility
  const isVisible = env.feature.mascot.enabled && shouldShowMascot(lane);
  const isEnabled = env.feature.mascot.enabled;

  const contextValue: MascotContextValue = {
    state,
    isVisible,
    isEnabled,
    debugInfo,
  };

  return <MascotContext.Provider value={contextValue}>{children}</MascotContext.Provider>;
}

/**
 * useMascot hook - Access mascot state and visibility
 */
export function useMascot(): MascotContextValue {
  const context = useContext(MascotContext);

  if (!context) {
    throw new Error('useMascot must be used within a MascotProvider');
  }

  return context;
}

/**
 * useMascotState hook - Simple access to just the state
 */
export function useMascotState(): MascotState {
  const { state } = useMascot();
  return state;
}

/**
 * Hook for components that need to know if mascot is active
 */
export function useMascotVisibility(): { isVisible: boolean; isEnabled: boolean } {
  const { isVisible, isEnabled } = useMascot();
  return { isVisible, isEnabled };
}
