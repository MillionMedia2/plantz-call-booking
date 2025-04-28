// src/components/ChatInterface.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiSend, FiPlusCircle, FiDownload, FiClock, FiRotateCw, FiLoader, FiAlertCircle, FiMessageSquare, FiTrash2 } from 'react-icons/fi';
import debounce from 'lodash/debounce';
import styles from './ChatInterface.module.css';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import EligibilityForm from './EligibilityForm';

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

type AgentType = 'information' | 'eligibility' | 'booking';

interface EligibilityState {
  status: 'not_started' | 'in_progress' | 'passed' | 'failed';
  currentQuestion: 'condition' | 'previous_treatments' | 'psychosis_check' | 'complete';
  condition?: string;
  previousTreatments?: boolean;
  psychosisHistory?: boolean;
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
  const [eligibilityState, setEligibilityState] = useState<EligibilityState>({ 
    status: 'not_started',
    currentQuestion: 'condition'
  });

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

  // Add a ref to track the current booking step
  const currentBookingStepRef = useRef<'name' | 'phone' | 'dateTime' | 'complete'>('name');
  
  // Add refs to track booking information
  const bookingNameRef = useRef<string | null>(null);
  const bookingPhoneRef = useRef<string | null>(null);
  const bookingDateTimeRef = useRef<string | null>(null);

  // Add state to store eligibility summary
  const [eligibilitySummary, setEligibilitySummary] = useState<null | {
    condition: string;
    treatable: boolean;
    previousTreatments: boolean;
    psychosisHistory: boolean;
  }>(null);

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

