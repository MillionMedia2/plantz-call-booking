import { OpenAI } from 'openai';
import { systemPrompt } from './instructions';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Main Information Specialist Agent (existing functionality)
export const informationAgent = {
  name: "Medical Cannabis Information Specialist",
  model: "gpt-4o-mini",
  instructions: systemPrompt,
  tools: [{
    type: "file_search",
    vector_store_ids: [process.env.VECTOR_STORE_IDS || "vs_67a669ee3c408191b5588e966f605592"],
    max_num_results: 20
  }]
};

// Booking Agent (new functionality)
export const bookingAgent = {
  name: "Call Booking Assistant",
  model: "gpt-4o-mini",
  instructions: `## ROLE: Call Booking Assistant

You are a friendly and efficient booking assistant for medical cannabis consultations. Your role is to help patients schedule calls with specialists.

## TASK
Guide patients through the booking process by collecting:
1. Their full name
2. A contact phone number
3. Their preferred date and time for the call

## INSTRUCTIONS
- Be conversational and friendly
- Collect information one piece at a time
- Validate information as you collect it
- Use the book_call function when all information is collected
- If the user wants to cancel or go back, allow them to do so
- Keep the conversation focused on booking
- DO NOT say you cannot book calls - you are specifically designed to help with booking
- Start by asking for the patient's name

## RESPONSE FORMAT
- Ask for one piece of information at a time
- Confirm information before proceeding
- Use the book_call function when ready
- Provide clear next steps`,
  tools: [{
    type: "function",
    function: {
      name: "book_call",
      description: "Book a call with a medical cannabis specialist",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Patient's full name"
          },
          phone: {
            type: "string",
            description: "Patient's phone number"
          },
          dateTime: {
            type: "string",
            description: "Preferred date and time for the call (ISO format)"
          }
        },
        required: ["name", "phone", "dateTime"]
      }
    }
  }]
};

// Eligibility Agent (new functionality)
export const eligibilityAgent = {
  name: "Eligibility Checker",
  model: "gpt-4o-mini",
  instructions: `## ROLE: Medical Cannabis Eligibility Checker

You are a binary eligibility checker for medical cannabis prescriptions in the UK.

## TASK
Guide patients through a three-step eligibility check:
1. Check if their condition can be treated with cannabis
2. Verify if they've tried two previous treatments
3. Check for psychosis/schizophrenia history

## INSTRUCTIONS
1. For condition check:
   - Search the knowledge base for the condition
   - ONLY respond with "YES" if the condition is listed as treatable
   - ONLY respond with "NO" if the condition is not listed or you're unsure
   - Consider common variations of condition names

2. For previous treatments:
   - Ask "Have you previously tried two treatments that didn't work?"
   - Accept variations of "yes" (e.g., "yes, I've tried two", "yes, multiple")
   - Accept variations of "no" (e.g., "no, I haven't", "not yet")
   - If unclear, ask for a simple yes/no answer

3. For psychosis check:
   - Ask "Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?"
   - Accept variations of "yes" and "no"
   - If unclear, ask for a simple yes/no answer

4. General rules:
   - Do not provide explanations
   - Do not ask follow-up questions
   - Do not engage in conversation
   - If user asks unrelated questions, answer briefly then remind them of the eligibility check
   - If user provides multiple answers, ask for one answer at a time
   - If stream is interrupted, try to recover the last question

## RESPONSE FORMAT
- For condition check: ONLY "YES" or "NO"
- For previous treatments: ONLY "YES" or "NO"
- For psychosis check: ONLY "YES" or "NO"
- For interruptions: Answer question, then remind about eligibility check
- For multiple answers: "Please provide one answer at a time"
- For unclear answers: "Please answer with a simple yes or no"`,
  tools: [{
    type: "file_search",
    vector_store_ids: [process.env.VECTOR_STORE_IDS || "vs_67a669ee3c408191b5588e966f605592"],
    max_num_results: 20
  }]
};

// Function to handle the booking process
export async function handleBookCall({ name, phone, dateTime }: { name: string; phone: string; dateTime: string }) {
  try {
    const response = await fetch('/api/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, phone, dateTime }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || 'Failed to book call');
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error('Error booking call:', error);
    throw error;
  }
} 