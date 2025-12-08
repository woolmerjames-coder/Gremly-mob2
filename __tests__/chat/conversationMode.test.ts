/**
 * Unit tests for conversation mode detection
 */

import {
  detectConversationMode,
  hasEmotionalContent,
  hasExplicitActionRequest,
  ConversationMode,
} from '../../lib/chat/conversationMode';

describe('detectConversationMode', () => {
  describe('reflective mode', () => {
    test.each([
      "I'm feeling really overwhelmed",
      "Ugh, I don't know what to do",
      "I've been stressed lately",
      "Honestly I'm so tired of this",
      'I feel like nothing is working',
      'Was thinking about maybe changing jobs',
      "I'm not sure what I want anymore",
      'Feeling anxious about everything',
      "I'm so frustrated right now",
      'Man, this is tough',
      'Been feeling really down',
      "I can't stand this situation",
    ])('detects "%s" as reflective', (text) => {
      expect(detectConversationMode(text)).toBe('reflective');
    });
  });

  describe('operational mode', () => {
    test.each([
      'I want to start running',
      'I need to call the dentist',
      'Help me plan my morning routine',
      'I will exercise every day',
      'Can you help me create a schedule',
      "I'm going to start meditating daily",
      'Save this for later',
      'Create a todo for tomorrow',
      'I plan to finish this by Friday',
      'Remind me to check on this',
      'Add this to my list',
      'Set up a weekly routine',
    ])('detects "%s" as operational', (text) => {
      expect(detectConversationMode(text)).toBe('operational');
    });
  });

  describe('neutral mode', () => {
    test.each([
      "I'm stressed but I want to fix it",
      'Feeling overwhelmed, need to make a plan',
      'How are you today',
      'What do you think about that',
      'Tell me more',
      'Thanks for listening',
      'That makes sense',
      'Interesting idea',
    ])('detects "%s" as neutral', (text) => {
      expect(detectConversationMode(text)).toBe('neutral');
    });
  });

  describe('edge cases', () => {
    test('handles empty string', () => {
      expect(detectConversationMode('')).toBe('neutral');
    });

    test('handles very short input', () => {
      expect(detectConversationMode('hi')).toBe('neutral');
    });

    test('handles null/undefined gracefully', () => {
      expect(detectConversationMode(null as unknown as string)).toBe('neutral');
      expect(detectConversationMode(undefined as unknown as string)).toBe('neutral');
    });

    test('is case insensitive', () => {
      expect(detectConversationMode('I WANT TO START RUNNING')).toBe('operational');
      expect(detectConversationMode('I FEEL OVERWHELMED')).toBe('reflective');
    });

    test('handles mixed case', () => {
      expect(detectConversationMode('i WaNt To StArT rUnNiNg')).toBe('operational');
    });

    test('handles whitespace', () => {
      expect(detectConversationMode('   I want to start running   ')).toBe('operational');
    });
  });

  describe('mixed signals → neutral', () => {
    test('reflective + operational = neutral', () => {
      // User is venting but also asking for help
      expect(detectConversationMode("I'm so stressed, I need to make a plan")).toBe('neutral');
      expect(detectConversationMode('Feeling overwhelmed but I want to fix it')).toBe('neutral');
      expect(detectConversationMode("I've been anxious, help me create a routine")).toBe('neutral');
    });
  });
});

describe('hasEmotionalContent', () => {
  test('returns true for emotional content', () => {
    expect(hasEmotionalContent("I'm feeling stressed")).toBe(true);
    expect(hasEmotionalContent('So frustrated right now')).toBe(true);
    expect(hasEmotionalContent('Ugh, this is hard')).toBe(true);
  });

  test('returns false for non-emotional content', () => {
    expect(hasEmotionalContent('I want to start running')).toBe(false);
    expect(hasEmotionalContent('Create a new habit')).toBe(false);
    expect(hasEmotionalContent('How are you today')).toBe(false);
  });

  test('handles empty/null', () => {
    expect(hasEmotionalContent('')).toBe(false);
    expect(hasEmotionalContent(null as unknown as string)).toBe(false);
  });
});

describe('hasExplicitActionRequest', () => {
  test('returns true for action requests', () => {
    expect(hasExplicitActionRequest('Help me with this')).toBe(true);
    expect(hasExplicitActionRequest('Can you help me plan')).toBe(true);
    expect(hasExplicitActionRequest('Create a new todo')).toBe(true);
    expect(hasExplicitActionRequest('I want to create a habit')).toBe(true);
  });

  test('returns false for non-action content', () => {
    expect(hasExplicitActionRequest("I'm feeling tired")).toBe(false);
    expect(hasExplicitActionRequest('Tell me more')).toBe(false);
    expect(hasExplicitActionRequest('Interesting')).toBe(false);
  });

  test('handles empty/null', () => {
    expect(hasExplicitActionRequest('')).toBe(false);
    expect(hasExplicitActionRequest(null as unknown as string)).toBe(false);
  });
});
