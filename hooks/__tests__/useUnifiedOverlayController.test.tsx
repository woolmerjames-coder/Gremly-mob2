jest.mock('../../contexts/OverlayContext', () => {
  const React = require('react');
  const { persistedNoteSubtypeToLogSubtype } = require('../../lib/logSubtypes');

  const CATCHALL_LABEL = 'catchall';
  const NEEDS_REVIEW_LABEL = 'needs_review';

  const createDefaultState = () => ({
    visible: false,
    mode: 'create',
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
  });

  const OverlayContext = React.createContext(undefined);

  const resolveEntityFromRecord = (record: any) => {
    if (record.type === 'habit') {
      return { entityType: 'habit', logSubtype: null } as const;
    }
    if (record.type === 'todo') {
      return { entityType: 'todo', logSubtype: null } as const;
    }
    if (record.type === 'note') {
      const labels = record?.labels as string[] | undefined;
      const recordSubtype = record?.subtype as string | undefined;

      if (labels?.includes?.(NEEDS_REVIEW_LABEL) || recordSubtype === CATCHALL_LABEL) {
        return { entityType: 'unsorted', logSubtype: null } as const;
      }

      return {
        entityType: 'log',
        logSubtype: persistedNoteSubtypeToLogSubtype(recordSubtype ?? null),
      } as const;
    }

    return { entityType: 'log', logSubtype: 'everything_else' } as const;
  };

  const OverlayProvider = ({ children }: { children: React.ReactNode }) => {
    const [state, setState] = React.useState(createDefaultState());

    const openCreate = React.useCallback((options: any = {}) => {
      const { type, spaceId, logSubtype } = options;
      setState({
        visible: true,
        mode: 'create',
        initialEntity: type
          ? {
              type,
              id: undefined,
              logSubtype: type === 'log' ? logSubtype ?? null : null,
            }
          : undefined,
        initialSpaceId: spaceId ?? null,
        conversionMeta: undefined,
      });
    }, [setState]);

    const openEdit = React.useCallback((options: any) => {
      const { record, spaceId } = options;
      const { entityType, logSubtype } = resolveEntityFromRecord(record);

      setState({
        visible: true,
        mode: 'edit',
        initialEntity: {
          type: entityType,
          id: record.id,
          logSubtype,
        },
        initialSpaceId: spaceId ?? null,
        conversionMeta: undefined,
      });
    }, [setState]);

    const close = React.useCallback(() => {
      setState(createDefaultState());
    }, [setState]);

    const value = React.useMemo(
      () => ({
        state,
        openCreate,
        openEdit,
        close,
      }),
      [state, openCreate, openEdit, close],
    );

    return React.createElement(OverlayContext.Provider, { value }, children);
  };

  const useGlobalOverlay = () => {
    const context = React.useContext(OverlayContext);
    if (!context) {
      throw new Error('useGlobalOverlay must be used within OverlayProvider (mock)');
    }
    return context;
  };

  return {
    OverlayProvider,
    useGlobalOverlay,
  };
});

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { OverlayProvider, useGlobalOverlay } from '../../contexts/OverlayContext';
import { useUnifiedOverlayController } from '../useUnifiedOverlayController';
import type { Todo } from '../../lib/types';

describe('useUnifiedOverlayController', () => {
  const baseTodoRecord: Todo = {
    id: 'todo-1',
    type: 'todo',
    name: 'Pack passport',
    ai_placed: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    owner_id: 'user-1',
    space_id: null,
    due_date: null,
    due_time: null,
    undefined_due: true,
  };

  const TestHarness = ({ record, spaceId }: { record: Todo; spaceId: string | null }) => {
    const controller = useUnifiedOverlayController();
    const overlay = useGlobalOverlay();
    const { openEdit } = controller;

    React.useEffect(() => {
      openEdit({ record, spaceId });
    }, [openEdit, record, spaceId]);

    return (
      <>
        <Text testID="overlay-mode">{overlay.state.mode}</Text>
        <Text testID="overlay-entity-type">{overlay.state.initialEntity?.type ?? 'none'}</Text>
        <Text testID="overlay-log-subtype">
          {overlay.state.initialEntity?.logSubtype ?? 'null'}
        </Text>
      </>
    );
  };

  it('keeps todo edit selection without log subtype', async () => {
    const { getByTestId } = render(
      <OverlayProvider>
        <TestHarness record={baseTodoRecord} spaceId="space-1" />
      </OverlayProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('overlay-mode').props.children).toBe('edit');
      expect(getByTestId('overlay-entity-type').props.children).toBe('todo');
      expect(getByTestId('overlay-log-subtype').props.children).toBe('null');
    });
  });
});
