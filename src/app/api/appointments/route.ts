import { NextRequest, NextResponse } from 'next/server';
import { 
  createAppointment, 
  validateDateFormat, 
  validateTimeFormat, 
  validatePhoneNumber,
  isTimeSlotAvailable 
} from '@/lib/airtable';

export async function POST(request: NextRequest) {
  try {
    const { name, phone, condition, twoTreatments, psychosisHistory, date, time } = await request.json();

    // Validate required fields
    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!phone) missingFields.push('phone');
    if (!condition) missingFields.push('condition');
    if (!twoTreatments) missingFields.push('twoTreatments');
    if (!psychosisHistory) missingFields.push('psychosisHistory');
    if (!date) missingFields.push('date');
    if (!time) missingFields.push('time');

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate data formats
    if (!validateDateFormat(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Please use DD/MM/YYYY' },
        { status: 400 }
      );
    }

    if (!validateTimeFormat(time)) {
      return NextResponse.json(
        { error: 'Invalid time format. Please use 12-hour format with am/pm (e.g., 2:30pm)' },
        { status: 400 }
      );
    }

    if (!validatePhoneNumber(phone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Check if time slot is available
    const isAvailable = await isTimeSlotAvailable(date, time);
    if (!isAvailable) {
      return NextResponse.json(
        { error: 'This time slot is already booked. Please choose a different time.' },
        { status: 409 }
      );
    }

    // Create appointment
    const result = await createAppointment({
      name,
      phone,
      condition,
      twoTreatments,
      psychosisHistory,
      date,
      time,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Appointment booked successfully',
        recordId: result.recordId,
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to book appointment' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error booking appointment:', error);
    
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // This could be used to get available time slots or existing appointments
    // For now, just return a success message
    return NextResponse.json({
      success: true,
      message: 'Appointments API is working',
    });
  } catch (error) {
    console.error('Error in appointments GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
