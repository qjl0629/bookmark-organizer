// Semantic embedder: turns a short text into a 256-number vector so that texts about the
// same thing end up close together ("Power Automate flows" and "cloud flow connectors").
//
// The model is static: each word piece has one fixed vector and a text is the average of its
// pieces. Tokenizing follows the BERT recipe the model was trained with (lowercase, strip
// accents, split punctuation, split Chinese characters, WordPiece). It runs entirely in this
// file with no network, no WebAssembly and no dependencies.
//
// Pure and synchronous once created, so it can be tested in Node. Loading the model files
// lives in model-loader.js.

const MAX_TOKENS = 512;

// Ideographs the BERT normalizer puts spaces around, so each is its own word.
const isCjk = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f);

const isAsciiPunct = (cp) => (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126);
const UNICODE_PUNCT = /^\p{P}$/u;
const isPunct = (ch) => isAsciiPunct(ch.codePointAt(0)) || UNICODE_PUNCT.test(ch);

// BertNormalizer: clean text, space out Chinese, strip accents, lowercase.
function normalize(text) {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0 || cp === 0xfffd) continue;
    if (ch === "\t" || ch === "\n" || ch === "\r" || /^\s$/u.test(ch)) {
      out += " ";
    } else if (/^\p{C}$/u.test(ch)) {
      continue;
    } else if (isCjk(cp)) {
      out += ` ${ch} `;
    } else {
      out += ch;
    }
  }
  return out.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
}

// BertPreTokenizer: split on whitespace, and put every punctuation mark on its own.
function splitWords(text) {
  const words = [];
  let current = "";
  const flush = () => {
    if (current) words.push(current);
    current = "";
  };
  for (const ch of text) {
    if (ch === " ") flush();
    else if (isPunct(ch)) {
      flush();
      words.push(ch);
    } else current += ch;
  }
  flush();
  return words;
}

export function createEmbedder({ vocabText, embeddings, scales, meta }) {
  const dim = meta.dim;
  const prefix = meta.continuingSubwordPrefix ?? "##";
  const maxChars = meta.maxCharsPerWord ?? 100;
  const unkId = meta.unkId;

  const vocab = new Map();
  vocabText.split("\n").forEach((token, id) => {
    if (id < meta.rows) vocab.set(token, id);
  });
  if (vocab.size !== meta.rows) throw new Error(`Model vocabulary has ${vocab.size} entries, expected ${meta.rows}.`);
  if (embeddings.length !== meta.rows * dim) throw new Error("Model embeddings have the wrong size.");

  // WordPiece: longest known piece first. A word with any unknown part becomes [UNK] and is dropped.
  function wordPieces(word) {
    const chars = Array.from(word);
    if (chars.length > maxChars) return [unkId];
    const ids = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found = null;
      while (start < end) {
        const piece = (start > 0 ? prefix : "") + chars.slice(start, end).join("");
        if (vocab.has(piece)) {
          found = vocab.get(piece);
          break;
        }
        end--;
      }
      if (found === null) return [unkId];
      ids.push(found);
      start = end;
    }
    return ids;
  }

  function tokenize(text) {
    const ids = [];
    for (const word of splitWords(normalize(String(text ?? "")))) {
      for (const id of wordPieces(word)) if (id !== unkId) ids.push(id);
    }
    return ids.slice(0, MAX_TOKENS);
  }

  const cache = new Map();
  // Unit-length vector, or null when nothing in the text is known to the model.
  function embed(text) {
    const key = String(text ?? "");
    if (cache.has(key)) return cache.get(key);
    const ids = tokenize(key);
    let result = null;
    if (ids.length) {
      const sum = new Float32Array(dim);
      for (const id of ids) {
        const scale = scales[id];
        const base = id * dim;
        for (let d = 0; d < dim; d++) sum[d] += embeddings[base + d] * scale;
      }
      let norm = 0;
      for (let d = 0; d < dim; d++) norm += sum[d] * sum[d];
      norm = Math.sqrt(norm);
      if (norm > 1e-9) {
        for (let d = 0; d < dim; d++) sum[d] /= norm;
        result = sum;
      }
    }
    cache.set(key, result);
    return result;
  }

  return { dim, tokenize, embed };
}

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
