import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEnglishMaterial } from '../material-provider.ts';
import { generateSeoText } from '../seo-provider.ts';

const source = {
  title: '\u0418\u0433\u0440\u0430 2026', shortDescription: '\u041A\u0440\u0430\u0442\u043A\u043E',
  description: '[b]\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:[/b][br]\u0418\u0433\u0440\u0430[hr][url=https://example.com/game]Store[/url]',
};
const translated = {
  title: 'Game 2026', shortDescription: 'A game.',
  description: '[b]Description:[/b][br]A game[hr][url=https://example.com/game]Store[/url]',
  seoDescription: 'Explore Game 2026 and download torrent for this edition.',
};

async function withProviders(responses, action) {
  const savedFetch = globalThis.fetch;
  const savedGemini = process.env.GEMINI_API_KEY;
  const savedGroq = process.env.GROQ_API_KEY;
  const calls = [];
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GROQ_API_KEY = 'test-key';
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    let reply = responses.shift();
    assert.ok(reply, 'Unexpected provider request');
    if (typeof reply === 'function') reply = reply(calls.at(-1));
    if (reply.status) return new Response('Unavailable', { status: reply.status });
    if (reply.raw) return Response.json(reply.raw);
    return Response.json(url.includes('googleapis')
      ? { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }
      : { choices: [{ message: { content: JSON.stringify(reply) } }] });
  };
  try { await action(calls); }
  finally {
    globalThis.fetch = savedFetch;
    if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedGemini;
    if (savedGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = savedGroq;
  }
}

test('translation only preserves full text, markup and links', async () => {
  await withProviders([{ ...translated, seoDescription: '' }], async calls => {
    const result = await generateEnglishMaterial({ ...source, seo: false });
    assert.equal(result.result.title, 'Game 2026');
    assert.equal(result.result.description, translated.description);
    assert.equal(result.result.seoDescription, '');
    assert.equal(JSON.parse(calls[0].body.contents[0].parts[0].text).description, source.description);
  });
});

test('combined translation and SEO uses one English generation', async () => {
  await withProviders([{ ...translated }], async calls => {
    const result = await generateEnglishMaterial({ ...source, seo: true });
    assert.equal(calls.length, 1);
    assert.match(calls[0].body.systemInstruction.parts[0].text, /first translate/);
    assert.equal(JSON.parse(calls[0].body.contents[0].parts[0].text).seo, true);
    assert.equal(result.result.seoDescription, translated.seoDescription);
  });
});

test('HTML is hidden from the model and restored byte for byte', async () => {
  const htmlSource = '<B title="a > b">Source</B><br /><p>Text</p><!--keep--><a href="https://example.com/game">Store</a>';
  await withProviders([call => {
    const input = JSON.parse(call.body.contents[0].parts[0].text);
    assert.ok(!input.description.includes('<B'));
    assert.ok(!input.description.includes('https://example.com'));
    return { ...translated, description: input.description.replace('Source', 'English').replace('Text', 'Translation'),
      shortDescription: input.shortDescription.replace('Brief', 'English brief'), seoDescription: '' };
  }], async calls => {
    const result = await generateEnglishMaterial({ ...source, description: htmlSource,
      shortDescription: '<b>Brief</b>', seo: false });
    assert.equal(result.provider, 'gemini');
    assert.equal(result.result.description, htmlSource.replace('Source', 'English').replace('Text', 'Translation'));
    assert.equal(result.result.shortDescription, '<b>English brief</b>');
    assert.equal(calls.length, 1);
  });
});

test('missing, duplicated and reordered HTML placeholders trigger fallback', async () => {
  const good = call => {
    const input = JSON.parse(call.body.contents?.[0]?.parts?.[0]?.text ?? call.body.messages[1].content);
    return { ...translated, description: input.description.replace('Source', 'English'), seoDescription: '' };
  };
  for (const change of [
    text => text.replace('__CFFSTS_HTML_0__', ''),
    text => text.replace('__CFFSTS_HTML_0__', '__CFFSTS_HTML_0____CFFSTS_HTML_0__'),
    text => text.replace('__CFFSTS_HTML_0__', '__CFFSTS_HTML_1__').replace(/__CFFSTS_HTML_1__$/, '__CFFSTS_HTML_0__'),
  ]) {
    await withProviders([call => {
      const result = good(call);
      return { ...result, description: change(result.description) };
    }, good], async () => {
      const result = await generateEnglishMaterial({ ...source, description: '<b>Source</b>', seo: false });
      assert.equal(result.provider, 'groq');
      assert.equal(result.result.description, '<b>English</b>');
    });
  }
});

test('503 falls back to Groq with the English prompt', async () => {
  await withProviders([{ status: 503 }, { ...translated }], async calls => {
    const result = await generateEnglishMaterial({ ...source, seo: true });
    assert.equal(result.provider, 'groq');
    assert.match(calls[1].body.messages[0].content, /natural English/);
    assert.equal(calls[1].body.max_completion_tokens, 32768);
    assert.equal(calls[1].body.reasoning_effort, 'low');
    assert.equal(calls[1].body.response_format.type, 'json_schema');
    assert.equal(calls[1].body.response_format.json_schema.strict, true);
    assert.equal(calls[1].body.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(calls[0].body.generationConfig.maxOutputTokens, 32768);
  });
});

test('truncated provider output is rejected even if JSON happens to be valid', async () => {
  await withProviders([{ raw: { candidates: [{ finishReason: 'MAX_TOKENS',
    content: { parts: [{ text: JSON.stringify(translated) }] } }] } }, { ...translated }], async () => {
    const result = await generateEnglishMaterial({ ...source, seo: true });
    assert.equal(result.provider, 'groq');
  });
  await withProviders([{ status: 503 }, { raw: { choices: [{ finish_reason: 'length',
    message: { content: JSON.stringify(translated) } }] } }], async () => {
    await assert.rejects(generateEnglishMaterial({ ...source, seo: true }), /Groq token limit/);
  });
});

test('changed markup, links or invalid English SEO trigger fallback', async () => {
  for (const bad of [
    { ...translated, description: translated.description.replace('[hr]', '') },
    { ...translated, description: translated.description.replace('example.com', 'evil.example') },
    { ...translated, seoDescription: 'Missing keyword' },
  ]) {
    await withProviders([bad, { ...translated }], async calls => {
      const result = await generateEnglishMaterial({ ...source, seo: true });
      assert.equal(result.provider, 'groq');
      assert.equal(calls.length, 2);
    });
  }
});

test('invalid input fails before provider calls', async () => {
  await withProviders([], async calls => {
    await assert.rejects(generateEnglishMaterial({ ...source, seo: 'true' }), /boolean/);
    await assert.rejects(generateEnglishMaterial({ ...source, description: 'a'.repeat(50001) }), /description/);
    assert.equal(calls.length, 0);
  });
});

test('Russian SEO keeps its existing language and keyword', async () => {
  const russian = { title: 'Game', shortDescription: 'Brief',
    description: '\u0441\u043A\u0430\u0447\u0430\u0442\u044C \u0442\u043E\u0440\u0440\u0435\u043D\u0442', metaDescription: 'Meta', keywords: ['Game'] };
  await withProviders([russian], async calls => {
    const result = await generateSeoText({ title: 'Game', description: 'Source' });
    assert.equal(result.result.description, russian.description);
    assert.match(calls[0].body.systemInstruction.parts[0].text, /\u0440\u0443\u0441\u0441\u043A\u043E\u043C/);
  });
});
