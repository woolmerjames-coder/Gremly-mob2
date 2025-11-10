process.env.EXPO_PUBLIC_CANONICAL_TYPES = 'on';
process.env.EXPO_PUBLIC_FEATURE_BUDDY = 'true';
process.env.EXPO_PUBLIC_DISABLE_AI = 'off';

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { UnifiedCreateOverlay } from '../../components/overlay/UnifiedCreateOverlay';
import type { Tag } from '../../lib/repo/types';

const CLASSIFICATION_TAGS = ['@Mom', '*list', '#family'];
const classificationResponse = {
  ok: true,
  classification: {
    tags: CLASSIFICATION_TAGS,
    category: 'note',
    confidence: 0.92,
    spaceName: null,
  },
};

const createRepoMock = () => {
  const now = new Date().toISOString();
  return {
    create: jest.fn(async () => ({ id: 'created-record' })),
    update: jest.fn(async ({ id }: { id: string }) => ({ id })),
    getById: jest.fn(async () => null),
    listSpaces: jest.fn(async () => []),
    createSpace: jest.fn(async (input: { name: string }) => ({ id: 'space-1', name: input.name })),
    listPeople: jest.fn(async () => []),
    createPerson: jest.fn(async () => ({ id: 'person-1' })),
    updatePerson: jest.fn(async () => ({ id: 'person-1' })),
    remove: jest.fn(async () => undefined),
    listTags: jest.fn(async () => []),
    listItemTags: jest.fn(async () => []),
    listLinkedPeopleByItem: jest.fn(async () => []),
    upsertTag: jest.fn(async (name: string) => ({
      id: `tag-${name}`,
      owner_id: 'user-1',
      name,
      created_at: now,
      updated_at: now,
    })),
    linkTag: jest.fn(async () => undefined),
    unlinkTag: jest.fn(async () => undefined),
    linkPerson: jest.fn(async () => ({
      id: 'link-1',
      owner_id: 'user-1',
      person_id: 'person-1',
      entity_id: 'entity-1',
      entity_type: 'note',
      created_at: now,
      updated_at: now,
    })),
    unlinkPerson: jest.fn(async () => undefined),
    clearPendingTags: jest.fn(),
  } as const;
};

const createCortexMock = () => ({
  classify: jest.fn(async () => classificationResponse),
});

let mockRepo: any = createRepoMock();
let mockCortex: any = createCortexMock();

const mockCallClassify = jest.fn(async () => classificationResponse);
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
  useCortex: () => mockCortex,
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

const mockPendingTagIds: string[] = [];
const mockPendingPeople: Array<{ id?: string; personName: string; personEmail?: string }> = [];
const mockPhase8Controller = {
  currentTags: [] as Tag[],
  __latestOnChange: undefined as undefined | ((tags: Tag[]) => void),
  setCurrentTags: (tags: Tag[]) => {
    mockPhase8Controller.currentTags = tags;
  },
  setTagChangeHandler: (handler: ((tags: Tag[]) => void) | undefined) => {
    mockPhase8Controller.__latestOnChange = handler;
  },
  getTagChangeHandler: () => mockPhase8Controller.__latestOnChange,
};

