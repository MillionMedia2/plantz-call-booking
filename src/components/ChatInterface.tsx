// src/components/ChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiPlusCircle, FiDownload, FiClock, FiRotateCw, FiLoader, FiAlertCircle, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import debounce from 'lodash/debounce';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import BookingFlow from './BookingFlow';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import type { EmbedConfig } from '@/types/embed';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Define structure for history items
interface HistoryItem {
    id: number;
    firstMessage: string;
}

const LOCAL_STORAGE_KEY = 'plantzAgentChatHistory';

type AgentType = 'information' | 'booking';

interface BookingState {
  status: 'not_started' | 'in_progress' | 'complete';
  condition?: string;
}

export default function ChatInterface({ embedConfig }: { embedConfig?: EmbedConfig } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStage, setThinkingStage] = useState<0 | 1 | 2 | 3>(0);
  const [currentResponseId, setCurrentResponseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<HistoryItem[]>([]);
  const [currentAgent, setCurrentAgent] = useState<AgentType>('information');
  const [isBooking, setIsBooking] = useState(false);
  const [bookingState, setBookingState] = useState<BookingState>({ 
    status: 'not_started'
  });
  const [threadId, setThreadId] = useState<string | null>(null);

  const thinkingTimer1 = useRef<number | null>(null);
  const thinkingTimer2 = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstUserMessage = useRef(true);
  const abortController = useRef<AbortController | null>(null);
  const messageCache = useRef<Map<string, Response>>(new Map());

  const TIMEOUT_MS = 60000;
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000;

  // Add state for booking information
  const [bookingInfo, setBookingInfo] = useState<{
    name?: string;
    phone?: string;
    dateTime?: string;
    step: 'name' | 'phone' | 'dateTime' | 'complete';
  }>({ step: 'name' });

  // Add bookingError state
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Embed-specific refs
  const sentSeed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cleanup function for SSE and timeouts
  useEffect(() => {
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, []);

  // --- History Functions ---

  // Load the history from localStorage on mount
  useEffect(() => {
    try {
        const storedHistory = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (storedHistory) {
            setChatHistory(JSON.parse(storedHistory));
        }
    } catch (e) {
        console.error("Failed to load chat history from localStorage:", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear corrupted data
    }
    setMessages([{ role: 'assistant', content: 'Ask our Plantz Agent about medical cannabis' }]);
    isFirstUserMessage.current = true; // Reset flag on component mount
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (e) {
        console.error("Failed to save chat history to localStorage:", e);
    }
  }, [chatHistory]);

  // --- Embed Integration ---

  // Helper to emit events for embed analytics
  const emitEvent = useCallback((name: string, detail?: any) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent("plantz-emit", { 
          detail: { name, detail, threadId, sourceTag: embedConfig?.sourceTag } 
        })
      );
    }
  }, [threadId, embedConfig?.sourceTag]);

  // Helper functions for embed commands
  const resetConversation = useCallback(() => {
    setMessages([{ role: 'assistant', content: 'Ask our Plantz Agent about medical cannabis' }]);
    setThreadId(null);
    isFirstUserMessage.current = true;
    setIsBooking(false);
    setBookingState({ status: 'not_started' });
    setError(null);
    emitEvent('conversation_reset');
  }, [emitEvent]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  // 1) One-time auto-send of initialQuestion
  useEffect(() => {
    const q = embedConfig?.initialQuestion?.trim();
    if (!sentSeed.current && q && messages.length === 1 && !isLoading) {
      sentSeed.current = true;
      // Small delay to ensure UI is ready
      setTimeout(() => {
        handleSendMessage(q);
        emitEvent('conversation_start', { initialQuestion: q });
      }, 100);
    }
  }, [embedConfig?.initialQuestion, messages.length, isLoading]);

  // 2) Listen for seeds/commands from wrapper (postMessage bridge)
  useEffect(() => {
    function onSeed(e: Event) {
      const question = (e as CustomEvent).detail as string;
      if (typeof question === "string" && question.trim()) {
        handleSendMessage(question);
        emitEvent('conversation_start', { seededQuestion: question });
      }
    }
    function onCmd(e: Event) {
      const { name } = (e as CustomEvent).detail || {};
      if (name === "reset") resetConversation();
      if (name === "focus") focusInput();
    }
    window.addEventListener("plantz-seed", onSeed as EventListener);
    window.addEventListener("plantz-command", onCmd as EventListener);
    return () => {
      window.removeEventListener("plantz-seed", onSeed as EventListener);
      window.removeEventListener("plantz-command", onCmd as EventListener);
    };
  }, [emitEvent, resetConversation, focusInput]);

  const addHistoryEntry = (firstMessage: string) => {
    const newEntry: HistoryItem = {
      id: Date.now(), // Simple unique ID using timestamp
      firstMessage: firstMessage.substring(0, 100), // Store first 100 chars as preview
    };
    // Add to the beginning of the array and limit history size (e.g., 20 items)
    setChatHistory(prev => [newEntry, ...prev.slice(0, 19)]);
  };

  const clearHistory = () => {
      setChatHistory([]);
      // localStorage is updated by the useEffect hook watching chatHistory
      setShowHistory(false); // Optionally close panel after clearing
  };

  // --- Core Chat Functions ---

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);


  const clearThinkingTimers = () => {
    if (thinkingTimer1.current) window.clearTimeout(thinkingTimer1.current);
    if (thinkingTimer2.current) window.clearTimeout(thinkingTimer2.current);
    thinkingTimer1.current = null;
    thinkingTimer2.current = null;
  };

  const startThinkingIndicator = () => {
    setIsLoading(true);
    setThinkingStage(1);
    setError(null);
    clearThinkingTimers();
    thinkingTimer1.current = window.setTimeout(() => setThinkingStage(2), 10000);
    thinkingTimer2.current = window.setTimeout(() => setThinkingStage(3), 20000);
  };

  const stopThinkingIndicator = () => {
      setIsLoading(false);
      setThinkingStage(0);
      clearThinkingTimers();
  };

  const sendMessageWithRetry = async (messageContent: string, retryCount = 0): Promise<Response> => {
    console.log("sendMessageWithRetry - threadId:", threadId);
    abortController.current = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("Request timeout triggered - aborting request");
      abortController.current?.abort();
    }, TIMEOUT_MS);

    try {
      const cacheKey = `${messageContent}-${threadId}`;
      const cachedResponse = messageCache.current.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      console.log("Sending API request with threadId:", threadId);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: messageContent,
          threadId: threadId,
          previous_response_id: currentResponseId
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendMessageWithRetry(messageContent, retryCount + 1);
      }

      messageCache.current.set(cacheKey, response.clone());
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Debounced input handler
  const debouncedSetInput = useCallback(
    debounce((value: string) => setInput(value), 150),
    []
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleAgentSwitch = (agent: AgentType) => {
    setCurrentAgent(agent);
  };



  const handleBookCall = () => {
    // Directly start the booking flow without calling the assistant
    setBookingState({
      status: 'in_progress',
      condition: ''
    });
    setIsBooking(true);
    
    // Emit booking_started event
    emitEvent('booking_started', { threadId });
  };

  const handleSendMessage = useCallback(async (messageContent: string) => {
    if (!messageContent.trim() || isLoading) return;

    setError(null);
    setIsLoading(true);
    startThinkingIndicator();

    const newUserMessage = { role: 'user' as const, content: messageContent };
    
    if (isFirstUserMessage.current) {
        addHistoryEntry(messageContent);
        isFirstUserMessage.current = false;
    }

    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInput('');

    let assistantResponse = '';
    let assistantMessageIndex = -1;
    let newThreadId = threadId;
    let firstReplyEmitted = false; // Track if we've emitted assistant_reply event

    try {
        const response = await sendMessageWithRetry(messageContent, 0);
        console.log("Initial response received:", response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
            console.error("API Error Response:", errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        if (!response.body) throw new Error("Response body is null");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        console.log("Stream setup complete, starting to read chunks");

        setMessages(prev => {
            assistantMessageIndex = prev.length;
            return [...prev, { role: 'assistant', content: '' }];
        });

        // Add a timeout to detect stalled streams
        const streamTimeout = setTimeout(() => {
            console.error("Stream timeout - no data received for 30 seconds");
            reader.cancel("Stream timeout");
        }, 30000);

        while (true) {
            try {
                console.log("Reading stream chunk...");
                const { done, value } = await reader.read();
                if (done) {
                    console.log("Stream complete");
                    clearTimeout(streamTimeout);
                    break;
                }
                buffer += decoder.decode(value, { stream: true });
                console.log("Received buffer:", buffer);
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonString = line.substring(6);
                            const chunk = JSON.parse(jsonString);
                            console.log("Processing chunk:", chunk);

                            if (chunk.type === 'error') {
                                console.error("Stream error received:", chunk.error);
                                clearTimeout(streamTimeout);
                                throw new Error(`Stream error: ${chunk.error}`);
                            }

                            if (chunk.type === 'response.output_text.delta' && chunk.delta) {
                                assistantResponse += chunk.delta;
                                console.log("Updated assistant response:", assistantResponse);
                                
                                // Emit assistant_reply event on first token
                                if (!firstReplyEmitted && assistantResponse.trim()) {
                                    firstReplyEmitted = true;
                                    emitEvent('assistant_reply', { threadId: newThreadId });
                                }
                                
                                setMessages(prev => {
                                    const updatedMessages = [...prev];
                                    if (assistantMessageIndex !== -1 && updatedMessages[assistantMessageIndex]) {
                                        updatedMessages[assistantMessageIndex].content = assistantResponse;
                                    }
                                    return updatedMessages;
                                });
                            } else if (chunk.type === 'response.completed') {
                                console.log("Response completed");
                                if (chunk.threadId && !threadId) {
                                    newThreadId = chunk.threadId;
                                    setThreadId(chunk.threadId);
                                }
                            } else if (chunk.type === 'status') {
                                console.log("Status update:", chunk.status);
                            }
                        } catch (e) {
                            console.error("Failed to parse SSE chunk:", line, e);
                            if (e instanceof Error && e.message.includes('Stream error')) {
                                clearTimeout(streamTimeout);
                                throw e;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Error in stream reading loop:", e);
                if (e instanceof Error && e.message.includes('Stream error')) {
                    clearTimeout(streamTimeout);
                    throw e;
                }
            }
        }
        console.log("Stream processing finished");

                // Check for handoff triggers in the response
        // Remove the old booking start logic since we handle it directly now

    } catch (error: unknown) {
        console.error("Stream error details:", error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        const errorCode = error instanceof Error && 'code' in error ? (error as any).code : undefined;
        setError(`Error: ${errorMessage}`);
        setMessages(prev => prev.filter((_, index) => index !== assistantMessageIndex));
        
        // Emit error event
        emitEvent('error', { 
          message: errorMessage, 
          code: errorCode, 
          threadId: newThreadId 
        });
    } finally {
        console.log("Stream handling complete");
        stopThinkingIndicator();
        setIsLoading(false);
    }
  }, [isLoading, threadId, emitEvent]);

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage(input);
  };

  const handleExampleQuestionClick = (question: string) => {
      setInput(question);
  };

  const handleNewChat = () => {
    setMessages([{ role: 'assistant', content: 'Ask our Plantz Agent about medical cannabis' }]);
    setInput('');
    setThreadId(null); // Reset thread ID
    setIsLoading(false);
    setThinkingStage(0);
    setError(null);
    clearThinkingTimers();
    setShowHistory(false); // Close history panel
    isFirstUserMessage.current = true; // Reset flag for the new chat
    setBookingState({ 
      status: 'not_started'
    }); // Reset booking state
    setCurrentAgent('information'); // Always reset to information agent
    setBookingInfo({ step: 'name' }); // Reset booking info
    setBookingError(null); // Clear booking error
    setIsBooking(false); // Reset booking mode
    console.log("New chat started");
  };

  // When clicking a history item, just start a new chat
  const handleHistoryItemClick = (/* item: HistoryItem */) => {
      // For Option A (Simple), clicking history starts a fresh chat.
      // No need to load old messages or set previous_response_id from history.
      handleNewChat();
      // Optionally, could pre-fill the input with item.firstMessage, but handleNewChat clears it.
      // setInput(item.firstMessage);
  };

  const handleDownloadChat = () => {
      const chatText = messages.map(msg => `${msg.role === 'user' ? 'You' : 'Agent'}: ${msg.content}`).join('\n\n');
      const blob = new Blob([chatText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantz-agent-chat-${new Date().toISOString()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("Chat downloaded");
  };

  const handleToggleHistory = () => {
      setShowHistory(prev => !prev);
  };

  const renderThinkingIndicator = () => {
    // ... (Indicator logic remains the same)
    if (!isLoading) return null;
    let icon = <FiLoader className="animate-spin mr-2" />;
    let text = "Thinking...";
    if (thinkingStage === 2) { icon = <FiClock className="animate-spin mr-2" />; text = "Still thinking..."; }
    if (thinkingStage === 3) { icon = <FiClock className="animate-pulse mr-2" />; text = "Nearly there..."; }
    return (<div className="flex items-center justify-center text-sm text-gray-500 my-2">{icon}<span>{text}</span></div>);
  };

  const handleConditionCheck = useCallback(async (condition: string): Promise<boolean> => {
    try {
      // Send the condition to the assistant for verification
      const response = await sendMessageWithRetry(`Check if this condition is treatable with medical cannabis: ${condition}`, 0);
      
      if (!response.ok) {
        throw new Error('Failed to verify condition');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonString = line.substring(6);
              const data = JSON.parse(jsonString);
              
              if (data.type === 'response.output_text.delta') {
                assistantResponse += data.delta;
              } else if (data.type === 'response.completed') {
                break;
              }
            } catch (e) {
              // Ignore parsing errors for incomplete chunks
            }
          }
        }
      }

      // Check if the response indicates the condition is treatable
      const treatableKeywords = ['treatable', 'eligible', 'can be treated', 'suitable', 'appropriate'];
      const notTreatableKeywords = ['not treatable', 'not eligible', 'cannot be treated', 'not suitable', 'not appropriate'];
      
      const responseLower = assistantResponse.toLowerCase();
      
      // Check for negative indicators first
      for (const keyword of notTreatableKeywords) {
        if (responseLower.includes(keyword)) {
          return false;
        }
      }
      
      // Check for positive indicators
      for (const keyword of treatableKeywords) {
        if (responseLower.includes(keyword)) {
          return true;
        }
      }
      
      // Default to treatable if no clear indicators
      return true;
    } catch (error) {
      console.error('Error checking condition:', error);
      // Default to treatable if verification fails
      return true;
    }
  }, [sendMessageWithRetry]);

  const handleBookingComplete = useCallback((bookingData: any) => {
    // Add success message
    const successMessage = { 
      role: 'assistant' as const, 
      content: `Great! I've booked your call for ${bookingData.date} at ${bookingData.time}. We'll call you at ${bookingData.phone}. Thank you for choosing our service!` 
    };
    setMessages(prev => [...prev, successMessage]);
    
    // Reset booking state
    setBookingState({ status: 'not_started' });
    setIsBooking(false);
    setCurrentAgent('information');
    
    // Emit booking_completed event
    emitEvent('booking_completed', { 
      threadId, 
      bookingData: {
        date: bookingData.date,
        time: bookingData.time,
        phone: bookingData.phone
      }
    });
  }, [threadId, emitEvent]);

  const handleBookingCancel = useCallback(() => {
    // Add cancellation message
    const cancelMessage = { 
      role: 'assistant' as const, 
      content: 'Booking cancelled. You can continue asking questions about medical cannabis.' 
    };
    setMessages(prev => [...prev, cancelMessage]);
    
    // Reset booking state
    setBookingState({ status: 'not_started' });
    setIsBooking(false);
    setCurrentAgent('information');
  }, []);

  // Remove the checkEligibility function
  const checkEligibility = async (condition: string) => {
    handleSendMessage(condition);
  };

  // --- Render Function ---
  return (
    <Card className="flex flex-col h-full bg-white overflow-hidden rounded-xl border-0 shadow-sm p-0 gap-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-[#8a9a5a]">
        <div className="flex items-center gap-[5px]">
          <img src="/herbie-icon.png" alt="Herbie" className="h-10 w-auto" />
          <h2 className="text-white text-lg font-medium">Plantz Agent</h2>
        </div>
        <div className="flex gap-0">
          <Button onClick={handleNewChat} title="New Chat" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 h-auto w-auto p-0.5 [&_svg]:!w-auto [&_svg]:!h-auto">
            <FiPlusCircle size={24} />
          </Button>
          <Button onClick={handleDownloadChat} title="Download Chat" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10 h-auto w-auto p-0.5 [&_svg]:!w-auto [&_svg]:!h-auto">
            <FiDownload size={24} />
          </Button>
          <Button onClick={handleToggleHistory} title="Chat History" variant="ghost" className={`text-white/80 hover:text-white hover:bg-white/10 h-auto w-auto p-0.5 [&_svg]:!w-auto [&_svg]:!h-auto ${showHistory ? 'bg-[#6f7d48]' : ''}`}>
            <FiMessageSquare size={24} />
          </Button>
          <Button 
            onClick={handleBookCall} 
            title="Book a Call" 
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10 h-auto w-auto p-0.5 [&_svg]:!w-auto [&_svg]:!h-auto"
          >
            <FiClock size={24} />
          </Button>
        </div>
      </div>

      {/* Chat History Panel */}
      {showHistory && (
        <>
          <Separator />
          <ScrollArea className="p-3 bg-[#f5f9f5] max-h-40">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Chat History</h3>
              <Button onClick={clearHistory} variant="ghost" size="sm" className="text-xs text-red-500 hover:text-red-600 h-auto p-1">
                <FiTrash2 size={14} className="mr-1"/> Clear All
              </Button>
            </div>
            {chatHistory.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No history yet.</p>
            ) : (
              <ul className="space-y-1">
                {chatHistory.map((item) => (
                  <li key={item.id}>
                    <Button
                      onClick={() => handleHistoryItemClick(/* item */)}
                      variant="ghost"
                      className="w-full justify-start text-left text-sm text-blue-600 hover:bg-gray-100 h-auto p-2"
                      title={`Start new chat (began with: ${item.firstMessage})`}
                    >
                      {item.firstMessage}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </>
      )}

      {/* Example Questions */}
      {/* {messages.length <= 1 && (
        <div className={styles.faqSection}>
          <p className="text-sm text-gray-600 mb-3">Frequently Asked Questions:</p>
          <div className="space-y-2">
            <button onClick={() => handleExampleQuestionClick("How do I get a prescription?")} className={styles.faqButton}>
            How do I get a prescription?
            </button>
            <button onClick={() => handleExampleQuestionClick("How much does medical cannabis cost?")} className={styles.faqButton}>
            How much does medical cannabis cost?
            </button>
            <button onClick={() => handleExampleQuestionClick("How do I know if I&apos;m eligible?")} className={styles.faqButton}>
            How do I know if I&apos;m eligible?
            </button>
            <button onClick={() => handleExampleQuestionClick("Is medical cannabis legal?")} className={styles.faqButton}>
            Is medical cannabis legal?
            </button>
          </div>
        </div>
      )} */}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse bg-[#f5f9f5] min-h-0 p-4">
        <div className="flex flex-col">
          <div>
            {messages.map((message, index) => (
              <div key={index} className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-4 py-2 max-w-[85%] rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-[#8a9a5a] text-white ml-auto rounded-br-sm' 
                    : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                }`}>
                  <ReactMarkdown
                    components={{
                      p: ({children}) => <p className="whitespace-pre-wrap break-words mb-2 last:mb-0">{children}</p>,
                      h1: ({children}) => <h1 className="text-xl font-bold mb-2">{children}</h1>,
                      h2: ({children}) => <h2 className="text-lg font-bold mb-2">{children}</h2>,
                      h3: ({children}) => <h3 className="text-base font-bold mb-2">{children}</h3>,
                      ul: ({children}) => <ul className="list-disc pl-5 mb-2">{children}</ul>,
                      ol: ({children}) => <ol className="list-decimal pl-5 mb-2">{children}</ol>,
                      li: ({children}) => <li className="mb-1">{children}</li>
                    } as Components}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            {renderThinkingIndicator()}
            {error && (
              <div className="text-sm text-red-600 p-2 bg-red-50 rounded">
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Booking Flow */}
                            {isBooking && (
                        <BookingFlow
                          onComplete={handleBookingComplete}
                          onCancel={handleBookingCancel}
                          onConditionCheck={handleConditionCheck}
                          condition={bookingState.condition}
                        />
                      )}

      {/* Input (hide if booking) */}
      {!isBooking && (
        <>
          <Separator />
          <div className="flex flex-col w-full bg-white">
            <div className="flex items-center gap-2 p-4">
              <Input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendMessage(input)}
                placeholder="Type your message..."
                disabled={isBooking}
                className="flex-1 border-gray-300 focus:border-[#8a9a5a] focus:ring-[#8a9a5a]/10"
              />
              <Button
                onClick={() => handleSendMessage(input)}
                disabled={isLoading}
                className="bg-[#8a9a5a] hover:bg-[#6f7d48] text-white"
                size="icon"
              >
                {isLoading ? (
                  <FiLoader className="animate-spin" size={18} />
                ) : (
                  <FiSend size={18} />
                )}
              </Button>
            </div>
            {bookingError && (
              <div className="text-sm text-red-600 px-4 pb-2">{bookingError}</div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}