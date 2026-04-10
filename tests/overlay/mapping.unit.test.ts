import {
  sanitizeSuggestedTags,
} from '../../components/overlay/overlayV2.mapping';

test('sanitizeSuggestedTags infers running and filters hash noise', () => {
  const text = "See if there's a common running route near here";
  const ai = ['*journal', '#common', '#here', '#near'];
  const result = sanitizeSuggestedTags(text, ai);
  expect(result).toEqual(['running']);
});

