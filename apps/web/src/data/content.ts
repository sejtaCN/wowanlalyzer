/**
 * 前端内容适配层。
 *
 * content 下的 JSON 是唯一真源；这里只负责导入、建立索引和提供查询，
 * 不复制模拟数值，也不在代码里另写一套业务内容。
 */
import type { Chapter } from '@learn';

import l001 from '../../../../content/chapters/l0-01-what-shadow-does.json';
import l002 from '../../../../content/chapters/l0-02-skill-list.json';
import l003 from '../../../../content/chapters/l0-03-priority-table.json';
import l004 from '../../../../content/chapters/l0-04-cooldowns.json';
import l101 from '../../../../content/chapters/l1-01-mid.json';
import l102 from '../../../../content/chapters/l1-02-large.json';
import l103 from '../../../../content/chapters/l1-03-small.json';
import l104 from '../../../../content/chapters/l1-04-boss.json';
import l105 from '../../../../content/chapters/l1-05-rhythm.json';
import l106 from '../../../../content/chapters/l1-06-adds.json';
import l201 from '../../../../content/chapters/l2-01-altar-of-fangs.json';
import figuresJson from '../../../../content/figures/chapters.json';
import interactionsJson from '../../../../content/analysis/interactions.json';
import leverageJson from '../../../../content/analysis/leverage-archon.json';
import shareJson from '../../../../content/analysis/ability-share-archon.json';
import gearingJson from '../../../../content/analysis/gearing-archon.json';
import statOptJson from '../../../../content/analysis/stat-opt-archon.json';
import playBudgetJson from '../../../../content/analysis/play-budget-archon.json';
import cooldownWindowJson from '../../../../content/analysis/cooldown-window-archon.json';
import priorityTableJson from '../../../../content/guides/priority-table.json';
import skillsJson from '../../../../content/guides/skills.json';
import crosscheckJson from '../../../../content/guides/crosscheck-archon.json';
import sourcesSummaryJson from '../../../../content/guides/sources-summary.json';
import altarWavesJson from '../../../../content/routes/waves-altar-of-fangs.json';
import eventsJson from '../../../../content/logs/xiaohuasheng-events.json';
import phasesJson from '../../../../content/logs/xiaohuasheng-phases.json';
import numericSummaryJson from '../../../../content/sims/numeric-summary.json';

export interface SimcRef {
  version: string;
  commit: string;
  hero?: string | null;
}

export interface SimRun {
  runId: string;
  scenarioId: string | null;
  label: string | null;
  dps: number;
  ci95Pct: number | null;
  samples: number | null;
  durationSec: number | null;
  targets: number | null;
  kind: string | null;
  hero: string | null;
  simc: SimcRef | null;
}

interface NumericSummary {
  generatedAt: string;
  runs: Record<string, SimRun>;
}

export interface BurstPair {
  on: SimRun;
  off: SimRun;
  label: string;
  deltaDamage: number;
  deltaPct: number;
  ciPct: number;
}

export interface PriorityRow {
  section: string;
  sectionLabel: string;
  order: number;
  skill: string;
  conditionRaw: string;
  conditionZh: string;
  conditionGroups?: string[];
  targetSelectRaw: string;
  targetSelectZh: string;
  enabled: boolean;
}

export interface PrioritySection {
  key: string;
  label: string;
  rows: PriorityRow[];
}

interface PriorityTableDoc {
  source: string;
  gameVersion: string;
  generatedAt: string;
  note: string;
  sections: PrioritySection[];
}

export interface SkillLabel {
  text: string;
  verified: boolean;
  key: string;
}

interface SkillEntry {
  zh: string | null;
  verified: boolean;
  zhSource?: string;
}

interface SkillsDoc {
  note: string;
  skills: Record<string, SkillEntry>;
}

export interface FigureBlock {
  section: number;
  kind: string;
  status: 'ready' | 'missing' | 'not-applicable';
  source: string;
  note?: string;
}

interface FiguresDoc {
  schemaVersion: number;
  updatedAt: string;
  chapters: Record<string, FigureBlock[]>;
}

export interface RouteMob {
  name: string;
  count: number;
}

export interface RouteWave {
  pull: number;
  killZoneId: number;
  mobs: RouteMob[];
  mobCount: number;
  dangerous: string[];
  skippable: number;
  forces: number;
  forcesPct: number;
  scenarioId: string;
  isBoss: boolean;
  burst: {
    deltaPct: number;
    deltaDamage: number;
    dur: number;
    targets: number;
  };
  sourcePull: number;
}

