"""Builds the three made-up v2 sample classes: Maths 6B, Science 7A, English 8C.

Every student is fictional. Answers are written to show the mistakes each question type names,
and every open answer carries the author's reference mark (`ref`) so the bench can compare
Gemini Nano's suggestions with it. Output: tools/samples/out/<class>/manifest.json
Usage: python -I tools/samples/classes.py
"""
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"

# ------------------------------------------------------------------ Maths 6B (the v1 class, widened)
MATHS_NAMES = ['Aarav Shah', 'Meera Krishnan', 'Rohan Das', 'Ananya Iyer', 'Kabir Singh', 'Diya Menon', 'Arjun Reddy', 'Ishita Rao',
               'Vihaan Joshi', 'Saanvi Nair', 'Aditya Kulkarni', 'Myra Fernandes', 'Reyansh Gupta', 'Kiara Thomas', 'Dhruv Patel',
               'Anika Bose', 'Kavin Raj', 'Tara Mehta', "Neil D'Souza", 'Zoya Khan', 'Yash Verma', 'Riya Pillai', 'Samar Malhotra',
               'Aisha Siddiqui', 'Ved Chatterjee', 'Nila Sundaram', 'Leo Mathew', 'Pari Agarwal']

# (written, label) pools; label = intended mark/mistake for the ground truth
MATHS = {
    "title": "Number check", "className": "Maths 6B", "subject": "maths", "grade_band": "4-6",
    "instructions": "Show your answer in its simplest form. Give units where needed.",
    "questions": [
        {"q": 1, "prompt": "2/3 + 1/6", "key": "5/6", "pool": [("5/6", "correct", 60), ("3/9", "add_across", 14), ("3/6", "numerators_only", 8), ("10/12", "unsimplified", 10), ("4/6", "other", 4), ("", "blank", 4)]},
        {"q": 2, "prompt": "3/4 - 1/3", "key": "5/12", "pool": [("5/12", "correct", 64), ("2/1", "add_across", 12), ("2/4", "numerators_only", 8), ("-5/12", "reversed_subtraction", 6), ("7/12", "slip", 6), ("", "blank", 4)]},
        {"q": 3, "prompt": "1/3 × 3/4", "key": "1/4", "pool": [("1/4", "correct", 62), ("4/9", "cross_multiply", 14), ("3/12", "unsimplified", 14), ("13/12", "wrong_operation", 6), ("", "blank", 4)]},
        {"q": 4, "prompt": "3/4 ÷ 1/2", "key": "1 1/2", "pool": [("1 1/2", "correct", 52), ("3/8", "no_invert", 22), ("3/2", "correct", 10), ("2/3", "flipped_first", 8), ("6/4", "unsimplified", 6), ("", "blank", 2)]},
        {"q": 5, "prompt": "1 1/2 + 3/4", "key": "2 1/4", "pool": [("2 1/4", "correct", 56), ("1 1/4", "whole_dropped", 18), ("2 2/8", "unsimplified", 8), ("9/4", "correct", 8), ("1 4/6", "add_across", 6), ("", "blank", 4)]},
        {"q": 6, "prompt": "0.6 + 0.25", "key": "0.85", "pool": [("0.85", "correct", 58), ("0.31", "decimal_alignment", 26), ("8.5", "place_value", 6), ("0.86", "other", 6), ("", "blank", 4)]},
        {"q": 7, "prompt": "15% of 80", "key": "12", "pool": [("12", "correct", 60), ("1200", "percent_decimal", 16), ("5.33", "other", 8), ("120", "place_value", 8), ("", "blank", 8)]},
        {"q": 8, "prompt": "Write 35% as a decimal", "key": "0.35", "pool": [("0.35", "correct", 58), ("3.5", "place_value", 20), ("35", "percent_decimal", 10), (".35", "correct", 8), ("", "blank", 4)]},
        {"q": 9, "prompt": "Write 3.5 cm in millimetres", "key": "35 mm", "pool": [("35 mm", "correct", 50), ("35", "missing_unit", 16), ("350 mm", "place_value", 14), ("3.5 mm", "wrong_unit", 12), ("0.35 mm", "place_value", 4), ("", "blank", 4)]},
        {"q": 10, "prompt": "Solve 2x + 3 = 11", "key": "x = 4", "pool": [("x = 4", "correct", 54), ("x = 7", "inverse_operation", 18), ("x = 16", "inverse_operation", 6), ("4", "correct", 10), ("2x = 8", "not_solved", 8), ("", "blank", 4)]},
    ],
}

