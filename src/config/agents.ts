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
    vector_store_ids: process.env.VECTOR_STORE_IDS?.split(',').map(id => id.trim()).filter(id => id) || [],
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