/**
 * Chat create overlay mapping
 * The persistent action bar was removed; verify the openUnifiedFromChat() helper still
 * opens the overlay with the correct spaceId and type for mini action flows.
 */
import { openUnifiedFromChat } from '../app/spaces/chat/openUnifiedFromChat';

describe('openUnifiedFromChat mapping', () => {
  it('calls overlayController.openCreate with type and spaceId', () => {
    const mockController: any = {
      openCreate: jest.fn(),
    };

    openUnifiedFromChat(
      'todo',
      { title: 'Call Rosetta' },
      { lane: 'space_chat', spaceId: 'space-xyz', messageId: null, whyString: null },
      mockController,
    );

    expect(mockController.openCreate).toHaveBeenCalledTimes(1);
    expect(mockController.openCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'todo', spaceId: 'space-xyz' }),
    );
  });
});
