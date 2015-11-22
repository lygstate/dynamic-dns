'use strict';

const dns = require('native-dns');
const util = require('util');
const spawn = require('./Spawn.js').spawn;
const defer = require('./Deferred.js').defer;
const ping = require('ping');

let resolve = (options)=>{
  let question = dns.Question({
    name: options.name,
    type: options.type,
  });

  let deferred = defer();
  let list = [];
  let start = Date.now();
  let req = dns.Request({
    question: question,
    server: { address: options.dnsAddress, port: 53, type: options.dnsType },
    timeout: 500,
  });
  req.on('timeout', function () {
    console.log('Timeout in making request');
  });

  req.on('message', function (err, answer) {
    answer.answer.forEach(function (a) {
      list.push(a);
    });
  });

  req.on('end', function () {
    let delta = (Date.now()) - start;
    deferred.resolve(list);
    //console.log('Finished processing request: ' + delta.toString() + 'ms');
  });

  req.send();
  return deferred.promise;
}


let resoveFinalList = (name, type)=>{
  let allResult = [[], []];
  let deferred = defer();
  let finished =false;
  let count = 0;
  let delayFinish;

  let finish = (delay)=>{
    if (count === 2) {
      return deferred.resolve(allResult);
    }
    if (finished) {
      return;
    }
    finished = true;
    delayFinish(delay);
  }
  delayFinish = (delay)=>{
    setTimeout(()=>{
      count = 2;
      finish();
    }, delay);
  };
  delayFinish(1000);

  resolve({
    name: name,
    type: type,
    dnsAddress: '8.8.8.8',
    dnsType: 'udp',
  }).then((result)=>{
    ++count;
    allResult[0] = result;
    finish(10);
  });
  resolve({
    name: name,
    type: type,
    dnsAddress: '192.168.1.1',
    dnsType: 'udp',
  }).then((result)=>{
    ++count;
    allResult[1] = result;
    finish(200);
  });

  return deferred.promise;
}

let pingAddresses = (ipList)=>{
  let timeoutDeferred = defer();
  let finished =false;
  let finish = ()=>{
    if (finished) {
      return;
    }
    finished = true;
    timeoutDeferred.resolve();
  }
  setTimeout(finish, 1500);
  let promises = [];
  let startTime = Date.now();
  for (let ip of ipList) {
    let deferred = defer();
    let address = ip.address;
    ip.isAlive = false;
    ip.delay = 3000;
    ping.sys.probe(address, function(isAlive){
      if (finished) {
        return;
      }
      ip.isAlive = isAlive;
      ip.delay = Date.now() - startTime;
      setTimeout(finish, 100);
      deferred.resolve();
    });
    promises.push(deferred.promise);
  }
  return Promise.race([Promise.all(promises), timeoutDeferred.promise]);
}

function dynamicDNS(name, type){
  return spawn(function*(){
    let startTime = Date.now();
    let list = yield resoveFinalList(name, type);
    let ipList = [];
    for (let i = 0; i < list.length; ++i){
      let result = list[i];
      for (let item of result) {
        if (!item.address) {
          continue;
        }
        item = JSON.parse(JSON.stringify(item));
        item.dnsResolver = i;
        ipList.push(item);
      }
    }
    yield pingAddresses(ipList);
    console.log(Date.now() - startTime);
    ipList.sort((a, b)=>{
      return a.delay - b.delay;
    });
    if (ipList.length > 0 && !ipList[0].isAlive) {
      for (let ip of ipList) {
        ip.isAlive = true;
      }
    }
    let dnsResolver = (ipList && ipList[0].dnsResolver) || 0;
    //console.log("The dnsResolver is:" + dnsResolver.toString() + ':' + dns.consts.qtypeToName(type));
    let result =  list[dnsResolver] || [];
    //console.log(JSON.stringify(result, null, 2));
    return result;
  });
}

dynamicDNS('google.com',dns.consts.nameToQtype('A'));

let server = dns.createServer();

server.on('request', function (request, response) {
  let question = request.question[0];
  //console.log("The question is:" + JSON.stringify(question));
  dynamicDNS(question.name, question.type).then((ipList)=>{
    //console.log("The answer is:" + JSON.stringify(ipList));
    response.answer = ipList;
    response.send();
  });
});

server.on('error', function (err, buff, req, res) {
  console.log(err.stack);
});

server.serve(53);