import Anthropic from '@anthropic-ai/sdk';
import type { CopilotAnswer } from '@suraj/core';

/**
 * Optional: rewrite the copilot's deterministic answer in natural language with Claude.
 * Without ANTHROPIC_API_KEY the deterministic answer is returned unchanged, so the
 * copilot always works offline and never invents numbers.
 */
export async function polishAnswer(question: string, answer: CopilotAnswer): Promise<CopilotAnswer & { model?: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return answer;
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model,
      max_tokens: 400,
      system:
        'You are Suraj Copilot, an operations assistant for an Indian logistics company. ' +
        'Rewrite the draft answer for a busy dispatcher in 1–3 short sentences. ' +
        (answer.lang === 'hi' ? 'Reply in simple Hinglish (Hindi in Latin script). ' : 'Reply in plain English. ') +
        'Use only the facts given; never add numbers, names or promises that are not in them.',
      messages: [{ role: 'user', content: `Question: ${question}\n\nDraft answer: ${answer.text}\n\nFacts (JSON): ${JSON.stringify(answer.facts).slice(0, 6000)}` }],
    });
    const text = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join(' ')
      .trim();
    return text ? { ...answer, text, model } : answer;
  } catch {
    return answer;
  }
}
