'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const request = require('request');
const crypto = require('crypto');
const ChildProcess = require('child_process');
const ProgressBar = require('progress');

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
  const customRegExp = /\r\n\s*([0-9\.]+)\|([0-9]+)\s*\r\n/gmi
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
      stderr: stderr,
      command: command,
    });
  });
  return deferred.promise;
}

let existRoutesWin32 = (options)=>{
  return spawn(function*(){
    let filePath = path.join(rootDir, 'routes', 'route-print.log.txt');
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

let addRouteWin32 = (route, profile, options)=>{
  // TODO: once os.networkInterfaces() are works properly
  // then use it instead of networkInterface paramter
  // we could be able to retrive the networkInterfaces from the 
  // gateWay
  let gateWay = route.gateWay || profile.gateWay
    || options.routeConfig.gateWay || options.gateWay || '192.168.1.1';
  let metric = route.metric || profile.metric
    || options.routeConfig.metric || options.metric || '5';
  let networkInterface = route.networkInterface || profile.networkInterface
    || options.routeConfig.networkInterface || options.networkInterface;
  let routeAddCommand = `route add ${route.route} mask ${route.mask} ${gateWay} metric ${metric}`;
  if (networkInterface) {
    routeAddCommand += ` if ${networkInterface}`
  }
  return exec(routeAddCommand, {cwd:rootDir})
}

let deleteRouteWin32 = (route, option)=>{
  return exec(`route delete ${route.route}`, {cwd:rootDir});
}

function prepareRoutes(options){
  return spawn(function*(){
    let routeConfigPath = options.config || path.join(rootDir, 'route.json')
    console.log(routeConfigPath)
    let routeConfigDir = path.join(routeConfigPath, '..');
    let routeConfigText = fs.readFileSync(routeConfigPath, 'utf8');
    let routeConfig = JSON.parse(routeConfigText);

    routeConfig.totalRoutes = 0;
    for (let profile of routeConfig.profiles) {
      if (profile.url) {
        let fileContent = '';
        let filePath = path.join(routeConfigDir,profile.path || '', crypto.createHash('md5').update(profile.url).digest('hex') + '.log.txt');
        if (!options.force && fs.existsSync(filePath)) {
          fileContent = fs.readFileSync(filePath, 'utf8');
        } else {
          let res = yield Q.nfcall(request.get, profile.url)
          let response = res[0];
          fileContent = response.body;
          fs.writeFileSync(filePath, fileContent, 'utf8');
        }
        profile.routes = processOnlineRoutes(fileContent);
      } else if (profile.path){
        let filePath = path.join(routeConfigDir, profile.path);
        let fileContent = fs.readFileSync(filePath, 'utf8');
        profile.routes = processCustomRoutes(fileContent);
      }
      console.log(profile.routes.length)
      routeConfig.totalRoutes += profile.routes.length;
    }
    return routeConfig;
  });
}

let routesToSet = (routes)=>{
  let existsRoutes = new Set();
  for (let route of routes) {
    existsRoutes.add(route.route);
  }
  return existsRoutes;
}

function deleteRoutes(options) {
  return spawn(function*(){
    let routeHandlers = options.routeHandlers;
    let i = 0;
    while (true) {
      let existsRoutes = yield routeHandlers.existRoutes(options);
      if (!existsRoutes || existsRoutes.length === 0) {
        break;
      }
      let deleteRouteProcess = new ProgressBar(':Deleting exist routes [:bar] :percent :etas', {width: 60, total: existsRoutes.length });

      for (let route of existsRoutes) {
        yield routeHandlers.deleteRoute(route, options);
        deleteRouteProcess.tick();
      }
      ++i;
    }
  });
}

function addRoutes(options) {
  return spawn(function*(){
    let routeHandlers = options.routeHandlers;
    options.force = false;
    let existsRoutes = yield routeHandlers.existRoutes(options);
    let existRouteSet = routesToSet(existsRoutes);
    let progressOption = {width: 60, total: options.routeConfig.totalRoutes};
    let addRouteProcess = new ProgressBar(':Adding routes [:bar] :percent :etas', progressOption);
    for (let profile of options.routeConfig.profiles) {
      for (let route of profile.routes) {
        addRouteProcess.tick();

        if (profile.deleteFirst || existRouteSet.has(route.route)){
          let result = yield routeHandlers.deleteRoute(route, options);
        }
        yield routeHandlers.addRoute(route, profile, options);
      }
    }
    options.force = true;
    existsRoutes = yield routeHandlers.existRoutes(options);
  });
}

let allRouteHandlers = {
  win32: {
    existRoutes: existRoutesWin32,
    addRoute: addRouteWin32,
    deleteRoute: deleteRouteWin32,
  },
}

exports.route = (options)=>{
  return spawn(function*(){
    let osPlatform = os.platform();
    let routeHandlers = allRouteHandlers[osPlatform];
    let newOption = JSON.parse(JSON.stringify(options));
    newOption.routeHandlers = routeHandlers;
    if (newOption.clear) {
      yield deleteRoutes(newOption);
    } else {
      newOption.routeConfig = yield prepareRoutes(newOption);
      if (!newOption.prepare) {
        yield addRoutes(newOption);
      }
    }
  });
}