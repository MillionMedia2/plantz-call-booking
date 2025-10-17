// src/components/ChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiPlusCircle, FiDownload, FiClock, FiRotateCw, FiLoader, FiAlertCircle, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import debounce from 'lodash/debounce';
import styles from './ChatInterface.module.css';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import BookingFlow from './BookingFlow';

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

export default function ChatInterface() {
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
        setError(`Error: ${errorMessage}`);
        setMessages(prev => prev.filter((_, index) => index !== assistantMessageIndex));
    } finally {
        console.log("Stream handling complete");
        stopThinkingIndicator();
        setIsLoading(false);
    }
  }, [isLoading, threadId]);

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
  }, []);

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
    <div className={styles.chatContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div className="flex items-center gap-[5px]">
          <img src="/herbie-icon.png" alt="Herbie" className="h-10 w-auto" />
          <h2>Plantz Agent</h2>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleNewChat} title="New Chat" className="text-white/80 hover:text-white p-1.5 rounded">
            <FiPlusCircle size={20} />
          </button>
          <button onClick={handleDownloadChat} title="Download Chat" className="text-white/80 hover:text-white p-1.5 rounded">
            <FiDownload size={20} />
          </button>
          <button onClick={handleToggleHistory} title="Chat History" className={`text-white/80 hover:text-white p-1.5 rounded ${showHistory ? 'bg-hubbot-hover' : ''}`}>
            <FiMessageSquare size={20} />
          </button>
          <button 
            onClick={handleBookCall} 
            title="Book a Call" 
            className="text-white/80 hover:text-white p-1.5 rounded"
          >
            <FiClock size={20} />
          </button>
        </div>
      </div>

      {/* Chat History Panel */}
      {showHistory && (
        <div className="p-3 bg-hubbot-light border-b border-gray-200 max-h-40 overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium text-gray-700">Chat History</h3>
            <button onClick={clearHistory} className="text-xs text-red-500 hover:text-red-600 p-1 rounded flex items-center">
              <FiTrash2 size={14} className="mr-1"/> Clear All
            </button>
          </div>
          {chatHistory.length === 0 ? (
            <p className="text-sm text-gray-500 italic">No history yet.</p>
          ) : (
            <ul className="space-y-1">
              {chatHistory.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleHistoryItemClick(/* item */)}
                    className="w-full text-left text-sm text-blue-600 hover:bg-gray-100 p-2 rounded"
                    title={`Start new chat (began with: ${item.firstMessage})`}
                  >
                    {item.firstMessage}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
      <div className={styles.messageContainer}>
        <div>
          {messages.map((message, index) => (
            <div key={index} className={`${styles.message} ${message.role === 'user' ? styles.userMessage : styles.assistantMessage}`}>
              <div className={`${styles.messageBubble} ${message.role === 'user' ? styles.userBubble : styles.assistantBubble}`}>
                <ReactMarkdown
                  components={{
                    p: ({children}) => <p className="whitespace-pre-wrap break-words">{children}</p>,
                    h1: ({children}) => <h1>{children}</h1>,
                    h2: ({children}) => <h2>{children}</h2>,
                    h3: ({children}) => <h3>{children}</h3>,
                    ul: ({children}) => <ul>{children}</ul>,
                    ol: ({children}) => <ol>{children}</ol>,
                    li: ({children}) => <li>{children}</li>
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
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-2 p-4 border-t border-gray-200">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(input)}
              placeholder="Type your message..."
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isBooking}
            />
            <button
              onClick={() => handleSendMessage(input)}
              disabled={isLoading}
              className="p-2 text-white bg-hubbot-hover rounded-lg hover:bg-hubbot-blue focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <FiLoader className="animate-spin" />
                  <span>Thinking...</span>
                </div>
              ) : (
                <FiSend />
              )}
            </button>
          </div>
          {bookingError && (
            <div className="text-sm text-red-600 px-4 pb-2">{bookingError}</div>
          )}
        </div>
      )}
    </div>
  );
}