import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const { name, phone, dateTime } = await request.json();

    // Validate required fields
    if (!name || !phone || !dateTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Log the booking details (in a real app, this would write to Google Sheets)
    console.log('Booking details:', {
      timestamp: new Date().toISOString(),
      name,
      phone,
      dateTime,
      status: 'Pending',
      notes: ''
    });

    // For now, we'll just return a success response
    // In a real implementation, this would write to Google Sheets
    return NextResponse.json({
      success: true,
      message: 'Call booked successfully'
    });
  } catch (error) {
    console.error('Error booking call:', error);
    return NextResponse.json(
      { error: 'Failed to book call' },
      { status: 500 }
    );
  }
} 