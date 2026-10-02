// Real Counter interactions against isolated catalogue, checkout and printer fixtures.
// Run: node verification/counter.test.mjs /tmp/sellio-verification
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const app = process.cwd();
const require = createRequire(path.join(process.argv[2] || app, 'package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://sellio.example.invalid', pretendToBeVisual: true });
for (const key of ['window','document','Element','HTMLElement','Node','Event','MouseEvent','MutationObserver','sessionStorage','localStorage','getComputedStyle','navigator','DOMParser']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'innerWidth', {value:412,configurable:true,writable:true});
const React = await import('react');
const act = React.act || (await import('react-dom/test-utils')).act;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const tmp = await mkdtemp(path.join(app, '.counter-verification-'));
const fixtures = {
  products: [
    { id: 'drink', name: 'Americano', price: 3.5, category_id: 'drinks', variants: [
      { name: 'Size', type: 'size', options: [{label:'Small',price_modifier:0},{label:'Medium',price_modifier:1}] },
      { name: 'Temperature', type: 'other', options: [{label:'Hot',price_modifier:0},{label:'Cold',price_modifier:2}] },
      { name: 'Extras', type: 'addon', options: [{label:'Cream',price_modifier:.5},{label:'Sugar',price_modifier:0}] },
    ]},
    { id:'bread',name:'Toast',price:2,category_id:'drinks',variants:[] },
    { id:'rice',name:'Rice',price:4,category_id:'drinks',variants:[{name:'Toppings',type:'addon',options:[{label:'Egg',price_modifier:1}]}]},
  ], categories:[{id:'drinks',name:'Menu'}],
};
globalThis.__tenant = { tenantId:'counter-test', tenant:{id:'counter-test',name:'Fixture shop',currency:'SGD'}, user:{id:'cashier-fixture'},hasPermission:()=>true };
globalThis.__toasts = [];
globalThis.__prints = [];
let failSend = false, resolveSend, holdSend = false;
const requests=[];
globalThis.__client = {
  from: table => { const query = {}; for (const name of ['select','eq','gte','order','limit','update','in','neq']) query[name]=()=>query;
    query.then=resolve=>Promise.resolve({ data:table==='tables'?[{id:'t1',name:'Table 1',zone:'Main'}]:[],error:null }).then(resolve);return query; },
  rpc:async (name,payload)=>{
    requests.push({name,payload});
    if(failSend) return {error:{message:'Network failed'}};
    if(holdSend) await new Promise(r=>{resolveSend=r;});
    return { data:{ id:'order-fixture', tenant_id:'counter-test',order_number:'ORD-FIXTURE',total_amount:payload.p_items.reduce((s,i)=>s+i.quantity*2,0),payment_status:'unpaid',items:payload.p_items.map(i=>({name:i.product_id,quantity:i.quantity,price:2,variant:i.options.map(x=>x.label).join(', ')})),status:'pending' },error:null };
  },
};
const mocks = { name:'counter-fixtures',setup(b){
  const exports = {
    tenant:'export const useTenant = () => globalThis.__tenant;',
    client:'export const getSupabase = async () => globalThis.__client;',
    permission:'export default function Permission({children}) { return children; }',
    catalog:'export const fetchStorefrontCatalog = async () => globalThis.__catalog;',
    toast:'export const toast={success:(...x)=>globalThis.__toasts.push(x),error:(...x)=>globalThis.__toasts.push(x)};',
    printer:`export const loadPrinterConfig=id=>JSON.parse(localStorage.getItem('sellio_printer_'+id)||'null'); export const buildOrderReceipt=order=>new Uint8Array([1]); export const buildOrderChit=order=>new Uint8Array([2]); export const sendViaBluetooth=async(name,bytes)=>{globalThis.__prints.push({name,kind:bytes[0]});if(globalThis.__printFails)throw Error('Paper out');}; export const sendViaEpsonEPos=sendViaBluetooth;`,
  };
  b.onResolve({filter:/TenantContext$/},()=>({path:'tenant',namespace:'mock'}));
  b.onResolve({filter:/supabaseClient$/},()=>({path:'client',namespace:'mock'}));
  b.onResolve({filter:/RequirePermission$/},()=>({path:'permission',namespace:'mock'}));
  b.onResolve({filter:/storefrontCatalog$/},()=>({path:'catalog',namespace:'mock'}));
  b.onResolve({filter:/^sonner$/},()=>({path:'toast',namespace:'mock'}));
  b.onResolve({filter:/printerUtils$/},()=>({path:'printer',namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:exports[args.path],loader:'jsx'}));
}};
globalThis.__catalog=fixtures;
const bundle=async(relative,plugins=[mocks])=>{
 const outfile=path.join(tmp,relative.replace(/[^a-z0-9]/gi,'_')+'.mjs');
 await build({entryPoints:[path.join(app,relative)],outfile,bundle:true,packages:'external',format:'esm',platform:'node',alias:{'@':path.join(app,'src')},plugins,logLevel:'silent'});
 return import(pathToFileURL(outfile).href);
};
const tick=()=>new Promise(r=>setTimeout(r,5));
const roots=[];
async function mount(Component) {
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);roots.push({root,container});
 await act(async()=>{root.render(React.createElement(MemoryRouter,null,React.createElement(Component)));await tick();});
 return container;
}
const click=async(element)=>act(async()=>{assert.ok(element,'Control exists');element.dispatchEvent(new MouseEvent('click',{bubbles:true}));await tick();});
const button=(container,text)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const option=(container,text)=>[...container.querySelectorAll('.ctr-opt')].find(b=>b.querySelector('.m').textContent===text);
const card=(container,name)=>container.querySelector('article[aria-label="'+name+'"]');
const tap=(container,name)=>click(card(container,name).querySelector('.ctr-item-add'));
const swipe=async(element,dx,dy=0)=>{
 await act(async()=>{
 const start=new Event('touchstart',{bubbles:true});Object.defineProperty(start,'touches',{value:[{clientX:200,clientY:300}]});element.dispatchEvent(start);
 const end=new Event('touchend',{bubbles:true});Object.defineProperty(end,'touches',{value:[]});Object.defineProperty(end,'changedTouches',{value:[{clientX:200+dx,clientY:300+dy}]});element.dispatchEvent(end);await tick();
 });
};
let passes=0;const pass=name=>{passes++;console.log('PASS '+name);};
try{
 const {getCounterOptionGroups,toggleCounterOption,validCounterOptions}=await bundle('src/lib/counterOptions.js',[]);
 const groups=getCounterOptionGroups(fixtures.products[0]);assert.equal(groups[1].multiple,false);assert.equal(groups[2].multiple,true);
 let selections=toggleCounterOption([],groups[1],'Hot');selections=toggleCounterOption(selections,groups[1],'Cold');assert.deepEqual(selections,[{group:'Temperature',label:'Cold'}]);
 assert.equal(validCounterOptions(groups,selections),false);
 assert.equal(validCounterOptions(groups,[{group:'Size',label:'Small'},{group:'Temperature',label:'Cold'},{group:'Temperature',label:'Hot'}]),false);
 assert.equal(validCounterOptions(groups,[{group:'Size',label:'Small'},{group:'Temperature',label:'Hot'},{group:'Extras',label:'Cream'},{group:'Extras',label:'Sugar'}]),true);
 assert.equal(getCounterOptionGroups({price:4,variants:[{size:'Large',price:6}]})[0].options[0].price,2);
 pass('Single, multi, legacy pricing and invalid-selection rules');
 const {default:Counter}=await bundle('src/pages/Counter.jsx');
 const ui=await mount(Counter);await click(button(ui,'Start →')?.closest('button') || ui.querySelector('.ctr-takeaway'));
 await tap(ui,'Americano');assert.ok(ui.querySelector('[aria-label="Options for Americano"]'));assert.equal(ui.querySelector('.ctr-sheet-done').disabled,true);
 await click(option(ui,'Small'));await click(option(ui,'Hot'));await click(option(ui,'Cold'));
 assert.equal(option(ui,'Hot').getAttribute('aria-pressed'),'false');assert.equal(option(ui,'Cold').getAttribute('aria-pressed'),'true');
 await click(option(ui,'Cream'));await click(option(ui,'Sugar'));
 assert.equal(option(ui,'Cream').getAttribute('aria-pressed'),'true');assert.equal(option(ui,'Sugar').getAttribute('aria-pressed'),'true');
 assert.match(ui.querySelector('.ctr-sheet-done').textContent,/6.00/);await click(ui.querySelector('.ctr-sheet-done'));
 assert.equal(card(ui,'Americano').querySelector('.ctr-card-stepper span').textContent,'1');
 pass('All configured options open before adding; Hot/Cold replace; add-ons stay multiple');
 await tap(ui,'Rice');assert.ok(ui.querySelector('[aria-label="Options for Rice"]'));assert.equal(ui.querySelector('.ctr-sheet-done').disabled,false);
 await click(ui.querySelector('.ctr-sheet-done'));assert.equal(card(ui,'Rice').querySelector('.ctr-card-stepper span').textContent,'1');
 pass('Products with only optional toppings still open options');
 await tap(ui,'Toast');await click(card(ui,'Toast').querySelector('[aria-label="Add one Toast"]'));
 assert.equal(card(ui,'Toast').querySelector('.ctr-card-stepper span').textContent,'2');
 await click(card(ui,'Toast').querySelector('[aria-label="Remove one Toast"]'));await click(card(ui,'Toast').querySelector('[aria-label="Remove one Toast"]'));
 assert.equal(card(ui,'Toast').querySelector('.ctr-card-stepper span').textContent,'0');assert.equal(card(ui,'Toast').querySelector('[aria-label="Remove one Toast"]').disabled,true);
 pass('Card plus/minus adds, reduces and removes without opening review');
 await tap(ui,'Americano');await click(option(ui,'Medium'));await click(option(ui,'Hot'));await click(ui.querySelector('.ctr-sheet-done'));
 await click(card(ui,'Americano').querySelector('[aria-label="Remove one Americano"]'));
 assert.ok(ui.querySelector('[aria-label="Quantities for Americano"]'));
 const rows=ui.querySelectorAll('[aria-label="Quantities for Americano"] .ctr-row');assert.equal(rows.length,2);
 await click(rows[0].querySelector('button'));assert.equal(ui.querySelectorAll('[aria-label="Quantities for Americano"] .ctr-row').length,1);
 await click(button(ui,'Done'));
 pass('Minus asks which option combination to reduce');
 await swipe(ui.querySelector('.ctr-menu-scroll'),-100,140);assert.equal(ui.querySelector('.ctr-order').classList.contains('ticket-open'),false);
 await swipe(ui.querySelector('.ctr-menu-scroll'),-100);assert.equal(ui.querySelector('.ctr-order').classList.contains('ticket-open'),true);
 await swipe(ui.querySelector('.ctr-lines'),100);assert.equal(ui.querySelector('.ctr-order').classList.contains('ticket-open'),false);
 await swipe(ui.querySelector('.ctr-menu-scroll'),100);assert.ok(ui.querySelector('.ctr-tables'));assert.match(ui.querySelector('.ctr-takeaway').textContent,/not sent yet/);
 await swipe(ui.querySelector('.ctr-tables'),-100);assert.ok(ui.querySelector('.ctr-order'));
 pass('Horizontal forward/back gestures preserve drafts and ignore vertical scrolling');
 // Synthetic clicks immediately following a swipe are intentionally suppressed.
 await act(async()=>{await new Promise(r=>setTimeout(r,410));});
 await tap(ui,'Americano');
 await act(async()=>{window.history.back();await new Promise(r=>setTimeout(r,30));});
 assert.equal(ui.querySelector('[aria-label="Options for Americano"]'),null);assert.ok(ui.querySelector('.ctr-order'));
 await click(ui.querySelector('.ctr-review-bar'));
 await act(async()=>{window.history.back();await new Promise(r=>setTimeout(r,30));});
 assert.equal(ui.querySelector('.ctr-order').classList.contains('ticket-open'),false);
 pass('Native Back closes options, then review, without leaving Counter');
 await click(ui.querySelector('.ctr-back'));assert.ok(ui.querySelector('.ctr-tables'));
 await act(async()=>{roots[0].root.unmount();await tick();});ui.remove();
 const restored=await mount(Counter);assert.match(restored.querySelector('.ctr-takeaway').textContent,/not sent yet/);
 await click(restored.querySelector('.ctr-takeaway'));assert.equal(card(restored,'Americano').querySelector('.ctr-card-stepper span').textContent,'1');
 pass('Draft quantities and choices survive leaving and reopening Counter');
 await click(restored.querySelector('.ctr-review-bar'));failSend=true;await click(restored.querySelector('.ctr-send'));
 assert.equal(restored.querySelector('[aria-label="Order sent"]'),null);assert.equal(restored.querySelectorAll('.ctr-line').length,2);
 failSend=false;await click(restored.querySelector('.ctr-send'));assert.ok(restored.querySelector('[aria-label="Order sent"]'));assert.equal(requests.at(-1).payload.p_request_id,requests.at(-2).payload.p_request_id);
 assert.equal(restored.querySelector('.ctr-takeaway').textContent.includes('not sent yet'),false);
 pass('Unconfirmed send keeps draft; retry reuses request; confirmed send clears only that ticket');
 await click(button(restored,'Receipt / Print'));assert.ok(restored.querySelector('[aria-label="Receipt preview"]'));
 localStorage.setItem('sellio_printer_counter-test',JSON.stringify({mode:'bluetooth',deviceName:'Fixture Printer'}));
 await click(button(restored,'Print receipt'));assert.equal(__prints.at(-1).kind,1);
 await click(button(restored,'Print kitchen chit'));assert.equal(__prints.at(-1).kind,2);
 await click(button(restored,'Continue taking orders'));assert.equal(restored.querySelector('[aria-label="Order sent"]'),null);
 pass('Confirmed order offers receipt, kitchen print and continuing; server result is displayed');
 const {autoPrintKitchenOrder,printCounterOrder,hasKitchenPrinter}=await bundle('src/lib/orderPrinting.js');
 const order={id:'autoprint-one',tenant_id:'counter-test',status:'pending',order_number:'TEST',items:[]};
 localStorage.setItem('sellio_printer_counter-test',JSON.stringify({mode:'bluetooth',deviceName:'Fixture Printer',autoPrintChit:true}));
 const before=__prints.length;await Promise.all([autoPrintKitchenOrder(order,'counter-test',{}),autoPrintKitchenOrder(order,'counter-test',{})]);assert.equal(__prints.length,before+1);
 await autoPrintKitchenOrder({...order,tenant_id:'different'},'counter-test',{});assert.equal(__prints.length,before+1);
 globalThis.__printFails=true;await assert.rejects(()=>autoPrintKitchenOrder({...order,id:'failed-print'},'counter-test',{}));
 globalThis.__printFails=false;await autoPrintKitchenOrder({...order,id:'failed-print'},'counter-test',{});assert.equal(__prints.length,before+2);
 assert.equal(hasKitchenPrinter({mode:'network',ip:'192.0.2.1',brand:'generic'}),false);
 await printCounterOrder(order,'counter-test',{},'receipt');assert.equal(__prints.at(-1).kind,1);
 pass('Auto-print is serial, tenant scoped, deduplicated and never blindly retries uncertain printer sends');
 await act(async()=>{for(const {root} of roots.slice(1))root.unmount();await tick();});
 // Test the actual workspace listener with a Realtime event fixture.
 let realtime, removed=0;
 __client.channel=()=>({on:(event,filter,callback)=>{realtime=callback;return {subscribe:callback=>{queueMicrotask(()=>callback('SUBSCRIBED'));return {fixture:true};}};}});
 __client.removeChannel=()=>{removed++;};
 const {default:KitchenAutoPrint}=await bundle('src/components/orders/KitchenAutoPrint.jsx');
 const kitchen=await mount(KitchenAutoPrint);
 localStorage.setItem('sellio_printer_counter-test',JSON.stringify({mode:'bluetooth',deviceName:'Fixture Printer',autoPrintChit:false}));
 const off=__prints.length;await act(async()=>{realtime({new:{...order,id:'disabled-auto'}});await tick();});assert.equal(__prints.length,off);
 localStorage.setItem('sellio_printer_counter-test',JSON.stringify({mode:'bluetooth',deviceName:'Fixture Printer',autoPrintChit:true}));
 await act(async()=>{realtime({new:{...order,id:'workspace-auto'}});realtime({new:{...order,id:'workspace-auto'}});await tick();});assert.equal(__prints.length,off+1);
 await act(async()=>{roots.at(-1).root.unmount();await tick();});assert.equal(removed,1);
 pass('Workspace listener prints arrivals once, respects opt-out and unsubscribes on exit');
 const {sendViaEpsonEPos,savePrinterConfig,loadPrinterConfig}=await bundle('src/lib/printerUtils.js',[]);
 let printerEvents=0;window.addEventListener('sellio:printer-config',()=>printerEvents++);
 savePrinterConfig('network-test',{mode:'network',autoPrintChit:true,ip:'192.0.2.1'});savePrinterConfig('network-test',{ip:'192.0.2.2'});
 assert.equal(loadPrinterConfig('network-test').autoPrintChit,true);assert.equal(printerEvents,2);
 globalThis.fetch=async()=>({ok:true,text:async()=>'<response success="false" code="EPTR_COVER_OPEN"/>'});
 await assert.rejects(()=>sendViaEpsonEPos('192.0.2.1',new Uint8Array([1])),/EPTR_COVER_OPEN/);
 globalThis.fetch=async()=>({ok:true,text:async()=>'<response success="true"/>'});await sendViaEpsonEPos('192.0.2.1',new Uint8Array([1]));
 pass('Printer reconnect retains auto-print preference; paper/printer errors are not reported as success');
 console.log(passes+' Counter and printing checks passed.');
}finally{
 await act(async()=>{for(const {root,container} of roots){try{root.unmount();}catch{}container.remove();}await tick();});
 await rm(tmp,{recursive:true,force:true});dom.window.close();
}
