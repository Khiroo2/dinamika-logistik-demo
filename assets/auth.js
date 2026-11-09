(function () {
  'use strict';
  const $=s=>document.querySelector(s);
  window.ownerReady = new Promise(async resolve => {
    let session;
    try {
      const r=await fetch('api/session',{cache:'no-store'});
      session=r.ok ? await r.json() : null;
      if (session?.mode!=='server') session=null;
    } catch (_) { session=null; }
    function showEditor() { $('#owner-main').hidden=false; $('#owner-login').hidden=true; $('#static-mode').hidden=true; }
    async function unlock(s) {
      const r=await fetch('api/settings',{cache:'no-store'});const data=await r.json();
      if(!r.ok)throw new Error('Не удалось загрузить настройки. Обновите страницу.');
      showEditor();$('#owner-session').hidden=false;
      $('#owner-logout').addEventListener('click',async()=>{
        const response=await fetch('api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:'{}'});
        if(response.ok)location.reload();
      });
      resolve({server:true,csrf:s.csrf,revision:data.revision,config:data.config});
    }
    if(!session) {
      $('#static-mode').hidden=false;
      $('#open-local-editor').addEventListener('click',()=>{showEditor();resolve({server:false});},{once:true});return;
    }
    $('#owner-login').hidden=false;
    if(!session.configured) { $('#login-note').textContent='Пароль ещё не создан. Запустите START_WINDOWS.bat и задайте его в окне запуска.'; $('#login-form').hidden=true;return; }
    if(session.authenticated) { try {await unlock(session);return;} catch(error){$('#login-status').textContent=error.message;} }
    $('#login-form').addEventListener('submit',async e=>{
      e.preventDefault();const button=e.submitter;button.disabled=true;$('#login-status').textContent='';
      try {
        const r=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#owner-password').value})});
        const data=await r.json();if(!r.ok)throw new Error(data.error||'Не удалось войти.');
        $('#owner-password').value='';await unlock(data);
      }catch(error){$('#login-status').textContent=error.message;}
      finally{button.disabled=false;}
    });
  });
})();
