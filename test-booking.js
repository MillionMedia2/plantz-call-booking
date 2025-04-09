// Test script for the booking API endpoint
const testBooking = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test User',
        phone: '1234567890',
        dateTime: '2023-12-25T10:00:00Z',
      }),
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error testing booking API:', error);
  }
};

testBooking(); 