import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    Home,
    MonitorPlay, // OpenDota Live
    Library,     // Replay Library
    Database,    // Match Database
    Users,       // Team Profile
    Settings,    // POC / Settings
    Map          // Map Test
} from 'lucide-react';
import clsx from 'clsx';

export default function DesktopLayout() {
    const location = useLocation();

    const navigation = [
        { name: '实时录像下载', href: '/openDotaLive', icon: MonitorPlay },
        { name: '本地录像库', href: '/replayLibrary', icon: Library },
        { name: '比赛数据库', href: '/matchDatabase', icon: Database },
        { name: '战队档案', href: '/teamProfile', icon: Users },
    ];

    const devNavigation = [
        { name: '比赛列表 (旧)', href: '/matchList', icon: Home },
        { name: 'POC 测试', href: '/poc', icon: Settings },
        { name: '地图渲染器', href: '/map', icon: Map },
    ];

    return (
        <div className="flex h-screen w-full bg-dota-bg overflow-hidden text-gray-100">
            {/* Sidebar with Glassmorphism */}
            <div className="w-64 flex-shrink-0 glass-panel flex flex-col z-10 relative">
                {/* Logo/Header */}
                <div className="h-16 flex items-center px-6 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-dota-accent to-red-600 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(225,29,72,0.5)]">
                            TS
                        </div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-dota-gold to-yellow-200 tracking-wide drop-shadow-sm">True Sight</span>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-6">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                            数据分析
                        </div>
                        <nav className="flex flex-col gap-1">
                            {navigation.map((item) => {
                                const isActive = location.pathname.startsWith(item.href);
                                return (
                                    <NavLink
                                        key={item.href}
                                        to={item.href}
                                        className={clsx(
                                            'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                                            isActive
                                                ? 'bg-gradient-to-r from-dota-primary/40 to-blue-900/20 text-blue-300 border border-blue-500/20 shadow-[0_0_10px_rgba(42,67,101,0.5)]'
                                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                        )}
                                    >
                                        <item.icon className={clsx('w-5 h-5 transition-colors', isActive ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]' : 'text-gray-500')} />
                                        {item.name}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">
                            开发工具
                        </div>
                        <nav className="flex flex-col gap-1">
                            {devNavigation.map((item) => {
                                const isActive = location.pathname.startsWith(item.href);
                                return (
                                    <NavLink
                                        key={item.href}
                                        to={item.href}
                                        className={clsx(
                                            'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                                            isActive
                                                ? 'bg-gradient-to-r from-red-900/30 to-dota-accent/10 text-red-300 border border-red-500/20 shadow-[0_0_10px_rgba(225,29,72,0.3)]'
                                                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                                        )}
                                    >
                                        <item.icon className={clsx('w-5 h-5 transition-colors', isActive ? 'text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.8)]' : 'text-gray-500')} />
                                        {item.name}
                                    </NavLink>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* User / Footer area */}
                <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
                    v0.1.0 • Desktop App Mode
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative bg-transparent">
                {/* A subtle dark overlay to ensure text readability over the background radial gradient */}
                <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                <div className="relative z-10 flex-1 flex flex-col h-full min-h-0">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
