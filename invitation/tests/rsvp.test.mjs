import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const transport = app.slice(app.indexOf('// Google Sheets transport:'), app.indexOf('// End Google Sheets transport.'));
const backend = readFileSync(new URL('../google-apps-script/Code.gs', import.meta.url), 'utf8');
const endpoint = 'https://script.google.com/macros/s/test-deployment/exec';
const basePayload = {requestId:'a'.repeat(32), nonce:'b'.repeat(32), origin:'https://wedding.example',
  name:'Анна Иванова', partner:'Иван', attendance:'yes', note:'Без орехов', eventDate:'2027-06-26', website:''};

function server() {
  const rows = [], state = {locked:false, denyLock:false, flushes:0, failFlush:false};
  const sheet = {
    getLastRow:()=>rows.length,
    appendRow:row=>rows.push([...row]),
    setFrozenRows:()=>{},
    getRange(row,col,count,width) {
      return {
        setFontWeight:()=>{},
        getValues:()=>rows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
        setValues(values) { values.forEach((value,i)=>{rows[row-1+i]??=[];value.forEach((v,j)=>{rows[row-1+i][col-1+j]=v;});}); },
        createTextFinder(id) {
          return {matchEntireCell:()=>({useRegularExpression:()=>({findNext:()=>
            rows.slice(row-1,row-1+count).some(r=>r[col-1]===id)?{}:null})})};
        }
      };
    }
  };
  let exists = false;
  const book = {getSheetByName:()=>exists?sheet:null,insertSheet:()=>{exists=true;return sheet;}};
  const lock = {waitLock(){assert.equal(state.locked,false);state.locked=true;},tryLock(){if(state.denyLock)return false;assert.equal(state.locked,false);state.locked=true;return true;},releaseLock(){state.locked=false;}};
  const context = vm.createContext({
    console:{error(){}},
    LockService:{getScriptLock:()=>lock},
    SpreadsheetApp:{openById(id){assert.equal(id,'1uxy1JH6sGbZElNxZWQIkQ3oNfnX-FaTJ3be3LQrnvJY');return book;},flush(){state.flushes++;if(state.failFlush)throw Error('write_failed');}},
    Utilities:{formatDate(date,zone){assert.equal(zone,'Europe/Moscow');return '19.10.2026 22:00:00';}},
    HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput(html){return {html,setXFrameOptionsMode(mode){this.frameMode=mode;return this;}};}}
  });
  vm.runInContext(backend,context);
  function submit(p) { return context.doPost({parameter:{payload:JSON.stringify(p)}}); }
  return {rows,state,context,submit};
}

function receipt(output) {
  const script = output.html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script,'A result must contain a receipt script');
  const calls=[],top={postMessage:(data,origin)=>calls.push({data,origin})};top.parent=top;
  vm.runInNewContext(script,{window:{parent:{postMessage(){},parent:top}}});
  assert.equal(calls.length,1);
  assert.equal(output.frameMode,'ALLOWALL');
  return calls[0];
}

function browser({search='',embedded=false,origin='https://wedding.example'}={}) {
  const listeners=new Map(),timers=new Map(),nodes=[],posts=[];
  let nextTimer=0;
  const window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  window.parent=embedded?{}:window;
  function node(tag) {
    const element={tag,children:[],attributes:{},append(...children){this.children.push(...children);},remove(){this.removed=true;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}};
    if(tag==='iframe')element.contentWindow={parent:window};
    if(tag==='form')element.submit=function(){posts.push(JSON.parse(this.children[0].value));};
    nodes.push(element);return element;
  }
  const status={textContent:''},button={disabled:false};
  const fields={name:'Анна Иванова',partner:'Иван',attendance:'yes',note:'Без орехов',website:''};
  const handlers=new Map(),form=node('guest-form');
  form.querySelector=()=>button;form.reportValidity=()=>true;
  form.reset=()=>Object.assign(fields,{name:'',partner:'',attendance:'yes',note:'',website:''});
  form.elements={namedItem:()=>({focus(){}})};
  form.addEventListener=(name,handler)=>handlers.set(name,handler);
  const document={createElement:node,body:{append(){}},getElementById:id=>id==='guest-form'?form:status};
  const context=vm.createContext({window,document,location:{search,origin},crypto:webcrypto,URLSearchParams,Blob,URL,
    FormData:class{get(key){return fields[key];}},
    setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(transport,context);
  const config={rsvp:{delivery:'googleSheets',googleScriptUrl:endpoint},event:{date:'2027-06-26'}};
  function emit(data,{messageOrigin='https://test-script.googleusercontent.com',source}={}) {
    const frame=nodes.filter(n=>n.tag==='iframe'&&!n.removed).at(-1);
    listeners.get('message')?.({origin:messageOrigin,data,source:source||{parent:frame?.contentWindow}});
  }
  function answer(p,extra={}) { emit({type:'wedding-rsvp-result',requestId:p.requestId,nonce:p.nonce,ok:true,...extra}); }
  const click=()=>handlers.get('submit')?.({preventDefault(){}});
  const expire=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}};
  return {context,config,status,button,fields,posts,nodes,listeners,emit,answer,click,expire,handlers,form};
}

