import { toCreateOrUpdateInput } from '../components/overlay/overlayV2.mapping';
import { initialV2State } from '../components/overlay/overlayV2.state';

describe('Overlay todo name guard', () => {
  it('coerces name from title/details when missing', () => {
    const state = { ...initialV2State } as any;
    state.baseType = 'todo';
    state.todo = { ...state.todo, title: '', details: 'Find running route near me for the week' };
    const payload = toCreateOrUpdateInput('todo', state, null as any);
    expect(payload.name).toMatch(/Find running route near me for the week/);
  });
});
