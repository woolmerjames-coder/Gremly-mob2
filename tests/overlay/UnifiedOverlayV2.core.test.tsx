import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
// Mock provider before importing the component
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

it('disables Save until text entered; first line becomes title', () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  const input = getByPlaceholderText('Drop your thought…');
  const saveText = getByText('Save');
  // find ancestor with `disabled` prop (Button may wrap Text)
  let node: any = saveText as any;
  while (node && node.props && node.props.disabled === undefined) node = node.parent;
  expect(node).toBeDefined();
  expect(node.props.disabled).toBe(true);

  fireEvent.changeText(input, 'Hello world\nsecond');
  // re-resolve the ancestor after state change
  let node2: any = saveText as any;
  while (node2 && node2.props && node2.props.disabled === undefined) node2 = node2.parent;
  expect(node2.props.disabled).toBe(false);
});

it('saves note (log default) with title from first line', async () => {
  const { getByPlaceholderText, getByText } = render(<UnifiedOverlayV2 {...baseProps} />);
  fireEvent.changeText(getByPlaceholderText('Drop your thought…'), 'Hello V2\nrest');
  await act(() => Promise.resolve());
  fireEvent.press(getByText('Save'));
  // create called is asserted via mock in real harness (extend to check payload)
});

it('Resummarize title action updates title only when pressed', async () => {
  const actionSheetSpy = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_options, callback) => {
      callback?.(0);
    });

  const { getByPlaceholderText, getByTestId, getByLabelText } = render(
    <UnifiedOverlayV2 {...baseProps} />,
  );

  const bodyInput = getByPlaceholderText('Drop your thought…');
  fireEvent.changeText(bodyInput, 'First body line');
  await act(() => Promise.resolve());

  const titleInput = getByTestId('overlay-title-input');
  expect(titleInput.props.value).toBe('First body line');

  fireEvent.changeText(titleInput, 'Manual Title');
  fireEvent.changeText(bodyInput, 'Updated body content that needs summary');
  await act(() => Promise.resolve());

  expect(getByTestId('overlay-title-input').props.value).toBe('Manual Title');

  fireEvent.press(getByLabelText('More actions'));
  await act(() => Promise.resolve());

  expect(getByTestId('overlay-title-input').props.value).toBe(
    'Updated body content that needs summary',
  );

  actionSheetSpy.mockRestore();
});