test('Receiver writes into the specified table and acknowledges only after flush; retry does not add a row',()=>{
  const s=server();s.context.setup();s.context.setup();
  assert.equal(s.rows.length,1);
  const first=receipt(s.submit(basePayload));
  assert.equal(first.data.ok,true);assert.equal(first.data.duplicate,false);
  assert.equal(first.origin,basePayload.origin);assert.equal(s.rows.length,2);
  assert.equal(s.rows[1][2],'Анна Иванова');assert.equal(s.rows[1][4],'Да');
  assert.equal(s.rows[1][5],'Без орехов');assert.equal(s.state.flushes,3);
  assert.equal(receipt(s.submit({...basePayload,nonce:'c'.repeat(32)})).data.duplicate,true);
  assert.equal(s.rows.length,2);assert.equal(s.state.locked,false);
  assert.ok(!s.submit(basePayload).html.includes(basePayload.name),'Receipt must not expose guest data');
});

test('Malformed, blank, oversized, invalid-attendance and bot responses never write',()=>{
  const s=server();
  for(const changes of [{name:'  '},{name:'x'.repeat(141)},{partner:'x'.repeat(141)},{note:'x'.repeat(1501)},{attendance:'maybe'},{website:'spam'},{eventDate:'wrong'}]){
    const output=receipt(s.submit({...basePayload,...changes}));
    assert.equal(output.data.ok,false);assert.equal(output.data.code,'invalid');
  }
  for(const value of ['{','null','[]','42','"text"']){
    assert.doesNotThrow(()=>s.context.doPost({parameter:{payload:value}}));
  }
  assert.equal(s.rows.length,0);
});

test('Text formulas are escaped and opaque file origins receive only an ID receipt',()=>{
  const s=server();
  const output=receipt(s.submit({...basePayload,origin:'null',name:'=IMPORTXML("https://example.com")',partner:'+123',note:'@formula',attendance:'no'}));
  assert.equal(s.rows[1][2][0],"'");assert.equal(s.rows[1][3][0],"'");assert.equal(s.rows[1][5][0],"'");
  assert.equal(s.rows[1][4],'Нет');assert.equal(output.origin,'*');assert.equal(output.data.ok,true);
});

test('Lock and write failures never produce a successful receipt',()=>{
  const busy=server();busy.state.denyLock=true;
  assert.equal(receipt(busy.submit(basePayload)).data.ok,false);assert.equal(busy.rows.length,0);
  const failed=server();failed.state.failFlush=true;
  assert.equal(receipt(failed.submit(basePayload)).data.ok,false);assert.equal(failed.state.locked,false);
});

