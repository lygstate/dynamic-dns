'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('request');
const crypto = require('crypto');
const ChildProcess = require('child_process');

const Q = require('q');
const spawn = require('./Spawn.js').spawn;
const defer = require('./Deferred.js').defer;

const rootDir = path.join(__dirname, '..')

function intToIP(int) {
    var part1 = int & 255;
    var part2 = ((int >> 8) & 255);
    var part3 = ((int >> 16) & 255);
    var part4 = ((int >> 24) & 255);

    return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

function processOnlineRoutes(fileContent) {
  const apnicRegExp = /apnic\|cn\|ipv4\|([0-9\.]+)\|([0-9]+)\|[0-9]+\|a.*/gmi
  let routes = [];
  let match = null;
  while (match = apnicRegExp.exec(fileContent)) {
    let route = match[1];
    let maskInt = parseInt(match[2]);
    let mask = intToIP(0xffffffff ^ (maskInt - 1));
    routes.push({
      route: route,
      mask: mask,
    })
  }
  return routes
}

function processCustomRoutes(fileContent) {
  const customRegExp = /([0-9\.]+)\|([0-9]+)/gmi
  let routes = [];
  let match = null;
  while (match = customRegExp.exec(fileContent)) {
    let route = match[1];
    let maskInt = 1 << parseInt(match[2]);
    let mask = intToIP(0xffffffff ^ (maskInt - 1));
    routes.push({
      route: route,
      mask: mask,
    })
  }
  return routes
}

function exec(command, options) {
  options = options || {};
  let deferred = defer();
  let result = ChildProcess.exec(command, {cwd:rootDir}, function(error, stdout, stderr){
    deferred.resolve({
      result: result,
      error: error,
      stdout: stdout,
      stderr: stderr
    });
  });
  return deferred.promise;
}

function existRoutesWin32(options) {
  return spawn(function*(){
    let filePath = path.join(rootDir, 'routes', 'route-print.txt');
    if (!options.force && fs.existsSync(filePath)) {
      let fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    }
    const routeRegExp = /[\r\n]+\s+([0-9\.]+)\s+([0-9\.]+)\s+([^\s]+)\s+([0-9\.]+)\s+([0-9]+)/gmi
    let result = yield exec('route print -4', {cwd:rootDir});
    let routeTables = result.stdout.split('===========================================================================');
    let ipv4RouteTables = routeTables[3];
    let match = null;
    let routes = [];
    while (match = routeRegExp.exec(ipv4RouteTables)) {
      let gateWay = match[3];
      if (isNaN(parseInt(gateWay))) { //On-link or other works
        continue;
      }
      let route = match[1];
      let mask = match[2];
      let netInterface = match[4];
      let metric = match[5];
      if (route === '0.0.0.0' || mask === '255.255.255.255') {
        continue;
      }
      routes.push({
        route: route,
        mask: mask,
        gateWay: gateWay,
        netInterface: netInterface,
        metric: metric,
      });
    }
    fs.writeFileSync(filePath, JSON.stringify(routes, null, 2), 'utf8');
    return routes;
  })
}

function deleteRoutesWin32(routes, options) {
  return spawn(function*(){
    for (let route of routes) {
      let result = yield exec(`route delete ${route.route}`, {cwd:rootDir});
      console.log(result.stdout);
    }
  });
}

function addRoutesWin32(routeConfig, options) {
  return spawn(function*(){
    for (let route of routes) {
      let result = yield exec(`route add ${route.route}`, {cwd:rootDir});
      console.log(result.stdout);
    }
  });
}

function prepareRoutes(options){
  return spawn(function*(){
    let routeConfigText = fs.readFileSync(path.join(rootDir, 'route.json'), 'utf8');
    let routeConfig = JSON.parse(routeConfigText);
    for (let profile of routeConfig.profiles) {
      if (profile.url) {
        let fileContent = '';
        let filePath = path.join(rootDir, 'routes', crypto.createHash('md5').update(profile.url).digest('hex') + '.txt');
        if (fs.existsSync(filePath)) {
          fileContent = fs.readFileSync(filePath, 'utf8');
        } else {
          let res = yield Q.nfcall(request.get, profile.url)
          let response = res[0];
          fileContent = response.body;
          fs.writeFileSync(filePath, fileContent, 'utf8');
        }
        profile.routes = processOnlineRoutes(fileContent);
      } else if (profile.path){
        let filePath = path.join(rootDir, profile.path);
        let fileContent = fs.readFileSync(profile.path, 'utf8');
        profile.routes = processCustomRoutes(fileContent);
      }
      console.log(profile.routes.length)
    }
    return routeConfig;
  });
}

let allRouteHandlers = {
  win32: {
    existRoutes: existRoutesWin32,
    deleteRoutes: deleteRoutesWin32,
  },
}


exports.route = (options)=>{
  return spawn(function*(){
    let osPlatform = os.platform();
    let routeHandlers = allRouteHandlers[osPlatform];
    let routes = yield routeHandlers.existRoutes(options);
    if (options.clear) {
      yield routeHandlers.deleteRoutes(routes, options);
    } else {
      let routeConfig = yield prepareRoutes();
      if (!options.prepare) {
        addRoutesWin32(routeConfig, options);
      }
    }
  });
}