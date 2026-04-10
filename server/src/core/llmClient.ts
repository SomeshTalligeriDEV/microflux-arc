import { createGroq } from '@ai-sdk/groq'
const modelId = 'openai/gpt-oss-120b'

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
})

const model = groq(modelId)

export default model;