test('Browser ignores forged receipts and iframe loads; only a matching Google receipt resolves',async()=>{
  const b=browser();let finished=false;
  const result=b.context.sendGoogleRsvp(endpoint,basePayload).then(value=>{finished=true;return value;});
  const p=b.posts[0];
  b.emit({type:'wedding-rsvp-result',requestId:p.requestId,nonce:p.nonce,ok:true},{messageOrigin:'https://evil.example'});
  b.answer(p,{nonce:'0'.repeat(32)});
  b.emit({type:'wedding-rsvp-result',requestId:p.requestId,nonce:p.nonce,ok:true},{source:{parent:null}});
  await Promise.resolve();assert.equal(finished,false);
  b.answer(p);assert.equal((await result).ok,true);
  assert.equal(b.listeners.size,0);assert.ok(b.nodes.filter(n=>['form','iframe'].includes(n.tag)).every(n=>n.removed));
});

test('Missing endpoint and editor preview disable submission',()=>{
  const missing=browser();missing.config.rsvp.googleScriptUrl='';
  missing.context.initGuestForm(missing.config,{});
  assert.equal(missing.button.disabled,true);assert.match(missing.status.textContent,/не настроен/);assert.equal(missing.handlers.size,0);
  const preview=browser({search:'?preview',embedded:true});preview.context.initGuestForm(preview.config,{});
  assert.equal(preview.button.disabled,true);assert.match(preview.status.textContent,/предпросмотре/);assert.equal(preview.posts.length,0);
});

test('UI blocks double submit, preserves fields on timeout, reuses ID on retry, and accepts the backend receipt',async()=>{
  const b=browser(),s=server();b.context.initGuestForm(b.config,{});
  const first=b.click();await b.click();assert.equal(b.posts.length,1);
  assert.equal(b.button.disabled,true);assert.match(b.status.textContent,/Сохраняем/);
  assert.equal(b.fields.name,'Анна Иванова');assert.equal(b.fields.note,'Без орехов');
  const saved=receipt(s.submit(b.posts[0]));assert.equal(saved.data.ok,true);
  b.expire();await first;assert.match(b.status.textContent,/подтверждение/);assert.equal(b.fields.note,'Без орехов');assert.equal(b.button.disabled,false);
  const retry=b.click();assert.equal(b.posts[1].requestId,b.posts[0].requestId);assert.notEqual(b.posts[1].nonce,b.posts[0].nonce);
  const duplicate=receipt(s.submit(b.posts[1]));assert.equal(duplicate.data.duplicate,true);
  b.emit(duplicate.data);await retry;assert.match(b.status.textContent,/Ваш ответ сохранён/);assert.equal(s.rows.length,2);
  assert.deepEqual(b.fields,{name:'',partner:'',attendance:'yes',note:'',website:''});
  b.fields.name='Пётр Петров';b.fields.note='Без молока';b.fields.attendance='no';const edited=b.click();assert.notEqual(b.posts[2].requestId,b.posts[1].requestId);
  b.emit(receipt(s.submit(b.posts[2])).data);await edited;assert.equal(s.rows.length,3);
  assert.deepEqual(b.fields,{name:'',partner:'',attendance:'yes',note:'',website:''});
});

test('Google errors preserve user fields and do not show success',async()=>{
  const b=browser();b.context.initGuestForm(b.config,{});const sent=b.click();
  b.answer(b.posts[0],{ok:false,code:'save_failed'});await sent;
  assert.match(b.status.textContent,/Не удалось сохранить/);assert.equal(b.fields.name,'Анна Иванова');assert.equal(b.button.disabled,false);
});

test('Editor validates the deployment URL and retains it in imported settings',()=>{
  const editor=readFileSync(new URL('../dist/editor.js',import.meta.url),'utf8');
  const validate=editor.slice(editor.indexOf('function validate('),editor.indexOf('try{const draft='));
  const c=vm.createContext({clone:structuredClone});vm.runInContext(validate,c);
  assert.equal(c.validate(endpoint,'','.rsvp.googleScriptUrl'),endpoint);
  for(const bad of ['https://docs.google.com/spreadsheets/d/123/edit','https://script.google.com/macros/s/test/dev','javascript:alert(1)']){
    assert.throws(()=>c.validate(bad,'','.rsvp.googleScriptUrl'));
  }
  const normalized=c.validate({delivery:'googleSheets',googleScriptUrl:endpoint},{delivery:'googleSheets',googleScriptUrl:''},'.rsvp');
  assert.equal(normalized.googleScriptUrl,endpoint);
});
