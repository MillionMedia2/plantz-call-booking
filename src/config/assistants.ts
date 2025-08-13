import { OpenAI } from 'openai';
import { systemPrompt } from './instructions';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Main Plantz Assistant - handles information, eligibility, and booking
export const plantzAssistant = {
  name: "Plantz Medical Cannabis Assistant",
  model: "gpt-4o-mini",
  instructions: `${systemPrompt}

## CONDITION VERIFICATION

When asked to check if a condition is treatable with medical cannabis:
1. Use the knowledge base to verify if the condition is eligible for medical cannabis treatment
2. Provide a clear, concise response indicating whether the condition is treatable
3. If treatable, mention that the condition can be treated with medical cannabis
4. If not treatable, explain why and suggest alternative treatment options
5. Keep responses focused and factual

### RESPONSE GUIDELINES
- Use clear language: "This condition is treatable with medical cannabis" or "This condition is not eligible for medical cannabis treatment"
- Provide brief explanation of why it is or isn't treatable
- Suggest alternatives if the condition is not treatable
- Keep responses under 100 words for efficiency

## TOOLS
- File search for condition verification`,
  tools: [{
    type: "file_search" as const,
    vector_store_ids: [process.env.VECTOR_STORE_IDS || "vs_67a669ee3c408191b5588e966f605592"],
    max_num_results: 20
  }]
};

// Function to create or get the assistant
export async function getOrCreateAssistant() {
  try {
    // Use the provided assistant ID if available
    if (process.env.OPENAI_ASSISTANT_KEY) {
      console.log("Using provided assistant:", process.env.OPENAI_ASSISTANT_KEY);
      const assistant = await openai.beta.assistants.retrieve(process.env.OPENAI_ASSISTANT_KEY);
      
      // Update the assistant with new instructions if needed
      if (assistant.instructions !== plantzAssistant.instructions) {
        console.log("Updating assistant instructions...");
        const updatedAssistant = await openai.beta.assistants.update(process.env.OPENAI_ASSISTANT_KEY, {
          instructions: plantzAssistant.instructions,
        });
        return updatedAssistant;
      }
      
      return assistant;
    }
    
    // Check if assistant already exists
    const assistants = await openai.beta.assistants.list();
    const existingAssistant = assistants.data.find(a => a.name === plantzAssistant.name);
    
    if (existingAssistant) {
      console.log("Using existing assistant:", existingAssistant.id);
      return existingAssistant;
    }
    
    // Create new assistant
    const assistant = await openai.beta.assistants.create({
      name: plantzAssistant.name,
      model: plantzAssistant.model,
      instructions: plantzAssistant.instructions,
      tools: plantzAssistant.tools,
    });
    
    console.log("Created new assistant:", assistant.id);
    return assistant;
  } catch (error) {
    console.error("Error creating/getting assistant:", error);
    throw error;
  }
}

// Function to create a new thread
export async function createThread() {
  try {
    const thread = await openai.beta.threads.create();
    return thread;
  } catch (error) {
    console.error("Error creating thread:", error);
    throw error;
  }
}

// Function to add message to thread
export async function addMessageToThread(threadId: string, content: string) {
  try {
    const message = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: content,
    });
    return message;
  } catch (error) {
    console.error("Error adding message to thread:", error);
    throw error;
  }
}

// Function to run assistant
export async function runAssistant(threadId: string, assistantId: string) {
  try {
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });
    return run;
  } catch (error) {
    console.error("Error running assistant:", error);
    throw error;
  }
}

// Function to get run status
export async function getRunStatus(threadId: string, runId: string) {
  try {
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    return run;
  } catch (error) {
    console.error("Error getting run status:", error);
    throw error;
  }
}

// Function to get messages from thread
export async function getThreadMessages(threadId: string) {
  try {
    const messages = await openai.beta.threads.messages.list(threadId);
    return messages;
  } catch (error) {
    console.error("Error getting thread messages:", error);
    throw error;
  }
}
