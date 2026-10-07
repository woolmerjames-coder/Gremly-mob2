/**
 * The Add to Today sheet (components/now/NowQuickAddModal): a line saying
 * where the item goes, the box, and the two ways on. It carries no logo. What
 * is typed is handed to the screen, which drops it through the same process
 * as Mind Drop.
 */
import React from 'react';
import { Image } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { NowQuickAddModal } from '../NowQuickAddModal';

function sheet() {
  const spies = { onClose: jest.fn(), onSubmit: jest.fn(), onPressManualAdd: jest.fn() };
  return { ...render(<NowQuickAddModal visible {...spies} />), ...spies };
}

describe('the Add to Today sheet', () => {
  it('says where the item goes, with no logo', () => {
    const { getByTestId, UNSAFE_queryAllByType } = sheet();
    expect(getByTestId('quick-add-title').props.children).toBe("Adding to Today's Focus");
    expect(UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });

  it('hands what was typed to the screen and closes', () => {
    const { getByPlaceholderText, getByText, onSubmit, onClose } = sheet();
    fireEvent.changeText(getByPlaceholderText("What's on your mind?"), '  Call the vet  ');
    fireEvent.press(getByText('Drop to Gremly →'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(String(onSubmit.mock.calls[0][0]).trim()).toBe('Call the vet');
    expect(onClose).toHaveBeenCalled();
  });
});