export interface RouteDoc {
  dungeon: string;
  route: string;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  pulls: number;
  totalMobs: number;
  waves: RouteWave[];
}

export interface InteractableNode {
  id: string;
  kind: string;
  zh: string | null;
  en: string;
}

export interface InteractionEdge {
  from: string;
  to: string;
  kind: string;
  label: string;
  weight?: number;
  evidence?: {
    line?: string;
    [key: string]: unknown;
  };
}

export interface InteractionsDoc {
  hero: string;
  profile: string;
  logId: string;
  method: string;
  counts: {
    apl: number;
    applies: number;
    burst: number;
    opener: number;
  };
  nodes: InteractableNode[];
  edges: InteractionEdge[];
  generatedAt: string;
}

export interface LeverageScenario {
  id: string;
  label: string;
  targets: number;
  maxTime: number;
}

export interface LeverageBaseline {
  mean: number;
  ci95: number;
  ci95Pct: number;
  samples: number;
}

export interface LeverageRow {
  runId: string;
  hero: string;
  skill: string;
  scenarioId: string;
  deltaPct: number;
  deltaCiPct: number;
  beyondCi: boolean;
}

export interface LeverageDoc {
  hero: string;
  iterations: number;
  scenarios: LeverageScenario[];
  baseline: Record<string, LeverageBaseline>;
  rows: LeverageRow[];
}

export interface ShareRow {
  spell: string;
  spellName: string;
  executes: number;
  damage: number;
  portion: number | null;
  sharePct: number;
}

export interface ShareScenario {
  label: string;
  targets: number;
  maxTime: number;
  dps: number;
  rows: ShareRow[];
}

export interface ShareDoc {
  hero: string;
  iterations: number;
  scenarios: Record<string, ShareScenario>;
}

export interface GearScenario {
  id: string;
  label: string;
  targets: number;
  maxTime: number;
}

export interface GearCell {
  runId: string;
  baseRunId?: string;
  dps?: number;
  deltaDps?: number;
  deltaPct: number;
}

export interface GearingDoc {
  hero: string;
  generatedAt: string;
  iterations: number;
  scenarios: GearScenario[];
  baseline: Record<string, { runId: string; dps: number; ci95Pct: number; samples: number }>;
  secondary: Array<{
    stat: string;
    label: string;
    perPointDps: Record<string, number>;
    perPct: Record<string, number>;
    ratingPerStep: number;
  }>;
  effects: Array<{
    id: string;
    label: string;
    kind: string;
    perScenario: Record<string, GearCell | undefined>;
  }>;
  control: {
    label: string;
    perScenario: Record<string, GearCell | undefined>;
    passed: boolean;
  };
  method: {
    secondary: string;
    effects: string;
    caveat: string;
  };
  notes: string[];
}

export interface StatPoint {
  rating: number;
  dps: number;
}

export interface StatOptimum {
  ratings: Record<string, number>;
  predictedDps: number;
  actualDps: number;
  runId: string;
  absErrorPct: number;
  gainVsCurrentPct: number;
  gainVsCurrentDps: number;
}

export interface StatScenario {
  budget: number;
  currentRatings: Record<string, number>;
  currentRunId: string;
  currentDps: number;
  zeroDps: number;
  reproduced: {
    runId: string;
    dps: number;
    gapPct: number;
    ok: boolean;
  };
  curves: Record<string, StatPoint[]>;
  optimum: StatOptimum;
}

export interface StatOptDoc {
  hero: string;
  generatedAt: string;
  iterations: number;
  budget: number;
  budgetNote: string;
  scenarios: GearScenario[];
  stats: Array<{ key: string; label: string }>;
  perScenario: Record<string, StatScenario | undefined>;
  method: {
    curves: string;
    optimize: string;
    validate: string;
  };
  caveats: string[];
}

export interface BudgetRole {
  key: string;
  label: string;
  count: number;
  share: number;
  skills: Record<string, number>;
}

