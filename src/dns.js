'use strict';

const dns = require('native-dns');
const util = require('util');
const spawn = require('./Spawn.js').spawn;
const defer = require('./Deferred.js').defer;
const fs = require('fs');
const path = require('path');
const pac = require('./pac.js');
const RuleList = pac.RuleList;
const Conditions = pac.Conditions;

var logger = require('./log');

let dnsConfigPath = path.join(__dirname, '..', 'dns.json');
let dnsConfigText = fs.readFileSync(dnsConfigPath, 'utf8');
let dnsConfigDir = path.join(dnsConfigPath, '..');
console.log(dnsConfigDir);
let dnsConfig = JSON.parse(dnsConfigText);

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

let resolveName = (options)=>{
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
    logger.warn('Timeout in making request:' + JSON.stringify(options));
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
  });

  req.send();
  return deferred.promise;
}

function dynamicDNS(question){
  let profile = match(question.name);
  return spawn(function*(){
    let ipList = yield resolveName({
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

exports.start = ()=>{
  console.log(dnsConfig);

  dnsConfig.profiles.forEach((profile)=>{
    let proxylistBase64 = fs.readFileSync(path.join(dnsConfigDir, profile.path), 'utf8');
    let formatHandler = RuleList['AutoProxy']
    let ruleList = formatHandler.preprocess(proxylistBase64)
    let defaultProfileName = profile.defaultProfileName || dnsConfig.defaultProfileName;
    profile.rules = formatHandler.parse(ruleList, profile.matchProfileName, defaultProfileName)
  });
  dynamicDNS({name:'google.com'});
  dynamicDNS({name:'facebook.com'});
  dynamicDNS({name:'twitter.com'});
  dynamicDNS({name:'baidu.com'});


  console.log('facebook', match('www.facebook.com').profileName);
  console.log('google', match('google.com').profileName);

  for (let i of [1,2,3]) {
    let startTime = Date.now();
    console.log(i, match('www.google.com').profileName);
    console.log(Date.now() - startTime);
  }
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
}