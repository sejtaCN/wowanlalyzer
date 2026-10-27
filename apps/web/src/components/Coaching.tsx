import coaching from '../../../../content/coaching/general.json';
import { Gloss } from './Gloss';

export interface CoachItem {
  n: number;
  title: string;
  why: string;
  evidence: string[];
  do: string;
}

export interface CoachingDoc {
  id: string;
  title: string;
  subtitle: string;
  hero: string;
  items: CoachItem[];
}

export const COACHING = coaching as unknown as CoachingDoc;

const PRIORITY = ['必修', '必修', '必修', '建议', '建议', '可选'];

export function CoachingCards({ limit }: { limit?: number }) {
  const items = limit ? COACHING.items.slice(0, limit) : COACHING.items;
  return (
    <div className="coach">
      {items.map((it, i) => (
        <article className="coachcard" key={it.n}>
          <div className="num">{it.n}</div>
          <div>
            <div className="chead">
              <h3>{it.title}</h3>
              <span className={`prio ${PRIORITY[i] ?? '建议'}`}>{PRIORITY[i] ?? '建议'}</span>
            </div>
            <div className="do">
              <span className="dolabel">怎么做</span>
              <Gloss text={it.do} />
            </div>
            <div className="why"><Gloss text={it.why} /></div>
            <div className="evidence-row">
              {it.evidence.map((e) => (
                <span className="chip" key={e}>{e}</span>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
