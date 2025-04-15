// src/components/ChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiPlusCircle, FiDownload, FiClock, FiRotateCw, FiLoader, FiAlertCircle, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import debounce from 'lodash/debounce';
import styles from './ChatInterface.module.css';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

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

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStage, setThinkingStage] = useState<0 | 1 | 2 | 3>(0);
  const [currentResponseId, setCurrentResponseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<HistoryItem[]>([]);
  const [currentAgent, setCurrentAgent] = useState<'information' | 'booking'>('information');

  const thinkingTimer1 = useRef<number | null>(null);
  const thinkingTimer2 = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstUserMessage = useRef(true);
  const abortController = useRef<AbortController | null>(null);
  const messageCache = useRef<Map<string, Response>>(new Map());

  const TIMEOUT_MS = 30000;
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000;

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
    setMessages([{ role: 'assistant', content: 'Welcome to the Plantz Agent.' }]);
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
    abortController.current = new AbortController();
    const timeoutId = setTimeout(() => abortController.current?.abort(), TIMEOUT_MS);

    try {
      const cacheKey = `${messageContent}-${currentResponseId}`;
      const cachedResponse = messageCache.current.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: messageContent,
          previous_response_id: currentResponseId,
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
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
    let responseIdReceived: string | null = null;
    let assistantMessageIndex = -1;

    try {
        const response = await sendMessageWithRetry(messageContent);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
            console.error("API Error Response:", errorData);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        if (!response.body) throw new Error("Response body is null");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        setMessages(prev => {
            assistantMessageIndex = prev.length;
            return [...prev, { role: 'assistant', content: '' }];
        });

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const jsonString = line.substring(6);
                        const chunk = JSON.parse(jsonString);

                        if (chunk.type === 'response.output_text.delta' && chunk.delta) {
                            assistantResponse += chunk.delta;
                            setMessages(prev => {
                                const updatedMessages = [...prev];
                                if (assistantMessageIndex !== -1 && updatedMessages[assistantMessageIndex]) {
                                    updatedMessages[assistantMessageIndex].content = assistantResponse;
                                }
                                return updatedMessages;
                            });
                        } else if (chunk.type === 'response.completed' && chunk.response?.id) {
                            responseIdReceived = chunk.response.id;
                        }
                    } catch (e) {
                        console.error("Failed to parse SSE chunk:", line, e);
                    }
                }
            }
        }
        setCurrentResponseId(responseIdReceived);

    } catch (error: unknown) {
        console.error("Fetch error:", error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        setError(`Error: ${errorMessage}`);
        setMessages(prev => prev.filter((_, index) => index !== assistantMessageIndex));
    } finally {
        stopThinkingIndicator();
        setIsLoading(false);
    }
  }, [currentResponseId, isLoading]);

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleSendMessage(input);
  };

  const handleExampleQuestionClick = (question: string) => {
      setInput(question);
  };

  const handleNewChat = () => {
      setMessages([{ role: 'assistant', content: 'Welcome to the Plantz Agent.' }]);
      setInput('');
      setCurrentResponseId(null); // Reset conversation continuity ID
      setIsLoading(false);
      setThinkingStage(0);
      setError(null);
      clearThinkingTimers();
      setShowHistory(false); // Close history panel
      isFirstUserMessage.current = true; // Reset flag for the new chat
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

  const handleBookCall = () => {
    setCurrentAgent('booking');
    handleSendMessage("I'd like to book a call with a specialist");
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

  // --- Render Function ---
  return (
    <div className={styles.chatContainer}>
      {/* Header */}
      <div className={styles.header}>
        <h2>Plantz Agent</h2>
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

      {/* Input */}
      <div className={styles.inputContainer}>
        <form onSubmit={handleFormSubmit} className={styles.inputForm}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write a message..."
            className={styles.input}
            disabled={isLoading}
            aria-label="Chat message input"
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
          >
            <FiSend size={18} />
          </button>
        </form>
        <div className="text-center text-xs text-gray-400 mt-2">
          Powered by <a href="https://plantz.io" target="_blank" rel="noopener noreferrer" className="hover:underline">Plantz</a>
        </div>
      </div>
    </div>
  );
}