/**
 * Photos on a journal entry (lib/journal/photos): what the page shows,
 * choosing from the library, and sending and deleting once the entry is
 * saved.
 */
type Result = { data?: unknown; error?: unknown };

let mockUser: string | null = 'u1';
let mockRows: Record<string, unknown>[] = [];
let mockSelectError: unknown = null;
let mockUploadError: unknown = null;
let mockInsertError: unknown = null;
const mockUploaded: { path: string; type: string }[] = [];
const mockInserted: Record<string, unknown>[] = [];
const mockDeletedRows: string[] = [];
const mockRemovedFiles: string[] = [];
const mockPicker = jest.fn();

jest.mock('../../supabase/client', () => {
  const table = () => {
    let op = 'select';
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.order = () => q;
    q.insert = (row: Record<string, unknown>) => {
      op = 'insert';
      if (!mockInsertError) mockInserted.push(row);
      return q;
    };
    q.delete = () => {
      op = 'delete';
      return q;
    };
    q.eq = (_col: string, value: string) => {
      if (op === 'delete') mockDeletedRows.push(value);
      return q;
    };
    q.then = (yes: (r: Result) => unknown, no: (e: unknown) => unknown) => {
      const result: Result =
        op === 'select'
          ? { data: mockSelectError ? null : mockRows, error: mockSelectError }
          : op === 'insert'
            ? { data: null, error: mockInsertError }
            : { data: null, error: null };
      return Promise.resolve(result).then(yes, no);
    };
    return q;
  };
  return {
    supabase: {
      from: () => table(),
      auth: {
        getSession: async () => ({
          data: { session: mockUser ? { user: { id: mockUser } } : null },
        }),
      },
      storage: {
        from: () => ({
          upload: async (path: string, _file: unknown, opts: { contentType: string }) => {
            if (mockUploadError) return { data: null, error: mockUploadError };
            mockUploaded.push({ path, type: opts.contentType });
            return { data: { path }, error: null };
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://abc.supabase.co/storage/v1/object/public/log-photos/${path}`,
            },
          }),
          remove: async (paths: string[]) => {
            mockRemovedFiles.push(...paths);
            return { data: null, error: null };
          },
        }),
      },
    },
  };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...a: unknown[]) => mockPicker(...a),
  MediaTypeOptions: { Images: 'Images' },
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import {
  NO_PHOTO_CHANGES,
  PHOTOS_MAX,
  choosePhotos,
  entryPhotoCount,
  hasPhotoChanges,
  loadEntryPhotos,
  photosFailedMessage,
  photosShown,
  removePhotoFiles,
  saveEntryPhotos,
  useEntryPhotos,
  useEntryPhotosStore,
  withPhotos,
  withoutPhoto,
  type EntryPhoto,
} from '../photos';

const address = (path: string) =>
  `https://abc.supabase.co/storage/v1/object/public/log-photos/${path}`;
const saved = (id: string, position: number): EntryPhoto => ({
  id,
  url: address(`u1/n1/${id}.jpg`),
  position,
});
const A = saved('a', 0);
const B = saved('b', 1);

