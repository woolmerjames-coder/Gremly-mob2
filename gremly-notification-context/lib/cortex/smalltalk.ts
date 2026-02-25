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
 * Phase 10.10: Enhanced with friendly greeting variants and "how are you" responses
 */
export function respond(text: string, context?: { userName?: string; spaceName?: string }): string {
  const normalized = text.trim().toLowerCase();

  // Detect "how are you" specifically for warmer personal responses
  const isHowAreYou =
    /\bhow are you\b/i.test(normalized) ||
    /\bhow's it going\b/i.test(normalized) ||
    /\bhow are things\b/i.test(normalized) ||
    /\bhow've you been\b/i.test(normalized);

  if (isHowAreYou) {
    const howAreYouResponses = [
      "I'm doing great! What's on your mind?",
      "I'm here and ready to help! What can I do for you?",
      'Doing well! How can I help you today?',
      "I'm good! What brings you here?",
      'All good here! What would you like to explore?',
      "I'm here for you! What's happening?",
    ];
    return pickRandom(howAreYouResponses, text);
  }

  // Simple greetings with friendly clarifying questions
  if (isGreeting(text)) {
    const greetingResponses = [
      "Hey there! What's on your mind today?",
      'Hi! How can I help you?',
      'Hello! What brings you here?',
      'Hey! What would you like to explore?',
      'Hi there! What can I do for you today?',
      "Hello! Ready when you are — what's up?",
    ];

    // Add context-aware greeting if space name available
    if (context?.spaceName) {
      greetingResponses.push(`Hi! Welcome back to ${context.spaceName}. What's on your mind?`);
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
