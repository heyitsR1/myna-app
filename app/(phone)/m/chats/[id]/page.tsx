import ChatThread from "@/components/phone/ChatThread";

export const metadata = { title: "Chat · Myna" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return <ChatThread id={(await params).id} />;
}
