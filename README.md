# Plantz Call Booking

A Next.js application that provides a chat interface for medical cannabis information and call booking functionality.

## Features

- Chat interface with medical cannabis information using OpenAI Assistants API
- File search integration for knowledge base
- Automated eligibility checking and call booking
- Airtable integration for appointment management
- Responsive design for mobile and desktop

## Tech Stack

- Next.js
- React
- TypeScript
- OpenAI API (Responses API)
- Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository
```bash
git clone https://github.com/millionmedia2/plantz-call-booking.git
cd plantz-call-booking
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env.local` file with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
VECTOR_STORE_IDS=your_vector_store_ids
AIRTABLE_APPOINTMENTS_BASE=your_airtable_base_id
AIRTABLE_APPOINTMENTS_BOOKINGS=your_airtable_table_id
OPENAI_ASSISTANT_KEY=your_openai_assistant_id
```

4. Run the development server
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## License

This project is proprietary and confidential.
