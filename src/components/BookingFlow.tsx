import React, { useState, useCallback } from 'react';
import { validateDateFormat, validateTimeFormat, validatePhoneNumber } from '@/lib/airtable';

interface BookingFlowProps {
  onComplete: (data: any) => void;
  onCancel: () => void;
  condition?: string;
}

type BookingStep = 'condition' | 'twoTreatments' | 'psychosisHistory' | 'name' | 'phone' | 'date' | 'time' | 'complete';

export default function BookingFlow({ onComplete, onCancel, condition }: BookingFlowProps) {
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setFormData(prev => ({ ...prev, [step]: value }));

    const steps: BookingStep[] = ['condition', 'twoTreatments', 'psychosisHistory', 'name', 'phone', 'date', 'time'];
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    } else {
      // All steps complete, submit booking
      await handleSubmit();
    }
  }, [currentStep, validateStep]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to book appointment');
      }

      onComplete(formData);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Booking failed' });
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
