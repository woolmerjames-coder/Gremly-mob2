import { MemoryRepo } from '../lib/repo/memory';

const makeTodoInput = (name: string) => ({
  type: 'todo' as const,
  name,
  ai_placed: false,
});

describe('MemoryRepo commitments guardrails', () => {
  let repo: MemoryRepo;
  let todoIds: string[];

  beforeEach(async () => {
    repo = new MemoryRepo('commitments-user');
    todoIds = [];

    for (let i = 1; i <= 4; i += 1) {
      const record = await repo.create(makeTodoInput(`Commitment candidate ${i}`));
      todoIds.push(record.id);
    }
  });

  test('enforces max three active commitments and allows reuse after removal', async () => {
    await repo.addCommitment(todoIds[0], 'todo');
    await repo.addCommitment(todoIds[1], 'todo');
    await repo.addCommitment(todoIds[2], 'todo');

    await expect(repo.addCommitment(todoIds[3], 'todo')).rejects.toThrow('MAX_COMMITMENTS_REACHED');

    await repo.removeCommitment(todoIds[1], 'todo');

    await expect(repo.addCommitment(todoIds[3], 'todo')).resolves.toBeUndefined();

    const commitments = await repo.listCommitments();
    const commitmentIds = commitments.map((c) => c.id);

    expect(commitmentIds).toEqual(expect.arrayContaining([todoIds[0], todoIds[2], todoIds[3]]));
    expect(commitments).toHaveLength(3);
  });
});
