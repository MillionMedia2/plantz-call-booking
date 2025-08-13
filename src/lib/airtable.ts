import Airtable from 'airtable';

// Initialize Airtable
const base = new Airtable({
  apiKey: process.env.OPENAI_API_KEY, // Using OpenAI API key for Airtable
}).base(process.env.AIRTABLE_APPOINTMENTS_BASE || '');

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
    const record = await base(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Appointments').create([
      {
        fields: {
          'Name': data.name,
          'Phone': data.phone,
          'Condition': data.condition,
          'Two Treatments': data.twoTreatments,
          'Psychosis History': data.psychosisHistory,
          'Date': data.date,
          'Time': data.time,
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Function to get all appointments
export async function getAppointments() {
  try {
    const records = await base(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Appointments').select().all();
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
    const records = await base(process.env.AIRTABLE_APPOINTMENTS_BOOKINGS || 'Appointments')
      .select({
        filterByFormula: `AND({Date} = '${date}', {Time} = '${time}')`,
      })
      .all();

    return records.length === 0;
  } catch (error) {
    console.error('Error checking time slot availability:', error);
    return false;
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
