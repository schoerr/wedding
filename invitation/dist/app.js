/* Rendering is separate from content: no Tilda scripts or dependencies. */
(() => {
'use strict';
const root=document.getElementById('app');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=v=>esc(v).replace(/\n/g,'<br>');
const safeUrl=(value,image=false)=>{const s=String(value||'').trim();if(image&&/^data:image\/(png|jpeg|webp|gif);base64,/i.test(s))return s;if(/^https?:\/\//i.test(s))return s;if(image&&/^(\.\/)?assets\/[\w.\/-]+$/.test(s)&&!s.includes('..'))return s;return '';};
const image=(src,alt,extra='')=>`<img src="${esc(safeUrl(src,true))}" alt="${esc(alt)}" ${extra}>`;
const heading=(a,b)=>`<h2 class="section-heading">${text(a)}<em>${text(b)}</em></h2>`;
const heart='<svg class="scribble-heart" viewBox="0 0 100 90" aria-hidden="true"><path d="M50 77C22 58 0 30 17 16c15-14 32 2 34 14C54 8 80 5 87 22c10 24-23 46-37 55Z"/><path d="M47 75c-5 6-9 9-13 12"/></svg>';
const icons={glasses:'<path d="m7 5 5 14M4 6l8-3 4 11a6 6 0 0 1-11 4L2 7Zm22-1-5 14m-3-16 8 3 3 11a6 6 0 0 1-11-4L18 3ZM12 19l3 11m-7 2 12-3m1-10-3 11m-5-1 12 3"/>',plate:'<circle cx="18" cy="18" r="11"/><circle cx="18" cy="18" r="7"/><path d="M2 2v12m4-12v12M2 10h4m-2 4v20M33 2v32m0-32c-5 5-5 15 0 15"/>',cake:'<path d="M6 32h26M8 31V17h22v14M8 22c4 5 7-5 11 0s7-5 11 0M13 17V9h12v8m-6-8V4m0 0c-4-2 0-6 0-6 3 4 3 5 0 6"/>',sparkles:'<path d="m17 3 4 11 11 4-11 4-4 11-4-11L2 18l11-4ZM30 1v8m-4-4h8M4 29v7m-3-3h6"/>'};
function aestheticPhotos(c){return ['hero','story','detail','venue'].map((fallback,i)=>({src:c.photos['aesthetic'+(i+1)]||c.photos[fallback],alt:c.photos['aesthetic'+(i+1)+'Alt']||c.photos[fallback+'Alt']}));}
function aestheticGallery(c){const photos=aestheticPhotos(c);return `<div class="dress-carousel" role="region" aria-roledescription="карусель" aria-label="Немного эстетики"><div class="dress-carousel-photo">${image(photos[0].src,photos[0].alt,'id="aesthetic-photo" loading="lazy"')}</div><div class="dress-carousel-controls"><button class="dress-carousel-button" type="button" data-aesthetic-step="-1" aria-label="Предыдущее фото" aria-controls="aesthetic-photo"><span aria-hidden="true">←</span></button><span class="dress-carousel-counter" aria-live="polite" aria-atomic="true">Фото 1 из ${photos.length}</span><button class="dress-carousel-button" type="button" data-aesthetic-step="1" aria-label="Следующее фото" aria-controls="aesthetic-photo"><span aria-hidden="true">→</span></button></div></div>`;}
function initAestheticGallery(c){const gallery=root.querySelector('.dress-carousel');if(!gallery)return;const photos=aestheticPhotos(c),photo=gallery.querySelector('img'),counter=gallery.querySelector('.dress-carousel-counter');let current=0;function move(step){current=(current+step+photos.length)%photos.length;photo.src=safeUrl(photos[current].src,true);photo.alt=photos[current].alt;counter.textContent='Фото '+(current+1)+' из '+photos.length;}gallery.querySelectorAll('[data-aesthetic-step]').forEach(button=>button.addEventListener('click',()=>move(Number(button.dataset.aestheticStep))));gallery.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();move(event.key==='ArrowRight'?1:-1);});}
function locationSection(id,place,photo,photoAlt,city){
if(!place)return '';
const address=String(place.address||'').trim();
const destination=address&&address!=='Адрес ЗАГСа уточняется'?address:(id==='registry'?'ЗАГС':place.name);
const mapUrl=safeUrl(place.mapUrl)||'https://yandex.ru/maps/?text='+encodeURIComponent([city,destination].filter(Boolean).join(', '));
const registry=id==='registry';
const sectionClass=registry?'dress-section':'venue-section';
const gridClass=registry?'dress-grid':'venue-grid';
const photoMarkup=registry?`<div class="registry-photo"><div class="dress-carousel-photo">${image(photo,photoAlt,'loading="lazy"')}</div></div>`:`<div class="venue-photo">${image(photo,photoAlt,'loading="lazy"')}</div>`;
return `<section id="${id}" class="section ${sectionClass}"><div class="wrap ${gridClass}"><div><span class="eyebrow">${esc(place.eyebrow)}</span>${heading(place.title,place.accent)}<h3 class="venue-name">${esc(place.name)}</h3><p class="body-text">${text(place.address)}<br>${text(place.note)}</p><a class="button outline" href="${esc(mapUrl)}" target="_blank" rel="noopener noreferrer">${esc(place.mapLabel||'Как добраться')} <span aria-hidden="true">↗</span></a></div>${photoMarkup}</div></section>`;}
// Google Sheets transport: POST to an iframe, then wait for a verified receipt.
const googleScriptUrl=value=>/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(String(value||'').trim())?String(value).trim():'';
const rsvpDelivery=c=>c.rsvp.delivery||(c.rsvp.email?'email':'download');
const randomRsvpId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
function sendGoogleRsvp(endpoint,payload){
return new Promise((resolve,reject)=>{
  if(!googleScriptUrl(endpoint)){reject(Error('Приём ответов пока не настроен. Свяжитесь с организаторами.'));return;}
  const nonce=randomRsvpId(),frame=document.createElement('iframe'),post=document.createElement('form');
  frame.name='wedding-rsvp-'+nonce;frame.hidden=true;frame.title='Отправка ответа организаторам';
  post.hidden=true;post.method='POST';post.action=endpoint;post.target=frame.name;post.acceptCharset='UTF-8';
  const input=document.createElement('input');input.type='hidden';input.name='payload';
  input.value=JSON.stringify({...payload,nonce,origin:location.origin});post.append(input);
  let timer;
  const finish=(error,result)=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();post.remove();error?reject(error):resolve(result);};
  function receive(event){
    if(!/^https:\/\/(?:[a-z0-9-]+\.)?googleusercontent\.com$/.test(event.origin)&&event.origin!=='https://script.google.com')return;
    const result=event.data;
    if(!result||result.type!=='wedding-rsvp-result'||result.requestId!==payload.requestId||result.nonce!==nonce||typeof result.ok!=='boolean')return;
    // HtmlService adds a nested sandbox iframe. Its parent chain must reach our frame.
    let source=event.source,belongs=false;
    try{for(let i=0;source&&i<10;i++){if(source===frame.contentWindow){belongs=true;break;}if(source.parent===source)break;source=source.parent;}}catch{return;}
    if(!belongs)return;
    finish(result.ok?null:Error(result.code==='invalid'?'Проверьте имя и остальные поля анкеты.':'Не удалось сохранить ответ. Попробуйте ещё раз.'),result);
  }
  window.addEventListener('message',receive);
  timer=setTimeout(()=>finish(Error('Не удалось получить подтверждение сохранения. Проверьте интернет и повторите отправку — повторная попытка не создаст дубликат.')),45000);
  try{document.body.append(frame,post);post.submit();}catch{finish(Error('Не удалось отправить ответ. Проверьте подключение к интернету.'));}
});
}
function initGuestForm(c,d){
const form=document.getElementById('guest-form');if(!form)return;
const status=document.getElementById('form-status'),button=form.querySelector('[type="submit"]');
const delivery=rsvpDelivery(c),online=delivery==='googleSheets';
const preview=new URLSearchParams(location.search).has('preview')&&window.parent!==window;
if(preview){button.disabled=true;status.textContent='В предпросмотре ответы не отправляются.';return;}
if(online&&!googleScriptUrl(c.rsvp.googleScriptUrl)){button.disabled=true;status.textContent='Приём ответов пока не настроен. Свяжитесь с организаторами.';return;}
let sending=false,lastBody='',requestId='';
form.addEventListener('submit',async event=>{
  event.preventDefault();if(sending||!form.reportValidity())return;
  const data=new FormData(form),payload={name:String(data.get('name')||'').trim(),partner:String(data.get('partner')||'').trim(),attendance:String(data.get('attendance')||''),note:String(data.get('note')||'').trim(),eventDate:c.event.date,website:String(data.get('website')||'')};
  if(!payload.name){status.textContent='Укажите ваше имя и фамилию.';form.elements.namedItem('name').focus();return;}
  if(online){
    const serialized=JSON.stringify(payload);
    if(serialized!==lastBody){requestId=randomRsvpId();lastBody=serialized;}
    sending=true;button.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Сохраняем ваш ответ…';
    try{await sendGoogleRsvp(googleScriptUrl(c.rsvp.googleScriptUrl),{...payload,requestId});form.reset();status.textContent='Спасибо! Ваш ответ сохранён и передан организаторам.';}
    catch(error){status.textContent=error.message;}
    finally{sending=false;button.disabled=false;form.removeAttribute('aria-busy');}
    return;
  }
  const body=`Свадьба: ${c.couple.first} и ${c.couple.second}, ${d.long}\nГость: ${payload.name}\nСпутник: ${payload.partner||'—'}\nПрисутствие: ${payload.attendance==='yes'?c.rsvp.yesLabel:c.rsvp.noLabel}\nПожелания: ${payload.note||'—'}`;
  if(delivery==='email'){
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.rsvp.email)){status.textContent='Отправка по почте пока не настроена. Свяжитесь с организаторами.';return;}
    window.location.href='mailto:'+encodeURIComponent(c.rsvp.email)+'?subject='+encodeURIComponent('Ответ на свадебное приглашение')+'&body='+encodeURIComponent(body);status.textContent='Подготовлено письмо. Пожалуйста, отправьте его в почтовом приложении.';
  }else{
    const url=URL.createObjectURL(new Blob([body],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='wedding-rsvp.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status.textContent='Ответ сохранён в файл. Передайте его организаторам — автоматически он не отправляется.';
  }
});
}
// End Google Sheets transport.

let timer;
function dateParts(c){const date=new Date(c.event.date+'T12:00:00Z');const valid=!Number.isNaN(date.valueOf());return {short:valid?new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'}).format(date):'',long:valid?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date).replace(' г.',''):'',month:valid?new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'}).format(date):'',day:valid?date.getUTCDate():'',year:valid?date.getUTCFullYear():''};}
function render(c){
clearInterval(timer);window.WEDDING=c;const d=dateParts(c);const names=esc(c.couple.first)+' <i>&</i> '+esc(c.couple.second);const deadline=new Date(c.event.deadline+'T12:00:00Z');const deadlineText=Number.isNaN(deadline.valueOf())?c.event.deadline:new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'UTC'}).format(deadline);
for(const [key,val] of Object.entries({accent:c.theme.accent,paper:c.theme.background,ink:c.theme.ink})){if(/^#[\da-f]{6}$/i.test(val))document.documentElement.style.setProperty('--'+key,val);}
document.title=c.couple.first+' и '+c.couple.second+' · '+d.long;document.querySelector('meta[name="description"]').content=c.intro.text;
root.innerHTML=`<header class="site-header wrap"><a class="monogram" href="#" aria-label="Наверх">${esc(c.couple.initials)}</a><nav aria-label="Разделы приглашения"><a href="#invitation">Приглашение</a><a href="#schedule">Программа</a><a href="#rsvp">Анкета гостя ↗</a></nav><span class="header-date">${esc(d.short)}</span></header>
<main><section class="hero"><div class="wrap"><div class="hero-top"><span class="eyebrow">${esc(c.hero.eyebrow)}</span><span class="tiny-heart" aria-hidden="true">♡</span></div><div class="hero-grid"><div class="hero-copy reveal"><h1>${text(c.hero.title)}<span>${text(c.hero.accent)}</span></h1><div class="couple-names">${names}</div><p>${text(c.hero.caption)}</p><a class="button" href="#rsvp">${esc(c.hero.button)} <span aria-hidden="true">↗</span></a></div><div class="hero-art"><figure class="photo-frame"><span class="tape" aria-hidden="true"></span>${image(c.photos.hero,c.photos.heroAlt,'fetchpriority="high"')}<figcaption class="photo-note">${esc(c.hero.photoNote)}</figcaption></figure><div class="stamp"><small>${esc(c.hero.stamp)}</small><strong>${esc(d.short.slice(0,5))}</strong><span>${esc(d.year)}</span></div>${heart}</div></div><div class="hero-bottom"><a href="#invitation"><span class="down" aria-hidden="true">↓</span>${esc(c.hero.scroll)}</a><span>${esc(c.hero.invitationLabel)}</span></div></div></section>
<div class="ticker" aria-hidden="true"><span>${esc(c.couple.first)} & ${esc(c.couple.second)}</span><span>♡</span><span>${esc(d.long)}</span><span>♡</span><span>${esc(c.event.city)}</span><span>♡</span><span>${esc(c.couple.first)} & ${esc(c.couple.second)}</span></div>
<section id="invitation" class="section wrap intro"><div class="story-collage"><div class="story-main">${image(c.photos.story,c.photos.storyAlt,'loading="lazy"')}</div><span class="story-number" aria-hidden="true">amour.</span><div class="story-small">${image(c.photos.detail,c.photos.detailAlt,'loading="lazy"')}</div></div><div><span class="eyebrow">${esc(c.intro.eyebrow)}</span>${heading(c.intro.title,c.intro.accent)}<p class="body-text">${text(c.intro.text)}</p><p class="footnote">${text(c.intro.footnote)}</p><div class="date-block">${esc(d.day)} ${esc(d.month)}<span>${esc(d.year)}<br>${esc(c.event.city)}</span></div></div></section>
${locationSection('registry',c.registry,c.photos.registry,c.photos.registryAlt,c.event.city)}
${locationSection('venue',c.venue,c.photos.venue,c.photos.venueAlt,c.event.city)}
<section id="schedule" class="section wrap"><div class="center"><span class="eyebrow">${esc(c.schedule.eyebrow)}</span>${heading(c.schedule.title,c.schedule.accent)}</div><div class="timeline">${c.schedule.items.map(i=>`<article class="timeline-item"><svg class="timeline-icon" viewBox="0 0 38 38" aria-hidden="true">${icons[i.icon]||icons.sparkles}</svg><span class="timeline-time">${esc(i.time)}</span><h3>${esc(i.title)}</h3><p>${text(i.text)}</p></article>`).join('')}</div></section>
<section class="section dress-section"><div class="wrap dress-grid"><div><span class="eyebrow">${esc(c.dress.eyebrow)}</span>${heading(c.dress.title,c.dress.accent)}<p class="body-text">${text(c.dress.text)}</p></div><div>${aestheticGallery(c)}<div class="dress-palette" role="img" aria-label="Палитра дресс-кода: ${esc(c.dress.colors.join(', '))}">${c.dress.colors.map(color=>`<span class="swatch" style="background:${/^#[\da-f]{6}$/i.test(color)?color:'#cccccc'}"></span>`).join('')}</div><p class="dress-caption">${text(c.dress.caption)}</p></div></div></section>
<section class="section wrap detail-grid"><div><span class="eyebrow">${esc(c.details.eyebrow)}</span>${heading(c.details.title,c.details.accent)}</div><div class="detail-list">${c.details.items.map((i,n)=>`<article><span>0${n+1}</span><div><h3>${esc(i.title)}</h3><p>${text(i.text)}</p></div></article>`).join('')}</div></section>
<section class="countdown-section"><h2 id="countdown-title">${esc(c.countdown.title)}</h2><div class="countdown" role="timer" aria-label="Время до свадьбы">${c.countdown.labels.map((l,i)=>`<div><strong id="count-${i}">00</strong><span>${esc(l)}</span></div>`).join('')}</div></section>
<section id="rsvp" class="section wrap rsvp"><div class="rsvp-intro"><span class="eyebrow">${esc(c.rsvp.eyebrow)}</span>${heading(c.rsvp.title,c.rsvp.accent)}<p class="body-text">${text(c.rsvp.text.replace('{deadline}',deadlineText))}</p><div class="rsvp-heart" aria-hidden="true">♡</div></div><div>${safeUrl(c.rsvp.formUrl)?`<p class="body-text">${esc(c.rsvp.externalLabel)}</p><a class="button" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(c.rsvp.formUrl))}">${esc(c.rsvp.externalLabel)} ↗</a>`:`<form class="guest-form" id="guest-form"><label class="field">${esc(c.rsvp.nameLabel)}<input name="name" autocomplete="name" maxlength="140" required placeholder="${esc(c.rsvp.namePlaceholder)}"></label><label class="field">${esc(c.rsvp.partnerLabel)}<input name="partner" maxlength="140" placeholder="${esc(c.rsvp.partnerPlaceholder)}"></label><fieldset><legend>${esc(c.rsvp.attendanceLabel)}</legend><label class="radio-label"><input type="radio" name="attendance" value="yes" required checked>${esc(c.rsvp.yesLabel)}</label><label class="radio-label"><input type="radio" name="attendance" value="no">${esc(c.rsvp.noLabel)}</label></fieldset><label class="field">${esc(c.rsvp.noteLabel)}<textarea name="note" maxlength="1500" placeholder="${esc(c.rsvp.notePlaceholder)}"></textarea></label><div hidden><label>Ваш сайт<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="form-note">${esc(rsvpDelivery(c)==='googleSheets'?'Ответ будет отправлен организаторам после нажатия кнопки.':rsvpDelivery(c)==='email'?c.rsvp.emailNote:c.rsvp.downloadNote)}</p><button class="button" type="submit">${esc(rsvpDelivery(c)==='download'?'Скачать ответ':c.rsvp.button)} <span aria-hidden="true">↗</span></button><p class="privacy">${esc(c.rsvp.privacy)}</p><p class="form-status" role="status" id="form-status"></p></form>`}</div></section></main>
<footer class="footer"><h2>${esc(c.footer.title)}</h2><p>${esc(c.footer.text)}</p><div class="names">${esc(c.couple.first)} & ${esc(c.couple.second)}</div><small>${esc(c.footer.small)} · ${esc(d.short)}</small><div><a class="edit-link" href="editor.html">Настроить это приглашение ↗</a></div></footer>`;
initAestheticGallery(c);
const wedding=new Date(`${c.event.date}T${c.event.time}:00${c.event.timezone}`);function tick(){const left=Math.max(0,wedding-Date.now());const seconds=Math.floor(left/1000);const vals=[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60];vals.forEach((v,i)=>{const el=document.getElementById('count-'+i);if(el)el.textContent=String(Number.isFinite(v)?v:0).padStart(2,'0');});if(left===0)document.getElementById('countdown-title').textContent=c.countdown.after;}tick();timer=setInterval(tick,1000);
initGuestForm(c,d);
}
render(window.WEDDING);
if(new URLSearchParams(location.search).has('preview')&&window.parent!==window){document.body.classList.add('preview-mode');window.addEventListener('message',e=>{if(e.source!==window.parent||e.origin!==location.origin||e.data?.type!=='wedding-preview')return;try{render(e.data.content);}catch(error){console.error('Не удалось показать настройки',error);}});window.parent.postMessage({type:'wedding-ready'},location.origin==='null'?'*':location.origin);}
})();
