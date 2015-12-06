const path = require('path');
var winston = require('winston');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new (winston.transports.File)({
      name: 'info-file',
      filename: path.join(__dirname, 'filelog-info.log'),
      level: 'info',
      json: false 
    }),
    new (winston.transports.File)({
      name: 'warn-file',
      filename: path.join(__dirname, 'filelog-error.log'),
      level: 'warn',
      json: false 
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: path.join(__dirname, 'filelog-error.log'),
      level: 'error',
      json: false 
    })
  ],
  exceptionHandlers: [
    new (winston.transports.Console)({ json: false, timestamp: true }),
    new winston.transports.File({ filename: __dirname + '/exceptions.log', json: false })
  ],
  exitOnError: false
});


module.exports = logger;