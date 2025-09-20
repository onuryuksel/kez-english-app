import type { NextApiRequest, NextApiResponse } from "next";
import { GAME_MODE_PROMPTS } from "../../lib/coachPrompt";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { gameMode = "casual" } = req.body;
    const model = "gpt-4o-mini-realtime-preview-2024-12-17"; // cheaper realtime tier
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "missing_api_key", detail: "OPENAI_API_KEY is not set" });
    }
    
    // Doğru prompt'u seç
    const instructions = GAME_MODE_PROMPTS[gameMode as keyof typeof GAME_MODE_PROMPTS] || GAME_MODE_PROMPTS.casual;

    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "realtime=v1",
        ...(process.env.OPENAI_ORGANIZATION ? { "OpenAI-Organization": process.env.OPENAI_ORGANIZATION } : {})
      },
      body: JSON.stringify({
        model,
        // Realtime oturumu için başlangıç ayarları:
        voice: "verse",                // (dokümandaki örnek seslerden biri)
        modalities: ["audio", "text"], // konuşma içeriği
        instructions: instructions,
        // Transcription özelliğini etkinleştir - İngilizce zorla
        input_audio_transcription: {
          model: "whisper-1",
          language: "en" // Kullanıcı transcription İngilizce zorla
        },
        // AI output transcription da İngilizce olsun
        output_audio_transcription: {
          model: "whisper-1", 
          language: "en" // AI transcription da İngilizce zorla
        },
        // Turn detection ve response ayarları
        turn_detection: { 
          type: "server_vad", 
          create_response: true, 
          interrupt_response: true 
        },
        // Output options - audio format
        output_audio_format: "pcm16",
        speed: 1.0
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: "session_create_failed", detail: err });
    }

    const session = await r.json();
    // session.client_secret.value → tarayıcıya verilecek ephemeral token
    res.status(200).json(session);
  } catch (e: any) {
    res.status(500).json({ error: "server_error", detail: e?.message || String(e) });
  }
}
