// Writes our German texts (translations/de.json) into Documenso's compiled
// message catalogs. Runs while the image is built, see the Dockerfile.
//
// Documenso ships its translations compiled into the build, one catalog per
// language and per side: the browser's in build/client/assets, the server's in
// build/server/assets and, for the server that renders the mails, in
// build/server/hono/packages/lib/translations. Each is a JSON object with
// Lingui's message IDs as keys, inside JSON.parse(`...`) or JSON.parse("..."). The ID is a hash of the English text and its
// context, so it is computed here from "en" rather than written down.
//
// Every entry carries the German it replaces ("was"). If that is no longer what
// the catalog holds, Documenso has changed the text since, and the build stops
// rather than overwrite a text nobody has looked at: an update of Documenso
// means going through the entries that stopped it. "was" empty means the text
// had no German yet.
//
//   node apply-translations.mjs <build directory> <translations/de.json>

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// Lingui's own helpers, from the image's node_modules: the working directory
// is /app, the script itself lies elsewhere.
const require = createRequire(join(process.cwd(), "package.json"));
const { generateMessageId } = require("@lingui/message-utils/generateMessageId");
const { compileMessage } = require("@lingui/message-utils/compileMessage");

const [buildDir, entriesFile] = process.argv.slice(2);
if (!buildDir || !entriesFile) {
  console.error("usage: node apply-translations.mjs <build directory> <translations/de.json>");
  process.exit(2);
}
const entries = JSON.parse(readFileSync(entriesFile, "utf8"));

// The two ways a catalog is written into the code. In a template literal \ `
// and ${ come escaped; a string in double quotes is JSON's own string syntax,
// except that the build writes some characters as \uXXXX that JSON.stringify
// leaves as they are (the narrow space in "z. B." for one), so the way back
// writes exactly those the same way. encode gets the original to learn which.
const FORMS = [
  {
    pattern: /JSON\.parse\(`((?:[^`\\]|\\.)*)`\)/g,
    decode: s => s.replace(/\\([\\`$])/g, "$1"),
    encode: s => s.replace(/[\\`]/g, m => "\\" + m).replace(/\$\{/g, "\\${"),
    wrap: s => `JSON.parse(\`${s}\`)`,
  },
  {
    pattern: /JSON\.parse\("((?:[^"\\]|\\.)*)"\)/g,
    decode: s => JSON.parse(`"${s}"`),
    encode: (s, original) => {
      const escaped = new Set([...original.matchAll(/(?<!\\)\\u([0-9A-Fa-f]{4})/g)].map(m => m[1]));
      let out = JSON.stringify(s).slice(1, -1);
      for (const hex of escaped) out = out.split(String.fromCharCode(parseInt(hex, 16))).join("\\u" + hex);
      return out;
    },
    wrap: s => `JSON.parse("${s}")`,
  },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(m?js)$/.test(name)) yield path;
  }
}

// The German catalog is the one that holds the German an entry replaces.
// "Unterschreiben" for the action verb "Sign" tells it apart from the other
// languages even where every entry already has its new text.
const MARKER = { id: generateMessageId("Sign", "Recipient role action verb"), de: compileMessage("Unterschreiben") };

const prepared = entries.map(e => ({
  ...e,
  id: generateMessageId(e.en, e.context || ""),
  was: e.was ? compileMessage(e.was) : null,
  de: compileMessage(e.de),
  enCompiled: compileMessage(e.en),
}));

let catalogs = 0;
const problems = [];
for (const path of files(buildDir)) {
  const source = readFileSync(path, "utf8");
  if (!source.includes("JSON.parse(")) continue;
  let changed = false;
  let result = source;
  for (const form of FORMS) result = result.replace(form.pattern, (whole, literal) => {
    let messages;
    try { messages = JSON.parse(form.decode(literal)); } catch { return whole; }
    if (!messages || !same(messages[MARKER.id], MARKER.de)) return whole;
    // The way back has to give exactly what was there, or this is not
    // understood well enough to touch.
    if (form.encode(JSON.stringify(messages), literal) !== literal) {
      problems.push(`${path}: the catalog does not come back byte for byte, not touched`);
      return whole;
    }
    catalogs++;
    for (const e of prepared) {
      const now = messages[e.id];
      const expected = e.was === null ? [undefined, e.enCompiled] : [e.was];
      if (!expected.some(x => same(now, x)) && !same(now, e.de)) {
        problems.push(`${path}: "${e.en}" reads ${JSON.stringify(now)}, expected ${JSON.stringify(e.was)}`);
        continue;
      }
      messages[e.id] = e.de;
    }
    changed = true;
    return form.wrap(form.encode(JSON.stringify(messages), literal));
  });
  if (changed) writeFileSync(path, result);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
// The browser's, the server's and the mail server's: finding fewer means the
// build has changed shape and some German would stay as it was.
if (catalogs < 3) {
  console.error(`Found ${catalogs} German catalog(s), expected the browser's, the server's and the mail server's.`);
  process.exit(1);
}
console.log(`${prepared.length} texts written into ${catalogs} German catalogs.`);
