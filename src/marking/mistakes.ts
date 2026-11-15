// The fixed list of mistake names, for every question type. Class totals may carry only these
// ids (plus "other"), so the cloud never sees a free-text description of a student's answer.
import { MISCONCEPTIONS } from './misconceptions';

export const MISTAKES = {
  ...MISCONCEPTIONS,
  // numbers, decimals, units
  sign_error: { label: 'Sign error', teacher: 'Right size, wrong sign (for example 12 for -12, or -4 for 4).' },
  place_value: { label: 'Place value', teacher: 'Off by a power of ten: the decimal point moved (7.5 for 0.75).' },
  percent_decimal: { label: 'Percentage and decimal mixed up', teacher: 'Wrote 0.45 for 45%, or 45 for 0.45.' },
  rounding: { label: 'Rounding', teacher: 'Close to the answer, but rounded to a different number of places.' },
  wrong_unit: { label: 'Wrong unit', teacher: 'Right number with the wrong unit, or forgot to convert between units.' },
  missing_unit: { label: 'Missing unit', teacher: 'Right number, no unit written.' },
  copied_question: { label: 'Copied the question', teacher: 'Wrote the number or expression from the question instead of the form it asked for (3.5 cm for "write 3.5 cm in mm").' },
  unsimplified: { label: 'Did not simplify', teacher: 'Right value, not in simplest form (2/4 for 1/2).' },
  decimal_alignment: { label: 'Lined up the digits, not the decimal points', teacher: 'Added or subtracted decimals with the digits aligned on the right (0.6 + 0.25 = 0.31).' },
  // algebra
  inverse_operation: { label: 'Undid with the wrong operation', teacher: 'Added instead of subtracting (or multiplied instead of dividing) to undo a step.' },
  not_solved: { label: 'Did not finish solving', teacher: 'Left an expression or an equation instead of a value.' },
  // words
  spelling: { label: 'Spelling', teacher: 'Close to the right word, misspelt.' },
  wrong_term: { label: 'Wrong term', teacher: 'A different word from the one the key accepts.' },
  // short answers (key points) and paragraphs (rubric); numbered to match the teacher's key
  missing_point_1: { label: 'Missed key point 1', teacher: 'Did not state the first key point.' },
  missing_point_2: { label: 'Missed key point 2', teacher: 'Did not state the second key point.' },
  missing_point_3: { label: 'Missed key point 3', teacher: 'Did not state the third key point.' },
  missing_point_4: { label: 'Missed key point 4', teacher: 'Did not state the fourth key point.' },
  missing_point_5: { label: 'Missed key point 5', teacher: 'Did not state the fifth key point.' },
  missing_point_6: { label: 'Missed key point 6', teacher: 'Did not state the sixth key point.' },
  contradicts: { label: 'Misconception', teacher: 'Says something the key contradicts.' },
  off_topic: { label: 'Off topic', teacher: 'Does not answer the question asked.' },
  rubric_low_1: { label: 'Low on rubric line 1', teacher: 'Scored half or less on the first rubric line.' },
  rubric_low_2: { label: 'Low on rubric line 2', teacher: 'Scored half or less on the second rubric line.' },
  rubric_low_3: { label: 'Low on rubric line 3', teacher: 'Scored half or less on the third rubric line.' },
  rubric_low_4: { label: 'Low on rubric line 4', teacher: 'Scored half or less on the fourth rubric line.' },
} as const;

export type MistakeId = keyof typeof MISTAKES;
export const isMistake = (x: string): x is MistakeId => x in MISTAKES;

/** Label for a mistake id, with the teacher's own key point or rubric line when there is one. */
export function mistakeLabel(id: string, keyPoints: string[] = [], rubric: string[] = []): string {
  const kp = id.match(/^missing_point_(\d)$/);
  if (kp && keyPoints[Number(kp[1]) - 1]) return `Missed “${keyPoints[Number(kp[1]) - 1]}”`;
  const rl = id.match(/^rubric_low_(\d)$/);
  if (rl && rubric[Number(rl[1]) - 1]) return `Low on “${rubric[Number(rl[1]) - 1]}”`;
  if (id === 'other') return 'Other wrong answers';
  return isMistake(id) ? MISTAKES[id].label : id;
}
