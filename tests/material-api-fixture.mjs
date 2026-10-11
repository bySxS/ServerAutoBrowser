// Exercise the real HTTP routes without paid or unpredictable upstream calls.
process.env.PORT = process.env.TEST_PORT || '696';
process.env.SEO_API_TOKEN = '';
process.env.GEMINI_API_KEY = 'test-key';
process.env.GROQ_API_KEY = 'test-key';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('googleapis.com') && !String(url).includes('api.groq.com')) {
    return originalFetch(url, init);
  }
  const request = JSON.parse(init.body);
  const input = JSON.parse(request.contents?.[0]?.parts?.[0]?.text ?? request.messages?.[1]?.content);
  if (input.title === 'FAIL') return new Response('fixture failure', { status: 503 });
  if (input.title !== '\u0418\u0433\u0440\u0430') {
    return new Response('Request title was not encoded as UTF-8', { status: 400 });
  }
  const result = {
    title: 'Translated Game', shortDescription: 'English brief',
    description: '[b]Description:[/b][br]Translated paragraph[hr][b]System requirements:[/b][br]Windows 10[url=https://example.com]Store[/url]',
    seoDescription: input.seo ? 'English SEO description: download torrent for this game.' : '',
  };
  return Response.json(String(url).includes('googleapis.com')
    ? { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }
    : { choices: [{ message: { content: JSON.stringify(result) } }] });
};
await import('../server.ts');
