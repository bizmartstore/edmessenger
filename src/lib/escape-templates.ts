import type { EscapeConfig, EscapePuzzle, EscapeScene } from "@/lib/escape-room";

export type TemplateDifficulty = "starter" | "tricky" | "hard" | "nightmare";

export interface EscapeTemplate {
  id: string;
  name: string;
  tagline: string;
  difficulty: TemplateDifficulty;
  minutes: number;
  intro: string;
  puzzles: Omit<EscapePuzzle, "id">[];
}

export const DIFFICULTY_META: Record<
  TemplateDifficulty,
  { label: string; className: string }
> = {
  starter: { label: "Starter", className: "bg-emerald-500/15 text-emerald-600" },
  tricky: { label: "Tricky", className: "bg-sky-500/15 text-sky-600" },
  hard: { label: "Hard", className: "bg-amber-500/15 text-amber-600" },
  nightmare: { label: "Nightmare", className: "bg-destructive/15 text-destructive" },
};

function p(
  scene: EscapeScene,
  title: string,
  story: string,
  question: string,
  answer: string,
  hint: string,
): Omit<EscapePuzzle, "id"> {
  return { scene, title, story, question, answer, hint, image_url: "" };
}

export const ESCAPE_TEMPLATES: EscapeTemplate[] = [
  {
    id: "library-starter",
    name: "The Dusty Archive",
    tagline: "3 gentle locks — perfect for a first escape room.",
    difficulty: "starter",
    minutes: 10,
    intro:
      "The library doors sealed at closing time. Three old locks stand between you and the exit. Read carefully — the answers are hiding in plain sight.",
    puzzles: [
      p(
        "library",
        "Lock 1 · The Card Catalog",
        "A drawer is open. Inside, a card reads: 'I have keys but no locks, space but no room, you can enter but not go in.'",
        "What is it?",
        "keyboard|a keyboard",
        "You are probably touching one right now.",
      ),
      p(
        "library",
        "Lock 2 · The Shelf Sequence",
        "The shelves are numbered: 2, 4, 8, 16, 32, __ . The final shelf holds the key.",
        "Which number is the last shelf?",
        "64|sixty four",
        "Each shelf doubles the one before it.",
      ),
      p(
        "vault",
        "Lock 3 · The Reading Room Door",
        "A brass plate reads: 'Take the number of letters in LIBRARY, multiply by 3, subtract 1.'",
        "Enter the door code.",
        "20|twenty",
        "LIBRARY has 7 letters.",
      ),
    ],
  },
  {
    id: "lab-outbreak",
    name: "Containment Breach",
    tagline: "Science lab under lockdown — units, formulas and logic.",
    difficulty: "tricky",
    minutes: 14,
    intro:
      "A sample cracked open. The lab is in lockdown and the air scrubbers have 15 minutes of charge. Neutralize the sample and get out.",
    puzzles: [
      p(
        "lab",
        "Airlock · Chemical Code",
        "The keypad shows three element symbols: Na, O, Cl. The code is the sum of their atomic numbers.",
        "What is the airlock code?",
        "37|thirty seven",
        "Na = 11, O = 8, Cl = 17.",
      ),
      p(
        "lab",
        "Centrifuge · Dilution Math",
        "You must dilute 50 mL of a 40% solution down to 20%.",
        "What total volume (in mL) must the mixture reach?",
        "100|100 ml|100ml",
        "Concentration times volume stays constant.",
      ),
      p(
        "lab",
        "Freezer · The Mislabeled Vials",
        "Three vials: one all acid, one all base, one mixed. EVERY label is wrong. You may test exactly one drop, from the vial labeled MIXED.",
        "Which vial should you test to identify all three?",
        "mixed|the mixed vial|vial labeled mixed",
        "A wrong label means the MIXED vial cannot be mixed.",
      ),
      p(
        "vault",
        "Exit · Decontamination Sequence",
        "Protocol: pressure 3, rinse 7, purge 2. The door wants them in DESCENDING order, no spaces.",
        "Enter the exit sequence.",
        "732",
        "Largest number first.",
      ),
    ],
  },
  {
    id: "observatory-cipher",
    name: "Signal From Kepler",
    tagline: "Ciphers, star maps and binary — five demanding locks.",
    difficulty: "hard",
    minutes: 22,
    intro:
      "A repeating signal is coming from deep space, and the observatory has locked itself to protect the data. Decode the transmission before the array resets.",
    puzzles: [
      p(
        "observatory",
        "Lock 1 · Caesar's Sky",
        "The telescope log reads: 'FRPHW' — shifted by 3 letters.",
        "Decode the word.",
        "comet|a comet",
        "Shift each letter back by three.",
      ),
      p(
        "observatory",
        "Lock 2 · Binary Beacon",
        "The beacon pulses: 1 0 1 0 1 1.",
        "What is this value in base 10?",
        "43|forty three",
        "Rightmost bit is 1, then 2, 4, 8, 16, 32.",
      ),
      p(
        "spaceship",
        "Lock 3 · Orbital Riddle",
        "'I am the fourth from the Sun, red and dusty, and I hide the tallest volcano in the solar system.'",
        "Name the planet.",
        "mars",
        "Its volcano is Olympus Mons.",
      ),
      p(
        "observatory",
        "Lock 4 · The Light Delay",
        "Light takes about 8 minutes from the Sun to Earth. The signal source is 45 times farther.",
        "How many minutes does its light take? (whole number)",
        "360|three hundred sixty",
        "Multiply 8 by 45.",
      ),
      p(
        "spaceship",
        "Lock 5 · The Master Key",
        "Combine your answers: take the number of letters in the Lock 1 word, add the Lock 2 value, then add the digits of the Lock 4 answer.",
        "Enter the master key.",
        "57|fifty seven",
        "5 letters + 43 + (3+6+0).",
      ),
    ],
  },
  {
    id: "pyramid-curse",
    name: "The Cartouche Curse",
    tagline: "Six chained locks: logic grids, anagrams and a final cipher.",
    difficulty: "nightmare",
    minutes: 30,
    intro:
      "The tomb sealed the moment you touched the cartouche. Six seals guard the passage, and each one feeds the next. Nothing here is decoration — write everything down.",
    puzzles: [
      p(
        "pyramid",
        "Seal 1 · The Anagram of Ash",
        "Carved above the door: 'HAOPAR' — the ruler who sleeps here.",
        "Unscramble the word.",
        "pharaoh",
        "It is a title, not a name.",
      ),
      p(
        "pyramid",
        "Seal 2 · The Weighing of Hearts",
        "Four jars weigh 12, 7, 9 and 4 deben. Anubis takes the two jars whose difference equals the lightest jar.",
        "Which two weights does he take? (write them separated by a space, larger first)",
        "12 8|11 7|9 5|12 7 |13 9|12 7",
        "Look for a pair differing by 4.",
      ),
      p(
        "vault",
        "Seal 3 · The False Door",
        "Two doors, two guards. One always lies, one always tells the truth. You may ask one question to one guard.",
        "What single word must appear in your question for it to always work?",
        "other|the other|other guard",
        "Ask what the OTHER guard would say.",
      ),
      p(
        "pyramid",
        "Seal 4 · Hieroglyph Arithmetic",
        "Scarab = 5, Ankh = 3, Feather = 2. The wall shows: Scarab x Ankh - Feather x Feather.",
        "What number opens the seal?",
        "11|eleven",
        "Multiply before subtracting.",
      ),
      p(
        "library",
        "Seal 5 · The Scribe's Riddle",
        "'The more of me you take, the more you leave behind.'",
        "What am I?",
        "footsteps|steps|footprints",
        "You leave them on sand.",
      ),
      p(
        "vault",
        "Seal 6 · The Final Cartouche",
        "Take the number of letters in Seal 1's answer, multiply by Seal 4's number, then subtract the number of guards in Seal 3.",
        "Enter the final cartouche code.",
        "75|seventy five",
        "7 letters x 11 - 2.",
      ),
    ],
  },
  {
    id: "deep-sea-blackout",
    name: "Blackout at Station Nine",
    tagline: "Brutal chain: sabotage, pressure math, sonar code and a traitor.",
    difficulty: "nightmare",
    minutes: 30,
    intro:
      "Station Nine is 900 metres down and the power just died. Someone sabotaged the reactor and locked the escape pod. Solve every system, unmask the saboteur, and surface.",
    puzzles: [
      p(
        "aquarium",
        "System 1 · Pressure Check",
        "Every 10 metres of seawater adds about 1 atmosphere. At the surface you already have 1 atm.",
        "What is the total pressure (atm) at 900 metres?",
        "91|ninety one",
        "900/10 then add the surface atmosphere.",
      ),
      p(
        "aquarium",
        "System 2 · Sonar Morse",
        "The sonar taps: ... --- ...",
        "What word is it sending?",
        "sos",
        "Three short, three long, three short.",
      ),
      p(
        "lab",
        "System 3 · Oxygen Rationing",
        "Four crew share 480 minutes of oxygen. One crew member leaves in the pod.",
        "How many minutes does each remaining person get?",
        "160|160 minutes",
        "Divide by the three who stay.",
      ),
      p(
        "aquarium",
        "System 4 · The Traitor's Log",
        "Three logs. Mira: 'Kai did it.' Kai: 'I did not.' Tomas: 'Mira is lying.' Exactly one statement is TRUE.",
        "Who sabotaged the reactor?",
        "kai",
        "Test each suspect and count how many statements come out true.",
      ),
      p(
        "spaceship",
        "System 5 · Reactor Reroute",
        "Valves must open in the order: red, blue, green, blue, red. Red=1, Blue=4, Green=9.",
        "Enter the valve code with no spaces.",
        "14941",
        "Substitute each colour with its number in order.",
      ),
      p(
        "vault",
        "System 6 · Escape Pod Hatch",
        "The hatch wants: total pressure from System 1, minus the oxygen minutes from System 3 divided by 10.",
        "Enter the hatch code.",
        "75|seventy five",
        "91 - 16.",
      ),
    ],
  },
];

export function templateToConfig(t: EscapeTemplate): EscapeConfig {
  return {
    intro: t.intro,
    par_seconds: t.minutes * 60,
    puzzles: t.puzzles.map((q) => ({ ...q, id: crypto.randomUUID() })),
  };
}
