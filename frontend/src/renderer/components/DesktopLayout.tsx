import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  ChevronRight,
  Clock3,
  Command,
  Database,
  Home,
  Library,
  Map,
  MonitorPlay,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from 'lucide-react';
import clsx from 'clsx';

interface NavigationItem {
  name: string;
  href: string;
  icon: typeof Home;
  hint: string;
  badge?: string;
}

interface RouteMeta {
  eyebrow: string;
  title: string;
  description: string;
  modeLabel: string;
  workflowLabel: string;
}

const primaryNavigation: NavigationItem[] = [
  {
    name: '实时录像下载',
    href: '/openDotaLive',
    icon: MonitorPlay,
    hint: '先筛远端比赛，再下载和观察解析流水线。',
    badge: 'Live',
  },
  {
    name: '本地录像库',
    href: '/replayLibrary',
    icon: Library,
    hint: '搜索本地回放，同时联动 OpenDota 搜索远端录像。',
    badge: 'Library',
  },
  {
    name: '比赛数据库',
    href: '/matchDatabase',
    icon: Database,
    hint: '按战队、联赛、下载状态集中管理可回放比赛。',
    badge: 'DB',
  },
  {
    name: '战队档案',
    href: '/teamProfile',
    icon: Users,
    hint: '围绕战队做联赛、回放和动作历史的复盘。',
    badge: 'Team',
  },
];

const devNavigation: NavigationItem[] = [
  {
    name: '比赛列表 (旧)',
    href: '/matchList',
    icon: Home,
    hint: '旧版比赛检索入口，保留用于兼容和对照。',
  },
  {
    name: 'POC 测试',
    href: '/poc',
    icon: Settings,
    hint: '实验接口和集成验证页面。',
  },
  {
    name: '地图渲染器',
    href: '/map',
    icon: Map,
    hint: '单独检查小地图和图层渲染。',
  },
];

const routeMetaMap: Array<{ href: string; meta: RouteMeta }> = [
  {
    href: '/openDotaLive',
    meta: {
      eyebrow: 'Live Ingest',
      title: 'OpenDota 实时下载台',
      description: '围绕远端比赛发现、下载、解析和状态跟踪组织的一体化工作区。',
      modeLabel: '远端联动',
      workflowLabel: '发现 -> 下载 -> 解析',
    },
  },
  {
    href: '/replayLibrary',
    meta: {
      eyebrow: 'Replay Library',
      title: '本地回放库',
      description: '把本地已解析回放和远端可入库比赛放在同一个搜索台里处理。',
      modeLabel: '本地优先',
      workflowLabel: '搜索 -> 入库 -> 打开回放',
    },
  },
  {
    href: '/matchDatabase',
    meta: {
      eyebrow: 'Match Database',
      title: '比赛数据库',
      description: '更适合先从联赛和战队维度缩小集合，再逐步准备回放和批量操作。',
      modeLabel: '结构化筛选',
      workflowLabel: '筛选 -> 批量动作 -> 回放',
    },
  },
  {
    href: '/teamProfile',
    meta: {
      eyebrow: 'Team Profile',
      title: '战队档案',
      description: '把战队、联赛、准备动作和对比回放聚合到一个长期复盘视角里。',
      modeLabel: '战队视角',
      workflowLabel: '聚合 -> 记录 -> 对比',
    },
  },
  {
    href: '/matchList',
    meta: {
      eyebrow: 'Legacy Match List',
      title: '旧版比赛列表',
      description: '兼容历史检索链路，作为新数据库页之外的兜底入口保留。',
      modeLabel: '兼容模式',
      workflowLabel: '检索 -> 打开',
    },
  },
  {
    href: '/poc',
    meta: {
      eyebrow: 'POC Lab',
      title: '实验台',
      description: '用于快速验证接口、实验想法和中间态工具，不承载正式流程。',
      modeLabel: '实验区',
      workflowLabel: '试验 -> 验证',
    },
  },
  {
    href: '/map',
    meta: {
      eyebrow: 'Map Renderer',
      title: '地图渲染器',
      description: '专注于地图素材、坐标映射和图层渲染的单页调试视图。',
      modeLabel: '图层调试',
      workflowLabel: '校准 -> 渲染',
    },
  },
];

const defaultRouteMeta: RouteMeta = {
  eyebrow: 'True Sight',
  title: '桌面分析台',
  description: '本地优先的 Dota 2 回放工作台，把下载、数据库、回放和战队档案整合到同一套壳层里。',
  modeLabel: '桌面工作区',
  workflowLabel: 'Local-first',
};

function resolveRouteMeta(pathname: string): RouteMeta {
  return routeMetaMap.find((item) => pathname.startsWith(item.href))?.meta ?? defaultRouteMeta;
}

