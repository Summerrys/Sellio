import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const taskRoot = process.argv[2] || '/tmp/sellio-verification';
const require = createRequire(path.join(taskRoot, 'package.json'));
const { chromium } = require('playwright');
const css = await readFile(path.join(taskRoot, 'appearance.css'), 'utf8');
const app = process.cwd();
const bundlePath = path.join(taskRoot, 'browser-harness.js');
await build({
  stdin: { resolveDir: app, loader: 'jsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { ThemeProvider } from '@/components/theme/ThemeProvider';
    import DeliveryOrderTab from '@/components/stocktake/DeliveryOrderTab';
    import StockAdjustmentPanel from '@/components/inventory/StockAdjustmentPanel';
    import AccountDeletionForm from '@/components/profile/AccountDeletionForm';
    const tables = {
      suppliers: Array.from({length:35},(_,i)=>({id:'supplier-'+i,name:'Test supplier '+i})),
      products: Array.from({length:35},(_,i)=>({id:'product-'+i,name:'Test product '+i,slug:'p-'+i})),
      delivery_orders: []
    };
    window.__client = {
      from: name => {
        const query={};
        for(const method of ['select','eq','order','limit']) query[method]=()=>query;
        query.then=(yes,no)=>Promise.resolve({data:tables[name]||[],error:null}).then(yes,no);
        return query;
      },
      auth: { getUser: async()=>({data:{user:{id:'fixture',email:'fixture@example.invalid'}}}),signOut:async()=>({error:null}) },
      functions:{invoke:async()=>({data:{status:'needs_owner_action',requestId:'fixture-request',blockers:{stores:[{name:'Temporary test store'}]}}})}
    };
    const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
    const root=createRoot(document.getElementById('root'));
    window.switchView=(view)=>{
      const body=view==='stock'
        ? <StockAdjustmentPanel open product={{id:'product-0',name:'Test stock',current_stock:10,low_stock_threshold:5}} tenantId="fixture-store" onOpenChange={()=>{}}/>
        : view==='deletion' ? <div style={{maxWidth:480,margin:'0 auto',padding:20}}><h1>Delete your Sellio account</h1><AccountDeletionForm/></div>
        : <DeliveryOrderTab/>;
      root.render(<QueryClientProvider client={client}><ThemeProvider><main data-sellio-workspace style={{minHeight:'100vh'}}>{body}</main></ThemeProvider></QueryClientProvider>);
    };
    window.switchView('delivery');
  ` },
  outfile: bundlePath, bundle: true, format: 'iife', platform: 'browser', alias: { '@': path.join(app,'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name:'isolated-browser-api',setup(builder) {
      builder.onResolve({filter:/supabaseClient$/},()=>({path:'client',namespace:'fixture'}));
      builder.onResolve({filter:/TenantContext$/},()=>({path:'tenant',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='client'
        ? 'export const getSupabase=async()=>window.__client;'
        : 'export const useTenant=()=>({tenantId:"fixture-store"});',loader:'js'}));
    }
  }],logLevel:'silent'
});
const js=await readFile(bundlePath,'utf8');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let checks=0;
try {
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    const page=await browser.newPage({viewport,colorScheme:'light',isMobile:viewport.width<500,hasTouch:viewport.width<500});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/harness.js') return route.fulfill({contentType:'application/javascript',body:js});
      if(url.hostname==='verify.sellio.invalid') return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><div id="root"></div><script src="/harness.js"></script></body></html>'});
      return route.abort();
    });
    await page.goto('https://verify.sellio.invalid');
    const supplier=page.getByRole('combobox',{name:'Supplier',exact:true});
    await supplier.waitFor();
    assert.equal(await page.locator('select:visible').count(),0);
    await supplier.click();
    await page.getByRole('option',{name:'Test supplier 1',exact:true}).click();
    assert.match(await supplier.textContent(),/Test supplier 1/);
    await supplier.click();
    await page.getByRole('option',{name:'Select supplier',exact:true}).click();
    assert.match(await supplier.textContent(),/Select supplier/);
    const product=page.getByRole('combobox',{name:'Product for delivery line 1',exact:true});
    await product.click();
    const list=page.getByRole('listbox');
    const bounds=await list.boundingBox();
    assert.ok(bounds.x>=0 && bounds.x+bounds.width<=viewport.width+1,'Dropdown fits viewport horizontally');
    assert.ok(bounds.y>=0 && bounds.y+bounds.height<=viewport.height+1,'Dropdown fits viewport vertically');
    await page.keyboard.press('Escape');
    await product.focus();await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='option');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.activeElement?.textContent?.includes('Test product'));
    await page.keyboard.press('Enter');
    assert.match(await product.textContent(),/Test product/);
    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    const colors=await product.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
    assert.notEqual(colors.background,'rgb(255, 255, 255)');
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('dark'));
    await page.evaluate(()=>window.switchView('stock'));
    await page.getByRole('group',{name:'Stock adjustment',exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'No changes made',exact:true}).isDisabled());
    await page.evaluate(()=>window.switchView('deletion'));
    await page.getByLabel('Type DELETE to confirm').waitFor();
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button',{name:'Delete my account',exact:true}).click();
    await page.getByText('Your account has not been deleted yet.',{exact:true}).waitFor();
    assert.equal(errors.length,0,errors.join('\n'));
    checks++;
    console.log('PASS browser layout, dropdown mouse/keyboard/clear, appearance switching and protected deletion at '+viewport.width+'x'+viewport.height);
    await page.close();
  }
  console.log(checks+' browser viewport checks passed using isolated fixtures; no real account or order touched.');
} finally {await browser.close();await rm(bundlePath,{force:true});}
