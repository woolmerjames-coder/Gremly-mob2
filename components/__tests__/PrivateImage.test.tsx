/**
 * A saved photo on screen (components/PrivateImage): it holds its place until
 * its private link is made, then shows through it.
 */
import React from 'react';
import { Image } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://abc.supabase.co/signed/${path}?token=t` },
          error: null,
        }),
      }),
    },
  },
}));

import { PrivateImage } from '../PrivateImage';

const SAVED = 'https://abc.supabase.co/storage/v1/object/public/log-photos/u1/n1/a.jpg';

describe('a saved photo', () => {
  it('holds its place while its link is made, then shows through the link', async () => {
    const { getByTestId, UNSAFE_queryByType } = render(
      <PrivateImage uri={SAVED} style={{ width: 40, height: 40 }} testID="photo" />,
    );
    // nothing is asked of the saved address itself
    expect(UNSAFE_queryByType(Image)).toBeNull();
    expect(getByTestId('photo').props.style).toEqual({ width: 40, height: 40 });
    await waitFor(() =>
      expect(UNSAFE_queryByType(Image)?.props.source).toEqual({
        uri: 'https://abc.supabase.co/signed/u1/n1/a.jpg?token=t',
      }),
    );
  });

  it('shows a photo still on the phone straight away', () => {
    const { UNSAFE_queryByType } = render(<PrivateImage uri="file:///one.jpg" testID="photo" />);
    expect(UNSAFE_queryByType(Image)?.props.source).toEqual({ uri: 'file:///one.jpg' });
  });
});
