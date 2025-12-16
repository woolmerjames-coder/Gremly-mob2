import { enrichListItem, enrichListItems } from '../enrichListItem';
import { callChat } from '../../cortex/CortexClient';

// Mock the Cortex client
jest.mock('../../cortex/CortexClient', () => ({
  callChat: jest.fn(),
}));

const mockCallChat = callChat as jest.MockedFunction<typeof callChat>;

describe('enrichListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enrichListItem', () => {
    it('returns enriched item from successful AI response', async () => {
      mockCallChat.mockResolvedValue({
        ok: true,
        data: {
          content: JSON.stringify({
            title: 'Choose replacement drink',
            notes: 'Pick something you enjoy',
          }),
        },
      } as any);

      const result = await enrichListItem('Pick 1 go-to replacement drink you actually enjoy');

      expect(result.title).toBe('Choose replacement drink');
      expect(result.notes).toBe('Pick something you enjoy');
      expect(mockCallChat).toHaveBeenCalledTimes(1);
    });

    it('returns fallback when AI call fails', async () => {
      mockCallChat.mockResolvedValue({
        ok: false,
        error: 'API error',
      } as any);

      const result = await enrichListItem('Some verbose text here');

      // Fallback should use truncated original text
      expect(result.title).toBeTruthy();
      expect(result.title.length).toBeLessThanOrEqual(60);
    });

    it('returns fallback when AI response is empty', async () => {
      mockCallChat.mockResolvedValue({
        ok: true,
        data: { content: '' },
      } as any);

      const result = await enrichListItem('Some verbose text');

      expect(result.title).toBeTruthy();
    });

    it('returns fallback when JSON parsing fails', async () => {
      mockCallChat.mockResolvedValue({
        ok: true,
        data: { content: 'not valid json' },
      } as any);

      const result = await enrichListItem('Some verbose text');

      expect(result.title).toBeTruthy();
    });

    it('returns enriched item without notes when not provided', async () => {
      mockCallChat.mockResolvedValue({
        ok: true,
        data: {
          content: JSON.stringify({
            title: 'Remove alcohol',
            notes: null,
          }),
        },
      } as any);

      const result = await enrichListItem('Move/remove alcohol you dont want');

      expect(result.title).toBe('Remove alcohol');
      expect(result.notes).toBeUndefined();
    });
  });

  describe('enrichListItems', () => {
    it('enriches multiple items in parallel', async () => {
      mockCallChat
        .mockResolvedValueOnce({
          ok: true,
          data: { content: JSON.stringify({ title: 'First task' }) },
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          data: { content: JSON.stringify({ title: 'Second task' }) },
        } as any);

      const results = await enrichListItems(['First verbose item', 'Second verbose item']);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('First task');
      expect(results[1].title).toBe('Second task');
      expect(mockCallChat).toHaveBeenCalledTimes(2);
    });

    it('returns fallback for failed items without affecting others', async () => {
      mockCallChat
        .mockResolvedValueOnce({
          ok: true,
          data: { content: JSON.stringify({ title: 'Success' }) },
        } as any)
        .mockResolvedValueOnce({
          ok: false,
          error: 'Failed',
        } as any);

      const results = await enrichListItems(['First item', 'Second item']);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Success');
      expect(results[1].title).toBeTruthy(); // Fallback
    });

    it('returns empty array for empty input', async () => {
      const results = await enrichListItems([]);

      expect(results).toEqual([]);
      expect(mockCallChat).not.toHaveBeenCalled();
    });
  });
});
