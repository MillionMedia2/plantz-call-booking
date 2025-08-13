import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { 
  getOrCreateAssistant, 
  createThread, 
  addMessageToThread, 
  runAssistant, 
  getRunStatus,
  getThreadMessages 
} from '@/config/assistants';

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
  threadId?: string;
  runId?: string;
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
    
    const { input, threadId, previous_response_id } = body;

    if (!input) {
      console.error("Missing input parameter in request body");
      return new Response(JSON.stringify({ 
        error: 'Input is required',
        receivedBody: body,
        expectedFormat: { 
          input: "string", 
          threadId: "string (optional)",
          previous_response_id: "string (optional)"
        }
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    // Get or create assistant
    const assistant = await getOrCreateAssistant();
    
    // Create thread if not provided
    let currentThreadId = threadId;
    if (!currentThreadId) {
      const thread = await createThread();
      currentThreadId = thread.id;
    }

    // Add message to thread
    await addMessageToThread(currentThreadId, input);

    // Run assistant
    const run = await runAssistant(currentThreadId, assistant.id);

    // Create a ReadableStream to handle the streaming response
    const responseStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Poll for run completion
          let runStatus = await getRunStatus(currentThreadId, run.id);
          
          while (runStatus.status === 'queued' || runStatus.status === 'in_progress') {
            // Send status updates
            const statusChunk = `data: ${JSON.stringify({ 
              type: "status", 
              status: runStatus.status,
              threadId: currentThreadId,
              runId: run.id
            })}\n\n`;
            controller.enqueue(encoder.encode(statusChunk));
            
            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await getRunStatus(currentThreadId, run.id);
          }

          // Check if run completed successfully
          if (runStatus.status === 'completed') {
            // Get the latest message from the thread
            const messages = await getThreadMessages(currentThreadId);
            const latestMessage = messages.data[0]; // Messages are ordered newest first
            
            if (latestMessage && latestMessage.content.length > 0) {
              const content = latestMessage.content[0];
              if (content.type === 'text') {
                const responseText = content.text.value;
                
                // Send the response in chunks for streaming effect
                const words = responseText.split(' ');
                for (let i = 0; i < words.length; i++) {
                  const chunk = `data: ${JSON.stringify({ 
                    type: "response.output_text.delta", 
                    delta: words[i] + (i < words.length - 1 ? ' ' : ''),
                    threadId: currentThreadId,
                    runId: run.id
                  })}\n\n`;
                  controller.enqueue(encoder.encode(chunk));
                  
                  // Small delay for streaming effect
                  await new Promise(resolve => setTimeout(resolve, 50));
                }
              }
            }
            
            // Send completion signal
            const completionChunk = `data: ${JSON.stringify({ 
              type: "response.completed",
              threadId: currentThreadId,
              runId: run.id
            })}\n\n`;
            controller.enqueue(encoder.encode(completionChunk));
          } else {
            // Handle failed run
            const errorChunk = `data: ${JSON.stringify({ 
              type: "error", 
              error: `Run failed with status: ${runStatus.status}`,
              threadId: currentThreadId,
              runId: run.id
            })}\n\n`;
            controller.enqueue(encoder.encode(errorChunk));
          }
        } catch (error) {
          console.error("Stream error:", error);
          const errorMessage = error instanceof Error ? error.message : "Stream interrupted";
          const errorChunk = `data: ${JSON.stringify({ 
            type: "error", 
            error: errorMessage,
            threadId: currentThreadId,
            runId: run.id
          })}\n\n`;
          controller.enqueue(encoder.encode(errorChunk));
        } finally {
          controller.close();
        }
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