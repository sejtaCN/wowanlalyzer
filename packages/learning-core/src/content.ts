/**
 * 内容模型：页面数据从 content/chapters/*.json 读，不在代码里硬写课程。
 *
 * 一条纪律：页面上每个百分比都必须能追到 runId（模拟）或事件时间戳（日志），
 * 否则构建期校验直接失败（scripts/validate-content.mjs）。
 */
/** ISO-8601 时间戳（字符串）。 */
type IsoDateTime = string;

export type ChapterLevel = 'L0' | 'L1' | 'L2';

/** 波次模型卡：一屏一眼看懂"这一波长什么样" */
export interface WaveModelCard {
  /** 目标数区间，如 "10–22" */
  targets: string;
  /** 存活时长（秒），来自假设，页面必须标注是假设 */
  durationSec: number;
  /** 移动/打断描述，如 "0–3s 移动" */
  movement: string;
  /** 危险点数量（需要打断/驱散/分散的机制） */
  dangers: number;
  /** 这一档波次在路线里的出现频次，如 "30/84 波" */
  frequency?: string;
  /** 判断方式：普通波次按目标数，BOSS / ADD 窗口有各自的判据 */
  kind?: 'wave' | 'boss' | 'adds' | 'rhythm';
}

/** 图的数据来源：只允许引用已存在的 runId */
export interface ChartSpec {
  kind: 'burst-bars' | 'priority-table' | 'skill-cards' | 'log-stats' | 'wave-table';
  title: string;
  /** burst-bars 用：要展示的 runId（每个都会去 content/sims 校验存在） */
  runIds?: string[];
  /** log-stats 用：日志 id（去 content/logs 校验存在） */
  logId?: string;
  /** priority-table / skill-cards 用的筛选条件 */
  filter?: { sections?: string[]; skills?: string[] };
}

export interface PriorityShift {
  skill: string;
  /** 一句话理由，必须能追到依据 */
  reason: string;
  /** 依据：APL 条件片段 / runId / 日志时间戳 */
  evidence: string;
  /**
   * 机器语法原文。正文一律写中文，APL 原文放折叠区备用——
   * 依据一条不丢，但主阅读面不出现裸条件。
   */
  raw?: string;
}

/** 第④段：地图（没有素材时为 null，页面显示"暂无地图"而不是空框） */
export interface MapRef {
  dungeon: string;
  routeKey: string;
  /** 这一波在该路线的第几波 */
  pull?: number;
  /** 拼接好的静态图（构建产出） */
  asset?: string;
}

/** 第⑤段：高手对照 */
export type CaseBlock =
  | { status: 'pending'; reason: string }
  | {
      status: 'simulation';
      timelineKey: string;
      headline: string;
      reading: string;
      evidence: string;
    }
  | { status: 'log'; logId: string; headline: string; points: string[]; evidence: string }
  | {
      status: 'phases';
      logId: string;
      headline: string;
      /** 要高亮的阶段序号（对应 content/logs/*-phases.json 的 index） */
      highlight?: number[];
      /** 一句话说明这一栏要读者看什么 */
      reading?: string;
    };

export interface EvidenceRef {
  runIds: string[];
  /** 日志来源（高手案例 / 整场统计），与 runIds 并列，不能互相顶替 */
  logs?: string[];
  sources: string[];
  generatedAt: IsoDateTime;
}

export interface Chapter {
  id: string;
  level: ChapterLevel;
  order: number;
  title: string;
  subtitle: string;
  /** ① 模型卡；L0 页可为 null（基础页没有波次模型） */
  model: WaveModelCard | null;
  /** 可选的输出结论；保留时由页面从 runId / 日志派生数值并只显示一次。 */
  claim?: string;
  /** ② 主图 */
  chart: ChartSpec;
  /** ① 的目标档动作预算；指向 trace runId 的 scenarioId */
  budgetScenario?: string;
  /** ③ 技能调整 */
  priorityDiff: { add: PriorityShift[]; drop: PriorityShift[] };
  /** ④ 地图 */
  map: MapRef | null;
  /** ⑤ 高手对照 */
  casePanel: CaseBlock;
  evidence: EvidenceRef;
}

export interface ChapterIndex {
  chapters: Chapter[];
}

/** 按层级分组，保留 order */
export function groupByLevel(chapters: Chapter[]): Record<ChapterLevel, Chapter[]> {
  const out: Record<ChapterLevel, Chapter[]> = { L0: [], L1: [], L2: [] };
  for (const c of chapters.slice().sort((a, b) => a.order - b.order)) out[c.level].push(c);
  return out;
}

/** 首页的"下一步"：按 L0 → L1 → L2 顺序取第一个没做完的 */
export function nextChapter(chapters: Chapter[], done: string[]): Chapter | null {
  const ordered = chapters.slice().sort((a, b) => {
    const rank: Record<ChapterLevel, number> = { L0: 0, L1: 1, L2: 2 };
    return rank[a.level] - rank[b.level] || a.order - b.order;
  });
  return ordered.find((c) => !done.includes(c.id)) ?? null;
}

/**
 * 抽取一段文字里出现的所有百分比，用于构建期与运行期的来源校验。
 * 只认 "12.3%" "12%" 这种，不认 "12 %"。
 */
export function percentagesIn(text: string): string[] {
  return [...text.matchAll(/\d+(?:\.\d+)?%/g)].map((m) => m[0]);
}
