import React, { useState, useCallback, useEffect } from 'react';

interface BookingFlowProps {
  onComplete: (data: any) => void;
  onCancel: () => void;
  onConditionCheck: (condition: string) => Promise<boolean>;
  condition?: string;
}

type BookingStep = 'condition' | 'twoTreatments' | 'psychosisHistory' | 'name' | 'phone' | 'date' | 'time' | 'complete';

export default function BookingFlow({ onComplete, onCancel, onConditionCheck, condition }: BookingFlowProps) {
  const [currentStep, setCurrentStep] = useState<BookingStep>(condition ? 'twoTreatments' : 'condition');
  const [formData, setFormData] = useState({
    condition: condition || '',
    twoTreatments: '',
    psychosisHistory: '',
    name: '',
    phone: '',
    date: '',
    time: '',
  });

  // Update formData when condition prop changes
  useEffect(() => {
    if (condition) {
      setFormData(prev => ({ ...prev, condition }));
    }
  }, [condition]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation functions
  const validateDateFormat = (date: string): boolean => {
    const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    return dateRegex.test(date);
  };

  const validateTimeFormat = (time: string): boolean => {
    const timeRegex = /^(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)$/i;
    return timeRegex.test(time);
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 11;
  };

  const validateStep = useCallback((step: BookingStep, value: string): boolean => {
    setErrors({});
    
    switch (step) {
      case 'condition':
        if (!value.trim()) {
          setErrors({ condition: 'Please enter your condition' });
          return false;
        }
        break;
      case 'twoTreatments':
        if (!value) {
          setErrors({ twoTreatments: 'Please select an option' });
          return false;
        }
        break;
      case 'psychosisHistory':
        if (!value) {
          setErrors({ psychosisHistory: 'Please select an option' });
          return false;
        }
        break;
      case 'name':
        if (!value.trim()) {
          setErrors({ name: 'Please enter your full name' });
          return false;
        }
        break;
      case 'phone':
        if (!validatePhoneNumber(value)) {
          setErrors({ phone: 'Please enter a valid UK phone number' });
          return false;
        }
        break;
      case 'date':
        if (!validateDateFormat(value)) {
          setErrors({ date: 'Please use DD/MM/YYYY format' });
          return false;
        }
        break;
      case 'time':
        if (!validateTimeFormat(value)) {
          setErrors({ time: 'Please use 12-hour format with am/pm (e.g., 2:30pm)' });
          return false;
        }
        break;
    }
    return true;
  }, []);

  const handleNext = useCallback(async (step: BookingStep, value: string) => {
    if (!validateStep(step, value)) return;

    // Update form data with the new value
    const updatedFormData = { ...formData, [step]: value };
    setFormData(updatedFormData);

    // Special handling for condition step - verify with LLM
    if (step === 'condition') {
      setIsSubmitting(true);
      try {
        const isTreatable = await onConditionCheck(value);
        if (isTreatable) {
          setCurrentStep('twoTreatments');
        } else {
          setErrors({ condition: 'This condition is not eligible for medical cannabis treatment. Please contact us for alternative options.' });
        }
      } catch (error) {
        setErrors({ condition: 'Failed to verify condition. Please try again.' });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const steps: BookingStep[] = ['condition', 'twoTreatments', 'psychosisHistory', 'name', 'phone', 'date', 'time'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    } else {
      // All steps complete, submit booking with updated data
      await handleSubmit(updatedFormData);
    }
  }, [currentStep, validateStep, formData, onConditionCheck]);

  const handleSubmit = async (dataToSubmit = formData) => {
    setIsSubmitting(true);
    setErrors({}); // Clear previous errors
    
    try {
      console.log('Submitting booking data:', dataToSubmit);
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSubmit),
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('Response text:', responseText);

      let responseData;
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError);
        throw new Error(`Server returned invalid response: ${responseText}`);
      }

      if (!response.ok) {
        console.error('API error response:', responseData);
        const errorMessage = responseData.error || `Server error: ${response.status}`;
        
        // Provide more user-friendly error messages
        if (errorMessage.includes('Data format error')) {
          throw new Error('There was an issue with the data format. Please try again.');
        } else if (errorMessage.includes('Database field configuration error')) {
          throw new Error('System configuration issue. Please contact support.');
        } else if (errorMessage.includes('Database connection error')) {
          throw new Error('Connection issue. Please try again in a moment.');
        } else if (errorMessage.includes('time slot is already booked')) {
          throw new Error('This time slot is already booked. Please choose a different time.');
        } else if (errorMessage.includes('Missing required fields')) {
          throw new Error('Please fill in all required fields.');
        } else {
          throw new Error(errorMessage);
        }
      }

      console.log('Booking successful:', responseData);
      onComplete(dataToSubmit); // Use the submitted data, not formData
    } catch (error) {
      console.error('Booking error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setErrors({ submit: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'condition':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">What condition do you want to treat with cannabis?</h3>
            <input
              type="text"
              value={formData.condition}
              onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., insomnia, anxiety, chronic pain"
            />
            {errors.condition && <p className="text-red-600 text-sm">{errors.condition}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleNext('condition', formData.condition)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Checking...' : 'Continue'}
              </button>
              <button
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'twoTreatments':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Have you previously tried two treatments that didn&apos;t work?</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleNext('twoTreatments', 'Yes')}
                className="w-full p-3 text-left border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Yes
              </button>
              <button
                onClick={() => handleNext('twoTreatments', 'No')}
                className="w-full p-3 text-left border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                No
              </button>
            </div>
            {errors.twoTreatments && <p className="text-red-600 text-sm">{errors.twoTreatments}</p>}
          </div>
        );

      case 'psychosisHistory':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Have you, or an immediate family member, been diagnosed with psychosis or schizophrenia?</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleNext('psychosisHistory', 'Yes')}
                className="w-full p-3 text-left border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Yes
              </button>
              <button
                onClick={() => handleNext('psychosisHistory', 'No')}
                className="w-full p-3 text-left border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                No
              </button>
            </div>
            {errors.psychosisHistory && <p className="text-red-600 text-sm">{errors.psychosisHistory}</p>}
          </div>
        );

      case 'name':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">What is your full name?</h3>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your full name"
            />
            {errors.name && <p className="text-red-600 text-sm">{errors.name}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleNext('name', formData.name)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Continue
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'phone':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">What is your phone number?</h3>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your phone number"
            />
            {errors.phone && <p className="text-red-600 text-sm">{errors.phone}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleNext('phone', formData.phone)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Continue
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'date':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">What date would you prefer for your call?</h3>
            <p className="text-sm text-gray-600">Available Monday to Friday</p>
            <input
              type="text"
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="DD/MM/YYYY (e.g., 15/12/2024)"
            />
            {errors.date && <p className="text-red-600 text-sm">{errors.date}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleNext('date', formData.date)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Continue
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 'time':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">What time would you prefer for your call?</h3>
            <p className="text-sm text-gray-600">Available 9am to 5pm UK time</p>
            <input
              type="text"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., 2:30pm"
            />
            {errors.time && <p className="text-red-600 text-sm">{errors.time}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => handleNext('time', formData.time)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Booking...' : 'Book Appointment'}
              </button>
              <button
                onClick={onCancel}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      {errors.submit && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {errors.submit}
        </div>
      )}
      {renderStep()}
    </div>
  );
}
