// utils.js — чистые функции без побочных эффектов (не обращаются к БД, сети, сессии).
// Вынесены отдельно специально для Unit-тестирования в изоляции (см. tests/unit/utils.test.js).

function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Проверка номера карты алгоритмом Луна.
function luhnOk(num) {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length !== 16) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}

// Средний рейтинг товара по списку отзывов вида [{rating:5}, {rating:3}, ...]
function calcAverageRating(reviews) {
  if (!reviews || !reviews.length) return 0;
  return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
}

// Итоговая сумма заказа с учётом промокода (округление до целых тенге).
function calcOrderTotal(subtotal, discountPercent) {
  const discount = discountPercent || 0;
  return Math.round(subtotal * (1 - discount / 100));
}

// Проверка формата email.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

// Не даёт количеству товара в корзине превысить остаток на складе.
function clampQty(requestedQty, stock) {
  if (requestedQty <= 0) return 0;
  return Math.min(requestedQty, stock);
}

// Определяет, попадает ли заказ в 30-минутное окно бесплатной отмены.
function isFreeCancelWindow(createdAt, now) {
  now = now || Date.now();
  return now - createdAt < 30 * 60 * 1000;
}

module.exports = {
  genId, luhnOk, calcAverageRating, calcOrderTotal, isValidEmail, clampQty, isFreeCancelWindow
};
