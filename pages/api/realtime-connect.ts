import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { sdp, model, token } = req.body;
    
    if (!sdp) {
      return res.status(400).json({ error: "SDP is required" });
    }

    const realtime_model = model || process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview-2024-10-01";
    
    console.log("Proxying WebRTC SDP to OpenAI for model:", realtime_model);
    
    const authToken = token || process.env.OPENAI_API_KEY;
    if (!authToken) {
      return res.status(500).json({ error: "missing_auth", detail: "No OpenAI auth token available" });
    }

    const response = await fetch(`https://api.openai.com/v1/realtime?model=${realtime_model}`, {
      method: "POST",
      body: sdp,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/sdp",
        "OpenAI-Beta": "realtime=v1",
        ...(process.env.OPENAI_ORGANIZATION ? { "OpenAI-Organization": process.env.OPENAI_ORGANIZATION } : {})
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      return res.status(response.status).json({ 
        error: "OpenAI API error", 
        detail: errorText,
        status: response.status 
      });
    }

    const answerSDP = await response.text();
    console.log("Received SDP answer from OpenAI");
    
    // SDP'yi text olarak döndür
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(answerSDP);
    
  } catch (e: any) {
    console.error("Proxy error:", e);
    res.status(500).json({ error: "server_error", detail: e?.message || String(e) });
  }
}
