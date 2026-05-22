# Episode description style — FAFO

Reference for writing new episode descriptions (the `data-desc` attribute on each `.episode-card` in `docs/index.html`). Style derived from eps 001–006.

---

## The shape

One paragraph. **60–90 words.** Three implicit acts:

1. **Who the guest is** (1 sentence). Lead with status: school/role/notable recent thing. Pattern: `"<Name> is a/an <identity>"` or `"<Name> went <verb> into <role>"`.
2. **Two specific topics covered** (1–3 sentences). Name the projects/companies/decisions concretely. Brief — don't summarise the conversation, *point* at it.
3. **A broader theme** (1 sentence). What the episode reaches for beyond the guest — moral questions, generational shifts, industry trends. This is what makes the description hook a listener who's never heard of the guest.

---

## Voice rules

- **Earnest, not hype.** No "fire chat," "absolute legend," "dropped knowledge." No exclamation marks. No emojis. The site uses a Win98 aesthetic; the copy is the journalist underneath the desktop, not the radio DJ.
- **Plain compliments only.** Acceptable: "one very brilliant individual" (ep006). Avoid: "incredible," "amazing," "world-class."
- **First-person plural.** "We discussed," "We then turned to," "Our conversation started with…". Never "you'll hear" or "join us as".
- **Status qualifiers ground the reader.** "Incoming Citadel desk analyst," "currently at Omnea," "as of last year." These tiny dates matter — they age the episode well.
- **Concrete > abstract.** Numbers, project names, specific companies. "AMOU, an interactive archive of anonymous memories that now hosts over 30,000 users" lands; "his successful project" doesn't.

---

## Sentence-connector rotation

The current eps lean hard on three connectors:

- "We discussed…"
- "We then turned to…"
- "We also discussed…" / "The interview also touched on…"
- "alongside" (linking topics within a sentence)

**Vary these in new descriptions.** Two repeats in one paragraph is the limit. Alternatives to keep handy:

- "Our conversation started with…"
- "We finished with a discussion on…"
- "<Topic> ran through the second half."
- "<Topic> came up unexpectedly."
- "<Topic> is another thread of the interview."

---

## What to include — checklist for new descriptions

- [ ] Guest name, current role, one notable past credential (in sentence 1)
- [ ] At least one specific project, company, or number named
- [ ] Time markers if relevant ("as of last year," "incoming," "during university")
- [ ] Two topics from the body of the conversation, both concrete
- [ ] A broader theme that reaches beyond the guest's own work
- [ ] No emojis, no exclamation marks, no "absolute legend"-class superlatives
- [ ] Word count between 60 and 90
- [ ] Title format: `ep NNN w/ <Full Name>, '<Episode Title>'` — note `w/`, single quotes around the title, comma before the title

---

## Improvements to consider for new descriptions

These are gaps in the current 6 descriptions worth closing on future ones:

1. **The cold-open hook from the prep notes should also be the description's spine.** Right now the prep template builds a sharp hook ("the engineer building the data plumbing for tokenized assets…") that never makes it into the public-facing description. Sibling artefacts: the hook informs both. When writing the description, look at the cold-open `[hook]` in the prep notes file and use it as the framing for sentence 1 *or* the broader theme in the last sentence.
2. **Tease the broader theme, don't just announce it.** ep006 says "We finished with a discussion on diversity in VC and whether AI has broken down the corporate boxes that Covid put up." — that's good because it teases an actual claim. ep005's "moral safeguards (or lack of)" also works. Avoid bare announcements: *"we finished with a discussion on X"* is weaker than *"we finished on X, where Aarin argued Y"* (paraphrased, not quoted unless verbatim from recording).
3. **One concrete claim or take per description, ideally.** Right now most descriptions list topics. A description with one *take* embedded ("Aarin argued that Covid broke the corporate ladder") will out-pull a description with three topics named. Don't force it on every episode, but try for it where the episode actually has a strong take.
4. **Spot the typos.** ep003 has "responsiblity" (twice) and "neuro divergency" (should be "neurodivergence" or "neurodivergent identity"). Worth a sweep across all existing descriptions before adding new ones.

---

## Examples worth copying

The strongest sentences across the 6:

- *"Aarin is a self-titled generalist with parts of founding, VC, investment banking and GTM sales (currently at Omnea), all bundled up in one very brilliant individual."* — packed credentials, concrete + warm.
- *"AMOU, an interactive archive of anonymous memories that now hosts over 30,000 users."* — concrete number, named project.
- *"whether AI has broken down the corporate boxes that Covid put up."* — tease of a take, not just a topic.

---

## How to use this with Claude

When I ask Claude to write a new episode description, expected workflow:
1. Read the guest's prep notes (`epNNN_<GuestName>_Notes.md` in Drive).
2. Identify the cold-open hook, the two best concrete topics covered, and the broader theme.
3. Draft a 60–90 word paragraph following the three-act shape above.
4. Run the checklist before returning the draft.
