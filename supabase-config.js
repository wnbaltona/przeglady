/* Uzupełnij dane projektu Supabase przed publikacją aplikacji.
   Klucz anon jest bezpieczny po włączeniu RLS; NIGDY nie wpisuj tu service_role. */
window.APP_CONFIG={
  supabaseUrl:'https://bsisclhysmvzqgggnpna.supabase.co',
  supabaseAnonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzaXNjbGh5c212enFnZ2ducG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDEwNjQsImV4cCI6MjEwMDcxNzA2NH0._ZcGGj0FTRf1NsO1WvVXVchwwozaaaeaPUKKKRi1hcM',
  allowRegistration:false,
  inactivityHours:3,
  // Wklej tutaj PUBLICZNY klucz VAPID wygenerowany przez GENERUJ_KLUCZE_PUSH.ps1.
  // Klucza prywatnego nigdy nie wpisuj do tego pliku ani do GitHub.
  pushVapidPublicKey:'BDjVwnvDKvuTQS7S4DXoP4S259Xd0ILlTvI_3QR7f0OSmwnmR2Ajkd-gslpiQZ8T28Sias3gE7pFaTWtWjwdyXI'
};
