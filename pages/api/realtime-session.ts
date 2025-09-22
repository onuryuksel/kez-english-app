import type { NextApiRequest, NextApiResponse } from "next";
import { GAME_MODE_PROMPTS, PACE_MODIFIERS } from "../../lib/coachPrompt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { gameMode = "casual", voice = "verse", pace = "medium" } = req.body;
    const model = "gpt-realtime-2025-08-28"; // Latest realtime model (Aug 2025)
    
    // For local development, manually read the .env.local file if needed
    let apiKey = process.env.OPENAI_API_KEY;
    
    if (process.env.NODE_ENV === 'development' && !apiKey) {
      try {
        const fs = require('fs');
        const envContent = fs.readFileSync('.env.local', 'utf8');
        const match = envContent.match(/OPENAI_API_KEY=(.+)/);
        if (match) {
          apiKey = match[1].trim();
          console.log("📁 Loaded API key from .env.local file");
        }
      } catch (e: any) {
        console.log("⚠️ Could not read .env.local:", e.message);
      }
    }
    
    // For local development, always use Vercel proxy (more reliable)
    if (process.env.NODE_ENV === 'development') {
      console.log("🔧 LOCAL DEV: Using working Vercel deployment as proxy");
      console.log("- Bypassing local API key issues");
      console.log("- Game Mode:", gameMode);
      console.log("- Voice:", voice);
      
      try {
        // Use your working Vercel deployment URL
        const vercelResponse = await fetch("https://kez-english-app.vercel.app/api/realtime-session", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "Local-Development-Proxy"
          },
          body: JSON.stringify({ gameMode, voice, pace })
        });
        
        if (vercelResponse.ok) {
          const session = await vercelResponse.json();
          console.log("✅ Vercel proxy successful!");
          return res.status(200).json(session);
        } else {
          const error = await vercelResponse.text();
          console.log("❌ Vercel proxy failed:", error);
          return res.status(500).json({ 
            error: "vercel_proxy_failed", 
            detail: `Vercel deployment proxy failed: ${error}` 
          });
        }
      } catch (error) {
        console.log("❌ Vercel proxy error:", error);
        return res.status(500).json({ 
          error: "vercel_proxy_error", 
          detail: `Cannot connect to Vercel proxy: ${error}` 
        });
      }
    }
    
    // Production code (this shouldn't run in development)
    if (!apiKey) {
      return res.status(500).json({ error: "missing_api_key", detail: "OPENAI_API_KEY is not set" });
    }
    
    // Direct API call for production with pace-based tone control
    const baseInstructions = GAME_MODE_PROMPTS[gameMode as keyof typeof GAME_MODE_PROMPTS] || GAME_MODE_PROMPTS.casual;
    const paceModifier = PACE_MODIFIERS[pace as keyof typeof PACE_MODIFIERS] || PACE_MODIFIERS.medium;
    const instructions = baseInstructions + paceModifier;
    const requestBody = {
      model,
      voice: voice || "marin",  // Default to marin for best quality
      modalities: ["audio", "text"],
      instructions: instructions,
      input_audio_transcription: {
        model: "whisper-1",
        language: "en"
      },
      turn_detection: { 
        type: "server_vad", 
        threshold: 0.95,  // Balanced threshold for reliable speech detection
        create_response: true, 
        interrupt_response: true,
        prefix_padding_ms: 800,  // Much more padding to avoid cutting off user mid-sentence
        silence_duration_ms: 4000,  // 4 seconds silence for English learners to think fully
        idle_timeout_ms: 15000  // Longer idle timeout - give user more time
      },
      output_audio_format: "pcm16",
      tools: gameMode === "taboo" ? [{
        type: "function",
        name: "taboo_guess_result",
        description: "Call this when you think you've guessed the word Kez is describing, or when you want to report game events",
        parameters: {
          type: "object",
          properties: {
            guessed_word: {
              type: "string",
              description: "The word you think Kez is describing"
            },
            is_correct: {
              type: "boolean", 
              description: "Whether you believe your guess is correct"
            },
            confidence: {
              type: "number",
              description: "Your confidence level (0-1)"
            },
            action: {
              type: "string",
              enum: ["guess", "correct", "give_up"],
              description: "What action you're taking"
            }
          },
          required: ["guessed_word", "is_correct", "confidence", "action"]
        }
      }] : [],
      tool_choice: gameMode === "taboo" ? "auto" : "none",
      speed: 1.0
      // Note: temperature parameter removed in GA version
      // GA models use consistent tone through prompting instead
      // cached_input and cache_control features are only available with newer API versions
      // Removed temporarily to maintain compatibility
    };

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1"
      },
      body: JSON.stringify(requestBody)
    });

    if (!r.ok) {
      const err = await r.text();
      console.log("❌ OpenAI API Error:", err);
      return res.status(500).json({ error: "session_create_failed", detail: err });
    }

    const session = await r.json();
    console.log("✅ Direct OpenAI API success");
    return res.status(200).json(session);
  } catch (e: any) {
    res.status(500).json({ error: "server_error", detail: e?.message || String(e) });
  }
}
// Force Vercel deployment Mon Sep 22 01:39:13 +04 2025
