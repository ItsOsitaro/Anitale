// RAM/latency sweep variants: argv = [_, filter, dtype, beams, trim?]
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pipeline, env } = await import('@huggingface/transformers');
env.localModelPath = path.join(ROOT, 'models');
env.allowRemoteModels = false;

const synopsis = 'Light Yagami is a genius high school student who is about to learn about life through a book of death. When a bored shinigami, a God of Death, named Ryuk drops a black notepad called a Death Note, Light receives power over life and death with the stroke of a pen. Determined to use this dark gift for the best, Light sets out to rid the world of evil.';
const concat = (text) => `${text} ${text}`;

const dtype = process.argv[3] || 'q8';
const num_beams = Number(process.argv[4] || 1);
const trim = process.argv[5] === 'trim';

let t0 = Date.now();
const sopts = trim ? { intra_op_num_threads: 2, enableCpuMemArena: false } : undefined;
const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', { dtype, ...(sopts ? { session_options: sopts } : {}) });
console.log(`[${dtype}/beams=${num_beams}${trim ? '+trim' : ''}] load ${((Date.now() - t0) / 1000).toFixed(1)}s rss ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
t0 = Date.now();
const [output] = await translator(synopsis, {
  src_lang: 'eng_Latn',
  tgt_lang: 'pes_Arab',
  num_beams,
  max_new_tokens: 480,
  repetition_penalty: 1.15,
  no_repeat_ngram_size: 4,
});
console.log(`[${dtype}/beams=${num_beams}${trim ? '+trim' : ''}] translate ${((Date.now() - t0) / 1000).toFixed(1)}s rss ${Math.round(process.memoryUsage().rss / 1048576)}MB`);
console.log(output.translation_text);
process.exit(0);
