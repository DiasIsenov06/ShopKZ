/* =====================================================================
   ShopKZ — клиентская часть (SPA без фреймворков).
   Общается с сервером через fetch() /api/*, сервер хранит данные в SQLite.
   Создан как объект тестирования для практических работ по QA:
   ПР№1 (анализ требований) и ПР№2 (STLC / стратегия тестирования).
   ===================================================================== */

let session = null;            // текущий пользователь (без пароля)
let state = {
  route: 'home',
  params: {},
  search: '',
  category: 'Все',
  sort: 'default',
  authError: '',
  checkoutError: '',
  promoError: '',
  productTab: 'desc',
  adminTab: 'products',
  modal: null,
  appliedPromo: null,
  cartItems: [],
  wishlistIds: [],
  allProducts: []              // для списка категорий в шапке
};

/* ---------------------------------------------------------------- utils */
function uid(prefix){ return prefix + Math.random().toString(36).slice(2,9); }
function money(n){ return Number(n).toLocaleString('ru-RU') + ' ₸'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function jsAttr(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function toast(msg, kind){
  const wrap = document.getElementById('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  if(kind==='err') el.style.background = 'var(--danger)';
  if(kind==='ok') el.style.background = 'var(--ok)';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, 3200);
}
async function api(method, url, body){
  const res = await fetch(url, {
    method,
    headers: body!==undefined ? {'Content-Type':'application/json'} : undefined,
    body: body!==undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = {};
  try{ data = await res.json(); }catch(e){}
  if(!res.ok) throw new Error(data.error || 'Ошибка запроса.');
  return data;
}
async function navigate(route, params){
  state.route = route;
  state.params = params || {};
  state.checkoutError = '';
  window.scrollTo(0,0);
  await render();
}
function starString(avg){
  const full = Math.round(avg);
  return '★'.repeat(full) + '☆'.repeat(5-full);
}
function cartCount(){ return state.cartItems.reduce((s,i)=>s+i.qty,0); }
function cartTotal(items){ return items.reduce((s,i)=>s+i.price*i.qty,0); }
function statusLabel(s){
  return {processing:'В обработке', shipped:'Отправлен', delivered:'Доставлен', cancelled:'Отменён', pending_cancel:'Заявка на отмену'}[s] || s;
}
function luhnOk(num){
  const digits = num.replace(/\D/g,'');
  if(digits.length!==16) return false;
  let sum=0, alt=false;
  for(let i=digits.length-1;i>=0;i--){
    let d = parseInt(digits[i],10);
    if(alt){ d*=2; if(d>9) d-=9; }
    sum+=d; alt=!alt;
  }
  return sum%10===0;
}

/* ---------------------------------------------------------------- refresh caches */
async function refreshCounts(){
  if(!session){ state.cartItems=[]; state.wishlistIds=[]; return; }
  try{ state.cartItems = (await api('GET','/api/cart')).items; }catch(e){ state.cartItems=[]; }
  try{ state.wishlistIds = (await api('GET','/api/wishlist')).ids; }catch(e){ state.wishlistIds=[]; }
}
async function refreshAllProducts(){
  try{ state.allProducts = (await api('GET','/api/products')).products; }catch(e){ state.allProducts=[]; }
}

/* ---------------------------------------------------------------- auth */
async function doRegister(email,password,name,phone){
  try{
    const {user} = await api('POST','/api/register',{email,password,name,phone});
    session = user;
    state.authError='';
    await refreshCounts();
    toast('Регистрация прошла успешно. Добро пожаловать, '+user.name+'!', 'ok');
    await navigate('home');
  }catch(e){ state.authError = e.message; await render(); }
}
async function doLogin(email,password){
  try{
    const {user} = await api('POST','/api/login',{email,password});
    session = user;
    state.authError='';
    await refreshCounts();
    toast('Вы вошли как '+user.name, 'ok');
    await navigate(user.role==='admin' ? 'admin' : 'home');
  }catch(e){ state.authError = e.message; await render(); }
}
async function logout(){
  try{ await api('POST','/api/logout'); }catch(e){}
  session = null;
  state.cartItems=[]; state.wishlistIds=[];
  toast('Вы вышли из аккаунта');
  await navigate('home');
}
async function requireAuthOrRedirect(){
  if(!session){ await navigate('auth', {mode:'login'}); return false; }
  return true;
}

/* ---------------------------------------------------------------- cart */
async function addToCart(productId, qty){
  if(!(await requireAuthOrRedirect())) return;
  try{
    state.cartItems = (await api('POST','/api/cart',{productId, qty: qty||1})).items;
    const p = state.allProducts.find(p=>p.id===productId);
    toast('Добавлено в корзину'+(p?': '+p.name:''), 'ok');
    await render();
  }catch(e){ toast(e.message, 'err'); }
}
async function changeCartQty(productId, delta){
  const item = state.cartItems.find(i=>i.productId===productId);
  if(!item) return;
  const newQty = item.qty + delta;
  try{
    state.cartItems = (await api('PUT','/api/cart/'+productId,{qty:newQty})).items;
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function removeFromCart(productId){
  try{
    state.cartItems = (await api('DELETE','/api/cart/'+productId)).items;
    toast('Товар удалён из корзины');
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function applyPromo(code){
  try{
    const {promo} = await api('POST','/api/promo/apply',{code});
    state.appliedPromo = promo;
    state.promoError='';
    toast('Промокод применён: -'+promo.percent+'%', 'ok');
  }catch(e){ state.promoError = e.message; }
  await render();
}

/* ---------------------------------------------------------------- wishlist */
async function toggleWishlist(productId){
  if(!(await requireAuthOrRedirect())) return;
  try{
    const {wished} = await api('POST','/api/wishlist/'+productId);
    if(wished) state.wishlistIds.push(productId);
    else state.wishlistIds = state.wishlistIds.filter(id=>id!==productId);
    await render();
  }catch(e){ toast(e.message,'err'); }
}
function isWished(productId){ return state.wishlistIds.includes(productId); }

/* ---------------------------------------------------------------- checkout / orders */
async function onCheckoutSubmit(form){
  const body = {
    address: form.address.value,
    phone: form.phone.value,
    payment: form.payment.value,
    cardNumber: form.cardNumber ? form.cardNumber.value : '',
    cardExpiry: form.cardExpiry ? form.cardExpiry.value : '',
    cardCvv: form.cardCvv ? form.cardCvv.value : '',
    promoCode: state.appliedPromo ? state.appliedPromo.code : null
  };
  try{
    const {order} = await api('POST','/api/orders', body);
    state.appliedPromo = null;
    await refreshCounts();
    await refreshAllProducts();
    toast('Заказ '+order.id+' оформлен! Уведомление отправлено на '+session.email, 'ok');
    await navigate('order-confirm', {id: order.id});
  }catch(e){ state.checkoutError = e.message; await render(); }
}
async function cancelOrder(orderId){
  try{
    const {status} = await api('POST','/api/orders/'+orderId+'/cancel');
    toast(status==='cancelled' ? 'Заказ '+orderId+' отменён бесплатно.' : 'Прошло более 30 минут. Заявка на отмену отправлена в поддержку.', 'ok');
    await refreshAllProducts();
    await navigate('orders');
  }catch(e){ toast(e.message,'err'); }
}

/* ---------------------------------------------------------------- profile & reviews */
async function updateProfile(name,phone,address){
  try{
    const {user} = await api('PUT','/api/profile',{name,phone,address});
    session = user;
    toast('Профиль обновлён', 'ok');
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function changePassword(oldPassword,newPassword){
  try{
    await api('PUT','/api/profile/password',{oldPassword,newPassword});
    toast('Пароль изменён. Письмо-подтверждение отправлено на '+session.email, 'ok');
  }catch(e){ toast(e.message,'err'); }
}
async function submitReview(productId, rating, text){
  if(!(await requireAuthOrRedirect())) return;
  if(!rating){ toast('Поставьте оценку', 'err'); return; }
  try{
    await api('POST','/api/products/'+productId+'/reviews',{rating:Number(rating), text});
    toast('Спасибо за отзыв!', 'ok');
    await navigate('product', {id: productId});
  }catch(e){ toast(e.message,'err'); }
}

/* ---------------------------------------------------------------- admin */
function openProductModal(id){
  state.modal = {type:'product', id: id||null};
  render();
}
async function adminSaveProduct(data, existingId){
  try{
    if(existingId) await api('PUT','/api/admin/products/'+existingId, data);
    else await api('POST','/api/admin/products', data);
    toast(existingId ? 'Товар обновлён' : 'Товар добавлен', 'ok');
    state.modal = null;
    await refreshAllProducts();
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function adminDeleteProduct(id, name){
  if(!confirm('Удалить товар «'+name+'»?')) return;
  try{
    await api('DELETE','/api/admin/products/'+id);
    toast('Товар удалён');
    await refreshAllProducts();
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function adminUpdateStatus(orderId, status){
  try{
    await api('PUT','/api/admin/orders/'+orderId+'/status', {status});
    toast('Статус заказа '+orderId+' изменён на «'+statusLabel(status)+'». Клиенту отправлено уведомление.', 'ok');
    await refreshAllProducts();
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function adminAddPromo(code,percent){
  try{
    await api('POST','/api/admin/promos', {code, percent:Number(percent)});
    toast('Промокод добавлен', 'ok');
    await render();
  }catch(e){ toast(e.message,'err'); }
}
async function adminTogglePromo(code){
  try{
    await api('PUT','/api/admin/promos/'+code+'/toggle');
    await render();
  }catch(e){ toast(e.message,'err'); }
}

/* =====================================================================
   RENDER
   ===================================================================== */
async function render(){
  const app = document.getElementById('app');
  let content;
  try{ content = await routeContent(); }
  catch(e){
    console.error(e);
    content = `<div class="empty-state">Ошибка загрузки: ${esc(e.message)}<br><button class="btn btn-outline" onclick="navigate('home')">На главную</button></div>`;
  }
  app.innerHTML = layoutHeader() + content + layoutFooter();
}
async function routeContent(){
  switch(state.route){
    case 'home': return await viewHome();
    case 'product': return await viewProduct(state.params.id);
    case 'cart': return viewCart();
    case 'checkout': return await viewCheckout();
    case 'order-confirm': return await viewOrderConfirm(state.params.id);
    case 'orders': return await viewOrders();
    case 'wishlist': return await viewWishlist();
    case 'profile': return viewProfile();
    case 'auth': return viewAuth();
    case 'admin': return await viewAdmin();
    default: return await viewHome();
  }
}

function layoutHeader(){
  const cats = ['Все', ...new Set(state.allProducts.map(p=>p.category))];
  return `
  <div class="topbar"><div class="topbar-in">
    <span>ShopKZ — учебная демо-платформа для практических работ по тестированию ПО</span>
    <span>${session ? 'Вы вошли как <b>'+esc(session.name)+'</b>'+(session.role==='admin'?' (админ)':'') : 'Гость'}</span>
  </div></div>
  <header class="site"><div class="header-in">
    <a class="logo" href="#" onclick="navigate('home');return false;">Shop<span>KZ</span></a>
    <form class="searchbar" onsubmit="state.search=this.q.value;navigate('home');return false;">
      <input name="q" placeholder="Найти товар…" value="${esc(state.search)}">
      <button type="submit">Найти</button>
    </form>
    <div class="nav-icons">
      <button class="icon-btn" onclick="navigate('wishlist');return false;">
        <span class="icon-glyph">♡</span>Избранное
        ${state.wishlistIds.length ? `<span class="badge">${state.wishlistIds.length}</span>` : ''}
      </button>
      <button class="icon-btn" onclick="navigate('cart');return false;">
        <span class="icon-glyph">🛒</span>Корзина
        ${cartCount() ? `<span class="badge">${cartCount()}</span>` : ''}
      </button>
      ${session ? `
        <button class="icon-btn" onclick="navigate('orders');return false;"><span class="icon-glyph">📦</span>Заказы</button>
        <button class="icon-btn" onclick="navigate('profile');return false;"><span class="icon-glyph">👤</span>Профиль</button>
        ${session.role==='admin' ? `<button class="icon-btn" onclick="navigate('admin');return false;"><span class="icon-glyph">⚙</span>Админ</button>` : ''}
        <button class="icon-btn" onclick="logout();return false;"><span class="icon-glyph">⏻</span>Выйти</button>
      ` : `<button class="icon-btn" onclick="navigate('auth',{mode:'login'});return false;"><span class="icon-glyph">👤</span>Войти</button>`}
    </div>
  </div>
  <div class="catnav"><div class="catnav-in">
    ${cats.map(c=>`<a class="chip ${state.category===c?'active':''}" href="#" onclick="state.category='${esc(c)}';navigate('home');return false;">${esc(c)}</a>`).join('')}
  </div></div>
  </header>`;
}
function layoutFooter(){
  return `<footer class="site"><div class="footer-in">
    <span>© ShopKZ — демо-объект тестирования. Создан для практических работ №1 и №2 по анализу требований и STLC.</span>
    <span>Тестовая карта для проверки отказа платежа: 4000 0000 0000 0002</span>
  </div></footer>`;
}

/* ---------------------------------------------------------------- HOME */
async function viewHome(){
  const q = new URLSearchParams();
  if(state.search) q.set('search', state.search);
  if(state.category!=='Все') q.set('category', state.category);
  if(state.sort!=='default') q.set('sort', state.sort);
  const {products: list} = await api('GET','/api/products?'+q.toString());

  return `
  <div style="margin-top:26px;padding:34px 30px;border-radius:var(--radius);background:linear-gradient(120deg,var(--primary-dark),var(--primary));color:#fff;">
    <h1 class="display" style="color:#fff;font-size:30px;max-width:520px;">Всё для дома, стиля и техники — в одном каталоге</h1>
    <p style="opacity:.85;max-width:480px;margin-top:8px;">${state.allProducts.length} товаров, ${new Set(state.allProducts.map(p=>p.category)).size} категории. Доставка по всему Казахстану.</p>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
    <h2 class="section-title">${state.category==='Все'?'Каталог':esc(state.category)} ${state.search?'· поиск: «'+esc(state.search)+'»':''} <span class="muted" style="font-size:14px;font-weight:400;">(${list.length})</span></h2>
    <select onchange="state.sort=this.value;render();" style="border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px;background:#fff;">
      <option value="default" ${state.sort==='default'?'selected':''}>По умолчанию</option>
      <option value="price_asc" ${state.sort==='price_asc'?'selected':''}>Сначала дешевле</option>
      <option value="price_desc" ${state.sort==='price_desc'?'selected':''}>Сначала дороже</option>
      <option value="rating" ${state.sort==='rating'?'selected':''}>По рейтингу</option>
    </select>
  </div>
  ${list.length ? `<div class="grid-products">${list.map(productCard).join('')}</div>` : `<div class="empty-state">Ничего не найдено. Попробуйте изменить запрос или категорию.</div>`}
  `;
}

function productCard(p){
  return `
  <div class="p-card">
    <a href="#" onclick="navigate('product',{id:'${p.id}'});return false;" style="color:inherit;">
      <div class="thumb"><img src="${p.img}" alt="${esc(p.name)}" loading="lazy"></div>
    </a>
    <button class="wish-toggle" onclick="toggleWishlist('${p.id}');return false;" title="В избранное">${isWished(p.id)?'♥':'♡'}</button>
    <div class="body">
      <span class="cat">${esc(p.category)}</span>
      <a href="#" onclick="navigate('product',{id:'${p.id}'});return false;"><span class="name">${esc(p.name)}</span></a>
      ${p.avgRating ? `<span class="stars">${starString(p.avgRating)} <span class="muted">(${p.reviewCount})</span></span>` : `<span class="muted" style="font-size:12px;">Пока нет отзывов</span>`}
      ${p.stock===0 ? `<span class="out-of-stock">Нет в наличии</span>` : (p.stock<=3 ? `<span class="low-stock">Осталось: ${p.stock}</span>` : '')}
      <span class="price">${money(p.price)}</span>
      <button class="btn btn-primary btn-sm" ${p.stock===0?'disabled':''} onclick="addToCart('${p.id}',1);return false;">${p.stock===0?'Нет в наличии':'В корзину'}</button>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- PRODUCT */
async function viewProduct(id){
  let data;
  try{ data = await api('GET','/api/products/'+id); }
  catch(e){ return `<div class="empty-state">Товар не найден.<br><button class="btn btn-outline" style="margin-top:12px;" onclick="navigate('home')">К каталогу</button></div>`; }
  const p = data.product, revs = data.reviews;
  const wished = isWished(id);
  return `
  <div class="breadcrumb"><a href="#" onclick="navigate('home');return false;">Каталог</a> / ${esc(p.category)} / ${esc(p.name)}</div>
  <div class="p-detail">
    <div class="thumb-big"><img src="${p.img}" alt="${esc(p.name)}"></div>
    <div>
      <span class="muted">${esc(p.category)}</span>
      <h1 style="font-size:26px;margin:6px 0 10px;">${esc(p.name)}</h1>
      ${p.avgRating ? `<div class="stars" style="font-size:15px;">${starString(p.avgRating)} <span class="muted">${p.avgRating.toFixed(1)} · ${revs.length} отзывов</span></div>` : `<div class="muted">Пока нет отзывов</div>`}
      <div class="display" style="font-size:30px;color:var(--primary-dark);margin:16px 0;">${money(p.price)}</div>
      ${p.stock===0 ? `<p class="out-of-stock">Товара нет в наличии</p>` : (p.stock<=3 ? `<p class="low-stock">Осталось всего ${p.stock} шт.</p>` : `<p class="success-text">В наличии</p>`)}
      <div style="display:flex;align-items:center;gap:14px;margin:16px 0;">
        <div class="qty-stepper">
          <button onclick="document.getElementById('pqty').innerText=Math.max(1,parseInt(document.getElementById('pqty').innerText)-1)">−</button>
          <span id="pqty">1</span>
          <button onclick="document.getElementById('pqty').innerText=Math.min(${p.stock||1},parseInt(document.getElementById('pqty').innerText)+1)">+</button>
        </div>
        <button class="btn btn-primary" ${p.stock===0?'disabled':''} onclick="addToCart('${p.id}',parseInt(document.getElementById('pqty').innerText));return false;">Добавить в корзину</button>
        <button class="btn btn-outline" onclick="toggleWishlist('${p.id}');return false;">${wished?'♥ В избранном':'♡ В избранное'}</button>
      </div>
      <div class="tabs">
        <div class="tab ${state.productTab==='desc'?'active':''}" onclick="state.productTab='desc';render();">Описание</div>
        <div class="tab ${state.productTab==='reviews'?'active':''}" onclick="state.productTab='reviews';render();">Отзывы (${revs.length})</div>
      </div>
      ${state.productTab==='desc' ? `<p>${esc(p.desc)}</p>` : renderReviewsTab(p.id, revs)}
    </div>
  </div>`;
}
function renderReviewsTab(productId, revs){
  return `
  ${session ? `
  <form onsubmit="submitReview('${productId}', this.rating.value, this.text.value); return false;" style="margin-bottom:20px;background:var(--bg);padding:14px;border-radius:var(--radius);border:1px solid var(--line);">
    <div class="field"><label>Ваша оценка</label>
      <select name="rating" required>
        <option value="">Выберите оценку</option>
        <option value="5">★★★★★ Отлично</option>
        <option value="4">★★★★☆ Хорошо</option>
        <option value="3">★★★☆☆ Нормально</option>
        <option value="2">★★☆☆☆ Плохо</option>
        <option value="1">★☆☆☆☆ Очень плохо</option>
      </select>
    </div>
    <div class="field"><label>Комментарий (необязательно)</label><textarea name="text" rows="2" placeholder="Расскажите о товаре…"></textarea></div>
    <button class="btn btn-primary btn-sm" type="submit">Оставить отзыв</button>
  </form>` : `<p class="muted"><a href="#" style="color:var(--primary);text-decoration:underline;" onclick="navigate('auth',{mode:'login'});return false;">Войдите</a>, чтобы оставить отзыв.</p>`}
  ${revs.length ? revs.map(r=>`
    <div class="review">
      <div style="display:flex;justify-content:space-between;">
        <b>${esc(r.author)}</b><span class="stars">${starString(r.rating)}</span>
      </div>
      ${r.text ? `<p style="margin:6px 0 0;">${esc(r.text)}</p>` : ''}
    </div>`).join('') : `<p class="muted">Отзывов пока нет — станьте первым.</p>`}
  `;
}

/* ---------------------------------------------------------------- CART */
function viewCart(){
  const cart = state.cartItems;
  if(!cart.length) return `<h2 class="section-title">Корзина</h2><div class="empty-state">Корзина пуста.<br><button class="btn btn-primary" style="margin-top:14px;" onclick="navigate('home')">Перейти в каталог</button></div>`;
  const subtotal = cartTotal(cart);
  const discount = state.appliedPromo ? state.appliedPromo.percent : 0;
  const total = Math.round(subtotal*(1-discount/100));
  return `
  <h2 class="section-title">Корзина</h2>
  <div style="display:grid;grid-template-columns:1fr 300px;gap:28px;align-items:start;">
    <div class="card" style="padding:6px 18px;">
      ${cart.map(i=>`<div class="cart-row">
          <img src="${i.img}" alt="">
          <div>
            <a href="#" onclick="navigate('product',{id:'${i.productId}'});return false;"><b>${esc(i.name)}</b></a>
            <div class="muted" style="font-size:12.5px;">${money(i.price)} / шт</div>
          </div>
          <div class="qty-stepper">
            <button onclick="changeCartQty('${i.productId}',-1)">−</button>
            <span>${i.qty}</span>
            <button onclick="changeCartQty('${i.productId}',1)">+</button>
          </div>
          <b>${money(i.price*i.qty)}</b>
          <button class="btn btn-sm btn-outline" onclick="removeFromCart('${i.productId}')">Удалить</button>
        </div>`).join('')}
    </div>
    <div class="cart-summary">
      <form onsubmit="applyPromo(this.code.value);return false;" style="display:flex;gap:6px;margin-bottom:14px;">
        <input name="code" placeholder="Промокод" style="flex:1;border:1px solid var(--line);border-radius:var(--radius);padding:8px 10px;" value="${state.appliedPromo?state.appliedPromo.code:''}">
        <button class="btn btn-outline btn-sm" type="submit">ОК</button>
      </form>
      ${state.promoError ? `<div class="error-text">${esc(state.promoError)}</div>` : ''}
      ${state.appliedPromo ? `<div class="success-text">Промокод ${state.appliedPromo.code} применён (-${state.appliedPromo.percent}%)</div>` : ''}
      <div class="line"><span>Сумма товаров</span><span>${money(subtotal)}</span></div>
      ${discount ? `<div class="line"><span>Скидка</span><span>-${discount}%</span></div>` : ''}
      <div class="line total"><span>Итого</span><span>${money(total)}</span></div>
      <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="navigate('checkout')">Оформить заказ</button>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- CHECKOUT */
async function viewCheckout(){
  if(!(await requireAuthOrRedirect())) return '';
  const cart = state.cartItems;
  if(!cart.length) return `<h2 class="section-title">Оформление заказа</h2><div class="empty-state">Корзина пуста.</div>`;
  const subtotal = cartTotal(cart);
  const discount = state.appliedPromo ? state.appliedPromo.percent : 0;
  const total = Math.round(subtotal*(1-discount/100));
  return `
  <h2 class="section-title">Оформление заказа</h2>
  <div style="display:grid;grid-template-columns:1fr 300px;gap:28px;align-items:start;">
    <form class="card" style="padding:22px;" onsubmit="onCheckoutSubmit(this);return false;">
      <h3 style="font-size:16px;margin-bottom:14px;">Доставка</h3>
      <div class="field"><label>Адрес доставки</label><input name="address" required value="${esc(session.address||'')}" placeholder="Город, улица, дом, квартира"></div>
      <div class="field"><label>Телефон</label><input name="phone" required value="${esc(session.phone||'')}" placeholder="+7 700 000 00 00"></div>
      <h3 style="font-size:16px;margin:20px 0 14px;">Оплата</h3>
      <div class="field">
        <label><input type="radio" name="payment" value="card" checked onclick="document.getElementById('cardFields').style.display='block'"> Банковская карта</label>
        <label style="margin-top:6px;"><input type="radio" name="payment" value="ewallet" onclick="document.getElementById('cardFields').style.display='none'"> Электронный кошелёк</label>
      </div>
      <div id="cardFields">
        <div class="field"><label>Номер карты</label><input name="cardNumber" placeholder="0000 0000 0000 0000" maxlength="19"></div>
        <div class="hint" style="margin:-8px 0 12px;">Для проверки отказа платежа используйте 4000 0000 0000 0002</div>
        <div class="row">
          <div class="field"><label>Срок действия</label><input name="cardExpiry" placeholder="ММ/ГГ" maxlength="5"></div>
          <div class="field"><label>CVV</label><input name="cardCvv" placeholder="000" maxlength="3"></div>
        </div>
      </div>
      ${state.checkoutError ? `<div class="error-text">${esc(state.checkoutError)}</div>` : ''}
      <button class="btn btn-accent" style="width:100%;margin-top:8px;" type="submit">Оплатить и подтвердить заказ</button>
    </form>
    <div class="cart-summary">
      <h3 style="font-size:15px;margin-bottom:10px;">Ваш заказ</h3>
      ${cart.map(i=>`<div class="line"><span>${esc(i.name)} × ${i.qty}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}
      <div class="line"><span>Сумма</span><span>${money(subtotal)}</span></div>
      ${discount?`<div class="line"><span>Скидка</span><span>-${discount}%</span></div>`:''}
      <div class="line total"><span>Итого</span><span>${money(total)}</span></div>
    </div>
  </div>`;
}

async function viewOrderConfirm(id){
  let order;
  try{ order = (await api('GET','/api/orders/'+id)).order; }
  catch(e){ return `<div class="empty-state">Заказ не найден.</div>`; }
  return `
  <div class="empty-state">
    <div style="font-size:44px;">✅</div>
    <h2 style="margin:10px 0;">Заказ ${order.id} принят</h2>
    <p class="muted">Мы отправили подтверждение на ${esc(order.user_email)}. Сумма к оплате: <b>${money(order.total)}</b></p>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
      <button class="btn btn-primary" onclick="navigate('orders')">Мои заказы</button>
      <button class="btn btn-outline" onclick="navigate('home')">Продолжить покупки</button>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- ORDERS */
async function viewOrders(){
  if(!(await requireAuthOrRedirect())) return '';
  const {orders} = await api('GET','/api/orders');
  if(!orders.length) return `<h2 class="section-title">Мои заказы</h2><div class="empty-state">У вас пока нет заказов.<br><button class="btn btn-primary" style="margin-top:14px;" onclick="navigate('home')">В каталог</button></div>`;
  return `<h2 class="section-title">Мои заказы</h2>
  <div style="display:flex;flex-direction:column;gap:14px;">
    ${orders.map(o=>{
      const canFreeCancel = Date.now()-o.created_at < 30*60*1000;
      const canCancel = ['processing'].includes(o.status);
      return `
      <div class="card" style="padding:16px 18px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div><b>${o.id}</b> <span class="muted">· ${new Date(o.created_at).toLocaleString('ru-RU')}</span></div>
          <span class="badge-pill status-${o.status}">${statusLabel(o.status)}</span>
        </div>
        <div class="muted" style="margin:8px 0;font-size:13px;">${o.items.map(i=>esc(i.name)+' ×'+i.qty).join(', ')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b>${money(o.total)}</b>
          ${canCancel ? `<button class="btn btn-sm btn-danger" onclick="cancelOrder('${o.id}')">${canFreeCancel?'Отменить заказ (бесплатно)':'Запросить отмену'}</button>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------------------------------------------------------------- WISHLIST */
async function viewWishlist(){
  if(!(await requireAuthOrRedirect())) return '';
  const {products: list} = await api('GET','/api/wishlist');
  return `<h2 class="section-title">Избранное</h2>
  ${list.length ? `<div class="grid-products">${list.map(productCard).join('')}</div>` : `<div class="empty-state">Список избранного пуст.</div>`}`;
}

/* ---------------------------------------------------------------- PROFILE */
function viewProfile(){
  if(!session) return '';
  return `<h2 class="section-title">Профиль</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:760px;">
    <form class="card" style="padding:20px;" onsubmit="updateProfile(this.name.value,this.phone.value,this.address.value);return false;">
      <h3 style="font-size:15px;margin-bottom:12px;">Личные данные</h3>
      <div class="field"><label>Email</label><input value="${esc(session.email)}" disabled></div>
      <div class="field"><label>Имя</label><input name="name" value="${esc(session.name)}" required></div>
      <div class="field"><label>Телефон</label><input name="phone" value="${esc(session.phone||'')}"></div>
      <div class="field"><label>Адрес доставки по умолчанию</label><input name="address" value="${esc(session.address||'')}"></div>
      <button class="btn btn-primary" type="submit">Сохранить</button>
    </form>
    <form class="card" style="padding:20px;" onsubmit="changePassword(this.old.value,this.next.value);this.reset();return false;">
      <h3 style="font-size:15px;margin-bottom:12px;">Смена пароля</h3>
      <div class="field"><label>Текущий пароль</label><input type="password" name="old" required></div>
      <div class="field"><label>Новый пароль</label><input type="password" name="next" required></div>
      <div class="hint">Требует подтверждения по email (симуляция).</div>
      <button class="btn btn-outline" style="margin-top:10px;" type="submit">Изменить пароль</button>
    </form>
  </div>`;
}

/* ---------------------------------------------------------------- AUTH */
function viewAuth(){
  const mode = state.params.mode || 'login';
  return `
  <div class="auth-wrap card" style="padding:28px;">
    <h2 style="margin-bottom:4px;">${mode==='login'?'Вход':'Регистрация'}</h2>
    <p class="muted" style="margin-bottom:18px;font-size:13px;">${mode==='login'?'Демо-доступ: admin@shopkz.kz / admin123 (админ) или test@shopkz.kz / test1234':'Создайте аккаунт, чтобы оформлять заказы'}</p>
    ${mode==='login' ? `
    <form onsubmit="doLogin(this.email.value,this.password.value);return false;">
      <div class="field"><label>Email</label><input name="email" type="email" required></div>
      <div class="field"><label>Пароль</label><input name="password" type="password" required></div>
      ${state.authError?`<div class="error-text">${esc(state.authError)}</div>`:''}
      <button class="btn btn-primary" style="width:100%;margin-top:6px;" type="submit">Войти</button>
    </form>
    <p style="margin-top:14px;font-size:13.5px;">Нет аккаунта? <button class="link-btn" onclick="state.authError='';navigate('auth',{mode:'register'})">Зарегистрироваться</button></p>
    ` : `
    <form onsubmit="doRegister(this.email.value,this.password.value,this.name.value,this.phone.value);return false;">
      <div class="field"><label>Имя</label><input name="name" required></div>
      <div class="field"><label>Email</label><input name="email" type="email" required></div>
      <div class="field"><label>Телефон</label><input name="phone" placeholder="+7 700 000 00 00"></div>
      <div class="field"><label>Пароль</label><input name="password" type="password" required></div>
      ${state.authError?`<div class="error-text">${esc(state.authError)}</div>`:''}
      <button class="btn btn-primary" style="width:100%;margin-top:6px;" type="submit">Создать аккаунт</button>
    </form>
    <p style="margin-top:14px;font-size:13.5px;">Уже есть аккаунт? <button class="link-btn" onclick="state.authError='';navigate('auth',{mode:'login'})">Войти</button></p>
    `}
  </div>`;
}

/* ---------------------------------------------------------------- ADMIN */
async function viewAdmin(){
  if(!session || session.role!=='admin'){
    return `<div class="empty-state">Доступ только для администратора.<br><button class="btn btn-primary" style="margin-top:12px;" onclick="navigate('auth',{mode:'login'})">Войти</button></div>`;
  }
  const body = await adminTabContent();
  return `
  <h2 class="section-title">Админ-панель</h2>
  <div class="admin-shell">
    <nav class="admin-nav">
      <a class="${state.adminTab==='overview'?'active':''}" href="#" onclick="state.adminTab='overview';render();return false;">Обзор</a>
      <a class="${state.adminTab==='products'?'active':''}" href="#" onclick="state.adminTab='products';render();return false;">Товары</a>
      <a class="${state.adminTab==='orders'?'active':''}" href="#" onclick="state.adminTab='orders';render();return false;">Заказы</a>
      <a class="${state.adminTab==='promos'?'active':''}" href="#" onclick="state.adminTab='promos';render();return false;">Промокоды</a>
    </nav>
    <div>${body}</div>
  </div>
  ${state.modal ? await renderModal() : ''}`;
}
async function adminTabContent(){
  if(state.adminTab==='overview') return await adminOverview();
  if(state.adminTab==='products') return await adminProducts();
  if(state.adminTab==='orders') return await adminOrders();
  if(state.adminTab==='promos') return await adminPromos();
  return '';
}
async function adminOverview(){
  const s = await api('GET','/api/admin/overview');
  return `
  <div class="kpi-row">
    <div class="kpi"><div class="num">${s.totalOrders}</div><div class="lbl">Всего заказов</div></div>
    <div class="kpi"><div class="num">${money(s.revenue)}</div><div class="lbl">Выручка</div></div>
    <div class="kpi"><div class="num">${s.users}</div><div class="lbl">Пользователей</div></div>
    <div class="kpi"><div class="num">${s.lowStock}</div><div class="lbl">Мало на складе</div></div>
    <div class="kpi"><div class="num">${s.outStock}</div><div class="lbl">Нет в наличии</div></div>
  </div>
  <p class="muted">Используйте разделы «Товары» и «Заказы» для управления каталогом и выполнением тест-сценариев (TS-16 и др.).</p>`;
}
async function adminProducts(){
  await refreshAllProducts();
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <h3 style="font-size:16px;">Товары (${state.allProducts.length})</h3>
    <button class="btn btn-primary btn-sm" onclick="openProductModal()">+ Добавить товар</button>
  </div>
  <table class="data"><thead><tr><th>Товар</th><th>Категория</th><th>Цена</th><th>Остаток</th><th></th></tr></thead>
  <tbody>
  ${state.allProducts.map(p=>`
    <tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.category)}</td>
      <td>${money(p.price)}</td>
      <td>${p.stock===0?'<span class="out-of-stock">0</span>':(p.stock<=3?'<span class="low-stock">'+p.stock+'</span>':p.stock)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm btn-outline" onclick="openProductModal('${p.id}')">Изменить</button>
        <button class="btn btn-sm btn-danger" onclick="adminDeleteProduct('${p.id}','${jsAttr(p.name)}')">Удалить</button>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}
async function adminOrders(){
  const {orders} = await api('GET','/api/admin/orders');
  if(!orders.length) return `<div class="empty-state">Заказов пока нет.</div>`;
  return `
  <h3 style="font-size:16px;margin-bottom:12px;">Заказы (${orders.length})</h3>
  <table class="data"><thead><tr><th>ID</th><th>Клиент</th><th>Сумма</th><th>Статус</th><th>Дата</th><th></th></tr></thead>
  <tbody>
  ${orders.map(o=>`
    <tr>
      <td>${o.id}</td>
      <td>${esc(o.user_email)}</td>
      <td>${money(o.total)}</td>
      <td><span class="badge-pill status-${o.status}">${statusLabel(o.status)}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString('ru-RU')}</td>
      <td>
        <select onchange="adminUpdateStatus('${o.id}', this.value)" style="border:1px solid var(--line);border-radius:var(--radius);padding:5px 6px;font-size:12.5px;">
          ${['processing','shipped','delivered','pending_cancel','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('')}
  </tbody></table>`;
}
async function adminPromos(){
  const {promos} = await api('GET','/api/admin/promos');
  return `
  <h3 style="font-size:16px;margin-bottom:12px;">Промокоды</h3>
  <table class="data"><thead><tr><th>Код</th><th>Скидка</th><th>Активен</th><th></th></tr></thead>
  <tbody>
  ${promos.map(p=>`
    <tr><td>${esc(p.code)}</td><td>${p.percent}%</td><td>${p.active?'Да':'Нет'}</td>
    <td><button class="btn btn-sm btn-outline" onclick="adminTogglePromo('${p.code}')">${p.active?'Отключить':'Включить'}</button></td></tr>`).join('')}
  </tbody></table>
  <form onsubmit="adminAddPromo(this.code.value, this.percent.value);this.reset();return false;" style="max-width:320px;margin-top:18px;padding:16px;" class="card">
    <div class="field"><label>Новый код</label><input name="code" required style="text-transform:uppercase;"></div>
    <div class="field"><label>Скидка, %</label><input name="percent" type="number" min="1" max="90" required></div>
    <button class="btn btn-primary btn-sm" type="submit">Добавить промокод</button>
  </form>`;
}
async function renderModal(){
  const m = state.modal;
  if(m.type!=='product') return '';
  let p = {name:'',category:'',price:'',stock:'',img:'',desc:''};
  if(m.id){
    try{ p = (await api('GET','/api/products/'+m.id)).product; }catch(e){}
  }
  return `
  <div class="modal-bg" onclick="if(event.target===this){state.modal=null;render();}">
    <div class="modal">
      <div class="modal-head"><h3>${m.id?'Изменить товар':'Новый товар'}</h3><button class="modal-close" onclick="state.modal=null;render();">×</button></div>
      <form onsubmit="adminSaveProduct({name:this.name.value,category:this.category.value,price:Number(this.price.value),stock:Number(this.stock.value),img:this.img.value,desc:this.desc.value}, ${m.id?`'${m.id}'`:'null'});return false;">
        <div class="field"><label>Название</label><input name="name" required value="${esc(p.name)}"></div>
        <div class="row">
          <div class="field"><label>Категория</label><input name="category" required value="${esc(p.category)}"></div>
          <div class="field"><label>Цена, ₸</label><input name="price" type="number" min="1" required value="${p.price}"></div>
        </div>
        <div class="field"><label>Остаток на складе</label><input name="stock" type="number" min="0" required value="${p.stock}"></div>
        <div class="field"><label>Ссылка на изображение</label><input name="img" value="${esc(p.img||'')}"></div>
        <div class="field"><label>Описание</label><textarea name="desc" rows="3">${esc(p.desc||'')}</textarea></div>
        <button class="btn btn-primary" style="width:100%;" type="submit">Сохранить</button>
      </form>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------- init */
(async function init(){
  try{ session = (await api('GET','/api/me')).user; }catch(e){ session = null; }
  await refreshAllProducts();
  await refreshCounts();
  await render();
})();
