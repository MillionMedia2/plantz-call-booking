import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { systemPrompt } from '@/config/instructions';

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

// Define vector store IDs - parsing from environment variable
const vectorStoreIds = process.env.VECTOR_STORE_IDS
  ? process.env.VECTOR_STORE_IDS.split(',').map(id => id.trim()).filter(id => id)
  : [];

// Configure edge runtime for Vercel deployment and streaming
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Received request body:", body);
    console.log("Request body type:", typeof body);
    console.log("Input value:", body.input);
    console.log("Input type:", typeof body.input);
    
    const { input, previous_response_id } = body;

    if (!input) {
      console.error("Missing input parameter in request body");
      return new Response(JSON.stringify({ 
        error: 'Input is required',
        receivedBody: body,
        expectedFormat: { input: "string", previous_response_id: "string (optional)" }
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Construct tools only if vector store IDs are available
    const tools = vectorStoreIds.length > 0
      ? [{
          type: "file_search",
          vector_store_ids: vectorStoreIds,
          max_num_results: 20
        }]
      : undefined; // Pass undefined if no IDs

    // Log the exact parameters being sent to OpenAI
    const params = {
      model: "gpt-4o-mini",
      instructions: systemPrompt,
      input: input,
      previous_response_id: previous_response_id,
      tools: tools,
      store: true,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
    };
    console.log("OpenAI API parameters:", JSON.stringify(params, null, 2));

    const response = await (openai.responses.create as any)({
      model: "gpt-4o-mini",
      instructions: systemPrompt,
      input: input,
      previous_response_id: previous_response_id,
      tools: tools,
      store: true,
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
    });

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
        // You might add logic here if needed when the client disconnects
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