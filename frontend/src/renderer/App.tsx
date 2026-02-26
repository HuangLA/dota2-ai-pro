import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
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
    if (replayEntryContext?.source === 'match_database') {
      navigate('/matchDatabase');
      return;
    }
    if (replayEntryContext?.source === 'team_profile') {
      navigate('/teamProfile');
      return;
    }
    if (replayEntryContext?.source === 'replay_library') {
      navigate('/replayLibrary');
      return;
    }
    navigate('/');
  };

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/matchList" element={<MatchListPageWrapper onWatch={handleWatchMatch} />} />
      <Route
        path="/match"
        element={
          <RealMatchViewerWrapper
            initialMatchId={currentMatchId}
            replayEntryContext={replayEntryContext}
            onBack={handleBackFromReplayViewer}
          />
        }
      />
      <Route path="/openDotaLive" element={<OpenDotaLivePageWrapper />} />
      <Route
        path="/replayLibrary"
        element={<ReplayLibraryPageWrapper onOpenReplay={handleOpenReplayFromReplayLibrary} />}
      />
      <Route
        path="/matchDatabase"
        element={
          <MatchDatabasePageWrapper
            initialViewState={matchDatabaseViewState}
            onViewStateChange={setMatchDatabaseViewState}
            onOpenReplay={handleOpenReplayFromMatchDatabase}
          />
        }
      />
      <Route
        path="/teamProfile"
        element={
          <TeamProfilePageWrapper
            onOpenMatchDatabase={handleOpenMatchDatabaseFromTeamProfile}
            onOpenReplay={handleOpenReplayFromTeamProfile}
            initialViewState={teamProfileViewState}
            onViewStateChange={setTeamProfileViewState}
          />
        }
      />
      <Route path="/poc" element={<POCTestPageWrapper />} />
      <Route path="/map" element={<MapTestPageWrapper />} />
    </Routes>
  );
}

// Home page component
function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-dota-bg flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-dota-gold mb-8">True Sight</h1>
      <p className="text-gray-300 mb-4">Dota 2 职业级录像分析工具</p>
      <div className="bg-dota-surface p-6 rounded-lg shadow-xl">
        <p className="text-center mb-4">开发阶段</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/matchList')}
            className="px-4 py-2 bg-dota-gold text-black rounded hover:bg-yellow-500 transition-colors font-bold"
          >
            比赛列表
          </button>
          <button
            onClick={() => navigate('/match')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
          >
            录像查看器
          </button>
          <button
            onClick={() => navigate('/openDotaLive')}
            className="px-4 py-2 bg-sky-700 text-white rounded hover:bg-sky-800 transition-colors font-medium"
          >
            OpenDota Live
          </button>
          <button
            onClick={() => navigate('/replayLibrary')}
            className="px-4 py-2 bg-emerald-700 text-white rounded hover:bg-emerald-800 transition-colors font-medium"
          >
            Replay Library
          </button>
          <button
            onClick={() => navigate('/matchDatabase')}
            className="px-4 py-2 bg-cyan-700 text-white rounded hover:bg-cyan-800 transition-colors font-medium"
          >
            比赛数据库
          </button>
          <button
            onClick={() => navigate('/teamProfile')}
            className="px-4 py-2 bg-teal-700 text-white rounded hover:bg-teal-800 transition-colors font-medium"
          >
            战队档案
          </button>
          <button
            onClick={() => navigate('/poc')}
            className="px-4 py-2 bg-dota-accent text-white rounded hover:bg-red-600 transition-colors"
          >
            技术验证
          </button>
          <button
            onClick={() => navigate('/map')}
            className="px-4 py-2 bg-dota-primary text-white rounded hover:bg-blue-800 transition-colors"
          >
            地图测试
          </button>
        </div>
      </div>
      <div className="mt-8 text-sm text-gray-500">
        <p>前端: React + TypeScript + Vite + Tailwind CSS + PixiJS</p>
        <p>后端: Python + FastAPI + DuckDB</p>
      </div>
    </div>
  );
}

// Wrapper components for pages with back button
function MatchListPageWrapper({ onWatch }: { onWatch: (matchId: number) => void }) {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50 shadow-lg border border-gray-700"
      >
        返回首页
      </button>
      <MatchListPage onWatch={onWatch} />
    </div>
  );
}

function RealMatchViewerWrapper({
  initialMatchId,
  replayEntryContext,
  onBack,
}: {
  initialMatchId: number | null;
  replayEntryContext: ReplayEntryContext | null;
  onBack: () => void;
}) {
  return (
    <div>
      <button
        onClick={onBack}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
      >
        {replayEntryContext?.source === 'match_database'
          ? '返回比赛数据库'
          : replayEntryContext?.source === 'team_profile'
            ? '返回战队档案'
            : replayEntryContext?.source === 'replay_library'
              ? '返回回放库'
              : '返回首页'}
      </button>
      <RealMatchViewer initialMatchId={initialMatchId} replayEntryContext={replayEntryContext} />
    </div>
  );
}

function OpenDotaLivePageWrapper() {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50 shadow-lg border border-gray-700"
      >
        返回首页
      </button>
      <OpenDotaLivePage />
    </div>
  );
}

function ReplayLibraryPageWrapper({ onOpenReplay }: { onOpenReplay: (matchId: number) => void }) {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50 shadow-lg border border-gray-700"
      >
        返回首页
      </button>
      <ReplayLibraryPage onOpenReplay={onOpenReplay} />
    </div>
  );
}

function MatchDatabasePageWrapper({
  initialViewState,
  onViewStateChange,
  onOpenReplay,
}: {
  initialViewState: MatchDatabaseViewState | undefined;
  onViewStateChange: (state: MatchDatabaseViewState | undefined) => void;
  onOpenReplay: (context: MatchDatabaseReplayContext) => void;
}) {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50 shadow-lg border border-gray-700"
      >
        返回首页
      </button>
      <MatchDatabasePage
        initialViewState={initialViewState}
        onViewStateChange={onViewStateChange}
        onOpenReplay={onOpenReplay}
      />
    </div>
  );
}

function TeamProfilePageWrapper({
  onOpenMatchDatabase,
  onOpenReplay,
  initialViewState,
  onViewStateChange,
}: {
  onOpenMatchDatabase: (context: {
    teamId: number;
    leagueId?: number;
    hasDownload?: boolean;
  }) => void;
  onOpenReplay: (context: TeamProfileReplayContext) => void;
  initialViewState: TeamProfileViewState | undefined;
  onViewStateChange: (state: TeamProfileViewState | undefined) => void;
}) {
  const navigate = useNavigate();
  return (
    <TeamProfilePage
      onBackHome={() => navigate('/')}
      onOpenMatchDatabase={onOpenMatchDatabase}
      onOpenReplay={onOpenReplay}
      initialViewState={initialViewState}
      onViewStateChange={onViewStateChange}
    />
  );
}

function POCTestPageWrapper() {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
      >
        返回首页
      </button>
      <POCTestPage />
    </div>
  );
}

function MapTestPageWrapper() {
  const navigate = useNavigate();
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
      >
        返回首页
      </button>
      <MapTestPage />
    </div>
  );
}

export default App;
