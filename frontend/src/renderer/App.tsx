import { useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
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

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentMatchId, replayEntryContext, clearMatch, selectMatch } = useMatchStore();
  const { setPreviousPage } = useNavigationStore();

  useEffect(() => {
    const currentPath = location.pathname;
    return () => {
      setPreviousPage(currentPath);
    };
  }, [location.pathname, setPreviousPage]);

  useEffect(() => {
    if (currentMatchId !== null && location.pathname !== '/match') {
      navigate('/match');
    }
  }, [currentMatchId, location.pathname, navigate]);

  const handleBackFromReplayViewer = () => {
    clearMatch();
    navigate(-1);
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
          <div data-testid="replay-viewer-shell" className="flex h-screen flex-col bg-dota-bg">
            <div
              data-testid="replay-viewer-topbar"
              className="flex flex-none items-center px-4 pt-4 lg:px-6"
            >
              <button
                onClick={handleBackFromReplayViewer}
                aria-label="← 返回"
                title="返回工作台"
                data-testid="return-to-workspace-button"
                className="flex max-w-[15rem] items-center gap-2 rounded-2xl border border-slate-700/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.72))] px-3 py-2.5 text-left text-white shadow-[0_18px_34px_rgba(2,6,23,0.34)] backdrop-blur-xl transition hover:border-cyan-400/40 hover:bg-[linear-gradient(135deg,rgba(8,47,73,0.88),rgba(15,23,42,0.92))] 2xl:gap-3 2xl:px-4 2xl:py-3 2xl:shadow-[0_20px_40px_rgba(2,6,23,0.4)] 2xl:max-w-none"
              >
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/70 p-2 text-cyan-200">
                  <ArrowLeft className="h-4 w-4" />
                </div>
                <div data-testid="replay-back-button-label" className="hidden 2xl:block">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Workspace
                  </div>
                  <p className="mt-1 text-sm font-semibold text-white">返回工作台</p>
                </div>
                <span className="sr-only">返回工作台</span>
              </button>
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
