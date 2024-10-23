import fs from 'node:fs';
import { Coze } from './dist/index.js';

const apiKey = process.env.COZE_API_KEY;
const botId = process.env.COZE_BOT_ID;
const query =
  'Please carefully read the following code and generate unit test case for them.\n' +
  "The test framework is vitest, Don't forget to import 'describe', 'it', 'expect' from 'vitest' module.\n" +
  "Only return the response don't give any explain.\n\n" +
  '```\n' +
  fs.readFileSync('src/index2.ts', 'utf-8') +
  '\n```';

const coze = new Coze({ api_key: apiKey });
const v = await coze.chatV2Streaming({ query, bot_id: botId });

for await (const part of v) {
  const event = part.event;
  if (event === 'done') {
    console.log(part.data);
    break;
  }

  const { message, is_finish } = part.data;
  if (message.role === 'assistant' && message.type === 'answer' && message.content_type === 'text') {
    process.stdout.write(message.content);
    if (is_finish) {
      process.stdout.write('\n');
    }
  } else {
    console.log('[%s]:[%s]:%s', message.role, message.type, message.content);
  }
}
