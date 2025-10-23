/**
 * Phase 10.7C: Smalltalk & Greeting Handler
 * Natural responses for greetings and acknowledgments
 */

/**
 * Check if message is a greeting
 */
export function isGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const greetingPatterns = [
    /^(hi|hey|hello|yo|sup|heya|hiya|howdy)\b/i,
    /\bhow are you\b/i,
    /\bhow's it going\b/i,
    /\bhow are things\b/i,
    /\bwhat's up\b/i,
    /\bgood (morning|afternoon|evening)\b/i,
  ];

  return greetingPatterns.some((pattern) => pattern.test(normalized));
}

/**
 * Check if message is smalltalk (acknowledgment, simple response)
 */
export function isSmalltalk(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  // Short acknowledgments
  const ackWords = [
    'ok',
    'okay',
    'thanks',
    'thank you',
    'thx',
    'ty',
    'kk',
    'cool',
    'nice',
    'great',
    'awesome',
    'yeah',
    'yep',
    'yup',
    'sure',
    'alright',
    'got it',
    'understood',
  ];

  if (ackWords.includes(normalized)) {
    return true;
  }

  // Short phrases (≤3 words)
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount <= 3 && normalized.length < 20) {
    return true;
  }

  return false;
}

/**
 * Respond to smalltalk with calm, witty, context-aware reply
 * Returns response text (≤2 sentences)
 */
export function respond(text: string, context?: { userName?: string; spaceName?: string }): string {
  const normalized = text.trim().toLowerCase();

  // Greetings
  if (isGreeting(text)) {
    const greetingResponses = [
      "Hey! What's on your mind?",
      'Hi there! How can I help?',
      "Hello! What's happening today?",
      'Hey! Ready when you are.',
      'Hi! What would you like to explore?',
    ];

    // Add context-aware greeting if space name available
    if (context?.spaceName) {
      greetingResponses.push(`Hi! Welcome back to ${context.spaceName}.`);
    }

    return pickRandom(greetingResponses, text);
  }

  // Thanks
  if (/(thanks|thank you|thx|ty)/i.test(normalized)) {
    return pickRandom(
      [
        'You got it!',
        'Anytime!',
        'Happy to help.',
        'My pleasure.',
        'No problem!',
        "That's what I'm here for.",
      ],
      text,
    );
  }

  // Positive acknowledgments
  if (/(cool|nice|great|awesome|perfect|good)/i.test(normalized)) {
    return pickRandom(
      [
        'Glad to hear it!',
        'Awesome! Let me know if you need anything else.',
        "Nice! What's next?",
        "Great! I'm here if you need me.",
        'Perfect! Anything else on your mind?',
      ],
      text,
    );
  }

  // Simple acknowledgments (ok, yeah, sure)
  if (/(ok|okay|yeah|yep|yup|sure|alright|got it|understood|kk)/i.test(normalized)) {
    return pickRandom(
      [
        'Cool. Just let me know if you need anything.',
        'Sounds good.',
        "Alright! I'm here when you need me.",
        "Okay! What's next?",
        'Got it. Let me know how I can help.',
      ],
      text,
    );
  }

  // Default smalltalk response
  return "I'm listening. What's on your mind?";
}

/**
 * Pick a deterministic response to avoid repetition
 * Uses simple hash of input text to seed selection
 */
function pickRandom(options: string[], seed: string): string {
  if (options.length === 0) {
    return "I'm listening.";
  }

  // Simple hash function for deterministic selection
  const hash = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = hash % options.length;

  return options[index];
}
