/**
 * Tests for tag quality in buildCanonicalFromMindDrop
 * Ensures AI tags are preferred, low-value tags are filtered, and person tags work correctly
 */

import { buildCanonicalFromMindDrop } from '../buildCanonicalFromMindDrop';

// Mock the AI extraction to control test behavior
jest.mock('../../cortex/CortexClient');
jest.mock('../../tags/extractTagsAI');

describe('buildCanonicalFromMindDrop - Tag Quality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Person Tag Normalization', () => {
    it('should extract #sarah from "Sarah\'s coffee order" for logs (LS2)', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['#sarah', '#coffee']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "Sarah's coffee order: oat latte, extra hot, with cinnamon",
        aiTags: [], // Force AI extraction
      });

      expect(result.tags).toContain('#sarah');
      expect(result.tags).not.toContain('#sarahs');
      expect(result.canonicalType).toBe('log');
      // LS2: General reference content -> catchall
      expect(result.subtype).toBe('catchall');
    });

    it('should extract #sarah from "I can\'t stop thinking about what Sarah said" (LS2)', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['#sarah', '#stressed']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "I can't stop thinking about what Sarah said earlier. Really stressed about it.",
        aiTags: [],
      });

      expect(result.tags).toContain('#sarah');
      expect(result.tags).toContain('#stressed');
      expect(result.tags).not.toContain('#sarahs');
      // LS2: Should get journal subtype (emotional language + "can't stop thinking")
      expect(result.subtype).toBe('journal');
    });
  });

  describe('Low-Value Tag Filtering', () => {
    it('should filter out generic time words like "today"', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['anxious', 'work', 'today', 'great']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "Today was great but I'm feeling anxious about work",
        aiTags: [],
      });

      expect(result.tags).toContain('#anxious');
      expect(result.tags).toContain('#work');
      expect(result.tags).not.toContain('#today');
      expect(result.tags).not.toContain('#great');
    });

    it('should filter out "find" and other action verbs (LS2)', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['#restaurant', '#dinner', '#find', '#sleep']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Find a great place for dinner tonight',
        aiTags: [],
      });

      expect(result.tags).toContain('#restaurant');
      // Note: dinner might be filtered or not extracted depending on quality filter
      // The important thing is action verbs are filtered
      expect(result.tags).not.toContain('#find');
      expect(result.tags).not.toContain('#great');
      // LS2: General command -> catchall
      expect(result.subtype).toBe('catchall');
    });

    it('should keep meaningful emotion tags like #anxiety, #stress', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['anxiety', 'relationship', 'work']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Having anxiety about work and relationship stuff',
        aiTags: [],
      });

      expect(result.tags).toContain('#anxiety');
      expect(result.tags).toContain('#relationship');
      expect(result.tags).toContain('#work');
    });
  });

  describe('AI Tag Priority', () => {
    it('should prefer AI tags over heuristic tags when AI returns results', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['dentist', 'health', 'appointment']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'todo',
        rawText: 'Book dentist appointment for Friday at 3pm',
        aiTags: [],
      });

      // AI tags should be used
      expect(result.tags).toContain('#dentist');
      expect(result.tags).toContain('#health');
      // Book should be filtered out (appointment booking heuristic)
      expect(result.tags).not.toContain('#book');
    });

    it('should fall back to heuristic tags when AI returns empty', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue([]); // AI returns nothing

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Meeting at the office tomorrow',
        aiTags: [],
      });

      // Should have some tags from fallback
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.canonicalType).toBe('log');
    });

    it('should use provided aiTags parameter when available', async () => {
      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Some text here',
        aiTags: ['work', 'project', 'deadline'],
      });

      // Should use the provided tags
      expect(result.tags).toContain('#work');
      expect(result.tags).toContain('#project');
      expect(result.tags).toContain('#deadline');
    });
  });

  describe('Log Subtype + Theme Tags Integration', () => {
    it('should combine subtype theme tag (#journal) with topic tags', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['@sarah', 'stressed', 'work']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "I'm feeling really stressed about what Sarah said at work today",
        aiTags: [],
      });

      // Should have journal theme tag from subtype
      expect(result.subtype).toBe('journal');
      expect(result.tags).toContain('#journal');

      // LS2: Should also have topic/person tags
      expect(result.tags).toContain('#sarah');
      expect(result.tags).toContain('#stressed');
      expect(result.tags).toContain('#work');
    });

    it('should add #idea theme tag for idea subtype', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['meetings', 'productivity']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: 'Idea: What if we held team meetings standing up to keep them short?',
        aiTags: [],
      });

      expect(result.subtype).toBe('idea');
      expect(result.tags).toContain('#idea');
      expect(result.tags).toContain('#meetings');
    });

    it('should add #catchall theme tag for general/reference content (LS2)', async () => {
      const { extractTagsAI } = require('../../tags/extractTagsAI');
      extractTagsAI.mockResolvedValue(['#sarah', '#coffee']);

      const result = await buildCanonicalFromMindDrop({
        kind: 'log',
        rawText: "Sarah's coffee order: oat latte, extra hot, with cinnamon",
        aiTags: [],
      });

      // LS2: Reference-like content is now classified as 'catchall' by LS1
      expect(result.subtype).toBe('catchall');
      expect(result.tags).toContain('#catchall');
      expect(result.tags).toContain('#sarah');
      expect(result.tags).toContain('#coffee');
    });
  });
});
