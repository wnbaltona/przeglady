// Jeden worker obsługuje instalację aplikacji i powiadomienia push.
async function registerAppWorker(){
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 await navigator.serviceWorker.register('./app-sw.js',{scope:'./'});
}

async function startApplication() {
  try {
    registerAppWorker().catch(error=>{window.appInstallError=error.message;});
    await openStore();
    await initializeAuth();


    if (authUser) {
      showApp();
      if(!passwordRecovery&&user()){announceProfile();startLiveSync();}
    }
  } catch (error) {
    showAuth(error.message);
  }
}

startApplication();
