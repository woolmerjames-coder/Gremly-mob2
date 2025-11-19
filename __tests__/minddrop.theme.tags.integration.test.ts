/**
 * Integration tests for theme tag enrichment in BackgroundPrefill
 *
 * These tests verify that theme tags are properly added to todos and habits
 * during the BackgroundPrefill process, while maintaining tag quality filters.
 */

import { applyThemeTags } from '../lib/tags/themes';
import { applyTagQualityFilter } from '../lib/tags/quality';
import { filterAndNormalizeTags } from '../lib/tags/normalize';

describe('Theme Tag Integration', () => {
  describe('Habit theme enrichment', () => {
    it('adds #exercise to running habit', () => {
      // Simulate the flow in BackgroundPrefill for habits
      const rawSentence = 'Start running every morning';
      const aiTags = ['running', 'morning routine'];
      const existingTags = ['#running']; // From initial creation

      // Step 1: Normalize AI tags
      const normalizedAiTags = filterAndNormalizeTags(aiTags);

      // Step 2: Apply quality filter
      const cleanedExisting = applyTagQualityFilter(existingTags);
      const effectiveTags = normalizedAiTags.length > 0 ? normalizedAiTags : cleanedExisting;

      // Step 3: Apply theme tags
      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      // Verify
      expect(finalTags).toContain('#running');
      expect(finalTags).toContain('#exercise');
      expect(finalTags.length).toBeGreaterThanOrEqual(2);
    });

    it('adds #exercise to gym habit', () => {
      const rawSentence = 'Go to the gym 3 times per week';
      const aiTags = ['gym', 'fitness'];
      const existingTags = ['#gym'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const cleanedExisting = applyTagQualityFilter(existingTags);
      const effectiveTags = normalizedAiTags.length > 0 ? normalizedAiTags : cleanedExisting;

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#gym');
      expect(finalTags).toContain('#exercise');
    });

    it('adds #exercise to yoga habit', () => {
      const rawSentence = 'Practice yoga for 30 minutes daily';
      const aiTags = ['yoga', 'wellness'];
      const existingTags = ['#yoga'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#yoga');
      expect(finalTags).toContain('#exercise');
    });
  });

  describe('Todo theme enrichment', () => {
    it('adds #work to presentation todo', () => {
      const rawSentence = 'Finish work presentation for client';
      const aiTags = ['presentation', 'client'];
      const existingTags = ['#presentation'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#work');
      expect(finalTags).toContain('#presentation');
      expect(finalTags).toContain('#client');
    });

    it('adds #work to meeting todo', () => {
      const rawSentence = 'Schedule team meeting for project kickoff';
      const aiTags = ['meeting', 'project'];
      const existingTags = ['#meeting'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#work');
      expect(finalTags).toContain('#meeting');
    });

    it('adds #health to dentist appointment', () => {
      const rawSentence = 'Book dentist appointment for cleaning';
      const aiTags = ['appointment', 'dentist'];
      const existingTags = ['#appointment', '#dentist'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#health');
      expect(finalTags).toContain('#appointment');
      expect(finalTags).toContain('#dentist');
    });

    it('adds #health to doctor appointment', () => {
      const rawSentence = 'See doctor about knee pain';
      const aiTags = ['doctor', 'health'];
      const existingTags = ['#doctor'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#health');
      expect(finalTags).toContain('#doctor');
    });

    it('adds #finance to tax todo', () => {
      const rawSentence = 'Email accountant about tax letter before Friday';
      const aiTags = ['email', 'accountant', 'friday'];
      const existingTags = ['#email', '#accountant'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#finance');
      expect(finalTags).toContain('#accountant');
      expect(finalTags).toContain('#email');
    });

    it('adds #home to cleaning todo', () => {
      const rawSentence = 'Clean the kitchen and do laundry';
      const aiTags = ['cleaning', 'chores'];
      const existingTags = ['#cleaning'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#home');
      expect(finalTags).toContain('#cleaning');
    });
  });

  describe('Quality filter still applies', () => {
    it('filters junk tags even with theme enrichment', () => {
      // The original bad case from quality filter work
      const rawSentence = 'Work stuff has been a lot lately';
      const aiTags = ['has', 'been', 'lot', 'lately', 'stuff']; // All junk
      const existingTags = ['#has', '#lately']; // Junk from initial creation

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const cleanedExisting = applyTagQualityFilter(existingTags);
      const effectiveTags = normalizedAiTags.length > 0 ? normalizedAiTags : cleanedExisting;

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      // All junk should be filtered
      expect(finalTags).not.toContain('#has');
      expect(finalTags).not.toContain('#been');
      expect(finalTags).not.toContain('#lot');
      expect(finalTags).not.toContain('#lately');
      expect(finalTags).not.toContain('#stuff');

      // But #work theme should be added
      expect(finalTags).toContain('#work');
    });

    it('combines quality filter with theme tags correctly', () => {
      const rawSentence = 'Really need to go running this morning';
      const aiTags = ['really', 'need', 'running', 'morning'];
      const existingTags = ['#really', '#running'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const cleanedExisting = applyTagQualityFilter(existingTags);
      const effectiveTags = normalizedAiTags.length > 0 ? normalizedAiTags : cleanedExisting;

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      // Junk filtered
      expect(finalTags).not.toContain('#really');
      expect(finalTags).not.toContain('#need');

      // Quality tags kept
      expect(finalTags).toContain('#running');

      // Theme tag added
      expect(finalTags).toContain('#exercise');
    });
  });

  describe('Multiple themes', () => {
    it('adds multiple theme tags when applicable', () => {
      const rawSentence = 'Work from home today, clean office after meeting';
      const aiTags = ['work', 'home', 'meeting'];
      const existingTags = ['#work'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      expect(finalTags).toContain('#work');
      expect(finalTags).toContain('#home');
      expect(finalTags).toContain('#meeting');
    });
  });

  describe('No duplicate themes', () => {
    it('does not duplicate theme if already present', () => {
      const rawSentence = 'Start running every morning';
      const aiTags = ['running', 'exercise']; // exercise already in AI tags
      const existingTags = ['#running'];

      const normalizedAiTags = filterAndNormalizeTags(aiTags);
      const effectiveTags =
        normalizedAiTags.length > 0 ? normalizedAiTags : applyTagQualityFilter(existingTags);

      const withThemeTags = applyThemeTags(rawSentence, effectiveTags);
      const finalTags = applyTagQualityFilter(withThemeTags);

      const exerciseCount = finalTags.filter((tag) => tag.toLowerCase() === '#exercise').length;
      expect(exerciseCount).toBe(1);
    });
  });
});
