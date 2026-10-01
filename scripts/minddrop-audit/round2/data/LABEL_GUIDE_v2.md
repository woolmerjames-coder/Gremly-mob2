# Labelling guide v2: Gremly Mind Drop

You are labelling what a personal capture app should do with each "drop": text a user typed or dictated into a capture box. Label from the text alone. Do not guess at the user's life beyond what the words say. Some drops are the app founder's own notes about building the app; treat them exactly like anyone else's notes to self.

## Labels (use exactly these strings)

- `todo`: a discrete action the user can complete and mark done. A committed action with fuzzy details (what, when, how) is still a todo. Only doubt about whether to act at all takes it out of todo. Notes to self about fixing, building or changing something the user is responsible for are todos, even when they read like observations of a problem.
- `habit/start_habit`: a behaviour the user will personally repeat and build, which the app will then track by asking the user to log each time whether they did it.
- `habit/break_habit`: a behaviour the user wants to stop, limit or avoid over time, which the app will track the same way.
- `log/journal`: expressing or processing feelings, or reflecting on experience. Describing how the user has been behaving in the past is reflection, not a habit request.
- `log/idea`: a possibility the user is floating without having committed to it.
- `log/event`: something happening at a specific date or time that the user will attend or needs to know about, where nothing is required beyond noting it.
- `log/general`: pure factual reference information with no feeling, possibility or intent to act.
- `ambiguous`: a thoughtful person could not tell whether the user wants to do, track or keep this; two or more readings are about equally natural, so the app should ask one quick question.
- `multi`: the drop contains two or more separate items that would each become their own entry.

## The product owner's rules (these override your own instincts)

1. Habits are a strict gate. Setting up a habit is a commitment the user has to keep up in the app, and it would be annoying to create lots of them. Only label a habit when the behaviour is concrete enough to log each time as done or not done AND the drop itself makes the repetition clear, by saying how often or by tying it to a recurring part of the user's routine. When repetition is only implied, or the drop could as easily mean one occasion, it is a todo (or ambiguous if both readings are equally natural). Something scoped to one day or one bounded period is a todo.
2. A thought pattern, attitude or way of being with no concrete behaviour to log is not a habit. When the user is processing it, it is a journal.
3. Wanting more or less of something with no concrete amount, threshold or timing is ambiguous (asking is right), not a habit.
4. A dated occasion worded as already existing or arranged is an event. If it could equally be arranged already or still need arranging, asking is reasonable. With no date or time at all, an activity worded as something the user will do is a todo.
5. One action applied to several things is one item. Separate actions, or a feeling next to a separate clearly stated action, are multi.
6. A missing time, place or person never makes a drop ambiguous on its own.
7. Test drops, gibberish and questions to the app are still drops: give your best label (often `ambiguous` or `log/general`).

Calibration: these are decisions the product owner made on earlier drops. Use them to understand his taste, not as templates.
- "try not to check my phone first thing tomorrow": todo (one day only).
- "track spending properly this month": todo, asking also fine (bounded period).
- "I really need to stop saying yes to everything": journal, asking also fine.
- "stop catastrophising about things that haven't happened yet": journal, asking also fine.
- "do 10 minutes of stretching before bed": start_habit.
- "Read for 30 minutes before bed": ambiguous, todo also fine.
- "Take supplements after lunch": todo, asking also fine.
- "Call ski spirit and dentist about appointments": todo, asking also fine (not multi).
- "Haircut": ambiguous.
- "a simple weekly check-in to see where my time actually went": ambiguous.
- "Drink at Ben Fiddich": event; reference note or asking also fine.
- "dr appointment March 15": event, asking also fine.
- "Feeling behind on Gremly launch / Need to stop tweaking and actually ship / Maybe make a simple checklist?": multi.

## What to record for each drop

- `primary`: the single best label.
- `acceptable`: every label a reasonable product owner would accept as correct, always including `primary`. Be strict: include an alternative only if you would genuinely not call it a mistake.
- `question_ok`: true if asking the user one clarifying question would be a reasonable response (then `ambiguous` must be in `acceptable`).
- `segments`: only when `primary` is `multi`. A list with one entry per separate item, in order: `text` (the exact words from the drop for that item, copied verbatim; a short bridging word like "also" or "and" may be left out), `primary` (any label except `ambiguous` and `multi`) and `acceptable` (as above, for that item on its own, read in the context of the whole drop). Otherwise `null`.
- `note`: up to 12 words on your reasoning when it was not obvious, otherwise an empty string.
