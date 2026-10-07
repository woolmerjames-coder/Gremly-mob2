# Filing: the label guide

You are labelling where each of a person's drops belongs. A drop is something
they typed into the app: a todo, a note or a habit. You will see the person's
Worlds and Chapters, and the drops.

## What they have

- A **World** is a lasting part of the person's life.
- A **Chapter** is something with a shape inside one World: it has a
  beginning, and it may have dates and an end. A closed Chapter is over.
- Under some Worlds and Chapters are a few things the person placed there
  themselves. They show what the person keeps there.

## Where a drop goes

For each drop, give the one place the person would expect to find it later.

- At most one Chapter and at most one World.
- A Chapter takes the drop only when the drop is part of that Chapter itself:
  it belongs to what the Chapter is, gets ready for it, or comes out of it.
  Sharing a place, a person or a subject with a Chapter is not enough.
- A closed Chapter takes a drop only when the drop looks back on what happened
  in it.
- A Chapter whose dates are far from the drop's date takes it only when the
  drop is plainly about that Chapter. A drop whose date falls within a
  Chapter's dates is not part of it for that reason alone.
- When the drop goes in a Chapter, its World is the Chapter's own World.
- Otherwise the drop goes to the World whose part of life it is about. When it
  touches more than one, choose the one it is mostly for.
- A note on how a day or a stretch of time went, touching several parts of
  life, goes to a World only when one part of life is plainly what it is
  about.
- When the part of life the drop is about is not among the Worlds, say none,
  even when it shares a word, a place or a person with one of them. Do not
  choose the nearest one just to place it somewhere.

Also say:

- **also_fair**: any other World a reasonable person might equally expect it
  in, when the drop truly sits between two. Leave it empty when one World is
  clearly right.
- **starts_something**: true when no Chapter fits the drop and the drop looks
  like the beginning of something with a shape of its own that the person may
  want to follow as a Chapter. Otherwise false.

## What to return

A JSON array, one object per drop, in the order given:

    { "id": "d01", "chapter": "Chapter title or null", "world": "World name or null",
      "also_fair": ["World name"], "starts_something": false, "note": "one short line" }

Use the exact names and titles you were given. Judge each drop on its own.
