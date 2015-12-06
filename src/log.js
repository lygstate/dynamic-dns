'use strict';

const path = require('path');
let winston = require('winston');

let baseDir = path.join(__dirname, '..');
let logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new (winston.transports.File)({
      name: 'info-file',
      filename: path.join(baseDir, 'filelog-info.log'),
      level: 'info',
      json: false 
    }),
    new (winston.transports.File)({
      name: 'warn-file',
      filename: path.join(baseDir, 'filelog-error.log'),
      level: 'warn',
      json: false 
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: path.join(baseDir, 'filelog-error.log'),
      level: 'error',
      json: false 
    })
  ],
  exceptionHandlers: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new winston.transports.File({ filename:path.join(baseDir, 'exceptions.log'), json: false })
  ],
  exitOnError: false
});


module.exports = logger;