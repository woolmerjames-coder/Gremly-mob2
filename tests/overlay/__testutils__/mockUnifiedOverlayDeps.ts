/*
 * Lightweight mocks for heavy UnifiedOverlayV2 dependencies to keep
 * component integration tests fast and memory friendly.
 */

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'test-user' }),
}));

jest.mock('../../../components/overlay/hooks/usePhase8LinksState', () => ({
  usePhase8LinksState: () => ({
    allTags: [],
    currentTags: [],
    pendingTagIds: [],
    pendingPeople: [],
    linkedPeople: [],
    isLoading: false,
    loadTags: jest.fn(async () => {}),
    addTag: jest.fn(async () => ({ id: 'tag', name: 'tag' })),
    linkTag: jest.fn(async () => {}),
    unlinkTag: jest.fn(async () => {}),
    clearPendingTags: jest.fn(),
    loadPeople: jest.fn(async () => {}),
    linkPerson: jest.fn(async () => ({ id: 'person', person_name: 'Test' })),
    unlinkPerson: jest.fn(async () => {}),
    clearPendingPeople: jest.fn(),
  }),
}));

jest.mock('../../../components/overlay/fields/PeopleLinker', () => ({
  PeopleLinker: () => null,
}));

jest.mock('../../../components/overlay/fields/PersonPicker', () => ({
  __esModule: true,
  default: () => null,
}));
