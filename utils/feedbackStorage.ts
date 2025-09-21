// Feedback Storage System for English Learning Analytics

export interface FeedbackSession {
  id: string;
  timestamp: Date;
  targetWord: string;
  forbiddenWords: string[];
  userDescription: string;
  coachFeedback: string;
  sessionDuration: number; // in seconds
  mistakeCategories: {
    grammar: string[];
    vocabulary: string[];
    fluency: string[];
    structure: string[];
  };
  improvements: string[];
  difficultyLevel: 'easy' | 'medium' | 'hard';
}

export interface WeeklyAnalysis {
  weekStartDate: Date;
  totalSessions: number;
  wordsAttempted: string[];
  commonMistakes: {
    grammar: { [mistake: string]: number };
    vocabulary: { [mistake: string]: number };
    fluency: { [mistake: string]: number };
    structure: { [mistake: string]: number };
  };
  improvementAreas: string[];
  progressScore: number; // 0-100
  averageSessionDuration: number;
  streakDays: number;
}

export interface UserProgress {
  userId: string;
  totalSessions: number;
  sessionsThisWeek: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: Date;
  overallProgressScore: number;
  weakAreas: string[];
  strongAreas: string[];
}

const STORAGE_KEYS = {
  FEEDBACK_SESSIONS: 'taboo_feedback_sessions',
  USER_PROGRESS: 'taboo_user_progress',
  WEEKLY_ANALYSIS: 'taboo_weekly_analysis'
};

// Storage Functions
export const storeFeedbackSession = (session: FeedbackSession): void => {
  try {
    const existingSessions = getFeedbackSessions();
    const updatedSessions = [...existingSessions, session];
    
    localStorage.setItem(STORAGE_KEYS.FEEDBACK_SESSIONS, JSON.stringify(updatedSessions));
    
    // Update user progress
    updateUserProgress(session);
    
    console.log(`📊 Feedback session stored: ${session.targetWord} - ${session.id}`);
  } catch (error) {
    console.error('Error storing feedback session:', error);
  }
};

export const getFeedbackSessions = (): FeedbackSession[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.FEEDBACK_SESSIONS);
    if (!stored) return [];
    
    const sessions = JSON.parse(stored);
    return sessions.map((session: any) => ({
      ...session,
      timestamp: new Date(session.timestamp)
    }));
  } catch (error) {
    console.error('Error retrieving feedback sessions:', error);
    return [];
  }
};

export const getSessionsThisWeek = (): FeedbackSession[] => {
  const sessions = getFeedbackSessions();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  return sessions.filter(session => session.timestamp >= weekAgo);
};

export const updateUserProgress = (session: FeedbackSession): void => {
  try {
    const progress = getUserProgress();
    const today = new Date().toDateString();
    const lastSessionDay = progress.lastSessionDate ? progress.lastSessionDate.toDateString() : null;
    
    const updatedProgress: UserProgress = {
      ...progress,
      totalSessions: progress.totalSessions + 1,
      sessionsThisWeek: getSessionsThisWeek().length,
      lastSessionDate: session.timestamp,
      currentStreak: lastSessionDay === today ? progress.currentStreak : 
                    (isConsecutiveDay(progress.lastSessionDate, session.timestamp) ? progress.currentStreak + 1 : 1),
    };
    
    updatedProgress.longestStreak = Math.max(updatedProgress.longestStreak, updatedProgress.currentStreak);
    
    localStorage.setItem(STORAGE_KEYS.USER_PROGRESS, JSON.stringify(updatedProgress));
  } catch (error) {
    console.error('Error updating user progress:', error);
  }
};

export const getUserProgress = (): UserProgress => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USER_PROGRESS);
    if (!stored) {
      return {
        userId: 'kez_learner',
        totalSessions: 0,
        sessionsThisWeek: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSessionDate: new Date(),
        overallProgressScore: 0,
        weakAreas: [],
        strongAreas: []
      };
    }
    
    const progress = JSON.parse(stored);
    return {
      ...progress,
      lastSessionDate: new Date(progress.lastSessionDate)
    };
  } catch (error) {
    console.error('Error retrieving user progress:', error);
    return getUserProgress(); // Return default
  }
};

