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
import l202 from '../../../../content/chapters/l2-02-ruby-life-pools.json';
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
import rubyWavesJson from '../../../../content/routes/waves-ruby-life-pools.json';
import adjacentJson from '../../../../content/analysis/adjacent-archon.json';
import eventsJson from '../../../../content/logs/xiaohuasheng-events.json';
import phasesJson from '../../../../content/logs/xiaohuasheng-phases.json';
import dukkieEventsJson from '../../../../content/logs/dukkie-ruby-life-pools-events.json';
import dukkiePhasesJson from '../../../../content/logs/dukkie-ruby-life-pools-phases.json';
import altarEventsJson from '../../../../content/logs/archon-altar-of-fangs-events.json';
import altarPhasesJson from '../../../../content/logs/archon-altar-of-fangs-phases.json';
import numericSummaryJson from '../../../../content/sims/numeric-summary.json';
import simulatedTimelinesJson from '../../../../content/analysis/simulated-timelines-archon.json';

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
  profileId: string | null;
  profileFile: string | null;
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
  /** 人工口语版条件（condition-human.json 合并进来） */
  conditionHuman?: string | null;
  conditionZh: string;
  conditionGroups?: string[];
  targetSelectRaw: string;
  targetSelectZh: string;
  enabled: boolean;
  /** 本构建用不上的行：kind 是原因分类，evidence 是施放次数来源 */
  dead?: { kind: string; reason: string; evidence: string } | null;
}

export interface PrioritySection {
  key: string;
  label: string;
  rows: PriorityRow[];
}

interface PriorityTableDoc {
  source: string;
  hero: string;
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
  npcIds?: number[];
  unitForces?: number[];
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
  scenarioId: string | null;
  isBoss: boolean;
  trashMobCount?: number;
  /** BOSS 与同波小怪无法用木桩复原，只能按全场目标数近似；有值即表示差值来自近似档。 */
  approximation?: {
    kind: 'desired-targets';
    actualMobs: number;
    bossCount: number;
    trashMobCount: number;
    simulatedTargets: number;
  } | null;
  classification?: 'boss' | 'trash';
  phase?: string;
  encounter?: string | null;
  enemyIds?: number[];
  enemyPositions?: Array<{ id: number; x: number; y: number }>;
  burst: {
    deltaPct: number;
    deltaDamage: number;
    dur: number;
    targets: number;
  } | null;
  sourcePull?: number;
}

export interface RouteDoc {
  dungeon: string;
  route: string;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  pulls: number;
  totalMobs: number;
  totalForces?: number;
  requiredForces?: number;
  routePublicKey?: string | null;
  mappingVersion?: number;
  mdtMappingHash?: string | null;
  mdtAddonVersion?: number | null;
  mapScope?: string | null;
  mapProjection?: {
    width: number;
    height: number;
    zoom: number;
    pixelsPerWorldUnit: number;
  };
  routePaths?: Array<Array<{ lat: number; lng: number; floor_id?: number }>>;
  statExamples?: Array<{
    scenario: string;
    targets: number;
    stat: string;
    rating: number;
    gainPct: number;
  }>;
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
  deltaCiPct: number | null;
  beyondCi: boolean | null;
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
  /** 与固定测试基线比较，仅供校核；页面改用相对全零基准。 */
  gainVsCurrentPct: number;
  gainVsCurrentDps: number;
}

