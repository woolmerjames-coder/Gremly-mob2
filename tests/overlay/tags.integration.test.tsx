process.env.EXPO_PUBLIC_CANONICAL_TYPES = 'on';
process.env.EXPO_PUBLIC_FEATURE_BUDDY = 'false';
process.env.EXPO_PUBLIC_DISABLE_AI = 'off';

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import * as envModule from '../../lib/env';

const classificationResponse = {
  ok: true,
  classification: {
    tags: ['@Mom'],
    category: 'note',
    confidence: 0.98,
    spaceName: null,
  },
};

const createRepoMock = () => {
  const now = new Date().toISOString();

  return {
    create: jest.fn(),
    update: jest.fn(),
    listSpaces: jest.fn(async () => []),
    createSpace: jest.fn(async ({ name }: { name: string }) => ({ id: `space-${name}`, name })),
    createPerson: jest.fn(),
    updatePerson: jest.fn(),
    remove: jest.fn(),
    createPersonFromLog: jest.fn(),
    getById: jest.fn(),
    listTags: jest.fn(async () => []),
    listItemTags: jest.fn(async () => []),
    listLinkedPeopleByItem: jest.fn(async () => []),
    listPeople: jest.fn(async () => []),
    linkPerson: jest.fn(async () => undefined),
    unlinkPerson: jest.fn(async () => undefined),
    clearPendingTags: jest.fn(),
    clearPendingPeople: jest.fn(),
    linkTag: jest.fn(async () => undefined),
    unlinkTag: jest.fn(async () => undefined),
    getSpaceDefaults: jest.fn(async () => null),
    getCortexPrefs: jest.fn(async () => null),
    upsertTag: jest.fn(async (name: string) => ({
      id: `tag-${name}`,
      owner_id: 'user-1',
      name,
      created_at: now,
      updated_at: now,
    })),
  } as const;
};

let mockRepo = createRepoMock();

const mockCallClassify = jest.fn();
const mockCallComplete = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => mockRepo,
}));

jest.mock('../../providers/CortexProvider', () => ({
  __esModule: true,
  useCortex: () => ({
    classify: jest.fn(),
    cortexDecide: jest.fn(),
    decideWithContext: jest.fn(),
    resolveDecisionContext: jest.fn(),
  }),
}));

jest.mock('../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ userId: 'user-1' }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  __esModule: true,
  useTheme: () => ({
    theme: {
      mode: 'light',
      colors: {
        text: { primary: '#111827', secondary: '#6B7280', tertiary: '#9CA3AF' },
        border: { DEFAULT: '#E5E7EB', focus: '#10B981' },
        deepTeal: { DEFAULT: '#047857' },
        mint: '#A7F3D0',
        white: '#FFFFFF',
        error: '#DC2626',
      },
    },
  }),
}));

jest.mock('../../components/ui/Chip', () => {
  const _React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  const Chip = ({ label, onPress, disabled, testID }: any) => (
    <TouchableOpacity onPress={disabled ? undefined : onPress} disabled={disabled} testID={testID}>
      <Text>{label}</Text>
    </TouchableOpacity>
  );
  return { __esModule: true, default: Chip };
});

