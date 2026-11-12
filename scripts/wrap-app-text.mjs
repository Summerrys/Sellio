// Wraps the English a screen shows in t() for the owner app's translations (src/lib/appText.js),
// so a group of screens can move to Bahasa Indonesia in one go. It edits only the characters it
// changes; the rest of each file stays as it was. Then read what it reports: phrases built from
// pieces (an "s" added for plurals, lists kept outside a component) still need a hand.
//
//   node scripts/wrap-app-text.mjs src/pages/Auth.jsx src/components/onboarding/*.jsx
//   node scripts/wrap-app-text.mjs --dry src/pages/Auth.jsx    (report only)
//
// What it changes:
// - JSX text, joined with the values beside it into one phrase with {blanks}:
//   <p>Hi {name}, welcome</p> -> <p>{t('Hi {name}, welcome', { name })}</p>; a value in an
//   inline tag stays in the sentence: with <b>{email}</b> now -> t('with {email} now', { email: <b>…</b> }).
// - On-screen attributes (placeholder, title, aria-label, alt, label…) and string choices
//   inside JSX ({open ? 'Open' : 'Closed'}).
// - toast(…) messages, set…Error(…) messages, confirm(…) and alert(…), and on-screen keys
//   (title, label, description…) of objects built inside a component.
// - Lists outside a component get N_('…') (marked only); the screen that shows them must pass
//   them through t(): these are reported.
// A component that shows a phrase gets `const { t } = useAppText();` as its first line. In a file
// that already has something called t (the store page's own t, say), phrases use appT() and the
// component gets `useAppText();` so it still follows a change of language.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const babelParser = require('@babel/parser');

const UI_ATTRS = new Set(['aria-label', 'placeholder', 'label', 'title', 'alt', 'description', 'hint', 'detail', 'text', 'eyebrow',
  'intro', 'emptyText', 'emptyMessage', 'recommendation', 'note', 'badge', 'actionLabel', 'saveLabel', 'subtitle', 'heading',
  'message', 'confirmLabel', 'cancelLabel', 'confirmText', 'cancelText', 'tooltip', 'buttonText', 'ctaLabel', 'loadingText', 'helperText',
  'sectionTitle', 'sectionSubtitle', 'question', 'answer', 'caption', 'prompt', 'summary']);
const UI_KEYS = new Set(['title', 'description', 'label', 'content', 'text', 'question', 'answer', 'eyebrow', 'copy', 'body', 'subtitle',
  'sectionTitle', 'sectionSubtitle', 'message', 'hint', 'placeholder', 'emptyText', 'cta', 'ctaLabel', 'detail', 'note', 'intro', 'heading',
  'tooltip', 'badge', 'actionLabel', 'caption', 'helper', 'summary']);
// Only messages: a status or a code the program compares against must stay as it is.
const SETTER = /^set([A-Z]\w*)?(Error|Message|Notice|Hint|Warning|Note|Problem|Feedback)$/;
const TOAST_METHODS = new Set(['success', 'error', 'info', 'warning', 'message', 'loading']);
// Names that read the same in Indonesian are left unwrapped.
const AS_IS = new Set(['Sellio', 'Google', 'Apple', 'Stripe', 'WhatsApp', 'PayNow', 'DuitNow', 'QRIS', 'Starter', 'Growth', 'Pro', 'OK',
  'SGD', 'MYR', 'IDR', 'S$', 'RM', 'Rp', 'Apptélier', 'Email', 'Menu', 'Total', 'Subtotal', 'Instagram', 'TikTok', 'Facebook']);
