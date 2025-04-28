import React, { useState, useRef } from 'react';

interface EligibilityFormProps {
  onEligibilityComplete: (result: {
    condition: string;
    treatable: boolean;
    previousTreatments: boolean;
    psychosisHistory: boolean;
  }) => void;
  onCancel: () => void;
}

export default function EligibilityForm({ onEligibilityComplete, onCancel }: EligibilityFormProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [condition, setCondition] = useState('');
  const [treatable, setTreatable] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousTreatments, setPreviousTreatments] = useState<boolean | null>(null);
  const [psychosisHistory, setPsychosisHistory] = useState<boolean | null>(null);
  const [llmResponse, setLlmResponse] = useState('');
  const abortController = useRef<AbortController | null>(null);

  // Streaming LLM check for condition
  const checkCondition = async () => {
    setIsLoading(true);
    setError(null);
    setLlmResponse('');
    abortController.current = new AbortController();
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: condition,
          agent_type: 'eligibility',
        }),
        signal: abortController.current.signal,
      });
      if (!response.ok) throw new Error('Failed to check condition');
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let treatableFound = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk = JSON.parse(line.substring(6));
              if (chunk.type === 'response.output_text.delta' && chunk.delta) {
                setLlmResponse(prev => prev + chunk.delta);
                // Check for YES/NO in the delta
                if (/yes/i.test(chunk.delta)) {
                  setTreatable(true);
                  treatableFound = true;
                } else if (/no/i.test(chunk.delta)) {
                  setTreatable(false);
                  treatableFound = true;
                }
              }
              if (chunk.type === 'response.completed') {
                break;
              }
            } catch {}
          }
        }
      }
      if (!treatableFound) {
        setError('Could not determine if the condition is treatable.');
      } else {
        setStep(2);
      }
    } catch (e: any) {
      setError(e.message || 'Error checking condition');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitCondition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!condition.trim()) return;
    checkCondition();
  };

  const handleProceed = () => {
    if (previousTreatments !== null && psychosisHistory !== null) {
      setStep(4);
    }
  };

  const handleComplete = () => {
    if (treatable !== null && previousTreatments !== null && psychosisHistory !== null) {
      onEligibilityComplete({
        condition,
        treatable,
        previousTreatments,
        psychosisHistory,
      });
    }
  };

  // Use the same blue as the header for all buttons
  const buttonClass =
    'px-4 py-2 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 bg-hubbot-hover text-white hover:bg-hubbot-blue disabled:opacity-50';
  const secondaryButtonClass =
    'text-hubbot-hover underline text-sm ml-2';
  const selectedButtonClass =
    'bg-hubbot-hover text-white';
  const unselectedButtonClass =
    'bg-gray-200 text-gray-800';

  return (
    <div className="flex flex-col items-center justify-center h-full w-full">
      <div className="w-full max-w-lg bg-white rounded-lg shadow-md p-6 mt-8 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-hubbot-hover">Eligibility Check</h2>
        {step === 1 && (
          <form onSubmit={handleSubmitCondition}>
            <div className="mb-4 text-base text-gray-700">
              Before booking your call, I need to do an eligibility check.<br></br><br />
              <b>What condition do you want to treat with cannabis?</b>
            </div>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-2 mb-2 focus:outline-none focus:ring-2 focus:ring-hubbot-hover"
              value={condition}
              onChange={e => setCondition(e.target.value)}
              disabled={isLoading}
              required
              placeholder="e.g. insomnia, anxiety, chronic pain"
            />
            <button
              type="submit"
              className={buttonClass + ' w-full mb-2'}
              disabled={isLoading || !condition.trim()}
            >
              {isLoading ? 'Checking...' : 'Check'}
            </button>
            {llmResponse && <div className="mt-2 text-sm text-gray-700 whitespace-pre-line">{llmResponse}</div>}
            {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
          </form>
        )}
        {step === 2 && treatable !== null && (
          <div>
            <div className="mb-4 text-base text-gray-700">
              <span className="font-medium">Condition:</span> {condition}<br />
              <span className="font-medium">Treatable:</span> {treatable ? 'Yes' : 'No'}
            </div>
            {treatable ? (
              <>
                <label className="block mb-2 font-medium">Have you previously tried two treatments that didn't work?</label>
                <div className="flex gap-4 mb-4">
                  <button
                    className={`flex-1 ${buttonClass} ${previousTreatments === true ? selectedButtonClass : unselectedButtonClass}`}
                    onClick={() => setPreviousTreatments(true)}
                    type="button"
                  >Yes</button>
                  <button
                    className={`flex-1 ${buttonClass} ${previousTreatments === false ? selectedButtonClass : unselectedButtonClass}`}
                    onClick={() => setPreviousTreatments(false)}
                    type="button"
                  >No</button>
                </div>
                <label className="block mb-2 font-medium">Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?</label>
                <div className="flex gap-4 mb-4">
                  <button
                    className={`flex-1 ${buttonClass} ${psychosisHistory === true ? selectedButtonClass : unselectedButtonClass}`}
                    onClick={() => setPsychosisHistory(true)}
                    type="button"
                  >Yes</button>
                  <button
                    className={`flex-1 ${buttonClass} ${psychosisHistory === false ? selectedButtonClass : unselectedButtonClass}`}
                    onClick={() => setPsychosisHistory(false)}
                    type="button"
                  >No</button>
                </div>
                <button
                  className={buttonClass + ' w-full mb-2'}
                  onClick={handleProceed}
                  disabled={previousTreatments === null || psychosisHistory === null}
                  type="button"
                >Continue</button>
              </>
            ) : (
              <div className="text-red-600 font-medium mb-4">Sorry, this condition is not currently treatable with cannabis in the UK.</div>
            )}
            <button className={secondaryButtonClass} onClick={onCancel} type="button">Cancel</button>
          </div>
        )}
        {step === 4 && (
          <div>
            <h3 className="font-medium mb-2 text-hubbot-hover">Eligibility Summary</h3>
            <ul className="mb-4 text-sm">
              <li><b>Condition:</b> {condition}</li>
              <li><b>Treatable:</b> {treatable ? 'Yes' : 'No'}</li>
              <li><b>Tried two treatments:</b> {previousTreatments ? 'Yes' : 'No'}</li>
              <li><b>Psychosis/Schizophrenia:</b> {psychosisHistory ? 'Yes' : 'No'}</li>
            </ul>
            {treatable && previousTreatments && psychosisHistory !== null && (
              <button
                className={buttonClass + ' w-full mb-2'}
                onClick={handleComplete}
              >Proceed to Booking</button>
            )}
            <button className={secondaryButtonClass} onClick={onCancel} type="button">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
} 