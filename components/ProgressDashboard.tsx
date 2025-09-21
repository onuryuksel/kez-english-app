import React, { useState, useEffect } from 'react';
import { 
  getUserProgress, 
  getWeeklyAnalysis, 
  getSessionsThisWeek, 
  getFeedbackSessions,
  type WeeklyAnalysis,
  type UserProgress,
  type FeedbackSession
} from '../utils/feedbackStorage';

interface ProgressDashboardProps {
  isVisible: boolean;
  onClose: () => void;
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ isVisible, onClose }) => {
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [weeklyAnalysis, setWeeklyAnalysis] = useState<WeeklyAnalysis | null>(null);
  const [recentSessions, setRecentSessions] = useState<FeedbackSession[]>([]);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'mistakes' | 'progress'>('overview');

  useEffect(() => {
    if (isVisible) {
      refreshData();
    }
  }, [isVisible]);

  const refreshData = () => {
    setUserProgress(getUserProgress());
    setWeeklyAnalysis(getWeeklyAnalysis());
    setRecentSessions(getSessionsThisWeek());
  };

  if (!isVisible) return null;

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-800">Total Sessions</h3>
          <p className="text-2xl font-bold text-blue-600">{userProgress?.totalSessions || 0}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-800">Current Streak</h3>
          <p className="text-2xl font-bold text-green-600">{userProgress?.currentStreak || 0} days</p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="font-semibold text-purple-800">This Week</h3>
          <p className="text-2xl font-bold text-purple-600">{recentSessions.length} sessions</p>
        </div>
        <div className="bg-orange-50 p-4 rounded-lg">
          <h3 className="font-semibold text-orange-800">Progress Score</h3>
          <p className="text-2xl font-bold text-orange-600">{weeklyAnalysis?.progressScore || 0}/100</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Recent Words Practiced</h3>
        <div className="flex flex-wrap gap-2">
          {recentSessions.slice(0, 10).map(session => (
            <span 
              key={session.id}
              className="px-3 py-1 bg-gray-100 rounded-full text-sm font-medium"
            >
              {session.targetWord}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const renderMistakes = () => {
    if (!weeklyAnalysis) return <p>No data available</p>;

    const allMistakes = [
      ...Object.entries(weeklyAnalysis.commonMistakes.grammar).map(([mistake, count]) => ({ category: 'Grammar', mistake, count })),
      ...Object.entries(weeklyAnalysis.commonMistakes.vocabulary).map(([mistake, count]) => ({ category: 'Vocabulary', mistake, count })),
      ...Object.entries(weeklyAnalysis.commonMistakes.fluency).map(([mistake, count]) => ({ category: 'Fluency', mistake, count })),
      ...Object.entries(weeklyAnalysis.commonMistakes.structure).map(([mistake, count]) => ({ category: 'Structure', mistake, count }))
    ].sort((a, b) => b.count - a.count);

    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Common Mistakes This Week</h3>
        {allMistakes.length === 0 ? (
          <p className="text-gray-500">No mistakes identified yet. Keep practicing!</p>
        ) : (
          <div className="space-y-3">
            {allMistakes.slice(0, 10).map((item, index) => (
              <div key={index} className="bg-white border rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      item.category === 'Grammar' ? 'bg-red-100 text-red-800' :
                      item.category === 'Vocabulary' ? 'bg-blue-100 text-blue-800' :
                      item.category === 'Fluency' ? 'bg-green-100 text-green-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {item.category}
                    </span>
                    <p className="mt-2 text-sm">{item.mistake}</p>
                  </div>
                  <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">
                    {item.count}x
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProgress = () => (
    <div className="space-y-6">
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-semibold mb-3">Learning Journey</h3>
        <div className="space-y-4">
          {recentSessions.slice(0, 5).map(session => (
            <div key={session.id} className="border-l-4 border-blue-400 pl-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{session.targetWord}</h4>
                  <p className="text-sm text-gray-600">
                    {new Date(session.timestamp).toLocaleDateString()} • {session.sessionDuration}s
                  </p>
                  <p className="text-sm mt-1 text-gray-800">{session.userDescription}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  session.difficultyLevel === 'easy' ? 'bg-green-100 text-green-800' :
                  session.difficultyLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {session.difficultyLevel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {userProgress && (
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-semibold mb-3">Areas for Improvement</h3>
          {userProgress.weakAreas.length === 0 ? (
            <p className="text-gray-500">Keep practicing to identify areas for improvement!</p>
          ) : (
            <div className="space-y-2">
              {userProgress.weakAreas.map((area, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-red-800">{area}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-800">📊 Learning Progress</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="flex border-b">
          {[
            { id: 'overview', label: '📈 Overview' },
            { id: 'mistakes', label: '🎯 Common Mistakes' },
            { id: 'progress', label: '📚 Sessions' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`px-6 py-3 font-medium ${
                selectedTab === tab.id
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {selectedTab === 'overview' && renderOverview()}
          {selectedTab === 'mistakes' && renderMistakes()}
          {selectedTab === 'progress' && renderProgress()}
        </div>

        <div className="border-t p-4 bg-gray-50">
          <button 
            onClick={refreshData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            🔄 Refresh Data
          </button>
        </div>
      </div>
    </div>
  );
};
