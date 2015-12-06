'use strict';

const fs = require('fs');
const spawn = require('./Spawn.js').spawn;
const path = require('path');
const exec = require('./Process.js').exec;
const util = require('util');
const defer = require('./Deferred.js').defer;
const csv = require('csv');

const csvEnv = path.join(process.env.WINDIR, 'System32', 'wbem', 'en-US', 'csv');
exports.wmic = (command)=>{
  let deferred = defer();
  exec(`cmd /c wmic ${command} /format:"${csvEnv}"`).then((result)=>{
     if (result.error) {
      return deferred.reject(result.error);
    }
    let csvLines = result.stdout.split(/[\r\n]/).filter((line)=>line.length > 0);
    csv.parse(csvLines.join('\n'), {columns: true, relax: true}, (error, rows)=>{
      if (error) {
        return deferred.reject(error);
      }
      return deferred.resolve(rows);
    });
  });
  return deferred.promise;
}

//20151207023924.941774+480
//2015 12 07 02 39 24.941774 timezone 480 minutes
exports.parseWmicTime = (str)=>{
  str = str.trim();
  const yearsLength = str.length - 21;
  let years = parseInt(str.substring(0, yearsLength));
  let months = parseInt(str.substring(yearsLength, yearsLength + 2));
  let days = parseInt(str.substring(yearsLength + 2, yearsLength + 4));
  let hours = parseInt(str.substring(yearsLength + 4, yearsLength + 6));
  let minutes = parseInt(str.substring(yearsLength + 6, yearsLength + 8));
  let seconds = parseInt(str.substring(yearsLength + 8, yearsLength + 10));
  let microseconds = parseInt(str.substring(yearsLength + 11, yearsLength + 17));
  let timezone = parseInt(str.substring(yearsLength + 18, yearsLength + 21));

  //console.log(years, months, days, hours, minutes, seconds, microseconds/ 1000, timezone);
  let timeOffset = Date.UTC(years, months - 1 , days, hours, minutes, seconds, microseconds / 1000);
  let date = new Date(timeOffset - timezone * 60 * 1000);
  return date;
}

exports.existRoutes = (options)=>{
  return spawn(function*(){
    let filePath = path.join(options.configDir, options.routeConfig.cachePath || '',  'route-print.log.txt');
    let stat = null;
    try {
      stat = fs.statSync(filePath);
    } catch (e){
      stat = null;
    }
    let isRouteResetted = false;
    if (stat) {
      let rows = yield exports.wmic('os get LastBootupTime');
      let LastBootUpTime = exports.parseWmicTime(rows[0].LastBootUpTime);
      //console.log(`mtime: ${stat.mtime} LastBootUpTime: ${LastBootUpTime}`);
      isRouteResetted = stat.mtime.getTime() < LastBootUpTime.getTime()
    }
    if (!options.force && fs.existsSync(filePath) && !isRouteResetted) {
      let fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    }
    if (isRouteResetted) {
      console.log("Exist routes are changed after reboot");
    }
    const routeRegExp = /[^0-9\.\r\n]*([^\s]+)\s+([0-9\.]+)\s+([^\s]+)\s+([0-9\.]+)\s+([0-9]+)\s*\n/gmi
    let result = yield exec('route print -4', {cwd: options.rootDir, maxBuffer: 1024*1024*64 });
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
  return exec(routeAddCommand, {cwd: options.rootDir})
}

exports.deleteRoute = (route, options)=>{
  return exec(`route delete ${route.route}`, {cwd: options.rootDir});
}
