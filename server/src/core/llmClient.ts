import { createOllama } from "ai-sdk-ollama"
const modelId = "kimi-k2.5:cloud";

const ollama  = createOllama({
  apiKey: "ollama",
  baseURL: "http://localhost:11434",
});

const model = ollama(modelId);

export default model;