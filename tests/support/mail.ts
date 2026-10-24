// The mailbox of the local stack (Mailpit, docker-compose.yml): every email
// the test server sends lands there and goes no further.

const mailbox = 'http://localhost:8025/api/v1';

export type Mail = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
};

export async function emptyMailbox(): Promise<void> {
  await fetch(`${mailbox}/messages`, { method: 'DELETE' });
}

async function mails(): Promise<Mail[]> {
  const list = await (await fetch(`${mailbox}/messages`)).json();
  return Promise.all(
    list.messages.map(async (summary: { ID: string }) => {
      const mail = await (await fetch(`${mailbox}/message/${summary.ID}`)).json();
      return {
        to: mail.To[0].Address,
        from: `${mail.From.Name} <${mail.From.Address}>`,
        subject: mail.Subject,
        text: mail.Text,
        html: mail.HTML,
        messageId: mail.MessageID,
      };
    }),
  );
}

/**
 * The emails received, once there are `count` of them (an email leaves after
 * the answer). Fails if more arrive: a test that expects one email must not
 * pass when two were sent.
 */
export async function receivedMails(count: number): Promise<Mail[]> {
  for (let tries = 0; tries < 50; tries++) {
    if ((await mails()).length >= count) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Leaves a late second email the time to show up.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const received = await mails();
  if (received.length !== count) {
    throw new Error(`${received.length} email(s) arrived, ${count} expected`);
  }
  return received;
}

/** The emails received after leaving the server the time to send one. */
export async function mailsAfterAWhile(): Promise<Mail[]> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return mails();
}
