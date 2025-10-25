/**
 * v22 Components Accessibility Tests
 * Ensures key v22 UI components expose expected accessibility labels/roles.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import NewChatCTA from '../../components/spaces/v22/NewChatCTA';
import InsightsRow from '../../components/spaces/v22/InsightsRow';

describe('v22 accessibility', () => {
  it('NewChatCTA exposes button and label', () => {
    const onPress = jest.fn();
    const { getByLabelText, getByText } = render(<NewChatCTA onPress={onPress} />);

    // Accessible via label and visible text
    expect(getByLabelText('Start a chat with Gremly')).toBeTruthy();
    expect(getByText('Start a chat with Gremly')).toBeTruthy();
  });

  it('InsightsRow exposes three buttons with labels', () => {
    const { getByLabelText } = render(
      <InsightsRow onOpenNotepad={jest.fn()} onOpenPeople={jest.fn()} onOpenTimeline={jest.fn()} />,
    );

    expect(getByLabelText('Open notepad')).toBeTruthy();
    expect(getByLabelText('Open people')).toBeTruthy();
    expect(getByLabelText('Open timeline')).toBeTruthy();
  });
});