beforeEach(() => {
  mockUser = 'u1';
  mockRows = [];
  mockSelectError = null;
  mockUploadError = null;
  mockInsertError = null;
  mockUploaded.length = 0;
  mockInserted.length = 0;
  mockDeletedRows.length = 0;
  mockRemovedFiles.length = 0;
  mockPicker.mockReset();
  useEntryPhotosStore.setState({ byEntry: {} });
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the photos on the page', () => {
  it('are the saved ones, then the ones just chosen', () => {
    const shown = photosShown([A, B], { added: ['file:///one.jpg'], removed: [] });
    expect(shown.map((p) => [p.key, p.saved])).toEqual([
      ['a', true],
      ['b', true],
      ['file:///one.jpg', false],
    ]);
  });

  it('lose a saved one that was taken off, without deleting anything yet', () => {
    const [first] = photosShown([A, B], NO_PHOTO_CHANGES);
    const changes = withoutPhoto(NO_PHOTO_CHANGES, first);
    expect(changes).toEqual({ added: [], removed: ['a'] });
    expect(photosShown([A, B], changes).map((p) => p.key)).toEqual(['b']);
    expect(mockDeletedRows).toEqual([]);
  });

  it('let go of a chosen one that was taken off again', () => {
    const start = { added: ['file:///one.jpg', 'file:///two.jpg'], removed: [] };
    const chosen = photosShown([], start)[0];
    expect(withoutPhoto(start, chosen)).toEqual({ added: ['file:///two.jpg'], removed: [] });
  });

  it('take as many chosen photos as there is room for, each once', () => {
    const five = Array.from({ length: 5 }, (_, i) => saved(`p${i}`, i));
    const changes = withPhotos(NO_PHOTO_CHANGES, five, ['file:///one.jpg', 'file:///two.jpg']);
    expect(changes.added).toEqual(['file:///one.jpg']);
    expect(photosShown(five, changes)).toHaveLength(PHOTOS_MAX);
    expect(withPhotos(changes, [], ['file:///one.jpg', 'file:///one.jpg']).added).toEqual([
      'file:///one.jpg',
    ]);
  });

  it('know whether anything was changed', () => {
    expect(hasPhotoChanges(NO_PHOTO_CHANGES)).toBe(false);
    expect(hasPhotoChanges(null)).toBe(false);
    expect(hasPhotoChanges({ added: [], removed: ['a'] })).toBe(true);
  });
});

describe('choosing from the library', () => {
  it('asks for images, squeezed, as many as there is room for', async () => {
    mockPicker.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///one.jpg' },
        { uri: 'file:///two.jpg' },
        { uri: 'file:///three.jpg' },
      ],
    });
    expect(await choosePhotos(2)).toEqual({
      ok: true,
      uris: ['file:///one.jpg', 'file:///two.jpg'],
    });
    expect(mockPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: 'Images',
        allowsMultipleSelection: true,
        selectionLimit: 2,
        quality: 0.6,
      }),
    );
  });

  it('is nothing chosen when the person backs out', async () => {
    mockPicker.mockResolvedValue({ canceled: true, assets: [] });
    expect(await choosePhotos(3)).toEqual({ ok: true, uris: [] });
  });

  it('says so when there is no room, without opening the library', async () => {
    expect(await choosePhotos(0)).toEqual({
      ok: false,
      message: 'An entry has room for six photos.',
    });
    expect(mockPicker).not.toHaveBeenCalled();
  });

  it('says so when the library cannot be opened', async () => {
    mockPicker.mockRejectedValue(new Error('no access'));
    expect(await choosePhotos(3)).toEqual({
      ok: false,
      message: 'Your photos could not be opened. Try again.',
    });
  });
});

describe('an entry’s saved photos', () => {
  it('are read from the account, in order, and kept for the next screen', async () => {
    mockRows = [
      { id: 'a', url: A.url, position: 0 },
      { id: 'b', url: B.url, position: 1 },
      { id: 7, url: 'not a photo' },
    ];
    expect(await loadEntryPhotos('n1')).toEqual([A, B]);
    expect(useEntryPhotosStore.getState().byEntry.n1).toEqual([A, B]);
    expect(entryPhotoCount({ id: 'n1', log_photos: [] })).toBe(2);
  });

  it('stay as last read when the account cannot be reached', async () => {
    useEntryPhotosStore.setState({ byEntry: { n1: [A] } });
    mockSelectError = new Error('offline');
    expect(await loadEntryPhotos('n1')).toEqual([A]);
  });

  it('are counted from what the app loaded with the entry until they are read here', () => {
    expect(entryPhotoCount({ id: 'n2', log_photos: [{}, {}, {}] })).toBe(3);
    expect(entryPhotoCount({ id: 'n3' })).toBe(0);
  });

  it('reach a screen once they are read, and nothing is read for no entry', async () => {
    mockRows = [{ id: 'a', url: A.url, position: 0 }];
    const { result } = renderHook(() => useEntryPhotos('n1'));
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual([A]));
    const none = renderHook(() => useEntryPhotos(null));
    expect(none.result.current).toEqual([]);
  });
});

