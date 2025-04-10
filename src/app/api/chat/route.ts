import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { informationAgent, bookingAgent, handleBookCall } from '@/config/agents';

interface APIError extends Error {
  status?: number;
  code?: string;
}

interface APIResponse {
  error?: string;
  details?: string;
}

interface StreamChunk {
  type: string;
  delta?: string;
  response?: {
    id: string;
  };
}

// Ensure the API key is available
if (!process.env.OPENAI_API_KEY) {
  throw new Error("Missing environment variable OPENAI_API_KEY");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure edge runtime for Vercel deployment and streaming
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Received request body:", body);
    
    const { input, previous_response_id, agent_type = 'information' } = body;

    if (!input) {
      console.error("Missing input parameter in request body");
      return new Response(JSON.stringify({ 
        error: 'Input is required',
        receivedBody: body,
        expectedFormat: { 
          input: "string", 
          previous_response_id: "string (optional)",
          agent_type: "string (optional, 'information' or 'booking')"
        }
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Select the appropriate agent configuration
    const agentConfig = agent_type === 'booking' ? bookingAgent : informationAgent;

    // Log the exact parameters being sent to OpenAI
    const params = {
      model: agentConfig.model,
      instructions: agentConfig.instructions,
      input: input,
      previous_response_id: previous_response_id,
      tools: agentConfig.tools,
      store: true,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
    };
    console.log("OpenAI API parameters:", JSON.stringify(params, null, 2));

    const response = await (openai.responses.create as any)(params);

    // Create a ReadableStream to pipe the OpenAI stream chunks
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        // Use a more precise type assertion for the stream
        const stream = (response as unknown) as AsyncIterable<any>;
        for await (const chunk of stream) {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(data));
        }
        controller.close();
      },
      cancel() {
        console.log("Stream cancelled by client.");
      }
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error: any) {
    console.error("API Error:", error);
    const errorMessage = error.message || 'An unexpected error occurred';
    const statusCode = error.status || 500;
    return new Response(JSON.stringify({ 
      error: 'Failed to process chat message', 
      details: errorMessage 
    }), { 
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
} 