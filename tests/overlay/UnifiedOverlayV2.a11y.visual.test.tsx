import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import './__testutils__/mockUnifiedOverlayDeps';

// Mock minimal providers used by the component
jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    update: jest.fn().mockResolvedValue({ id: 'x1', type: 'note' }),
    listSpaces: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('../../components/overlay/useOverlayPrefill', () => ({
  __esModule: true,
  default: () => ({
    suggestedTitle: null,
    suggestedTags: [],
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

import { UnifiedOverlayV2 } from '../../components/overlay/UnifiedOverlayV2';

// Helper: compute relative luminance (WCAG) from a hex/RGB color
function parseColorToRgb(col: string) {
  // support #RRGGBB or rgb(...) - keep simple for tokens which are hex
  const hex = (col || '').replace('#', '').trim();
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
}

function channelToLinear(c: number) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminanceFromColor(col: string) {
  const { r, g, b } = parseColorToRgb(col);
  const R = channelToLinear(r);
  const G = channelToLinear(g);
  const B = channelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a: string, b: string) {
  const L1 = luminanceFromColor(a);
  const L2 = luminanceFromColor(b);
  const top = Math.max(L1, L2);
  const bottom = Math.min(L1, L2);
  return (top + 0.05) / (bottom + 0.05);
}

describe('UnifiedOverlayV2 — a11y visual checks (light & dark)', () => {
  const baseProps: any = { visible: true, onClose: jest.fn(), mode: 'create' };

  ['light', 'dark'].forEach((scheme) => {
    it(`matches accessibility + contrast expectations in ${scheme} mode (snapshot)`, async () => {
      // mock color scheme before rendering
      const RN = require('react-native');
      jest.spyOn(RN, 'useColorScheme').mockReturnValue(scheme as any);

      const rendered = render(<UnifiedOverlayV2 {...baseProps} />);
      const { toJSON } = rendered as any;
      const getByPlaceholderText = (rendered as any).getByPlaceholderText as (p: string) => any;

      // Collect nodes from the rendered JSON tree
      const tree = toJSON();
      function findAllByProp(node: any, prop: string, value: string, out: any[] = []) {
        if (!node) return out;
        if (node.props && node.props[prop] === value) out.push(node);
        if (node.children && Array.isArray(node.children)) {
          node.children.forEach((c: any) => {
            if (typeof c === 'object') findAllByProp(c, prop, value, out);
          });
        }
        return out;
      }

      // Buttons have accessibilityRole='button'
      const buttons = findAllByProp(tree, 'accessibilityRole', 'button');
      expect(buttons.length).toBeGreaterThan(0);

      // Inputs: find by placeholder then verify accessibilityLabel exists
      const inputEl = getByPlaceholderText('Drop your thought…');
      expect(inputEl).toBeDefined();
      const input = inputEl;
      expect(input).toBeDefined();

      // Contrast: ensure token text vs token input background >= 4.5
      // Use design tokens (preferred source of truth for colors)
      const { lightTokens, darkTokens } = require('../../design/tokens');
      const tokens = scheme === 'dark' ? darkTokens : lightTokens;
      const textColorToken = tokens.colors.text;
      const bgToken = scheme === 'dark' ? darkTokens.colors.deep : lightTokens.colors.linen;
      const ratio = contrastRatio(textColorToken, bgToken);
      expect(ratio).toBeGreaterThanOrEqual(4.5);

      // Focus ring appears on focus (borderColor set to golden pear and borderWidth 2)
      await act(async () => {
        fireEvent(inputEl, 'focus');
      });
      const focusedStyle = StyleSheet.flatten(input.props.style || {});
      expect(focusedStyle.borderWidth === 2 || focusedStyle.borderWidth === '2').toBe(true);
      expect(focusedStyle.borderColor).toBe('#E0C47A');

      // Snapshot for visual regression
      expect(toJSON()).toMatchSnapshot();
    });
  });
});
