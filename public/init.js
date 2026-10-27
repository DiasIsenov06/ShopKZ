/* ---------------------------------------------------------------- init */
(async function init(){
  try{ session = (await api('GET','/api/me')).user; }catch(e){ session = null; }
  await refreshAllProducts();
  await refreshCounts();
  await render();
})();
