import { ChatRoom } from "@/components/chat-room";
import { requireUser } from "@/lib/auth";
import { recentChatMessages } from "@/lib/chat";
import { isVisitorAccount } from "@/lib/db";

export default async function ChatPage() {
  const user = await requireUser();
  const messages = recentChatMessages();

  return (
    <>
      <div className="page-heading chat-heading">
        <p className="eyebrow">RADIO ROOM</p>
        <h1>Crew chat</h1>
        <p>A shared channel for quick updates between the whole crew.</p>
      </div>
      <ChatRoom
        initialMessages={messages}
        currentUserId={user.id}
        readOnly={isVisitorAccount(user)}
      />
    </>
  );
}
