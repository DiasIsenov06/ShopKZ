import os,uuid,datetime
import pytest,requests
BASE=os.getenv('SHOPKZ_TEST_URL','http://127.0.0.1:4331')
@pytest.fixture
def buyer():
 s=requests.Session();email='uat-'+uuid.uuid4().hex+'@example.test';r=s.post(BASE+'/api/register',json={'email':email,'password':'TestPass123','name':'UAT Test'},timeout=5);assert r.status_code==200
 return s,email

def test_01_catalog():
 r=requests.get(BASE+'/api/products',timeout=5);assert r.status_code==200;assert len(r.json()['products'])==12

def test_02_search():
 r=requests.get(BASE+'/api/products',params={'search':'Наушники'},timeout=5);assert r.status_code==200;assert len(r.json()['products'])==1

def test_03_sort():
 rows=requests.get(BASE+'/api/products',params={'sort':'price_asc'},timeout=5).json()['products'];assert [x['price'] for x in rows]==sorted(x['price'] for x in rows)

def test_04_invalid_registration():
 r=requests.post(BASE+'/api/register',json={'email':'bad','password':'x','name':''},timeout=5);assert r.status_code==400

def test_05_duplicate_account(buyer):
 s,email=buyer;r=s.post(BASE+'/api/register',json={'email':email,'password':'TestPass123','name':'Again'},timeout=5);assert r.status_code==400

def test_06_login_and_session(buyer):
 s,email=buyer;assert s.get(BASE+'/api/me',timeout=5).json()['user']['email']==email

def test_07_guest_orders_forbidden():
 assert requests.get(BASE+'/api/orders',timeout=5).status_code==401

def test_08_out_of_stock(buyer):
 s,_=buyer;assert s.post(BASE+'/api/cart',json={'productId':'p003','qty':1},timeout=5).status_code==400

@pytest.mark.parametrize('payment,extra,expected',[('bitcoin',{},400),('card',{'cardNumber':'4532015112830366','cardExpiry':'13/30','cardCvv':'123'},400),('card',{'cardNumber':'4532015112830366','cardExpiry':'01/20','cardCvv':'123'},400),('card',{'cardNumber':'4000000000000002','cardExpiry':'12/30','cardCvv':'123'},402)])
def test_09_rejected_checkout_keeps_cart(buyer,payment,extra,expected):
 s,_=buyer;assert s.post(BASE+'/api/cart',json={'productId':'p001','qty':1},timeout=5).status_code==200
 before=s.get(BASE+'/api/cart',timeout=5).json()
 r=s.post(BASE+'/api/orders',json={'address':'UAT Test address','phone':'+70000000000','payment':payment,**extra},timeout=5)
 assert r.status_code==expected;assert s.get(BASE+'/api/cart',timeout=5).json()==before

def test_10_successful_checkout(buyer):
 s,_=buyer;assert s.post(BASE+'/api/cart',json={'productId':'p004','qty':1},timeout=5).status_code==200
 r=s.post(BASE+'/api/orders',json={'address':'UAT Test address','phone':'+70000000000','payment':'ewallet','promoCode':'SALE10'},timeout=5)
 assert r.status_code==200;assert r.json()['order']['total']==19350;assert s.get(BASE+'/api/orders',timeout=5).json()['orders']

def test_11_admin_isolation(buyer):
 s,_=buyer;assert s.get(BASE+'/api/admin/orders',timeout=5).status_code==403
