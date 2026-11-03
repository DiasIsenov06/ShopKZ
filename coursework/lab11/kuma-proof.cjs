// Runs inside the isolated Kuma container. Never connects to an existing instance.
const { io } = require('/app/node_modules/socket.io-client');
const fs = require('fs');
const socket = io('http://127.0.0.1:3001', {transports:['websocket']});
const events = [];
socket.on('heartbeat', x => {events.push(x); fs.writeFileSync('/tmp/heartbeats.json', JSON.stringify(events,null,2));});
const call = (name,...args) => new Promise((resolve,reject) => {
  socket.timeout(20000).emit(name,...args,(err,r) => err ? reject(err) : r?.ok===false ? reject(new Error(r.msg)) : resolve(r));
});
socket.on('connect', async () => {
  try {
    const needed = await call('needSetup');
    if (needed) await call('setup','demo-admin',process.env.KUMA_DEMO_PASSWORD);
    await call('login',{username:'demo-admin',password:process.env.KUMA_DEMO_PASSWORD,token:''});
    const m = await call('add',{type:'http',name:'ShopKZ isolated demo',url:'http://shopkz:3000/api/products',method:'GET',interval:20,retryInterval:20,resendInterval:0,maxretries:0,notificationIDList:{},ignoreTls:false,upsideDown:false,expiryNotification:false,maxredirects:3,accepted_statuscodes:['200'],dns_resolve_type:'A',dns_resolve_server:'1.1.1.1',httpBodyEncoding:'json',kafkaProducerBrokers:[],kafkaProducerSaslOptions:{mechanism:'None'},rabbitmqNodes:[],conditions:[]});
    fs.writeFileSync('/tmp/monitor.json',JSON.stringify(m));
    console.log('Monitor configured');
  } catch(e) {console.error(e.message);process.exit(1);}
});
setTimeout(()=>{socket.close();process.exit(0);},220000);