# ------------------------------------------------------------------ Science 7A
SCIENCE_NAMES = ['Aanya Kapoor', 'Ben Okafor', 'Chloe Martin', 'Dev Malhotra', 'Elif Yilmaz', 'Farhan Ali', 'Grace Lin', 'Harsh Vardhan',
                 'Ines Costa', 'Jai Prakash', 'Keira Walsh', 'Lakshmi Iyer', 'Mateo Ruiz', 'Nandini Rao', 'Oscar Brown', 'Priya Natarajan',
                 'Qasim Raza', 'Rhea Sen', 'Sipho Dlamini', 'Tanvi Shah', 'Uma Pillai', 'Vikram Bhat', 'Wen Zhou', 'Yusuf Demir']

SCIENCE = {
    "title": "Plants and water", "className": "Science 7A", "subject": "science", "grade_band": "7-9",
    "instructions": "Answer every question. Use full sentences for questions 6 and 7.",
    "questions": [
        {"q": 1, "prompt": "Which gas do plants take in to make food? A) oxygen B) carbon dioxide C) nitrogen D) hydrogen", "key": "B",
         "pool": [("B", "correct", 62), ("A", "wrong", 26), ("C", "wrong", 8), ("", "blank", 4)]},
        {"q": 2, "prompt": "True or false: plants get their food from the soil.", "key": "False",
         "pool": [("False", "correct", 58), ("True", "wrong", 38), ("", "blank", 4)]},
        {"q": 3, "prompt": "The green substance in leaves that traps light is called ...", "key": "chlorophyll",
         "pool": [("chlorophyll", "correct", 50), ("clorophyll", "spelling", 16), ("chlorophyl", "spelling", 8), ("chloroplast", "wrong_term", 18), ("", "blank", 8)]},
        {"q": 4, "prompt": "Water turning into water vapour is called ...", "key": "evaporation / evaporating",
         "pool": [("evaporation", "correct", 56), ("evaporating", "correct", 6), ("condensation", "wrong_term", 20), ("evaperation", "spelling", 10), ("melting", "wrong_term", 4), ("", "blank", 4)]},
        {"q": 5, "prompt": "At sea level, pure water boils at ...", "key": "100 °C",
         "pool": [("100 °C", "correct", 58), ("100", "missing_unit", 20), ("90 °C", "other", 8), ("0 °C", "other", 6), ("", "blank", 8)]},
        {"q": 6, "prompt": "Why do plants need light?", "key": "light gives the energy for photosynthesis; plants use it to make their own food (glucose)",
         "pool": [
             ("Plants use the energy from light to make their own food by photosynthesis.", [True, True], 22),
             ("Light gives plants energy for photosynthesis so they can make glucose.", [True, True], 10),
             ("They need light to make food.", [False, True], 16),
             ("So they can do photosynthesis.", [True, False], 12),
             ("Light helps them grow taller and greener.", [False, False], 12),
             ("Plants need light to get food from the soil.", [False, False], 10),
             ("To keep warm.", [False, False], 6),
             ("They need light so that they can make sugar in their leaves.", [False, True], 8),
             ("", "blank", 4)]},
        {"q": 7, "prompt": "A puddle disappears on a sunny day. Explain why.", "key": "the water evaporates (turns into water vapour); heat from the Sun gives it the energy (makes it faster)",
         "pool": [
             ("The water evaporates into water vapour because the Sun heats it up.", [True, True], 22),
             ("The heat from the sun makes the water turn into vapour and go into the air.", [True, True], 10),
             ("The water evaporates.", [True, False], 18),
             ("The sun dries it.", [False, True], 10),
             ("The water soaks into the ground.", [False, False], 14),
             ("It condenses into the clouds because it is hot.", [False, True], 8),
             ("The water goes away.", [False, False], 8),
             ("Because of evaporation, the warm sun turns the water into a gas.", [True, True], 6),
             ("", "blank", 4)]},
        {"q": 8, "prompt": "Which part of a plant takes in water? A) leaves B) flower C) roots D) stem", "key": "C",
         "pool": [("C", "correct", 72), ("A", "wrong", 16), ("D", "wrong", 8), ("", "blank", 4)]},
    ],
}

# ------------------------------------------------------------------ English 8C
ENGLISH_NAMES = ['Adaeze Nwosu', 'Bilal Hussain', 'Charlotte Evans', 'Daksh Arora', 'Esha Banerjee', 'Finn Murphy', 'Gauri Desai',
                 'Hamza Sheikh', 'Isla Campbell', 'Jiya Saxena', 'Karan Mehra', 'Lucia Rossi', 'Mihir Kulkarni', 'Noor Fatima',
                 'Omkar Patil', 'Pooja Venkat', 'Rafael Silva', 'Sneha Joseph']

