import { useEffect, useRef, useState } from "react";
import { TABOO_WORDS } from "../lib/tabooWords";
import { GAME_MODE_PROMPTS } from "../lib/coachPrompt";

type Pace = "slow"|"medium"|"fast";
type GameMode = "casual"|"roleplay"|"taboo";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isComplete: boolean;
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
  const [connected, setConnected] = useState(false);
  const [pace, setPace] = useState<Pace>("medium");
  const [gameMode, setGameMode] = useState<GameMode>("casual");
  const [status, setStatus] = useState<string>("ready");
  const [lastJson, setLastJson] = useState<any>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [currentUserMessage, setCurrentUserMessage] = useState<string>("");
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Taboo Game States
  const [currentWord, setCurrentWord] = useState<typeof TABOO_WORDS[0] | null>(null);
  const [tabooScore, setTabooScore] = useState(0);
  const [usedWords, setUsedWords] = useState<string[]>([]);
  
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

  const pcRef = useRef<RTCPeerConnection|null>(null);
  const dcRef = useRef<RTCDataChannel|null>(null);
  const micStreamRef = useRef<MediaStream|null>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);

  // Push-to-talk functionality
  useEffect(() => {
    if (connected && micStreamRef.current && isPushToTalk) {
      const tracks = micStreamRef.current.getAudioTracks();
      tracks.forEach(track => {
        track.enabled = isRecording;
      });
    }
  }, [isRecording, connected, isPushToTalk]);

  // Taboo Game Functions
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
  };

  const nextTabooWord = () => {
    setTabooScore(prev => prev + 1);
    getNewTabooWord();
  };

  const skipTabooWord = () => {
    getNewTabooWord();
  };

  // Taboo moduna geçince yeni kelime al
  useEffect(() => {
    if (gameMode === "taboo" && !currentWord) {
      getNewTabooWord();
    } else if (gameMode !== "taboo") {
      setCurrentWord(null);
    }
  }, [gameMode]);

  // Dynamic prompt generation for Taboo mode
  const getCurrentPrompt = (mode: GameMode) => {
    if (mode === "taboo") {
      return `🚫 You are Kez's enthusiastic Taboo game partner and English coach!

CRITICAL RULES - READ CAREFULLY:
- You are the GUESSER, NOT the word provider
- Kez has her own word card that you CANNOT see
- NEVER give Kez a word to describe
- NEVER say "describe this word" or "your word is..."
- Wait for Kez to start describing something to you

YOUR ROLE:
1. Greet Kez warmly and wait for her to describe something
2. Listen to her descriptions and try to guess what she's talking about
3. Make genuine guesses: "Is it a [your guess]?" or "Are you thinking of [guess]?"
4. You don't know what the target word is - figure it out from her clues!

WHEN KEZ DESCRIBES SOMETHING:
- Listen carefully and try to guess: "Hmm Kez, based on your description... is it [guess]?"
- Encourage her: "Great description so far, Kez! Tell me more!"
- Build suspense: "Interesting... I'm thinking... could it be...?"
- If you're unsure: "Can you give me another clue, Kez?"

ENGAGEMENT FOR KEZ:
- HIGH ENERGY responses: "Come on Kez, you've got this!", "Amazing clues!"
- Celebrate her creativity: "Kez, what a clever way to describe that!"
- Motivational boosts: "You're getting so good at this game!"
- Make her feel successful: "You're making this look easy!"

TEACHING WHILE PLAYING:
- Gently correct major mistakes while staying in the game
- Vocabulary building: "Perfect word choice, Kez!"
- Encourage attempts: "Great effort, Kez!"

REMEMBER: Wait for Kez to describe something - don't give her words! 🎲✨`;
    }
    return GAME_MODE_PROMPTS[mode];
  };

  const sendSessionUpdate = (currentPace: Pace, currentGameMode: GameMode) => {
    if (dcRef.current && dcRef.current.readyState === "open") {
      dcRef.current.send(JSON.stringify({
        type: "session.update",
        session: {
          instructions: getCurrentPrompt(currentGameMode),
          turn_detection: {
            type: "server_vad",
            threshold: 0.8, // Daha yüksek threshold - daha az hassas
            prefix_padding_ms: 500, // Daha uzun bekleme
            silence_duration_ms: currentGameMode === "taboo" ? 3500 : 4000 // 3.5-4 saniye sessizlik - Kez'e düşünme zamanı
          },
          temperature: currentPace === "slow" ? 0.6 : currentPace === "fast" ? 1.0 : 0.8,
          modalities: ["audio", "text"], // Ensure both audio and text are enabled
          output_audio_format: "pcm16"
        }
      }));
    }
  };

  // Pace/GameMode değiştikçe session güncelle
  useEffect(() => {
    sendSessionUpdate(pace, gameMode);
  }, [pace, gameMode]);

  // Taboo kelimesi değiştiğinde prompt güncellemeye gerek yok - AI kelimeyi bilmiyor

  const connect = async () => {
    try {
      setStatus("requesting ephemeral token…");
      const sess = await fetch("/api/realtime-session", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameMode })
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
        sendSessionUpdate(pace, gameMode); // Bu zaten doğru prompt'u gönderecek
        
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
              
              const responseRequest = { 
                type: "response.create",
                response: {
                  modalities: ["audio", "text"], // Force both audio and text output
                  output_audio_format: "pcm16"
                }
              };
              console.log("Requesting response:", responseRequest);
              dc.send(JSON.stringify(responseRequest));
              
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
        console.log("DataChannel message received:", ev.data);
        try {
          const msg = JSON.parse(ev.data);
          console.log("Parsed message:", msg);
          
          // Error mesajlarını özellikle takip et
          if (msg.type === "error") {
            console.error("API Error received:", msg.error);
            setStatus(`API Error: ${msg.error?.message || 'Unknown error'}`);
            return;
          }
          
          // Kullanıcı konuşma transcript'i
          if (msg?.type === "conversation.item.input_audio_transcription.completed") {
            const transcript = msg.transcript || "";
            setCurrentUserMessage(transcript);
            if (transcript) {
              setConversation(prev => [...prev, {
                id: `user-${Date.now()}`,
                role: "user",
                content: transcript,
                timestamp: new Date(),
                isComplete: true
              }]);
              setCurrentUserMessage(""); // Temizle
            }
          }
          
          // Asistan cevap transcript'i (text delta)
          if (msg?.type === "response.output_text.delta") {
            const textDelta = msg.delta || "";
            console.log("Text delta received:", textDelta);
            setCurrentAssistantMessage(prev => {
              const newMessage = prev + textDelta;
              console.log("Updated assistant message:", newMessage);
              return newMessage;
            });
          }
          
          // Alternative AI response formats
          if (msg?.type === "response.text.delta") {
            const textDelta = msg.delta || "";
            console.log("Alternative text delta received:", textDelta);
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
          
          // Asistan cevabı tamamlandı
          if (msg?.type === "response.done") {
            console.log("Response done! Current assistant message:", currentAssistantMessage);
            if (currentAssistantMessage.trim()) {
              setConversation(prev => [...prev, {
                id: `assistant-${Date.now()}`,
                role: "assistant", 
                content: currentAssistantMessage,
                timestamp: new Date(),
                isComplete: true
              }]);
              setCurrentAssistantMessage(""); // Temizle
              console.log("Added assistant message to conversation");
            } else {
              console.log("Assistant message was empty, not adding to conversation");
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
              
              console.log("💰 Token Usage:", {
                total: usage.total_tokens,
                input_audio: inputAudioTokens,
                output_audio: outputAudioTokens,
                cost: `$${totalCost.toFixed(4)}`
              });
            }
            
            console.log("Response completed:", msg.response);
          }
          
          // JSON formatında öğretmen yanıtı
          if (msg?.type === "response.completed" && msg?.response) {
            setLastJson(msg.response);
          }
          
          if (msg?.type === "response.audio.delta") {
            console.log("Audio delta received");
          }
        } catch (e) { 
          console.log("Non-JSON message:", ev.data);
        }
      };

      // Offer oluştur
      setStatus("creating offer…");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("Created SDP offer:", offer.sdp?.substring(0, 100) + "...");

      // OpenAI Realtime'a SDP gönder (WebRTC handshake) - proxy üzerinden
      setStatus("sending SDP to OpenAI via proxy…");
      const model = "gpt-4o-mini-realtime-preview-2024-12-17"; // cheaper realtime tier
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
            ⚙️ {showAdvanced ? "Hide Settings" : "Speed Settings"}
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
            </div>
          )}
        </div>

        {/* Taboo Word Card - Only show in Taboo mode */}
        {gameMode === "taboo" && currentWord && (
          <div style={{
            border: `4px solid ${currentMode.color}`,
            borderRadius: "20px",
            padding: "25px",
            marginBottom: "25px",
            background: `linear-gradient(135deg, ${currentMode.color} 0%, ${currentMode.color}90 100%)`,
            color: "white",
            textAlign: "center",
            boxShadow: "0 8px 25px rgba(0,0,0,0.15)"
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

            <div style={{
              fontSize: "48px",
              fontWeight: "bold",
              marginBottom: "20px",
              textShadow: "2px 2px 4px rgba(0,0,0,0.3)"
            }}>
              {currentWord.word}
      </div>

            <div style={{
              fontSize: "18px",
              marginBottom: "20px",
              opacity: 0.9
            }}>
              Describe this word, but don't use these words:
      </div>

            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "center",
              marginBottom: "25px"
            }}>
              {currentWord.forbidden.map((word, index) => (
                <div
                  key={index}
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    color: currentMode.color,
                    padding: "8px 15px",
                    borderRadius: "25px",
                    fontSize: "16px",
                    fontWeight: "bold",
                    border: "2px solid white"
                  }}
                >
                  🚫 {word}
                </div>
              ))}
      </div>

            <div style={{
              display: "flex",
              gap: "15px",
              justifyContent: "center"
            }}>
              <button
                onClick={nextTabooWord}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  color: currentMode.color,
                  border: "none",
                  padding: "12px 25px",
                  borderRadius: "25px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
              >
                ✅ Correct! (+1)
              </button>
              <button
                onClick={skipTabooWord}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  color: "white",
                  border: "2px solid white",
                  padding: "12px 25px",
                  borderRadius: "25px",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
              >
                ⏭️ Skip
              </button>
            </div>
          </div>
        )}

        {/* Live Conversation Display */}
        <div style={{
          border: `3px solid ${currentMode.color}`, 
          borderRadius: "20px", 
          padding: "20px", 
          maxHeight: "500px", 
          overflowY: "auto",
          background: `linear-gradient(135deg, ${currentMode.bgColor} 0%, white 100%)`,
          marginBottom: "20px"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px"
          }}>
            <h3 style={{
              margin: 0, 
              fontSize: "24px", 
              color: currentMode.color,
              fontWeight: "bold"
            }}>
              {currentMode.name} Conversation
            </h3>
            <div style={{
              padding: "8px 15px",
              background: currentMode.color,
              color: "white",
              borderRadius: "20px",
              fontSize: "14px",
              fontWeight: "bold"
            }}>
              {conversation.length} messages
            </div>
      </div>

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
          
          {conversation.map((msg) => {
            // Taboo modunda AI'nin tahminlerini özel göster
            const isTabooGuess = gameMode === "taboo" && msg.role === "assistant" && 
              currentWord && msg.content.toLowerCase().includes(currentWord.word.toLowerCase());
            
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
          
          {/* Current user message (while speaking) */}
          {currentUserMessage && (
            <div style={{
              margin: "15px 0",
              padding: "15px 20px",
              borderRadius: "15px",
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              opacity: 0.8,
              animation: "pulse 1.5s infinite",
              boxShadow: "0 4px 15px rgba(0,0,0,0.1)"
            }}>
              <div style={{fontSize: "14px", opacity: 0.9, marginBottom: "8px", fontWeight: "bold"}}>
                🗣️ Kez • speaking...
              </div>
              <div style={{fontSize: "16px", lineHeight: 1.5, fontWeight: "500"}}>
                {currentUserMessage}
              </div>
            </div>
          )}
          
          {/* Current assistant message (while responding) */}
          {currentAssistantMessage && (
            <div style={{
              margin: "15px 0",
              padding: "15px 20px",
              borderRadius: "15px",
              background: `linear-gradient(135deg, ${currentMode.color} 0%, ${currentMode.color}90 100%)`,
              color: "white",
              opacity: 0.8,
              animation: "pulse 1.5s infinite",
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
        </div>

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
  );
}
