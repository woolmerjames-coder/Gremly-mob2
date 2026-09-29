# Labelling guide: Gremly Mind Drop

You are labelling what a capture app should do with each "drop" (text a user typed or dictated into a capture box). These definitions restate the ones the app's own classifier uses. Label from the text alone. Do not guess at the user's life beyond what the words say.

## Labels (use exactly these strings)

- `todo`: a discrete action the user can complete and mark done. A committed action with fuzzy details (what, when, how) is still a todo. Only doubt about whether to act at all takes it out of todo. Notes to self about fixing, building or changing something the user is responsible for are todos.
- `habit/start_habit`: a recurring behaviour the user will personally repeat and build, where when or how often is stated or inherent, so the user could say on any given day whether they did it.
- `habit/break_habit`: a recurring behaviour the user wants to stop, limit or avoid, including standing rules they set for their own behaviour.
- `log/journal`: expressing or processing feelings, or reflecting on experience. Describing how the user has been behaving in the past is reflection, not a habit request.
- `log/idea`: a possibility the user is floating without having committed to it.
- `log/event`: something happening at a specific date or time that the user will attend or needs to know about, where nothing is required beyond noting it.
- `log/general`: pure factual reference information with no feeling, possibility or intent to act.
- `ambiguous`: a thoughtful person could not tell whether the user wants to do, track or keep this; two or more readings are about equally natural.
- `multi`: the drop contains two or more separate items that would each become their own entry.

Habit test: before choosing a habit label, all three must hold. The user is the one repeating it; the repetition belongs to the user's own behaviour; and timing or frequency is actually expressed or inherent. Wanting more or less of something with no amount, threshold or timing is not a habit (it is ambiguous, because asking is right).

Date test: a dated occasion worded as already existing or arranged is an event. If it could equally be arranged already or still need arranging by the user, asking is reasonable.

Test drops, gibberish and questions to the app are still drops: give them your best label (often `ambiguous` or `log/general`).

## What to record for each drop

- `primary`: the single best label.
- `acceptable`: every label a reasonable product owner would accept as correct, always including `primary`. Be strict: include an alternative only if you would genuinely not call it a mistake.
- `question_ok`: true if asking the user one clarifying question would be a reasonable response (then `ambiguous` must be in `acceptable`).
- `note`: up to 12 words on your reasoning when it was not obvious.