export interface BudgetScenario {
  scenarioId: string;
  label: string;
  targets: number;
  durationSec: number;
  observedLastActionSec: number;
  runId: string;
  dps: {
    mean: number;
    ci95: number;
    ci95Pct: number;
    samples: number;
  };
  actionCount: number;
  gcdStarts: number;
  sameMomentExtras: number;
  medianStartGapSec: number;
  byRole: Record<'dot' | 'filler' | 'burst' | 'item', BudgetRole>;
  resource: {
    cap: number;
    start: number;
    end: number;
    min: number;
    max: number;
    samplesAtCap: number;
    spendEvents: number;
    gainEvents: number;
    observedGain: number;
    observedSpend: number;
    net: number;
  };
  series: Array<{ t: number; insanity: number; name: string }>;
}

interface PlayBudgetDoc {
  method: {
    summary: string;
    gcd: string;
    role: string;
    resource: string;
    limit: string;
  };
  scenarios: Record<string, BudgetScenario>;
}

export interface CooldownWindowDoc {
  cooldown: {
    observedMedianSec: number;
    observedMaxSec: number;
    samples: number[];
    sourceRuns: string[];
    note: string;
  };
  log: {
    runId: string;
    windows: number;
    gaps: number[];
    medianSec: number;
    minSec: number;
    maxSec: number;
    note: string;
  };
  returns: {
    big: {
      targets: number;
      deltaDamage: number;
      deltaPct: number;
      runIds: string[];
    };
    small: {
      targets: number;
      deltaDamage: number;
      deltaPct: number;
      runIds: string[];
    };
    sourceRuns: string[];
  };
  decision: {
    rule: string;
    observedCadenceExceedsCooldown: boolean;
    interpretation: string;
  };
  method: string;
  limitation: string;
}

export interface SourcesSummary {
  generatedAt: string;
  baseline: string;
  note: string;
  sources: Array<{
    id: string;
    name: string;
    url: string;
    version: string;
    type: string;
    capture: string;
    points: string[];
    feature: string;
    limit: string;
  }>;
  howWeUse: string;
}

export interface CrosscheckDoc {
  topic: string;
  generatedAt: string;
  baseline: string;
  sources: Array<{
    id: string;
    name: string;
    url: string;
    version: string;
    hero: string;
    type: string;
    capture: string;
  }>;
  agreements: Array<{
    point: string;
    sources: string[];
    detail: string;
  }>;
  divergences: Array<{
    id: string;
    point: string;
    method?: string;
    maxroll?: string;
    nga?: string;
    detail?: string;
    apl?: string;
    verdict?: string;
    status: string;
  }>;
}

export interface LogSegment {
  index: number;
  casts: number;
  castsPerMinute: number;
  gcdMedian: number;
  topCasts: Array<[string, number]>;
  burstWindows: Array<{
    buff: string;
    start: number;
    end: number;
  }>;
  dotUptime: Record<
    string,
    {
      bands: number;
      seconds: number;
      avgTargetsCovered: number;
      targetCount: number;
    }
  >;
}

export interface LogDoc {
  runId: string;
  source: string;
  label: string;
  sourceNote: string;
  segments: LogSegment[];
}

export interface Phase {
  index: number;
  kind: string;
  label: string;
  from: number;
  to: number;
  durationSec: number;
  families: Array<{ name: string; count: number }>;
  enemyCasts: number;
  allCasts: number;
  castsPerMinute: number;
  bursts: number;
  burstUptimeSec: number;
}

export interface PhasesDoc {
  runId: string;
  sourceLog: string;
  label: string;
  method: {
    summary: string;
    bucketSec: number;
    minPhaseSec: number;
    coWindowSec: number;
    cohorts: Record<string, string[]>;
  };
  limitation: string;
  totalSec: number;
  phases: Phase[];
  routeMatches: Record<
    string,
    Array<{
      pull: number;
      mobs: number;
      isBoss: boolean;
      jaccard: number;
    }>
  >;
}

const rawChapters = [l001, l002, l003, l004, l101, l102, l103, l104, l105, l106, l201];
const numericSummary = numericSummaryJson as NumericSummary;
const skills = (skillsJson as SkillsDoc).skills;
const priorityTable = priorityTableJson as PriorityTableDoc;
const playBudget = playBudgetJson as unknown as PlayBudgetDoc;
const events = eventsJson as unknown as LogDoc;
const phases = phasesJson as unknown as PhasesDoc;

