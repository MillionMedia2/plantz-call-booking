import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// This route doesn't use Edge Runtime
// export const runtime = 'edge';

export async function POST(request: Request) {
  // --- Environment Variable Checks ---
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!clientEmail) {
    console.error('Missing environment variable: GOOGLE_SHEETS_CLIENT_EMAIL');
    return NextResponse.json(
      { error: 'Server configuration error: Missing client email.' },
      { status: 500 }
    );
  }
  if (!privateKey) {
    console.error('Missing environment variable: GOOGLE_SHEETS_PRIVATE_KEY');
    return NextResponse.json(
      { error: 'Server configuration error: Missing private key.' },
      { status: 500 }
    );
  }
  if (!spreadsheetId) {
    console.error('Missing environment variable: GOOGLE_SHEETS_SPREADSHEET_ID');
    return NextResponse.json(
      { error: 'Server configuration error: Missing spreadsheet ID.' },
      { status: 500 }
    );
  }
  // --- End Environment Variable Checks ---

  try {
    const { name, phone, dateTime, condition, twoTreatments, familyHistory } = await request.json();

    // Validate required fields
    if (!name || !phone || !dateTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Initialize the Google Sheets API client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail, // Use checked variable
        private_key: privateKey.replace(/\\n/g, '\n'), // Use checked variable
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Add the row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId, // Use checked variable
      range: 'Sheet1!A:I', // Adjust based on your sheet name and range
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toISOString(), // Timestamp
          name,                     // Name
          `'${phone}`,              // Phone (add a single quote to force text format)
          dateTime,                 // DateTime
          condition || '',          // Condition
          twoTreatments || '',      // Two Treatments (Yes/No)
          familyHistory || '',      // Family History (Yes/No)
          'Pending',                // Status
          ''                        // Notes
        ]],
      },
    });

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