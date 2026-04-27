import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Moon, Sun } from 'lucide-react';
import DesktopLayout from './components/DesktopLayout';
import POCTestPage from './pages/POCTestPage';
import MapTestPage from './pages/MapTestPage';
import RealMatchViewer from './pages/RealMatchViewer';
import { MatchListPage } from './pages/MatchListPage';
import TeamProfilePage from './pages/TeamProfilePage';
import MatchDatabasePage from './pages/MatchDatabasePage';
import OpenDotaLivePage from './pages/OpenDotaLivePage';
import ReplayLibraryPage from './pages/ReplayLibraryPage';
import { useMatchStore, useNavigationStore } from './store';
import { applyTheme, readInitialTheme, type ThemeMode } from './theme';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentMatchId, replayEntryContext, clearMatch, selectMatch } = useMatchStore();
  const { setPreviousPage } = useNavigationStore();
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialTheme);
  const isReturningFromReplayRef = useRef(false);

  useEffect(() => {
    const currentPath = location.pathname;
    return () => {
      setPreviousPage(currentPath);
    };
  }, [location.pathname, setPreviousPage]);

  useEffect(() => {
    if (isReturningFromReplayRef.current) {
      if (location.pathname !== '/match') {
        isReturningFromReplayRef.current = false;
      }
      return;
    }

    if (currentMatchId !== null && location.pathname !== '/match') {
      navigate('/match');
    }
  }, [currentMatchId, location.pathname, navigate]);

  useEffect(() => {
    setThemeMode(readInitialTheme());
  }, [location.pathname]);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  const handleBackFromReplayViewer = () => {
    const returnPath =
      replayEntryContext?.source === 'match_database'
        ? '/matchDatabase'
        : replayEntryContext?.source === 'team_profile'
          ? '/teamProfile'
          : replayEntryContext?.source === 'replay_library'
            ? '/replayLibrary'
            : '/openDotaLive';
    isReturningFromReplayRef.current = true;
    clearMatch();
    navigate(returnPath, { replace: true });
  };

  return (
    <Routes>
      <Route element={<DesktopLayout />}>
        <Route path="/" element={<Navigate to="/openDotaLive" replace />} />
        <Route path="/matchList" element={<MatchListPage onWatch={selectMatch} />} />
        <Route path="/openDotaLive" element={<OpenDotaLivePage />} />
        <Route
          path="/replayLibrary"
          element={<ReplayLibraryPage onOpenReplay={selectMatch} />}
        />
        <Route path="/matchDatabase" element={<MatchDatabasePage />} />
        <Route path="/teamProfile" element={<TeamProfilePage />} />
        <Route path="/poc" element={<POCTestPage />} />
        <Route path="/map" element={<MapTestPage />} />
      </Route>

      <Route
        path="/match"
        element={
          <div
            data-testid="replay-viewer-shell"
            className="replay-viewer-shell-soft flex h-screen flex-col"
          >
            <div
              data-testid="replay-viewer-topbar"
              className="replay-viewer-topbar-soft flex flex-none items-center justify-between gap-3 px-4 py-3 lg:px-6"
            >
              <button
                onClick={handleBackFromReplayViewer}
                aria-label="← 返回"
                title="返回工作台"
                data-testid="return-to-workspace-button"
                className="flex max-w-[15rem] items-center gap-2 rounded-lg border px-3 py-2 text-left backdrop-blur-xl transition 2xl:max-w-none 2xl:gap-3 2xl:px-4 2xl:py-2.5"
              >
                <div className="rounded-md border p-2">
                  <ArrowLeft className="h-4 w-4" />
                </div>
                <div data-testid="replay-back-button-label" className="hidden 2xl:block">
                  <div className="replay-back-button-eyebrow flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Workspace
                  </div>
                  <p className="replay-back-button-text mt-1 text-sm font-semibold">返回工作台</p>
                </div>
                <span className="sr-only">返回工作台</span>
              </button>
              <div className="tactical-theme-switch replay-theme-switch" role="group" aria-label="切换界面主题">
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
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RealMatchViewer
                initialMatchId={currentMatchId}
                replayEntryContext={replayEntryContext}
              />
            </div>
          </div>
        }
      />
    </Routes>
  );
}

export default App;
