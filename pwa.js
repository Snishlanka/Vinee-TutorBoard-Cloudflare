'use strict';
(() => {
  if (window.tutorDesktop || !/^https?:$/.test(location.protocol)) return;
  const byId=id=>document.getElementById(id);
  const scope=new URL('./',location.href).href;
  const bar=byId('app-state'),saveState=byId('draft-status'),offlineState=byId('offline-status');
  const board=window.TutorBoard;
  let store,ready=false,dirty=false,revision=0,savedRevision=0,timer,writeQueue=Promise.resolve();
  let draftId=crypto.randomUUID(),releaseLock=null,restoring=false;
  let offlineReady=false,registration=null,installPrompt=null;
  bar.hidden=false;
  const panelsObserver=new ResizeObserver(()=>{
    const controls=document.querySelector('.workspace-controls').getBoundingClientRect();
    document.body.style.setProperty('--panel-top',controls.bottom+'px');
    document.body.style.setProperty('--panel-bottom',bar.getBoundingClientRect().height+'px');
  });
  panelsObserver.observe(bar);panelsObserver.observe(document.querySelector('header'));panelsObserver.observe(document.querySelector('.workspace-controls'));
  const mobile=matchMedia('(max-width: 600px)');
  function adaptPanels(){if(mobile.matches){document.body.classList.add('pages-hidden','tools-hidden');syncPanels();}}
  adaptPanels();mobile.addEventListener('change',adaptPanels);
  document.getElementById('tools-panel').addEventListener('click',event=>{
    if(mobile.matches&&event.target.closest('[data-tool],#graph-tools,#geometry-tools,#image')){document.body.classList.add('tools-hidden');syncPanels();}
  });
  const report=(message,error=false)=>{saveState.textContent=message;saveState.classList.toggle('state-error',error);};
  function changed() {
    if(restoring) return;
    dirty=true;revision++;report('Unsaved changes');
    clearTimeout(timer);timer=setTimeout(()=>flush(),600);
  }
  document.addEventListener('lessonchange',changed);
  for(const id of ['title','tutor-name','text-editor']) byId(id).addEventListener('input',changed);
  byId('text-editor').addEventListener('keydown',event=>{if(event.key==='Escape')changed();});
  for(const type of ['input','change','click']) byId('text-options').addEventListener(type,()=>{if(!byId('text-editor').hidden)changed();});

  async function lock(id) {
    if(!navigator.locks) return {release:()=>{},exclusive:false};
    return new Promise((resolve,reject)=>{
      navigator.locks.request('vinee-draft:'+scope+':'+id,{ifAvailable:true},async held=>{
        if(!held){resolve(null);return;}
        await new Promise(release=>resolve({release,exclusive:true}));
      }).catch(reject);
    });
  }
  function flush() {
    clearTimeout(timer);
    writeQueue=writeQueue.catch(()=>false).then(async()=>{
      if(!ready) return false;
      if(!dirty) return true;
      const version=revision;
      try {
        const snapshot=board.snapshot();
        report('Saving on this device…');
        await store.put({id:draftId,savedAt:Date.now(),snapshot});
        savedRevision=version;
        dirty=revision!==version;
        report(dirty?'Unsaved changes':'Saved on this device');
        return !dirty;
      } catch(error) {
        dirty=true;
        report('Autosave failed — use Save lesson',true);
        console.warn('Local draft could not be saved',error);
        return false;
      }
    });
    return writeQueue;
  }
  window.TutorPWA={flush,hasUnsavedChanges:()=>dirty||board.isInteracting(),get savedRevision(){return savedRevision;}};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){board.commit();void flush();}});
  window.addEventListener('pagehide',()=>{board.commit();void flush();});

  const draftsDialog=byId('drafts-dialog');
  async function showDrafts(startup=false) {
    if(!ready) return;
    if(!startup){board.commit();if(!await flush())toast('Autosave failed. Delete an older draft to free space, or use Save lesson.');}
    try {
      const records=(await store.list()).sort((a,b)=>b.savedAt-a.savedAt);
      if(startup&&(!records.length||dirty)) return;
      const list=byId('draft-list');list.replaceChildren();
      for(const record of records) {
        const row=document.createElement('li'),label=document.createElement('div');
        const title=document.createElement('strong'),date=document.createElement('small');
        title.textContent=record.title||'Untitled lesson';
        date.textContent=new Date(record.savedAt).toLocaleString()+' · '+record.pageCount+' page(s)';
        label.append(title,date);
        const open=document.createElement('button');open.textContent=record.id===draftId?'Current lesson':'Restore';open.disabled=record.id===draftId;
        open.onclick=async()=>{
          open.disabled=true;
          let held;
          try {
            board.commit();if(!await flush()){toast('Could not save the current lesson. Free space before restoring another draft.');return;}
            held=await lock(record.id);
            if(!held){toast('This draft is open in another window. Close it there first.');return;}
            const fresh=await store.get(record.id);
            if(!fresh) throw Error('This draft has been removed in another window.');
            // Without Web Locks, restore a copy so two tabs can never overwrite each other.
            restoring=true;board.restore(fresh.snapshot);restoring=false;
            releaseLock?.();releaseLock=held.release;held=null;
            draftId=navigator.locks?record.id:crypto.randomUUID();
            dirty=false;revision++;savedRevision=revision;
            if(!navigator.locks){changed();await flush();}else report('Recovered · saved on this device');
            draftsDialog.close();toast('Lesson recovered. Keep a lesson file as a backup.');
          } catch(error){toast(error.message||'Could not restore this draft.');}
          finally{restoring=false;held?.release();open.disabled=false;}
        };
        const remove=document.createElement('button');remove.textContent='Delete';remove.disabled=record.id===draftId;
        remove.onclick=async()=>{
          if(!confirm('Delete this local draft? Downloaded lesson files are kept.'))return;
          let held;
          try {
            held=await lock(record.id);
            if(!held){toast('This draft is open in another window.');return;}
            // No safe cross-tab deletion without Web Locks.
            if(!held.exclusive){toast('Deleting drafts requires a browser with Web Locks support.');return;}
            await store.delete(record.id);row.remove();
          } catch{toast('Could not delete this draft.');}finally{held?.release();}
        };
        row.append(label,open,remove);list.append(row);
      }
      byId('draft-empty').hidden=!!records.length;
      if(!draftsDialog.open)draftsDialog.showModal();
    } catch(error){report('Drafts unavailable — use Save lesson',true);}
  }
  byId('show-drafts').onclick=()=>showDrafts();
  byId('drafts-close').onclick=()=>draftsDialog.close();
  (async()=>{
    try {
      store=await new TutorDraftStore(scope).open();
      const held=await lock(draftId);releaseLock=held?.release;
      ready=true;report(dirty?'Unsaved changes':'Autosave ready · this device only');
      byId('show-drafts').disabled=false;
      await showDrafts(true);
      if(dirty)await flush();
    }catch(error){report('Local saving unavailable — use Save lesson',true);}
  })();

  function networkStatus() {
    offlineState.textContent=offlineReady?(navigator.onLine?'Ready offline':'Offline · ready'):(navigator.onLine?'Preparing offline access…':'Offline access not ready');
  }
  async function verifyOffline() {
    const worker=registration?.active;
    if(!worker)return;
    try {
      const result=await new Promise((resolve,reject)=>{
        const channel=new MessageChannel();
        const timeout=setTimeout(()=>{channel.port1.close();reject(Error('Offline check timed out'));},5000);
        channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();resolve(event.data);};
        worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
      });
      offlineReady=!!result.complete;networkStatus();
      if(!offlineReady)offlineState.textContent='Offline files missing — reconnect and check updates';
    }catch{offlineState.textContent='Offline readiness could not be checked';}
  }
  function updateNotice() {
    byId('update-notice').hidden=!registration?.waiting;
  }
  async function checkUpdates() {
    if(!registration)return;
    try{await registration.update();updateNotice();await verifyOffline();}
    catch{toast('Update check unavailable. You can keep using the cached app.');}
  }
  byId('check-updates').onclick=checkUpdates;
  window.addEventListener('online',()=>{networkStatus();void checkUpdates();});
  window.addEventListener('offline',networkStatus);
  networkStatus();
  if('serviceWorker' in navigator&&window.isSecureContext){
    navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(async reg=>{
      registration=reg;byId('check-updates').disabled=false;updateNotice();
      reg.addEventListener('updatefound',()=>{
        const worker=reg.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed'){updateNotice();void verifyOffline();}
          if(worker.state==='redundant'&&!reg.active)offlineState.textContent='Offline setup failed — reconnect and retry';
        });
      });
      await navigator.serviceWorker.ready;await verifyOffline();
    }).catch(()=>{offlineState.textContent='Offline setup failed — reconnect and reload';});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{void verifyOffline();});
  }else offlineState.textContent='Offline installation requires HTTPS and a supported browser';

  const install=byId('install-app'),help=byId('install-dialog'),installNow=byId('install-now');
  const standalone=matchMedia('(display-mode: standalone)');
  let installedThisSession=false;
  function installed(){return installedThisSession||standalone.matches||navigator.standalone===true;}
  function installLabel(){
    const isInstalled=installed();
    install.textContent=isInstalled?'App help':installPrompt?'Install app':'Install / help';
    installNow.hidden=isInstalled||!installPrompt;
    byId('install-status').textContent=isInstalled
      ?'TutorBoard is already installed. You can keep using this window or open it from your installed apps.'
      :installPrompt
        ?'Your browser is ready to install TutorBoard. Choose Install app below.'
        :!window.isSecureContext
          ?'This address is not a secure connection. Open the HTTPS version of TutorBoard to enable offline installation.'
          :'Your browser has not offered an in-page install prompt. This help window does not install the app. In Edge, use the browser menu below, or check edge://apps if you installed TutorBoard before.';
  }
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installLabel();});
  window.addEventListener('appinstalled',()=>{installedThisSession=true;installPrompt=null;installLabel();toast('TutorBoard installed.');});
  standalone.addEventListener('change',installLabel);
  async function requestInstall(){
    if(!installPrompt||installed()){installLabel();if(!help.open)help.showModal();return;}
    const prompt=installPrompt;installPrompt=null;installNow.disabled=true;
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice.outcome==='accepted'){if(help.open)help.close();}
      else{installLabel();if(!help.open)help.showModal();}
    }catch{installLabel();if(!help.open)help.showModal();}
    finally{installNow.disabled=false;installLabel();}
  }
  install.onclick=requestInstall;
  installNow.onclick=requestInstall;
  byId('install-close').onclick=()=>help.close();
  byId('keep-storage').onclick=async()=>{
    try {
      const granted=await navigator.storage?.persist?.();
      byId('storage-help').textContent=granted?'Persistent storage enabled. Keep downloaded lesson backups too.':'Your browser manages storage. Keep downloaded lesson backups; clearing site data removes drafts.';
    }catch{byId('storage-help').textContent='Storage permission unavailable. Keep downloaded lesson backups.';}
  };
  installLabel();
})();
