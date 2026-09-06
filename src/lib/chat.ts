import { db } from "./db";

export type ChatMessage = {
  id: number;
  user_id: number;
  username: string;
  profile_image: string | null;
  body: string;
  created_at: string;
};

const messageSelect = `
  SELECT chat_messages.*, users.username, users.profile_image
  FROM chat_messages
  JOIN users ON users.id = chat_messages.user_id
`;

export function recentChatMessages() {
  return (
    db
      .prepare(
        `SELECT * FROM (${messageSelect} ORDER BY chat_messages.id DESC LIMIT 100) ORDER BY id ASC`,
      )
      .all() as ChatMessage[]
  );
}

export function chatMessagesAfter(messageId: number) {
  return db
    .prepare(
      `${messageSelect} WHERE chat_messages.id > ? ORDER BY chat_messages.id ASC LIMIT 100`,
    )
    .all(messageId) as ChatMessage[];
}

export function createChatMessage(userId: number, body: string) {
  const result = db
    .prepare("INSERT INTO chat_messages (user_id, body) VALUES (?, ?)")
    .run(userId, body);
  return db
    .prepare(`${messageSelect} WHERE chat_messages.id = ?`)
    .get(result.lastInsertRowid) as ChatMessage;
}
