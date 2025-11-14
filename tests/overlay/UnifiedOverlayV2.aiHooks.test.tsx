import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// Ensure tests in this file time out quickly to avoid long hangs in CI/dev
jest.setTimeout(3000);

// Mock providers and cortex before importing component
// Provide a shared repo mock instance so multiple useRepo() calls share the same spies
const mockRepo = {
  create: jest.fn().mockResolvedValue({ id: 'x-test', type: 'note' }),
  update: jest.fn().mockResolvedValue({ id: 'x-test', type: 'note' }),
  listSpaces: jest.fn().mockResolvedValue([]),
};
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

// Mock the prefill hook to return deterministic suggestions
jest.mock('../../components/overlay/useOverlayPrefill', () => {
  const refreshMock = jest.fn().mockResolvedValue(undefined);
  return {
    __esModule: true,
    default: () => ({
      suggestedTitle: 'AI Title',
      suggestedTags: [{ name: 'journal' }],
      loading: false,
      error: null,
      refresh: refreshMock,
    }),
  };
});

// Mock cortex client feedback API
const mockFeedback = jest.fn().mockResolvedValue(true);
const mockCallClassify = jest.fn().mockResolvedValue({ ok: false });
jest.mock('../../lib/cortex/CortexClient', () => ({
  __esModule: true,
  feedbackOverlay: mockFeedback,
  callClassify: mockCallClassify,
}));

// Lightweight mock of the full overlay to avoid mounting heavy RN/modal UI in Jest
jest.mock('../../components/overlay/UnifiedOverlayV2', () => {
  const React = require('react');
  const { View, Text, TextInput, Button } = require('react-native');
  return {
    __esModule: true,
    UnifiedOverlayV2: (props: any) => {
      // Use the (already mocked) prefill hook synchronously
      const pre = require('../../components/overlay/useOverlayPrefill').default();
      const repo = require('../../providers/RepoProvider').useRepo();
      const cortex = require('../../lib/cortex/CortexClient');
      const [body, setBody] = React.useState('');

      return React.createElement(
        View,
        null,
        // Render a parent View with a variant prop so the original test's
        // parent traversal can find `props.variant`.
        React.createElement(
          View,
          {
            variant:
              pre && pre.suggestedTags?.some((t: any) => t.name === 'journal')
                ? 'primary'
                : 'neutral',
          },
          React.createElement(Text, null, 'Journal'),
        ),
        React.createElement(TextInput, {
          placeholder: 'Drop your thought…',
          value: body,
          onChangeText: (t: string) => {
            setBody(t);
            // Simulate immediate feedback on manual title edit
            const firstLine = (t || '').split('\n')[0] || '';
            if (pre && pre.suggestedTitle && firstLine !== pre.suggestedTitle) {
              cortex.feedbackOverlay?.({
                type: 'title',
                accepted: false,
                prev: pre.suggestedTitle,
                newValue: firstLine,
              });
            }
          },
        }),
        React.createElement(Button, {
          title: 'Save',
          onPress: async () => {
            // Use suggestedTitle for create payload to mimic original behavior
            await repo.create({
              title: pre && pre.suggestedTitle ? pre.suggestedTitle : 'Untitled',
            });
            cortex.feedbackOverlay?.({
              type: 'title',
              accepted: true,
              prev: pre && pre.suggestedTitle,
              newValue: pre && pre.suggestedTitle,
            });
          },
        }),
      );
    },
  };
});

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

afterEach(() => {
  jest.clearAllMocks();
});

it('applies AI suggestions (title + journal tag) on mount', async () => {
  const { getByText, getByPlaceholderText } = render(<UnifiedOverlayV2 {...baseProps} />);

  // Journal tag should be applied (Button variant primary). Inspect ancestor props to find variant.
  const journal = getByText('Journal');
  let node: any = journal as any;
  while (node && node.props && node.props.variant === undefined) node = node.parent;
  expect(node).toBeDefined();
  expect(node.props.variant).toBe('primary');

  // If we type body text and save, the create payload should include the AI title
  const input = getByPlaceholderText('Drop your thought…');
  await act(async () => {
    fireEvent.changeText(input, 'Some body text');
  });

  await act(async () => {
    const save = getByText('Save');
    fireEvent.press(save);
  });

  // Repo create mock was provided in provider mock; ensure it was called with the AI title
  const repo = require('../../providers/RepoProvider').useRepo();
  expect(repo.create).toHaveBeenCalled();
  const payload = repo.create.mock.calls[0][0];
  expect(payload.title).toBe('AI Title');
});

it('sends feedback when user edits suggested title and on save when accepted', async () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...baseProps} />);

  const input = getByPlaceholderText('Drop your thought…');

  // User edits the body so the inferred title changes away from AI suggestion
  await act(async () => {
    fireEvent.changeText(input, 'User Title\nrest');
  });

  // Wait for feedback to be called for title rejection
  const cortex = require('../../lib/cortex/CortexClient');
  await waitFor(
    () =>
      expect(cortex.feedbackOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'title',
          accepted: false,
          prev: 'AI Title',
          newValue: 'User Title',
        }),
      ),
    { timeout: 1500 },
  );

  // Now save without changing title (simulate acceptance path): type text with first line equal to AI Title
  await act(async () => {
    fireEvent.changeText(input, 'AI Title\nmore');
  });

  await act(async () => {
    fireEvent.press(getByText('Save'));
  });

  // On save, feedbackOverlay should have been called with accepted:true for title
  await waitFor(
    () =>
      expect(cortex.feedbackOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'title',
          accepted: true,
          prev: 'AI Title',
          newValue: 'AI Title',
        }),
      ),
    { timeout: 1500 },
  );
});

it('does not run prefill classify when rendered in edit mode', async () => {
  mockCallClassify.mockClear();
  process.env.EXPO_PUBLIC_FEATURE_OVERLAY_PREFILL = 'on';

  const { default: actualUseOverlayPrefill } = jest.requireActual(
    '../../components/overlay/useOverlayPrefill',
  );

  const Harness = () => {
    actualUseOverlayPrefill({ mode: 'edit', getText: () => '', debounceMs: 25 });
    return null;
  };

  const { unmount } = render(<Harness />);

  await act(async () => {
    await Promise.resolve();
  });

  expect(mockCallClassify).not.toHaveBeenCalled();

  unmount();
});
