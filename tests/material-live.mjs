import assert from 'node:assert/strict';
import { generateEnglishMaterial } from '../material-provider.ts';

const generated = await generateEnglishMaterial({
  title: '\u0418\u0433\u0440\u0430: Adventure 2026',
  shortDescription: '\u0418\u0433\u0440\u0430 \u0434\u043B\u044F Windows.',
  description: '[b]\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435:[/b][br]\u0418\u0433\u0440\u0430 \u0441 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u043E\u0441\u0442\u0440\u043E\u0432\u0430 \u0438 \u0440\u0435\u0448\u0435\u043D\u0438\u0435\u043C \u0433\u043E\u043B\u043E\u0432\u043E\u043B\u043E\u043C\u043E\u043A.[hr][b]\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0435 \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F:[/b][br]Windows 10, 8 GB RAM. Version 1.0.',
  seo: true,
});
const result = generated.result;
assert.ok(!/[\u0400-\u04ff]/.test(result.title + result.description + result.shortDescription + result.seoDescription));
assert.equal((result.seoDescription.toLowerCase().match(/download torrent/g) ?? []).length, 1);
assert.ok(result.description.includes('Windows 10'));
assert.ok(result.description.includes('1.0'));
console.log(JSON.stringify({ provider: generated.provider, title: result.title,
  shortDescription: result.shortDescription, seoLength: result.seoDescription.length,
  english: true, technicalFactsPreserved: true }));
