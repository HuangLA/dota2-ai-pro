import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  Database,
  Home,
  Library,
  Map,
  Moon,
  MonitorPlay,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { applyTheme, readInitialTheme, type ThemeMode } from '../theme';

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
    <section className="tactical-nav-section">
      <div className="tactical-nav-section-header">
        <p className="tactical-nav-section-label">{title}</p>
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              to={item.href}
              aria-label={item.name}
              aria-current={isActive ? 'page' : undefined}
              title={item.hint}
              data-active={isActive}
              className="tactical-nav-link group"
            >
              <div className="flex items-center gap-3">
                <item.icon className="tactical-nav-icon h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">
                      {item.name}
                    </p>
                    {item.badge && (
                      <span className="tactical-nav-badge">
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const currentTimeLabel = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  return (
    <div className="tactical-shell">
      <div className="tactical-frame">
        <aside className="tactical-sidebar">
          <div className="tactical-brand">
            <div className="flex items-center gap-3">
              <div className="tactical-logo">
                TS
              </div>
              <div>
                <p className="tactical-brand-eyebrow">True Sight</p>
                <h1 className="tactical-brand-title">桌面分析台</h1>
              </div>
            </div>
          </div>

          <div className="tactical-sidebar-scroll">
            <NavigationSection title="工作流" items={primaryNavigation} pathname={location.pathname} />
            <NavigationSection title="工具" items={devNavigation} pathname={location.pathname} />
          </div>

          <div className="tactical-sidebar-status">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="tactical-meta-label">SYSTEM STATUS</p>
                <p className="tactical-status-text">Electron Ready</p>
              </div>
              <div className="tactical-status-dot" />
            </div>
          </div>
        </aside>

        <main className="tactical-main">
          <header className="tactical-topbar">
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="tactical-route-kicker">
                  <span>WORKSPACE</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="tactical-route-kicker-current">{routeMeta.eyebrow}</span>
                </div>
                <div className="mt-1 flex min-w-0 items-baseline gap-3">
                  <h2 className="tactical-route-title">{routeMeta.title}</h2>
                  <p className="tactical-route-flow">
                    {routeMeta.workflowLabel}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-3 text-right">
                <div className="hidden sm:block">
                  <p className="tactical-meta-label">SYSTEM TIME</p>
                  <p className="tactical-time-label">{currentTimeLabel}</p>
                </div>
                <div className="tactical-topbar-divider" />
                <div className="tactical-theme-switch" role="group" aria-label="切换界面主题">
                  <button
                    type="button"
                    aria-label="Light"
                    aria-pressed={themeMode === 'light'}
                    onClick={() => setThemeMode('light')}
                    title="Light"
                  >
                    <Sun className="h-3.5 w-3.5" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Dark"
                    aria-pressed={themeMode === 'dark'}
                    onClick={() => setThemeMode('dark')}
                    title="Dark"
                  >
                    <Moon className="h-3.5 w-3.5" />
                    <span>Dark</span>
                  </button>
                </div>
                <div className="tactical-version">
                  v0.1.0-BETA
                </div>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">
            <div
              data-testid="workspace-scroll-region"
              className="tactical-content-scroll"
            >
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
