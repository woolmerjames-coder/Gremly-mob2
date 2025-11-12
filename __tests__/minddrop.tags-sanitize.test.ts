import { sanitizeSuggestedTags } from '../components/overlay/overlayV2.mapping';

describe('MindDrop tag sanitation', () => {
  it('extracts @person and #topic, ignores verbs', () => {
    const input = 'Dave loves 4 cheese pizza';
    const modelTags = ['Dave', 'cheese', 'loves', 'pizza'];
    const out = sanitizeSuggestedTags(input, modelTags);
    expect(out).toContain('@Dave');
    expect(out).toContain('#pizza');
    expect(out).not.toContain('#loves');
  });
});
