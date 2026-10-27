const {test,expect}=require('@playwright/test');
for(const width of [360,390,768,1024,1440]){
 test(`responsive catalog ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/');
  await expect(page.locator('.catalog-layout .p-card')).toHaveCount(12);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 });
}
test('guest preferences and shopping state survive reload',async({page})=>{
 await page.goto('/');await expect(page.locator('.p-card')).toHaveCount(12);
 await page.getByRole('combobox',{name:'Цветовая тема'}).selectOption('dark');
 await page.locator('.p-card').first().getByRole('button',{name:'В избранное',exact:true}).click();
 await page.locator('.p-card').first().getByRole('button',{name:'Сравнить товар',exact:true}).click();
 await page.locator('.p-card').first().getByRole('button',{name:'В корзину',exact:true}).click();
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('header').getByRole('button',{name:'Корзина 1',exact:true})).toBeVisible();
 await expect(page.locator('header').getByRole('button',{name:'Избранное 1',exact:true})).toBeVisible();
 await expect(page.locator('header').getByRole('button',{name:'Сравнение 1',exact:true})).toBeVisible();
});
test('mobile filter dialog applies price and availability and closes on Escape',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.goto('/');
 await page.getByRole('button',{name:'Найти своё',exact:true}).click();
 await page.getByRole('button',{name:'Фильтры',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('spinbutton',{name:'Цена до'}).fill('20000');
 await dialog.getByRole('checkbox',{name:'Только в наличии'}).check();await dialog.getByRole('button',{name:'Применить',exact:true}).click();
 await expect(page.locator('.catalog-layout .p-card')).toHaveCount(4);
 await page.getByRole('button',{name:'Фильтры (2)',exact:true}).click();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
