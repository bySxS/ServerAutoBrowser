import assert from 'node:assert/strict';
import { generateEnglishMaterial } from '../material-provider.ts';

const input = {
  title: '\u0418\u0433\u0440\u0430 Adventure 2026',
  shortDescription: '<b>\u0418\u0433\u0440\u0430 \u0434\u043B\u044F Windows.</b>',
  description: '<div class="post_body"><B>\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:</B><br />' +
    '<p>\u0418\u0433\u0440\u0430 \u0441 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u043E\u0441\u0442\u0440\u043E\u0432\u0430 \u0438 \u043F\u043E\u0438\u0441\u043A\u043E\u043C \u0441\u043E\u043A\u0440\u043E\u0432\u0438\u0449.</p>' +
    '<!--original formatting--><hr /><b>\u0422\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F:</b><br>Windows 10, 8 GB RAM, version 1.0.' +
    '<a href="https://example.com/game" title="a > b">\u0421\u0430\u0439\u0442 \u0438\u0433\u0440\u044B</a></div>',
  seo: false,
};
const tags = text => text.match(/<!--[\s\S]*?-->|<\/?[a-z](?:"[^"]*"|'[^']*'|[^'">])*>/gi) ?? [];
const geminiKey = process.env.GEMINI_API_KEY;
try {
  for (const provider of ['gemini', 'groq']) {
    if (provider === 'groq') process.env.GEMINI_API_KEY = '';
    const generated = await generateEnglishMaterial(input);
    assert.equal(generated.provider, provider);
    const result = generated.result;
    assert.deepEqual(tags(result.description), tags(input.description));
    assert.deepEqual(tags(result.shortDescription), tags(input.shortDescription));
    assert.ok(!/[\u0400-\u04ff]/.test(result.title + result.description + result.shortDescription));
    assert.ok(!result.description.includes('__CFFSTS_HTML_'));
    assert.ok(result.description.includes('Windows 10'));
    assert.ok(result.description.includes('1.0'));
    console.log(JSON.stringify({ provider, english: true, htmlUnchanged: true, jsonComplete: true }));
  }
} finally {
  if (geminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = geminiKey;
}
