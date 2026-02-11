import { useState } from 'react';
import POCTestPage from './pages/POCTestPage';
import MapTestPage from './pages/MapTestPage';
import RealMatchViewer from './pages/RealMatchViewer';
import { MatchListPage } from './pages/MatchListPage';

type Page = 'home' | 'poc' | 'map' | 'match' | 'matchList';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [currentMatchId, setCurrentMatchId] = useState<number | null>(null);

  const handleWatchMatch = (matchId: number) => {
    setCurrentMatchId(matchId);
    setCurrentPage('match');
  };

  if (currentPage === 'matchList') {
    return (
      <div>
        <button
          onClick={() => setCurrentPage('home')}
          className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50 shadow-lg border border-gray-700"
        >
           返回首页
        </button>
        <MatchListPage onWatch={handleWatchMatch} />
      </div>
    );
  }

  if (currentPage === 'poc') {
    return (
      <div>
        <button
          onClick={() => setCurrentPage('home')}
          className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
        >
           返回首页
        </button>
        <POCTestPage />
      </div>
    );
  }

  if (currentPage === 'map') {
    return (
      <div>
        <button
          onClick={() => setCurrentPage('home')}
          className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
        >
           返回首页
        </button>
        <MapTestPage />
      </div>
    );
  }

  if (currentPage === 'match') {
    return (
      <div>
        <button
          onClick={() => setCurrentPage('home')}
          className="fixed top-4 left-4 px-4 py-2 bg-dota-surface text-white rounded hover:bg-dota-primary z-50"
        >
           返回首页
        </button>
        <RealMatchViewer initialMatchId={currentMatchId} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dota-bg flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-dota-gold mb-8">
        True Sight
      </h1>
      <p className="text-gray-300 mb-4">
        Dota 2 职业级录像分析工具
      </p>
      <div className="bg-dota-surface p-6 rounded-lg shadow-xl">
        <p className="text-center mb-4">
          开发阶段
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setCurrentPage('matchList')}
            className="px-4 py-2 bg-dota-gold text-black rounded hover:bg-yellow-500 transition-colors font-bold"
          >
             比赛列表
          </button>
          <button
            onClick={() => {
              setCurrentMatchId(null);
              setCurrentPage('match');
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium"
          >
             录像查看器
          </button>
          <button
            onClick={() => setCurrentPage('poc')}
            className="px-4 py-2 bg-dota-accent text-white rounded hover:bg-red-600 transition-colors"
          >
             技术验证
          </button>
          <button
            onClick={() => setCurrentPage('map')}
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

export default App;
