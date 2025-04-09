// Test script for the Google Sheets API endpoint
const testBooking = async () => {
  try {
    console.log('Testing Google Sheets API endpoint...');
    
    const response = await fetch('http://localhost:3000/api/sheets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test User',
        phone: '07700900000',
        dateTime: 'next monday at 2pm',
      }),
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const result = await response.json();
    console.log('Success response:', result);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Run the test
testBooking(); 