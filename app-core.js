'use strict';
// Stan aplikacji, logowanie i wspólne funkcje interfejsu.
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const date = value => value ? new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';
const dateOnly = value => value ? new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)) : '—';
const targetHours = (priority,blocksSales) => blocksSales || priority === 'Wysoki' ? 4 : priority === 'Średni' ? 24 : 72;
const suggestedDeadline = ticket => new Date(Date.parse(ticket.createdAt) + targetHours(ticket.priority,ticket.blocksSales) * 3600000).toISOString();
const priorityScore = ticket => (ticket.blocksSales ? 4 : 0) + ({Wysoki:3,'Średni':2,Niski:1}[ticket.priority] || 0);
function dueCell(ticket){
 const planned=ticket.dueAt?dateOnly(ticket.dueAt):'Nie ustalono';
 const late=ticket.dueAt&&!Model.closed(ticket)&&scheduleDateKey(ticket.dueAt)<scheduleDateKey(new Date());
 return `<span class="cell-main planned-due ${late?'danger-text':''}">${planned}</span>${late?'<span class="due-overdue">Po terminie</span>':''}`;
}
const sizeFmt = bytes => bytes < 1024*1024 ? Math.ceil(bytes/1024)+' KB' : (bytes/1024/1024).toFixed(1)+' MB';
const iconPaths={message:'M21 11a8 8 0 0 1-8 8H5l-3 3V5a3 3 0 0 1 3-3h8a8 8 0 0 1 8 9zM7 7h8M7 12h6',plus:'M12 5v14M5 12h14',home:'m3 10 9-7 9 7v10H3zM9 20v-7h6v7',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',building:'M4 21V3h12v18M16 9h4v12M8 7h4M8 11h4M8 15h4M8 21v-3h4v3',chart:'M3 3v18h18M7 16v-4M12 16V7M17 16v-7',shield:'m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7zM8 12l3 3 5-6',clip:'m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7L13 2',arrow:'M5 12h14m-6-6 6 6-6 6',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',alert:'m12 3 10 18H2zM12 9v5M12 17h.01',check:'m5 12 4 4L19 6',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2'};
const icon = name => `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]||iconPaths.list}"/></svg></span>`;
const option = (value,label=value,current='') => `<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(label)}</option>`;
const empty = (title,text,action='') => `<div class="empty">${icon('list')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
const btn = (action,label,ic='plus',kind='') => `<button class="btn ${kind}" data-action="${action}">${icon(ic)}${esc(label)}</button>`;
const header = (title,description,action='') => `<div class="heading"><div><h1>${esc(title)}</h1>${description?`<p>${esc(description)}</p>`:''}</div>${action}</div>`;
let state, currentId, page='home', adminTab='users', selectedTicket=null, draftFiles=[], commentDraftFiles=[], editingCommentId=null, dirty=false, busy=false, editingUser=null, editingLocation=null;
let authUser=null, authClient=null;
let filters={q:'',status:'',city:'',priority:'',from:'',to:'',quick:'',sort:'urgent'};
let dashboardRange='30';
let ticketListScroll=0;
let attachmentPreviewUrl=null;
function rememberTicketList(){if(page==='tickets')ticketListScroll=window.scrollY;}
function restoreTicketList(){if(page==='tickets')requestAnimationFrame(()=>window.scrollTo(0,ticketListScroll));}
let scheduleMode='list',scheduleFilter='all',scheduleMonth=scheduleDateKey(new Date()).slice(0,7),scheduleSelectedDay=scheduleDateKey(new Date());
let quickCloseId=null,detailDirty=false,onlyUnreadNotifications=false,pendingRemote=null,syncing=false,updatesChannel=null,lastSeenProfile=null,seenNotificationIds=new Set(),syncErrorShown=false;
let previewProfileId=null;
function signedInProfile(){return state?.users.find(u=>u.authUserId===authUser?.id&&u.active&&!u.deletedAt);}
function canPreviewProfiles(){return !!authUser&&signedInProfile()?.role==='Administrator';}
function testProfiles(){return ['Koordynator','Kierownik lokalu','Użytkownik'].map((role,i)=>{const existing=state.users.find(u=>!u.authUserId&&u.active&&!u.deletedAt&&u.role===role);return existing||{id:'preview-'+i,name:'Konto testowe',email:'test@example.test',role,active:true,mpks:role==='Kierownik lokalu'?(state.locations.filter(l=>l.active!==false).slice(0,1).map(l=>l.mpk)):[]};});}
function user(){if(!authUser)return state.users.find(u=>u.id===currentId&&u.active)||state.users.find(u=>u.active&&u.role==='Administrator');const real=signedInProfile();if(real?.role==='Administrator'&&previewProfileId){const test=testProfiles().find(u=>u.id===previewProfileId);if(test)return test;}previewProfileId=null;return real;}
function switchTestProfile(id){if(!canPreviewProfiles())return false;const real=signedInProfile();if(id!==real.id&&!testProfiles().some(u=>u.id===id))return false;previewProfileId=id===real.id?null:id;currentId=user().id;return true;}

let authAccounts=[];
async function refreshAuthAccounts(){if(!isAdmin())throw Error('Tylko administrator może pobrać konta.');const {data,error}=await authClient.rpc('usterki_list_accounts');if(error)throw Error('Nie można pobrać kont Supabase. Uruchom skrypt supabase-access.sql. '+error.message);authAccounts=data||[];}
function pendingAccount(id){const a=authAccounts.find(a=>a.id===id);if(!a)return null;const existing=state.users.find(u=>u.authUserId===a.id)||state.users.find(u=>u.email?.trim().toLowerCase()===a.email.trim().toLowerCase());return existing?{...existing,email:a.email,authUserId:a.id,active:true,deletedAt:undefined}:{id:a.id,authUserId:a.id,email:a.email,name:a.email,role:'Użytkownik',mpks:[],active:true};}
function showNoAccess(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());document.body.classList.add('auth-screen');$('#navigation').innerHTML='';$('#notification-bell').hidden=true;$('.profile')?.classList.add('auth-hidden');$('#content').innerHTML='<section class="panel"><h1>Oczekujesz na nadanie dostępu</h1><p>Administrator musi przypisać rolę do Twojego konta. Jeśli dostęp został już nadany, odśwież stronę.</p><button class="btn secondary" data-action="open-account">Moje konto</button> <button class="btn" data-action="logout">Wyloguj się</button></section>';}

function authEye(visible=false){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>${visible?'<path d="m3 3 18 18"/>':''}</svg>`;}
function rememberedLoginEmail(){try{return localStorage.getItem('serwis-login-email')||'';}catch{return '';}}
function loginView(message=''){const email=rememberedLoginEmail();return `<div class="auth-card auth-frame auth-blue"><div class="auth-decoration" aria-hidden="true"><svg class="auth-wave" viewBox="0 0 460 110" preserveAspectRatio="none"><path d="M0 24C80 0 139 0 213 53S345 132 460 78V110H0Z" fill="white"/></svg></div><section class="auth-main" aria-labelledby="login-title"><h1 id="login-title"><span>Zaloguj się</span></h1>${message?`<p class="form-error" role="alert">${esc(message)}</p>`:''}<form id="login-form"><div class="field"><label for="login-email">E-mail</label><div class="auth-line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4"/><path d="m4 7 8 6 8-6"/></svg><input id="login-email" name="email" type="email" autocomplete="username" placeholder="twoj.email@firma.pl" value="${esc(email)}" required></div></div><div class="field"><label for="login-password">Hasło</label><div class="auth-line auth-password"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></svg><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Wpisz hasło" required minlength="6"><button type="button" class="password-toggle" data-action="toggle-password" aria-controls="login-password" aria-label="Pokaż hasło" aria-pressed="false">${authEye()}</button></div></div><div class="auth-options"><label class="auth-remember"><input name="rememberEmail" type="checkbox" ${email?'checked':''}><span>Zapamiętaj e-mail</span></label><button type="button" class="auth-link" data-action="auth-help" data-help="password">Nie pamiętasz hasła?</button></div><p class="auth-help" id="auth-help" role="status" tabindex="-1" hidden></p><button class="btn auth-submit" type="submit">Zaloguj się</button></form><p class="auth-support">Nie masz konta? <button type="button" class="auth-link" data-action="auth-help" data-help="access">Poproś o dostęp</button></p></section></div>`;}

