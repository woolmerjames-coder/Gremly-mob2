jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn().mockResolvedValue({
      data: { status: 'ok' },
      error: null,
    }),
  },
}));

import { supabase } from '../../lib/supabase/client';

const mockRpc = supabase.rpc as jest.Mock;

test('complete_item RPC is invoked with expected payload', async () => {
  const payload = {
    _kind: 'todo',
    _id: 'uuid-here',
  } as const;

  mockRpc.mockResolvedValueOnce({ data: { status: 'ok' }, error: null });

  const result = await supabase.rpc('complete_item', payload);

  expect(mockRpc).toHaveBeenCalledWith('complete_item', payload);
  expect(result).toEqual({ data: { status: 'ok' }, error: null });
});