describe('once the entry is saved', () => {
  it('does nothing when the photos were not changed', async () => {
    expect(await saveEntryPhotos('n1', [A], NO_PHOTO_CHANGES)).toEqual({ failed: 0 });
    expect(mockUploaded).toEqual([]);
  });

  it('sends the chosen photos to the person’s own folder, after the ones already there', async () => {
    const res = await saveEntryPhotos('n1', [A, B], {
      added: ['file:///one.jpg', 'file:///two.jpg'],
      removed: [],
    });
    expect(res).toEqual({ failed: 0 });
    expect(mockUploaded).toHaveLength(2);
    expect(mockUploaded.every((u) => /^u1\/n1\/\d+-[a-z0-9]+\.jpg$/.test(u.path))).toBe(true);
    expect(mockUploaded[0].type).toBe('image/jpeg');
    expect(mockInserted.map((r) => [r.note_id, r.owner_id, r.position])).toEqual([
      ['n1', 'u1', 2],
      ['n1', 'u1', 3],
    ]);
    // saved with where the file is, as every other photo is
    expect(mockInserted[0].url).toBe(address(mockUploaded[0].path));
  });

  it('deletes a photo that was taken off: its row, then its file', async () => {
    await saveEntryPhotos('n1', [A, B], { added: [], removed: ['a'] });
    expect(mockDeletedRows).toEqual(['a']);
    expect(mockRemovedFiles).toEqual(['u1/n1/a.jpg']);
  });

  it('numbers new photos after the ones that stay', async () => {
    await saveEntryPhotos('n1', [A, B], { added: ['file:///one.jpg'], removed: ['b'] });
    expect(mockInserted[0].position).toBe(1);
  });

  it('carries on past a photo that will not send, and says how many did not', async () => {
    (global as unknown as { fetch: jest.Mock }).fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('file gone'))
      .mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
    const res = await saveEntryPhotos('n1', [], {
      added: ['file:///gone.jpg', 'file:///two.jpg'],
      removed: [],
    });
    expect(res).toEqual({ failed: 1 });
    expect(mockUploaded).toHaveLength(1);
    expect(mockInserted[0].position).toBe(0);
  });

  it('takes the file back out when its row could not be written', async () => {
    mockInsertError = new Error('refused');
    const res = await saveEntryPhotos('n1', [], { added: ['file:///one.jpg'], removed: [] });
    expect(res).toEqual({ failed: 1 });
    expect(mockRemovedFiles).toEqual([mockUploaded[0].path]);
  });

  it('adds none while nobody is signed in', async () => {
    mockUser = null;
    const res = await saveEntryPhotos('n1', [], { added: ['file:///one.jpg'], removed: [] });
    expect(res).toEqual({ failed: 1 });
    expect(mockUploaded).toEqual([]);
  });

  it('reads the entry’s photos again afterwards, for whoever is showing them', async () => {
    mockRows = [{ id: 'z', url: address('u1/n1/z.jpg'), position: 0 }];
    await saveEntryPhotos('n1', [], { added: ['file:///one.jpg'], removed: [] });
    expect(useEntryPhotosStore.getState().byEntry.n1).toHaveLength(1);
  });
});

describe('deleting files', () => {
  it('deletes the files of saved photos, and leaves photos on the phone alone', async () => {
    await removePhotoFiles([A, { url: 'file:///one.jpg' }]);
    expect(mockRemovedFiles).toEqual(['u1/n1/a.jpg']);
  });
});

describe('telling the person', () => {
  it('says how many photos could not be added, and that the entry is safe', () => {
    expect(photosFailedMessage(1)).toBe(
      'One photo could not be added. Your entry is saved. Open it to add the photo again.',
    );
    expect(photosFailedMessage(3)).toMatch(/^3 photos could not be added\./);
  });
});
