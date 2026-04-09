/**
 * AI Copilot Service — Groq API Integration
 * Converts natural language → structured workflow JSON
 */

// ── Types ────────────────────────────────────

export interface AINode {
  id: string;
  type: string;
  label: string;
  category: 'trigger' | 'action' | 'logic' | 'defi' | 'notification';
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface AIEdge {
  id: string;
  source: string;
  target: string;
}

export interface AIWorkflowResult {
  nodes: AINode[];
  edges: AIEdge[];
  explanation: string;
  name: string;
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GroqChoice {
  message: { content: string };
}

interface GroqResponse {
  choices: GroqChoice[];
}

// ── Constants ────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// Rate limiting
let lastCallTime = 0;
const MIN_INTERVAL_MS = 2000; // 2 seconds between calls
let callCount = 0;
const MAX_CALLS_PER_MINUTE = 10;

// ── Prompt Templates ─────────────────────────

const WORKFLOW_GENERATION_PROMPT = `You are MICROFLUX-X1 AI, an expert Algorand workflow builder.

Given a user's natural language description, generate a structured workflow with nodes and connections.

Available node types:
TRIGGERS: timer_loop, wallet_event, webhook_trigger
ACTIONS: send_payment, asa_transfer, app_call, http_request
LOGIC: delay, filter, debug_log
DEFI: get_quote, price_feed
NOTIFICATIONS: browser_notification, telegram_notify, discord_notify

Rules:
1. Each node must have: id, type, label, category, config, position
2. Positions should be spaced (x increments of 250, y varies for parallel paths)
3. Edges connect source node to target node
4. Include a clear explanation of the workflow
5. Use realistic Algorand addresses where needed (use placeholder: ALGO_ADDRESS_PLACEHOLDER)
6. For amounts, use microAlgos notation in config but display in ALGO in labels

You MUST respond ONLY with valid JSON in this exact schema:
{
  "name": "Workflow Name",
  "nodes": [
    {
      "id": "node_1",
      "type": "send_payment",
      "label": "Send 1 ALGO",
      "category": "action",
      "config": { "amount": 1000000, "receiver": "ALGO_ADDRESS_PLACEHOLDER" },
      "position": { "x": 100, "y": 200 }
    }
  ],
  "edges": [
    { "id": "edge_1", "source": "node_1", "target": "node_2" }
  ],
  "explanation": "This workflow does X then Y..."
}

Do NOT include any text outside the JSON object.`;

const WORKFLOW_EXPLANATION_PROMPT = `You are MICROFLUX-X1 AI. Given a workflow JSON, explain what it does in clear, human-readable format.

Provide:
1. A one-line summary
2. Step-by-step breakdown
3. Any warnings or considerations (gas fees, timing, etc.)

Keep it concise and technical but accessible.`;

// ── Validation ───────────────────────────────

function validateWorkflowResult(data: unknown): data is AIWorkflowResult {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) return false;
  if (typeof obj.explanation !== 'string') return false;
  if (typeof obj.name !== 'string') return false;

  for (const node of obj.nodes) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (!n.id || !n.type || !n.label || !n.category || !n.position) return false;
    const pos = n.position as Record<string, unknown>;
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
  }

  for (const edge of obj.edges) {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (!e.id || !e.source || !e.target) return false;
  }

  return true;
}

// ── Rate Limiting ────────────────────────────

function checkRateLimit(): boolean {
  const now = Date.now();

  // Reset counter every minute
  if (now - lastCallTime > 60000) {
    callCount = 0;
  }

  if (callCount >= MAX_CALLS_PER_MINUTE) {
    return false;
  }

  if (now - lastCallTime < MIN_INTERVAL_MS) {
    return false;
  }

  return true;
}

// ── Core API Call ────────────────────────────

async function callGroq(messages: GroqMessage[], apiKey: string): Promise<string> {
  if (!checkRateLimit()) {
    throw new Error('Rate limit reached. Please wait a moment before trying again.');
  }

  lastCallTime = Date.now();
  callCount++;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data: GroqResponse = await response.json();
  return data.choices[0]?.message?.content ?? '';
}

// ── Public API ───────────────────────────────

/**
 * Generate a workflow from natural language description
 */
export async function generateWorkflow(
  prompt: string,
  apiKey: string
): Promise<AIWorkflowResult> {
  if (!prompt.trim()) {
    throw new Error('Please provide a workflow description.');
  }

  if (!apiKey.trim()) {
    throw new Error('Groq API key is required. Add it in settings.');
  }

  const messages: GroqMessage[] = [
    { role: 'system', content: WORKFLOW_GENERATION_PROMPT },
    { role: 'user', content: prompt },
  ];

  const raw = await callGroq(messages, apiKey);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI returned invalid JSON. Please try rephrasing your request.');
  }

  if (!validateWorkflowResult(parsed)) {
    throw new Error('AI response did not match expected workflow schema. Please try again.');
  }

  return parsed;
}

/**
 * Explain an existing workflow in natural language
 */
export async function explainWorkflow(
  workflow: { nodes: AINode[]; edges: AIEdge[] },
  apiKey: string
): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error('Groq API key is required.');
  }

  const messages: GroqMessage[] = [
    { role: 'system', content: WORKFLOW_EXPLANATION_PROMPT },
    {
      role: 'user',
      content: `Explain this workflow:\n${JSON.stringify(workflow, null, 2)}`,
    },
  ];

  return await callGroq(messages, apiKey);
}

/**
 * Get workflow suggestions based on partial input
 */
export async function suggestNodes(
  description: string,
  apiKey: string
): Promise<{ suggestions: string[] }> {
  if (!apiKey.trim()) {
    throw new Error('Groq API key is required.');
  }

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: `You are MICROFLUX-X1 AI. Given a partial workflow description, suggest 3-5 next nodes that would make sense.
Return JSON: { "suggestions": ["Send Payment to X", "Add Delay of 5s", ...] }`,
    },
    { role: 'user', content: description },
  ];

  const raw = await callGroq(messages, apiKey);
  try {
    return JSON.parse(raw);
  } catch {
    return { suggestions: [] };
  }
}
