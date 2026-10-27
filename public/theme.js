(() => {
  const query = matchMedia('(prefers-color-scheme: dark)');
  let choice = 'system';
  try { choice = localStorage.getItem('shopkz.theme') || 'system'; } catch (_) {}
  function apply() {
    document.documentElement.dataset.theme = choice === 'system' ? (query.matches ? 'dark' : 'light') : choice;
    document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  }
  window.setTheme = value => {
    choice = ['light', 'dark', 'system'].includes(value) ? value : 'system';
    try { localStorage.setItem('shopkz.theme', choice); } catch (_) {}
    apply();
  };
  window.themeChoice = () => choice;
  query.addEventListener('change', () => { if(choice === 'system') apply(); });
  apply();
})();