/**
 * Quick Response System
 * Handles common chat messages instantly without API calls
 * Improves perceived performance and reduces costs for ~30-40% of messages
 */

export interface QuickResponse {
  patterns: RegExp[];
  response: string | (() => string);
  confidence: number;
  requiresEmptyContext?: boolean;
  skipIntentDetection?: boolean;
}

export const quickResponses: QuickResponse[] = [
  // Greetings (only at conversation start)
  {
    patterns: [/^(hi|hello|hey|sup|yo)$/i, /^hey there$/i, /^hi gremly$/i, /^hello gremly$/i],
    response: () => {
      const greetings = [
        "Hey! What's on your mind?",
        'Hello! What would you like to work on?',
        'Hi there! Ready to get something done?',
        'Hey! What can I help with today?',
      ];
      return greetings[Math.floor(Math.random() * greetings.length)];
    },
    confidence: 1.0,
    requiresEmptyContext: true,
    skipIntentDetection: true,
  },

  // Thanks/Appreciation
  {
    patterns: [
      /^(thanks|thank you|ty|thx|tysm)$/i,
      /^thanks!*$/i,
      /^thank you!*$/i,
      /^appreciate it$/i,
    ],
    response: () => {
      const responses = [
        "You're welcome! Anything else I can help with?",
        "Happy to help! What's next?",
        'No problem! What else can I do for you?',
        'Glad I could help! Anything else?',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    },
    confidence: 1.0,
    skipIntentDetection: true,
  },

  // Help requests
  {
    patterns: [
      /^what can you do\??$/i,
      /^help$/i,
      /^what do you do\??$/i,
      /^how do you work\??$/i,
      /^what are you\??$/i,
    ],
    response: `I can help you:
• 📝 Create and track habits
• ✅ Add tasks and todos  
• 📔 Capture notes and ideas
• 👥 Remember people and connections
• 💭 Sort through your thoughts

Just tell me what you're thinking about!`,
    confidence: 0.95,
    skipIntentDetection: true,
  },

  // Goodbyes
  {
    patterns: [/^(bye|goodbye|see you|cya|later|ttyl)$/i, /^bye!*$/i, /^see ya$/i],
    response: () => {
      const farewells = [
        'See you later! Your progress is saved.',
        "Bye! Everything's saved and ready for next time.",
        'Later! Keep up the great work!',
      ];
      return farewells[Math.floor(Math.random() * farewells.length)];
    },
    confidence: 1.0,
    skipIntentDetection: true,
  },

  // How are you
  {
    patterns: [
      /^how (are you|r u|are ya)\??$/i,
      /^how's it going\??$/i,
      /^what's up\??$/i,
      /^wassup\??$/i,
    ],
    response: () => {
      const responses = [
        "I'm here and ready to help! What's on your agenda?",
        'Doing great! What would you like to work on?',
        "All good! What's on your mind today?",
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    },
    confidence: 0.9,
    skipIntentDetection: true,
  },

  // Simple acknowledgments
  {
    patterns: [
      /^(cool|nice|great|awesome|sweet|perfect|neat)$/i,
      /^(cool|nice|great|awesome|sweet|perfect)!+$/i,
    ],
    response: () => {
      const responses = [
        "Glad you think so! What's next?",
        'Nice! What else would you like to do?',
        'Great! Anything else?',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    },
    confidence: 0.8,
    skipIntentDetection: true,
  },

  // Affirmations
  {
    patterns: [
      /^(ok|okay|sure|yes|yep|yeah|yup|uh huh|mhm)$/i,
      /^(ok|okay|sure|yes|yep|yeah)!*$/i,
      /^sounds good$/i,
      /^got it$/i,
    ],
    response: () => {
      const responses = [
        'Alright! What would you like to do?',
        "Got it. What's next?",
        'Sure thing! What else?',
        "Perfect! What's on your mind?",
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    },
    confidence: 0.7,
    skipIntentDetection: true,
  },

  // Negations (low confidence, may need context)
  {
    patterns: [
      /^(no|nah|nope|na)$/i,
      /^(no|nope|nah) thanks?$/i,
      /^not right now$/i,
      /^maybe later$/i,
    ],
    response: () => {
      const responses = [
        'No worries! Let me know when you need something.',
        "All good! I'm here when you're ready.",
        'Sure thing! Just holler when you need me.',
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    },
    confidence: 0.75,
    skipIntentDetection: true,
  },

  // Confusion/Clarification
  {
    patterns: [
      /^what\??$/i,
      /^huh\??$/i,
      /^what do you mean\??$/i,
      /^i don't understand$/i,
      /^confused$/i,
    ],
    response:
      "Let me clarify! What specifically would you like to know? I can help you create habits, tasks, notes, or just chat about what's on your mind.",
    confidence: 0.85,
    skipIntentDetection: true,
  },
];

/**
 * Check if input matches a quick response pattern
 * @param input - User's message text
 * @param conversationLength - Number of messages in current conversation
 * @returns Matching QuickResponse or null
 */
export function checkQuickResponse(
  input: string,
  conversationLength: number,
): QuickResponse | null {
  const trimmed = input.trim();

  // Skip empty messages
  if (!trimmed) return null;

  for (const qr of quickResponses) {
    // Skip if requires empty context but conversation has started
    if (qr.requiresEmptyContext && conversationLength > 2) {
      continue;
    }

    // Check if any pattern matches
    const matches = qr.patterns.some((pattern) => pattern.test(trimmed));
    if (matches) {
      return qr;
    }
  }

  return null;
}

/**
 * Get response text from a QuickResponse (handles string or function)
 * @param qr - QuickResponse object
 * @returns Response text
 */
export function getQuickResponseText(qr: QuickResponse): string {
  return typeof qr.response === 'function' ? qr.response() : qr.response;
}

/**
 * Check if a message should skip intent detection
 * @param input - User's message text
 * @param conversationLength - Number of messages
 * @returns true if should skip intent detection
 */
export function shouldSkipIntentDetection(input: string, conversationLength: number): boolean {
  const qr = checkQuickResponse(input, conversationLength);
  return qr?.skipIntentDetection === true;
}