jest.mock('../../components/overlay/hooks/usePhase8LinksState', () => {
  const React = require('react');
  const loadTags = jest.fn(async () => undefined);
  const loadPeople = jest.fn(async () => undefined);
  const clearPendingTags = jest.fn(() => {
    mockPendingTagIds.length = 0;
  });
  const clearPendingPeople = jest.fn(() => {
    mockPendingPeople.length = 0;
  });

  const usePhase8LinksState = () => {
    const [currentTags, setCurrentTags] = React.useState(mockPhase8Controller.currentTags);

    React.useEffect(() => {
      mockPhase8Controller.setCurrentTags = (tags: Tag[]) => {
        mockPhase8Controller.currentTags = tags;
        setCurrentTags(tags);
      };
    }, []);

    return React.useMemo(
      () => ({
        allTags: [],
        currentTags,
        loadTags,
        addTag: jest.fn(async (name: string) => ({
          id: `tag-${name}`,
          owner_id: 'user-1',
          name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        linkTag: jest.fn(async () => undefined),
        unlinkTag: jest.fn(async () => undefined),
        linkedPeople: [],
        loadPeople,
        linkPerson: jest.fn(async () => ({
          id: 'link-1',
          owner_id: 'user-1',
          person_id: 'person-1',
          entity_id: 'entity-1',
          entity_type: 'note',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        unlinkPerson: jest.fn(async () => undefined),
        clearPendingTags,
        clearPendingPeople,
        pendingTagIds: mockPendingTagIds,
        pendingPeople: mockPendingPeople,
        isLoading: false,
      }),
      [currentTags],
    );
  };

  return {
    __esModule: true,
    usePhase8LinksState,
    __controller: mockPhase8Controller,
  };
});

jest.mock('../../components/overlay/fields/PeopleLinker', () => ({
  __esModule: true,
  PeopleLinker: () => null,
}));

jest.mock('../../components/overlay/fields/TagEditor', () => {
  const React = require('react');
  const { View } = require('react-native');
  const {
    __controller: controller,
  } = require('../../components/overlay/hooks/usePhase8LinksState');

  const TagEditor = ({ onTagsChange }: { onTagsChange: (tags: Tag[]) => void }) => {
    React.useEffect(() => {
      controller?.setTagChangeHandler?.(onTagsChange);
      return () => controller?.setTagChangeHandler?.(undefined);
    }, [onTagsChange]);
    return <View testID="tag-editor" />;
  };

  TagEditor.__pushTags = (names: string[]) => {
    const now = new Date().toISOString();
    const tags = names.map((name, index) => ({
      id: `tag-${index}`,
      owner_id: 'user-1',
      name,
      created_at: now,
      updated_at: now,
    }));
    const handler = controller?.getTagChangeHandler?.() as ((tags: Tag[]) => void) | undefined;
    if (handler) {
      handler(tags);
    }

    if (controller && typeof controller.setCurrentTags === 'function') {
      controller.setCurrentTags(tags);
    }
  };

  return {
    __esModule: true,
    TagEditor,
  };
});

jest.mock('../../lib/cortex/CortexClient', () => ({
  __esModule: true,
  callClassify: mockCallClassify,
  callComplete: mockCallComplete,
}));

const { TagEditor } = require('../../components/overlay/fields/TagEditor');

const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

describe('UnifiedCreateOverlay tags UI', () => {
  beforeEach(() => {
    mockRepo = createRepoMock();
    mockCortex = createCortexMock();
    mockCallClassify.mockClear();
    mockCallComplete.mockClear();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  const renderOverlay = (props?: Partial<React.ComponentProps<typeof UnifiedCreateOverlay>>) => {
    return render(<UnifiedCreateOverlay visible mode="create" onClose={jest.fn()} {...props} />);
  };

  const pressNoteType = (
    getByTestIdFn: (testID: string) => any,
    queryByTestIdFn: (testID: string) => any,
  ) => {
    const notePill =
      queryByTestIdFn('type-pill-log') ??
      queryByTestIdFn('type-pill-everything_else') ??
      queryByTestIdFn('type-pill-note');

    if (!notePill) {
      throw new Error('Note type pill not found');
    }

    fireEvent.press(notePill);

    const ideaSubtype = queryByTestIdFn('log-subtype-idea');
    if (ideaSubtype) {
      fireEvent.press(ideaSubtype);
    }
  };

  it('renders TagsField with existing tags when editing a note', async () => {
    const note = {
      id: 'note-1',
      type: 'note',
      subtype: 'idea',
      title: 'Call mom',
      body: 'Remember to call mom about schedule',
      tags: ['@Mom', '#Family'],
      fmt: null,
      space_id: null,
    };

    mockRepo.getById.mockResolvedValue(note as any);

    const { findByText } = renderOverlay({
      mode: 'edit',
      initialEntity: { id: 'note-1', type: 'note' },
    });

    expect(await findByText('@Mom')).toBeTruthy();
    expect(await findByText('#family')).toBeTruthy();
  });

  it('normalizes bare words and enforces single star tag in TagsField', async () => {
    const { getByTestId, queryByTestId, getByText, queryByText } = renderOverlay();

    pressNoteType(getByTestId, queryByTestId);

    const noteBody = getByTestId('note-body');
    fireEvent.changeText(noteBody, 'Draft agenda');

    const tagsInput = getByTestId('overlay-tags-field-input');

    fireEvent.changeText(tagsInput, 'work life');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: 'work life' } });
    await waitFor(() => {
      expect(getByText('#work_life')).toBeTruthy();
    });

    fireEvent.changeText(tagsInput, '*list');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '*list' } });
    await waitFor(() => {
      expect(getByText('*list')).toBeTruthy();
    });

    fireEvent.changeText(tagsInput, '*meeting');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '*meeting' } });
    await waitFor(() => {
      expect(getByText('*meeting')).toBeTruthy();
    });
    expect(queryByText('*list')).toBeNull();
  });

  it('keeps removed @Mom out of payload when classification re-suggests it', async () => {
    const onClose = jest.fn();
    const { getByTestId, queryByTestId, getByText, queryByText } = render(
      <UnifiedCreateOverlay visible mode="create" onClose={onClose} />,
    );

    pressNoteType(getByTestId, queryByTestId);

    await waitFor(() => {
      expect(getByTestId('tag-editor')).toBeTruthy();
    });

    const noteBody = getByTestId('note-body');
    fireEvent.changeText(noteBody, 'Grocery list for the weekend');

    const tagsInput = getByTestId('overlay-tags-field-input');

    const addTag = (value: string) => {
      fireEvent.changeText(tagsInput, value);
      fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: value } });
    };

    addTag('work life');
    await waitFor(() => {
      expect(getByText('#work_life')).toBeTruthy();
    });

    addTag('*list');
    addTag('*meeting');
    await waitFor(() => {
      expect(getByText('*meeting')).toBeTruthy();
    });

    addTag('@Mom');
    await waitFor(() => {
      expect(getByText('@Mom')).toBeTruthy();
    });

    const removeMomButton = getByTestId('overlay-tags-field-remove-Mom');
    fireEvent.press(removeMomButton);
    await waitFor(() => {
      expect(queryByText('@Mom')).toBeNull();
    });

    await act(async () => {
      TagEditor.__pushTags(CLASSIFICATION_TAGS);
    });

    expect(queryByText('@Mom')).toBeNull();

    fireEvent.press(getByTestId('save-to-hub'));

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    const createPayload = mockRepo.create.mock.calls[0]?.[0];
    expect(createPayload).toBeDefined();
    if (!createPayload) {
      throw new Error('Expected create payload');
    }
    expect(createPayload.tags).toContain('#work_life');
    expect(createPayload.tags).toContain('*meeting');
    expect(createPayload.tags).not.toContain('@Mom');
    expect(onClose).toHaveBeenCalled();
  });

  it('includes tags in repo.create payload on save', async () => {
    const { getByTestId, queryByTestId } = renderOverlay();

    pressNoteType(getByTestId, queryByTestId);

    const noteBody = getByTestId('note-body');
    fireEvent.changeText(noteBody, 'Reach out to planning committee');

    const tagsInput = getByTestId('overlay-tags-field-input');
    fireEvent.changeText(tagsInput, '#planning');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '#planning' } });

    fireEvent.press(getByTestId('save-to-hub'));

    await waitFor(() => {
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    const createPayload = mockRepo.create.mock.calls[0]?.[0];
    expect(createPayload).toBeDefined();
    if (!createPayload) {
      throw new Error('Expected create payload');
    }
    expect(createPayload.tags).toEqual(['#planning']);
  });

  it('includes tags in repo.update payload for edit save', async () => {
    const note = {
      id: 'note-2',
      type: 'note',
      subtype: 'idea',
      title: 'Existing note',
      body: 'Keep existing body',
      tags: ['#family'],
      fmt: null,
      space_id: null,
    };

    mockRepo.getById.mockResolvedValue(note as any);
    mockRepo.update.mockResolvedValue({ id: 'note-2' });

    const { getByTestId } = renderOverlay({
      mode: 'edit',
      initialEntity: { id: 'note-2', type: 'note' },
    });

    await waitFor(() => {
      expect(mockRepo.getById).toHaveBeenCalledTimes(1);
    });

    const tagsInput = getByTestId('overlay-tags-field-input');
    fireEvent.changeText(tagsInput, '#focus');
    fireEvent(tagsInput, 'onSubmitEditing', { nativeEvent: { text: '#focus' } });

    fireEvent.press(getByTestId('save-to-hub'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledTimes(1);
    });

    const updatePayload = mockRepo.update.mock.calls[0]?.[0] as any;
    expect(updatePayload).toBeDefined();
    expect(updatePayload.patch.tags).toEqual(['#family', '#focus']);
  });
});