EXTRACT = ("It had rained for three days. When Sam finally stepped outside, the lane had turned into a brown river. "
           "A small paper boat bobbed past his shoes, a name written on its side in careful letters. Upstairs, a window "
           "opened and a little girl looked down, close to tears. Sam rolled up his sleeves and waded in.")

PASSAGES = [  # (text, rubric reference scores: ideas /3, organisation /2, spelling and punctuation /2)
    ("The rain drummed on the tin roofs like a hundred tiny drums. Water rushed down the gutters and the streets shone like glass. "
     "People hurried past with umbrellas, and the smell of wet earth filled the air. By evening the clouds cleared and a pale rainbow appeared over the market.", [3, 2, 2]),
    ("It was a rainy day in my town. The roads were full of water and the cars splashed people. I stayed at home and read a book. "
     "In the afternoon the rain stopped and I went to play cricket with my friends.", [2, 2, 2]),
    ("Rain fell all morning. The puddles grew bigger and the frogs started to croak loudly near the pond. My mother made hot pakoras "
     "and we watched the lightning from the window. It was the best kind of lazy day.", [3, 2, 2]),
    ("on rainy day the street is wet. there is lot of water. the buses are late and people are angry. i dont like rainy days because i cant go out", [1, 1, 0]),
    ("The sky turned grey and heavy. Then the rain came down in sheets, so thick I could not see the shop across the road. "
     "Children ran out barefoot to sail paper boats while the old men sat under the bus stop shaking their heads.", [3, 2, 2]),
    ("Rainy days are good and bad. Good because it is cool. Bad because the roads flood. My school bus was late. We had a test. I got wet.", [1, 1, 2]),
    ("When it rains in my town the whole place changes. The dusty roads turn to mud, the trees look bright green again and "
     "the street dogs hide under parked cars. Everything sounds different, softer somehow.", [3, 2, 2]),
    ("It rained. I was in school. The class was dark so the teacher put lights on. After school my shoes got wet on the way home and my mum was cross.", [2, 2, 2]),
    ("The rain was falling very hard and the wind was blowing the trees and the electricity went off and we lit candles and "
     "my brother was scared of the thunder and then it stopped at night", [2, 1, 0]),
    ("Monsoon rain is heavy in my town. The drains overflow and the water comes up to our knees. Shops close early. "
     "But the air smells fresh and the hills behind the town disappear in the mist.", [3, 2, 2]),
    ("i like rain. its nice. the end.", [0, 0, 0]),
    ("A rainy day in my town starts with the sound of thunder. Next the rain begins, slowly at first and then faster. "
     "Finally the streets empty and only the vegetable sellers stay, covering their carts with blue plastic.", [2, 2, 2]),
    ("Their was alot of rain yesterday. The road infront of my house was flooded and a car got stuck. "
     "Some men came and pushed it out. Everyone was soaking wet but they where laughing.", [2, 2, 0]),
    ("The rain made the town quiet. Umbrellas bloomed like flowers along the pavement, red, yellow and black. "
     "A cat sat in a shop doorway, watching the drops with great suspicion.", [3, 2, 2]),
    ("Its raining. The weather is bad. I am bored. My phone is not working. I hate rain.", [1, 1, 1]),
    ("In my town, rainy days mean chai and stories. My grandmother tells us about the great flood of her childhood "
     "while the rain hammers the windows. Outside, the street becomes a river and the frogs sing.", [3, 2, 2]),
    ("It was raining so we couldnt go out. We played carrom inside. Then the power went out. We ate dinner by candle light. It was fun.", [2, 2, 1]),
    ("The clouds were black. Then rain. Lots of rain. Water everywhere in the streets, in the shops, in my shoes.", [2, 1, 2]),
]

