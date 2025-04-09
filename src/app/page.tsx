// src/app/page.tsx
import ChatInterface from '@/components/ChatInterface'; // Adjust path if needed

export default function Home() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-1.5 md:p-4">
      <div className="w-full max-w-[400px] h-[calc(100vh-2rem)] max-h-[600px] min-h-[400px] bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <ChatInterface />
      </div>
    </main>
  );
}