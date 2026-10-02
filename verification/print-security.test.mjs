import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const jsdomRequire = createRequire((process.env.SELLIO_VERIFICATION_DIR || '/tmp/sellio-security-verification') + '/package.json');
const { JSDOM } = jsdomRequire('jsdom');
const utility = fs.readFileSync('src/lib/printSafety.js', 'utf8').replace(/export /g, '');
const scope = { URL };
vm.runInNewContext(utility + ';this.escapePrintHtml=escapePrintHtml;this.printImageSrc=printImageSrc;',scope);
const evil = '<img src=x onerror="window.stolen=1"><script>window.stolen=1</script> & " café';
const dangerousImage = 'https://example.com/qr.png" onerror="window.stolen=1';
function walk(node,visit) { if(!node || typeof node !== 'object') return; if(node.type)visit(node); for(const value of Object.values(node)) { if(Array.isArray(value))value.forEach(x=>walk(x,visit)); else if(value && typeof value === 'object')walk(value,visit); } }
function extract(path, name) {
 const source=fs.readFileSync(path,'utf8'); const ast=parse(source,{sourceType:'module',plugins:['jsx']});let found;
 walk(ast,n=>{ if(name && n.type==='FunctionDeclaration' && n.id?.name===name)found=n;
  if(name && n.type==='VariableDeclarator' && n.id?.name===name)found=n.init;
  if(!name && n.type==='JSXAttribute' && n.name?.name==='onClick' && n.value?.expression?.body?.type==='BlockStatement' && source.slice(n.value.expression.body.start,n.value.expression.body.end).includes('.document.write(')) found=n.value.expression;
 }); assert.ok(found,path+' has print handler'); return source.slice(found.start,found.end);
}
async function render(path,name) {
 let html=''; const record={id:'table1',name:evil,capacity:evil}; const window={open:()=>({document:{write:s=>html+=s,close(){}},print(){}})};
 const context={...scope, window, setTimeout(){}, tenant:{name:evil},table:record,qrModalTable:record,selectedQR:record,qrCodes:{table1:dangerousImage,single:dangerousImage},
  canvasRef:{current:{toDataURL:()=>dangerousImage}},singleQrLabel:evil,tables:[record],setIsProcessing(){},setQRModalOpen(){},generateAllQRs:async()=>[{table:record,dataUrl:dangerousImage}],toast:{error(){}},console};
 const fn=vm.runInNewContext('('+extract(path,name)+')',context);
 if(name==='printReceipt')fn({id:'123456',order_number:evil,table_name:evil,customer_name:evil,items:[{name:evil,variant:evil,quantity:evil,price:2}],subtotal:2,total_amount:2,created_date:'2026-10-02'},evil,evil);
 else await fn();
 return html;
}
function assertSafe(html) { const dom=new JSDOM(html);const d=dom.window.document;
 assert.equal(d.querySelectorAll('[onerror], [onclick], [onload]').length,0);
 assert.equal(d.querySelectorAll('script').length,html.includes('window.onload=()=>window.print()')?1:0);
 assert.ok(d.body.textContent.includes(evil),'record label remains literal text');
 for(const img of d.querySelectorAll('img'))assert.ok(!img.hasAttribute('onerror'));
 dom.window.close();
}
test('print text preserves Unicode and neutralizes markup',()=> {const d=new JSDOM('<div>'+scope.escapePrintHtml(evil)+'</div>');assert.equal(d.window.document.querySelector('div').textContent,evil);assert.equal(d.window.document.querySelectorAll('img,script').length,0);d.window.close();});
test('print images reject executable and SVG URLs',()=> {for(const src of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,PHNjcmlwdD4=','http://example.com/x','relative.png'])assert.equal(scope.printImageSrc(src),'');assert.equal(scope.printImageSrc('data:image/png;base64,aGVsbG8='),'data:image/png;base64,aGVsbG8=');});
for(const [path,name] of [['src/pages/Orders.jsx','printReceipt'],['src/pages/Tables.jsx',null],['src/components/tables/QRCodeGenerator.jsx','printQR'],['src/components/tables/BulkQRActions.jsx','printAllQRs'],['src/components/onboarding/Step4TablesQR.jsx','handlePrintSingleQR'],['src/components/onboarding/Step4TablesQR.jsx',null]])test(path+' '+(name||'table print')+' treats malicious fields as text',async()=>assertSafe(await render(path,name)));
test('unused passwordless auth helpers are retired',()=> {const s=fs.readFileSync('src/lib/db.js','utf8');const ast=parse(s,{sourceType:'module'});const forbidden=[];walk(ast,n=>{if(n.type==='ObjectProperty' && n.key?.name==='auth')for(const m of n.value.properties||[])if(['login','logout','isAuthenticated','updateMe'].includes(m.key?.name))forbidden.push(m.key.name);});assert.deepEqual(forbidden,[]);});