function NavigationSection({
  title,
  items,
  pathname,
  compact = false,
}: {
  title: string;
  items: NavigationItem[];
  pathname: string;
  compact?: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
        <span className="text-[10px] uppercase tracking-[0.22em] text-slate-600">{items.length}</span>
      </div>
      <nav className="space-y-2">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              to={item.href}
              aria-label={item.name}
              className={clsx(
                'group block rounded-2xl border transition-all duration-200',
                compact ? 'px-3 py-3' : 'px-4 py-3.5',
                isActive
                  ? 'border-cyan-400/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(15,23,42,0.96))] shadow-[0_18px_40px_rgba(8,145,178,0.18)]'
                  : 'border-slate-800/80 bg-slate-950/55 hover:border-slate-700 hover:bg-slate-950/75'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={clsx(
                    'mt-0.5 rounded-xl border p-2 transition-colors',
                    isActive
                      ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200'
                      : 'border-slate-800 bg-slate-900/80 text-slate-500 group-hover:text-slate-300'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx('truncate text-sm font-semibold', isActive ? 'text-white' : 'text-slate-200')}>
                      {item.name}
                    </p>
                    {item.badge && (
                      <span
                        className={clsx(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                          isActive
                            ? 'border-cyan-300/30 bg-cyan-400/10 text-cyan-100'
                            : 'border-slate-800 bg-slate-900/80 text-slate-500'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
                </div>
              </div>
            </NavLink>
          );
        })}
      </nav>
    </section>
  );
}

export default function DesktopLayout() {
  const location = useLocation();
  const routeMeta = resolveRouteMeta(location.pathname);
  const currentTimeLabel = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const activePrimaryItem = primaryNavigation.find((item) => location.pathname.startsWith(item.href)) ?? null;

  return (
    <div className="relative h-screen overflow-hidden bg-[#050816] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(249,115,22,0.12),_transparent_28%),linear-gradient(180deg,#030712_0%,#050816_52%,#020617_100%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative flex h-full min-h-0 gap-3 p-3 xl:gap-4 xl:p-4">
        <aside className="flex min-h-0 w-[248px] shrink-0 flex-col overflow-hidden rounded-[26px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.92))] shadow-[0_32px_80px_rgba(2,6,23,0.5)] backdrop-blur-2xl xl:w-[280px] xl:rounded-[30px]">
          <div className="border-b border-slate-800/80 px-4 py-4 xl:px-5 xl:py-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-400/80" />
              <span className="h-3 w-3 rounded-full bg-amber-300/80" />
              <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(249,115,22,0.18))] text-lg font-black tracking-[0.18em] text-white shadow-[0_14px_28px_rgba(34,211,238,0.18)]">
                TS
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/75">True Sight</p>
                <h1 className="mt-1 text-xl font-semibold text-white">桌面分析台</h1>
                <p className="mt-1 text-xs text-slate-500">为本地优先的 Dota 2 复盘工作流设计</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-800/70 px-4 py-3.5 xl:px-5 xl:py-4">
            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">当前模块</p>
                    <p className="mt-2 text-sm font-semibold text-white">{routeMeta.title}</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-cyan-300/80" />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{routeMeta.workflowLabel}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <Activity className="h-3.5 w-3.5" />
                    模式
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{routeMeta.modeLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <Clock3 className="h-3.5 w-3.5" />
                    当前时间
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{currentTimeLabel}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4 xl:space-y-6 xl:px-4 xl:py-5">
            <NavigationSection title="核心工作流" items={primaryNavigation} pathname={location.pathname} />
            <NavigationSection title="开发工具" items={devNavigation} pathname={location.pathname} compact />
          </div>

          <div className="border-t border-slate-800/70 px-4 py-3.5 xl:px-5 xl:py-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-950/55 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                <Command className="h-3.5 w-3.5" />
                Desktop-first
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                当前壳层按桌面工作台组织，不再假装自己只是浏览器页面。
              </p>
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.82))] shadow-[0_36px_120px_rgba(2,6,23,0.6)] backdrop-blur-2xl xl:rounded-[34px]">
          <div className="border-b border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(15,23,42,0.56))] px-4 py-4 xl:px-6">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <span>Workspace</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span>{routeMeta.eyebrow}</span>
                </div>
                <div className="mt-2 flex flex-col gap-2 2xl:flex-row 2xl:items-center 2xl:gap-4">
                  <h2 className="text-2xl font-semibold tracking-tight text-white">{routeMeta.title}</h2>
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-slate-700 2xl:block" />
                  <p className="max-w-2xl text-sm leading-6 text-slate-400">{routeMeta.description}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 2xl:justify-end">
                <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100">
                  {routeMeta.modeLabel}
                </span>
                <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                  {activePrimaryItem?.name ?? '工具页'}
                </span>
                <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                  Electron Ready
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                <Workflow className="mr-1.5 inline h-3.5 w-3.5 text-slate-500" />
                {routeMeta.workflowLabel}
              </span>
              <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-slate-500" />
                桌面分析工具
              </span>
              <span className="rounded-full border border-slate-700/80 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
                <Command className="mr-1.5 inline h-3.5 w-3.5 text-slate-500" />
                左侧导航固定可达
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 p-2.5 xl:p-3">
            <div
              data-testid="workspace-scroll-region"
              className="h-full min-h-0 overflow-y-auto rounded-[28px] border border-slate-900/70 bg-[linear-gradient(180deg,rgba(2,6,23,0.28),rgba(2,6,23,0.08))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
            >
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
