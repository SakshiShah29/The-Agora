import * as dotenv from "dotenv";
dotenv.config();

const LLM_PROVIDER = process.env.LLM_PROVIDER || "ollama";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

export async function callLLM(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const { maxTokens = 512, temperature = 0.7 } = opts;

  if (LLM_PROVIDER === "ollama") {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
    const data:any = await resp.json();
    return data.response || "";
  }

  if (LLM_PROVIDER === "gemini") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY not set");
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`);
    const data:any = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // Claude fallback
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
  });
  return resp.content.filter((b): b is any => b.type === "text").map((b) => b.text).join("");
}