  const sendMessageWithRetry = async (messageContent: string, retryCount = 0, agentType?: AgentType): Promise<Response> => {
    console.log("sendMessageWithRetry - currentAgent:", agentType || currentAgent);
    abortController.current = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("Request timeout triggered - aborting request");
      abortController.current?.abort();
    }, TIMEOUT_MS);

    try {
      const cacheKey = `${messageContent}-${currentResponseId}-${agentType || currentAgent}`;
      const cachedResponse = messageCache.current.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      console.log("Sending API request with agent_type:", agentType || currentAgent);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: messageContent,
          previous_response_id: currentResponseId,
          agent_type: agentType || currentAgent
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
        console.log(`Request failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendMessageWithRetry(messageContent, retryCount + 1, agentType);
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
    if (agent === 'eligibility') {
      setEligibilityState({ 
        status: 'in_progress',
        currentQuestion: 'condition'
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Before we can book your call, I need to check your eligibility. What condition do you want to treat with cannabis?'
      }]);
    }
    setCurrentAgent(agent);
  };

  const handleEligibilityResponse = useCallback((response: string, messageContent: string) => {
    const normalizedResponse = response.trim().toLowerCase();
    const isYes = /^(yes|y|yeah|yep|sure|ok|okay)$/i.test(normalizedResponse);
    const isNo = /^(no|n|nope|nah)$/i.test(normalizedResponse);

    setMessages(prev => {
      const updatedMessages = [...prev];
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      const currentQuestionText = eligibilityState.currentQuestion === 'previous_treatments'
        ? "Have you previously tried two treatments that didn't work?"
        : eligibilityState.currentQuestion === 'psychosis_check'
          ? "Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?"
          : '';

      // Fallback: If the agent's response contains the current question and the user input was yes/no, treat as valid
      if (
        eligibilityState.currentQuestion === 'previous_treatments' &&
        response.trim().toLowerCase().includes(currentQuestionText.toLowerCase())
      ) {
        if (/^(yes|y|yeah|yep|sure|ok|okay)$/i.test(messageContent.trim())) {
          if (lastMessage) lastMessage.content = "Thank you. Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?";
          setEligibilityState(prev => ({
            ...prev,
            previousTreatments: true,
            currentQuestion: 'psychosis_check'
          }));
          return updatedMessages;
        } else if (/^(no|n|nope|nah)$/i.test(messageContent.trim())) {
          if (lastMessage) lastMessage.content = "Thank you. Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?";
          setEligibilityState(prev => ({
            ...prev,
            previousTreatments: false,
            currentQuestion: 'psychosis_check'
          }));
          return updatedMessages;
        }
      }
      // Final fallback: If on psychosis_check and user input is yes/no, always proceed to booking
      if (
        eligibilityState.currentQuestion === 'psychosis_check' &&
        (/^(yes|y|yeah|yep|sure|ok|okay)$/i.test(messageContent.trim()) || /^(no|n|nope|nah)$/i.test(messageContent.trim()))
      ) {
        lastMessage.content = /^(yes|y|yeah|yep|sure|ok|okay)$/i.test(messageContent.trim())
          ? "Thank you for letting us know. Let's proceed with booking your call. What is your full name?"
          : "Great! Let's proceed with booking your call. What is your full name?";
        setEligibilityState(prev => ({
          ...prev,
          psychosisHistory: /^(yes|y|yeah|yep|sure|ok|okay)$/i.test(messageContent.trim()),
          currentQuestion: 'complete',
          status: 'passed'
        }));
        setCurrentAgent('booking');
        return updatedMessages;
      }

      if (lastMessage) {
        switch (eligibilityState.currentQuestion) {
          case 'condition':
            if (isYes) {
              // Only remove the last message if it's an assistant message with a raw YES/NO
              if (
                updatedMessages.length > 0 &&
                updatedMessages[updatedMessages.length - 1].role === 'assistant' &&
                /^(yes|no)$/i.test(updatedMessages[updatedMessages.length - 1].content.trim())
              ) {
                updatedMessages.pop();
                updatedMessages.push({
                  role: 'assistant',
                  content: `Great, ${messageContent} can be treated with cannabis. Have you previously tried two treatments that didn't work?`
                });
              } else {
                // If the last message is a user message, just append the assistant message
                updatedMessages.push({
                  role: 'assistant',
                  content: `Great, ${messageContent} can be treated with cannabis. Have you previously tried two treatments that didn't work?`
                });
              }
              setEligibilityState(prev => ({
                ...prev,
                condition: messageContent,
                currentQuestion: 'previous_treatments'
              }));
            } else if (isNo) {
              if (
                updatedMessages.length > 0 &&
                updatedMessages[updatedMessages.length - 1].role === 'assistant' &&
                /^(yes|no)$/i.test(updatedMessages[updatedMessages.length - 1].content.trim())
              ) {
                updatedMessages.pop();
                updatedMessages.push({
                  role: 'assistant',
                  content: `I'm sorry, ${messageContent} is not currently treatable with cannabis in the UK. Would you like to ask about other conditions?`
                });
              } else {
                updatedMessages.push({
                  role: 'assistant',
                  content: `I'm sorry, ${messageContent} is not currently treatable with cannabis in the UK. Would you like to ask about other conditions?`
                });
              }
              setEligibilityState(prev => ({
                ...prev,
                status: 'failed'
              }));
            }
            break;

          case 'previous_treatments':
            if (isYes) {
              lastMessage.content = "Thank you. Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?";
              setEligibilityState(prev => ({
                ...prev,
                previousTreatments: true,
                currentQuestion: 'psychosis_check'
              }));
            } else if (isNo) {
              lastMessage.content = "Thank you. Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?";
              setEligibilityState(prev => ({
                ...prev,
                previousTreatments: false,
                currentQuestion: 'psychosis_check'
              }));
            }
            break;

          case 'psychosis_check':
            if (isYes || isNo) {
              lastMessage.content = isYes 
                ? "Thank you for letting us know. Let's proceed with booking your call. What is your full name?"
                : "Great! Let's proceed with booking your call. What is your full name?";
              setEligibilityState(prev => ({
                ...prev,
                psychosisHistory: isYes,
                currentQuestion: 'complete',
                status: 'passed'
              }));
              setCurrentAgent('booking');
            }
            break;
        }
      }
      return updatedMessages;
    });
  }, [eligibilityState.currentQuestion]);

  const handleBookCall = () => {
    // Set the agent type to eligibility
    setCurrentAgent('eligibility');
    
    // Reset the booking info
    setBookingInfo({ step: 'name' });
    currentBookingStepRef.current = 'name';
    bookingNameRef.current = null;
    bookingPhoneRef.current = null;
    bookingDateTimeRef.current = null;
    
    // Add a user message
    const newUserMessage = { role: 'user' as const, content: "I'd like to book a call with a specialist" };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    
    // Create a new assistant message
    const newAssistantMessage = { role: 'assistant' as const, content: "Before we can book your call, I need to check your eligibility. What condition do you want to treat with cannabis?" };
    setMessages(prevMessages => [...prevMessages, newAssistantMessage]);
    
    // Scroll to the bottom
    setTimeout(scrollToBottom, 100);
  };

  const handleSendMessage = useCallback(async (messageContent: string, agentType?: AgentType) => {
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

    // If we're in booking mode, check if the message contains booking information
    if (currentAgent === 'booking') {
      handleBookingProcess(messageContent);
      setIsLoading(false);
      stopThinkingIndicator();
      return;
    }

    let assistantResponse = '';
    let responseIdReceived: string | null = null;
    let assistantMessageIndex = -1;

    try {
        // Use the provided agentType or fall back to currentAgent
        const response = await sendMessageWithRetry(messageContent, 0, agentType);
        console.log("Initial response received:", response.status);
        console.log("Response headers:", Object.fromEntries(response.headers.entries()));

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
                            } else if (chunk.type === 'response.completed' && chunk.response?.id) {
                                console.log("Response completed, ID:", chunk.response.id);
                                responseIdReceived = chunk.response.id;
                            } else if (chunk.type === 'response.in_progress') {
                                console.log("Response in progress, waiting for vector store results...");
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
        setCurrentResponseId(responseIdReceived);

        // Handle agent transitions after stream is complete
        if (currentAgent === 'eligibility') {
            console.log("Handling eligibility response:", assistantResponse);
            handleEligibilityResponse(assistantResponse, messageContent);
        }

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
  }, [currentResponseId, isLoading, currentAgent, eligibilityState.currentQuestion, handleEligibilityResponse]);

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
    setCurrentResponseId(null); // Reset conversation continuity ID
    setIsLoading(false);
    setThinkingStage(0);
    setError(null);
    clearThinkingTimers();
    setShowHistory(false); // Close history panel
    isFirstUserMessage.current = true; // Reset flag for the new chat
    setEligibilityState({ 
      status: 'not_started',
      currentQuestion: 'condition'
    }); // Reset eligibility state
    setCurrentAgent('information'); // Always reset to information agent
    setEligibilitySummary(null); // Clear eligibility summary
    setBookingInfo({ step: 'name' }); // Reset booking info
    currentBookingStepRef.current = 'name';
    bookingNameRef.current = null;
    bookingPhoneRef.current = null;
    bookingDateTimeRef.current = null;
    setBookingError(null); // Clear booking error
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

  // Update the handleBookingProcess function
  const handleBookingProcess = useCallback(async (messageContent: string) => {
    console.log('handleBookingProcess called with message:', messageContent);
    console.log('Current booking step:', currentBookingStepRef.current);
    
    if (currentAgent !== 'booking') return;
    
    // Extract name if we're on the name step
    if (currentBookingStepRef.current === 'name') {
      console.log('Processing name step');
      // First try to match specific patterns
      const nameMatch = messageContent.match(/name\s+is\s+([^,.]+)/i) || 
                       messageContent.match(/call\s+me\s+([^,.]+)/i) ||
                       messageContent.match(/i\s+am\s+([^,.]+)/i) ||
                       messageContent.match(/my\s+name\s+is\s+([^,.]+)/i);
      
      // If no specific pattern matches, assume the entire message is the name
      // (unless it contains numbers which might indicate it's a phone number)
      const name = nameMatch ? nameMatch[1].trim() : 
                  (!/\d/.test(messageContent) ? messageContent.trim() : null);
      
      if (name) {
        setBookingError(null);
        console.log('Name extracted:', name);
        // Update both the state and the refs
        setBookingInfo(prev => ({ ...prev, name, step: 'phone' }));
        currentBookingStepRef.current = 'phone';
        bookingNameRef.current = name;
        
        // Add assistant message asking for phone
        const phoneMessage = { 
          role: 'assistant' as const, 
          content: `Thank you ${name}. Could you please provide your phone number where we can reach you?` 
        };
        setMessages(prev => [...prev, phoneMessage]);
        return;
      }
    }
    
    // Extract phone if we're on the phone step
    if (currentBookingStepRef.current === 'phone') {
      console.log('Processing phone step');
      // Remove all spaces and non-digit characters from the message
      const cleanedMessage = messageContent.replace(/\s+/g, '').replace(/[^\d]/g, '');
      
      // Check if the cleaned message contains at least 10 digits
      if (cleanedMessage.length >= 10) {
        setBookingError(null);
        // Extract the first 11 digits (or more if provided)
        // Make sure to preserve the leading zero
        const phone = cleanedMessage.substring(0, 11);
        console.log('Phone extracted:', phone);
        // Update both the state and the refs
        setBookingInfo(prev => ({ ...prev, phone, step: 'dateTime' }));
        currentBookingStepRef.current = 'dateTime';
        bookingPhoneRef.current = phone;
        
        // Add assistant message asking for date/time, including constraints
        const dateTimeMessage = { 
          role: 'assistant' as const, 
          content: "Great! What date and time would you prefer for the call? Please note, appointments are available Monday to Friday, between 9am and 5pm UK time. (e.g., 'tomorrow at 2pm' or 'next Monday at 10am')" 
        };
        setMessages(prev => [...prev, dateTimeMessage]);
        return;
      } else {
        setBookingError('Please enter a valid phone number with 11 digits.');
        const errorMsg = {
          role: 'assistant' as const,
          content: 'The phone number you entered is invalid. Please enter a valid phone number with 11 digits.'
        };
        setMessages(prev => [...prev, errorMsg]);
        return;
      }
    }
    
    // Extract date/time if we're on the dateTime step
    if (currentBookingStepRef.current === 'dateTime') {
      console.log('Processing dateTime step');
      
      // Use the simplified approach: assume the message is the date/time if it has digits
      if (/\d/.test(messageContent)) {
        const dateTime = messageContent.trim();
        console.log('Potential DateTime extracted (full message):', dateTime);

        // --- Add Validation Logic ---
        let isValidTime = true; // Assume valid unless proven otherwise
        const lowerCaseDateTime = dateTime.toLowerCase();

        // Check for weekend days
        if (/\bsaturday\b|\bsunday\b|\bweekend\b/.test(lowerCaseDateTime)) {
            isValidTime = false;
        }

        // Check for hours outside 9am-5pm (simple check based on digits)
        const hourMatch = lowerCaseDateTime.match(/\b([0-9]|1[0-9]|2[0-3])(:[0-5][0-9])?\s*(am|pm)?\b/);
        if (hourMatch) {
            let hour = parseInt(hourMatch[1], 10);
            const ampm = hourMatch[3];

            // Convert to 24-hour format if am/pm is present
            if (ampm === 'pm' && hour < 12) {
                hour += 12;
            } else if (ampm === 'am' && hour === 12) { // Midnight case
                hour = 0;
            }

            // Check if hour is outside 9 (inclusive) and 17 (exclusive)
            if (hour < 9 || hour >= 17) {
                isValidTime = false;
            }
            console.log(`Parsed Hour: ${hour}, isValid: ${isValidTime}`);
        } else {
            console.log('Could not extract specific hour for validation.');
            // If no specific hour found, we might proceed optimistically or add more checks
        }
        // --- End Validation Logic ---

        if (!isValidTime) {
            console.log('Booking time is outside working hours.');
            const invalidTimeMessage = {
                role: 'assistant' as const,
                content: "It looks like the time you suggested is outside our standard appointment hours (Monday to Friday, 9am - 5pm UK time). Could you please suggest a different time during these hours?"
            };
            setMessages(prev => [...prev, invalidTimeMessage]);
            // Keep the step as dateTime, don't reset refs yet
            setBookingInfo(prev => ({ ...prev, step: 'dateTime' })); 
            currentBookingStepRef.current = 'dateTime';
            return; // Stop processing, wait for new input
        }

        // ---- If time is valid, proceed with booking ----
        console.log('Booking time is potentially valid. Proceeding...');
        // Update both the state and the refs
        setBookingInfo(prev => ({ ...prev, dateTime, step: 'complete' }));
        currentBookingStepRef.current = 'complete';
        bookingDateTimeRef.current = dateTime;
        
        try {
          // Get the current values from the refs
          const name = bookingNameRef.current;
          const phone = bookingPhoneRef.current;
          
          // Check if we have all the required information
          if (!name || !phone) {
            console.error('Missing required information:', { name, phone, dateTime });
            throw new Error('Missing required information for booking');
          }

          // Prepare eligibility fields
          let condition = '';
          let twoTreatments = '';
          let familyHistory = '';
          if (eligibilitySummary) {
            condition = eligibilitySummary.condition || '';
            twoTreatments = eligibilitySummary.previousTreatments ? 'Yes' : 'No';
            familyHistory = eligibilitySummary.psychosisHistory ? 'Yes' : 'No';
          }

          console.log('Attempting to book call with:', { 
            name, 
            phone, 
            dateTime,
            condition,
            twoTreatments,
            familyHistory
          });
          
          // Call the booking API - use the /api/sheets endpoint for Google Sheets integration
          const response = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              name, 
              phone, 
              dateTime,
              condition,
              twoTreatments,
              familyHistory
            }),
          });
          
          console.log('API response status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            throw new Error(`Failed to book call: ${response.status} ${response.statusText}`);
          }
          
          let result;
          try {
            result = await response.json();
            console.log('Booking API response:', result);
          } catch (e) {
            console.error('Error parsing JSON response:', e);
            // Continue with a success message even if JSON parsing fails
          }
          
          // Add a success message
          const successMessage = { 
            role: 'assistant' as const, 
            content: `Great! I've booked your call for ${dateTime}. We'll call you at ${phone}. Thank you for choosing our service!` 
          };
          setMessages(prev => [...prev, successMessage]);
          
          // Switch back to information agent
          setCurrentAgent('information');
          
          // Reset booking info
          setBookingInfo({ step: 'name' });
          currentBookingStepRef.current = 'name';
          bookingNameRef.current = null;
          bookingPhoneRef.current = null;
          bookingDateTimeRef.current = null;
        } catch (error) {
          console.error('Error booking call:', error);
          
          // Add an error message
          const errorMessage = { 
            role: 'assistant' as const, 
            content: "I'm sorry, there was an error booking your call. Please try again later or contact support." 
          };
          setMessages(prev => [...prev, errorMessage]);
          
          // Reset booking info
          setBookingInfo({ step: 'name' });
          currentBookingStepRef.current = 'name';
          bookingNameRef.current = null;
          bookingPhoneRef.current = null;
          bookingDateTimeRef.current = null;
        }
      } else {
        console.log('No date/time pattern matched in message (missing digits?)');
        // Add a message asking for a valid date/time
        const invalidDateTimeMessage = { 
          role: 'assistant' as const, 
          content: "I couldn't understand that date and time. Please provide a date and time in a format like 'tomorrow at 2pm', 'next Monday at 10am', including the time." 
        };
        setMessages(prev => [...prev, invalidDateTimeMessage]);
      }
    }
  }, [currentAgent]);

  // Remove the checkEligibility function
  const checkEligibility = async (condition: string) => {
    handleSendMessage(condition);
  };

  // Handler for eligibility form completion
  const handleEligibilityComplete = (result: {
    condition: string;
    treatable: boolean;
    previousTreatments: boolean;
    psychosisHistory: boolean;
  }) => {
    setEligibilitySummary(result);
    setCurrentAgent('booking');
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content: `Eligibility check complete.\n\nCondition: ${result.condition}\nTreatable: ${result.treatable ? 'Yes' : 'No'}\nTried two treatments: ${result.previousTreatments ? 'Yes' : 'No'}\nPsychosis/Schizophrenia: ${result.psychosisHistory ? 'Yes' : 'No'}\n\nLet's proceed with booking your call. What is your full name?`
      }
    ]);
  };

  // Handler for eligibility form cancel
  const handleEligibilityCancel = () => {
    setCurrentAgent('information');
    setEligibilitySummary(null);
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: 'Eligibility check cancelled. You can continue asking questions.' }
    ]);
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

      {/* Eligibility Form for Eligibility Agent */}
      {currentAgent === 'eligibility' && (
        <EligibilityForm
          onEligibilityComplete={handleEligibilityComplete}
          onCancel={handleEligibilityCancel}
        />
      )}

      {/* Input (hide if eligibility agent) */}
      {currentAgent !== 'eligibility' && (
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
              disabled={isBooking}
              className="p-2 text-white bg-hubbot-hover rounded-lg hover:bg-hubbot-blue focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isBooking ? (
                <div className="flex items-center gap-2">
                  <FiLoader className="animate-spin" />
                  <span>Booking...</span>
                </div>
              ) : (
                <FiSend />
              )}
            </button>
          </div>
          {isBooking && bookingError && (
            <div className="text-sm text-red-600 px-4 pb-2">{bookingError}</div>
          )}
        </div>
      )}
    </div>
  );
}