jest.mock('../../components/ui/Icon', () => {
  const _React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    Icon: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('../../design-system/Button', () => {
  const _React = require('react');
  const { TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    Button: ({ label, onPress, testID, disabled }: any) => (
      <TouchableOpacity
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        testID={testID}
      >
        <Text>{label}</Text>
      </TouchableOpacity>
    ),
  };
});

jest.mock('../../components/overlay/fields/TodoFields', () => ({
  __esModule: true,
  TodoFields: () => null,
}));

jest.mock('../../components/overlay/fields/HabitFields', () => ({
  __esModule: true,
  HabitFields: () => null,
  default: () => null,
}));

jest.mock('../../components/overlay/fields/JournalFields', () => ({
  __esModule: true,
  JournalFields: () => null,
}));

jest.mock('../../components/overlay/fields/PersonFields', () => ({
  __esModule: true,
  PersonFields: () => null,
}));

jest.mock('../../components/overlay/fields/NoteFields', () => {
  const _React = require('react');
  const { TextInput, View } = require('react-native');
  return {
    __esModule: true,
    NoteFields: ({ body, onBodyChange }: any) => (
      <View>
        <TextInput testID="note-body" value={body} onChangeText={onBodyChange} placeholder="Body" />
      </View>
    ),
  };
});

jest.mock('../../components/overlay/hooks/usePhase8LinksState', () => {
  const React = require('react');
  const createState = () => ({
    allTags: [],
    currentTags: [],
    loadTags: jest.fn(),
    addTag: jest.fn(),
    linkTag: jest.fn(),
    unlinkTag: jest.fn(),
    linkedPeople: [],
    loadPeople: jest.fn(),
    linkPerson: jest.fn(),
    unlinkPerson: jest.fn(),
    clearPendingTags: jest.fn(),
    clearPendingPeople: jest.fn(),
    pendingTagIds: [],
    pendingPeople: [],
    isLoading: false,
  });

  const usePhase8LinksState = () => {
    const [state] = React.useState(createState);
    return state;
  };

  return {
    __esModule: true,
    usePhase8LinksState,
  };
});

jest.mock('../../components/overlay/fields/PeopleLinker', () => ({
  __esModule: true,
  PeopleLinker: () => null,
}));

jest.mock('../../lib/cortex/CortexClient', () => ({
  __esModule: true,
  callClassify: (...args: unknown[]) => mockCallClassify(...args),
  callComplete: (...args: unknown[]) => mockCallComplete(...args),
}));

let getOptimisticFlagSpy: jest.SpyInstance<boolean, []>;
let getMinThinkMsSpy: jest.SpyInstance<number, []>;
let getBgTimeoutMsSpy: jest.SpyInstance<number, []>;

const pressNoteType = (
  getByTestId: (testID: string) => any,
  queryByTestId: (testID: string) => any,
) => {
  const notePill =
    queryByTestId('type-pill-log') ??
    queryByTestId('type-pill-everything_else') ??
    queryByTestId('type-pill-note');

  if (!notePill) {
    throw new Error('Note type pill not found');
  }

  fireEvent.press(notePill);

  const ideaSubtype = queryByTestId('log-subtype-idea');
  if (ideaSubtype) {
    fireEvent.press(ideaSubtype);
  }
};

describe('UnifiedCreateOverlay tags integration', () => {
  beforeEach(() => {
    mockRepo = createRepoMock();
    mockCallClassify.mockReset();
    mockCallComplete.mockReset();
    getOptimisticFlagSpy = jest.spyOn(envModule, 'getOptimisticFlag').mockReturnValue(true);
    getMinThinkMsSpy = jest.spyOn(envModule, 'getMinThinkMs').mockReturnValue(0);
    getBgTimeoutMsSpy = jest.spyOn(envModule, 'getBgTimeoutMs').mockReturnValue(50);
  });

  afterEach(() => {
    getOptimisticFlagSpy.mockRestore();
    getMinThinkMsSpy.mockRestore();
    getBgTimeoutMsSpy.mockRestore();
  });

  it('handles manual tags, filters removed tags from AI classification, and saves classified note', async () => {
    const createInputs: any[] = [];

    mockRepo.listSpaces.mockResolvedValue([]);
    mockRepo.update.mockImplementation(async ({ id, patch }: any) => ({ id, patch }));
    mockRepo.create.mockImplementation(async (input: any) => {
      createInputs.push(input);
      return { id: createInputs.length === 1 ? 'catchall-note' : `note-${createInputs.length}` };
    });

    mockCallClassify.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(classificationResponse), 10);
        }),
    );

    const { getByTestId, queryByTestId, queryByText, findByText, findByTestId, unmount } = render(
      <UnifiedCreateOverlay visible mode="create" onClose={jest.fn()} />,
    );

    pressNoteType(getByTestId, queryByTestId);

    const tagsInput = await findByTestId('overlay-tags-field-input');

    await act(async () => {
      fireEvent.changeText(tagsInput, 'work life');
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: 'work life' } });
    });

    expect(await findByText('#work_life')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(tagsInput, '*list');
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '*list' } });
    });

    expect(await findByText('*list')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(tagsInput, '*journal');
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '*journal' } });
    });

    await waitFor(() => {
      expect(queryByTestId('overlay-tags-field-remove-list')).toBeNull();
    });
    expect(await findByText('*journal')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(tagsInput, '@Mom');
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '@Mom' } });
    });

    // @person tags are lowercased per CP-TAG-3
    expect(await findByText('@mom')).toBeTruthy();

    const removeMomButton = await findByTestId('overlay-tags-field-remove-mom');

    await act(async () => {
      fireEvent.press(removeMomButton);
    });

    await waitFor(() => {
      expect(queryByTestId('overlay-tags-field-remove-mom')).toBeNull();
    });
    expect(queryByText('@mom')).toBeNull();

    await act(async () => {
      fireEvent.changeText(tagsInput, 'another');
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: 'another' } });
    });

    expect(await findByText('#another')).toBeTruthy();

    const aiToggle = getByTestId('ai-mode-button');

    await act(async () => {
      fireEvent.press(aiToggle);
    });

    const freeformInput = getByTestId('freeform-input');
    await act(async () => {
      fireEvent.changeText(freeformInput, 'Call mom about groceries tonight.');
    });

    const saveButton = await findByTestId('save-to-hub');

    await act(async () => {
      fireEvent.press(saveButton);
    });

    await waitFor(() => {
      expect(mockCallClassify).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(2);
    });

    const classifiedInput = createInputs.find((input) => input.ai_placed === true);
    expect(classifiedInput).toBeDefined();

    const classifiedTags = classifiedInput?.tags ?? [];
    expect(classifiedTags).toEqual(expect.arrayContaining(['#work_life', '*journal', '#another']));
    expect(classifiedTags.some((tag: string) => tag.toLowerCase() === '@mom')).toBe(false);

    unmount();
  });
});