export interface StatScenario {
  budget: number;
  /** 内部复现用的固定测试基线；页面不把它当玩家当前面板展示。 */
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
  fromAbs?: number;
  spanSec?: number;
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
  sourceUrl?: string;
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

export interface SimulatedTimelinePhase {
  index: number;
  label: string;
  from: number;
  to: number;
  actions: number;
  dot: number;
  filler: number;
  burst: number;
  item: number;
  byAction: Array<{ t: number; name: string }>;
}

export interface SimulatedTimeline {
  key: string;
  label: string;
  scenarioId: string;
  runId: string;
  durationSec: number;
  phases: SimulatedTimelinePhase[];
  decision: string;
  evidence: string;
}

export interface SimulatedTimelinesDoc {
  schemaVersion: number;
  generatedAt: string;
  hero: string;
  profile: string;
  source: string;
  method: string;
  timelines: SimulatedTimeline[];
}

const rawChapters = [l001, l002, l003, l004, l101, l102, l103, l104, l105, l106, l201, l202];
const numericSummary = numericSummaryJson as NumericSummary;
const skills = (skillsJson as SkillsDoc).skills;
const priorityTable = priorityTableJson as PriorityTableDoc;
const playBudget = playBudgetJson as unknown as PlayBudgetDoc;
const events = eventsJson as unknown as LogDoc;
const phases = phasesJson as unknown as PhasesDoc;
const dukkieEvents = dukkieEventsJson as unknown as LogDoc;
const dukkiePhases = dukkiePhasesJson as unknown as PhasesDoc;
const altarEvents = altarEventsJson as unknown as LogDoc;
const altarPhases = altarPhasesJson as unknown as PhasesDoc;

export const CHAPTERS = rawChapters as unknown as Chapter[];
export const FIGURES = (figuresJson as unknown as FiguresDoc).chapters;
/**
 * 路线注册表：新增副本 = 往 content/routes/ 放 `waves-<slug>.json`，再在这里加一行。
 * key 用章节 `map.dungeon` 的 slug（如 `altar_of_fangs`），不要用路线文件里的显示名。
 */
const ROUTE_DOCS: Record<string, RouteDoc> = {
  altar_of_fangs: altarWavesJson as unknown as RouteDoc,
  ruby_life_pools: rubyWavesJson as unknown as RouteDoc,
};

/** L1 通用模型借路线举例时的默认副本；换样本只改这一处。 */
const EXAMPLE_DUNGEON = 'altar_of_fangs';

export interface AdjacentGroup {
  id: string;
  label: string;
  why: string;
  tableOrder: number[];
  verdict: 'effective' | 'structurally_inert' | 'within_noise' | 'inconsistent' | 'undetermined';
  deltaPct: number | null;
  structuralNote?: string | null;
  guideMatch?: string;
}

/** 相邻两行交换 A/B 的汇总（只读跑批产物；明细与 runId 在 content/analysis/adjacent-archon.json）。 */
export const ADJACENT = adjacentJson as unknown as { hero: string; groups: AdjacentGroup[] };

export const ROUTE_DUNGEONS = Object.keys(ROUTE_DOCS).sort();

export function routeFor(dungeon: string | null | undefined): RouteDoc | null {
  return dungeon ? ROUTE_DOCS[dungeon] ?? null : null;
}

/**
 * 章节绑定的路线。L2 只认自己副本，缺数据返回 null——绝不拿别的副本来顶，
 * 否则第二个副本的页面会显示祭牙的波次、怪数和来源链接。
 */
export function chapterRoute(chapter: Chapter): RouteDoc | null {
  if (chapter.level === 'L2') return routeFor(chapter.map?.dungeon);
  return routeFor(chapter.map?.dungeon) ?? routeFor(EXAMPLE_DUNGEON);
}

/** 首页状态条用：已登记路线的条数、波数与怪数合计。 */
export const ROUTE_SUMMARY = Object.values(ROUTE_DOCS).reduce(
  (acc, route) => ({ routes: acc.routes + 1, pulls: acc.pulls + route.pulls, mobs: acc.mobs + route.totalMobs }),
  { routes: 0, pulls: 0, mobs: 0 },
);
export const INTERACTIONS = interactionsJson as unknown as InteractionsDoc;
const RAW_LEVERAGE = leverageJson as unknown as LeverageDoc;
export const SHARE = shareJson as unknown as ShareDoc;
export const GEARING = gearingJson as unknown as GearingDoc;
export const STAT_OPT = statOptJson as unknown as StatOptDoc;
export const COOLDOWN_WINDOW = cooldownWindowJson as unknown as CooldownWindowDoc;
export const SOURCES_SUMMARY = sourcesSummaryJson as SourcesSummary;
export const CROSSCHECK = crosscheckJson as unknown as CrosscheckDoc;
const simulatedTimelines = simulatedTimelinesJson as unknown as SimulatedTimelinesDoc;
const TIMELINES = new Map(simulatedTimelines.timelines.map((timeline) => [timeline.key, timeline]));

const RUNS = Object.values(numericSummary.runs);
const RUN_BY_ID = new Map(RUNS.map((run) => [run.runId, run]));
const LOGS = new Map<string, LogDoc>([
  [events.runId, events],
  [dukkieEvents.runId, dukkieEvents],
  [altarEvents.runId, altarEvents],
]);
const PHASES = new Map<string, PhasesDoc>([
  [phases.runId, phases],
  [dukkiePhases.runId, dukkiePhases],
  [altarPhases.runId, altarPhases],
]);

export const ARCHON_PROFILE_ID = 'archon';

/** 当前站点只开放 Archon；旧记录只有 hero 时仍可识别，两者都没有则拒绝猜测。 */
function isArchonRun(run: SimRun): boolean {
  return run.profileId === ARCHON_PROFILE_ID ||
    (!run.profileId && run.hero === ARCHON_PROFILE_ID);
}

export function allRuns(specId = 'shadow-priest', heroId = ARCHON_PROFILE_ID): SimRun[] {
  if (specId === 'shadow-priest' && heroId === ARCHON_PROFILE_ID) {
    return RUNS.filter(isArchonRun);
  }
  return [];
}

export function getRun(runId: string | null | undefined, heroId = ARCHON_PROFILE_ID): SimRun | null {
  const run = runId ? RUN_BY_ID.get(runId) ?? null : null;
  return run && heroId === ARCHON_PROFILE_ID && isArchonRun(run) ? run : null;
}

/**
 * 差值的保守误差上限：先把两边的 95% CI 换成绝对 DPS，再相加，
 * 最后相对 off / baseline 的 DPS 转成百分比。任一 CI 缺失、为 0 或非有限值就不出结论。
 */
export function conservativeDeltaCiPct(
  on: Pick<SimRun, 'dps' | 'ci95Pct'>,
  off: Pick<SimRun, 'dps' | 'ci95Pct'>,
): number | null {
  if (
    !Number.isFinite(on.dps) || !Number.isFinite(off.dps) || off.dps <= 0 ||
    on.ci95Pct == null || off.ci95Pct == null ||
    !Number.isFinite(on.ci95Pct) || !Number.isFinite(off.ci95Pct) ||
    on.ci95Pct <= 0 || off.ci95Pct <= 0
  ) return null;
  const ciOnAbs = on.dps * on.ci95Pct / 100;
  const ciOffAbs = off.dps * off.ci95Pct / 100;
  return (ciOnAbs + ciOffAbs) / off.dps * 100;
}

/** 只有同模型、同运行元数据的两条记录才能配对；缺字段不等于“相同”。 */
export function isComparableRunPair(on: SimRun, off: SimRun): boolean {
  const positive = (value: number | null): value is number => value != null && Number.isFinite(value) && value > 0;
  return Boolean(
    on.scenarioId && on.scenarioId === off.scenarioId &&
    on.profileId && on.profileId === off.profileId &&
    on.simc?.version && on.simc.version === off.simc?.version &&
    on.simc.commit && on.simc.commit === off.simc?.commit &&
    positive(on.samples) && on.samples === off.samples &&
    positive(on.durationSec) && on.durationSec === off.durationSec &&
    positive(on.targets) && on.targets === off.targets
  );
}

export function burstPairFromRuns(on: SimRun, off: SimRun): BurstPair | null {
  const ciPct = conservativeDeltaCiPct(on, off);
  if (!isComparableRunPair(on, off) || ciPct == null || on.durationSec == null) return null;
  return {
    on,
    off,
    label: on.label ?? on.scenarioId ?? '未命名场景',
    deltaDamage: (on.dps - off.dps) * on.durationSec,
    deltaPct: ((on.dps - off.dps) / off.dps) * 100,
    ciPct,
  };
}

export const LEVERAGE: LeverageDoc = {
  ...RAW_LEVERAGE,
  rows: RAW_LEVERAGE.rows.map((row) => {
    const variant = getRun(row.runId);
    const baseline = getRun(`lev_base__${row.scenarioId}__${RAW_LEVERAGE.iterations}`);
    const deltaCiPct = variant && baseline ? conservativeDeltaCiPct(variant, baseline) : null;
    return {
      ...row,
      deltaCiPct,
      beyondCi: deltaCiPct == null ? null : Math.abs(row.deltaPct) > deltaCiPct,
    };
  }),
};

export function getLog(logId: string): LogDoc | null {
  return LOGS.get(logId) ?? null;
}

export function getPhases(logId: string): PhasesDoc | null {
  return PHASES.get(logId) ?? null;
}

export function getSimulatedTimeline(key: string): SimulatedTimeline | null {
  return TIMELINES.get(key) ?? null;
}

export function chaptersFor(specId: string, heroId = ARCHON_PROFILE_ID): Chapter[] {
  return specId === 'shadow-priest' && heroId === ARCHON_PROFILE_ID ? CHAPTERS : [];
}

/**
 * 把 chart.evidence 中列出的开 / 不开 runId 配成图所需的 pair。
 * 两个 runId 必须被显式列出，并通过全部模型元数据与 CI 检查。
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
    const pair = on && off ? burstPairFromRuns(on, off) : null;
    if (pair) pairs.push(pair);
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

/**
 * APL 段（actions.main / actions.cds / …）的读者标签。
 * 页面不许直接把段键印出来——那是机器标识，不是栏目名。
 */
export function sectionLabel(key: string): string {
  return priorityTable.sections.find((section) => section.key === key)?.label ?? key;
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
