/**
 * Rules of Mind Drop's enrichment (enrich-phase2 in cortex-index.js) written
 * as semantic rules only, with no worked examples and nothing from anyone's
 * data (18 Oct, in place of lists of examples): how long a todo or a habit
 * being built takes, and who an item mentions. scripts/enrich-replay holds
 * each to what the rules it replaced gave, on made up items.
 */
export const TIME_ESTIMATE_RULES = `1. time_estimate_minutes
How long the task will really take them from start to finish, in minutes: a multiple of 5 from 5 to 240. Every todo and every habit being built gets one, however little it says.
- When they say how long it takes, use what they said.
- Otherwise start from how long the action itself takes when nothing goes wrong. A message or a payment on a screen takes minutes; a call, a form, a chore or an errand takes tens of minutes; an appointment, a meeting or time spent with someone takes most of an hour or more; work that needs focus, writing or making something takes one to three hours; a big clear out or project block takes longer still.
- Then add what comes with it in real life, each as it applies, and add them together:
  - Leaving where they are adds 15 to 20 minutes for getting ready, going and settling back in, and the journey there and back is added on top.
  - Another person adds 10 to 15 minutes for arranging, waiting and conversation that runs long; an animal adds 10 to 15 for going at its pace; a group adds 15 to 20.
  - An appointment takes the time of the appointment itself, the waiting before it and the journey there and back.
  - What commonly goes wrong with that kind of task adds 5 to 15 minutes. A task in the physical world has more that can go wrong than one done on a screen.
  - For a small action, finding what it needs, getting set up and finishing off often take longer than the action itself.
  - A task with a clear end can be estimated closely. An open one with no natural place to stop, or one that needs deep focus, takes longer.
- Anything that means going out takes at least 30 minutes, and anything done with another person rarely takes less than 20.
- Round up to the next multiple of 5, and when torn between two estimates, choose the longer. Use the whole range, not only round numbers.
- A habit they are breaking is about not doing something, so it has no duration: return null for it.`;


export const PEOPLE_RULES = `9. people
Everyone the text mentions, as the text names them: by name when it gives one, with any title it uses, or otherwise by the word it uses for who they are to the person, without any word that says whose they are. Someone mentioned only as the one an occasion or a thing belongs to, or as the one who suggested something, is mentioned too. Groups, organisations and places are not people. Return them as an array of strings, at most 10, and an empty array when there are none.`;
