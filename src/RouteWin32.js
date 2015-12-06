'use strict';

const fs = require('fs');
const spawn = require('./Spawn.js').spawn;
const path = require('path');
const exec = require('./Process.js').exec;
const rootDir = path.join(__dirname, '..')

exports.existRoutes = (options)=>{
  return spawn(function*(){
    let filePath = path.join(options.rootDir || rootDir, 'routes', 'route-print.log.txt');
    if (!options.force && fs.existsSync(filePath)) {
      let fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    }
    const routeRegExp = /[^0-9\.\r\n]*([^\s]+)\s+([0-9\.]+)\s+([^\s]+)\s+([0-9\.]+)\s+([0-9]+)\s*\n/gmi
    let result = yield exec('route print -4', {cwd:rootDir, maxBuffer: 1024*1024*64 });
    let match = null;
    let routes = [];
    let text = result.stdout;
    while (match = routeRegExp.exec(text)) {
      let gateWay = match[3];
      if (isNaN(parseInt(gateWay))) { //On-link or other works
        continue;
      }
      let route = match[1];
      let mask = match[2];
      let networkInterface = match[4];
      let metric = match[5];
      if (route === '0.0.0.0' || mask === '255.255.255.255') {
        continue;
      }
      routes.push({
        route: route,
        mask: mask,
        gateWay: gateWay,
        metric: metric,
        networkInterface: networkInterface,//TODO: convert to networkInterface id;
      });
    }
    console.log(routes.length);
    fs.writeFileSync(filePath, JSON.stringify(routes, null, 2), 'utf8');
    return routes;
  })
}

exports.addRoute = (route, options)=>{
  let routeAddCommand = `route add ${route.route} mask ${route.mask} ${route.gateWay} metric ${route.metric}`;
  if (route.networkInterface) {
    routeAddCommand += ` if ${route.networkInterface}`
  }
  return exec(routeAddCommand, {cwd:options.rootDir || rootDir})
}

exports.deleteRoute = (route, options)=>{
  return exec(`route delete ${route.route}`, {cwd:options.rootDir || rootDir});
}
