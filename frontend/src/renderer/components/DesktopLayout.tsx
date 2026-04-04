import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Database,
  Home,
  Library,
  Map,
  MonitorPlay,
  Settings,
  Users,
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
}: {
  title: string;
  items: NavigationItem[];
  pathname: string;
}) {
  return (
    <section>
      <div className="mb-2 px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">{title}</p>
      </div>
      <nav className="space-y-px">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              to={item.href}
              aria-label={item.name}
              className={clsx(
                'group relative block px-6 py-3 transition-colors duration-200',
                isActive
                  ? 'bg-zinc-800/50 text-white'
                  : 'text-zinc-500 hover:bg-zinc-800/30 hover:text-zinc-300'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-0 h-full w-1 bg-cyan-500" />
              )}
              <div className="flex items-center gap-3">
                <item.icon className={clsx('h-4 w-4', isActive ? 'text-cyan-400' : 'text-zinc-600 group-hover:text-zinc-400')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold uppercase tracking-wide">
                      {item.name}
                    </p>
                    {item.badge && (
                      <span
                        className={clsx(
                          'px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border',
                          isActive
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-600'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
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

  return (
    <div className="relative h-screen overflow-hidden bg-[#09090b] text-zinc-100">
      <div className="relative flex h-full min-h-0 divide-x divide-zinc-800">
        <aside className="flex min-h-0 w-[240px] shrink-0 flex-col overflow-hidden bg-zinc-950">
          <div className="border-b border-zinc-800 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center border border-zinc-700 bg-zinc-900 text-sm font-black tracking-tighter text-cyan-400 shadow-inner">
                TS
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-500/60">True Sight</p>
                <h1 className="text-sm font-bold text-white uppercase tracking-tight">桌面分析台</h1>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-8 overflow-y-auto py-6">
            <NavigationSection title="CORE WORKFLOW" items={primaryNavigation} pathname={location.pathname} />
            <NavigationSection title="DEV TOOLS" items={devNavigation} pathname={location.pathname} />
          </div>

          <div className="border-t border-zinc-800 bg-zinc-900/20 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">SYSTEM STATUS</p>
                <p className="mt-1 text-[10px] font-mono text-emerald-500/80 uppercase">Electron Ready</p>
              </div>
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            </div>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#09090b]">
          <header className="border-b border-zinc-800 bg-zinc-900/10 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                  <span>WORKSPACE</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-zinc-400">{routeMeta.eyebrow}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-4">
                  <h2 className="text-lg font-bold tracking-tight text-white uppercase">{routeMeta.title}</h2>
                  <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest">{routeMeta.workflowLabel}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div className="hidden sm:block">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">SYSTEM TIME</p>
                  <p className="text-xs font-mono text-zinc-400">{currentTimeLabel}</p>
                </div>
                <div className="h-8 w-px bg-zinc-800" />
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 border border-zinc-800 bg-zinc-950 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    v0.1.0-BETA
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div
              data-testid="workspace-scroll-region"
              className="h-full min-h-0 overflow-y-auto"
            >
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
