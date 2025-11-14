import { linkSelectedPerson } from '../../components/overlay/overlayV2.mapping';

test('linkSelectedPerson calls repo.linkPersonToEntity', async () => {
  const link = jest.fn().mockResolvedValue(true);
  const repo = { linkPersonToEntity: link } as any;
  await linkSelectedPerson(repo, 'e1', 'p1');
  expect(link).toHaveBeenCalledWith({ entityId: 'e1', personId: 'p1' });
});

test('linkSelectedPerson gracefully no-op if missing', async () => {
  const repo = {} as any;
  await expect(linkSelectedPerson(repo, undefined as any, 'p1')).resolves.toBeUndefined();
  await expect(linkSelectedPerson(repo, 'e1', undefined as any)).resolves.toBeUndefined();
});
