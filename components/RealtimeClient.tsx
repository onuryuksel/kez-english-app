import { useEffect, useRef, useState } from "react";
import { TABOO_WORDS } from "../lib/tabooWords";
import { GAME_MODE_PROMPTS } from "../lib/coachPrompt";
import { 
  storeFeedbackSession, 
  generateWeeklyAnalysis, 
  getUserProgress, 
  getSessionsThisWeek,
  type FeedbackSession 
} from "../utils/feedbackStorage";
import { ProgressDashboard } from "./ProgressDashboard";

// Log levels for cleaner debugging
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1, 
  INFO: 2,
  DEBUG: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS.DEBUG; // Temporary DEBUG for forbidden word debugging // Temporary DEBUG for forbidden word debugging

const log = {
  error: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) console.error("❌", ...args);
  },
  warn: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.WARN) console.warn("⚠️", ...args);
  },
  info: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) console.log("ℹ️", ...args);
  },
  debug: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.DEBUG) console.log("🔍", ...args);
  },
  success: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) console.log("✅", ...args);
  },
  game: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) console.log("🎮", ...args);
  },
  ai: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) console.log("🤖", ...args);
  },
  user: (...args: any[]) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.INFO) console.log("🎤", ...args);
  }
};

type Pace = "slow"|"medium"|"fast";
type GameMode = "casual"|"roleplay"|"taboo";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isComplete: boolean;
  sequence: number;
}

// TABOO_WORDS imported from lib/tabooWords.ts
// 180+ cache-optimized words for endless fun! 🎯

const GAME_MODES = {
  casual: {
    name: "💬 Casual Chat",
    description: "Natural conversation with instant corrections! 🎯",
    color: "#4CAF50",
    bgColor: "#E8F5E8"
  },
  roleplay: {
    name: "🎭 Role Play", 
    description: "Practice English in real-life scenarios! 🎬",
    color: "#FF9800",
    bgColor: "#FFF3E0"
  },
  taboo: {
    name: "🚫 Taboo Game",
    description: "Improve speaking skills through word games! 🎲",
    color: "#E91E63",
    bgColor: "#FCE4EC"
  }
};

