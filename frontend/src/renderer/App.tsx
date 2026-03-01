import { useState } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import DesktopLayout from './components/DesktopLayout';
import POCTestPage from './pages/POCTestPage';
import MapTestPage from './pages/MapTestPage';
import RealMatchViewer from './pages/RealMatchViewer';
import { MatchListPage } from './pages/MatchListPage';
import TeamProfilePage from './pages/TeamProfilePage';
import MatchDatabasePage, {
  MatchDatabaseReplayContext,
  MatchDatabaseViewState,
} from './pages/MatchDatabasePage';
import OpenDotaLivePage from './pages/OpenDotaLivePage';
import ReplayLibraryPage from './pages/ReplayLibraryPage';
import { ReplayEntryContext, TeamProfileReplayContext } from './types/replayContext';
import { TeamProfileViewState } from './pages/TeamProfilePage';

function App() {
  const navigate = useNavigate();
  const [currentMatchId, setCurrentMatchId] = useState<number | null>(null);
  const [matchDatabaseViewState, setMatchDatabaseViewState] = useState<MatchDatabaseViewState | undefined>(
    undefined
  );
  const [teamProfileViewState, setTeamProfileViewState] = useState<TeamProfileViewState | undefined>(
    undefined
  );
  const [replayEntryContext, setReplayEntryContext] = useState<ReplayEntryContext | null>(null);

  const handleWatchMatch = (matchId: number) => {
    setCurrentMatchId(matchId);
    setReplayEntryContext(null);
    navigate('/match');
  };

  const handleOpenReplayFromMatchDatabase = (context: MatchDatabaseReplayContext) => {
    setCurrentMatchId(context.matchId);
    setReplayEntryContext(context);
    navigate('/match');
  };

  const handleOpenReplayFromTeamProfile = (context: TeamProfileReplayContext) => {
    setCurrentMatchId(context.matchId);
    setReplayEntryContext(context);
    navigate('/match');
  };

  const handleOpenReplayFromReplayLibrary = (matchId: number) => {
    setCurrentMatchId(matchId);
    setReplayEntryContext({
      source: 'replay_library',
      matchId,
    });
    navigate('/match');
  };

  const handleOpenMatchDatabaseFromTeamProfile = (context: {
    teamId: number;
    leagueId?: number;
    hasDownload?: boolean;
  }) => {
    const nextFilters = {
      teamId: String(context.teamId),
      leagueId: context.leagueId !== undefined ? String(context.leagueId) : '',
      startTimeFrom: '',
      startTimeTo: '',
      hasDownload: context.hasDownload ? ('true' as const) : ('all' as const),
      professionalOnly: true,
    };

    setMatchDatabaseViewState({
      filters: nextFilters,
      appliedFilters: nextFilters,
      offset: 0,
    });
    navigate('/matchDatabase');
  };

  const handleBackFromReplayViewer = () => {
    navigate(-1);
  };

  return (
    <Routes>
      {/* 
        The main Layout Shell enclosing all navigational pages. 
        Note that / navigates straight to /openDotaLive since the traditional home 
        has been replaced by the persistent sidebar. 
      */}
      <Route element={<DesktopLayout />}>
        <Route path="/" element={<Navigate to="/openDotaLive" replace />} />
        <Route path="/matchList" element={<MatchListPage onWatch={handleWatchMatch} />} />
        <Route path="/openDotaLive" element={<OpenDotaLivePage />} />
        <Route
          path="/replayLibrary"
          element={<ReplayLibraryPage onOpenReplay={handleOpenReplayFromReplayLibrary} />}
        />
        <Route
          path="/matchDatabase"
          element={
            <MatchDatabasePage
              initialViewState={matchDatabaseViewState}
              onViewStateChange={setMatchDatabaseViewState}
              onOpenReplay={handleOpenReplayFromMatchDatabase}
            />
          }
        />
        <Route
          path="/teamProfile"
          element={
            <TeamProfilePage
              onBackHome={() => navigate('/')}
              onOpenMatchDatabase={handleOpenMatchDatabaseFromTeamProfile}
              onOpenReplay={handleOpenReplayFromTeamProfile}
              initialViewState={teamProfileViewState}
              onViewStateChange={setTeamProfileViewState}
            />
          }
        />
        <Route path="/poc" element={<POCTestPage />} />
        <Route path="/map" element={<MapTestPage />} />
      </Route>

      {/* The Match Viewer is outside the Layout shell to maintain full screen real estate. */}
      <Route
        path="/match"
        element={
          <div className="w-full h-screen relative">
            {/* Soft back button layer overlaying the top left for escaping fullscreen viewer mode */}
            <button
              onClick={handleBackFromReplayViewer}
              className="absolute top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-[9999] shadow-lg border border-gray-700"
            >
              ← 返回
            </button>
            <RealMatchViewer
              initialMatchId={currentMatchId}
              replayEntryContext={replayEntryContext}
            />
          </div>
        }
      />
    </Routes>
  );
}

export default App;
