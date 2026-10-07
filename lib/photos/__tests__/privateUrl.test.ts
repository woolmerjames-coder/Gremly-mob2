/**
 * Private links to saved photos (lib/photos/privateUrl): which addresses are
 * ours, making a link, using one again while it lasts, and what happens when
 * one cannot be made.
 */
let mockSigned: (path: string, seconds: number) => Promise<{ data: unknown; error: unknown }>;
const mockAsked: { bucket: string; path: string; seconds: number }[] = [];

jest.mock('../../supabase/client', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (path: string, seconds: number) => {
          mockAsked.push({ bucket, path, seconds });
          return mockSigned(path, seconds);
        },
      }),
    },
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { getDateService } from '../../date/DateService';
import {
  forgetPrivateUrls,
  privateUrl,
  readyPrivateUrl,
  storagePath,
  usePrivateUrl,
} from '../privateUrl';

const SAVED =
  'https://abc.supabase.co/storage/v1/object/public/log-photos/u1/n1/1700000000000-ab12c.jpg';
const PATH = 'u1/n1/1700000000000-ab12c.jpg';
const signed = (path: string) =>
  `https://abc.supabase.co/storage/v1/object/sign/log-photos/${path}?token=t`;

let clock: number;

beforeEach(() => {
  forgetPrivateUrls();
  mockAsked.length = 0;
  mockSigned = async (path) => ({ data: { signedUrl: signed(path) }, error: null });
  clock = new Date('2026-10-05T19:00:00Z').getTime();
  jest.spyOn(getDateService(), 'now').mockImplementation(() => new Date(clock));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('where a photo is in storage', () => {
  it('is read from the address it was saved with', () => {
    expect(storagePath(SAVED)).toBe(PATH);
  });

  it('is read from a private link too, without its token', () => {
    expect(storagePath(signed(PATH))).toBe(PATH);
  });

  it('copes with a name that was written out for an address', () => {
    expect(
      storagePath(
        'https://abc.supabase.co/storage/v1/object/public/log-photos/u1/n1/my%20photo.jpg',
      ),
    ).toBe('u1/n1/my photo.jpg');
  });

  it('is nowhere for a photo still on the phone, or an address that is not ours', () => {
    expect(storagePath('file:///var/mobile/tmp/photo.jpg')).toBeNull();
    expect(storagePath('https://example.com/cat.jpg')).toBeNull();
    expect(
      storagePath('https://abc.supabase.co/storage/v1/object/public/avatars/u1.jpg'),
    ).toBeNull();
    expect(storagePath('')).toBeNull();
    expect(storagePath(null)).toBeNull();
  });
});

describe('the link to show a photo with', () => {
  it('is made for the photo’s file, to last an hour', async () => {
    expect(await privateUrl(SAVED)).toBe(signed(PATH));
    expect(mockAsked).toEqual([{ bucket: 'log-photos', path: PATH, seconds: 3600 }]);
  });

  it('is used again while it still has time on it', async () => {
    await privateUrl(SAVED);
    clock += 50 * 60 * 1000;
    expect(await privateUrl(SAVED)).toBe(signed(PATH));
    expect(readyPrivateUrl(SAVED)).toBe(signed(PATH));
    expect(mockAsked).toHaveLength(1);
  });

  it('is made again when it is about to run out', async () => {
    await privateUrl(SAVED);
    clock += 56 * 60 * 1000;
    expect(readyPrivateUrl(SAVED)).toBeNull();
    await privateUrl(SAVED);
    expect(mockAsked).toHaveLength(2);
  });

  it('is asked for once when two screens want the same photo at the same moment', async () => {
    const [a, b] = await Promise.all([privateUrl(SAVED), privateUrl(SAVED)]);
    expect(a).toBe(b);
    expect(mockAsked).toHaveLength(1);
  });

  it('leaves a photo on the phone, and an address that is not ours, as they are', async () => {
    expect(await privateUrl('file:///var/mobile/tmp/photo.jpg')).toBe(
      'file:///var/mobile/tmp/photo.jpg',
    );
    expect(await privateUrl('https://example.com/cat.jpg')).toBe('https://example.com/cat.jpg');
    expect(mockAsked).toHaveLength(0);
  });

  it('falls back to the saved address when a link cannot be made, and tries again next time', async () => {
    mockSigned = async () => ({ data: null, error: new Error('offline') });
    expect(await privateUrl(SAVED)).toBe(SAVED);
    mockSigned = async (path) => ({ data: { signedUrl: signed(path) }, error: null });
    expect(await privateUrl(SAVED)).toBe(signed(PATH));
  });
});

describe('a screen showing a photo', () => {
  it('has nothing to show until the link is made, then shows it', async () => {
    const { result } = renderHook(() => usePrivateUrl(SAVED));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(signed(PATH)));
  });

  it('shows a link made earlier straight away', async () => {
    await privateUrl(SAVED);
    const { result } = renderHook(() => usePrivateUrl(SAVED));
    expect(result.current).toBe(signed(PATH));
  });

  it('shows a photo on the phone as it is', async () => {
    const { result } = renderHook(() => usePrivateUrl('file:///tmp/photo.jpg'));
    expect(result.current).toBe('file:///tmp/photo.jpg');
  });

  it('never shows one photo’s link for another', async () => {
    const other = SAVED.replace('ab12c', 'zz99z');
    const { result, rerender } = renderHook(({ url }: { url: string }) => usePrivateUrl(url), {
      initialProps: { url: SAVED },
    });
    await waitFor(() => expect(result.current).toBe(signed(PATH)));
    rerender({ url: other });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(signed(PATH.replace('ab12c', 'zz99z'))));
  });

  it('has nothing to show for no photo', async () => {
    const { result } = renderHook(() => usePrivateUrl(null));
    await act(async () => undefined);
    expect(result.current).toBeNull();
  });
});