ENGLISH = {
    "title": "Reading and writing check", "className": "English 8C", "subject": "english", "grade_band": "7-9",
    "instructions": "Read the extract, then answer the questions.", "extract": EXTRACT,
    "questions": [
        {"q": 1, "prompt": "Write the correct spelling of 'neccessary'.", "key": "necessary", "spellingCounts": True,
         "pool": [("necessary", "correct", 50), ("neccessary", "spelling", 22), ("necesary", "spelling", 16), ("nesessary", "spelling", 8), ("", "blank", 4)]},
        {"q": 2, "prompt": "Write the correct spelling of 'begining'.", "key": "beginning", "spellingCounts": True,
         "pool": [("beginning", "correct", 56), ("begining", "spelling", 26), ("beggining", "spelling", 14), ("", "blank", 4)]},
        {"q": 3, "prompt": "Yesterday we ... (go) to the market.", "key": "went",
         "pool": [("went", "correct", 70), ("goed", "wrong_term", 14), ("gone", "wrong_term", 10), ("", "blank", 6)]},
        {"q": 4, "prompt": "She has ... (write) three letters.", "key": "written",
         "pool": [("written", "correct", 60), ("wrote", "wrong_term", 26), ("writed", "wrong_term", 8), ("", "blank", 6)]},
        {"q": 5, "prompt": "In the extract, 'bobbed' means: A) sank B) floated up and down C) flew D) broke", "key": "B",
         "pool": [("B", "correct", 66), ("A", "wrong", 22), ("D", "wrong", 8), ("", "blank", 4)]},
        {"q": 6, "prompt": "Why did Sam wade into the water? Give two details from the extract.", "key": "to get the paper boat back; the little girl upstairs was close to tears (it was her boat)",
         "pool": [
             ("He wanted to get the paper boat back because the girl upstairs was about to cry.", [True, True], 26),
             ("The little girl was close to tears so he went to fetch her boat.", [True, True], 12),
             ("To get the boat.", [True, False], 18),
             ("Because the girl was sad.", [False, True], 12),
             ("Because he likes playing in water.", [False, False], 12),
             ("The lane was a river and he wanted to swim.", [False, False], 8),
             ("He saw a name on the boat and wanted to give it back to its owner.", [True, False], 8),
             ("", "blank", 4)]},
        {"q": 7, "prompt": "Describe a rainy day in your town in 4 to 6 sentences.", "key": "Rubric: Ideas and description 3; Organisation 2; Spelling and punctuation 2",
         "passage": True},
    ],
}


def pick(pool, rng):
    total = sum(w for *_, w in pool)
    r = rng.uniform(0, total)
    for item in pool:
        r -= item[-1]
        if r <= 0:
            return item
    return pool[-1]


def build(cls, names, prefix, seed):
    rng = random.Random(seed)
    students = []
    passages = PASSAGES[:]
    rng.shuffle(passages)
    # a few pupils are strong and a few struggle: bias their picks
    for i, name in enumerate(names):
        strength = rng.random()
        answers = []
        for q in cls["questions"]:
            if q.get("passage"):
                text, ref = passages[i % len(passages)]
                answers.append({"q": q["q"], "written": text, "label": "passage", "ref": ref, "crossedOut": ""})
                continue
            pool = q["pool"]
            if strength > 0.8:  # strong pupils mostly pick the first (full-credit) answer
                item = pool[0] if rng.random() < 0.75 else pick(pool, rng)
            else:
                item = pick(pool, rng)
            written, label = item[0], item[1]
            a = {"q": q["q"], "written": written, "crossedOut": ""}
            if isinstance(label, list):
                a["label"] = "open"
                a["ref"] = label  # key points met, by the author's reading
            else:
                a["label"] = label
            # a little crossed-out work on short numeric answers
            if written and not isinstance(label, list) and len(written) < 8 and rng.random() < 0.06 and label != "blank":
                alt = [p[0] for p in pool if p[0] and p[0] != written]
                if alt:
                    a["crossedOut"] = rng.choice(alt)
            answers.append(a)
        students.append({"id": f"{prefix}{i + 1:02d}", "name": name, "answers": answers})
    quiz = {k: v for k, v in cls.items() if k != "questions"}
    quiz["questions"] = [{k: v for k, v in q.items() if k != "pool"} for q in cls["questions"]]
    return {"quiz": quiz, "students": students, "note": "Synthetic, fictional students. Ground truth for a Tickmark sample class.", "generated": "2026-11-16"}


if __name__ == "__main__":
    for key, cls, names, prefix, seed in [("maths", MATHS, MATHS_NAMES, "m", 61), ("science", SCIENCE, SCIENCE_NAMES, "c", 72), ("english", ENGLISH, ENGLISH_NAMES, "e", 83)]:
        m = build(cls, names, prefix, seed)
        d = OUT / key
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf8")
        from collections import Counter
        c = Counter(a["label"] for s in m["students"] for a in s["answers"])
        print(key, len(m["students"]), "students", dict(c))