export default function RealtimeClient() {
  // Debug render count
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  if (renderCountRef.current % 10 === 0) { // Only log every 10th render
    console.log(`🚀 RealtimeClient render #${renderCountRef.current}`);
  }
  const [connected, setConnected] = useState(false);
  const [pace, setPace] = useState<Pace>("medium");
  const [gameMode, setGameMode] = useState<GameMode>("taboo");
  const [status, setStatus] = useState<string>("ready");
  const [lastJson, setLastJson] = useState<any>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [currentUserMessage, setCurrentUserMessage] = useState<string>("");
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState<string>("");
  
  // Track AI response timing for accurate timestamps
  const aiResponseStartTime = useRef<number | null>(null);
  // Track user speech end time for accurate timestamps
  const userSpeechEndTime = useRef<number | null>(null);
  const [isInFeedbackMode, setIsInFeedbackMode] = useState<boolean>(false);
  const isInFeedbackModeRef = useRef<boolean>(false);
  const [currentWordGuessed, setCurrentWordGuessed] = useState<boolean>(false);
  const [userDescriptionForFeedback, setUserDescriptionForFeedback] = useState<string>("");
  const [feedbackSessionStart, setFeedbackSessionStart] = useState<Date | null>(null);
  const [showProgressDashboard, setShowProgressDashboard] = useState<boolean>(false);
  const messageSequenceRef = useRef(0);
  
  // Timeline fix: Buffer for proper ordering
  const [pendingUserMessage, setPendingUserMessage] = useState<{
    id: string;
    content: string;
    timestamp: Date;
  } | null>(null);
  const [pendingGameLogic, setPendingGameLogic] = useState<{
    aiMessage: string;
    aiTimestamp: Date;
    callback: () => void;
  }[]>([]);
  const processingGameLogicRef = useRef(false);
  
  // Priority System: Prevent duplicate detection processing
  const [functionCallDetected, setFunctionCallDetected] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Hybrid Word Progression System
  const [showWordProgression, setShowWordProgression] = useState(false);
  const [progressionCountdown, setProgressionCountdown] = useState(8);
  const [progressionTimer, setProgressionTimer] = useState<NodeJS.Timeout | null>(null);
  const [progressionReason, setProgressionReason] = useState<'correct_guess' | 'forbidden_word' | null>(null);
  
  // Taboo Game States
  const [currentWord, setCurrentWord] = useState<typeof TABOO_WORDS[0] | null>(null);
  const [tabooScore, setTabooScore] = useState(0);
  const [usedWords, setUsedWords] = useState<string[]>([]);
  
  // Advanced Taboo Rules - Forbidden Word Status 🚫➡️✅
  const [forbiddenWordStatus, setForbiddenWordStatus] = useState<{
    [word: string]: 'active' | 'unlocked'
  }>({});
  const forbiddenWordStatusRef = useRef<{[word: string]: 'active' | 'unlocked'}>({});
  const currentWordRef = useRef<typeof TABOO_WORDS[0] | null>(null);
  const [gameRoundActive, setGameRoundActive] = useState(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    forbiddenWordStatusRef.current = forbiddenWordStatus;
  }, [forbiddenWordStatus]);

  useEffect(() => {
    currentWordRef.current = currentWord;
    console.log(`🔧 CURRENT WORD REF SYNC: ${currentWord?.word || 'null'} - DEBUG`);
  }, [currentWord]);
  
  // Synchronize feedback mode ref with state
  useEffect(() => {
    isInFeedbackModeRef.current = isInFeedbackMode;
    console.log(`🔧 FEEDBACK MODE REF SYNC: ${isInFeedbackMode}`);
  }, [isInFeedbackMode]);
  
  // Enhanced buzzer popup state 🚨
  const [buzzerPopup, setBuzzerPopup] = useState<{
    show: boolean, 
    word: string, 
    message: string,
    showChoices: boolean,
    type: 'forbidden' | 'correct'
  }>({
    show: false,
    word: '',
    message: '',
    showChoices: false,
    type: 'forbidden'
  });
  const [recentlyUnlocked, setRecentlyUnlocked] = useState<string[]>([]);
  
  // Token usage tracking 💰
  const [sessionUsage, setSessionUsage] = useState<{
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    inputAudioTokens: number;
    outputAudioTokens: number;
    cost: number;
  } | null>(null);
  const [showUsageStats, setShowUsageStats] = useState(false);
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [silenceDuration, setSilenceDuration] = useState<number>(3500); // Default 3.5 seconds
  const [selectedVoice, setSelectedVoice] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' | 'verse'>('verse'); // Default voice
  
  // Voice Activity Tuning - Kullanıcı davranış analizi 🎯
  const [speechAnalytics, setSpeechAnalytics] = useState({
    totalSpeechEvents: 0,
    averageSpeechDuration: 0,
    averagePauseDuration: 0,
    interruptionCount: 0,
    backgroundNoiseLevel: 0.5,
    optimalThreshold: 0.8,
    optimalSilenceDuration: 3500,
    lastSpeechStart: 0,
    lastSpeechEnd: 0,
    speechDurations: [] as number[],
    pauseDurations: [] as number[]
  });

  const pcRef = useRef<RTCPeerConnection|null>(null);
  const dcRef = useRef<RTCDataChannel|null>(null);
  const micStreamRef = useRef<MediaStream|null>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (conversationEndRef.current) {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversation, currentUserMessage, currentAssistantMessage]);

  // Push-to-talk functionality
  useEffect(() => {
    if (connected && micStreamRef.current && isPushToTalk) {
      const tracks = micStreamRef.current.getAudioTracks();
      tracks.forEach(track => {
        track.enabled = isRecording;
      });
    }
  }, [isRecording, connected, isPushToTalk]);

  // Voice Activity Analytics Functions 🎯
  const analyzeSpeechPattern = (speechStart: number, speechEnd: number) => {
    const speechDuration = speechEnd - speechStart;
    const pauseDuration = speechStart - speechAnalytics.lastSpeechEnd;
    
    setSpeechAnalytics(prev => {
      const newSpeechDurations = [...prev.speechDurations, speechDuration].slice(-10); // Son 10 konuşma
      const newPauseDurations = pauseDuration > 0 ? [...prev.pauseDurations, pauseDuration].slice(-10) : prev.pauseDurations;
      
      const avgSpeechDuration = newSpeechDurations.reduce((a, b) => a + b, 0) / newSpeechDurations.length;
      const avgPauseDuration = newPauseDurations.length > 0 ? newPauseDurations.reduce((a, b) => a + b, 0) / newPauseDurations.length : prev.averagePauseDuration;
      
      // Optimal ayarları hesapla
      const optimalSilence = Math.max(1000, Math.min(5000, avgPauseDuration * 1.2)); // 1-5 saniye arası
      const optimalThreshold = prev.backgroundNoiseLevel + 0.2; // Arka plan sesinin üstünde
      
      console.log("🎯 Speech Analytics Updated:", {
        speechDuration,
        pauseDuration,
        avgSpeechDuration,
        avgPauseDuration,
        optimalSilence,
        optimalThreshold
      });
      
      return {
        ...prev,
        totalSpeechEvents: prev.totalSpeechEvents + 1,
        averageSpeechDuration: avgSpeechDuration,
        averagePauseDuration: avgPauseDuration,
        optimalThreshold: optimalThreshold,
        optimalSilenceDuration: optimalSilence,
        lastSpeechStart: speechStart,
        lastSpeechEnd: speechEnd,
        speechDurations: newSpeechDurations,
        pauseDurations: newPauseDurations
      };
    });
  };

  const applyOptimalSettings = () => {
    if (speechAnalytics.totalSpeechEvents >= 3) { // En az 3 konuşma sonrası optimize et
      console.log("🎯 Applying optimal VAD settings:", {
        threshold: speechAnalytics.optimalThreshold,
        silenceDuration: speechAnalytics.optimalSilenceDuration
      });
      
      sendSessionUpdate(pace, gameMode, speechAnalytics.optimalSilenceDuration, true);
    }
  };

  // Advanced Taboo Game Functions 🎮
  
  // Forbidden word analysis
  const checkForbiddenWords = (text: string, speaker: 'user' | 'ai') => {
    log.debug(`🔍 Checking forbidden words for ${speaker}: "${text}"`);
    
    // Use REF for immediate access to current word (not stale React state)
    const currentWordRef_current = currentWordRef.current;
    log.debug(`🎮 Current word: ${currentWordRef_current?.word}, Round active: ${gameRoundActive}`);
    
    // 🎓 SKIP forbidden word detection during feedback mode
    if (isInFeedbackModeRef.current) {
      log.debug("🎓 FEEDBACK MODE: Skipping forbidden word check - game paused for coaching");
      return;
    }
    
    if (!currentWordRef_current || !gameRoundActive) {
      log.debug("❌ Skipping forbidden word check - no current word or round not active");
      return;
    }
    
    const lowerText = text.toLowerCase();
    
    // Get CURRENT state (not stale) using useRef for immediate access
    const currentStatus = forbiddenWordStatusRef.current;
    console.log(`🔍 CURRENT FORBIDDEN WORD STATUS: ${JSON.stringify(currentStatus)} - DEBUG`);
    
    const activeForbiddenWords = currentWordRef_current.forbidden.filter((word: string) => 
      currentStatus[word] !== 'unlocked'
    );
    const unlockedWords = currentWordRef_current.forbidden.filter((word: string) => 
      currentStatus[word] === 'unlocked'
    );
    
    console.log(`🚫 ACTIVE forbidden words: [${activeForbiddenWords.join(', ')}] - DEBUG`);
    console.log(`🔓 UNLOCKED forbidden words: [${unlockedWords.join(', ')}] - DEBUG`);
    
    for (const forbiddenWord of currentWordRef_current.forbidden) {
      if (lowerText.includes(forbiddenWord.toLowerCase())) {
        const isUnlocked = currentStatus[forbiddenWord] === 'unlocked';
        
        log.warn(`🚫 Forbidden word detected: "${forbiddenWord}" by ${speaker} - Status: ${isUnlocked ? 'UNLOCKED' : 'ACTIVE'}`);
        
        if (isUnlocked) {
          console.log(`✅ Word "${forbiddenWord}" is unlocked - ${speaker} can use it freely - DEBUG`);
          return; // Don't process unlocked words
        }
        
        if (speaker === 'ai') {
          // AI said forbidden word - unlock it!
          unlockForbiddenWord(forbiddenWord);
        } else {
          // User said ACTIVE forbidden word - buzzer!
          handleUserForbiddenWord(forbiddenWord);
        }
        break;
      }
    }
  };
  
  const unlockForbiddenWord = (word: string) => {
    log.game(`Word unlocked: "${word}"`);
    
    setForbiddenWordStatus(prev => {
      const newStatus = {
        ...prev,
        [word]: 'unlocked' as const
      };
      
      // Update ref immediately for immediate access
      forbiddenWordStatusRef.current = newStatus;
      
      // Debug log with updated status
      console.log(`🔓 WORD UNLOCKED: "${word}" - New status: ${JSON.stringify(newStatus)} - DEBUG`);
      return newStatus;
    });
    
    // Animation için recently unlocked'a ekle
    setRecentlyUnlocked(prev => [...prev, word]);
    
    // 3 saniye sonra animation'ı kaldır
    setTimeout(() => {
      setRecentlyUnlocked(prev => prev.filter(w => w !== word));
    }, 3000);
    
    // AI'a unlock durumunu bildir - but don't treat as final answer
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ 
            type: "input_text", 
            text: `System: AI correctly guessed forbidden word "${word}" - this unlocks it for Kez. This is NOT the final answer, just unlocking strategy. Wait for the main word.` 
          }]
        }
      }));
      
      // Safe AI response request - acknowledge unlock but don't celebrate as final
      createSafeResponse(`Ah, you're unlocking "${word}"! Smart strategy, Kez. Ready for the main word?`);
    }
  };
  
  const handleUserForbiddenWord = (word: string) => {
    log.warn(`User used forbidden word: "${word}"`);
    
    // 1. IMMEDIATELY STOP AI SPEAKING
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "response.cancel"
      }));
      console.log("⏹️ CANCELLED ACTIVE AI RESPONSE - Forbidden word detected");
    }
    
    // 2. PAUSE GAME - Prevent AI from responding during popup
    setGameRoundActive(false);
    console.log(`🚨 GAME PAUSED - Forbidden word "${word}" used - DEBUG`);
    
    // 3. NOTIFY AI ABOUT FORBIDDEN WORD
    if (dcRef.current && dcRef.current.readyState === "open") {
      const notification = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: `🚨 GAME EVENT: Kez used forbidden word "${word}". You should acknowledge this was forbidden and wait for the next instruction. Do not continue with the previous topic.`
          }]
        }
      };
      dcRef.current.send(JSON.stringify(notification));
      console.log(`📢 NOTIFIED AI: Forbidden word "${word}" used`);
    }
    
    // 4. CLEAR ANY CURRENT AI MESSAGE
    setCurrentAssistantMessage("");
    
    // 5. Enhanced buzzer popup with choices - NO TIMER!
    setBuzzerPopup({
      show: true,
      word: word,
      message: `🚨 BUZZER! Kez used forbidden word "${word}"`,
      showChoices: true,
      type: 'forbidden'
    });
    
    // DON'T auto-close popup - wait for user choice
    console.log(`🚨 FORBIDDEN WORD USED: "${word}" - Waiting for user choice - DEBUG`);
  };

  // Enhanced buzzer popup choice handlers
  const handleBuzzerContinue = () => {
    console.log("🔄 User chose to continue with current word from buzzer - DEBUG");
    
    // Close buzzer popup
    setBuzzerPopup({
      show: false,
      word: '',
      message: '',
      showChoices: false,
      type: 'forbidden'
    });
    
    // RESUME GAME - Re-enable AI responses
    setGameRoundActive(true);
    console.log(`🎮 GAME RESUMED - Continuing with current word - DEBUG`);
    
    // AI acknowledgment
    createSafeResponse(`Great! Let's continue with "${currentWord?.word}". Try describing it in a different way!`);
  };

  const handleBuzzerNextWord = () => {
    console.log("➡️ User chose to progress to next word from buzzer - DEBUG");
    
    // Close buzzer popup
    setBuzzerPopup({
      show: false,
      word: '',
      message: '',
      showChoices: false,
      type: 'forbidden'
    });
    
    // Notify AI about forbidden word usage
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: `Kez used a forbidden word. Please acknowledge this briefly and announce we're moving to a new word. Be encouraging!`
          }]
        }
      }));
    }
    
    // Progress to next word
    autoProgressToNextWord();
  };

  // NEW: Get feedback from coach about how to describe word
  const handleGetCoachFeedback = async () => {
    if (!currentWord) return;
    
    console.log("📝 User requested coach feedback for:", currentWord.word);
    
    // First close the buzzer popup and activate feedback mode
    setBuzzerPopup({
      show: false,
      word: '',
      message: '',
      showChoices: false,
      type: 'forbidden'
    });
    setGameRoundActive(true); // Resume game for AI responses
    setIsInFeedbackMode(true); // Activate feedback mode
    isInFeedbackModeRef.current = true; // Immediate ref update for synchronous access
    setFeedbackSessionStart(new Date()); // Start timing the feedback session
    
    console.log("💬 FEEDBACK MODE ACTIVATED - AI should be able to respond now");
    
    // Check connection status and recover if needed
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      console.log("🔌 DataChannel closed, attempting full reconnection...");
      
      try {
        // Clean up old connection
        if (pcRef.current) {
          pcRef.current.close();
        }
        
      // Start fresh connection
      await connect();
      
      // Wait for connection to stabilize, then send feedback
      setTimeout(() => {
        // Double-check connection after reconnect
        if (dcRef.current && dcRef.current.readyState === "open") {
          sendFeedbackRequest();
        } else {
          console.error("❌ Reconnection failed - DataChannel still not ready");
          alert("Reconnection failed! Please refresh the page.");
        }
      }, 3000); // Increased wait time
        
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
        alert("Connection failed! Please refresh the page.");
        return;
      }
    } else {
      // Connection is good, wait for any ongoing DataChannel operations to complete
      console.log("✅ DataChannel ready, sending feedback request");
      // Wait for React state updates AND any ongoing DataChannel operations - increased to 1000ms
      setTimeout(() => {
        sendFeedbackRequest();
      }, 1000);
    }
  };
  
  // Helper function to send feedback request
  const sendFeedbackRequest = () => {
    if (!currentWord) return;
    
    console.log(`📢 Sending feedback request to AI coach`);
    console.log(`🔍 FEEDBACK REQUEST DEBUG - gameRoundActive: ${gameRoundActive}, buzzerPopup.show: ${buzzerPopup.show}, isInFeedbackMode: ${isInFeedbackMode}, REF: ${isInFeedbackModeRef.current}`);
    
    // Double-check DataChannel state before sending
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      console.log("❌ DataChannel not ready for feedback request");
      alert("Connection lost! Please refresh the page to get coach feedback.");
      return;
    }
    
    console.log("🔍 DataChannel state confirmed - proceeding with feedback request");
    
        // Send voice feedback request to AI
        try {
        const feedbackPrompt = `🎯 ENGLISH COACH FEEDBACK MODE ACTIVATED! 
        
        You are Kez's English teacher providing personalized language learning feedback. Kez just described the word "${currentWord.word}" and wants to improve her English.
        
        📚 STUDENT'S DESCRIPTION:
        "${userDescriptionForFeedback || "No description recorded yet"}"
        
        🎯 TARGET WORD: ${currentWord.word}
        🚫 FORBIDDEN WORDS: ${currentWord.forbidden.join(", ")}
        
        IMPORTANT FORMATTING: Please structure your feedback with clear sections and line breaks. Use this exact format:
        
        1. 🎉 ENCOURAGEMENT: 
        [Praise what she did well in her description]
        
        2. ✏️ GRAMMAR & STRUCTURE: 
        [Point out any grammar mistakes, incorrect verb tenses, or sentence structure issues with specific corrections]
        
        3. 📖 VOCABULARY: 
        [Suggest better word choices or more natural expressions she could have used]
        
        4. 🗣️ FLUENCY: 
        [Comment on sentence flow and natural English expression]
        
        5. 💡 BETTER DESCRIPTION: 
        [Show how YOU would describe the target word WITHOUT using any forbidden words OR the target word itself]
        
        Remember: Be specific and focus on Kez's actual mistakes. No generic advice!`;

      // Send system message first
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: feedbackPrompt
          }]
        }
      }));
      
      console.log("✅ System message sent - requesting AI response");
      
          // Wait a moment, then request AI response
          setTimeout(() => {
            if (dcRef.current && dcRef.current.readyState === "open") {
              try {
                dcRef.current.send(JSON.stringify({
                  type: "response.create"
                }));
                console.log("🎤 AI Coach feedback response requested!");
              } catch (error) {
                console.error("❌ Error sending response.create:", error);
                alert("Connection error during feedback request. Please try again.");
              }
            } else {
              console.log("❌ DataChannel closed before response request");
              alert("Connection lost! Please refresh the page to get coach feedback.");
            }
          }, 500); // Increased delay to prevent connection overload
      
    } catch (error) {
      console.error("❌ Error sending feedback request:", error);
      alert("Failed to send feedback request. Please try again.");
    }
  };

  // NEW: Move to next word manually (after feedback)
  // Feedback Storage Function
  const storeFeedbackSessionData = (coachFeedback: string) => {
    if (!currentWord || !feedbackSessionStart) return;
    
    const sessionEnd = new Date();
    const sessionDuration = Math.round((sessionEnd.getTime() - feedbackSessionStart.getTime()) / 1000);
    
    // Parse feedback to extract mistake categories (simple keyword-based analysis)
    const mistakeCategories = {
      grammar: extractMistakes(coachFeedback, ['grammar', 'verb', 'tense', 'subject', 'agreement', 'sentence structure']),
      vocabulary: extractMistakes(coachFeedback, ['vocabulary', 'word choice', 'expression', 'phrase', 'better word']),
      fluency: extractMistakes(coachFeedback, ['fluency', 'flow', 'natural', 'smooth', 'awkward', 'choppy']),
      structure: extractMistakes(coachFeedback, ['structure', 'organization', 'order', 'arrangement', 'layout'])
    };
    
    const improvements = extractImprovements(coachFeedback);
    
    const feedbackSession: FeedbackSession = {
      id: `session-${Date.now()}`,
      timestamp: feedbackSessionStart,
      targetWord: currentWord.word,
      forbiddenWords: currentWord.forbidden,
      userDescription: userDescriptionForFeedback,
      coachFeedback: coachFeedback,
      sessionDuration: sessionDuration,
      mistakeCategories: mistakeCategories,
      improvements: improvements,
      difficultyLevel: currentWord.forbidden.length > 4 ? 'hard' : currentWord.forbidden.length > 2 ? 'medium' : 'easy'
    };
    
    // Store the session
    storeFeedbackSession(feedbackSession);
    
    // Generate updated weekly analysis
    const weeklyAnalysis = generateWeeklyAnalysis();
    
    console.log(`📊 FEEDBACK SESSION STORED: ${currentWord.word} (${sessionDuration}s)`);
    console.log(`📈 Weekly Progress: ${weeklyAnalysis.progressScore}/100`);
    
    // Reset session timing
    setFeedbackSessionStart(null);
  };

  // Helper function to extract mistake categories from feedback
  const extractMistakes = (feedback: string, keywords: string[]): string[] => {
    const mistakes: string[] = [];
    const feedbackLower = feedback.toLowerCase();
    
    keywords.forEach(keyword => {
      if (feedbackLower.includes(keyword)) {
        // Find context around the keyword
        const keywordIndex = feedbackLower.indexOf(keyword);
        const start = Math.max(0, keywordIndex - 30);
        const end = Math.min(feedback.length, keywordIndex + 50);
        const context = feedback.substring(start, end).trim();
        mistakes.push(context);
      }
    });
    
    return mistakes;
  };

  // Helper function to extract improvements from feedback
  const extractImprovements = (feedback: string): string[] => {
    const improvements: string[] = [];
    const improvementMarkers = ['try', 'instead', 'better', 'improve', 'suggestion', 'tip'];
    
    improvementMarkers.forEach(marker => {
      const regex = new RegExp(`${marker}[^.!?]*[.!?]`, 'gi');
      const matches = feedback.match(regex);
      if (matches) {
        improvements.push(...matches.map(match => match.trim()));
      }
    });
    
    return improvements;
  };

  const handleMoveToNextWord = () => {
    console.log("⏭️ Manual move to next word requested");
    setIsInFeedbackMode(false); // Exit feedback mode
    isInFeedbackModeRef.current = false; // Immediate ref update
    setFeedbackSessionStart(null); // Reset session timing
    
    // Inform AI that we're resuming normal taboo game
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: `🎮 FEEDBACK SESSION ENDED - MOVING TO NEW WORD! 

The feedback session is complete and we are moving to a fresh new word now. 
No forbidden words were used - this is just a normal progression to the next word.

You are the GUESSER again. Wait for Kez to describe the NEW word and try to guess it. Ready for the next challenge!`
          }]
        }
      }));
      console.log("🎮 Informed AI: Back to taboo mode");
      
      // Wait a moment for the system message to be processed before progressing
      setTimeout(() => {
        progressToNextWord();
      }, 1000);
    } else {
      // If DataChannel is closed, just progress normally
      progressToNextWord();
    }
  };

  const getNewTabooWord = () => {
    const availableWords = TABOO_WORDS.filter(w => !usedWords.includes(w.word));
    if (availableWords.length === 0) {
      // Tüm kelimeler kullanıldı, resetle
      setUsedWords([]);
      const randomWord = TABOO_WORDS[Math.floor(Math.random() * TABOO_WORDS.length)];
      setCurrentWord(randomWord);
      setUsedWords([randomWord.word]);
    } else {
      const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
      setCurrentWord(randomWord);
      setUsedWords(prev => [...prev, randomWord.word]);
    }
    
    // Don't call initializeForbiddenWords() here - let useEffect handle it
    // This prevents state race conditions
  };

  const initializeForbiddenWords = () => {
    if (currentWord) {
      const initialStatus: { [word: string]: 'active' | 'unlocked' } = {};
      currentWord.forbidden.forEach(word => {
        initialStatus[word] = 'active';
      });
      setForbiddenWordStatus(initialStatus);
      setCurrentWordGuessed(false); // Reset for new word
      setUserDescriptionForFeedback(""); // Clear previous descriptions
      setFeedbackSessionStart(null); // Reset session timing
      
      // Note: Conversation clearing moved to manual word progression only
      // setConversation([]) moved to specific user actions like skip/nextWord
      console.log("🎮 Forbidden words initialized - conversation preserved - DEBUG");
      
      setGameRoundActive(true);
      console.log("🎮 New Taboo round started - all forbidden words active:", currentWord.forbidden);
      
      // Inform AI about the new word and round
      if (dcRef.current && dcRef.current.readyState === "open") {
        dcRef.current.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "system",
            content: [{
              type: "input_text",
              text: `🎯 NEW TABOO ROUND! 

TARGET WORD: ${currentWord.word}
FORBIDDEN WORDS: ${currentWord.forbidden.join(", ")}

You are the GUESSER. Kez will now describe this word and you need to guess it. Listen carefully to her description and make your best guesses!`
            }]
          }
        }));
        console.log(`📢 Informed AI: New round started with word "${currentWord.word}"`);
      }
    }
  };

  const nextTabooWord = () => {
    console.log("✅ User marked word as correct - clearing conversation for fresh start");
    setConversation([]);
    messageSequenceRef.current = 0;
    setTabooScore(prev => prev + 1);
    getNewTabooWord();
  };

  const skipTabooWord = () => {
    console.log("⏭️ User manually skipped word - clearing conversation for fresh start");
    setConversation([]);
    messageSequenceRef.current = 0;
    getNewTabooWord();
  };

  // Function Call Handler - Phase 2 🎮
  const handleTabooFunctionCall = (msg: any) => {
    if (msg.name === "taboo_guess_result") {
      const args = JSON.parse(msg.arguments || "{}");
      log.game("🎯 Taboo function call:", args);
      
      const { guessed_word, is_correct, confidence, action } = args;
      
      if (action === "correct" && is_correct && currentWord) {
        // AI doğru tahmin etti!
        const actualWord = currentWord.word.toLowerCase();
        const guessedWord = guessed_word.toLowerCase();
        
        // Kelime eşleşmesini kontrol et (fuzzy matching)
        const isMatch = actualWord === guessedWord || 
                       actualWord.includes(guessedWord) || 
                       guessedWord.includes(actualWord);
        
        if (isMatch) {
          console.log("🎉 Correct guess confirmed!");
          handleCorrectGuess(guessed_word, confidence);
        } else {
          console.log("❌ Guess doesn't match target word");
          sendFunctionResponse(msg.call_id, {
            success: false,
            message: "That's not the word I'm thinking of. Keep guessing!"
          });
        }
      } else {
        // Normal guess attempt
        sendFunctionResponse(msg.call_id, {
          success: true,
          message: confidence > 0.8 ? "Good guess! Tell me more." : "Interesting guess, but not quite right."
        });
      }
    }
  };

  // Enhanced Pattern Matching: Smart context-aware guess detection
  const checkTargetWordVariations = (text: string, targetWord: string): boolean => {
    const word = targetWord.toLowerCase();
    const lowerText = text.toLowerCase();
    
    console.log(`🔍 WORD DETECTION DEBUG: Looking for "${word}" in "${lowerText}"`);
    
    const patterns = [
      // 1. Exact match
      new RegExp(`\\b${word}\\b`),
      
      // 2. Plural form ✅ "footballs"  
      new RegExp(`\\b${word}s\\b`),
      
      // 3. Compound words ✅ "football-related", "football-style"
      new RegExp(`\\b${word}-\\w+`),
      new RegExp(`\\w+-${word}\\b`),
      
      // 4. Possessive ✅ "football's"
      new RegExp(`\\b${word}'s\\b`),
      
      // 5. With articles ✅ "a football", "the football"
      new RegExp(`\\ba ${word}\\b`),
      new RegExp(`\\bthe ${word}\\b`)
    ];
    
    const matchFound = patterns.some(pattern => {
      const matches = pattern.test(lowerText);
      if (matches) {
        console.log(`🎯 PATTERN MATCH: "${pattern}" found "${word}" in text`);
      }
      return matches;
    });
    
    console.log(`🔍 WORD DETECTION RESULT: ${matchFound ? "FOUND" : "NOT FOUND"}`);
    return matchFound;
  };

  const isActualGuess = (aiText: string, targetWord: string): boolean => {
    const guessKeywords = [
      'could it be', 'is it', 'maybe', 'perhaps', 
      'think it', 'guess it', 'might be', 'seems like',
      'looks like', 'sounds like', 'i think', 'i guess',
      'would it be', 'is that', 'that would be',
      // ADD: More natural answer patterns
      'store it in a', 'put it in a', 'keep it in a', 'place it in a',
      'you might store', 'you store', 'you keep', 'you put',
      // ADD: Direct guess patterns
      'the word is', 'it\'s a', 'that\'s a', 'this is a',
      'answer is', 'it must be', 'has to be', 'definitely a',
      // ADD: Question patterns (enhanced)
      'are you describing', 'are we talking about', 'do you mean',
      'are you talking about', 'talking about', 'you talking about',
      // ADD: Word description patterns  
      'word you\'re describing', 'you\'re describing', 'describing is',
      'word you are describing', 'you are describing',
      // ADD: Common ending patterns for guesses
      'right?', 'correct?', 'is that it?', 'that it?'
    ];
    
    const text = aiText.toLowerCase();
    
    // Enhanced guess context detection
    const hasGuessContext = guessKeywords.some(keyword => text.includes(keyword));
    
    // Enhanced target word detection (covers edge cases)
    const hasTargetWord = checkTargetWordVariations(text, targetWord);
    
    // Debug logging for pattern matching
    if (hasTargetWord && !hasGuessContext) {
      log.debug(`🎯 Word "${targetWord}" found but no guess context in: "${aiText.substring(0, 50)}..."`);
    } else if (hasGuessContext && !hasTargetWord) {
      log.debug(`🤔 Guess context found but no target word "${targetWord}" in: "${aiText.substring(0, 50)}..."`);
    } else if (hasGuessContext && hasTargetWord) {
      log.game(`🎯 SMART DETECTION: Actual guess detected for "${targetWord}"`);
    }
    
    // Both conditions must be true for actual guess
    return hasGuessContext && hasTargetWord;
  };

  // Hybrid Word Progression: Smart popup-based progression control
  const startWordProgression = (reason: 'correct_guess' | 'forbidden_word') => {
    log.game(`🎯 Starting word progression: ${reason}`);
    
    // Clear any existing timer
    if (progressionTimer) {
      clearTimeout(progressionTimer);
    }
    
    // Show progression popup
    setProgressionReason(reason);
    setProgressionCountdown(8);
    setShowWordProgression(true);
    
    // Start countdown timer
    const timer = setInterval(() => {
      setProgressionCountdown(prev => {
        if (prev <= 1) {
          // Auto-progress when countdown reaches 0
          autoProgressToNextWord();
          return 8;
        }
        return prev - 1;
      });
    }, 1000);
    
    setProgressionTimer(timer);
  };
  
  const continueWithCurrentWord = () => {
    log.game("🔄 User chose to continue with current word");
    
    // Clear timer and hide popup
    if (progressionTimer) {
      clearTimeout(progressionTimer);
      setProgressionTimer(null);
    }
    setShowWordProgression(false);
    
    // RESUME GAME - Re-enable AI responses
    setGameRoundActive(true);
    console.log(`🎮 GAME RESUMED - Continuing with current word - DEBUG`);
    
    // AI acknowledgment
    createSafeResponse(`Great! Let's continue with "${currentWord?.word}". Try describing it in a different way!`);
  };
  
  const progressToNextWord = () => {
    log.game("➡️ User chose to progress to next word");
    
    // Clear conversation for fresh start with new word
    console.log("⏭️ Progressing to next word - clearing conversation for fresh start");
    setConversation([]);
    messageSequenceRef.current = 0;
    
    // Clear timer and hide popup
    if (progressionTimer) {
      clearTimeout(progressionTimer);
      setProgressionTimer(null);
    }
    setShowWordProgression(false);
    setIsInFeedbackMode(false); // Always exit feedback mode when progressing
    isInFeedbackModeRef.current = false; // Immediate ref update
    setCurrentWordGuessed(false); // Reset for new word
    setUserDescriptionForFeedback(""); // Clear previous descriptions
    setFeedbackSessionStart(null); // Reset session timing
    
    // Notify AI about forbidden word usage ONLY when progressing
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{
            type: "input_text",
            text: `Kez used a forbidden word. Please acknowledge this briefly and announce we're moving to a new word. Be encouraging!`
          }]
        }
      }));
    }
    
    // Progress to next word
    autoProgressToNextWord();
  };
  
  const autoProgressToNextWord = () => {
    log.game("⏰ Auto-progressing to next word");
    
    // PREVENT INFINITE LOOP - Check if already processing
    if (showWordProgression) {
      console.log("🚫 BLOCKED: Auto-progression already in progress - DEBUG");
      return;
    }
    
    // Clear timer and hide popup
    if (progressionTimer) {
      clearTimeout(progressionTimer);
      setProgressionTimer(null);
    }
    setShowWordProgression(false);
    
    // AI announcement
    createSafeResponse("Let's try a new word!");
    
    // Progress after AI speaks - SINGLE EXECUTION ONLY
    setTimeout(() => {
      console.log(`🎮 EXECUTING: Single word progression - DEBUG`);
      
      // Clear any stale forbidden word state before getting new word
      console.log("🧹 Clearing stale forbidden word state before getting new word");
      setForbiddenWordStatus({});
      forbiddenWordStatusRef.current = {};
      currentWordRef.current = null;
      
      getNewTabooWord();
      setGameRoundActive(true);
      console.log(`🎮 GAME RESUMED - New word started - DEBUG`);
    }, 2000);
  };

  // Safe Response Creation: Check if response is active before cancelling
  const lastResponseTimeRef = useRef(0);
  const createSafeResponse = (instructions: string, delay: number = 100) => {
    // DEBUG: Log all states for feedback troubleshooting (using ref for immediate access)
    const currentFeedbackMode = isInFeedbackModeRef.current;
    console.log(`🔍 createSafeResponse DEBUG - gameRoundActive: ${gameRoundActive}, buzzerPopup.show: ${buzzerPopup.show}, isInFeedbackMode: ${isInFeedbackMode}, isInFeedbackModeRef: ${currentFeedbackMode}`);
    
    // GAME PAUSE CHECK: Don't create responses when game is paused, EXCEPT in feedback mode
    if (!currentFeedbackMode && !gameRoundActive && buzzerPopup.show) {
      console.log("🚫 BLOCKED: Game paused, buzzer popup active - no AI response - DEBUG");
      return;
    }
    
    // FORCE ALLOW: If feedback mode is active, always allow AI responses regardless of other states
    if (currentFeedbackMode) {
      console.log("🟢 FEEDBACK MODE OVERRIDE: AI response forced to proceed - DEBUG");
    }
    
    // RATE LIMITING: Prevent rapid successive calls
    const now = Date.now();
    if (now - lastResponseTimeRef.current < 1500) { // Increased to 1500ms cooldown
      console.log("🚫 RATE LIMITED: Too many createSafeResponse calls - DEBUG");
      return;
    }
    lastResponseTimeRef.current = now;
    
    if (dcRef.current?.readyState === "open") {
      // Only cancel if there's an active response and enough time has passed
      const timeSinceLastResponse = Date.now() - lastResponseTimeRef.current;
      if (currentAssistantMessage && timeSinceLastResponse > 500) {
        dcRef.current.send(JSON.stringify({
          type: "response.cancel"
        }));
        console.log("🛑 Cancelled active response - DEBUG");
      } else {
        console.log("🔍 No active response to cancel or too soon - DEBUG");
      }
      
      // Wait for cancellation, then create new response
      setTimeout(() => {
        if (dcRef.current?.readyState === "open") {
          dcRef.current.send(JSON.stringify({
            type: "response.create",
            response: {
              modalities: ["text", "audio"],
              instructions
            }
          }));
          
          log.debug("🚀 Created new safe response");
        }
      }, delay);
    }
  };

  // Timeline fix: Process buffered game logic when user transcript arrives
  const processPendingGameLogic = (userTranscript: string) => {
    console.log(`🔍 Processing ${pendingGameLogic.length} pending game logic items - DEBUG`);
    
    // Execute all pending game logic callbacks
    pendingGameLogic.forEach(({ callback, aiMessage }, index) => {
      console.log(`🔍 Executing game logic ${index + 1}: AI said "${aiMessage.substring(0, 50)}..." - DEBUG`);
      callback();
    });
    
    // Clear pending game logic
    setPendingGameLogic([]);
    
    console.log("🔍 All pending game logic processed - DEBUG");
  };

  const handleCorrectGuess = (guessedWord: string, confidence?: number) => {
    // Use REF for immediate access to current word (not stale React state)
    const currentWordRef_current = currentWordRef.current;
    
    // Prevent duplicate calls - check if we're already processing this word or word already guessed
    if (!currentWordRef_current || gameRoundActive === false || currentWordGuessed) {
      log.warn("Ignoring duplicate guess - round not active or word already guessed");
      return;
    }
    
    log.game(`Correct guess processed: "${guessedWord}" for word "${currentWordRef_current.word}"`);
    
    // 1. IMMEDIATELY STOP AI SPEAKING & CLEAR CURRENT MESSAGE
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "response.cancel"
      }));
      console.log("⏹️ CANCELLED ACTIVE AI RESPONSE - Correct guess detected");
    }
    
    // 2. CLEAR ANY CURRENT AI MESSAGE
    setCurrentAssistantMessage("");
    console.log("🗑️ CLEARED AI MESSAGE - Green buzzer activated");
    
    // 2. PAUSE GAME - Prevent AI from responding during popup  
    setGameRoundActive(false);
    console.log(`🎉 GAME PAUSED - Correct guess "${guessedWord}" detected - DEBUG`);
    
    // 3. CLEAR ANY CURRENT AI MESSAGE
    setCurrentAssistantMessage("");
    
    // 4. Mark word as guessed and increase score
    setCurrentWordGuessed(true);
    setTabooScore(prev => prev + 1);
    
    // AI'a başarı mesajı gönder (tek sefer)
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ 
            type: "input_text", 
            text: `YES! Correct! The word was "${currentWordRef_current.word}". Great job!` 
          }]
        }
      }));

      // AI celebration
      createSafeResponse(`🎉 Excellent, Kez! That was "${currentWordRef_current.word}"! Amazing description!`);
    }
    
    // Show GREEN buzzer popup for correct guess - NO TIMER!
    setBuzzerPopup({
      show: true,
      word: currentWordRef_current.word,
      message: `🎉 EXCELLENT! You got "${currentWordRef_current.word}" correct!`,
      showChoices: true,
      type: 'correct'
    });
    
    console.log(`🎉 CORRECT GUESS: "${currentWordRef_current.word}" - Waiting for user choice - DEBUG`);
  };

  const sendFunctionResponse = (callId: string, response: any) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(response)
        }
      }));
    }
  };

  // Taboo moduna geçince yeni kelime al
  useEffect(() => {
    if (gameMode === "taboo" && !currentWord) {
      getNewTabooWord();
    } else if (gameMode !== "taboo") {
      setCurrentWord(null);
      setGameRoundActive(false);
    }
  }, [gameMode]);

  // Yeni kelime seçildiğinde forbidden words'ü initialize et - SADECE yeni kelimede
  const previousWordRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentWord && gameMode === "taboo") {
      // Only initialize if this is actually a NEW word, not the same word
      if (previousWordRef.current !== currentWord.word) {
        console.log(`🔄 NEW WORD DETECTED: "${previousWordRef.current}" → "${currentWord.word}" - initializing forbidden words`);
        initializeForbiddenWords();
        previousWordRef.current = currentWord.word;
      } else {
        console.log(`🔄 SAME WORD: "${currentWord.word}" - preserving forbidden word status`);
      }
    }
  }, [currentWord]);

  // Dynamic prompt generation for Taboo mode
  const getCurrentPrompt = (mode: GameMode) => {
    if (mode === "taboo") {
      return `🚫 You are the GUESSER in this Taboo game with Kez!

RULES:
- Kez describes a word, you guess it
- Be brief: "Is it [guess]?" or "Could it be [word]?"
- Keep greetings short: Just say "Ready!" or "Let's play!"

Wait for Kez to describe something, then guess! 🎲`;
    }
    return GAME_MODE_PROMPTS[mode];
  };

  const sendSessionUpdate = (currentPace: Pace, currentGameMode: GameMode, currentSilenceDuration?: number, useOptimalThreshold?: boolean) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      const threshold = useOptimalThreshold && speechAnalytics.totalSpeechEvents >= 3 
        ? speechAnalytics.optimalThreshold 
        : 0.9; // Increased from 0.8 to 0.9 for better noise filtering
      
      console.log("🎛️ Updating session with VAD settings:", {
        threshold,
        silenceDuration: currentSilenceDuration || silenceDuration,
        isOptimal: useOptimalThreshold && speechAnalytics.totalSpeechEvents >= 3
      });
      
      dcRef.current.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: getCurrentPrompt(currentGameMode),
          voice: selectedVoice, // Update voice in session
          turn_detection: {
            type: "server_vad",
            threshold: threshold, // Optimal threshold veya default
            prefix_padding_ms: 800, // Increased from 500ms to 800ms for better noise filtering
            silence_duration_ms: currentSilenceDuration || silenceDuration // Kullanıcı ayarı
          },
          temperature: currentPace === "slow" ? 0.6 : currentPace === "fast" ? 1.0 : 0.8,
          modalities: ["audio", "text"], // Ensure both audio and text are enabled
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
            language: "en" // Kullanıcı transcription İngilizce zorla
          }
        }
      }));
    }
  };

  // Pace/GameMode/SilenceDuration/Voice değiştikçe session güncelle
  useEffect(() => {
    sendSessionUpdate(pace, gameMode, silenceDuration);
  }, [pace, gameMode, silenceDuration, selectedVoice]);

  // Taboo kelimesi değiştiğinde prompt güncellemeye gerek yok - AI kelimeyi bilmiyor

  const connect = async () => {
    try {
      setStatus("requesting ephemeral token…");
      const sess = await fetch("/api/realtime-session", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameMode, voice: selectedVoice })
      }).then(r=>r.json());
      console.log("EPHEMERAL SESSION:", sess);
      const token = sess?.client_secret?.value;
      if (!token) throw new Error("No ephemeral token");

      setStatus("creating RTCPeerConnection…");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      
      // WebRTC connection state tracking
      pc.onconnectionstatechange = () => {
        console.log("PeerConnection state:", pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setStatus(`connection ${pc.connectionState}`);
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // Gelen ses: tek bir <audio> elementinde çal
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.controls = true; // Debug için kontrolleri göster
      audioEl.volume = 1.0;
      
      pc.ontrack = (e) => { 
        console.log("Audio track received:", e.streams[0]);
        audioEl.srcObject = e.streams[0];
        // Audio element'i sayfaya ekle (debug için)
        audioEl.style.display = "block";
        audioEl.style.marginTop = "10px";
        if (!document.querySelector('#debug-audio')) {
          audioEl.id = "debug-audio";
          document.body.appendChild(audioEl);
        }
      };
      audioRef.current = audioEl;

      // Mikrafonu bağla - noise suppression ile
      setStatus("getting microphone…");
      const ms = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        }
      });
      micStreamRef.current = ms;
      ms.getTracks().forEach(t => pc.addTrack(t, ms));

      // DataChannel: kontrol ve LLM’den gelen JSON event’leri
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        console.log("DataChannel opened - ready for mode:", gameMode);
        sendSessionUpdate(pace, gameMode, silenceDuration); // Bu zaten doğru prompt'u gönderecek
        
        // Artık greeting'i güvenle gönderebiliriz
        const pc = pcRef.current;
        if (pc && (pc as any).pendingGreeting) {
          setTimeout(() => {
            try {
              const greetingMessage = {
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user", 
                  content: [{ type: "input_text", text: (pc as any).pendingGreeting }]
                }
              };
              console.log("Sending greeting message:", greetingMessage);
              dc.send(JSON.stringify(greetingMessage));
              
              // Safe initial greeting response
              setTimeout(() => {
                createSafeResponse(`Let's start!`);
              }, 200); // Small delay to ensure setup is complete
              
              // Temizle
              (pc as any).pendingGreeting = null;
            } catch (err) {
              console.error("Error sending greeting:", err);
            }
          }, 500); // 500ms bekle - session.update'in işlenmesi için
        }
      };
      
      dc.onerror = (err) => {
        console.error("DataChannel error:", err);
      };
      
      dc.onclose = () => {
        console.log("DataChannel closed");
      };
      dc.onmessage = (ev) => {
        // Realtime API, datachannel üzerinden event/JSON gönderebilir
        try {
          const msg = JSON.parse(ev.data);
          log.debug("Message:", msg.type);
          
  // AI response event'lerini özellikle takip et - sadece önemli olanlar
  if (msg.type === "response.created" || msg.type === "response.done") {
    log.ai("AI Event:", msg.type);
  }
  
  // Error mesajlarını özellikle takip et
  if (msg.type === "error") {
    console.error("API Error received:", msg.error);
    setStatus(`API Error: ${msg.error?.message || 'Unknown error'}`);
    return;
  }

  // Function call handling - Taboo game functions 🎮
  if (msg.type === "response.function_call_delta") {
    log.debug("Function call delta");
  }

  if (msg.type === "response.function_call_done") {
    log.game("🎯 ANA DETECTION: Function call geldi -", msg.name);
    
    if (!functionCallDetected) {
      setFunctionCallDetected(true);
      handleTabooFunctionCall(msg);
      log.success("✅ Ana sistem işledi, backup susturuldu");
    } else {
      log.warn("⚠️ Ana sistem zaten çalıştı, duplicate engellendi");
    }
  }

  // Response başladığında yeni AI mesajı başlat
  if (msg.type === "response.created") {
    setCurrentAssistantMessage(""); // Yeni response için temizle
    setCurrentUserMessage(""); // User message'ı da temizle - AI cevap veriyor
    // Priority System: Reset detection flag for new response
    setFunctionCallDetected(false);
    
    // Track AI response start time for accurate timestamp calculation
    aiResponseStartTime.current = Date.now();
    
    const currentSeq = messageSequenceRef.current;
    messageSequenceRef.current += 1;
    
    // NOTE: No more "🤖 Thinking..." bubbles - we'll add AI message only when we have content
    console.log(`✅ AI RESPONSE STARTED - Sequence: ${currentSeq} - DEBUG`);
    
    log.debug("🔄 Detection flag reset edildi - User message cleared");
  }
          
          // Kullanıcı konuşma başladı - VAD analizi için
          if (msg?.type === "input_audio_buffer.speech_started") {
            const speechStart = msg.audio_start_ms || Date.now();
            log.debug("Speech started");
            setSpeechAnalytics(prev => ({ ...prev, lastSpeechStart: speechStart }));
          }

          // Kullanıcı konuşma bitti - VAD analizi için
          if (msg?.type === "input_audio_buffer.speech_stopped") {
            const speechEnd = msg.audio_end_ms || Date.now();
            log.debug("Speech stopped");
            
            // audio_end_ms is relative timestamp from session start, not absolute
            
            // Record speech end time for accurate user timestamp
            // If audio_end_ms is too small (relative timestamp), use current time
            const isRelativeTimestamp = msg.audio_end_ms && msg.audio_end_ms < 1000000000000; // Less than year 2001
            userSpeechEndTime.current = isRelativeTimestamp ? Date.now() : speechEnd;
            
            if (speechAnalytics.lastSpeechStart > 0) {
              analyzeSpeechPattern(speechAnalytics.lastSpeechStart, speechEnd);
              // 3 konuşma sonrası optimal ayarları uygula
              setTimeout(() => applyOptimalSettings(), 1000);
            }
            
            // DON'T add placeholder here - wait for actual transcript
            // This prevents duplicate user messages in UI
            console.log(`🎤 Speech stopped - waiting for transcript - DEBUG`);
          }

          // Kullanıcı konuşma transcript'i
          if (msg?.type === "conversation.item.input_audio_transcription.completed") {
            const transcript = msg.transcript || "";
            log.user("User said:", transcript);
            
            if (transcript) {
              // REAL-TIME UI: Use same logic as console - add message directly
              // Use speech end time for accurate user timestamp (when they actually finished speaking)
              const userTimestamp = new Date(userSpeechEndTime.current || Date.now());
              const currentSeq = messageSequenceRef.current;
              messageSequenceRef.current += 1;
              
              const userMessage = {
                id: `user-${userTimestamp.getTime()}`,
                role: "user" as const,
                content: transcript,
                timestamp: userTimestamp,
                isComplete: true,
                sequence: currentSeq
              };
              
              // Accumulate user descriptions for feedback
              if (currentWord && gameRoundActive) {
                setUserDescriptionForFeedback(prev => {
                  const newDescription = prev ? `${prev} ${transcript}` : transcript;
                  console.log(`📝 ACCUMULATED USER DESCRIPTION: "${newDescription}" - DEBUG`);
                  return newDescription;
                });
              }
              
              // Add to conversation immediately (same as console logic)
              setConversation(prev => [...prev, userMessage]);
              console.log(`✅ USER MESSAGE ADDED DIRECTLY: "${transcript}" [${userTimestamp.toLocaleTimeString()}.${userTimestamp.getMilliseconds().toString().padStart(3, '0')}] - Sequence: ${currentSeq} - DEBUG`);
              console.log(`🔍 CONVERSATION ORDER DEBUG - Total messages: ${conversation.length + 1}, Latest sequence: ${currentSeq}`);
              console.log(`⏰ TIMESTAMP DEBUG - User: ${userTimestamp.getTime()}, Formatted: ${userTimestamp.toLocaleTimeString()}.${userTimestamp.getMilliseconds().toString().padStart(3, '0')} (SPEECH END TIME)`);
              
              // Taboo forbidden word kontrolü - Kez'in konuşması
              checkForbiddenWords(transcript, 'user');
              
              // Clear any pending user message
              setPendingUserMessage(null);
              setCurrentUserMessage(""); 
              
              // Process pending game logic now that user message is available
              // Use setTimeout to ensure state updates are processed
              setTimeout(() => {
                processPendingGameLogic(transcript);
              }, 100);
            }
          }
          
          // AI konuşma transcript'i - DOĞRU EVENT TÜRÜ
          if (msg?.type === "response.text.delta") {
            const textDelta = msg.delta || "";
            console.log("🤖 AI text delta received:", textDelta);
            setCurrentAssistantMessage(prev => {
              const newMessage = prev + textDelta;
              console.log("Updated AI message:", newMessage);
              return newMessage;
            });
          }
          
          // AI audio transcript (ses çıktısının transcript'i)
          if (msg?.type === "response.audio_transcript.delta") {
            const transcriptDelta = msg.delta || "";
            log.debug("AI audio delta:", transcriptDelta);
            setCurrentAssistantMessage(prev => prev + transcriptDelta);
          }
          
          // Eski format (fallback)
          if (msg?.type === "response.output_text.delta") {
            const textDelta = msg.delta || "";
            console.log("📝 Legacy text delta received:", textDelta);
            setCurrentAssistantMessage(prev => prev + textDelta);
          }
          
          // Check for any output items in response
          if (msg?.type === "response.output_item.added") {
            console.log("Response output item added:", msg);
            if (msg.item?.type === "message" && msg.item?.content) {
              const content = msg.item.content;
              if (Array.isArray(content)) {
                const textContent = content.find(c => c.type === "text");
                if (textContent) {
                  console.log("Found text content in output item:", textContent.text);
                  setCurrentAssistantMessage(prev => prev + textContent.text);
                }
              }
            }
          }
          
          // AI cevabı tamamlandı
          if (msg?.type === "response.done") {
            log.ai("Response completed");
            
            // Get AI message content from different sources
            let aiMessageContent = currentAssistantMessage.trim();
            
            // If currentAssistantMessage is empty, try to get from response.output
            if (!aiMessageContent && msg.response?.output && msg.response.output.length > 0) {
              const outputItem = msg.response.output[0];
              if (outputItem?.content && outputItem.content.length > 0) {
                const audioContent = outputItem.content.find((c: any) => c.type === "audio");
                if (audioContent?.transcript) {
                  aiMessageContent = audioContent.transcript;
                  log.debug("Got AI message from response.output:", aiMessageContent);
                }
              }
            }
            
            if (aiMessageContent) {
              // DUPLICATE CHECK: Prevent processing same AI message multiple times
              const isDuplicateMessage = conversation.some(msg => 
                msg.role === "assistant" && msg.content === aiMessageContent && msg.isComplete
              );
              
              if (isDuplicateMessage) {
                console.log(`🔄 DUPLICATE AI MESSAGE PREVENTED: "${aiMessageContent.substring(0, 50)}..." - DEBUG`);
                return; // Skip processing
              }
              
              // REAL-TIME UI: Add AI message with actual content (no placeholder)  1.
              // Use actual response duration instead of hardcoded delay
              const responseStartTime = aiResponseStartTime.current || Date.now() - 1000;
              const actualResponseDuration = Date.now() - responseStartTime;
              const aiTimestamp = new Date(responseStartTime + actualResponseDuration);
              const currentSeq = messageSequenceRef.current;
              messageSequenceRef.current += 1;
              
              const finalAiMessage = {
                id: `ai-${currentSeq}`,
                role: "assistant" as const,
                content: aiMessageContent,
                timestamp: aiTimestamp,
                isComplete: true,
                sequence: currentSeq
              };
              
              setConversation(prev => [...prev, finalAiMessage]);
              console.log(`✅ AI MESSAGE ADDED: "${aiMessageContent}" [${aiTimestamp.toLocaleTimeString()}.${aiTimestamp.getMilliseconds().toString().padStart(3, '0')}] - Sequence: ${currentSeq} - DEBUG`);
              console.log(`🔍 CONVERSATION ORDER DEBUG - Total messages: ${conversation.length + 1}, Latest sequence: ${currentSeq}`);
              console.log(`⏰ TIMESTAMP DEBUG - AI: ${aiTimestamp.getTime()}, Formatted: ${aiTimestamp.toLocaleTimeString()}.${aiTimestamp.getMilliseconds().toString().padStart(3, '0')} (ACTUAL RESPONSE TIME: ${actualResponseDuration}ms)`);
              
              // Check if this is coach feedback and store the session
              if (isInFeedbackModeRef.current && feedbackSessionStart && currentWord) {
                storeFeedbackSessionData(aiMessageContent);
              }

              // Timeline fix: Buffer game logic for when user transcript arrives
              if (gameMode === "taboo" && currentWord) {
                const gameLogicCallback = () => {
                  // Process forbidden words in AI message
                  console.log(`🔍 PROCESSING AI FORBIDDEN WORDS: "${aiMessageContent}" - DEBUG`);
                  checkForbiddenWords(aiMessageContent, 'ai');
                  
                  // Enhanced backup guess detection (fallback mechanism)
                  // Use REF for immediate access to current word (not stale React state)
                  const currentWordRef_current = currentWordRef.current;
                  if (!currentWordRef_current) {
                    console.log("🚫 GUESS DETECTION SKIPPED: No current word available - DEBUG");
                    return;
                  }
                  
                  const targetWord = currentWordRef_current.word;
                  
                  // Use smart context-aware detection
                  const foundGuess = isActualGuess(aiMessageContent, targetWord);
                  
                  console.log(`🔍 GUESS DETECTION DEBUG for "${targetWord}":`, {
                    aiMessage: aiMessageContent.substring(0, 100),
                    foundGuess,
                    gameRoundActive,
                    functionCallDetected,
                    currentWordGuessed,
                    isInFeedbackMode: isInFeedbackModeRef.current,
                    currentWordObject: currentWordRef_current,
                    forbiddenWordStatus: Object.keys(forbiddenWordStatusRef.current || {}),
                    aiMessageFull: aiMessageContent
                  });
                  
                  // Skip guess detection if word already guessed or in feedback mode
                  if (currentWordGuessed) {
                    console.log("🚫 GUESS DETECTION SKIPPED: Word already guessed correctly - DEBUG");
                    return;
                  }
                  
                  if (isInFeedbackModeRef.current) {
                    console.log("🎓 FEEDBACK MODE: Guess detection paused - game functions disabled - DEBUG");
                    return;
                  }
                  
                  if (foundGuess && gameRoundActive && !functionCallDetected) {
                    console.log(`🎮 BACKUP DETECTION: AI guessed correct word: ${targetWord} - DEBUG`);
                    setFunctionCallDetected(true);
                    console.log(`🎮 CALLING handleCorrectGuess for: ${targetWord} - DEBUG`);
                    handleCorrectGuess(targetWord, 0.9);
                    console.log("✅ Backup system processed - DEBUG");
                  } else if (foundGuess && functionCallDetected) {
                    console.log("❌ Backup silenced - main system already ran - DEBUG");
                  } else if (checkTargetWordVariations(aiMessageContent, targetWord) && gameRoundActive && !functionCallDetected) {
                    // ULTRA FALLBACK: If target word mentioned but no guess context detected
                    console.log(`🎯 ULTRA FALLBACK: Target word "${targetWord}" mentioned - treating as guess - DEBUG`);
                    setFunctionCallDetected(true);
                    handleCorrectGuess(targetWord, 0.8);
                    console.log("✅ Ultra fallback processed - DEBUG");
                  } else if (checkTargetWordVariations(aiMessageContent, targetWord)) {
                    console.log(`🔍 Target word "${targetWord}" mentioned but conditions not met:`);
                    console.log(`   - gameRoundActive: ${gameRoundActive}`);
                    console.log(`   - functionCallDetected: ${functionCallDetected}`);
                    console.log(`   - currentWordGuessed: ${currentWordGuessed}`);
                    console.log(`   - isInFeedbackMode: ${isInFeedbackModeRef.current}`);
                  } else {
                    console.log(`🔍 No target word match found in: "${aiMessageContent}" - DEBUG`);
                  }
                };
                
                setPendingGameLogic(prev => {
                  // DUPLICATE PREVENTION: Check if this message is already buffered
                  const isDuplicate = prev.some(item => item.aiMessage === aiMessageContent);
                  if (isDuplicate) {
                    console.log(`🔄 DUPLICATE PREVENTED: AI message already buffered - DEBUG`);
                    return prev;
                  }
                  
                  const newPendingLogic = [...prev, {
                    aiMessage: aiMessageContent,
                    aiTimestamp: new Date(),
                    callback: gameLogicCallback
                  }];
                  console.log(`✅ BUFFERED GAME LOGIC: ${newPendingLogic.length} items - DEBUG`);
                  
                  // SMART PROCESSING - Process immediately but prevent duplicates
                  setTimeout(() => {
                    // PROCESSING FLAG: Prevent concurrent processing
                    if (processingGameLogicRef.current) {
                      console.log(`🔄 PROCESSING BLOCKED: Already processing game logic - DEBUG`);
                      return;
                    }
                    
                    processingGameLogicRef.current = true;
                    
                    // Only process if this is the latest buffered item
                    setPendingGameLogic(current => {
                      if (current.length > 0) {
                        console.log(`🔄 SMART PROCESSING: ${current.length} buffered items - DEBUG`);
                        current.forEach((item, index) => {
                          console.log(`🔄 Processing item ${index + 1}: "${item.aiMessage.substring(0, 50)}..." - DEBUG`);
                          item.callback();
                        });
                        
                        // Reset processing flag after completion
                        setTimeout(() => {
                          processingGameLogicRef.current = false;
                          console.log(`🔄 PROCESSING FLAG RESET - DEBUG`);
                        }, 100);
                        
                        return []; // Clear after processing
                      }
                      
                      // Reset flag if no items to process
                      processingGameLogicRef.current = false;
                      return current;
                    });
                  }, 50);
                  return newPendingLogic;
                });
                
                console.log("✅ Buffered game logic for user transcript - DEBUG");
              } else {
                // For non-taboo modes, process immediately
                checkForbiddenWords(aiMessageContent, 'ai');
              }
              
              // Clear current message immediately after adding to conversation
              setCurrentAssistantMessage("");
              log.debug("Cleared current assistant message");
            } else {
              log.warn("AI message was empty from all sources");
            }
            
            // Token usage tracking 💰
            if (msg.response?.usage) {
              const usage = msg.response.usage;
              const inputAudioTokens = usage.input_token_details?.audio_tokens || 0;
              const outputAudioTokens = usage.output_token_details?.audio_tokens || 0;
              
              // GPT-4o-mini Audio pricing: $10/1M input, $20/1M output  
              const inputCost = (inputAudioTokens / 1000000) * 10.00;
              const outputCost = (outputAudioTokens / 1000000) * 20.00;
              const totalCost = inputCost + outputCost;
              
              setSessionUsage({
                totalTokens: usage.total_tokens || 0,
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                inputAudioTokens,
                outputAudioTokens,
                cost: totalCost
              });
              
              log.info(`Cost: $${totalCost.toFixed(4)} (${usage.total_tokens} tokens)`);
            }
            
            log.debug("Response completed");
          }
          
          // JSON formatında öğretmen yanıtı - use response.done instead
          // (removed response.completed to avoid duplicates)
          
          if (msg?.type === "response.audio.delta") {
            log.debug("Audio delta received");
          }
        } catch (e) { 
          log.debug("Non-JSON message received");
        }
      };

      // Offer oluştur
      setStatus("creating offer…");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("Created SDP offer:", offer.sdp?.substring(0, 100) + "...");

      // OpenAI Realtime'a SDP gönder (WebRTC handshake) - proxy üzerinden
      setStatus("sending SDP to OpenAI via proxy…");
      const model = "gpt-realtime-2025-08-28"; // Latest realtime model (Aug 2025)
      const sdpResp = await fetch("/api/realtime-connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          model: model,
          token
        })
      });
      
      console.log("SDP Response status:", sdpResp.status);

      if (!sdpResp.ok) {
        const errorDetail = await sdpResp.text();
        throw new Error(`SDP proxy failed: ${sdpResp.status} - ${errorDetail}`);
      }

      const answerSDP = await sdpResp.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSDP });

      setConnected(true);
      setStatus("connected - try speaking!");
      
      // AI greeting'i DataChannel açıldıktan sonra gönder
      const greetingPrompts = {
        casual: "Start by greeting Kez warmly and introduce yourself as her enthusiastic English conversation buddy! Be personal and energetic.",
        roleplay: "Start by greeting Kez and introduce yourself as her roleplay English coach. Ask what scenario she'd like to practice today!",
        taboo: "Start by greeting Kez warmly as her Taboo game partner! Let her know you're ready to guess whatever she describes to you. Wait for her to start describing something!"
      };

      // Greeting'i sakla - DataChannel açıldığında gönderilecek
      (pc as any).pendingGreeting = greetingPrompts[gameMode];
    } catch (e:any) {
      setStatus("error: " + e.message);
      disconnect();
    }
  };

  const disconnect = () => {
    dcRef.current?.close();
    pcRef.current?.close();
    micStreamRef.current?.getTracks()?.forEach(t => t.stop());
    audioRef.current?.pause();
    // Debug audio elementini temizle
    const debugAudio = document.querySelector('#debug-audio');
    if (debugAudio) debugAudio.remove();
    
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    audioRef.current = null;
    setConnected(false);
    setStatus("disconnected");
    
    // Show usage stats when disconnecting
    if (sessionUsage) {
      setShowUsageStats(true);
    }
  };

  const currentMode = GAME_MODES[gameMode];

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes shake {
            0%, 100% { transform: translateX(0px) rotate(0deg); }
            25% { transform: translateX(-2px) rotate(-1deg); }
            50% { transform: translateX(2px) rotate(1deg); }
            75% { transform: translateX(-1px) rotate(-0.5deg); }
          }
        `
      }} />
      
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "system-ui"
      }}>
      <div style={{
        maxWidth: "900px",
        margin: "0 auto",
        background: "white", 
        borderRadius: "20px",
        padding: "30px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.1)"
      }}>
        
        {/* Header */}
        <div style={{textAlign: "center", marginBottom: "30px"}}>
          <h1 style={{
            fontSize: "32px", 
            margin: 0, 
            background: "linear-gradient(45deg, #667eea, #764ba2)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "10px"
          }}>
            🎙️ Kez's English Coach & Fun Games! ✨
          </h1>
          <p style={{fontSize: "18px", color: "#666", margin: 0}}>
            Learn English through fun games with instant corrections! 🎯🚀
          </p>
      </div>

        {/* Game Mode Selection */}
        <div style={{marginBottom: "25px"}}>
          <h3 style={{color: "#333", marginBottom: "15px"}}>🎮 Choose Your Game Mode:</h3>
          <div style={{display: "flex", gap: "15px", flexWrap: "wrap"}}>
            {Object.entries(GAME_MODES).map(([mode, info]) => (
              <button
                key={mode}
                onClick={() => setGameMode(mode as GameMode)}
                style={{
                  flex: "1",
                  minWidth: "200px",
                  padding: "20px",
                  border: gameMode === mode ? `3px solid ${info.color}` : "2px solid #ddd",
                  borderRadius: "15px",
                  background: gameMode === mode ? info.bgColor : "white",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  textAlign: "left",
                  transform: gameMode === mode ? "scale(1.02)" : "scale(1)"
                }}
              >
                <div style={{fontSize: "20px", fontWeight: "bold", color: info.color, marginBottom: "8px"}}>
                  {info.name}
                </div>
                <div style={{fontSize: "14px", color: "#666", lineHeight: 1.4}}>
                  {info.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Connection Controls */}
        <div style={{
          display: "flex", 
          gap: "15px", 
          alignItems: "center", 
          justifyContent: "center",
          marginBottom: "25px",
          padding: "20px",
          background: currentMode.bgColor,
          borderRadius: "15px",
          border: `2px solid ${currentMode.color}`
        }}>
          <button 
            onClick={connect} 
            disabled={connected}
            style={{
              padding: "15px 30px",
              fontSize: "18px",
              fontWeight: "bold",
              backgroundColor: connected ? "#ccc" : currentMode.color,
              color: "white",
              border: "none",
              borderRadius: "50px",
              cursor: connected ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
            }}
          >
            {connected ? "🔗 Connected!" : "🚀 Start Chat!"}
          </button>
          
          <button 
            onClick={disconnect} 
            disabled={!connected}
            style={{
              padding: "15px 30px",
              fontSize: "18px",
              fontWeight: "bold",
              backgroundColor: !connected ? "#ccc" : "#f44336",
              color: "white",
              border: "none",
              borderRadius: "50px",
              cursor: !connected ? "not-allowed" : "pointer",
              transition: "all 0.3s ease",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
            }}
          >
            🛑 Stop
          </button>
          
          {/* Push-to-Talk Button (only when connected and enabled) */}
          {connected && isPushToTalk && (
            <button
              onMouseDown={() => setIsRecording(true)}
              onMouseUp={() => setIsRecording(false)}
              onMouseLeave={() => setIsRecording(false)}
              style={{
                padding: "15px 30px",
                fontSize: "18px",
                fontWeight: "bold",
                backgroundColor: isRecording ? "#4CAF50" : "#FF9800",
                color: "white",
                border: "none",
                borderRadius: "50px",
                cursor: "pointer",
                transition: "all 0.3s ease",
                boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                userSelect: "none"
              }}
            >
              {isRecording ? "🎤 Recording..." : "🎤 Hold to Speak"}
            </button>
          )}
          
          <div style={{
            padding: "10px 20px",
            background: "white",
            borderRadius: "25px",
            fontWeight: "bold",
            color: currentMode.color,
            border: `2px solid ${currentMode.color}`
          }}>
            {status === "connected - try speaking!" ? "🎤 Ready to chat with Kez!" : 
             status === "ready" ? "Ready!" : status}
          </div>
      </div>

        {/* Quick Settings */}
        <div style={{marginBottom: "25px"}}>
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: "none",
              border: "1px solid #ddd",
              borderRadius: "10px",
              padding: "10px 15px",
              cursor: "pointer",
              fontSize: "14px",
              color: "#666"
            }}
          >
            ⚙️ {showAdvanced ? "Hide Settings" : "Settings"}
          </button>
          
          {showAdvanced && (
            <div style={{marginTop: "15px", padding: "15px", background: "#f9f9f9", borderRadius: "10px"}}>
              <div style={{marginBottom: "15px"}}>
                <label style={{fontSize: "16px", fontWeight: "bold", marginRight: "15px"}}>
                  🗣️ Speaking Speed:&nbsp;
                  <select 
                    value={pace} 
                    onChange={e=>setPace(e.target.value as Pace)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "2px solid #ddd",
                      fontSize: "16px"
                    }}
                  >
                    <option value="slow">🐌 Slow</option>
                    <option value="medium">🚶 Normal</option>
                    <option value="fast">🏃 Fast</option>
          </select>
        </label>
      </div>

              <div style={{marginBottom: "15px"}}>
                <label style={{fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "10px"}}>
                  <input
                    type="checkbox"
                    checked={isPushToTalk}
                    onChange={e => setIsPushToTalk(e.target.checked)}
                    style={{transform: "scale(1.2)"}}
                  />
                  🎤 Push-to-Talk Mode (reduces background noise)
                </label>
                <div style={{fontSize: "14px", color: "#666", marginTop: "5px", marginLeft: "25px"}}>
                  When enabled, hold the mic button to speak
                </div>
              </div>
              
              {/* Voice Activity Analytics Display */}
              {speechAnalytics.totalSpeechEvents >= 3 && (
                <div style={{marginBottom: "15px", padding: "10px", background: "#e8f5e8", borderRadius: "8px", border: "1px solid #4CAF50"}}>
                  <div style={{fontSize: "14px", fontWeight: "bold", color: "#2E7D32", marginBottom: "5px"}}>
                    🎯 Smart VAD Active (Optimized for your speech pattern)
                  </div>
                  <div style={{fontSize: "12px", color: "#388E3C"}}>
                    Analyzed {speechAnalytics.totalSpeechEvents} speech events • 
                    Avg pause: {Math.round(speechAnalytics.averagePauseDuration/1000*10)/10}s • 
                    Optimal silence: {Math.round(speechAnalytics.optimalSilenceDuration/1000*10)/10}s
                  </div>
                </div>
              )}

              <div style={{marginBottom: "15px"}}>
                <label style={{fontSize: "16px", fontWeight: "bold", marginRight: "15px"}}>
                  ⏱️ Silence Duration:&nbsp;
                  <select 
                    value={silenceDuration} 
                    onChange={e => setSilenceDuration(Number(e.target.value))}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "2px solid #ddd",
                      fontSize: "16px"
                    }}
                  >
                    <option value={500}>0.5 seconds</option>
                    <option value={1000}>1.0 seconds</option>
                    <option value={1500}>1.5 seconds</option>
                    <option value={2000}>2.0 seconds</option>
                    <option value={2500}>2.5 seconds</option>
                    <option value={3000}>3.0 seconds</option>
                    <option value={3500}>3.5 seconds</option>
                    <option value={4000}>4.0 seconds</option>
          </select>
        </label>
                <div style={{fontSize: "14px", color: "#666", marginTop: "5px"}}>
                  How long to wait before AI responds (longer = more thinking time)
                </div>
      </div>

              <div style={{marginBottom: "15px"}}>
                <label style={{fontSize: "16px", fontWeight: "bold", marginRight: "15px"}}>
                  🎤 AI Voice:&nbsp;
                  <select 
                    value={selectedVoice} 
                    onChange={e => setSelectedVoice(e.target.value as any)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "2px solid #ddd",
                      fontSize: "16px"
                    }}
                  >
                    <option value="alloy">Alloy (Neutral)</option>
                    <option value="echo">Echo (Male)</option>
                    <option value="fable">Fable (British Male)</option>
                    <option value="onyx">Onyx (Deep Male)</option>
                    <option value="nova">Nova (Female)</option>
                    <option value="shimmer">Shimmer (Soft Female)</option>
                    <option value="verse">Verse (Default)</option>
                  </select>
                </label>
                <div style={{fontSize: "14px", color: "#666", marginTop: "5px"}}>
                  Choose the AI voice that Kez prefers most
                </div>
      </div>

              {/* Progress Dashboard Button */}
              <div style={{marginBottom: "15px"}}>
                <button 
                  onClick={() => setShowProgressDashboard(true)}
                  style={{
                    padding: "12px 20px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    backgroundColor: "#2196F3",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    boxShadow: "0 2px 8px rgba(33, 150, 243, 0.3)",
                    width: "100%"
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#1976D2";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "#2196F3";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  📊 Progress Dashboard (Beta)
                </button>
                <div style={{fontSize: "14px", color: "#666", marginTop: "5px"}}>
                  View your learning progress and analytics
                </div>
              </div>
            </div>
          )}
      </div>

        {/* Taboo Mode: Side-by-Side Layout */}
        {gameMode === "taboo" && currentWord && (
          <div style={{
            display: "flex",
            gap: "20px",
            marginBottom: "25px"
          }}>
            {/* Word Card - 1/3 width (simplified) */}
            <div style={{
              flex: "1",
              border: `4px solid ${currentMode.color}`,
              borderRadius: "20px",
              padding: "20px",
              background: `linear-gradient(135deg, ${currentMode.color} 0%, ${currentMode.color}90 100%)`,
              color: "white",
              textAlign: "center",
              boxShadow: "0 8px 25px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              minHeight: "500px" // Ensure consistent height
            }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px"
              }}>
                <div style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "8px 15px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: "bold"
                }}>
                  Score: {tabooScore}
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "8px 15px",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: "bold"
                }}>
                  Word {usedWords.length}/{TABOO_WORDS.length}
                </div>
              </div>

              <h2 style={{ 
                fontSize: "24px", 
                margin: "0 0 15px 0", 
                textShadow: "0 2px 10px rgba(0,0,0,0.3)",
                letterSpacing: "2px"
              }}>
                {currentWord.word}
              </h2>
              
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                alignItems: "center",
                marginBottom: "25px",
                flex: "1",
                width: "100%",
                padding: "0 10px",
                minHeight: "0" // Allow shrinking
              }}>
                {currentWord.forbidden.map((word, index) => {
                  const status = forbiddenWordStatus[word] || 'active';
                  const isUnlocked = status === 'unlocked';
                  return (
                    <div
                      key={index}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        backgroundColor: isUnlocked 
                          ? "rgba(76, 175, 80, 0.9)" 
                          : "rgba(255, 255, 255, 0.25)",
                        borderRadius: "10px",
                        fontSize: "13px",
                        fontWeight: "bold",
                        color: isUnlocked ? "#2E7D32" : "white",
                        textDecoration: isUnlocked ? 'line-through' : 'none',
                        transition: "all 0.3s ease",
                        width: "100%",
                        maxWidth: "160px",
                        border: isUnlocked 
                          ? "2px solid #4CAF50" 
                          : "2px solid rgba(255, 255, 255, 0.3)",
                        boxShadow: isUnlocked 
                          ? "0 1px 4px rgba(76, 175, 80, 0.3)" 
                          : "0 1px 4px rgba(0, 0, 0, 0.2)"
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>
                        {isUnlocked ? '🔓' : '🔒'}
                      </span>
                      <span style={{ 
                        flex: 1, 
                        textAlign: "center",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        {word}
                      </span>
                    </div>
                  );
                })}
              </div>
              
              {/* Skip button with distinctive styling */}
              <button
                onClick={skipTabooWord}
                style={{
                  background: "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  padding: "12px 24px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: "0 4px 12px rgba(255, 107, 107, 0.4)",
                  marginTop: "auto" // Push to bottom
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, #FF5252 0%, #FF7043 100%)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 107, 107, 0.5)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 107, 107, 0.4)";
                }}
              >
                ⏭️ Skip Word
              </button>
            </div>
            
            {/* Conversation Area - 2/3 width */}
            <div style={{
              flex: "2",
              display: "flex",
              flexDirection: "column"
            }}>
              <div style={{
                border: `3px solid ${currentMode.color}`, 
                borderRadius: "20px", 
                padding: "20px", 
                height: "500px", // Fixed height for consistent scrolling
                overflowY: "auto",
                overflowX: "hidden",
                background: `linear-gradient(135deg, ${currentMode.bgColor} 0%, white 100%)`,
                display: "flex",
                flexDirection: "column"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "20px",
                  flexShrink: 0, // Don't shrink header
                  paddingBottom: "15px",
                  borderBottom: "2px solid rgba(255,255,255,0.3)"
                }}>
                  <h3 style={{
                    margin: 0, 
                    fontSize: "20px", 
                    color: currentMode.color,
                    fontWeight: "bold"
                  }}>
                    🎮 Taboo Game Conversation
                  </h3>
                </div>

                {/* Scrollable messages area */}
                <div style={{
                  flex: 1, // Take remaining space
                  overflowY: "auto",
                  overflowX: "hidden",
                  paddingRight: "10px" // Space for scrollbar
                }}>
                  {conversation.length === 0 && !currentUserMessage && !currentAssistantMessage && (
                  <div style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "#666",
                    fontSize: "18px"
                  }}>
                    <div style={{fontSize: "48px", marginBottom: "15px"}}>🎤</div>
                    Start describing your word!
                  </div>
                  )}
                  
                  {/* Canlı mesaj gösterimi - EN ÜSTTE (newest on top) */}
                  {currentUserMessage && (
                    <div style={{
                      marginBottom: "15px",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      color: "white",
                      opacity: 0.9,
                      fontSize: "14px",
                      boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
                      border: "2px solid rgba(255,255,255,0.3)"
                    }}>
                      <div style={{ fontWeight: "bold", marginBottom: "5px", fontSize: "12px" }}>
                        🎤 Kez • Speaking...
                      </div>
                      <div>{currentUserMessage}</div>
                    </div>
                  )}
                  
                  {currentAssistantMessage && (
                    <div style={{
                      marginBottom: "15px",
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                      color: "white",
                      opacity: 0.9,
                      fontSize: "14px",
                      boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
                      border: "2px solid rgba(255,255,255,0.3)"
                    }}>
                      <div style={{ fontWeight: "bold", marginBottom: "5px", fontSize: "12px" }}>
                        🤖 AI • Responding...
                      </div>
                      <div>{currentAssistantMessage}</div>
                    </div>
                  )}
                  
                  {conversation
                    .filter(msg => msg.role !== "system") // Hide system messages from UI
                    .sort((a, b) => {
                      // Primary sort: timestamp DESC (newest on top)
                      const timeDiff = b.timestamp.getTime() - a.timestamp.getTime();
                      // Secondary sort: if timestamps are very close (within 100ms), use sequence
                      if (Math.abs(timeDiff) < 100) {
                        return b.sequence - a.sequence;
                      }
                      return timeDiff;
                    })
                    .map((msg) => {
                    // Taboo modunda AI'nin tahminlerini özel göster
                    const isGuess = gameMode === "taboo" && msg.role === "assistant" && 
                      (msg.content.toLowerCase().includes("is it") || 
                       msg.content.toLowerCase().includes("could it be") ||
                       msg.content.toLowerCase().includes("might it be"));
    
                    return (
                      <div
                        key={msg.id}
                        style={{
                          marginBottom: "15px",
                          padding: "12px 16px",
                          borderRadius: "12px",
                          background: msg.role === "user" 
                            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                            : isGuess
                            ? "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
                            : "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
                          color: "white",
                          boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
                          fontSize: "14px",
                          lineHeight: "1.4"
                        }}
                      >
                        <div style={{ 
                          fontWeight: "bold", 
                          marginBottom: "5px",
                          fontSize: "12px",
                          opacity: 0.9
                        }}>
                          {msg.role === "user" ? "🎤 Kez" : "🤖 AI"} • {msg.timestamp.toLocaleTimeString()}
                          {isGuess && " • 🎯 GUESS"}
                        </div>
                        <div>{msg.content}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Conversation Display - Only for non-taboo modes */}
        {gameMode !== "taboo" && (
        <div style={{
          border: `3px solid ${currentMode.color}`, 
          borderRadius: "20px", 
          padding: "20px", 
          height: "600px", // Fixed height for consistent scrolling
          overflowY: "auto",
          overflowX: "hidden",
          background: `linear-gradient(135deg, ${currentMode.bgColor} 0%, white 100%)`,
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
            flexShrink: 0, // Don't shrink header
            paddingBottom: "15px",
            borderBottom: "2px solid rgba(255,255,255,0.3)"
          }}>
            <h3 style={{
              margin: 0, 
              fontSize: "24px", 
              color: currentMode.color,
              fontWeight: "bold"
            }}>
              {currentMode.name} Conversation
            </h3>
            
            {/* Debug conversation array */}
          </div>

          {/* Scrollable messages area */}
          <div style={{
            flex: 1, // Take remaining space
            overflowY: "auto",
            overflowX: "hidden",
            paddingRight: "10px" // Space for scrollbar
          }}>
            {conversation.length === 0 && !currentUserMessage && !currentAssistantMessage && (
            <div style={{
              textAlign: "center",
              padding: "40px",
              color: "#666",
              fontSize: "18px"
            }}>
              <div style={{fontSize: "48px", marginBottom: "15px"}}>🎤</div>
              <p style={{margin: 0, fontWeight: "bold"}}>
                Start speaking!
              </p>
              <p style={{margin: "8px 0 0 0", opacity: 0.7}}>
                {currentMode.description}
              </p>
            </div>
          )}
          
          {conversation
            .filter(msg => msg.role !== "system") // Hide system messages from UI
            .sort((a, b) => b.sequence - a.sequence) // Sort by sequence DESC (newest on top)
            .map((msg) => {
            // This is non-taboo mode conversation display
            const isTabooGuess = false; // Not applicable in non-taboo modes
            
            // Düzeltmeleri tespit et (🔧 işareti olan mesajlar)
            const isCorrection = msg.role === "assistant" && msg.content.includes("🔧");
            
            return (
              <div key={msg.id} style={{
                margin: "15px 0",
                padding: "15px 20px",
                borderRadius: "15px",
                background: msg.role === "user" 
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : isTabooGuess 
                    ? "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)"
                    : isCorrection
                      ? "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)"
                      : `linear-gradient(135deg, ${currentMode.color} 0%, ${currentMode.color}90 100%)`,
                color: "white",
                boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
                border: isTabooGuess ? "3px solid #4CAF50" : isCorrection ? "3px solid #ff9800" : "none",
                transform: (isTabooGuess || isCorrection) ? "scale(1.02)" : "scale(1)",
                transition: "all 0.3s ease"
              }}>
                <div style={{
                  fontSize: "14px", 
                  opacity: 0.9, 
                  marginBottom: "8px",
                  fontWeight: "bold"
                }}>
                  {msg.role === "user" ? "🗣️ Kez" : 
                   isTabooGuess ? "🎯 AI Guess!" : 
                   isCorrection ? "🔧 English Correction" : "🎯 Coach"} • {msg.timestamp.toLocaleTimeString()}
                </div>
                <div style={{fontSize: "16px", lineHeight: 1.5, fontWeight: "500"}}>
                  {isTabooGuess && "🎉 "}
                  {msg.content}
                  {isTabooGuess && " 🎉"}
                </div>
                {isTabooGuess && (
                  <div style={{
                    marginTop: "10px",
                    padding: "8px 15px",
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "bold"
                  }}>
                    AI guessed correctly! Move to the next word! 🎯
                  </div>
                )}
                {isCorrection && (
                  <div style={{
                    marginTop: "10px",
                    padding: "8px 15px",
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "10px",
                    fontSize: "14px",
                    fontWeight: "bold"
                  }}>
                    📚 English learning support
                  </div>
                )}
    </div>
            );
          })}
          
          {/* Current user message (while speaking) - show if speaking or just finished */}
          {/* Current user message is now handled by real-time conversation array */}
          
          {/* Current assistant message (while responding) */}
          {currentAssistantMessage && (
            <div style={{
              margin: "15px 0",
              padding: "15px 20px",
              borderRadius: "15px",
              background: `linear-gradient(135deg, ${currentMode.color} 0%, ${currentMode.color}90 100%)`,
              color: "white",
              opacity: 0.9,
              boxShadow: "0 4px 15px rgba(0,0,0,0.1)"
            }}>
              <div style={{fontSize: "14px", opacity: 0.9, marginBottom: "8px", fontWeight: "bold"}}>
                🎯 Coach • responding...
              </div>
              <div style={{fontSize: "16px", lineHeight: 1.5, fontWeight: "500"}}>
                {currentAssistantMessage}
              </div>
            </div>
          )}
          
          {/* Invisible div for auto-scroll target */}
          <div ref={conversationEndRef} style={{ height: "1px" }} />
          </div> {/* End of scrollable messages area */}
        </div>
        )}

        {/* Token Usage Stats */}
        {showUsageStats && sessionUsage && (
          <div style={{
            border: "2px solid #4CAF50",
            borderRadius: "15px",
            padding: "20px",
            marginTop: "20px",
            background: "linear-gradient(135deg, #E8F5E8 0%, #C8E6C9 100%)"
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "15px"
            }}>
              <h3 style={{color: "#2E7D32", margin: 0, fontSize: "20px"}}>
                💰 Session Cost Summary
              </h3>
              <button
                onClick={() => setShowUsageStats(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "20px",
                  cursor: "pointer",
                  color: "#666"
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "15px",
              marginBottom: "15px"
            }}>
              <div style={{background: "white", padding: "15px", borderRadius: "10px", textAlign: "center"}}>
                <div style={{fontSize: "24px", fontWeight: "bold", color: "#1976D2"}}>{sessionUsage.totalTokens.toLocaleString()}</div>
                <div style={{fontSize: "14px", color: "#666"}}>Total Tokens</div>
              </div>
              <div style={{background: "white", padding: "15px", borderRadius: "10px", textAlign: "center"}}>
                <div style={{fontSize: "24px", fontWeight: "bold", color: "#F57C00"}}>{sessionUsage.inputAudioTokens.toLocaleString()}</div>
                <div style={{fontSize: "14px", color: "#666"}}>Input Audio Tokens</div>
              </div>
              <div style={{background: "white", padding: "15px", borderRadius: "10px", textAlign: "center"}}>
                <div style={{fontSize: "24px", fontWeight: "bold", color: "#D32F2F"}}>{sessionUsage.outputAudioTokens.toLocaleString()}</div>
                <div style={{fontSize: "14px", color: "#666"}}>Output Audio Tokens</div>
              </div>
              <div style={{background: "white", padding: "15px", borderRadius: "10px", textAlign: "center"}}>
                <div style={{fontSize: "24px", fontWeight: "bold", color: "#388E3C"}}>${sessionUsage.cost.toFixed(4)}</div>
                <div style={{fontSize: "14px", color: "#666"}}>Total Cost</div>
              </div>
            </div>
            
            <div style={{
              background: "rgba(255,255,255,0.8)",
              padding: "15px",
              borderRadius: "10px",
              fontSize: "14px",
              color: "#555"
            }}>
              <strong>💡 Cost Breakdown:</strong><br/>
              • Input Audio: {sessionUsage.inputAudioTokens.toLocaleString()} tokens × $10.00/1M = ${((sessionUsage.inputAudioTokens / 1000000) * 10).toFixed(4)}<br/>
              • Output Audio: {sessionUsage.outputAudioTokens.toLocaleString()} tokens × $20.00/1M = ${((sessionUsage.outputAudioTokens / 1000000) * 20).toFixed(4)}<br/>
              <strong>Total Session Cost: ${sessionUsage.cost.toFixed(4)}</strong>
            </div>
          </div>
        )}

        {/* Debug Section (Optional) */}
        {showAdvanced && lastJson && (
          <div style={{
            border: "1px solid #eee", 
            borderRadius: "10px", 
            padding: "15px",
            background: "#f9f9f9",
            marginTop: "20px"
          }}>
            <details>
              <summary style={{cursor: "pointer", fontWeight: "bold", marginBottom: "10px"}}>
                🔧 Debug Info (Coach Response JSON)
              </summary>
              <pre style={{
                whiteSpace: "pre-wrap", 
                fontSize: "12px", 
                maxHeight: "200px", 
                overflowY: "auto",
                background: "white",
                padding: "10px",
                borderRadius: "5px",
                margin: 0
              }}>
                {JSON.stringify(lastJson, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Buzzer Popup */}
        {buzzerPopup.show && (
          <div style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(-2deg)",
            background: buzzerPopup.type === 'correct' 
              ? "linear-gradient(135deg, #4CAF50 0%, #45a049 100%)"
              : "linear-gradient(135deg, #ff4757 0%, #ff3742 100%)",
            color: "white",
            padding: "30px 40px",
            borderRadius: "20px",
            fontSize: "24px",
            fontWeight: "bold",
            textAlign: "center",
            boxShadow: buzzerPopup.type === 'correct'
              ? "0 20px 40px rgba(76, 175, 80, 0.4)"
              : "0 20px 40px rgba(255, 71, 87, 0.4)",
            zIndex: 9999,
            border: "3px solid white",
            transition: "transform 0.1s ease-in-out"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "10px" }}>
              {buzzerPopup.type === 'correct' ? '🎉' : '🚨'}
            </div>
            <div>{buzzerPopup.message}</div>
            
            {buzzerPopup.showChoices && (
              <>
                <div style={{
                  fontSize: "16px",
                  marginTop: "15px",
                  marginBottom: "20px",
                  opacity: 0.9
                }}>
                  What would you like to do?
                </div>
                
                <div style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
                  <button
                    onClick={buzzerPopup.type === 'correct' ? handleGetCoachFeedback : handleBuzzerContinue}
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "10px",
                      padding: "10px 20px",
                      fontSize: "16px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    {buzzerPopup.type === 'correct' ? '💬 Get Coach Feedback' : '🔄 Continue'}
                  </button>
                  
                  <button
                    onClick={handleBuzzerNextWord}
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      color: "white",
                      border: "2px solid white",
                      borderRadius: "10px",
                      padding: "10px 20px",
                      fontSize: "16px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)";
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    ➡️ Next Word
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* OLD Word Progression Popup - DISABLED (now using buzzer popup) */}
        {false && showWordProgression && currentWord && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            background: progressionReason === 'correct_guess' 
              ? 'linear-gradient(135deg, #4CAF50, #45a049)' 
              : 'linear-gradient(135deg, #ff9800, #f57c00)',
            color: 'white',
            padding: '20px',
            borderRadius: '15px',
            boxShadow: '0 8px 25px rgba(0,0,0,0.3)',
            maxWidth: '320px',
            zIndex: 1500,
            fontFamily: 'Arial, sans-serif'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
              {progressionReason === 'correct_guess' ? (
                <>🎉 Excellent! <strong>"{currentWord?.word}"</strong> was correct!</>
              ) : (
                <>🚨 Oops! Forbidden word used</>
              )}
            </div>
            
            <div style={{ fontSize: '14px', marginBottom: '15px', opacity: 0.9 }}>
              What would you like to do?
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button 
                onClick={continueWithCurrentWord}
                style={{ 
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.2)', 
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                🔄 Continue with<br/>"{currentWord?.word}"
              </button>
              
              <button 
                onClick={progressToNextWord}
                style={{ 
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.9)', 
                  color: progressionReason === 'correct_guess' ? '#4CAF50' : '#ff9800',
                  border: 'none',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'white'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)'}
              >
                ➡️ Next Word
              </button>
            </div>
            
            <div style={{ 
              fontSize: '12px', 
              textAlign: 'center', 
              opacity: 0.8,
              background: 'rgba(0, 0, 0, 0.2)',
              padding: '6px 10px',
              borderRadius: '6px'
            }}>
              ⏰ Auto-next in <strong>{progressionCountdown}</strong> seconds
            </div>
          </div>
        )}

        {/* Fixed Move to Next Word Button - Only during feedback mode */}
        {currentWord && gameRoundActive && isInFeedbackMode && (
          <div style={{
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            zIndex: 1000
          }}>
            <button
              onClick={handleMoveToNextWord}
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                color: "white",
                border: "none",
                borderRadius: "25px",
                padding: "15px 25px",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(99, 102, 241, 0.4)",
                transition: "all 0.3s ease",
                display: "flex",
                alignItems: "center",
                gap: "10px"
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 6px 25px rgba(99, 102, 241, 0.6)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(99, 102, 241, 0.4)";
              }}
            >
              ⏭️ Next Word
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{
          textAlign: "center",
          marginTop: "30px",
          padding: "20px",
          background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
          borderRadius: "15px"
        }}>
          <p style={{margin: 0, fontSize: "16px", color: "#666"}}>
            🎯 <strong>Hi Kez!</strong> Once connected, start speaking and your Coach will respond instantly!
          </p>
          <p style={{margin: "8px 0 0 0", fontSize: "14px", color: "#888"}}>
            You can interrupt and take control of the conversation anytime.
          </p>
        </div>
      </div>
    </div>
    
    {/* Progress Dashboard */}
    <ProgressDashboard 
      isVisible={showProgressDashboard}
      onClose={() => setShowProgressDashboard(false)}
    />
    </>
  );
}
