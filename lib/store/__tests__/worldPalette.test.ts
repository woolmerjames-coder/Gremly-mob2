/**
 * A World's dot in the pickers is its tint in the Worlds look, the colour it
 * wears on the Worlds screens, and never comes from the old archetypes
 * (Worlds rebuild, stage 4e).
 */
import { selectWorldPalette } from '../worldsSelectors';
import { TINT } from '../../worlds/look';
import { worldTint } from '../../worlds/model';
import { lightTokens } from '../../../design/tokens';

jest.mock('../useGremlyStore', () => ({
  useGremlyStore: Object.assign(jest.fn(), { getState: jest.fn() }),
}));

describe('selectWorldPalette', () => {
  it('uses the World tint it chose, whatever its old archetypes say', () => {
    const world = {
      id: 'w-1',
      visual_style: { color: 'peri' },
      archetypes: [{ type: 'creative', weight: 1 }],
    };
    const p = selectWorldPalette({ worlds: [world] } as any, 'w-1');
    expect(p.dot).toBe(TINT.peri.ink);
    expect(p.tint).toBe(TINT.peri.wash);
  });

  it('a World with no tint chosen keeps the one its id gives it', () => {
    const world = { id: 'w-2', visual_style: null };
    const p = selectWorldPalette({ worlds: [world] } as any, 'w-2');
    expect(p.dot).toBe(TINT[worldTint(world as any)].ink);
  });

  it('a World it cannot find gets the plain colours', () => {
    expect(selectWorldPalette({ worlds: [] } as any, 'gone')).toBe(
      lightTokens.colors.worldPalette.generic,
    );
  });
});
