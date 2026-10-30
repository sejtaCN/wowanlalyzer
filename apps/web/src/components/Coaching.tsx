import coaching from '../../../../content/coaching/general.json';
import sampleAudit from '../../../../content/coaching/dukkie-sample-audit.json';
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

interface CoachAuditItem {
  n: number;
  state: 'pass' | 'review' | 'info';
  label: string;
  detail: string;
}

interface CoachAuditDoc {
  id: string;
  label: string;
  note: string;
  items: CoachAuditItem[];
}

export const COACHING = coaching as unknown as CoachingDoc;
export const COACHING_AUDIT = sampleAudit as unknown as CoachAuditDoc;

const PRIORITY = ['必修', '必修', '必修', '建议', '建议', '可选'];

export function CoachingCards({ limit }: { limit?: number }) {
  const items = limit ? COACHING.items.slice(0, limit) : COACHING.items;
  const auditFor = new Map(COACHING_AUDIT.items.map((item) => [item.n, item]));
  return (
    <div className="coach-wrap">
      <div className="coach-audit">
        <b>样本自检 · {COACHING_AUDIT.label}</b>
        <span>{COACHING_AUDIT.note}</span>
      </div>
      <div className="coach">
        {items.map((it, i) => {
          const audit = auditFor.get(it.n);
          return (
            <article className={`coachcard${audit?.state === 'review' ? ' needs-review' : ''}`} key={it.n}>
              <div className="num">{it.n}</div>
              <div>
                <div className="chead">
                  <h3>{it.title}</h3>
                  <span className={`prio ${PRIORITY[i] ?? '建议'}`}>{PRIORITY[i] ?? '建议'}</span>
                  {audit ? <span className={`coach-audit-badge ${audit.state}`}>{audit.label}</span> : null}
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
                {audit ? <div className="coach-audit-note">{audit.detail}</div> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