// Analysis Functions
export const generateWeeklyAnalysis = (): WeeklyAnalysis => {
  const weekSessions = getSessionsThisWeek();
  const weekStartDate = new Date();
  weekStartDate.setDate(weekStartDate.getDate() - 7);
  
  const analysis: WeeklyAnalysis = {
    weekStartDate,
    totalSessions: weekSessions.length,
    wordsAttempted: Array.from(new Set(weekSessions.map(s => s.targetWord))),
    commonMistakes: {
      grammar: {},
      vocabulary: {},
      fluency: {},
      structure: {}
    },
    improvementAreas: [],
    progressScore: calculateProgressScore(weekSessions),
    averageSessionDuration: weekSessions.reduce((sum, s) => sum + s.sessionDuration, 0) / weekSessions.length || 0,
    streakDays: getUserProgress().currentStreak
  };
  
  // Analyze common mistakes
  weekSessions.forEach(session => {
    Object.entries(session.mistakeCategories).forEach(([category, mistakes]) => {
      mistakes.forEach(mistake => {
        const cat = category as keyof typeof analysis.commonMistakes;
        analysis.commonMistakes[cat][mistake] = (analysis.commonMistakes[cat][mistake] || 0) + 1;
      });
    });
  });
  
  // Store analysis
  localStorage.setItem(STORAGE_KEYS.WEEKLY_ANALYSIS, JSON.stringify(analysis));
  
  return analysis;
};

export const getWeeklyAnalysis = (): WeeklyAnalysis | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.WEEKLY_ANALYSIS);
    if (!stored) return null;
    
    const analysis = JSON.parse(stored);
    return {
      ...analysis,
      weekStartDate: new Date(analysis.weekStartDate)
    };
  } catch (error) {
    console.error('Error retrieving weekly analysis:', error);
    return null;
  }
};

// Utility Functions
const isConsecutiveDay = (lastDate: Date, currentDate: Date): boolean => {
  const timeDiff = currentDate.getTime() - lastDate.getTime();
  const dayDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return dayDiff === 1;
};

const calculateProgressScore = (sessions: FeedbackSession[]): number => {
  if (sessions.length === 0) return 0;
  
  // Score based on consistency, variety of words, and session completion
  const consistencyScore = Math.min(sessions.length * 10, 50); // Max 50 for consistency
  const varietyScore = Math.min(Array.from(new Set(sessions.map(s => s.targetWord))).length * 5, 30); // Max 30 for variety
  const completionScore = sessions.filter(s => s.coachFeedback.length > 100).length * 4; // Max 20 for quality
  
  return Math.min(consistencyScore + varietyScore + completionScore, 100);
};

// Export functions for debugging and management
export const clearAllData = (): void => {
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  console.log('🗑️ All feedback data cleared');
};

export const exportData = (): string => {
  const data = {
    sessions: getFeedbackSessions(),
    progress: getUserProgress(),
    weeklyAnalysis: getWeeklyAnalysis()
  };
  return JSON.stringify(data, null, 2);
};

export const importData = (jsonData: string): boolean => {
  try {
    const data = JSON.parse(jsonData);
    
    if (data.sessions) {
      localStorage.setItem(STORAGE_KEYS.FEEDBACK_SESSIONS, JSON.stringify(data.sessions));
    }
    if (data.progress) {
      localStorage.setItem(STORAGE_KEYS.USER_PROGRESS, JSON.stringify(data.progress));
    }
    if (data.weeklyAnalysis) {
      localStorage.setItem(STORAGE_KEYS.WEEKLY_ANALYSIS, JSON.stringify(data.weeklyAnalysis));
    }
    
    console.log('📥 Data imported successfully');
    return true;
  } catch (error) {
    console.error('Error importing data:', error);
    return false;
  }
};
