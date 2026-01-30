const fs = require('fs');

// Read the file
let content = fs.readFileSync('index.js', 'utf8');

// The existing prompt ends with this pattern
const endPattern = '**Track it**';
const endSuffix = 'Seeing progress helps motivation.`;';

// Find the location
const idx = content.indexOf('**Track it**');
if (idx === -1) {
  console.error('Could not find **Track it** in file');
  process.exit(1);
}

// Find the end of that line (the backtick+semicolon)
const lineEnd = content.indexOf('`;', idx);
if (lineEnd === -1) {
  console.error('Could not find end of prompt');
  process.exit(1);
}

// Extract everything from Track it to the end
const segment = content.substring(idx, lineEnd + 2);
console.log('Found segment:', JSON.stringify(segment.substring(0, 60)));

// Create the replacement with SAVE SUGGESTIONS added
const saveSuggestionsSection = `**Track it**  Seeing progress helps motivation.

=== SAVE SUGGESTIONS ===
Do NOT mention saving in your response text. Instead, when your response contains genuinely useful content worth saving, append a hidden suggestion block AFTER your response.

**When to suggest saving:**
- TODO: Any clear, completable action you recommend (verb + object)
- HABIT: A recommendation with explicit frequency ("daily", "3x per week", etc.)
- NOTE: Key reference information, summaries, or explanations worth keeping
- STEPS: When you provide 2+ actionable steps, include them in the steps array

**When NOT to suggest:**
- Simple factual answers or definitions
- Clarifying questions back to the user
- Emotional support or empathy responses
- Very short responses (under 30 words)
- Exploratory "it depends" responses
- When you're just chatting or checking in

**Format:** After your complete response, on a NEW LINE, add exactly:
<!--SAVE:{"type":"todo","title":"Your title here","steps":["Step 1","Step 2"]}-->

CRITICAL FORMAT RULES:
- Must start with exactly: <!--SAVE:
- Must end with exactly: -->
- JSON must be valid (proper quotes, no trailing commas)
- Put on its own line after your response
- Do not include any other text on that line

**Rules:**
- type: "todo", "habit", or "note"
- title: 2-6 words, action-oriented for todos/habits
- steps: Extract ALL distinct actionable items (max 12). Don't summarize or combine items.
- No steps array for habits or notes

**Examples:**

Response about creatine dosage:
"Take 5g daily, ideally post-workout or with a meal. Timing does not matter much - consistency does."
<!--SAVE:{"type":"habit","title":"Take creatine 5g daily"}-->

Response breaking down a task:
"Here is how to tackle this:
- Research plans - look at Hal Higdon or Nike Run Club
- Get fitted for shoes - visit a running store
- Sign up early - popular races fill up"
<!--SAVE:{"type":"todo","title":"Prepare for half marathon","steps":["Research training plans","Get fitted for running shoes","Sign up for race"]}-->

Response with useful info (no action):
"Creatine is one of the most studied supplements. It helps with muscle recovery and can support cognitive function."
<!--SAVE:{"type":"note","title":"Creatine benefits overview"}-->

Response that should NOT have a suggestion (just chatting):
"That is a solid goal! What is drawing you to the half marathon - is it a specific race or just the distance?"
(no suggestion block)\``;

// Perform the replacement
const newContent = content.substring(0, idx) + saveSuggestionsSection + content.substring(lineEnd + 2);

fs.writeFileSync('index.js', newContent);
console.log('SUCCESS: Added SAVE SUGGESTIONS section to Space Chat prompt');
console.log('New file size:', newContent.length, 'bytes');
