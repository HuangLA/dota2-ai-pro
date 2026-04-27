/**
 * POC Test Page - 技术验证仪表板
 */

import { useState } from 'react';
import PixiJSStressTest from '../components/poc/PixiJSStressTest';
import backendAPI, { ApiTestResult } from '../api/backend';
import { getApiBaseUrl } from '../api/apiBase';

type TestTab = 'pixijs' | 'api' | 'summary';

export function POCTestPage() {
  const apiBaseUrl = getApiBaseUrl();
  const [activeTab, setActiveTab] = useState<TestTab>('summary');
  const [healthResult, setHealthResult] = useState<ApiTestResult | null>(null);
  const [matchesResult, setMatchesResult] = useState<ApiTestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const testHealthCheck = async () => {
    setIsTesting(true);
    setHealthResult(null);
    const result = await backendAPI.healthCheck();
    setHealthResult(result);
    setIsTesting(false);
  };

  const testMatches = async () => {
    setIsTesting(true);
    setMatchesResult(null);
    const result = await backendAPI.getMatches();
    setMatchesResult(result);
    setIsTesting(false);
  };

  return (
    <div className="workspace-page bg-dota-bg">
      <div className="workspace-stack max-w-[1280px]">
        <div className="workspace-header">
          <div className="workspace-header-row">
            <div>
              <p className="workspace-eyebrow text-cyan-300/80">POC Lab</p>
              <h1 className="workspace-title text-dota-gold">技术验证 POC</h1>
              <p className="workspace-description">验证渲染、接口和实验工具。</p>
            </div>
            <div className="workspace-pill-row xl:mt-0">
              <span className="workspace-pill">PixiJS</span>
              <span className="workspace-pill">API</span>
              <span className="workspace-pill">Summary</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('pixijs')}
            className={`px-4 py-2 -mb-px ${activeTab === 'pixijs'
              ? 'border-b-2 border-dota-accent text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            PixiJS 渲染
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 -mb-px ${activeTab === 'api'
              ? 'border-b-2 border-dota-accent text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            后端 API
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 -mb-px ${activeTab === 'summary'
              ? 'border-b-2 border-dota-accent text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            总结
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'pixijs' && <PixiJSStressTest />}

        {activeTab === 'api' && (
          <div className="workspace-panel">
            <h2 className="text-xl font-bold text-dota-gold mb-4">
              后端 API 测试
            </h2>
            <p className="text-gray-400 mb-4">
              测试与 Python FastAPI 后端的连接
            </p>

            <div className="space-y-4">
              {/* Health Check Test */}
              <div className="bg-dota-bg p-4 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium mb-1">健康检查</h3>
                    <code className="text-sm text-gray-400">
                      GET {apiBaseUrl}/health
                    </code>
                  </div>
                  <button
                    onClick={testHealthCheck}
                    disabled={isTesting}
                    className="px-4 py-2 bg-dota-primary text-white rounded hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? '测试中...' : '测试'}
                  </button>
                </div>

                {healthResult && (
                  <div className={`mt-3 p-3 rounded ${healthResult.success
                    ? 'bg-green-900/30 border border-green-700'
                    : 'bg-red-900/30 border border-red-700'
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${healthResult.success ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                      <span className="font-medium">
                        {healthResult.success ? '成功' : '失败'}
                      </span>
                      {healthResult.status && (
                        <span className="text-sm text-gray-400">
                          (状态: {healthResult.status})
                        </span>
                      )}
                      {healthResult.responseTime && (
                        <span className="text-sm text-gray-400">
                          - {healthResult.responseTime}ms
                        </span>
                      )}
                    </div>
                    <pre className="text-xs bg-dota-bg p-2 rounded overflow-auto">
                      {JSON.stringify(healthResult.data || healthResult.error, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* List Matches Test */}
              <div className="bg-dota-bg p-4 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium mb-1">比赛列表</h3>
                    <code className="text-sm text-gray-400">
                      GET {apiBaseUrl}/api/v1/matches
                    </code>
                  </div>
                  <button
                    onClick={testMatches}
                    disabled={isTesting}
                    className="px-4 py-2 bg-dota-primary text-white rounded hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? '测试中...' : '测试'}
                  </button>
                </div>

                {matchesResult && (
                  <div className={`mt-3 p-3 rounded ${matchesResult.success
                    ? 'bg-green-900/30 border border-green-700'
                    : 'bg-red-900/30 border border-red-700'
                    }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${matchesResult.success ? 'bg-green-500' : 'bg-red-500'
                        }`}></span>
                      <span className="font-medium">
                        {matchesResult.success ? '成功' : '失败'}
                      </span>
                      {matchesResult.status && (
                        <span className="text-sm text-gray-400">
                          (状态: {matchesResult.status})
                        </span>
                      )}
                      {matchesResult.responseTime && (
                        <span className="text-sm text-gray-400">
                          - {matchesResult.responseTime}ms
                        </span>
                      )}
                    </div>
                    <pre className="text-xs bg-dota-bg p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(matchesResult.data || matchesResult.error, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-dota-primary/20 border border-dota-primary p-4 rounded">
                <h4 className="font-medium mb-2">后端状态</h4>
                <p className="text-sm text-gray-300">
                  {healthResult?.success
                    ? '后端运行正常！'
                    : '请确保后端正在运行: '}
                  {!healthResult?.success && (
                    <code className="bg-dota-bg px-2 py-1 rounded ml-1">
                      cd backend && python main.py
                    </code>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'summary' && (
          <div className="workspace-panel">
            <h2 className="text-xl font-bold text-dota-gold mb-4">
              POC 总结
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Frontend Tests */}
                <div className="bg-dota-bg p-4 rounded">
                  <h3 className="font-medium text-lg mb-3">前端</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      React + TypeScript + Vite
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Tailwind CSS
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      PixiJS 渲染
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                      Electron 集成 (开发模式)
                    </li>
                  </ul>
                </div>

                {/* Backend Tests */}
                <div className="bg-dota-bg p-4 rounded">
                  <h3 className="font-medium text-lg mb-3">后端</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${healthResult?.success ? 'bg-green-500' : 'bg-gray-500'
                        }`}></span>
                      FastAPI 服务器
                      {healthResult?.success && (
                        <span className="text-xs text-green-400">
                          ({healthResult.responseTime}ms)
                        </span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${matchesResult?.success ? 'bg-green-500' : 'bg-gray-500'
                        }`}></span>
                      SQLite 数据库
                      {matchesResult?.success && (
                        <span className="text-xs text-green-400">
                          ({matchesResult.data?.total ?? 0} 场比赛)
                        </span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Parquet + DuckDB
                      <span className="text-xs text-gray-400">(POC 已测试)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Clarity 解析器
                      <span className="text-xs text-gray-400">(JAR 已构建)</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Test Status */}
              <div className={`p-4 rounded border ${healthResult?.success && matchesResult?.success
                ? 'bg-green-900/20 border-green-700'
                : 'bg-yellow-900/20 border-yellow-700'
                }`}>
                <h4 className="font-medium mb-2">整体状态</h4>
                <p className="text-sm text-gray-300">
                  {healthResult?.success && matchesResult?.success ? (
                    <>
                      所有核心系统已验证并正常运行！<br />
                      <span className="text-xs text-gray-400 mt-1 block">
                        前后端通信: 正常 |
                        API 响应时间: ~{((healthResult.responseTime || 0) + (matchesResult.responseTime || 0)) / 2}ms 平均
                      </span>
                    </>
                  ) : (
                    <>
                      请运行后端 API 测试以验证系统状态
                      <br />
                      <span className="text-xs text-gray-400 mt-1 block">
                        前往"后端 API"标签页并点击"测试"按钮
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Next Steps */}
              <div className="bg-dota-primary/20 border border-dota-primary p-4 rounded">
                <h4 className="font-medium mb-2">下一步</h4>
                <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                  {!healthResult?.success && (
                    <li>测试后端 API 连接 (后端 API 标签页)</li>
                  )}
                  {healthResult?.success && !matchesResult?.success && (
                    <li>测试比赛接口 (后端 API 标签页)</li>
                  )}
                  {healthResult?.success && matchesResult?.success && (
                    <>
                      <li className="line-through text-gray-500">后端 API 已验证</li>
                      <li>上传并解析录像文件 (.dem)</li>
                      <li>实现 2D 地图渲染引擎</li>
                      <li>创建比赛查看器界面</li>
                      <li>构建时间轴回放控件</li>
                    </>
                  )}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default POCTestPage;
