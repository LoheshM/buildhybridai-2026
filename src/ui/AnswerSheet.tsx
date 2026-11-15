// The printable Tickmark answer sheet. Drawn in millimetres from the same layout() the reader uses,
// so the boxes Tickmark cuts out of a photo are exactly the boxes on the paper.
import { parseQuantity } from '../marking/numeric';
import { keyCore } from '../marking/qtypes';
import type { CSSProperties } from 'react';
import { typeOf } from '../marking/mark';
import { layout, MARKER, markerCentres } from '../img/sheet';
import type { QuizRec } from '../store/db';

const mm = (v: number) => `${v}mm`;

export function AnswerSheet({ quiz, className }: { quiz: QuizRec; className?: string }) {
  let boxes;
  try { boxes = layout(quiz.keys); } catch (e) { return <section className="print-only printable-quiz"><p>{(e as Error).message}</p></section>; }
  const abs = (x: number, y: number, w?: number, h?: number): CSSProperties => ({ position: 'absolute', left: mm(x), top: mm(y), ...(w ? { width: mm(w) } : {}), ...(h ? { height: mm(h) } : {}) });
  return (
    <section className="print-only printable-quiz answer-sheet" aria-hidden="true">
      {markerCentres().map(([x, y], i) => <div key={i} style={{ ...abs(x - MARKER.size / 2, y - MARKER.size / 2, MARKER.size, MARKER.size), background: '#000' }} />)}
      <div style={{ ...abs(28, 14, 150), font: '700 5.2mm/1.2 Arial, sans-serif' }}>{quiz.title}</div>
      <div style={{ ...abs(28, 21, 85), font: '3.4mm/1.3 Arial, sans-serif', color: '#333' }}>{className ? `${className} · ` : ''}Tickmark answer sheet · {quiz.keys.length} answers</div>
      <div style={{ ...abs(28, 28, 70), font: '3mm/1.3 Arial, sans-serif', color: '#555' }}>Write each answer in its box. Keep the four black squares in the photo.</div>
      {boxes.map((b) => (
        <div key={b.q}>
          <div style={{ ...abs(b.q === 0 ? b.x - 14 : b.x - 7, b.y + 1.5), font: `700 ${b.q === 0 ? 3.4 : 4.2}mm/1 Arial, sans-serif` }}>{b.q === 0 ? 'Name' : b.q}</div>
          <div style={{ ...abs(b.x, b.y, b.w, b.h), border: '0.4mm solid #222', borderRadius: '1mm', boxSizing: 'border-box',
            backgroundImage: b.lines > 1 ? 'repeating-linear-gradient(transparent 0 8.6mm, #cfcfcf 8.6mm 9mm)' : undefined, backgroundPosition: '0 2mm' }} />
          {b.q > 0 && b.lines === 1 && <div style={{ ...abs(b.x + b.w - 30, b.y + b.h + 0.3), font: '2.4mm/1 Arial, sans-serif', color: '#777', width: mm(30), textAlign: 'right' }}>{hintFor(quiz, b.q)}</div>}
        </div>
      ))}
    </section>
  );
}

function hintFor(quiz: QuizRec, q: number) {
  const k = quiz.keys.find((x) => x.q === q);
  const t = k ? typeOf(k) : 'word';
  return t === 'choice' ? 'letter or True/False' : t === 'fraction' ? 'fraction' : t === 'number' ? (parseQuantity(keyCore(k!.answer))?.unit ? 'number and unit' : parseQuantity(keyCore(k!.answer))?.percent ? 'number and %' : 'number') : t === 'algebra' ? 'x = …' : '';
}
