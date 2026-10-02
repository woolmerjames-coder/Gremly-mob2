/**
 * Notifications in the app: the shared names. The server sends with these
 * (workers/inngest-jobs/notifications/send.js CATEGORY and routeFor).
 */
export const EXPO_PROJECT_ID = '4c82fb8d-fdff-41a8-8fec-ce46ee3e6183';

/** iOS action sets the server names in categoryId. */
export const CATEGORY = {
  reminder: 'GREMLY_REMINDER',
  habit: 'GREMLY_HABIT',
} as const;

export const ACTION = {
  done: 'GREMLY_DONE',
  snooze: 'GREMLY_SNOOZE_HOUR',
} as const;

export type AskVariant = 'new' | 'existing' | 'denied';

/**
 * The one ask. The sentence names every kind of notification: Apple only lets
 * an app send notes like Gremly's when people agreed to them on screen
 * (App Review Guideline 4.5.4), and these exact words are saved with the yes.
 */
export const ASK_COPY: Record<AskVariant, { title: string; body: string; yes: string }> = {
  new: {
    title: 'Can I send you notifications?',
    body: 'Your morning brief, your evening sweep, reminders you set, and the odd note from me. I’ll stay quiet when you’re busy.',
    yes: 'Turn on',
  },
  existing: {
    title: 'My notifications are back',
    body: 'Your morning brief, your evening sweep, reminders you set, and the odd note from me. I’ll stay quiet when you’re busy.',
    yes: 'Sounds good',
  },
  denied: {
    title: 'Notifications are off for me',
    body: 'They’re switched off in your iPhone settings. Turn them on there and you’ll get your brief, your sweep, your reminders and the odd note from me.',
    yes: 'Open Settings',
  },
};

/** Days between asks after Not now (the bell can ask sooner, once a day). */
export const ASK_GAP_DAYS = 14;
