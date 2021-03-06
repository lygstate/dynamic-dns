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

const RouteWin32 = require('./RouteWin32.js');

const allRouteHandlers = {
  win32: RouteWin32
}

let intToIP = (int)=>{
    var part1 = int & 255;
    var part2 = ((int >> 8) & 255);
    var part3 = ((int >> 16) & 255);
    var part4 = ((int >> 24) & 255);

    return part4 + '.' + part3 + '.' + part2 + '.' + part1;
}

let processOnlineRoutes = (fileContent)=>{
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

let processCustomRoutes = (fileContent)=>{
  const customRegExp = /[^0-9\.\r\n\s]*([0-9\.]+)\|([0-9]+)[^0-9\.\r\n\s]*/gmi
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

let prepareRoutes = (options)=>{
  return spawn(function*(){
    let config = options.config;
    config.totalRoutes = 0;
    for (let profile of config.routeProfiles) {
      if (profile.url) {
        let fileContent = '';
        let hashFilename = crypto.createHash('md5').update(profile.url).digest('hex') + '.log.txt';
        let filePath = path.join(options.configDir, config.cachePath || '', hashFilename);
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
        let filePath = path.join(options.configDir, profile.path);
        let fileContent = fs.readFileSync(filePath, 'utf8');
        profile.routes = processCustomRoutes(fileContent);
      }
      config.totalRoutes += profile.routes.length;
    }
  });
}

let routesToMap = (routes)=>{
  let existsRoutes = new Map();
  for (let route of routes) {
    existsRoutes.set(route.route, route);
  }
  return existsRoutes;
}

let createDeleteProgessBar = (count)=>{
  return new ProgressBar('Deleting exist routes [:bar] :percent :etas', {width: 60, total: count});
}

let deleteRoutes = (options)=>{
  return spawn(function*(){
    let routeHandlers = options.routeHandlers;
    let i = 0;
    options.force = false;
    while (true) {
      let existsRoutes = yield routeHandlers.existRoutes(options);
      options.force = true;
      if (!existsRoutes || existsRoutes.length === 0) {
        break;
      }
      let deleteRouteProcess = createDeleteProgessBar(existsRoutes.length);

      for (let route of existsRoutes) {
        yield routeHandlers.deleteRoute(route, options);
        deleteRouteProcess.tick();
      }
      ++i;
    }
  });
}

let routeEqual = (a,b)=>{
  return a.route === b.route &&
        a.mask === b.mask &&
        a.gateWay === b.gateWay
}

let addRoutes = (options)=>{
  return spawn(function*(){
    let routeHandlers = options.routeHandlers;
    options.force = false;
    let existsRoutes = yield routeHandlers.existRoutes(options);
    let existRouteMap = routesToMap(existsRoutes);
    let progressOption = {width: 60, total: options.config.totalRoutes};
    let addRouteProcess = new ProgressBar('Adding routes [:bar] :percent :etas', progressOption);
    let modified = false;
    for (let profile of options.config.routeProfiles) {
      for (let route of profile.routes) {
        addRouteProcess.tick();

        // TODO: once os.networkInterfaces() are works properly
        // then use it instead of networkInterface paramter
        // we could be able to retrive the networkInterfaces from the 
        // gateWay
        route.gateWay = route.gateWay || profile.gateWay
          || options.config.gateWay || options.gateWay || '192.168.1.1';
        route.metric = route.metric || profile.metric
          || options.config.metric || options.metric || '5';
        route.networkInterface = route.networkInterface || profile.networkInterface
          || options.config.networkInterface || options.networkInterface;
        let hasRoute = existRouteMap.has(route.route);
        if (hasRoute) {
          let existRoute = existRouteMap.get(route.route);
          existRouteMap.delete(route.route);
          if (routeEqual(existRoute, route)) {
            continue;
          }
          let result = yield routeHandlers.deleteRoute(route, options);
        }
        yield routeHandlers.addRoute(route, options);
        modified = true;
      }
    }
    console.log(`modified: ${modified} remote:${options.config.remote} ${existRouteMap.size}`);
    if (options.config.remote && existRouteMap.size > 0) {
      let deleteRouteProcess = createDeleteProgessBar(existRouteMap.size);
      for (let existRoute of existRouteMap.entries()) {
        yield routeHandlers.deleteRoute(existRoute[1], options);
        deleteRouteProcess.tick();
      }
      modified = true;
    }
    if (modified) {
      options.force = true;
      existsRoutes = yield routeHandlers.existRoutes(options);
    }
  });
}

exports.route = (options)=>{
  options = JSON.parse(JSON.stringify(options));
  return spawn(function*(){
    let osPlatform = os.platform();
    let routeHandlers = allRouteHandlers[osPlatform];
    options.routeHandlers = routeHandlers;
    yield prepareRoutes(options);

    if (options.clear) {
      yield deleteRoutes(options);
    } else {
      if (!options.prepare) {
        yield addRoutes(options);
      }
    }
  });
}