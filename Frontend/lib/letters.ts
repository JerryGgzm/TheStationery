// Sample letters shown on the wall. This is placeholder content until the
// backend + AI summaries are wired in; the shape mirrors what the API will
// eventually return so the UI won't need to change.
//
// - `summary` is the short, AI-generated line shown on the pinned card.
// - `seal` is the physical decoration pinning the note (each choice reflects
//   the letter's tone, so nothing on the board is purely ornamental).
// - `isReply` marks letters written back to the current user; those get a red
//   postmark on the wall so replies are easy to spot.

export type LetterSeal = "wax" | "clip" | "pin" | "tape" | "ribbon";

export interface Letter {
  id: string;
  summary: string;
  title: string;
  body: string;
  signature: string;
  seal: LetterSeal;
  isReply?: boolean;
}

export const SAMPLE_LETTERS: Letter[] = [
  {
    id: "starting-over",
    summary: "A quiet confession about starting over.",
    title: "A small beginning",
    signature: "A stranger",
    seal: "wax",
    body: `Dear stranger,

I have been thinking about how difficult it is to begin again. Last week I packed one small box and left the place I had called home for years.

Nothing feels familiar yet, but this morning someone held the door for me. For a moment, the city felt less cold.

If you are beginning again too, I hope something small finds you today.

— A stranger`,
  },
  {
    id: "rainy-train",
    summary: "Someone remembers a rainy train ride.",
    title: "The 7:14 train",
    signature: "R.",
    seal: "clip",
    isReply: true,
    body: `Hello again,

Your last letter reached me on a rainy platform. I read it twice before the 7:14 came in, and then once more with the window fogging over.

I don't know your face, but I know you notice small things. So do I. The rain, the ticket stubs, the way strangers share umbrellas without a word.

Thank you for writing back.

— R.`,
  },
  {
    id: "after-graduation",
    summary: "A note about feeling lost after graduation.",
    title: "After the gown",
    signature: "someone still figuring it out",
    seal: "pin",
    body: `To whoever finds this,

Everyone said the hard part would be over once I graduated. No one mentioned the quiet that comes after — the empty calendar, the friends scattering to different cities.

Some days I feel behind in a race no one is actually running. I'm trying to be gentle with myself about that.

If you feel it too, you're not behind. You're just early.

— someone still figuring it out`,
  },
  {
    id: "small-kindness",
    summary: "A stranger shares a small act of kindness.",
    title: "The umbrella",
    signature: "M.",
    seal: "tape",
    body: `Dear you,

It rained hard yesterday and I had forgotten my umbrella. A woman I'd never met walked three blocks out of her way so I wouldn't get soaked, then waved off my thanks and disappeared.

I keep thinking about how many quiet kindnesses happen that we never hear about.

This is me passing one along.

— M.`,
  },
  {
    id: "missing-home",
    summary: "A late-night letter about missing home.",
    title: "Two a.m.",
    signature: "far from home",
    seal: "ribbon",
    isReply: true,
    body: `It's two in the morning,

and the city outside my window won't sleep, so neither can I. I miss the sound of my mother's kettle, the specific creak of the third stair.

Homesickness is strange — it isn't about a place so much as a time you can't go back to.

Reading your letter made the night feel a little less empty. Thank you for that.

— far from home`,
  },
];

export function getLetter(id: string): Letter | undefined {
  return SAMPLE_LETTERS.find((l) => l.id === id);
}

// --- Correspondence: past letters grouped by the person who sent them --------
// Shown behind the desk (the bookshelf). Each bundle is one person's thread of
// letters to the current user. `tie` is how the bundle is bound together on the
// shelf; it's cosmetic but consistent per person. As with the wall, letters that
// are replies to something the user wrote carry a red postmark.

export type BundleTie = "red-string" | "green-string" | "clip" | "twine-wax" | "green-band";

export interface Correspondent {
  id: string;
  name: string;
  tie: BundleTie;
  letters: Letter[];
}