const INLINE_TAGS = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 'code', 'small', 'mark', 'bdi']);
const hasWords = (s) => /[A-Za-z]{2,}/.test(s) && !AS_IS.has(s.trim())
  && !/^\s*([\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+|www\.\S+|\/[\w/.-]*)\s*$/.test(s); // emails, links, paths stay
// In code (not on screen), one lowercase word is more likely a value the program checks ('true', 'saving').
const looksLikeCode = (s) => /^[a-z0-9_.:-]+$/.test(s.trim());
const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

// Babel's own rule for the text a JSX child shows (cleanJSXElementLiteralChild).
function cleanJSXText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmptyLine = 0;
  lines.forEach((line, i) => { if (/[^ \t]/.test(line)) lastNonEmptyLine = i; });
  let str = '';
  lines.forEach((line, i) => {
    let trimmed = line.replace(/\t/g, ' ');
    if (i !== 0) trimmed = trimmed.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) trimmed = trimmed.replace(/[ ]+$/, '');
    if (trimmed) str += i !== lastNonEmptyLine ? `${trimmed} ` : trimmed;
  });
  return str;
}

const isTCall = (node) => node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['t', 'appT'].includes(node.callee.name);
function isSimple(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Identifier': return node.name !== 'undefined';
    case 'NumericLiteral': return true;
    case 'MemberExpression': case 'OptionalMemberExpression':
      return isSimple(node.object) || node.object.type === 'ThisExpression';
    case 'CallExpression': case 'OptionalCallExpression':
      if (isTCall(node)) return false;
      return (node.callee.type === 'Identifier' || ((node.callee.type === 'MemberExpression' || node.callee.type === 'OptionalMemberExpression') && isSimple(node.callee.object)))
        && node.arguments.every((a) => isSimple(a) || a.type === 'StringLiteral' || a.type === 'NumericLiteral' || a.type === 'ObjectExpression');
    case 'BinaryExpression': return ['+', '-', '*', '/', '%'].includes(node.operator) && isSimple(node.left) && (isSimple(node.right) || node.right.type === 'NumericLiteral');
    default: return false;
  }
}

function blankName(node, used) {
  let base = 'value';
  if (node.type === 'Identifier') base = node.name;
  else if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    base = node.property.type === 'Identifier' ? node.property.name : 'value';
    if (base === 'length') base = 'count';
  } else if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    const callee = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property?.name || 'value';
    if (/format|money|price|amount|currency/i.test(callee) && node.arguments[0]) return blankName(node.arguments[0], used);
    base = callee.replace(/^(get|format|to)/, '').replace(/^[A-Z]/, (c) => c.toLowerCase()) || 'value';
    if (['localeString', 'fixed', 'string', 'upperCase', 'lowerCase', 'trim'].includes(base)) base = node.callee.object ? blankName(node.callee.object, new Set()) : 'value';
  } else if (node.type === 'BinaryExpression') base = 'count';
  else if (node.type === 'JSXIdentifier') base = node.name;
  base = base.replace(/[^a-zA-Z0-9_]/g, '') || 'value';
  let name = base; let i = 2;
  while (used.has(name)) name = `${base}${i++}`;
  used.add(name);
  return name;
}

function walk(node, ancestors, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, ancestors);
  ancestors.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'extra' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, ancestors, visit));
    else if (value && typeof value.type === 'string') walk(value, ancestors, visit);
  }
  ancestors.pop();
}

function bindsT(ast) {
  let found = false;
  const check = (pattern) => {
    if (!pattern || found) return;
    if (pattern.type === 'Identifier') { if (pattern.name === 't') found = true; return; }
    if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => check(p.type === 'RestElement' ? p.argument : p.value));
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(check);
    else if (pattern.type === 'AssignmentPattern') check(pattern.left);
    else if (pattern.type === 'RestElement') check(pattern.argument);
  };
  walk(ast.program, [], (node) => {
    if (node.type === 'VariableDeclarator') check(node.id);
    else if (/Function/.test(node.type)) (node.params || []).forEach(check);
    else if (node.type === 'CatchClause') check(node.param);
    else if (node.type === 'ImportSpecifier' && node.local.name === 't') found = true;
  });
  return found;
}

// The component a node sits in: the nearest function that is one.
function componentOf(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (!/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) continue;
    const parent = ancestors[i - 1];
    if (node.type === 'FunctionDeclaration' && node.id && /^[A-Z]/.test(node.id.name)) return node;
    if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' && /^[A-Z]/.test(parent.id.name)) return node;
    if (parent?.type === 'CallExpression') {
      const callee = parent.callee;
      const name = callee.type === 'Identifier' ? callee.name : callee.property?.name;
      if (['memo', 'forwardRef'].includes(name)) return node;
    }
    if (parent?.type === 'ExportDefaultDeclaration') return node;
  }
  return null;
}
const insideFunction = (ancestors) => ancestors.some((node) => /Function/.test(node.type));

