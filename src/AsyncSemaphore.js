function AsyncSemaphore(count) {
  this.count = count;
  this.n = 0;
  this.acquireFifo = [];
  this.acquireFullList = [];
  this.releaseFifo = [];
}

AsyncSemaphore.prototype = {
  acquire: function(first=false) {
    if (this.tryAcquire()) {
      return Promise.resolve();
    }
    let self = this;
    return new Promise(function(resolve) {
      if (first) {
        self.acquireFifo.unshift(resolve);
      } else {
        self.acquireFifo.push(resolve);
      }
      self._resolveAcquireFull();
    });
  },

  _resolveAcquireFull: function() {
    var existAcquireFullList = this.acquireFullList;
    this.acquireFullList = [];
    for (let acquireFullInfo of existAcquireFullList) {
      if (this.acquireFifo.length + this.count >= acquireFullInfo.fullCount) {
        acquireFullInfo.resolve();
      } else {
        this.acquireFullList.push(acquireFullInfo);
      }
    }
  },

  waitAcuireFull: function(fullCount) {
    if (this.acquireFifo.length + this.count >= fullCount) {
      return Promise.resolve();
    }
    var self = this;
    return new Promise(function(resolve) {
      self.acquireFullList.push({fullCount:fullCount, resolve:resolve});
    });
  },

  tryAcquire: function() {
    if (this.releaseFifo.length > 0) {
      let resolve = this.releaseFifo.shift();
      resolve();
      return true;
    }
    if (this.n < this.count) {
      ++this.n;
      return true;
    }
    return false;
  },

  tryAcquireAll: function() {
    var ret = this.releaseFifo.length > 0 || this.n < this.count;
    var existReleaseFifo = this.releaseFifo;
    this.releaseFifo = [];
    for (let releaseResolve of existReleaseFifo) releaseResolve();
    this.n = this.count;
    return ret;
  },

  release: function(first=false) { /* never less than zero */
    if (this.tryRelease()) {
      return Promise.resolve();
    }
    let self = this;
    return new Promise(function(resolve) {
      if (first) {
        self.releaseFifo.unshift(resolve);
      } else {
        self.releaseFifo.push(resolve);
      }
    });
  },

  tryRelease: function() {
    if (this.acquireFifo.length > 0) {
      let resolve = this.acquireFifo.shift();
      resolve();
      return true;
    }
    if (this.n > 0) {
      --this.n;
      return true;
    }
    return false;
  },

  tryReleaseAll: function() {
    var ret = this.acquireFifo.length > 0 || this.n > 0;
    var existAcquireFifo = this.acquireFifo;
    this.acquireFifo = [];
    for (let acquireResolve of existAcquireFifo) acquireResolve();
    this.n = 0;
    return ret;
  },
};

module.exports = AsyncSemaphore;