'use strict';

const dns = require('native-dns');
const util = require('util');
const spawn = require('./Spawn.js').spawn;
const defer = require('./Deferred.js').defer;
const ping = require('ping');
const fs = require('fs');
const path = require('path');
const StringDecoder = require('string_decoder').StringDecoder;
const decoder = new StringDecoder('utf8');
const pac = require('./pac.js');
const RuleList = pac.RuleList;
const Conditions = pac.Conditions;

var logger = require('./log');

/*
//console.log(ruleList);
*/

let dnsConfigText = fs.readFileSync(path.join(__dirname, 'dns.json'), 'utf8');
let dnsConfig = JSON.parse(dnsConfigText);
console.log(dnsConfig);

dnsConfig.profiles.forEach((profile)=>{
  let proxylistBase64 = fs.readFileSync(path.join(__dirname, profile.path), 'utf8');
  let formatHandler = RuleList['AutoProxy']
  let ruleList = formatHandler.preprocess(proxylistBase64)
  let defaultProfileName = profile.defaultProfileName || dnsConfig.defaultProfileName;
  profile.rules = formatHandler.parse(ruleList, profile.matchProfileName, defaultProfileName)
});

let match = (host)=>{
  let request = {
    scheme: 'http',
    host: host,
    url: 'http://' + host + '/',
  }
  for (let profile of dnsConfig.profiles) {
    for (let rule of profile.rules) {
      if (Conditions.match(rule.condition, request)) {
        return rule
      }
    }
  }
  return {
    profileName: dnsConfig.defaultProfileName
  }
}

console.log('facebook', match('www.facebook.com').profileName);
console.log('google', match('google.com').profileName);

for (let i of [1,2,3]) {
  let startTime = Date.now();
  console.log(i, match('www.google.com').profileName);
  console.log(Date.now() - startTime);
}

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
      if (a.name.indexOf('bjdnserror') >= 0) {
        list = null;
      } else if (list){
        list.push(a);
      }
    });
  });

  req.on('end', function () {
    let delta = (Date.now()) - start;
    deferred.resolve(list || []);
    //console.log('Finished processing request: ' + delta.toString() + 'ms');
  });

  req.send();
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

function dynamicDNS(question){
  let profile = match(question.name);
  return spawn(function*(){
    let ipList = yield resolve({
      name: question.name,
      type: question.type || dns.consts.nameToQtype('A'),
      dnsAddress: profile.profileName,
      dnsType: 'udp',
    })
    let logString = JSON.stringify({
      question: question,
      answer: ipList,
      profile: profile,
    }, null, 2);
    if (ipList.length > 0) {
      logger.info(logString);
    } else {
      logger.warn(logString);
    }
    return ipList;
  });
}

dynamicDNS({name:'google.com'});
dynamicDNS({name:'facebook.com'});
dynamicDNS({name:'twitter.com'});
dynamicDNS({name:'baidu.com'});

let server = dns.createServer();

server.on('request', function (request, response) {
  let question = request.question[0];
  dynamicDNS(question, question.type).then((ipList)=>{
    response.answer = ipList;
    response.send();
  });
});

server.on('error', function (err, buff, req, res) {
  console.log(err.stack);
});

server.serve(53);