import type { NextApiRequest, NextApiResponse } from "next";
import { GAME_MODE_PROMPTS } from "../../lib/coachPrompt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { gameMode = "casual", voice = "verse" } = req.body;
    const model = "gpt-4o-mini-realtime-preview-2024-12-17"; // cheaper realtime tier
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "missing_api_key", detail: "OPENAI_API_KEY is not set" });
    }
    
    // Doğru prompt'u seç
    const instructions = GAME_MODE_PROMPTS[gameMode as keyof typeof GAME_MODE_PROMPTS] || GAME_MODE_PROMPTS.casual;

    const requestBody = {
      model,
      voice: voice,
      modalities: ["audio", "text"],
      instructions: instructions,
      input_audio_transcription: {
        model: "whisper-1",
        language: "en"
      },
      // Enhanced noise reduction for better background noise filtering - removed due to API compatibility
      // input_audio_noise_reduction: true,
      turn_detection: { 
        type: "server_vad", 
        threshold: 0.9, // Higher threshold for better noise filtering
        create_response: true, 
        interrupt_response: true,
        prefix_padding_ms: 800, // More padding to avoid false triggers
        silence_duration_ms: 1000 // Longer silence duration
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
    };

    console.log("🔍 Making request to OpenAI with:");
    console.log("- URL: https://api.openai.com/v1/realtime/sessions");
    console.log("- API Key length:", apiKey?.length);
    console.log("- API Key first 20 chars:", apiKey?.substring(0, 20));
    console.log("- API Key last 10 chars:", apiKey?.substring(-10));
    console.log("- Model:", model);
    console.log("- Voice:", voice);
    console.log("- Game Mode:", gameMode);
    console.log("- Body size:", JSON.stringify(requestBody).length, "bytes");

    // For local development: use working Vercel proxy
    const isLocal = process.env.NODE_ENV === 'development';
    
    if (isLocal) {
      // Local development: use Vercel proxy directly (working)
      const vercelUrl = "https://kez-english-app.vercel.app/api/realtime-session";
      console.log("🔄 LOCAL DEV: Using Vercel proxy directly");
      
      const vercelResponse = await fetch(vercelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameMode, voice })
      });
      
      if (!vercelResponse.ok) {
        const vercelError = await vercelResponse.text();
        console.log("❌ Vercel proxy failed:", vercelError);
        return res.status(500).json({ error: "session_create_failed", detail: vercelError });
      }
      
      const session = await vercelResponse.json();
      console.log("✅ Vercel proxy success");
      return res.status(200).json(session);
    }
    
    // Production: direct OpenAI API
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
