'use strict';

const ChildProcess = require('child_process');
const defer = require('./Deferred.js').defer;

exports.exec = (command, options)=>{
  options = options || {};
  let deferred = defer();
  let result = ChildProcess.exec(command, options, function(error, stdout, stderr){
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