export const CHAPTERS = rawChapters as unknown as Chapter[];
export const FIGURES = (figuresJson as unknown as FiguresDoc).chapters;
export const ALTAR_WAVES = altarWavesJson as unknown as RouteDoc;
export const INTERACTIONS = interactionsJson as unknown as InteractionsDoc;
export const LEVERAGE = leverageJson as unknown as LeverageDoc;
export const SHARE = shareJson as unknown as ShareDoc;
export const GEARING = gearingJson as unknown as GearingDoc;
export const STAT_OPT = statOptJson as unknown as StatOptDoc;
export const COOLDOWN_WINDOW = cooldownWindowJson as unknown as CooldownWindowDoc;
export const SOURCES_SUMMARY = sourcesSummaryJson as SourcesSummary;
export const CROSSCHECK = crosscheckJson as unknown as CrosscheckDoc;

const RUNS = Object.values(numericSummary.runs);
const RUN_BY_ID = new Map(RUNS.map((run) => [run.runId, run]));
const LOGS = new Map<string, LogDoc>([[events.runId, events]]);
const PHASES = new Map<string, PhasesDoc>([[phases.runId, phases]]);

export function allRuns(specId?: string): SimRun[] {
  if (!specId || specId === 'shadow-priest') return RUNS;
  return [];
}

export function getRun(runId: string | null | undefined): SimRun | null {
  return runId ? RUN_BY_ID.get(runId) ?? null : null;
}

export function getLog(logId: string): LogDoc | null {
  return LOGS.get(logId) ?? null;
}

export function getPhases(logId: string): PhasesDoc | null {
  return PHASES.get(logId) ?? null;
}

export function chaptersFor(specId: string): Chapter[] {
  return specId === 'shadow-priest' ? CHAPTERS : [];
}

/**
 * 把 chart.evidence 中列出的开 / 不开 runId 配成图所需的 pair。
 * 只返回两个 runId 都被显式列出、且 scenario 相同的配对。
 */
export function burstPairs(runIds: string[]): BurstPair[] {
  const scenarios = new Set(
    runIds
      .map((id) => getRun(id)?.scenarioId)
      .filter((id): id is string => Boolean(id)),
  );
  const pairs: BurstPair[] = [];

  for (const scenarioId of scenarios) {
    const onId = runIds.find((id) => id.startsWith(`dec_voidform_on_1__${scenarioId}__`));
    const offId = runIds.find((id) => id.startsWith(`dec_voidform_on_0__${scenarioId}__`));
    if (!onId || !offId) continue;
    const on = getRun(onId);
    const off = getRun(offId);
    if (!on || !off || on.durationSec == null) continue;
    pairs.push({
      on,
      off,
      label: on.label ?? scenarioId,
      deltaDamage: (on.dps - off.dps) * on.durationSec,
      deltaPct: ((on.dps - off.dps) / off.dps) * 100,
      ciPct: (on.ci95Pct ?? 0) + (off.ci95Pct ?? 0),
    });
  }

  return pairs.sort((a, b) => (a.on.targets ?? 0) - (b.on.targets ?? 0));
}

export function prioritySections(sections?: string[]): PrioritySection[] {
  if (!sections?.length) return priorityTable.sections;
  const wanted = new Set(sections);
  return priorityTable.sections.filter((section) => wanted.has(section.key));
}

export function skillName(skill: string): SkillLabel {
  const entry = skills[skill];
  return {
    text: entry?.zh || skill,
    verified: entry?.verified ?? false,
    key: skill,
  };
}

export function skillUsage(): Array<{ skill: string; count: number; sections: string[] }> {
  const usage = new Map<string, { skill: string; count: number; sections: Set<string> }>();
  for (const section of priorityTable.sections) {
    for (const row of section.rows) {
      const entry = usage.get(row.skill) ?? {
        skill: row.skill,
        count: 0,
        sections: new Set<string>(),
      };
      entry.count += 1;
      entry.sections.add(section.label);
      usage.set(row.skill, entry);
    }
  }
  return [...usage.values()]
    .map((entry) => ({ ...entry, sections: [...entry.sections] }))
    .sort((a, b) => b.count - a.count || skillName(a.skill).text.localeCompare(skillName(b.skill).text, 'zh-CN'));
}

export function shareFor(skill: string, scenarioId: string): ShareRow | null {
  return (SHARE as ShareDoc).scenarios[scenarioId]?.rows.find((row) => row.spell === skill) ?? null;
}

export function budgetFor(scenarioId: string | null | undefined): BudgetScenario | null {
  return scenarioId ? playBudget.scenarios[scenarioId] ?? null : null;
}
