// tests/unit/utils.test.js
// Unit-тесты — тестируют utils.js в ПОЛНОЙ ИЗОЛЯЦИИ: без БД, без HTTP, без сессий.
// Объект тестирования (SUT): функции модуля utils.js.

const {
  luhnOk, calcAverageRating, calcOrderTotal, isValidEmail, clampQty, isFreeCancelWindow, genId
} = require('../../utils');

describe('UT-01: luhnOk — валидация номера карты алгоритмом Луна', () => {
  test('корректный номер карты (16 цифр, проходит контрольную сумму) → true', () => {
    expect(luhnOk('4532015112830366')).toBe(true); // валидный тестовый номер Visa
  });
  test('номер карты с нарушенной контрольной суммой → false', () => {
    expect(luhnOk('4532015112830367')).toBe(false); // последняя цифра испорчена
  });
  test('номер не из 16 цифр → false', () => {
    expect(luhnOk('1234 5678')).toBe(false);
  });
  test('корректно обрабатывает номер с пробелами-разделителями', () => {
    expect(luhnOk('4532 0151 1283 0366')).toBe(true);
  });
});

describe('UT-02: calcOrderTotal — расчёт итоговой суммы заказа со скидкой', () => {
  test('без промокода сумма не меняется', () => {
    expect(calcOrderTotal(10000, 0)).toBe(10000);
  });
  test('скидка 10% применяется и результат округляется', () => {
    expect(calcOrderTotal(9999, 10)).toBe(8999); // 8999.1 → 8999
  });
  test('скидка 15% (WELCOME15) считается верно', () => {
    expect(calcOrderTotal(20000, 15)).toBe(17000);
  });
});

describe('UT-03: calcAverageRating — средний рейтинг товара', () => {
  test('пустой список отзывов → 0', () => {
    expect(calcAverageRating([])).toBe(0);
  });
  test('пустой/undefined список → 0 (не падает с ошибкой)', () => {
    expect(calcAverageRating(undefined)).toBe(0);
  });
  test('среднее по нескольким отзывам считается верно', () => {
    const revs = [{ rating: 5 }, { rating: 4 }, { rating: 3 }];
    expect(calcAverageRating(revs)).toBeCloseTo(4.0, 5);
  });
});

describe('UT-04: isValidEmail — проверка формата email', () => {
  test('корректный email → true', () => {
    expect(isValidEmail('test@shopkz.kz')).toBe(true);
  });
  test('email без "@" → false', () => {
    expect(isValidEmail('test-shopkz.kz')).toBe(false);
  });
  test('email без домена верхнего уровня → false', () => {
    expect(isValidEmail('test@shopkz')).toBe(false);
  });
  test('пустая строка → false', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('UT-05: clampQty — количество товара не может превышать остаток', () => {
  test('запрошенное количество меньше остатка → возвращается как есть', () => {
    expect(clampQty(2, 5)).toBe(2);
  });
  test('запрошенное количество больше остатка → обрезается до остатка', () => {
    expect(clampQty(10, 3)).toBe(3);
  });
  test('запрошенное количество 0 или отрицательное → 0', () => {
    expect(clampQty(0, 5)).toBe(0);
    expect(clampQty(-2, 5)).toBe(0);
  });
});

describe('UT-06 (доп.): isFreeCancelWindow — 30-минутное окно бесплатной отмены', () => {
  test('заказ создан только что → бесплатная отмена доступна', () => {
    const now = Date.now();
    expect(isFreeCancelWindow(now - 5 * 60 * 1000, now)).toBe(true); // 5 минут назад
  });
  test('заказ создан более 30 минут назад → окно закрыто', () => {
    const now = Date.now();
    expect(isFreeCancelWindow(now - 31 * 60 * 1000, now)).toBe(false);
  });
});

describe('UT-07 (доп.): genId — генерация уникальных идентификаторов', () => {
  test('идентификатор начинается с переданного префикса', () => {
    expect(genId('p')).toMatch(/^p/);
  });
  test('два последовательных вызова дают разные id', () => {
    const a = genId('ORD-');
    const b = genId('ORD-');
    expect(a).not.toBe(b);
  });
});