function syncSidebar(){
 const button=$('.sidebar-toggle');if(!button)return;
 const mode=document.documentElement.dataset.sidebar;
 const wide=matchMedia('(min-width:1501px)').matches;
 const expanded=wide&&mode==='expanded';
 button.hidden=!wide;
 button.setAttribute('aria-label',expanded?'Zwiń menu':'Rozwiń menu');button.setAttribute('aria-expanded',String(expanded));
 button.querySelector('span').textContent=expanded?'Zwiń menu':'Rozwiń menu';
}
function toggleSidebar(){
 if(!matchMedia('(min-width:1501px)').matches)return;
 const expanded=$('.sidebar-toggle')?.getAttribute('aria-expanded')==='true';
 const mode=expanded?'collapsed':'expanded';document.documentElement.dataset.sidebar=mode;
 try{localStorage.setItem('serwis-sidebar-mode',mode)}catch{}syncSidebar();
}
document.documentElement.dataset.sidebar='collapsed';
try{const mode=localStorage.getItem('serwis-sidebar-mode');if(['expanded','collapsed'].includes(mode))document.documentElement.dataset.sidebar=mode}catch{}
matchMedia('(min-width:1501px)').addEventListener('change',syncSidebar);syncSidebar();
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&matchMedia('(min-width:1501px)').matches&&document.documentElement.dataset.sidebar==='expanded'&&!document.querySelector('dialog[open]')){toggleSidebar();$('.sidebar-toggle')?.focus();}});

