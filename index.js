'use strict';
const dns = require('./src/dns.js');
const route = require('./src/route.js');
const ArgumentParser = require('argparse').ArgumentParser;
const spawn = require('./src/Spawn.js').spawn;

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
  let parser = exports.createArgumentParser();
  let args = parser.parseArgs();
  console.log(JSON.stringify(args));

  if (args.routeClear) {
    args.route = true;
    args.clear = true;
  }
  spawn(function*(){
    try {
      if (args.route) {
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
