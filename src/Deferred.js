"use strict";

let Deferred = function() {
  this.promise = new Promise((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  
  this.promise.canceled = false;
  this.promise.cancelers = []
  this.promise.cancel = () => {
    this.promise.canceled = true;
    for (let canceler of this.promise.cancelers) {
      canceler();
    }
  }
  this.then = this.promise.then.bind(this.promise);
  this.catch = this.promise.catch.bind(this.promise);
};

exports.defer = ()=> new Deferred();
