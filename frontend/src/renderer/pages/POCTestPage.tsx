/**
 * POC Test Page - Technical Verification Dashboard
 */

import { useState } from 'react';
import PixiJSStressTest from '../components/poc/PixiJSStressTest';
import backendAPI, { ApiTestResult } from '../api/backend';

type TestTab = 'pixijs' | 'api' | 'summary';

export function POCTestPage() {
  const [activeTab, setActiveTab] = useState<TestTab>('pixijs');
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
    <div className="min-h-screen bg-dota-bg p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-dota-gold mb-2">
          Technical Verification POC
        </h1>
        <p className="text-gray-400 mb-6">
          Verify core technologies before full development
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('pixijs')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'pixijs'
                ? 'border-b-2 border-dota-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            PixiJS Rendering
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'api'
                ? 'border-b-2 border-dota-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Backend API
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2 -mb-px ${
              activeTab === 'summary'
                ? 'border-b-2 border-dota-accent text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Summary
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'pixijs' && <PixiJSStressTest />}

        {activeTab === 'api' && (
          <div className="bg-dota-surface p-6 rounded-lg">
            <h2 className="text-xl font-bold text-dota-gold mb-4">
              Backend API Test
            </h2>
            <p className="text-gray-400 mb-4">
              Test connection to Python FastAPI backend
            </p>

            <div className="space-y-4">
              {/* Health Check Test */}
              <div className="bg-dota-bg p-4 rounded">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-medium mb-1">Health Check</h3>
                    <code className="text-sm text-gray-400">
                      GET http://localhost:8000/health
                    </code>
                  </div>
                  <button
                    onClick={testHealthCheck}
                    disabled={isTesting}
                    className="px-4 py-2 bg-dota-primary text-white rounded hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
                </div>

                {healthResult && (
                  <div className={`mt-3 p-3 rounded ${
                    healthResult.success 
                      ? 'bg-green-900/30 border border-green-700' 
                      : 'bg-red-900/30 border border-red-700'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        healthResult.success ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className="font-medium">
                        {healthResult.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                      {healthResult.status && (
                        <span className="text-sm text-gray-400">
                          (Status: {healthResult.status})
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
                    <h3 className="font-medium mb-1">List Matches</h3>
                    <code className="text-sm text-gray-400">
                      GET http://localhost:8000/api/v1/matches
                    </code>
                  </div>
                  <button
                    onClick={testMatches}
                    disabled={isTesting}
                    className="px-4 py-2 bg-dota-primary text-white rounded hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? 'Testing...' : 'Test'}
                  </button>
                </div>

                {matchesResult && (
                  <div className={`mt-3 p-3 rounded ${
                    matchesResult.success 
                      ? 'bg-green-900/30 border border-green-700' 
                      : 'bg-red-900/30 border border-red-700'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${
                        matchesResult.success ? 'bg-green-500' : 'bg-red-500'
                      }`}></span>
                      <span className="font-medium">
                        {matchesResult.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                      {matchesResult.status && (
                        <span className="text-sm text-gray-400">
                          (Status: {matchesResult.status})
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
                <h4 className="font-medium mb-2">Backend Status</h4>
                <p className="text-sm text-gray-300">
                  {healthResult?.success 
                    ? '✅ Backend is running and healthy!' 
                    : '⚠️ Make sure backend is running with: '}
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
          <div className="bg-dota-surface p-6 rounded-lg">
            <h2 className="text-xl font-bold text-dota-gold mb-4">
              POC Summary
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Frontend Tests */}
                <div className="bg-dota-bg p-4 rounded">
                  <h3 className="font-medium text-lg mb-3">Frontend</h3>
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
                      PixiJS Rendering
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                      Electron Integration (dev mode)
                    </li>
                  </ul>
                </div>

                {/* Backend Tests */}
                <div className="bg-dota-bg p-4 rounded">
                  <h3 className="font-medium text-lg mb-3">Backend</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        healthResult?.success ? 'bg-green-500' : 'bg-gray-500'
                      }`}></span>
                      FastAPI Server
                      {healthResult?.success && (
                        <span className="text-xs text-green-400">
                          ({healthResult.responseTime}ms)
                        </span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        matchesResult?.success ? 'bg-green-500' : 'bg-gray-500'
                      }`}></span>
                      SQLite Database
                      {matchesResult?.success && (
                        <span className="text-xs text-green-400">
                          ({matchesResult.data?.total ?? 0} matches)
                        </span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Parquet + DuckDB
                      <span className="text-xs text-gray-400">(POC tested)</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Clarity Parser
                      <span className="text-xs text-gray-400">(JAR built)</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Test Status */}
              <div className={`p-4 rounded border ${
                healthResult?.success && matchesResult?.success
                  ? 'bg-green-900/20 border-green-700'
                  : 'bg-yellow-900/20 border-yellow-700'
              }`}>
                <h4 className="font-medium mb-2">Overall Status</h4>
                <p className="text-sm text-gray-300">
                  {healthResult?.success && matchesResult?.success ? (
                    <>
                      ✅ All core systems verified and operational!<br />
                      <span className="text-xs text-gray-400 mt-1 block">
                        Frontend-Backend communication: OK | 
                        API response time: ~{((healthResult.responseTime || 0) + (matchesResult.responseTime || 0)) / 2}ms avg
                      </span>
                    </>
                  ) : (
                    <>
                      ⚠️ Run backend API tests to verify system status
                      <br />
                      <span className="text-xs text-gray-400 mt-1 block">
                        Go to "Backend API" tab and click "Test" buttons
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Next Steps */}
              <div className="bg-dota-primary/20 border border-dota-primary p-4 rounded">
                <h4 className="font-medium mb-2">Next Steps</h4>
                <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                  {!healthResult?.success && (
                    <li>Test backend API connection (Backend API tab)</li>
                  )}
                  {healthResult?.success && !matchesResult?.success && (
                    <li>Test matches endpoint (Backend API tab)</li>
                  )}
                  {healthResult?.success && matchesResult?.success && (
                    <>
                      <li className="line-through text-gray-500">✓ Backend API verified</li>
                      <li>Upload and parse demo files (.dem)</li>
                      <li>Implement 2D map rendering engine</li>
                      <li>Create match viewer interface</li>
                      <li>Build timeline playback controls</li>
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
