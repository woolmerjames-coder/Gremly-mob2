# Labelling guide: Ask Gremly chats (extraction)

You are labelling what a productivity app should offer to save from a whole conversation between a user and Gremly, the app's companion. After each reply the app quietly reads the conversation and, when it finds something worth keeping, shows a small "Save items" pill the user can tap. Label from the conversation alone. Do not guess beyond the words. Skip nothing because it is short.

## What is worth offering to save

Offer only items where the user showed clear commitment or intent.

- `todo`: an action the user committed to, with a concrete verb and object. Not a suggestion Gremly made unless the user affirmed it ("yes, I'll do that", "good idea, adding it").
- `habit`: only with an explicit frequency or a stop or quit intent, and a behaviour the user could tick off on a given day. Wanting more or less of something with no amount or timing is not a habit.
- `note`: an idea the user was excited about, a decision reached, or a recommendation the user engaged with (asked more about, said they'd try, reacted to), not one Gremly merely listed.
- `event`: an upcoming date, deadline, exam, appointment, trip or time bound milestone the user mentioned, even without an exact date. Knowing something is coming up is useful context on its own.

Do not offer: explorations, emotional processing, Gremly's own suggestions the user did not take up, small talk, or something already mentioned as tracked.

Rule of thumb: a wrong offer is worse than a missed one. The pill interrupts, and offering to save something the user never meant to keep feels like being managed. When you would hesitate, leave it out.

## What to record for each chat

- `items`: a list of the things that should be offered, each with `type` (one of the four above) and `gist` (up to 10 words saying what it is, in plain words, enough that another reader could tell whether a proposed item is the same thing). Give each a short `id` of your own, i1, i2 and so on.
- `nothing`: true when the conversation has nothing worth offering. Then `items` is empty.
- `borderline`: ids of items in `items` that a reasonable product owner might also leave out, plus, as separate objects with `type` and `gist`, things you left out that a reasonable product owner might also offer. A model is not marked wrong either way on these.
- `note`: up to 12 words when a call was not obvious.

Output one JSON object per chat with the chat's `chat` id and the fields above, as a JSON array.
