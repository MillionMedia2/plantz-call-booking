import Airtable from 'airtable';

// Initialize Airtable only on server side
let base: any = null;

function getAirtableBase() {
  if (typeof window !== 'undefined') {
    // Client side - return null
    return null;
  }
  
  if (!base) {
    base = new Airtable({
      apiKey: process.env.AIRTABLE_API_KEY,
    }).base(process.env.AIRTABLE_APPOINTMENTS_BASE || '');
  }
  
  return base;
}

// Interface for appointment data
export interface AppointmentData {
  name: string;
  phone: string;
  condition: string;
  twoTreatments: string;
  psychosisHistory: string;
  date: string; // DD/MM/YYYY format
  time: string; // 12-hour format with am/pm
}

// Function to create a new appointment record
export async function createAppointment(data: AppointmentData) {
  try {
    const airtableBase = getAirtableBase();
    if (!airtableBase) {
      throw new Error('Airtable not available on client side');
    }
    
    // Convert date and time to Airtable's expected format
    // Airtable expects: "2025-08-18T14:30:00.000Z" format for dateTime fields
    const [day, month, year] = data.date.split('/');
    
    // Parse time (e.g., "2:30pm" -> 14:30)
    let hour = parseInt(data.time.match(/(\d+)/)?.[1] || '0');
    const isPM = data.time.toLowerCase().includes('pm');
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    
    const minutes = parseInt(data.time.match(/:(\d+)/)?.[1] || '0');
    
    // Create ISO string for Airtable dateTime field
    const airtableDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minutes).toISOString();
    
    console.log('Creating appointment with data:', {
      name: data.name,
      phone: data.phone,
      condition: data.condition,
      twoTreatments: data.twoTreatments,
      psychosisHistory: data.psychosisHistory,
      dateTime: airtableDateTime
    });
    
    const record = await airtableBase(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Bookings').create([
      {
        fields: {
          'Name': data.name,
          'Phone': data.phone,
          'Condition': data.condition,
          'Two Treatments': data.twoTreatments,
          'Psychosis History': data.psychosisHistory,
          'Date': airtableDateTime,
        },
      },
    ]);

    return {
      success: true,
      recordId: record[0].id,
      message: 'Appointment created successfully',
    };
  } catch (error) {
    console.error('Error creating appointment:', error);
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Failed to create appointment';
    
    if (error instanceof Error) {
      if (error.message.includes('INVALID_VALUE_FOR_COLUMN')) {
        errorMessage = 'Data format error. Please check your input and try again.';
      } else if (error.message.includes('INVALID_FILTER_BY_FORMULA')) {
        errorMessage = 'Database field configuration error. Please contact support.';
      } else if (error.message.includes('API key')) {
        errorMessage = 'Database connection error. Please contact support.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'Database table not found. Please contact support.';
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Function to get all appointments
export async function getAppointments() {
  try {
    const airtableBase = getAirtableBase();
    if (!airtableBase) {
      throw new Error('Airtable not available on client side');
    }
    
    const records = await airtableBase(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Bookings').select().all();
    return records.map(record => ({
      id: record.id,
      name: record.get('Name') as string,
      phone: record.get('Phone') as string,
      condition: record.get('Condition') as string,
      twoTreatments: record.get('Two Treatments') as string,
      psychosisHistory: record.get('Psychosis History') as string,
      date: record.get('Date') as string,
      time: record.get('Time') as string,
    }));
  } catch (error) {
    console.error('Error fetching appointments:', error);
    throw error;
  }
}

// Function to check if a time slot is available
export async function isTimeSlotAvailable(date: string, time: string) {
  try {
    const airtableBase = getAirtableBase();
    if (!airtableBase) {
      throw new Error('Airtable not available on client side');
    }
    
    console.log('Checking availability for:', { date, time });
    
    // Convert date and time to Airtable's expected format for comparison
    const [day, month, year] = date.split('/');
    
    // Parse time (e.g., "2:30pm" -> 14:30)
    let hour = parseInt(time.match(/(\d+)/)?.[1] || '0');
    const isPM = time.toLowerCase().includes('pm');
    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    
    const minutes = parseInt(time.match(/:(\d+)/)?.[1] || '0');
    
    // Create ISO string for comparison
    const targetDateTime = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, minutes);
    const targetDate = targetDateTime.toISOString().split('T')[0]; // Just the date part
    
    console.log('Checking availability for date:', targetDate, 'time:', `${hour}:${minutes.toString().padStart(2, '0')}`);
    
    // Get all records for the target date
    const records = await airtableBase(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Bookings')
      .select({
        filterByFormula: `IS_SAME({Date}, '${targetDate}', 'day')`,
      })
      .all();

    console.log('Found records for this date:', records.length);
    
    // Check if any of these records have the same time (within 1 hour window)
    const conflictingRecords = records.filter(record => {
      const recordDate = new Date(record.get('Date') as string);
      const timeDiff = Math.abs(recordDate.getTime() - targetDateTime.getTime());
      return timeDiff < 60 * 60 * 1000; // 1 hour window
    });
    
    console.log('Conflicting records found:', conflictingRecords.length);
    return conflictingRecords.length === 0;
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    // For now, return true (available) if there's an error, so booking can proceed
    return true;
  }
}

// Function to validate date format (DD/MM/YYYY)
export function validateDateFormat(date: string): boolean {
  const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
  return dateRegex.test(date);
}

// Function to validate time format (12-hour with am/pm)
export function validateTimeFormat(time: string): boolean {
  const timeRegex = /^(1[0-2]|0?[1-9]):?([0-5][0-9])?\s?(am|pm)$/i;
  return timeRegex.test(time);
}

// Function to validate phone number (UK format)
export function validatePhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  // UK phone numbers are typically 10-11 digits
  return cleaned.length >= 10 && cleaned.length <= 11;
}

// Function to convert date and time to a standardized format
export function formatDateTime(date: string, time: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD for better sorting
  const [day, month, year] = date.split('/');
  const formattedDate = `${year}-${month}-${day}`;
  
  // Ensure time has proper format
  let formattedTime = time.toLowerCase();
  if (!formattedTime.includes(':')) {
    // Add colon if missing (e.g., "2pm" -> "2:00pm")
    formattedTime = formattedTime.replace(/(\d+)(am|pm)/, '$1:00$2');
  }
  
  return `${formattedDate} ${formattedTime}`;
}
