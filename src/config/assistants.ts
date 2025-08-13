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

## HANDOFF INSTRUCTIONS

When a user wants to book a call or check eligibility, use the following handoff process:

### ELIGIBILITY CHECK HANDOFF
If the user mentions wanting to book a call or check eligibility:
1. Ask "What condition do you want to treat with cannabis?"
2. Use the knowledge base to check if the condition is treatable
3. If treatable, respond with: "ELIGIBILITY_CHECK_START: [condition]"
4. If not treatable, explain why and offer alternatives

### BOOKING HANDOFF
After eligibility is confirmed, if the user wants to proceed with booking:
1. Respond with: "BOOKING_START"
2. This will trigger the booking flow in the frontend

### RESPONSE FORMAT
- For eligibility checks: "ELIGIBILITY_CHECK_START: [condition]"
- For booking: "BOOKING_START"
- For regular questions: Normal conversational response

## TOOLS
- File search for condition verification
- Function calling for handoffs`,
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