function showAuth(message=''){document.body.classList.add('auth-screen');$('#navigation').innerHTML='';$('#content').innerHTML=loginView(message);$('#notification-bell').hidden=true;$('.profile')?.classList.add('auth-hidden');}
function showApp(){if(passwordRecovery&&authUser){showPasswordRecovery();return;}if(!user()){showNoAccess();return;}document.body.classList.remove('auth-screen');$('#notification-bell').hidden=false;$('.profile')?.classList.remove('auth-hidden');currentId=user().id;shell();window.onPushAppReady?.();}
async function submitLogin(form){if(!authClient)throw Error('Supabase nie jest jeszcze skonfigurowany.');const values=Object.fromEntries(new FormData(form));const {error}=await authClient.auth.signInWithPassword({email:values.email.trim(),password:values.password});if(error)throw error;try{if(values.rememberEmail)localStorage.setItem('serwis-login-email',values.email.trim());else localStorage.removeItem('serwis-login-email');}catch{}}
async function logout(){passwordRecovery=false;previewProfileId=null;try{await window.removePushForLogout?.();}catch(error){toast(error.message,true);}document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(authClient)await authClient.auth.signOut();else{authUser=null;showAuth();}}
function canManage(){return ['Koordynator','Administrator'].includes(user().role);}
function canClose(ticket){const u=user();return ['Koordynator','Administrator'].includes(u.role)||u.role==='Kierownik lokalu'&&!!ticket&&(u.mpks||[]).includes(ticket.mpk);}
function syncCategoryOptions(){
 const form=$('#new-form');if(!form)return;
 const category=form.querySelector('#category');
 const place=availablePlaces().find(item=>item.mpk===form.querySelector('#mpk')?.value);
 if(!place){category.disabled=true;category.innerHTML=option('','Najpierw wybierz lokal');return;}
 category.disabled=false;
 const matches=Model.categoriesForLocation(state.settings.categories,place);
 category.innerHTML=option('','Wybierz rodzaj usterki')+matches.map(item=>option(item)).join('');
}
function availablePlaces(){const u=user(),mpks=u.mpks||[];return state.locations.filter(l=>l.active&&(u.role==='Kierownik lokalu'?mpks.includes(l.mpk):u.role==='Użytkownik'&&mpks.length?mpks.includes(l.mpk):true));}
function isAdmin(){return user().role==='Administrator';}
function currentTickets(){return Model.visible(state,user());}
function toast(message,error=false){const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;node.setAttribute('role',error?'alert':'status');mountToast(node);setTimeout(()=>node.remove(),error?10000:6500);}
function showNewFormFieldError(field,message){
 if(!field)return false;
 const host=field.closest('.field,.dropzone,fieldset')||field.parentElement;
 let note=host.querySelector('.new-form-field-error');
 if(!note){note=document.createElement('span');note.className='new-form-field-error';note.id='error-'+(field.id||field.name);note.setAttribute('role','alert');host.append(note);}
 note.textContent=message;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',note.id);return true;
}
function clearNewFormFieldError(field){
 if(!field?.closest?.('#new-form'))return;
 field.removeAttribute('aria-invalid');
 if(field.id==='attachments')field.setAttribute('aria-describedby','attachment-error');else field.removeAttribute('aria-describedby');
 field.closest('.field,.dropzone,fieldset')?.querySelector('.new-form-field-error')?.remove();
}
function fail(error,form){
 const message=error?.message||'Nie udało się wykonać operacji.';
 if(form?.id==='new-form'){
  const fieldId=message.startsWith('Podaj imię')?'reporter':message.startsWith('Podaj prawidłowy numer')?'reporter-phone':message.startsWith('Wybierz aktywny obiekt')?'mpk':message.startsWith('Wybierz rodzaj')?'category':message.startsWith('Opis musi')?'description':message.startsWith('Dodaj co najmniej')?'attachments':'';
  const field=fieldId&&form.querySelector('#'+fieldId);
  if(showNewFormFieldError(field,message)){field.focus();toast(message,true);return;}
 }
 if(form){let p=form.querySelector('.form-error');if(!p){p=document.createElement('p');p.className='form-error';p.setAttribute('role','alert');if(form.id==='user-form')form.prepend(p);else form.append(p);}p.textContent=message;if(form.id==='user-form')p.scrollIntoView({block:'center'});}
 toast(message,true);
}
async function mutate(change,files=[],replace=false){if(canPreviewProfiles()&&previewProfileId)throw Error('To jest podgląd konta testowego. Wróć do swojego konta, aby zapisać zmiany.');const next=structuredClone(state);change(next);await persist(next,files,replace);}
function statusPill(status){const kind=status==='Nowe'?'new':status==='Zamknięte'?'closed':status==='Odrzucone'?'rejected':status.startsWith('Oczekuje')?'waiting':'progress';return `<span class="pill ${kind}">${esc(status)}</span>`;}
function priorityPill(priority){return `<span class="pill ${priority==='Wysoki'?'high':priority==='Średni'?'medium':'low'}">${esc(priority)}</span>`;}
function scheduleDateKey(value){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
