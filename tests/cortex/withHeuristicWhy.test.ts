import { withHeuristicWhy } from '../../lib/cortex/policy/withHeuristicWhy';

describe('withHeuristicWhy', () => {
  it('appends list heuristic marker', () => {
    expect(withHeuristicWhy('Chosen via chip', 'list-heuristic')).toBe(
      'Chosen via chip (heuristic:list)',
    );
  });

  it('appends idea heuristic marker', () => {
    expect(withHeuristicWhy('Chosen via chip', 'idea-heuristic')).toBe(
      'Chosen via chip (heuristic:idea)',
    );
  });

  it('returns base string when marker already present', () => {
    expect(withHeuristicWhy('Chosen via chip (heuristic:list)', 'list-heuristic')).toBe(
      'Chosen via chip (heuristic:list)',
    );
  });

  it('ignores unknown reasons', () => {
    expect(withHeuristicWhy('Chosen via chip', 'other')).toBe('Chosen via chip');
  });

  it('returns marker when base is empty', () => {
    expect(withHeuristicWhy('', 'list-heuristic')).toBe('heuristic:list');
  });
});
