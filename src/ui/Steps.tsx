import { href } from '../app/router';

const STEPS = [['scan', 'Read sheets'], ['check', 'Check flags'], ['results', 'Results'], ['reteach', 'Plan lesson']] as const;
export type Step = (typeof STEPS)[number][0];

/** The four steps of a quiz, shown above every quiz page so the flow reads as one product. */
export function Steps({ quizId, at, className }: { quizId: string; at: Step; className?: string }) {
  return (
    <nav aria-label="Quiz steps">
      {className && <a className="eyebrow" href={href.home()}>{className}</a>}
      <ol className="steps">
        {STEPS.map(([k, label], i) => (
          <li key={k} aria-current={k === at ? 'step' : undefined}>
            <a href={href[k](quizId)}><span>{i + 1}</span>{label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