export const CORRESPONDENTS: Correspondent[] = [
  {
    id: "mara",
    name: "Mara",
    tie: "red-string",
    letters: [
      {
        id: "mara-1",
        summary: "Mara first wrote from a train, unsure anyone would answer.",
        title: "From a moving window",
        signature: "Mara",
        seal: "wax",
        body: `Dear whoever you are,

I'm writing this from a train, watching towns I'll never visit slide past. I don't know why a stranger's ear feels safer than a friend's, but tonight it does.

If this reaches you, know that someone thought of you kindly from a moving window.

— Mara`,
      },
      {
        id: "mara-2",
        summary: "She thanks you for writing back so gently.",
        title: "You answered",
        signature: "Mara",
        seal: "clip",
        isReply: true,
        body: `You answered.

I read your letter on the platform and had to sit down. It's a strange comfort, being understood by someone who owes you nothing.

Thank you for being gentle with a stranger.

— Mara`,
      },
      {
        id: "mara-3",
        summary: "A small update: she took the job in the north.",
        title: "I took the job",
        signature: "Mara",
        seal: "pin",
        body: `A quick note —

I took the job in the north after all. The winters frighten me a little, but you were right: fear and excitement wear the same coat.

I'll write properly once I've unpacked.

— Mara`,
      },
      {
        id: "mara-4",
        summary: "Snow, a new window, and a thank-you a year later.",
        title: "One year on",
        signature: "Mara",
        seal: "ribbon",
        isReply: true,
        body: `It's snowing here now,

and I have a window of my own to watch it from. A year ago I was on that train, certain no one was listening.

I don't know if you realize what your first reply did. I do.

— Mara`,
      },
    ],
  },
  {
    id: "rowan",
    name: "Rowan",
    tie: "green-string",
    letters: [
      {
        id: "rowan-1",
        summary: "Rowan writes about the quiet after moving to a new city.",
        title: "The quiet apartment",
        signature: "Rowan",
        seal: "clip",
        body: `Hi,

Nobody tells you how loud an empty apartment is. I moved here for work and the silence has opinions.

I found this bookshop's letter box by accident and thought I'd try. Hello from the quiet.

— Rowan`,
      },
      {
        id: "rowan-2",
        summary: "He tried your suggestion and joined a small choir.",
        title: "I sang, badly",
        signature: "Rowan",
        seal: "wax",
        isReply: true,
        body: `You'll be pleased —

I took your advice and found a community choir. I sang, badly, next to strangers, and somehow felt less alone by the end of it.

Turns out you don't have to be good at a thing to be held by it.

— Rowan`,
      },
      {
        id: "rowan-3",
        summary: "A rainy Sunday, tea, and a thank-you.",
        title: "Rainy Sunday",
        signature: "Rowan",
        seal: "tape",
        body: `It's raining and I have nowhere to be.

Tea, a book, your last letter on the table. This is the kind of quiet I was afraid of a few months ago, and now I've made peace with it.

Thank you for the company across the distance.

— Rowan`,
      },
    ],
  },
  {
    id: "eli",
    name: "Eli",
    tie: "clip",
    letters: [
      {
        id: "eli-1",
        summary: "Eli asks how to forgive someone who never apologized.",
        title: "The unsent apology",
        signature: "Eli",
        seal: "pin",
        body: `Stranger,

How do you forgive someone who will never say sorry? I keep waiting for an apology that isn't coming, and the waiting is its own kind of prison.

I don't need an answer. I just needed to ask it out loud.

— Eli`,
      },
      {
        id: "eli-2",
        summary: "He writes that your words helped him let it go.",
        title: "I let it go",
        signature: "Eli",
        seal: "wax",
        isReply: true,
        body: `I read your reply a dozen times.

"Forgiveness is a gift you give yourself." I rolled my eyes at first — and then I cried, because it was true.

I let it go this week. Lighter now.

— Eli`,
      },
    ],
  },
  {
    id: "june",
    name: "June",
    tie: "twine-wax",
    letters: [
      {
        id: "june-1",
        summary: "June writes at 2 a.m. about missing her grandmother.",
        title: "Two in the morning",
        signature: "June",
        seal: "wax",
        body: `It's late,

and I miss my grandmother in the specific way you miss a person: the sound of her kettle, the third stair that creaked.

I don't want advice. I just wanted to say her name to someone. Her name was Rose.

— June`,
      },
      {
        id: "june-2",
        summary: "She planted roses in her grandmother's memory.",
        title: "I planted roses",
        signature: "June",
        seal: "ribbon",
        isReply: true,
        body: `You remembered her name.

I planted roses on the balcony this spring — clumsily, with too much water. Two of them survived, which feels like a small miracle.

Thank you for holding her name with me.

— June`,
      },
      {
        id: "june-3",
        summary: "A funny story about the neighbor's cat.",
        title: "The thief next door",
        signature: "June",
        seal: "clip",
        body: `Lighter news:

The neighbor's cat has decided my balcony is his kingdom and my roses are his salad. We are at war. He is winning.

I thought you'd enjoy knowing my life has small, ridiculous problems again.

— June`,
      },
      {
        id: "june-4",
        summary: "She's learning to bake her grandmother's bread.",
        title: "Rose's bread",
        signature: "June",
        seal: "tape",
        body: `I found her recipe card,

stained and barely legible. My first three loaves were bricks. The fourth was almost right.

The kitchen smelled like my childhood. I sat on the floor and let it.

— June`,
      },
      {
        id: "june-5",
        summary: "A year of letters, and gratitude.",
        title: "A year of you",
        signature: "June",
        seal: "wax",
        isReply: true,
        body: `Do you realize we've been writing for a year?

I counted the letters last night. So much has changed — the roses, the bread, the war with the cat (ongoing).

Grief is quieter now. You were part of that. Thank you.

— June`,
      },
    ],
  },
  {
    id: "noah",
    name: "Noah",
    tie: "green-band",
    letters: [
      {
        id: "noah-1",
        summary: "Noah writes about feeling behind everyone his age.",
        title: "Behind",
        signature: "Noah",
        seal: "pin",
        body: `Hey,

Everyone I know seems to have it figured out — careers, partners, plans. I'm twenty-six and still feel like I'm reading the instructions upside down.

Do you ever feel like you missed a meeting where they explained life?

— Noah`,
      },
      {
        id: "noah-2",
        summary: "He says your letter made him feel less alone.",
        title: "Not a race",
        signature: "Noah",
        seal: "clip",
        isReply: true,
        body: `"You're not behind, you're just early."

I wrote that on a sticky note and put it on my mirror. Some mornings I believe it. That's more than I had before your letter.

Thanks for not making me feel small.

— Noah`,
      },
    ],
  },
];

export function getCorrespondent(id: string): Correspondent | undefined {
  return CORRESPONDENTS.find((c) => c.id === id);
}
