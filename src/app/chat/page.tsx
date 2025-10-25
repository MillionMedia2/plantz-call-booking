// app/chat/page.tsx
import ChatEmbed from "@/components/ChatEmbed";
import type { EmbedConfig } from "@/types/embed";

export const metadata = {
  title: "Chat – Plantz",
  robots: "noindex, nofollow",
};

export default async function ChatPage({ 
  searchParams 
}: { 
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams;
  
  const config: EmbedConfig = {
    initialQuestion: params.q,
    agentKey: params.agent,
    variant: params.variant,
    themeKey: params.theme,
    sourceTag: params.source,
    presetToken: params.preset,
  };
  
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-1.5 md:p-4 bg-transparent">
      <div className="w-full max-w-[400px] h-[calc(100vh-2rem)] max-h-[600px] min-h-[400px] bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <ChatEmbed config={config} />
      </div>
    </main>
  );
}

