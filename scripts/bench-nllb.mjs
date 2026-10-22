// One-off benchmark for the local NLLB translation engine: cold load time,
// warm per-synopsis latency and a quality sample against a REAL synopsis.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { pipeline, env } = await import('@huggingface/transformers');
env.localModelPath = path.join(ROOT, 'models');
env.allowRemoteModels = false;

const synopsis = 'Light Yagami is a genius high school student who is about to learn about life through a book of death. When a bored shinigami, a God of Death, named Ryuk drops a black notepad called a Death Note, Light receives power over life and death with the stroke of a pen. Determined to use this dark gift for the best, Light sets out to rid the world of evil.';
const longer = 'They say whatever doesn\u2019t kill you makes you stronger, but that\u2019s not the case for the world\u2019s weakest hunter Seong Jin-U. After being brutally slaughtered by monsters in a high-ranking dungeon, Jin-U came back with the System, a program only he could see, that\u2019s leveling him up in every way. Now, he\u2019s inspired to discover the secrets behind his powers and the dungeon that spawned them. The Verdict: Solo Leveling is a dark fantasy about a hero who starts at the very bottom and claws his way up.';

const t0 = Date.now();
const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype: 'q8' });
console.log(`cold load: ${((Date.now() - t0) / 1000).toFixed(1)}s | peakRSS ${Math.round(process.memoryUsage().rss / 1048576)}MB`);

const run = async (label, text) => {
  const a = Date.now();
  const [output] = await translator(text, { src_lang: 'eng_Latn', tgt_lang: 'pes_Arab', max_new_tokens: 480 });
  console.log(`--- ${label}: ${((Date.now() - a) / 1000).toFixed(1)}s | rss ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
  console.log(output.translation_text);
};
await run('synopsis', synopsis);
await run('longer', longer);
process.exit(0);
