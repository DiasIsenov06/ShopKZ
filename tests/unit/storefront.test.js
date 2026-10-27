// Exercise real storefront logic without a browser or the production database.
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
function storefront() {
  const storage = new Map();
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, setTimeout, clearTimeout,
    location: {origin: 'http://localhost', hash: ''},
    history: {replaceState() {}},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v)},
    matchMedia: () => ({matches: false, addEventListener() {}}),
    document: {documentElement:{dataset:{},style:{}},addEventListener(){}},
    window: {addEventListener(){},scrollTo(){}},
    scrollY: 0
  });
  context.window = context;
  context.addEventListener = () => {};
  context.scrollTo = () => {};
  for (const file of ['theme.js','app.js','enhancements.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,'public',file),'utf8'),context);
  }
  vm.runInContext(`render = async () => {}; toast = () => {};
    state.allProducts = [
      {id:'a',name:'Наушники',category:'Электроника',desc:'Bluetooth',price:10000,stock:2,img:'/a.svg',avgRating:0},
      {id:'b',name:'Рюкзак',category:'Одежда',desc:'Городской',price:20000,stock:0,img:'/b.svg',avgRating:0}
    ];`, context);
  return {run: code => vm.runInContext(code,context), storage};
}
test('theme choice survives storage and changes the whole document mode', () => {
  const s=storefront();s.run(`setTheme('dark')`);
  expect(s.run(`document.documentElement.dataset.theme`)).toBe('dark');
  expect(s.storage.get('shopkz.theme')).toBe('dark');
  s.run(`setTheme('system')`);expect(s.run(`document.documentElement.dataset.theme`)).toBe('light');
});
test('guest cart persists and prevents quantity above stock', async () => {
  const s=storefront();await s.run(`addToCart('a',2)`);await s.run(`addToCart('a',1)`);
  expect(JSON.parse(s.storage.get('shopkz.cart'))).toEqual([{productId:'a',qty:2}]);
});
test('guest wishlist toggles and persists independently of authentication', async () => {
  const s=storefront();await s.run(`toggleWishlist('a')`);expect(s.run(`isWished('a')`)).toBe(true);
  await s.run(`toggleWishlist('a')`);expect(JSON.parse(s.storage.get('shopkz.wishlist'))).toEqual([]);
});
test('comparison limits selection to four and allows removal', () => {
  const s=storefront();s.run(`['a','b','c','d','e'].forEach(toggleCompare)`);
  expect(JSON.parse(s.storage.get('shopkz.compare'))).toHaveLength(4);
  s.run(`toggleCompare('a')`);expect(JSON.parse(s.storage.get('shopkz.compare'))).not.toContain('a');
});
test('catalog search finds descriptions and escapes user query', async () => {
  const s=storefront();s.run(`state.search='Bluetooth'`);
  expect(await s.run(`viewHome()`)).toContain('Наушники');
  s.run(`state.search='<img src=x onerror=alert(1)>'`);
  const html=await s.run(`viewHome()`);expect(html).not.toContain('<img src=x');expect(html).toContain('&lt;img');
});
test('price and availability filters combine', async () => {
  const s=storefront();s.run(`state.minPrice='15000';state.onlyStock=true`);
  expect(await s.run(`viewHome()`)).toContain('Ничего не нашли');
});
test('unsafe image protocols fall back to a bundled asset', () => {
  const s=storefront();expect(s.run(`safeImage('javascript:alert(1)')`)).toBe('/assets/fallback.svg');
  expect(s.run(`safeImage('/assets/p001.svg')`)).toBe('http://localhost/assets/p001.svg');
});
test('restoring an excessive guest quantity clamps it to available stock', async () => {
  const s=storefront();s.run(`state.guestCart=[{productId:'a',qty:999}]`);await s.run(`refreshCounts()`);
  expect(s.run(`state.cartItems[0].qty`)).toBe(2);
});
