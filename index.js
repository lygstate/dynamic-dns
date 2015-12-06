'use strict';
const dns = require('./src/dns.js');
const route = require('./src/route.js');
const ArgumentParser = require('argparse').ArgumentParser;
const spawn = require('./src/Spawn.js').spawn;
const path = require('path');
const fs = require('fs');

exports.createArgumentParser = ()=>{
  let parser = new ArgumentParser({
    version: '0.0.1',
    addHelp:true,
    description: 'Argparse example'
  });
  parser.addArgument(
    ['-r', '--route'],
    {
      help: 'route related operations',
      defaultValue: false,
      required : false,
      dest: 'route',
      action: 'storeTrue',
    }
  );
  parser.addArgument(
    ['-c', '--clear'],
    {
      help: 'clear option',
      defaultValue: false,
      required : false,
      dest: 'clear',
      action: 'storeTrue',
    }
  );
  parser.addArgument(
    ['-f', '--force'],
    {
      help: 'force option, clear any cache exist',
      defaultValue: false,
      required : false,
      dest: 'force',
      action: 'storeTrue',
    }
  );
  parser.addArgument(
    ['-p', '--prepare'],
    {
      help: 'prepare things, such as route table or dns resolve table',
      defaultValue: false,
      required : false,
      dest: 'force',
      action: 'storeTrue',
    }
  );
  parser.addArgument(
    ['--config'],
    {
      help: 'The config file path for route or dns resolver',
      defaultValue: null,
      required : false,
      dest: 'configPath',
      action: 'store',
    }
  );
  parser.addArgument(
    ['-s', '--service'],
    {
      help: 'Running the dns as service, and when rebooting, refresh the route table',
      defaultValue: false,
      required : false,
      dest: 'service',
      action: 'storeTrue',
    }
  );
  parser.addArgument(
    ['--gateway'],
    {
      help: 'The final gate way option',
      defaultValue: false,
      required : false,
      dest: 'gateWay',
      action: 'store',
    }
  );
  parser.addArgument(
    [ '--route-clear' ],
    {
      help: 'route clear',
      defaultValue: false,
      required : false,
      dest: 'routeClear',
      action: 'storeTrue',
    }
  );
  return parser;
}
exports.main = ()=>{
  spawn(function*(){
    try {
      let parser = exports.createArgumentParser();
      let args = parser.parseArgs();
      console.log(JSON.stringify(args));
      if (args.routeClear) {
        args.route = true;
        args.clear = true;
      }
      args.rootDir = __dirname;
      if (args.configPath) {
        args.configPath = path.resolve(args.configPath)
      } else {
        args.configPath = path.join(args.rootDir, 'dns-route-config.json')
      }
      args.configDir = path.join(args.configPath, '..');
      let configText = fs.readFileSync(args.configPath, 'utf8');
      args.config = JSON.parse(configText);
      if (args.service) {
        setTimeout(()=>{
          dns.start(args)
        });
        yield route.route(args);
      } else if (args.route) {
        yield route.route(args);
      } else {
        dns.start(args);
      }
    } catch (e) {
      console.error(e);
    }
  });
}

exports.main();
