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
const logger = require('./log');

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

let match = (dnsConfig, host)=>{
  let request = {
    scheme: 'http',
    host: host,
    url: 'http://' + host + '/',
  }
  for (let profile of dnsConfig.dnsProfiles) {
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

let dynamicDNS = (dnsConfig, question)=>{
  let profile = match(dnsConfig, question.name);
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

exports.start = (options)=>{
  let dnsConfig = options.config;
  for (let profile of dnsConfig.dnsProfiles) {
    let proxylistBase64 = fs.readFileSync(path.join(options.configDir, profile.path), 'utf8');
    let formatHandler = RuleList[profile.format || 'AutoProxy']
    let ruleList = formatHandler.preprocess(proxylistBase64)
    let defaultProfileName = profile.defaultProfileName || dnsConfig.defaultProfileName;
    profile.rules = formatHandler.parse(ruleList, profile.matchProfileName, defaultProfileName)
  }
  dynamicDNS(dnsConfig, {name:'google.com'});
  dynamicDNS(dnsConfig, {name:'facebook.com'});
  dynamicDNS(dnsConfig, {name:'twitter.com'});
  dynamicDNS(dnsConfig, {name:'baidu.com'});

  console.log('facebook', match(dnsConfig, 'www.facebook.com').profileName);
  console.log('google', match(dnsConfig, 'google.com').profileName);

  let server = dns.createServer();
  server.on('request', function (request, response) {
    dynamicDNS(dnsConfig, request.question[0]).then((answer)=>{
      response.answer = answer;
      response.send();
    });
  });

  server.on('error', function (err, buff, req, res) {
    console.log(err.stack);
  });

  server.serve(53);
}