function processFile(file, code) {
  const ast = babelParser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const appTMode = bindsT(ast);
  const report = [];
  const edits = []; // { start, end, text }
  const components = new Set();
  let usedAppT = false; let usedN = false; let changed = 0;
  const src = (node) => code.slice(node.start, node.end);
  const lineOf = (node) => node?.loc?.start?.line ?? '?';

  const fnFor = (ancestors) => {
    const component = componentOf(ancestors);
    if (component) components.add(component);
    if (component && !appTMode) return 't';
    usedAppT = true;
    return 'appT';
  };
  const phraseCall = (fn, phrase, blanks) => {
    const vars = blanks.length
      ? `, { ${blanks.map(({ name, node }) => (src(node) === name ? name : `${name}: ${src(node)}`)).join(', ')} }`
      : '';
    return `${fn}(${quote(phrase)}${vars})`;
  };
  // A space at either end of the English stays outside the phrase: 'Done. ' -> t('Done.') + ' '.
  const spaced = (raw, call) => `${/^\s/.test(raw) ? "' ' + " : ''}${call}${/\s$/.test(raw) ? " + ' '" : ''}`;

  function templatePhrase(node) {
    if (node.type !== 'TemplateLiteral' || !node.expressions.every(isSimple)) return null;
    const used = new Set(); const blanks = [];
    let phrase = '';
    node.quasis.forEach((q, i) => {
      phrase += q.value.cooked;
      if (i < node.expressions.length) {
        const name = blankName(node.expressions[i], used);
        blanks.push({ name, node: node.expressions[i] });
        phrase += `{${name}}`;
      }
    });
    return hasWords(phrase) ? { phrase: phrase.replace(/\s+/g, ' ').trim(), blanks, raw: node.quasis.map((q) => q.value.cooked).join('x') } : null;
  }

  // Wraps the strings an expression shows.
  function wrapString(node, ancestors, onScreen = true) {
    if (!node) return;
    if (node.type === 'StringLiteral') {
      if (!onScreen && looksLikeCode(node.value)) return;
      if (!hasWords(node.value)) return;
      changed++;
      edits.push({ start: node.start, end: node.end, text: spaced(node.value, phraseCall(fnFor(ancestors), node.value.replace(/\s+/g, ' ').trim(), [])) });
    } else if (node.type === 'TemplateLiteral') {
      const tpl = templatePhrase(node);
      if (!tpl) return;
      changed++;
      edits.push({ start: node.start, end: node.end, text: spaced(tpl.raw, phraseCall(fnFor(ancestors), tpl.phrase, tpl.blanks)) });
    } else if (node.type === 'ConditionalExpression') {
      wrapString(node.consequent, ancestors, onScreen);
      wrapString(node.alternate, ancestors, onScreen);
    } else if (node.type === 'LogicalExpression' && ['||', '??', '&&'].includes(node.operator)) {
      wrapString(node.right, ancestors, onScreen);
    }
  }

  const isPluralSuffix = (node) => node.type === 'ConditionalExpression'
    && [node.consequent, node.alternate].every((x) => x.type === 'StringLiteral' && x.value.length <= 3);
  // <strong>{name}</strong> inside a sentence stays in it, as a {blank}.
  const isValueElement = (node) => node.type === 'JSXElement' && node.openingElement.name.type === 'JSXIdentifier'
    && INLINE_TAGS.has(node.openingElement.name.name)
    && !node.openingElement.attributes.some((a) => a.type === 'JSXAttribute' && UI_ATTRS.has(a.name.name))
    && node.children.every((c) => (c.type === 'JSXText' && !/\S/.test(c.value)) || (c.type === 'JSXExpressionContainer' && isSimple(c.expression)))
    && node.children.some((c) => c.type === 'JSXExpressionContainer');

  function convertRun(run, ancestors) {
    const used = new Set(); const blanks = [];
    let message = ''; let words = false;
    for (const child of run) {
      if (child.type === 'JSXText') {
        const text = cleanJSXText(child.value);
        if (hasWords(text)) words = true;
        message += text;
      } else if (child.type === 'JSXElement') {
        const inner = child.children.find((c) => c.type === 'JSXExpressionContainer' && isSimple(c.expression));
        const name = blankName(inner ? inner.expression : child.openingElement.name, used);
        blanks.push({ name, node: child });
        message += `{${name}}`;
      } else if (child.expression.type === 'StringLiteral') {
        if (hasWords(child.expression.value)) words = true;
        message += child.expression.value;
      } else {
        const name = blankName(child.expression, used);
        blanks.push({ name, node: child.expression });
        message += `{${name}}`;
      }
    }
    if (!words) return;
    const original = code.slice(run[0].start, run[run.length - 1].end);
    // Line breaks around the text stay where they were.
    const head = (original.match(/^[ \t]*\r?\n\s*/) || [''])[0];
    const tail = (original.match(/\r?\n\s*$/) || [''])[0];
    const lead = /^\s/.test(message); const trail = /\s$/.test(message);
    const phrase = message.replace(/\s+/g, ' ').trim();
    changed++;
    // A space at either end is one the screen shows (line breaks were already dropped): it stays.
    const text = `${head}${lead ? "{' '}" : ''}{${phraseCall(fnFor(ancestors), phrase, blanks)}}${trail ? "{' '}" : ''}${tail}`;
    edits.push({ start: run[0].start, end: run[run.length - 1].end, text });
  }

  function processChildren(node, ancestors) {
    const tag = node.openingElement?.name?.name;
    if (tag === 'style' || tag === 'script') return; // CSS and code, not words
    let run = [];
    const flush = () => { if (run.length) convertRun(run, ancestors); run = []; };
    for (const child of node.children) {
      if (child.type === 'JSXText') run.push(child);
      else if (child.type === 'JSXExpressionContainer' && (child.expression.type === 'StringLiteral' || isSimple(child.expression))) run.push(child);
      else if (isValueElement(child)) run.push(child);
      else {
        flush();
        if (child.type === 'JSXExpressionContainer' && child.expression.type !== 'JSXEmptyExpression') {
          if (isPluralSuffix(child.expression)) report.push(`${file}:${lineOf(child)}: a plural ending ({… ? '' : 's'}): write the whole phrase for each case`);
          else wrapString(child.expression, [...ancestors, child]);
        }
      }
    }
    flush();
  }

  walk(ast.program, [], (node, ancestors) => {
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      processChildren(node, [...ancestors, node]);
    } else if (node.type === 'JSXAttribute') {
      const name = node.name.type === 'JSXNamespacedName' ? `${node.name.namespace.name}:${node.name.name.name}` : node.name.name;
      if (UI_ATTRS.has(name) && node.value) {
        if (node.value.type === 'StringLiteral' && hasWords(node.value.value)) {
          changed++;
          edits.push({ start: node.value.start, end: node.value.end, text: `{${phraseCall(fnFor(ancestors), node.value.value.replace(/\s+/g, ' ').trim(), [])}}` });
        } else if (node.value.type === 'JSXExpressionContainer' && node.value.expression.type !== 'JSXEmptyExpression') {
          wrapString(node.value.expression, [...ancestors, node]);
        }
      }
    } else if (node.type === 'CallExpression') {
      const { callee } = node;
      const args = node.arguments;
      const isToast = (callee.type === 'Identifier' && callee.name === 'toast')
        || (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'toast' && TOAST_METHODS.has(callee.property.name));
      const isSetter = callee.type === 'Identifier' && SETTER.test(callee.name);
      const isDialog = (callee.type === 'Identifier' && ['confirm', 'alert'].includes(callee.name))
        || (callee.type === 'MemberExpression' && callee.object.name === 'window' && ['confirm', 'alert'].includes(callee.property.name));
      if ((isToast || isSetter || isDialog) && args[0]) {
        wrapString(args[0], [...ancestors, node], !isSetter);
        if (isToast && args[1]?.type === 'ObjectExpression') {
          for (const prop of args[1].properties) {
            if (prop.type === 'ObjectProperty' && ['description', 'title'].includes(prop.key.name)) wrapString(prop.value, [...ancestors, node]);
          }
        }
      }
    } else if (node.type === 'ObjectProperty' && !node.computed) {
      const key = node.key.type === 'Identifier' ? node.key.name : node.key.value;
      const value = node.value;
      if (UI_KEYS.has(key) && ['StringLiteral', 'TemplateLiteral', 'ConditionalExpression'].includes(value.type)) {
        if (!insideFunction(ancestors)) {
          if (value.type === 'StringLiteral' && hasWords(value.value) && /\s|^[A-Z]/.test(value.value)) {
            usedN = true; changed++;
            edits.push({ start: value.start, end: value.end, text: `N_(${quote(value.value.replace(/\s+/g, ' ').trim())})` });
            report.push(`${file}:${lineOf(value)}: marked N_('${value.value.slice(0, 50)}') outside a component: pass it through t() where it shows`);
          }
        } else {
          wrapString(value, [...ancestors, node], false);
        }
      }
    }
  });

  if (!changed) return { code, report, changed };

  // The hook in each component that shows a phrase.
  for (const fn of components) {
    const hook = appTMode ? 'useAppText();' : 'const { t } = useAppText();';
    if (code.slice(fn.body.start, fn.body.end).includes('useAppText(')) continue;
    if (fn.body.type === 'BlockStatement') {
      const first = fn.body.body[0];
      const indent = first ? (code.slice(0, first.start).match(/[ \t]*$/) || [''])[0] : '  ';
      edits.push({ start: fn.body.start + 1, end: fn.body.start + 1, text: `\n${indent}${hook}` });
    } else {
      edits.push({ start: fn.body.start, end: fn.body.start, text: `{ ${hook} return (` });
      edits.push({ start: fn.body.end, end: fn.body.end, text: '); }' });
    }
  }

  // The import.
  const names = [components.size ? 'useAppText' : null, usedAppT ? 'appT' : null, usedN ? 'N_' : null].filter(Boolean);
  const source = /src\/lib\//.test(file) ? './appText' : '@/lib/appText';
  const imports = ast.program.body.filter((s) => s.type === 'ImportDeclaration');
  const existing = imports.find((s) => /appText$/.test(s.source.value));
  if (existing) {
    const have = existing.specifiers.map((s) => s.imported?.name).filter(Boolean);
    const all = [...have, ...names.filter((name) => !have.includes(name))];
    edits.push({ start: existing.start, end: existing.end, text: `import { ${all.join(', ')} } from '${existing.source.value}';` });
  } else if (names.length) {
    const at = imports.length ? imports[imports.length - 1].end : 0;
    edits.push({ start: at, end: at, text: `${at ? '\n' : ''}import { ${names.join(', ')} } from '${source}';${at ? '' : '\n'}` });
  }

  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i].start < edits[i - 1].end) throw new Error(`overlapping changes near line ${code.slice(0, edits[i].start).split('\n').length}`);
  }
  let out = code;
  for (const edit of [...edits].reverse()) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  if (appTMode) report.push(`${file}: something else is called t here, so phrases use appT()`);
  return { code: out, report, changed };
}

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const files = argv.filter((a) => !a.startsWith('--'));
let total = 0;
for (const file of files) {
  const code = await readFile(file, 'utf8');
  try {
    const result = processFile(file, code);
    total += result.changed;
    if (!dry && result.code !== code) await writeFile(file, result.code);
    console.log(`${file}: ${result.changed} phrase(s)`);
    for (const line of result.report) console.log(`  ${line}`);
  } catch (error) {
    console.error(`${file}: not changed (${error.message})`);
  }
}
console.log(`${total} phrase(s) wrapped in ${files.length} file(s).`);
