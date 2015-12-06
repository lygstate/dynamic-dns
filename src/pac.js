(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.index || (g.index = {})).coffee = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var name, ref, value;

module.exports = {
  Conditions: require('./src/conditions'),
  PacGenerator: require('./src/pac_generator'),
  Profiles: require('./src/profiles'),
  RuleList: require('./src/rule_list'),
  ShexpUtils: require('./src/shexp_utils')
};

ref = require('./src/utils.coffee');
for (name in ref) {
  value = ref[name];
  module.exports[name] = value;
}


},{"./src/conditions":6,"./src/pac_generator":7,"./src/profiles":8,"./src/rule_list":9,"./src/shexp_utils":10,"./src/utils.coffee":11}],2:[function(require,module,exports){
"use strict";

var tld = require('./lib/tld.js').init();
tld.rules = require('./rules.json');

module.exports = tld;

},{"./lib/tld.js":4,"./rules.json":5}],3:[function(require,module,exports){
"use strict";

function Rule (data){
  data = data || {};

  this.exception = data.exception || false;
  this.firstLevel = data.firstLevel || '';
  this.secondLevel = data.secondLevel || null;
  this.isHost = data.isHost || false;
  this.source = data.source || '';
  this.wildcard = data.wildcard || false;
}

/**
 * Returns the TLD or SLD (Second Level Domain) pattern for a rule
 *
 * @return {String}
 */
Rule.prototype.getNormalXld = function getNormalXld(){
  return (this.secondLevel ? '.' + this.secondLevel : '') + '.' + this.firstLevel;
};

/**
 * Returns a pattern suitable for normal rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getNormalPattern = function getNormalPattern(){
  return (this.secondLevel ? '\\.' + this.secondLevel : '') + '\\.' + this.firstLevel;
};

/**
 * Returns a pattern suitable for wildcard rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getWildcardPattern = function getWildcardPattern(){
  return '\\.[^\\.]+' + this.getNormalXld().replace(/\./g, '\\.');
};

/**
 * Returns a pattern suitable for exception rule
 * Mostly for internal use
 *
 * @return {String}
 */
Rule.prototype.getExceptionPattern = function getExceptionPattern(){
  return (this.secondLevel || '') + '\\.' + this.firstLevel;
};

/**
 * Returns the best pattern possible for a rule
 * You just have to test a value against it to check or extract a hostname
 *
 * @api
 * @param {string|undefined} before
 * @param {string|undefined} after
 * @return {String} A pattern to challenge some string against
 */
Rule.prototype.getPattern = function getPattern(before, after){
  var pattern = '';

  before = (before === undefined) ? '(': before+'';
  after = (after === undefined) ? ')$': after+'';

  if (this.exception === true){
    pattern = this.getExceptionPattern();
  }
  else if (this.isHost === true) {
    pattern = this.firstLevel;
  }
  else{
    pattern = '[^\\.]+' + (this.wildcard ? this.getWildcardPattern() : this.getNormalPattern());
  }

  return before + pattern + after;
};

module.exports = Rule;

},{}],4:[function(require,module,exports){
"use strict";

var Rule = require('./rule.js');
var URL = require('url');

/**
 * tld library
 *
 * Useable methods are those documented with an @api in JSDoc
 * See README.md for more explanations on how to use this stuff.
 */
function tld () {
  /* jshint validthis: true */
  this.validHosts = [];
  this.rules = [];
}

tld.init = function init () {
  return new tld();
};

function trim(value) {
  return String(value).replace(/(^\s+|\s+$)/g, '');
}

// Array.some() polyfill for IE8
function _someFunction(value, fun /*, thisArg */) {
    'use strict';

    if (value === void 0 || value === null)
      throw new TypeError();

    var t = Object(value);
    var len = t.length >>> 0;
    if (typeof fun !== 'function') {
      throw new TypeError();
    }

    var thisArg = arguments.length >= 3 ? arguments[2] : void 0;
    for (var i = 0; i < len; i++)
    {
      if (i in t && fun.call(thisArg, t[i], i, t))
        return true;
    }

    return false;
}

// Array.map polyfill for IE8
function _mapFunction(thisVal, fun /*, thisArg */) {
  "use strict";

  if (thisVal === void 0 || thisVal === null)
    throw new TypeError();

  var t = Object(thisVal);
  var len = t.length >>> 0;
  if (typeof fun !== "function") {
    throw new TypeError();
  }

  var res = new Array(len);
  var thisArg = arguments.length >= 3 ? arguments[2] : void 0;

  for (var i = 0; i < len; i++)
  {
    // NOTE: Absolute correctness would demand Object.defineProperty
    //       be used.  But this method is fairly new, and failure is
    //       possible only if Object.prototype or Array.prototype
    //       has a property |i| (very unlikely), so use a lesscorrect
    //       but more portable alternative.
    if (i in t)
      res[i] = fun.call(thisArg, t[i], i, t);
  }

  return res;
};

/**
 * Returns the best rule for a given host based on candidates
 *
 * @static
 * @param host {String} Hostname to check rules against
 * @param rules {Array} List of rules used to work on
 * @return {Object} Candidate object, with a normal and exception state
 */
tld.getCandidateRule = function getCandidateRule (host, rules, options) {
  var rule = {'normal': null, 'exception': null};

  options = options || { lazy: false };

  _someFunction(rules, function (r) {
    var pattern;

    // sld matching or validHost? escape the loop immediately (except if it's an exception)
    if ('.' + host === r.getNormalXld()) {
      if (options.lazy || r.exception || r.isHost) {
        rule.normal = r;
      }

      return true;
    }

    // otherwise check as a complete host
    // if it's an exception, we want to loop a bit more to a normal rule
    pattern = '.+' + r.getNormalPattern() + '$';

    if ((new RegExp(pattern)).test(host)) {
      rule[r.exception ? 'exception' : 'normal'] = r;
      return !r.exception;
    }

    return false;
  });

  // favouring the exception if encountered
  // previously we were copy-altering a rule, creating inconsistent results based on rule order order
  // @see https://github.com/oncletom/tld.js/pull/35
  if (rule.normal && rule.exception) {
    return rule.exception;
  }

  return rule.normal;
};

/**
 * Retrieve a subset of rules for a Top-Level-Domain string
 *
 * @param tld {String} Top-Level-Domain string
 * @return {Array} Rules subset
 */
tld.prototype.getRulesForTld = function getRulesForTld (tld, default_rule) {
  var exception = '!';
  var wildcard = '*';
  var append_tld_rule = true;
  var rules = this.rules[tld];

  // Already parsed
  // Array.isArray polyfill for IE8
  if (Object.prototype.toString.call(rules)  === '[object Array]') {
    return rules;
  }

  // Nothing found, apply some default value
  if (rules === void 0) {
    return default_rule ? [ default_rule ] : [];
  }

  // Parsing needed
  rules = _mapFunction(rules.split('|'), function transformAsRule (sld) {
    var first_bit = sld[0];

    if (first_bit === exception || first_bit === wildcard) {
      sld = sld.slice(1);

      if (!sld) {
        append_tld_rule = false;
      }
    }

    return new Rule({
      "firstLevel":  tld,
      "secondLevel": sld,
      "exception":   first_bit === exception,
      "wildcard":    first_bit === wildcard
    });
  });

  // Always prepend to make it the latest rule to be applied
  if (append_tld_rule) {
    rules.unshift(new Rule({
      "firstLevel": tld
    }));
  }

  this.rules[tld] = rules.reverse();

  return rules;
};

/**
 * Checks if the TLD exists for a given host
 *
 * @api
 * @param {string} host
 * @return {boolean}
 */
tld.prototype.tldExists = function tldExists(host){
  var hostTld;

  host = tld.cleanHostValue(host);

  // Easy case, it's a TLD
  if (this.rules[host]){
    return true;
  }

  // Popping only the TLD of the hostname
  hostTld = tld.extractTldFromHost(host);

  return this.rules[hostTld] !== undefined;
};

/**
 * Returns the public suffix (including exact matches)
 *
 * @api
 * @since 1.5
 * @param {string} host
 * @return {String}
 */
tld.prototype.getPublicSuffix = function getPublicSuffix(host) {
  var hostTld, rules, rule;

  if (host in this.rules){
	  return host;
  }

  host = tld.cleanHostValue(host);
  hostTld = tld.extractTldFromHost(host);
  rules = this.getRulesForTld(hostTld);
  rule = tld.getCandidateRule(host, rules, { lazy: true });

  if (rule === null) {
    return null;
  }

  return rule.getNormalXld().slice(1);
};

/**
 * Detects the domain based on rules and upon and a host string
 *
 * @api
 * @param {string} host
 * @return {String}
 */
tld.prototype.getDomain = function getDomain (host) {
  var domain = null, hostTld, rules, rule;

  if (this.isValid(host) === false) {
    return null;
  }

  host = tld.cleanHostValue(host);
  hostTld = tld.extractTldFromHost(host);
  rules = this.getRulesForTld(hostTld, new Rule({"firstLevel": hostTld, "isHost": this.validHosts.indexOf(hostTld) !== -1}));
  rule = tld.getCandidateRule(host, rules);

  if (rule === null) {
    return null;
  }

  host.replace(new RegExp(rule.getPattern()), function (m, d) {
    domain = d;
  });

  return domain;
};

/**
 * Returns the subdomain of a host string
 *
 * @api
 * @param {string} host
 * @return {string|null} a subdomain string if any, blank string if subdomain is empty, otherwise null
 */
tld.prototype.getSubdomain = function getSubdomain(host){
  var domain, r, subdomain;

  host = tld.cleanHostValue(host);
  domain = this.getDomain(host);

  // No domain found? Just abort, abort!
  if (domain === null){
    return null;
  }

  r = '\\.?'+ tld.escapeRegExp(domain)+'$';
  subdomain = host.replace(new RegExp(r, 'i'), '');

  return subdomain;
};

/**
 * Checking if a host string is valid
 * It's usually a preliminary check before trying to use getDomain or anything else
 *
 * Beware: it does not check if the TLD exists.
 *
 * @api
 * @param host {String}
 * @return {Boolean}
 */
tld.prototype.isValid = function isValid (host) {
  return typeof host === 'string' && (this.validHosts.indexOf(host) !== -1 || (host.indexOf('.') !== -1 && host[0] !== '.'));
};

/**
 * Utility to cleanup the base host value. Also removes url fragments.
 *
 * Works for:
 * - hostname
 * - //hostname
 * - scheme://hostname
 * - scheme+scheme://hostname
 *
 * @param {string} value
 * @return {String}
 */

// scheme      = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
var hasPrefixRE = /^(([a-z][a-z0-9+.-]*)?:)?\/\//;
var invalidHostnameChars = /[^A-Za-z0-9.-]/;

tld.cleanHostValue = function cleanHostValue(value){
  value = trim(value).toLowerCase();

  var parts = URL.parse(hasPrefixRE.test(value) ? value : '//' + value, null, true);

  if (parts.hostname && !invalidHostnameChars.test(parts.hostname)) { return parts.hostname; }
  if (!invalidHostnameChars.test(value)) { return value; }
  return '';
};

/**
 * Utility to extract the TLD from a host string
 *
 * @param {string} host
 * @return {String}
 */
tld.extractTldFromHost = function extractTldFromHost(host){
  return host.split('.').pop();
};

/**
 * Escapes RegExp specific chars.
 *
 * @since 1.3.1
 * @see https://github.com/oncletom/tld.js/pull/33
 * @param {String|Mixed} s
 * @returns {string} Escaped string for a safe use in a `new RegExp` expression
 */
tld.escapeRegExp = function escapeRegExp(s) {
  return String(s).replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
};

module.exports = tld;

},{"./rule.js":3,"url":undefined}],5:[function(require,module,exports){
module.exports={"ac":"com|edu|gov|net|mil|org","ad":"nom","ae":"co|net|org|sch|ac|gov|mil|blogspot","aero":"accident-investigation|accident-prevention|aerobatic|aeroclub|aerodrome|agents|aircraft|airline|airport|air-surveillance|airtraffic|air-traffic-control|ambulance|amusement|association|author|ballooning|broker|caa|cargo|catering|certification|championship|charter|civilaviation|club|conference|consultant|consulting|control|council|crew|design|dgca|educator|emergency|engine|engineer|entertainment|equipment|exchange|express|federation|flight|freight|fuel|gliding|government|groundhandling|group|hanggliding|homebuilt|insurance|journal|journalist|leasing|logistics|magazine|maintenance|marketplace|media|microlight|modelling|navigation|parachuting|paragliding|passenger-association|pilot|press|production|recreation|repbody|res|research|rotorcraft|safety|scientist|services|show|skydiving|software|student|taxi|trader|trading|trainer|union|workinggroup|works","af":"gov|com|org|net|edu","ag":"com|org|net|co|nom","ai":"off|com|net|org","al":"com|edu|gov|mil|net|org|blogspot","am":"blogspot","ao":"ed|gv|og|co|pb|it","aq":"","ar":"com|edu|gob|gov|int|mil|net|org|tur|blogspot.com","arpa":"e164|in-addr|ip6|iris|uri|urn","as":"gov","asia":"","at":"ac|co|gv|or|blogspot.co|biz|info|priv","au":"com|net|org|edu|gov|asn|id|info|conf|oz|act|nsw|nt|qld|sa|tas|vic|wa|act.edu|nsw.edu|nt.edu|qld.edu|sa.edu|tas.edu|vic.edu|wa.edu|qld.gov|sa.gov|tas.gov|vic.gov|wa.gov|blogspot.com","aw":"com","ax":"","az":"com|net|int|gov|org|edu|info|pp|mil|name|pro|biz","ba":"org|net|edu|gov|mil|unsa|unbi|co|com|rs|blogspot","bb":"biz|co|com|edu|gov|info|net|org|store|tv","bd":"*","be":"ac|blogspot","bf":"gov","bg":"a|b|c|d|e|f|g|h|i|j|k|l|m|n|o|p|q|r|s|t|u|v|w|x|y|z|0|1|2|3|4|5|6|7|8|9|blogspot","bh":"com|edu|net|org|gov","bi":"co|com|edu|or|org","biz":"dyndns|for-better|for-more|for-some|for-the|selfip|webhop","bj":"asso|barreau|gouv|blogspot","bm":"com|edu|gov|net|org","bn":"*","bo":"com|edu|gov|gob|int|org|net|mil|tv","br":"adm|adv|agr|am|arq|art|ato|b|bio|blog|bmd|cim|cng|cnt|com|coop|ecn|eco|edu|emp|eng|esp|etc|eti|far|flog|fm|fnd|fot|fst|g12|ggf|gov|imb|ind|inf|jor|jus|leg|lel|mat|med|mil|mp|mus|net|*nom|not|ntr|odo|org|ppg|pro|psc|psi|qsl|radio|rec|slg|srv|taxi|teo|tmp|trd|tur|tv|vet|vlog|wiki|zlg|blogspot.com","bs":"com|net|org|edu|gov","bt":"com|edu|gov|net|org","bv":"","bw":"co|org","by":"gov|mil|com|of|blogspot.com","bz":"com|net|org|edu|gov|za","ca":"ab|bc|mb|nb|nf|nl|ns|nt|nu|on|pe|qc|sk|yk|gc|co|blogspot","cat":"","cc":"ftpaccess|game-server|myphotos|scrapping","cd":"gov","cf":"blogspot","cg":"","ch":"blogspot","ci":"org|or|com|co|edu|ed|ac|net|go|asso|xn--aroport-bya|int|presse|md|gouv","ck":"*|!www","cl":"gov|gob|co|mil|blogspot","cm":"co|com|gov|net","cn":"ac|com|edu|gov|net|org|mil|xn--55qx5d|xn--io0a7i|xn--od0alg|ah|bj|cq|fj|gd|gs|gz|gx|ha|hb|he|hi|hl|hn|jl|js|jx|ln|nm|nx|qh|sc|sd|sh|sn|sx|tj|xj|xz|yn|zj|hk|mo|tw|cn-north-1.compute.amazonaws|compute.amazonaws|s3.cn-north-1.amazonaws.com","co":"arts|com|edu|firm|gov|info|int|mil|net|nom|org|rec|web|blogspot.com","com":"ap-northeast-1.compute.amazonaws|ap-southeast-1.compute.amazonaws|ap-southeast-2.compute.amazonaws|compute.amazonaws|compute-1.amazonaws|eu-west-1.compute.amazonaws|eu-central-1.compute.amazonaws|sa-east-1.compute.amazonaws|us-east-1.amazonaws|us-gov-west-1.compute.amazonaws|us-west-1.compute.amazonaws|us-west-2.compute.amazonaws|z-1.compute-1.amazonaws|z-2.compute-1.amazonaws|elasticbeanstalk|elb.amazonaws|s3.amazonaws|s3-ap-northeast-1.amazonaws|s3-ap-southeast-1.amazonaws|s3-ap-southeast-2.amazonaws|s3-external-1.amazonaws|s3-external-2.amazonaws|s3-fips-us-gov-west-1.amazonaws|s3-eu-central-1.amazonaws|s3-eu-west-1.amazonaws|s3-sa-east-1.amazonaws|s3-us-gov-west-1.amazonaws|s3-us-west-1.amazonaws|s3-us-west-2.amazonaws|s3.eu-central-1.amazonaws|betainabox|ar|br|cn|de|eu|gb|hu|jpn|kr|mex|no|qc|ru|sa|se|uk|us|uy|za|africa|gr|co|cloudcontrolled|cloudcontrolapp|dreamhosters|dyndns-at-home|dyndns-at-work|dyndns-blog|dyndns-free|dyndns-home|dyndns-ip|dyndns-mail|dyndns-office|dyndns-pics|dyndns-remote|dyndns-server|dyndns-web|dyndns-wiki|dyndns-work|blogdns|cechire|dnsalias|dnsdojo|doesntexist|dontexist|doomdns|dyn-o-saur|dynalias|est-a-la-maison|est-a-la-masion|est-le-patron|est-mon-blogueur|from-ak|from-al|from-ar|from-ca|from-ct|from-dc|from-de|from-fl|from-ga|from-hi|from-ia|from-id|from-il|from-in|from-ks|from-ky|from-ma|from-md|from-mi|from-mn|from-mo|from-ms|from-mt|from-nc|from-nd|from-ne|from-nh|from-nj|from-nm|from-nv|from-oh|from-ok|from-or|from-pa|from-pr|from-ri|from-sc|from-sd|from-tn|from-tx|from-ut|from-va|from-vt|from-wa|from-wi|from-wv|from-wy|getmyip|gotdns|hobby-site|homelinux|homeunix|iamallama|is-a-anarchist|is-a-blogger|is-a-bookkeeper|is-a-bulls-fan|is-a-caterer|is-a-chef|is-a-conservative|is-a-cpa|is-a-cubicle-slave|is-a-democrat|is-a-designer|is-a-doctor|is-a-financialadvisor|is-a-geek|is-a-green|is-a-guru|is-a-hard-worker|is-a-hunter|is-a-landscaper|is-a-lawyer|is-a-liberal|is-a-libertarian|is-a-llama|is-a-musician|is-a-nascarfan|is-a-nurse|is-a-painter|is-a-personaltrainer|is-a-photographer|is-a-player|is-a-republican|is-a-rockstar|is-a-socialist|is-a-student|is-a-teacher|is-a-techie|is-a-therapist|is-an-accountant|is-an-actor|is-an-actress|is-an-anarchist|is-an-artist|is-an-engineer|is-an-entertainer|is-certified|is-gone|is-into-anime|is-into-cars|is-into-cartoons|is-into-games|is-leet|is-not-certified|is-slick|is-uberleet|is-with-theband|isa-geek|isa-hockeynut|issmarterthanyou|likes-pie|likescandy|neat-url|saves-the-whales|selfip|sells-for-less|sells-for-u|servebbs|simple-url|space-to-rent|teaches-yoga|writesthisblog|firebaseapp|flynnhub|githubusercontent|ro|appspot|blogspot|codespot|googleapis|googlecode|pagespeedmobilizer|withgoogle|withyoutube|herokuapp|herokussl|4u|nfshost|operaunite|outsystemscloud|gotpantheon|qa2|rhcloud|sinaapp|vipsinaapp|1kapp|hk|yolasite","coop":"","cr":"ac|co|ed|fi|go|or|sa","cu":"com|edu|org|net|gov|inf","cv":"blogspot","cw":"com|edu|net|org","cx":"gov|ath","cy":"ac|biz|com|ekloges|gov|ltd|name|net|org|parliament|press|pro|tm|blogspot.com","cz":"blogspot","de":"com|fuettertdasnetz|isteingeek|istmein|lebtimnetz|leitungsen|traeumtgerade|blogspot","dj":"","dk":"blogspot","dm":"com|net|org|edu|gov","do":"art|com|edu|gob|gov|mil|net|org|sld|web","dz":"com|org|net|gov|edu|asso|pol|art","ec":"com|info|net|fin|k12|med|pro|org|edu|gov|gob|mil","edu":"","ee":"edu|gov|riik|lib|med|com|pri|aip|org|fie|blogspot.com","eg":"com|edu|eun|gov|mil|name|net|org|sci|blogspot.com","er":"*","es":"com|nom|org|gob|edu|blogspot.com","et":"com|gov|org|edu|biz|name|info|net","eu":"","fi":"aland|blogspot|iki","fj":"*","fk":"*","fm":"","fo":"","fr":"com|asso|nom|prd|presse|tm|aeroport|assedic|avocat|avoues|cci|chambagri|chirurgiens-dentistes|experts-comptables|geometre-expert|gouv|greta|huissier-justice|medecin|notaires|pharmacien|port|veterinaire|blogspot","ga":"","gb":"","gd":"","ge":"com|edu|gov|org|mil|net|pvt","gf":"","gg":"co|net|org","gh":"com|edu|gov|org|mil","gi":"com|ltd|gov|mod|edu|org","gl":"co|com|edu|net|org","gm":"","gn":"ac|com|edu|gov|org|net","gov":"","gp":"com|net|mobi|edu|org|asso","gq":"","gr":"com|edu|net|org|gov|blogspot","gs":"","gt":"com|edu|gob|ind|mil|net|org","gu":"*","gw":"","gy":"co|com|net","hk":"com|edu|gov|idv|net|org|xn--55qx5d|xn--wcvs22d|xn--lcvr32d|xn--mxtq1m|xn--gmqw5a|xn--ciqpn|xn--gmq050i|xn--zf0avx|xn--io0a7i|xn--mk0axi|xn--od0alg|xn--od0aq3b|xn--tn0ag|xn--uc0atv|xn--uc0ay4a|blogspot|ltd|inc","hm":"","hn":"com|edu|org|net|mil|gob","hr":"iz|from|name|com|blogspot","ht":"com|shop|firm|info|adult|net|pro|org|med|art|coop|pol|asso|edu|rel|gouv|perso","hu":"co|info|org|priv|sport|tm|2000|agrar|bolt|casino|city|erotica|erotika|film|forum|games|hotel|ingatlan|jogasz|konyvelo|lakas|media|news|reklam|sex|shop|suli|szex|tozsde|utazas|video|blogspot","id":"ac|biz|co|desa|go|mil|my|net|or|sch|web|blogspot.co","ie":"gov|blogspot","il":"ac|co|gov|idf|k12|muni|net|org|blogspot.co","im":"ac|co|com|ltd.co|net|org|plc.co|tt|tv","in":"co|firm|net|org|gen|ind|nic|ac|edu|res|gov|mil|blogspot","info":"dyndns|barrel-of-knowledge|barrell-of-knowledge|for-our|groks-the|groks-this|here-for-more|knowsitall|selfip|webhop","int":"eu","io":"com|github|ngrok|nid|pantheon|sandcats","iq":"gov|edu|mil|com|org|net","ir":"ac|co|gov|id|net|org|sch|xn--mgba3a4f16a|xn--mgba3a4fra","is":"net|com|edu|gov|org|int|cupcake|blogspot","it":"gov|edu|abr|abruzzo|aosta-valley|aostavalley|bas|basilicata|cal|calabria|cam|campania|emilia-romagna|emiliaromagna|emr|friuli-v-giulia|friuli-ve-giulia|friuli-vegiulia|friuli-venezia-giulia|friuli-veneziagiulia|friuli-vgiulia|friuliv-giulia|friulive-giulia|friulivegiulia|friulivenezia-giulia|friuliveneziagiulia|friulivgiulia|fvg|laz|lazio|lig|liguria|lom|lombardia|lombardy|lucania|mar|marche|mol|molise|piedmont|piemonte|pmn|pug|puglia|sar|sardegna|sardinia|sic|sicilia|sicily|taa|tos|toscana|trentino-a-adige|trentino-aadige|trentino-alto-adige|trentino-altoadige|trentino-s-tirol|trentino-stirol|trentino-sud-tirol|trentino-sudtirol|trentino-sued-tirol|trentino-suedtirol|trentinoa-adige|trentinoaadige|trentinoalto-adige|trentinoaltoadige|trentinos-tirol|trentinostirol|trentinosud-tirol|trentinosudtirol|trentinosued-tirol|trentinosuedtirol|tuscany|umb|umbria|val-d-aosta|val-daosta|vald-aosta|valdaosta|valle-aosta|valle-d-aosta|valle-daosta|valleaosta|valled-aosta|valledaosta|vallee-aoste|valleeaoste|vao|vda|ven|veneto|ag|agrigento|al|alessandria|alto-adige|altoadige|an|ancona|andria-barletta-trani|andria-trani-barletta|andriabarlettatrani|andriatranibarletta|ao|aosta|aoste|ap|aq|aquila|ar|arezzo|ascoli-piceno|ascolipiceno|asti|at|av|avellino|ba|balsan|bari|barletta-trani-andria|barlettatraniandria|belluno|benevento|bergamo|bg|bi|biella|bl|bn|bo|bologna|bolzano|bozen|br|brescia|brindisi|bs|bt|bz|ca|cagliari|caltanissetta|campidano-medio|campidanomedio|campobasso|carbonia-iglesias|carboniaiglesias|carrara-massa|carraramassa|caserta|catania|catanzaro|cb|ce|cesena-forli|cesenaforli|ch|chieti|ci|cl|cn|co|como|cosenza|cr|cremona|crotone|cs|ct|cuneo|cz|dell-ogliastra|dellogliastra|en|enna|fc|fe|fermo|ferrara|fg|fi|firenze|florence|fm|foggia|forli-cesena|forlicesena|fr|frosinone|ge|genoa|genova|go|gorizia|gr|grosseto|iglesias-carbonia|iglesiascarbonia|im|imperia|is|isernia|kr|la-spezia|laquila|laspezia|latina|lc|le|lecce|lecco|li|livorno|lo|lodi|lt|lu|lucca|macerata|mantova|massa-carrara|massacarrara|matera|mb|mc|me|medio-campidano|mediocampidano|messina|mi|milan|milano|mn|mo|modena|monza-brianza|monza-e-della-brianza|monza|monzabrianza|monzaebrianza|monzaedellabrianza|ms|mt|na|naples|napoli|no|novara|nu|nuoro|og|ogliastra|olbia-tempio|olbiatempio|or|oristano|ot|pa|padova|padua|palermo|parma|pavia|pc|pd|pe|perugia|pesaro-urbino|pesarourbino|pescara|pg|pi|piacenza|pisa|pistoia|pn|po|pordenone|potenza|pr|prato|pt|pu|pv|pz|ra|ragusa|ravenna|rc|re|reggio-calabria|reggio-emilia|reggiocalabria|reggioemilia|rg|ri|rieti|rimini|rm|rn|ro|roma|rome|rovigo|sa|salerno|sassari|savona|si|siena|siracusa|so|sondrio|sp|sr|ss|suedtirol|sv|ta|taranto|te|tempio-olbia|tempioolbia|teramo|terni|tn|to|torino|tp|tr|trani-andria-barletta|trani-barletta-andria|traniandriabarletta|tranibarlettaandria|trapani|trentino|trento|treviso|trieste|ts|turin|tv|ud|udine|urbino-pesaro|urbinopesaro|va|varese|vb|vc|ve|venezia|venice|verbania|vercelli|verona|vi|vibo-valentia|vibovalentia|vicenza|viterbo|vr|vs|vt|vv|blogspot","je":"co|net|org","jm":"*","jo":"com|org|net|edu|sch|gov|mil|name","jobs":"","jp":"ac|ad|co|ed|go|gr|lg|ne|or|aichi|akita|aomori|chiba|ehime|fukui|fukuoka|fukushima|gifu|gunma|hiroshima|hokkaido|hyogo|ibaraki|ishikawa|iwate|kagawa|kagoshima|kanagawa|kochi|kumamoto|kyoto|mie|miyagi|miyazaki|nagano|nagasaki|nara|niigata|oita|okayama|okinawa|osaka|saga|saitama|shiga|shimane|shizuoka|tochigi|tokushima|tokyo|tottori|toyama|wakayama|yamagata|yamaguchi|yamanashi|xn--4pvxs|xn--vgu402c|xn--c3s14m|xn--f6qx53a|xn--8pvr4u|xn--uist22h|xn--djrs72d6uy|xn--mkru45i|xn--0trq7p7nn|xn--8ltr62k|xn--2m4a15e|xn--efvn9s|xn--32vp30h|xn--4it797k|xn--1lqs71d|xn--5rtp49c|xn--5js045d|xn--ehqz56n|xn--1lqs03n|xn--qqqt11m|xn--kbrq7o|xn--pssu33l|xn--ntsq17g|xn--uisz3g|xn--6btw5a|xn--1ctwo|xn--6orx2r|xn--rht61e|xn--rht27z|xn--djty4k|xn--nit225k|xn--rht3d|xn--klty5x|xn--kltx9a|xn--kltp7d|xn--uuwu58a|xn--zbx025d|xn--ntso0iqx3a|xn--elqq16h|xn--4it168d|xn--klt787d|xn--rny31h|xn--7t0a264c|xn--5rtq34k|xn--k7yn95e|xn--tor131o|xn--d5qv7z876c|*kawasaki|*kitakyushu|*kobe|*nagoya|*sapporo|*sendai|*yokohama|!city.kawasaki|!city.kitakyushu|!city.kobe|!city.nagoya|!city.sapporo|!city.sendai|!city.yokohama|aisai.aichi|ama.aichi|anjo.aichi|asuke.aichi|chiryu.aichi|chita.aichi|fuso.aichi|gamagori.aichi|handa.aichi|hazu.aichi|hekinan.aichi|higashiura.aichi|ichinomiya.aichi|inazawa.aichi|inuyama.aichi|isshiki.aichi|iwakura.aichi|kanie.aichi|kariya.aichi|kasugai.aichi|kira.aichi|kiyosu.aichi|komaki.aichi|konan.aichi|kota.aichi|mihama.aichi|miyoshi.aichi|nishio.aichi|nisshin.aichi|obu.aichi|oguchi.aichi|oharu.aichi|okazaki.aichi|owariasahi.aichi|seto.aichi|shikatsu.aichi|shinshiro.aichi|shitara.aichi|tahara.aichi|takahama.aichi|tobishima.aichi|toei.aichi|togo.aichi|tokai.aichi|tokoname.aichi|toyoake.aichi|toyohashi.aichi|toyokawa.aichi|toyone.aichi|toyota.aichi|tsushima.aichi|yatomi.aichi|akita.akita|daisen.akita|fujisato.akita|gojome.akita|hachirogata.akita|happou.akita|higashinaruse.akita|honjo.akita|honjyo.akita|ikawa.akita|kamikoani.akita|kamioka.akita|katagami.akita|kazuno.akita|kitaakita.akita|kosaka.akita|kyowa.akita|misato.akita|mitane.akita|moriyoshi.akita|nikaho.akita|noshiro.akita|odate.akita|oga.akita|ogata.akita|semboku.akita|yokote.akita|yurihonjo.akita|aomori.aomori|gonohe.aomori|hachinohe.aomori|hashikami.aomori|hiranai.aomori|hirosaki.aomori|itayanagi.aomori|kuroishi.aomori|misawa.aomori|mutsu.aomori|nakadomari.aomori|noheji.aomori|oirase.aomori|owani.aomori|rokunohe.aomori|sannohe.aomori|shichinohe.aomori|shingo.aomori|takko.aomori|towada.aomori|tsugaru.aomori|tsuruta.aomori|abiko.chiba|asahi.chiba|chonan.chiba|chosei.chiba|choshi.chiba|chuo.chiba|funabashi.chiba|futtsu.chiba|hanamigawa.chiba|ichihara.chiba|ichikawa.chiba|ichinomiya.chiba|inzai.chiba|isumi.chiba|kamagaya.chiba|kamogawa.chiba|kashiwa.chiba|katori.chiba|katsuura.chiba|kimitsu.chiba|kisarazu.chiba|kozaki.chiba|kujukuri.chiba|kyonan.chiba|matsudo.chiba|midori.chiba|mihama.chiba|minamiboso.chiba|mobara.chiba|mutsuzawa.chiba|nagara.chiba|nagareyama.chiba|narashino.chiba|narita.chiba|noda.chiba|oamishirasato.chiba|omigawa.chiba|onjuku.chiba|otaki.chiba|sakae.chiba|sakura.chiba|shimofusa.chiba|shirako.chiba|shiroi.chiba|shisui.chiba|sodegaura.chiba|sosa.chiba|tako.chiba|tateyama.chiba|togane.chiba|tohnosho.chiba|tomisato.chiba|urayasu.chiba|yachimata.chiba|yachiyo.chiba|yokaichiba.chiba|yokoshibahikari.chiba|yotsukaido.chiba|ainan.ehime|honai.ehime|ikata.ehime|imabari.ehime|iyo.ehime|kamijima.ehime|kihoku.ehime|kumakogen.ehime|masaki.ehime|matsuno.ehime|matsuyama.ehime|namikata.ehime|niihama.ehime|ozu.ehime|saijo.ehime|seiyo.ehime|shikokuchuo.ehime|tobe.ehime|toon.ehime|uchiko.ehime|uwajima.ehime|yawatahama.ehime|echizen.fukui|eiheiji.fukui|fukui.fukui|ikeda.fukui|katsuyama.fukui|mihama.fukui|minamiechizen.fukui|obama.fukui|ohi.fukui|ono.fukui|sabae.fukui|sakai.fukui|takahama.fukui|tsuruga.fukui|wakasa.fukui|ashiya.fukuoka|buzen.fukuoka|chikugo.fukuoka|chikuho.fukuoka|chikujo.fukuoka|chikushino.fukuoka|chikuzen.fukuoka|chuo.fukuoka|dazaifu.fukuoka|fukuchi.fukuoka|hakata.fukuoka|higashi.fukuoka|hirokawa.fukuoka|hisayama.fukuoka|iizuka.fukuoka|inatsuki.fukuoka|kaho.fukuoka|kasuga.fukuoka|kasuya.fukuoka|kawara.fukuoka|keisen.fukuoka|koga.fukuoka|kurate.fukuoka|kurogi.fukuoka|kurume.fukuoka|minami.fukuoka|miyako.fukuoka|miyama.fukuoka|miyawaka.fukuoka|mizumaki.fukuoka|munakata.fukuoka|nakagawa.fukuoka|nakama.fukuoka|nishi.fukuoka|nogata.fukuoka|ogori.fukuoka|okagaki.fukuoka|okawa.fukuoka|oki.fukuoka|omuta.fukuoka|onga.fukuoka|onojo.fukuoka|oto.fukuoka|saigawa.fukuoka|sasaguri.fukuoka|shingu.fukuoka|shinyoshitomi.fukuoka|shonai.fukuoka|soeda.fukuoka|sue.fukuoka|tachiarai.fukuoka|tagawa.fukuoka|takata.fukuoka|toho.fukuoka|toyotsu.fukuoka|tsuiki.fukuoka|ukiha.fukuoka|umi.fukuoka|usui.fukuoka|yamada.fukuoka|yame.fukuoka|yanagawa.fukuoka|yukuhashi.fukuoka|aizubange.fukushima|aizumisato.fukushima|aizuwakamatsu.fukushima|asakawa.fukushima|bandai.fukushima|date.fukushima|fukushima.fukushima|furudono.fukushima|futaba.fukushima|hanawa.fukushima|higashi.fukushima|hirata.fukushima|hirono.fukushima|iitate.fukushima|inawashiro.fukushima|ishikawa.fukushima|iwaki.fukushima|izumizaki.fukushima|kagamiishi.fukushima|kaneyama.fukushima|kawamata.fukushima|kitakata.fukushima|kitashiobara.fukushima|koori.fukushima|koriyama.fukushima|kunimi.fukushima|miharu.fukushima|mishima.fukushima|namie.fukushima|nango.fukushima|nishiaizu.fukushima|nishigo.fukushima|okuma.fukushima|omotego.fukushima|ono.fukushima|otama.fukushima|samegawa.fukushima|shimogo.fukushima|shirakawa.fukushima|showa.fukushima|soma.fukushima|sukagawa.fukushima|taishin.fukushima|tamakawa.fukushima|tanagura.fukushima|tenei.fukushima|yabuki.fukushima|yamato.fukushima|yamatsuri.fukushima|yanaizu.fukushima|yugawa.fukushima|anpachi.gifu|ena.gifu|gifu.gifu|ginan.gifu|godo.gifu|gujo.gifu|hashima.gifu|hichiso.gifu|hida.gifu|higashishirakawa.gifu|ibigawa.gifu|ikeda.gifu|kakamigahara.gifu|kani.gifu|kasahara.gifu|kasamatsu.gifu|kawaue.gifu|kitagata.gifu|mino.gifu|minokamo.gifu|mitake.gifu|mizunami.gifu|motosu.gifu|nakatsugawa.gifu|ogaki.gifu|sakahogi.gifu|seki.gifu|sekigahara.gifu|shirakawa.gifu|tajimi.gifu|takayama.gifu|tarui.gifu|toki.gifu|tomika.gifu|wanouchi.gifu|yamagata.gifu|yaotsu.gifu|yoro.gifu|annaka.gunma|chiyoda.gunma|fujioka.gunma|higashiagatsuma.gunma|isesaki.gunma|itakura.gunma|kanna.gunma|kanra.gunma|katashina.gunma|kawaba.gunma|kiryu.gunma|kusatsu.gunma|maebashi.gunma|meiwa.gunma|midori.gunma|minakami.gunma|naganohara.gunma|nakanojo.gunma|nanmoku.gunma|numata.gunma|oizumi.gunma|ora.gunma|ota.gunma|shibukawa.gunma|shimonita.gunma|shinto.gunma|showa.gunma|takasaki.gunma|takayama.gunma|tamamura.gunma|tatebayashi.gunma|tomioka.gunma|tsukiyono.gunma|tsumagoi.gunma|ueno.gunma|yoshioka.gunma|asaminami.hiroshima|daiwa.hiroshima|etajima.hiroshima|fuchu.hiroshima|fukuyama.hiroshima|hatsukaichi.hiroshima|higashihiroshima.hiroshima|hongo.hiroshima|jinsekikogen.hiroshima|kaita.hiroshima|kui.hiroshima|kumano.hiroshima|kure.hiroshima|mihara.hiroshima|miyoshi.hiroshima|naka.hiroshima|onomichi.hiroshima|osakikamijima.hiroshima|otake.hiroshima|saka.hiroshima|sera.hiroshima|seranishi.hiroshima|shinichi.hiroshima|shobara.hiroshima|takehara.hiroshima|abashiri.hokkaido|abira.hokkaido|aibetsu.hokkaido|akabira.hokkaido|akkeshi.hokkaido|asahikawa.hokkaido|ashibetsu.hokkaido|ashoro.hokkaido|assabu.hokkaido|atsuma.hokkaido|bibai.hokkaido|biei.hokkaido|bifuka.hokkaido|bihoro.hokkaido|biratori.hokkaido|chippubetsu.hokkaido|chitose.hokkaido|date.hokkaido|ebetsu.hokkaido|embetsu.hokkaido|eniwa.hokkaido|erimo.hokkaido|esan.hokkaido|esashi.hokkaido|fukagawa.hokkaido|fukushima.hokkaido|furano.hokkaido|furubira.hokkaido|haboro.hokkaido|hakodate.hokkaido|hamatonbetsu.hokkaido|hidaka.hokkaido|higashikagura.hokkaido|higashikawa.hokkaido|hiroo.hokkaido|hokuryu.hokkaido|hokuto.hokkaido|honbetsu.hokkaido|horokanai.hokkaido|horonobe.hokkaido|ikeda.hokkaido|imakane.hokkaido|ishikari.hokkaido|iwamizawa.hokkaido|iwanai.hokkaido|kamifurano.hokkaido|kamikawa.hokkaido|kamishihoro.hokkaido|kamisunagawa.hokkaido|kamoenai.hokkaido|kayabe.hokkaido|kembuchi.hokkaido|kikonai.hokkaido|kimobetsu.hokkaido|kitahiroshima.hokkaido|kitami.hokkaido|kiyosato.hokkaido|koshimizu.hokkaido|kunneppu.hokkaido|kuriyama.hokkaido|kuromatsunai.hokkaido|kushiro.hokkaido|kutchan.hokkaido|kyowa.hokkaido|mashike.hokkaido|matsumae.hokkaido|mikasa.hokkaido|minamifurano.hokkaido|mombetsu.hokkaido|moseushi.hokkaido|mukawa.hokkaido|muroran.hokkaido|naie.hokkaido|nakagawa.hokkaido|nakasatsunai.hokkaido|nakatombetsu.hokkaido|nanae.hokkaido|nanporo.hokkaido|nayoro.hokkaido|nemuro.hokkaido|niikappu.hokkaido|niki.hokkaido|nishiokoppe.hokkaido|noboribetsu.hokkaido|numata.hokkaido|obihiro.hokkaido|obira.hokkaido|oketo.hokkaido|okoppe.hokkaido|otaru.hokkaido|otobe.hokkaido|otofuke.hokkaido|otoineppu.hokkaido|oumu.hokkaido|ozora.hokkaido|pippu.hokkaido|rankoshi.hokkaido|rebun.hokkaido|rikubetsu.hokkaido|rishiri.hokkaido|rishirifuji.hokkaido|saroma.hokkaido|sarufutsu.hokkaido|shakotan.hokkaido|shari.hokkaido|shibecha.hokkaido|shibetsu.hokkaido|shikabe.hokkaido|shikaoi.hokkaido|shimamaki.hokkaido|shimizu.hokkaido|shimokawa.hokkaido|shinshinotsu.hokkaido|shintoku.hokkaido|shiranuka.hokkaido|shiraoi.hokkaido|shiriuchi.hokkaido|sobetsu.hokkaido|sunagawa.hokkaido|taiki.hokkaido|takasu.hokkaido|takikawa.hokkaido|takinoue.hokkaido|teshikaga.hokkaido|tobetsu.hokkaido|tohma.hokkaido|tomakomai.hokkaido|tomari.hokkaido|toya.hokkaido|toyako.hokkaido|toyotomi.hokkaido|toyoura.hokkaido|tsubetsu.hokkaido|tsukigata.hokkaido|urakawa.hokkaido|urausu.hokkaido|uryu.hokkaido|utashinai.hokkaido|wakkanai.hokkaido|wassamu.hokkaido|yakumo.hokkaido|yoichi.hokkaido|aioi.hyogo|akashi.hyogo|ako.hyogo|amagasaki.hyogo|aogaki.hyogo|asago.hyogo|ashiya.hyogo|awaji.hyogo|fukusaki.hyogo|goshiki.hyogo|harima.hyogo|himeji.hyogo|ichikawa.hyogo|inagawa.hyogo|itami.hyogo|kakogawa.hyogo|kamigori.hyogo|kamikawa.hyogo|kasai.hyogo|kasuga.hyogo|kawanishi.hyogo|miki.hyogo|minamiawaji.hyogo|nishinomiya.hyogo|nishiwaki.hyogo|ono.hyogo|sanda.hyogo|sannan.hyogo|sasayama.hyogo|sayo.hyogo|shingu.hyogo|shinonsen.hyogo|shiso.hyogo|sumoto.hyogo|taishi.hyogo|taka.hyogo|takarazuka.hyogo|takasago.hyogo|takino.hyogo|tamba.hyogo|tatsuno.hyogo|toyooka.hyogo|yabu.hyogo|yashiro.hyogo|yoka.hyogo|yokawa.hyogo|ami.ibaraki|asahi.ibaraki|bando.ibaraki|chikusei.ibaraki|daigo.ibaraki|fujishiro.ibaraki|hitachi.ibaraki|hitachinaka.ibaraki|hitachiomiya.ibaraki|hitachiota.ibaraki|ibaraki.ibaraki|ina.ibaraki|inashiki.ibaraki|itako.ibaraki|iwama.ibaraki|joso.ibaraki|kamisu.ibaraki|kasama.ibaraki|kashima.ibaraki|kasumigaura.ibaraki|koga.ibaraki|miho.ibaraki|mito.ibaraki|moriya.ibaraki|naka.ibaraki|namegata.ibaraki|oarai.ibaraki|ogawa.ibaraki|omitama.ibaraki|ryugasaki.ibaraki|sakai.ibaraki|sakuragawa.ibaraki|shimodate.ibaraki|shimotsuma.ibaraki|shirosato.ibaraki|sowa.ibaraki|suifu.ibaraki|takahagi.ibaraki|tamatsukuri.ibaraki|tokai.ibaraki|tomobe.ibaraki|tone.ibaraki|toride.ibaraki|tsuchiura.ibaraki|tsukuba.ibaraki|uchihara.ibaraki|ushiku.ibaraki|yachiyo.ibaraki|yamagata.ibaraki|yawara.ibaraki|yuki.ibaraki|anamizu.ishikawa|hakui.ishikawa|hakusan.ishikawa|kaga.ishikawa|kahoku.ishikawa|kanazawa.ishikawa|kawakita.ishikawa|komatsu.ishikawa|nakanoto.ishikawa|nanao.ishikawa|nomi.ishikawa|nonoichi.ishikawa|noto.ishikawa|shika.ishikawa|suzu.ishikawa|tsubata.ishikawa|tsurugi.ishikawa|uchinada.ishikawa|wajima.ishikawa|fudai.iwate|fujisawa.iwate|hanamaki.iwate|hiraizumi.iwate|hirono.iwate|ichinohe.iwate|ichinoseki.iwate|iwaizumi.iwate|iwate.iwate|joboji.iwate|kamaishi.iwate|kanegasaki.iwate|karumai.iwate|kawai.iwate|kitakami.iwate|kuji.iwate|kunohe.iwate|kuzumaki.iwate|miyako.iwate|mizusawa.iwate|morioka.iwate|ninohe.iwate|noda.iwate|ofunato.iwate|oshu.iwate|otsuchi.iwate|rikuzentakata.iwate|shiwa.iwate|shizukuishi.iwate|sumita.iwate|tanohata.iwate|tono.iwate|yahaba.iwate|yamada.iwate|ayagawa.kagawa|higashikagawa.kagawa|kanonji.kagawa|kotohira.kagawa|manno.kagawa|marugame.kagawa|mitoyo.kagawa|naoshima.kagawa|sanuki.kagawa|tadotsu.kagawa|takamatsu.kagawa|tonosho.kagawa|uchinomi.kagawa|utazu.kagawa|zentsuji.kagawa|akune.kagoshima|amami.kagoshima|hioki.kagoshima|isa.kagoshima|isen.kagoshima|izumi.kagoshima|kagoshima.kagoshima|kanoya.kagoshima|kawanabe.kagoshima|kinko.kagoshima|kouyama.kagoshima|makurazaki.kagoshima|matsumoto.kagoshima|minamitane.kagoshima|nakatane.kagoshima|nishinoomote.kagoshima|satsumasendai.kagoshima|soo.kagoshima|tarumizu.kagoshima|yusui.kagoshima|aikawa.kanagawa|atsugi.kanagawa|ayase.kanagawa|chigasaki.kanagawa|ebina.kanagawa|fujisawa.kanagawa|hadano.kanagawa|hakone.kanagawa|hiratsuka.kanagawa|isehara.kanagawa|kaisei.kanagawa|kamakura.kanagawa|kiyokawa.kanagawa|matsuda.kanagawa|minamiashigara.kanagawa|miura.kanagawa|nakai.kanagawa|ninomiya.kanagawa|odawara.kanagawa|oi.kanagawa|oiso.kanagawa|sagamihara.kanagawa|samukawa.kanagawa|tsukui.kanagawa|yamakita.kanagawa|yamato.kanagawa|yokosuka.kanagawa|yugawara.kanagawa|zama.kanagawa|zushi.kanagawa|aki.kochi|geisei.kochi|hidaka.kochi|higashitsuno.kochi|ino.kochi|kagami.kochi|kami.kochi|kitagawa.kochi|kochi.kochi|mihara.kochi|motoyama.kochi|muroto.kochi|nahari.kochi|nakamura.kochi|nankoku.kochi|nishitosa.kochi|niyodogawa.kochi|ochi.kochi|okawa.kochi|otoyo.kochi|otsuki.kochi|sakawa.kochi|sukumo.kochi|susaki.kochi|tosa.kochi|tosashimizu.kochi|toyo.kochi|tsuno.kochi|umaji.kochi|yasuda.kochi|yusuhara.kochi|amakusa.kumamoto|arao.kumamoto|aso.kumamoto|choyo.kumamoto|gyokuto.kumamoto|hitoyoshi.kumamoto|kamiamakusa.kumamoto|kashima.kumamoto|kikuchi.kumamoto|kosa.kumamoto|kumamoto.kumamoto|mashiki.kumamoto|mifune.kumamoto|minamata.kumamoto|minamioguni.kumamoto|nagasu.kumamoto|nishihara.kumamoto|oguni.kumamoto|ozu.kumamoto|sumoto.kumamoto|takamori.kumamoto|uki.kumamoto|uto.kumamoto|yamaga.kumamoto|yamato.kumamoto|yatsushiro.kumamoto|ayabe.kyoto|fukuchiyama.kyoto|higashiyama.kyoto|ide.kyoto|ine.kyoto|joyo.kyoto|kameoka.kyoto|kamo.kyoto|kita.kyoto|kizu.kyoto|kumiyama.kyoto|kyotamba.kyoto|kyotanabe.kyoto|kyotango.kyoto|maizuru.kyoto|minami.kyoto|minamiyamashiro.kyoto|miyazu.kyoto|muko.kyoto|nagaokakyo.kyoto|nakagyo.kyoto|nantan.kyoto|oyamazaki.kyoto|sakyo.kyoto|seika.kyoto|tanabe.kyoto|uji.kyoto|ujitawara.kyoto|wazuka.kyoto|yamashina.kyoto|yawata.kyoto|asahi.mie|inabe.mie|ise.mie|kameyama.mie|kawagoe.mie|kiho.mie|kisosaki.mie|kiwa.mie|komono.mie|kumano.mie|kuwana.mie|matsusaka.mie|meiwa.mie|mihama.mie|minamiise.mie|misugi.mie|miyama.mie|nabari.mie|shima.mie|suzuka.mie|tado.mie|taiki.mie|taki.mie|tamaki.mie|toba.mie|tsu.mie|udono.mie|ureshino.mie|watarai.mie|yokkaichi.mie|furukawa.miyagi|higashimatsushima.miyagi|ishinomaki.miyagi|iwanuma.miyagi|kakuda.miyagi|kami.miyagi|kawasaki.miyagi|kesennuma.miyagi|marumori.miyagi|matsushima.miyagi|minamisanriku.miyagi|misato.miyagi|murata.miyagi|natori.miyagi|ogawara.miyagi|ohira.miyagi|onagawa.miyagi|osaki.miyagi|rifu.miyagi|semine.miyagi|shibata.miyagi|shichikashuku.miyagi|shikama.miyagi|shiogama.miyagi|shiroishi.miyagi|tagajo.miyagi|taiwa.miyagi|tome.miyagi|tomiya.miyagi|wakuya.miyagi|watari.miyagi|yamamoto.miyagi|zao.miyagi|aya.miyazaki|ebino.miyazaki|gokase.miyazaki|hyuga.miyazaki|kadogawa.miyazaki|kawaminami.miyazaki|kijo.miyazaki|kitagawa.miyazaki|kitakata.miyazaki|kitaura.miyazaki|kobayashi.miyazaki|kunitomi.miyazaki|kushima.miyazaki|mimata.miyazaki|miyakonojo.miyazaki|miyazaki.miyazaki|morotsuka.miyazaki|nichinan.miyazaki|nishimera.miyazaki|nobeoka.miyazaki|saito.miyazaki|shiiba.miyazaki|shintomi.miyazaki|takaharu.miyazaki|takanabe.miyazaki|takazaki.miyazaki|tsuno.miyazaki|achi.nagano|agematsu.nagano|anan.nagano|aoki.nagano|asahi.nagano|azumino.nagano|chikuhoku.nagano|chikuma.nagano|chino.nagano|fujimi.nagano|hakuba.nagano|hara.nagano|hiraya.nagano|iida.nagano|iijima.nagano|iiyama.nagano|iizuna.nagano|ikeda.nagano|ikusaka.nagano|ina.nagano|karuizawa.nagano|kawakami.nagano|kiso.nagano|kisofukushima.nagano|kitaaiki.nagano|komagane.nagano|komoro.nagano|matsukawa.nagano|matsumoto.nagano|miasa.nagano|minamiaiki.nagano|minamimaki.nagano|minamiminowa.nagano|minowa.nagano|miyada.nagano|miyota.nagano|mochizuki.nagano|nagano.nagano|nagawa.nagano|nagiso.nagano|nakagawa.nagano|nakano.nagano|nozawaonsen.nagano|obuse.nagano|ogawa.nagano|okaya.nagano|omachi.nagano|omi.nagano|ookuwa.nagano|ooshika.nagano|otaki.nagano|otari.nagano|sakae.nagano|sakaki.nagano|saku.nagano|sakuho.nagano|shimosuwa.nagano|shinanomachi.nagano|shiojiri.nagano|suwa.nagano|suzaka.nagano|takagi.nagano|takamori.nagano|takayama.nagano|tateshina.nagano|tatsuno.nagano|togakushi.nagano|togura.nagano|tomi.nagano|ueda.nagano|wada.nagano|yamagata.nagano|yamanouchi.nagano|yasaka.nagano|yasuoka.nagano|chijiwa.nagasaki|futsu.nagasaki|goto.nagasaki|hasami.nagasaki|hirado.nagasaki|iki.nagasaki|isahaya.nagasaki|kawatana.nagasaki|kuchinotsu.nagasaki|matsuura.nagasaki|nagasaki.nagasaki|obama.nagasaki|omura.nagasaki|oseto.nagasaki|saikai.nagasaki|sasebo.nagasaki|seihi.nagasaki|shimabara.nagasaki|shinkamigoto.nagasaki|togitsu.nagasaki|tsushima.nagasaki|unzen.nagasaki|ando.nara|gose.nara|heguri.nara|higashiyoshino.nara|ikaruga.nara|ikoma.nara|kamikitayama.nara|kanmaki.nara|kashiba.nara|kashihara.nara|katsuragi.nara|kawai.nara|kawakami.nara|kawanishi.nara|koryo.nara|kurotaki.nara|mitsue.nara|miyake.nara|nara.nara|nosegawa.nara|oji.nara|ouda.nara|oyodo.nara|sakurai.nara|sango.nara|shimoichi.nara|shimokitayama.nara|shinjo.nara|soni.nara|takatori.nara|tawaramoto.nara|tenkawa.nara|tenri.nara|uda.nara|yamatokoriyama.nara|yamatotakada.nara|yamazoe.nara|yoshino.nara|aga.niigata|agano.niigata|gosen.niigata|itoigawa.niigata|izumozaki.niigata|joetsu.niigata|kamo.niigata|kariwa.niigata|kashiwazaki.niigata|minamiuonuma.niigata|mitsuke.niigata|muika.niigata|murakami.niigata|myoko.niigata|nagaoka.niigata|niigata.niigata|ojiya.niigata|omi.niigata|sado.niigata|sanjo.niigata|seiro.niigata|seirou.niigata|sekikawa.niigata|shibata.niigata|tagami.niigata|tainai.niigata|tochio.niigata|tokamachi.niigata|tsubame.niigata|tsunan.niigata|uonuma.niigata|yahiko.niigata|yoita.niigata|yuzawa.niigata|beppu.oita|bungoono.oita|bungotakada.oita|hasama.oita|hiji.oita|himeshima.oita|hita.oita|kamitsue.oita|kokonoe.oita|kuju.oita|kunisaki.oita|kusu.oita|oita.oita|saiki.oita|taketa.oita|tsukumi.oita|usa.oita|usuki.oita|yufu.oita|akaiwa.okayama|asakuchi.okayama|bizen.okayama|hayashima.okayama|ibara.okayama|kagamino.okayama|kasaoka.okayama|kibichuo.okayama|kumenan.okayama|kurashiki.okayama|maniwa.okayama|misaki.okayama|nagi.okayama|niimi.okayama|nishiawakura.okayama|okayama.okayama|satosho.okayama|setouchi.okayama|shinjo.okayama|shoo.okayama|soja.okayama|takahashi.okayama|tamano.okayama|tsuyama.okayama|wake.okayama|yakage.okayama|aguni.okinawa|ginowan.okinawa|ginoza.okinawa|gushikami.okinawa|haebaru.okinawa|higashi.okinawa|hirara.okinawa|iheya.okinawa|ishigaki.okinawa|ishikawa.okinawa|itoman.okinawa|izena.okinawa|kadena.okinawa|kin.okinawa|kitadaito.okinawa|kitanakagusuku.okinawa|kumejima.okinawa|kunigami.okinawa|minamidaito.okinawa|motobu.okinawa|nago.okinawa|naha.okinawa|nakagusuku.okinawa|nakijin.okinawa|nanjo.okinawa|nishihara.okinawa|ogimi.okinawa|okinawa.okinawa|onna.okinawa|shimoji.okinawa|taketomi.okinawa|tarama.okinawa|tokashiki.okinawa|tomigusuku.okinawa|tonaki.okinawa|urasoe.okinawa|uruma.okinawa|yaese.okinawa|yomitan.okinawa|yonabaru.okinawa|yonaguni.okinawa|zamami.okinawa|abeno.osaka|chihayaakasaka.osaka|chuo.osaka|daito.osaka|fujiidera.osaka|habikino.osaka|hannan.osaka|higashiosaka.osaka|higashisumiyoshi.osaka|higashiyodogawa.osaka|hirakata.osaka|ibaraki.osaka|ikeda.osaka|izumi.osaka|izumiotsu.osaka|izumisano.osaka|kadoma.osaka|kaizuka.osaka|kanan.osaka|kashiwara.osaka|katano.osaka|kawachinagano.osaka|kishiwada.osaka|kita.osaka|kumatori.osaka|matsubara.osaka|minato.osaka|minoh.osaka|misaki.osaka|moriguchi.osaka|neyagawa.osaka|nishi.osaka|nose.osaka|osakasayama.osaka|sakai.osaka|sayama.osaka|sennan.osaka|settsu.osaka|shijonawate.osaka|shimamoto.osaka|suita.osaka|tadaoka.osaka|taishi.osaka|tajiri.osaka|takaishi.osaka|takatsuki.osaka|tondabayashi.osaka|toyonaka.osaka|toyono.osaka|yao.osaka|ariake.saga|arita.saga|fukudomi.saga|genkai.saga|hamatama.saga|hizen.saga|imari.saga|kamimine.saga|kanzaki.saga|karatsu.saga|kashima.saga|kitagata.saga|kitahata.saga|kiyama.saga|kouhoku.saga|kyuragi.saga|nishiarita.saga|ogi.saga|omachi.saga|ouchi.saga|saga.saga|shiroishi.saga|taku.saga|tara.saga|tosu.saga|yoshinogari.saga|arakawa.saitama|asaka.saitama|chichibu.saitama|fujimi.saitama|fujimino.saitama|fukaya.saitama|hanno.saitama|hanyu.saitama|hasuda.saitama|hatogaya.saitama|hatoyama.saitama|hidaka.saitama|higashichichibu.saitama|higashimatsuyama.saitama|honjo.saitama|ina.saitama|iruma.saitama|iwatsuki.saitama|kamiizumi.saitama|kamikawa.saitama|kamisato.saitama|kasukabe.saitama|kawagoe.saitama|kawaguchi.saitama|kawajima.saitama|kazo.saitama|kitamoto.saitama|koshigaya.saitama|kounosu.saitama|kuki.saitama|kumagaya.saitama|matsubushi.saitama|minano.saitama|misato.saitama|miyashiro.saitama|miyoshi.saitama|moroyama.saitama|nagatoro.saitama|namegawa.saitama|niiza.saitama|ogano.saitama|ogawa.saitama|ogose.saitama|okegawa.saitama|omiya.saitama|otaki.saitama|ranzan.saitama|ryokami.saitama|saitama.saitama|sakado.saitama|satte.saitama|sayama.saitama|shiki.saitama|shiraoka.saitama|soka.saitama|sugito.saitama|toda.saitama|tokigawa.saitama|tokorozawa.saitama|tsurugashima.saitama|urawa.saitama|warabi.saitama|yashio.saitama|yokoze.saitama|yono.saitama|yorii.saitama|yoshida.saitama|yoshikawa.saitama|yoshimi.saitama|aisho.shiga|gamo.shiga|higashiomi.shiga|hikone.shiga|koka.shiga|konan.shiga|kosei.shiga|koto.shiga|kusatsu.shiga|maibara.shiga|moriyama.shiga|nagahama.shiga|nishiazai.shiga|notogawa.shiga|omihachiman.shiga|otsu.shiga|ritto.shiga|ryuoh.shiga|takashima.shiga|takatsuki.shiga|torahime.shiga|toyosato.shiga|yasu.shiga|akagi.shimane|ama.shimane|gotsu.shimane|hamada.shimane|higashiizumo.shimane|hikawa.shimane|hikimi.shimane|izumo.shimane|kakinoki.shimane|masuda.shimane|matsue.shimane|misato.shimane|nishinoshima.shimane|ohda.shimane|okinoshima.shimane|okuizumo.shimane|shimane.shimane|tamayu.shimane|tsuwano.shimane|unnan.shimane|yakumo.shimane|yasugi.shimane|yatsuka.shimane|arai.shizuoka|atami.shizuoka|fuji.shizuoka|fujieda.shizuoka|fujikawa.shizuoka|fujinomiya.shizuoka|fukuroi.shizuoka|gotemba.shizuoka|haibara.shizuoka|hamamatsu.shizuoka|higashiizu.shizuoka|ito.shizuoka|iwata.shizuoka|izu.shizuoka|izunokuni.shizuoka|kakegawa.shizuoka|kannami.shizuoka|kawanehon.shizuoka|kawazu.shizuoka|kikugawa.shizuoka|kosai.shizuoka|makinohara.shizuoka|matsuzaki.shizuoka|minamiizu.shizuoka|mishima.shizuoka|morimachi.shizuoka|nishiizu.shizuoka|numazu.shizuoka|omaezaki.shizuoka|shimada.shizuoka|shimizu.shizuoka|shimoda.shizuoka|shizuoka.shizuoka|susono.shizuoka|yaizu.shizuoka|yoshida.shizuoka|ashikaga.tochigi|bato.tochigi|haga.tochigi|ichikai.tochigi|iwafune.tochigi|kaminokawa.tochigi|kanuma.tochigi|karasuyama.tochigi|kuroiso.tochigi|mashiko.tochigi|mibu.tochigi|moka.tochigi|motegi.tochigi|nasu.tochigi|nasushiobara.tochigi|nikko.tochigi|nishikata.tochigi|nogi.tochigi|ohira.tochigi|ohtawara.tochigi|oyama.tochigi|sakura.tochigi|sano.tochigi|shimotsuke.tochigi|shioya.tochigi|takanezawa.tochigi|tochigi.tochigi|tsuga.tochigi|ujiie.tochigi|utsunomiya.tochigi|yaita.tochigi|aizumi.tokushima|anan.tokushima|ichiba.tokushima|itano.tokushima|kainan.tokushima|komatsushima.tokushima|matsushige.tokushima|mima.tokushima|minami.tokushima|miyoshi.tokushima|mugi.tokushima|nakagawa.tokushima|naruto.tokushima|sanagochi.tokushima|shishikui.tokushima|tokushima.tokushima|wajiki.tokushima|adachi.tokyo|akiruno.tokyo|akishima.tokyo|aogashima.tokyo|arakawa.tokyo|bunkyo.tokyo|chiyoda.tokyo|chofu.tokyo|chuo.tokyo|edogawa.tokyo|fuchu.tokyo|fussa.tokyo|hachijo.tokyo|hachioji.tokyo|hamura.tokyo|higashikurume.tokyo|higashimurayama.tokyo|higashiyamato.tokyo|hino.tokyo|hinode.tokyo|hinohara.tokyo|inagi.tokyo|itabashi.tokyo|katsushika.tokyo|kita.tokyo|kiyose.tokyo|kodaira.tokyo|koganei.tokyo|kokubunji.tokyo|komae.tokyo|koto.tokyo|kouzushima.tokyo|kunitachi.tokyo|machida.tokyo|meguro.tokyo|minato.tokyo|mitaka.tokyo|mizuho.tokyo|musashimurayama.tokyo|musashino.tokyo|nakano.tokyo|nerima.tokyo|ogasawara.tokyo|okutama.tokyo|ome.tokyo|oshima.tokyo|ota.tokyo|setagaya.tokyo|shibuya.tokyo|shinagawa.tokyo|shinjuku.tokyo|suginami.tokyo|sumida.tokyo|tachikawa.tokyo|taito.tokyo|tama.tokyo|toshima.tokyo|chizu.tottori|hino.tottori|kawahara.tottori|koge.tottori|kotoura.tottori|misasa.tottori|nanbu.tottori|nichinan.tottori|sakaiminato.tottori|tottori.tottori|wakasa.tottori|yazu.tottori|yonago.tottori|asahi.toyama|fuchu.toyama|fukumitsu.toyama|funahashi.toyama|himi.toyama|imizu.toyama|inami.toyama|johana.toyama|kamiichi.toyama|kurobe.toyama|nakaniikawa.toyama|namerikawa.toyama|nanto.toyama|nyuzen.toyama|oyabe.toyama|taira.toyama|takaoka.toyama|tateyama.toyama|toga.toyama|tonami.toyama|toyama.toyama|unazuki.toyama|uozu.toyama|yamada.toyama|arida.wakayama|aridagawa.wakayama|gobo.wakayama|hashimoto.wakayama|hidaka.wakayama|hirogawa.wakayama|inami.wakayama|iwade.wakayama|kainan.wakayama|kamitonda.wakayama|katsuragi.wakayama|kimino.wakayama|kinokawa.wakayama|kitayama.wakayama|koya.wakayama|koza.wakayama|kozagawa.wakayama|kudoyama.wakayama|kushimoto.wakayama|mihama.wakayama|misato.wakayama|nachikatsuura.wakayama|shingu.wakayama|shirahama.wakayama|taiji.wakayama|tanabe.wakayama|wakayama.wakayama|yuasa.wakayama|yura.wakayama|asahi.yamagata|funagata.yamagata|higashine.yamagata|iide.yamagata|kahoku.yamagata|kaminoyama.yamagata|kaneyama.yamagata|kawanishi.yamagata|mamurogawa.yamagata|mikawa.yamagata|murayama.yamagata|nagai.yamagata|nakayama.yamagata|nanyo.yamagata|nishikawa.yamagata|obanazawa.yamagata|oe.yamagata|oguni.yamagata|ohkura.yamagata|oishida.yamagata|sagae.yamagata|sakata.yamagata|sakegawa.yamagata|shinjo.yamagata|shirataka.yamagata|shonai.yamagata|takahata.yamagata|tendo.yamagata|tozawa.yamagata|tsuruoka.yamagata|yamagata.yamagata|yamanobe.yamagata|yonezawa.yamagata|yuza.yamagata|abu.yamaguchi|hagi.yamaguchi|hikari.yamaguchi|hofu.yamaguchi|iwakuni.yamaguchi|kudamatsu.yamaguchi|mitou.yamaguchi|nagato.yamaguchi|oshima.yamaguchi|shimonoseki.yamaguchi|shunan.yamaguchi|tabuse.yamaguchi|tokuyama.yamaguchi|toyota.yamaguchi|ube.yamaguchi|yuu.yamaguchi|chuo.yamanashi|doshi.yamanashi|fuefuki.yamanashi|fujikawa.yamanashi|fujikawaguchiko.yamanashi|fujiyoshida.yamanashi|hayakawa.yamanashi|hokuto.yamanashi|ichikawamisato.yamanashi|kai.yamanashi|kofu.yamanashi|koshu.yamanashi|kosuge.yamanashi|minami-alps.yamanashi|minobu.yamanashi|nakamichi.yamanashi|nanbu.yamanashi|narusawa.yamanashi|nirasaki.yamanashi|nishikatsura.yamanashi|oshino.yamanashi|otsuki.yamanashi|showa.yamanashi|tabayama.yamanashi|tsuru.yamanashi|uenohara.yamanashi|yamanakako.yamanashi|yamanashi.yamanashi|blogspot","ke":"*|blogspot.co","kg":"org|net|com|edu|gov|mil","kh":"*","ki":"edu|biz|net|org|gov|info|com","km":"org|nom|gov|prd|tm|edu|mil|ass|com|coop|asso|presse|medecin|notaires|pharmaciens|veterinaire|gouv","kn":"net|org|edu|gov","kp":"com|edu|gov|org|rep|tra","kr":"ac|co|es|go|hs|kg|mil|ms|ne|or|pe|re|sc|busan|chungbuk|chungnam|daegu|daejeon|gangwon|gwangju|gyeongbuk|gyeonggi|gyeongnam|incheon|jeju|jeonbuk|jeonnam|seoul|ulsan|blogspot","kw":"*","ky":"edu|gov|com|org|net","kz":"org|edu|net|gov|mil|com","la":"int|net|info|edu|gov|per|com|org|c","lb":"com|edu|gov|net|org","lc":"com|net|co|org|edu|gov","li":"blogspot","lk":"gov|sch|net|int|com|org|edu|ngo|soc|web|ltd|assn|grp|hotel|ac","lr":"com|edu|gov|org|net","ls":"co|org","lt":"gov|blogspot","lu":"blogspot","lv":"com|edu|gov|org|mil|id|net|asn|conf","ly":"com|net|gov|plc|edu|sch|med|org|id","ma":"co|net|gov|org|ac|press","mc":"tm|asso","md":"blogspot","me":"co|net|org|edu|ac|gov|its|priv","mg":"org|nom|gov|prd|tm|edu|mil|com|co","mh":"","mil":"","mk":"com|org|net|edu|gov|inf|name|blogspot","ml":"com|edu|gouv|gov|net|org|presse","mm":"*","mn":"gov|edu|org|nyc","mo":"com|net|org|edu|gov","mobi":"","mp":"","mq":"","mr":"gov|blogspot","ms":"com|edu|gov|net|org","mt":"com|edu|net|org|blogspot.com","mu":"com|net|org|gov|ac|co|or","museum":"academy|agriculture|air|airguard|alabama|alaska|amber|ambulance|american|americana|americanantiques|americanart|amsterdam|and|annefrank|anthro|anthropology|antiques|aquarium|arboretum|archaeological|archaeology|architecture|art|artanddesign|artcenter|artdeco|arteducation|artgallery|arts|artsandcrafts|asmatart|assassination|assisi|association|astronomy|atlanta|austin|australia|automotive|aviation|axis|badajoz|baghdad|bahn|bale|baltimore|barcelona|baseball|basel|baths|bauern|beauxarts|beeldengeluid|bellevue|bergbau|berkeley|berlin|bern|bible|bilbao|bill|birdart|birthplace|bonn|boston|botanical|botanicalgarden|botanicgarden|botany|brandywinevalley|brasil|bristol|british|britishcolumbia|broadcast|brunel|brussel|brussels|bruxelles|building|burghof|bus|bushey|cadaques|california|cambridge|can|canada|capebreton|carrier|cartoonart|casadelamoneda|castle|castres|celtic|center|chattanooga|cheltenham|chesapeakebay|chicago|children|childrens|childrensgarden|chiropractic|chocolate|christiansburg|cincinnati|cinema|circus|civilisation|civilization|civilwar|clinton|clock|coal|coastaldefence|cody|coldwar|collection|colonialwilliamsburg|coloradoplateau|columbia|columbus|communication|communications|community|computer|computerhistory|xn--comunicaes-v6a2o|contemporary|contemporaryart|convent|copenhagen|corporation|xn--correios-e-telecomunicaes-ghc29a|corvette|costume|countryestate|county|crafts|cranbrook|creation|cultural|culturalcenter|culture|cyber|cymru|dali|dallas|database|ddr|decorativearts|delaware|delmenhorst|denmark|depot|design|detroit|dinosaur|discovery|dolls|donostia|durham|eastafrica|eastcoast|education|educational|egyptian|eisenbahn|elburg|elvendrell|embroidery|encyclopedic|england|entomology|environment|environmentalconservation|epilepsy|essex|estate|ethnology|exeter|exhibition|family|farm|farmequipment|farmers|farmstead|field|figueres|filatelia|film|fineart|finearts|finland|flanders|florida|force|fortmissoula|fortworth|foundation|francaise|frankfurt|franziskaner|freemasonry|freiburg|fribourg|frog|fundacio|furniture|gallery|garden|gateway|geelvinck|gemological|geology|georgia|giessen|glas|glass|gorge|grandrapids|graz|guernsey|halloffame|hamburg|handson|harvestcelebration|hawaii|health|heimatunduhren|hellas|helsinki|hembygdsforbund|heritage|histoire|historical|historicalsociety|historichouses|historisch|historisches|history|historyofscience|horology|house|humanities|illustration|imageandsound|indian|indiana|indianapolis|indianmarket|intelligence|interactive|iraq|iron|isleofman|jamison|jefferson|jerusalem|jewelry|jewish|jewishart|jfk|journalism|judaica|judygarland|juedisches|juif|karate|karikatur|kids|koebenhavn|koeln|kunst|kunstsammlung|kunstunddesign|labor|labour|lajolla|lancashire|landes|lans|xn--lns-qla|larsson|lewismiller|lincoln|linz|living|livinghistory|localhistory|london|losangeles|louvre|loyalist|lucerne|luxembourg|luzern|mad|madrid|mallorca|manchester|mansion|mansions|manx|marburg|maritime|maritimo|maryland|marylhurst|media|medical|medizinhistorisches|meeres|memorial|mesaverde|michigan|midatlantic|military|mill|miners|mining|minnesota|missile|missoula|modern|moma|money|monmouth|monticello|montreal|moscow|motorcycle|muenchen|muenster|mulhouse|muncie|museet|museumcenter|museumvereniging|music|national|nationalfirearms|nationalheritage|nativeamerican|naturalhistory|naturalhistorymuseum|naturalsciences|nature|naturhistorisches|natuurwetenschappen|naumburg|naval|nebraska|neues|newhampshire|newjersey|newmexico|newport|newspaper|newyork|niepce|norfolk|north|nrw|nuernberg|nuremberg|nyc|nyny|oceanographic|oceanographique|omaha|online|ontario|openair|oregon|oregontrail|otago|oxford|pacific|paderborn|palace|paleo|palmsprings|panama|paris|pasadena|pharmacy|philadelphia|philadelphiaarea|philately|phoenix|photography|pilots|pittsburgh|planetarium|plantation|plants|plaza|portal|portland|portlligat|posts-and-telecommunications|preservation|presidio|press|project|public|pubol|quebec|railroad|railway|research|resistance|riodejaneiro|rochester|rockart|roma|russia|saintlouis|salem|salvadordali|salzburg|sandiego|sanfrancisco|santabarbara|santacruz|santafe|saskatchewan|satx|savannahga|schlesisches|schoenbrunn|schokoladen|school|schweiz|science|scienceandhistory|scienceandindustry|sciencecenter|sciencecenters|science-fiction|sciencehistory|sciences|sciencesnaturelles|scotland|seaport|settlement|settlers|shell|sherbrooke|sibenik|silk|ski|skole|society|sologne|soundandvision|southcarolina|southwest|space|spy|square|stadt|stalbans|starnberg|state|stateofdelaware|station|steam|steiermark|stjohn|stockholm|stpetersburg|stuttgart|suisse|surgeonshall|surrey|svizzera|sweden|sydney|tank|tcm|technology|telekommunikation|television|texas|textile|theater|time|timekeeping|topology|torino|touch|town|transport|tree|trolley|trust|trustee|uhren|ulm|undersea|university|usa|usantiques|usarts|uscountryestate|usculture|usdecorativearts|usgarden|ushistory|ushuaia|uslivinghistory|utah|uvic|valley|vantaa|versailles|viking|village|virginia|virtual|virtuel|vlaanderen|volkenkunde|wales|wallonie|war|washingtondc|watchandclock|watch-and-clock|western|westfalen|whaling|wildlife|williamsburg|windmill|workshop|york|yorkshire|yosemite|youth|zoological|zoology|xn--9dbhblg6di|xn--h1aegh","mv":"aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|pro","mw":"ac|biz|co|com|coop|edu|gov|int|museum|net|org","mx":"com|org|gob|edu|net|blogspot","my":"com|net|org|gov|edu|mil|name|blogspot","mz":"*|!teledata","na":"info|pro|name|school|or|dr|us|mx|ca|in|cc|tv|ws|mobi|co|com|org","name":"forgot.her|forgot.his","nc":"asso","ne":"","net":"cloudfront|gb|hu|jp|se|uk|in|cdn77-ssl|r.cdn77|at-band-camp|blogdns|broke-it|buyshouses|dnsalias|dnsdojo|does-it|dontexist|dynalias|dynathome|endofinternet|from-az|from-co|from-la|from-ny|gets-it|ham-radio-op|homeftp|homeip|homelinux|homeunix|in-the-band|is-a-chef|is-a-geek|isa-geek|kicks-ass|office-on-the|podzone|scrapper-site|selfip|sells-it|servebbs|serveftp|thruhere|webhop|a.ssl.fastly|b.ssl.fastly|global.ssl.fastly|a.prod.fastly|global.prod.fastly|azurewebsites|azure-mobile|cloudapp|za","nf":"com|net|per|rec|web|arts|firm|info|other|store","ng":"com|edu|name|net|org|sch|gov|mil|mobi|blogspot.com","ni":"*","nl":"bv|co|blogspot","no":"fhs|vgs|fylkesbibl|folkebibl|museum|idrett|priv|mil|stat|dep|kommune|herad|aa|ah|bu|fm|hl|hm|jan-mayen|mr|nl|nt|of|ol|oslo|rl|sf|st|svalbard|tm|tr|va|vf|gs.aa|gs.ah|gs.bu|gs.fm|gs.hl|gs.hm|gs.jan-mayen|gs.mr|gs.nl|gs.nt|gs.of|gs.ol|gs.oslo|gs.rl|gs.sf|gs.st|gs.svalbard|gs.tm|gs.tr|gs.va|gs.vf|akrehamn|xn--krehamn-dxa|algard|xn--lgrd-poac|arna|brumunddal|bryne|bronnoysund|xn--brnnysund-m8ac|drobak|xn--drbak-wua|egersund|fetsund|floro|xn--flor-jra|fredrikstad|hokksund|honefoss|xn--hnefoss-q1a|jessheim|jorpeland|xn--jrpeland-54a|kirkenes|kopervik|krokstadelva|langevag|xn--langevg-jxa|leirvik|mjondalen|xn--mjndalen-64a|mo-i-rana|mosjoen|xn--mosjen-eya|nesoddtangen|orkanger|osoyro|xn--osyro-wua|raholt|xn--rholt-mra|sandnessjoen|xn--sandnessjen-ogb|skedsmokorset|slattum|spjelkavik|stathelle|stavern|stjordalshalsen|xn--stjrdalshalsen-sqb|tananger|tranby|vossevangen|afjord|xn--fjord-lra|agdenes|al|xn--l-1fa|alesund|xn--lesund-hua|alstahaug|alta|xn--lt-liac|alaheadju|xn--laheadju-7ya|alvdal|amli|xn--mli-tla|amot|xn--mot-tla|andebu|andoy|xn--andy-ira|andasuolo|ardal|xn--rdal-poa|aremark|arendal|xn--s-1fa|aseral|xn--seral-lra|asker|askim|askvoll|askoy|xn--asky-ira|asnes|xn--snes-poa|audnedaln|aukra|aure|aurland|aurskog-holand|xn--aurskog-hland-jnb|austevoll|austrheim|averoy|xn--avery-yua|balestrand|ballangen|balat|xn--blt-elab|balsfjord|bahccavuotna|xn--bhccavuotna-k7a|bamble|bardu|beardu|beiarn|bajddar|xn--bjddar-pta|baidar|xn--bidr-5nac|berg|bergen|berlevag|xn--berlevg-jxa|bearalvahki|xn--bearalvhki-y4a|bindal|birkenes|bjarkoy|xn--bjarky-fya|bjerkreim|bjugn|bodo|xn--bod-2na|badaddja|xn--bdddj-mrabd|budejju|bokn|bremanger|bronnoy|xn--brnny-wuac|bygland|bykle|barum|xn--brum-voa|bo.telemark|xn--b-5ga.telemark|bo.nordland|xn--b-5ga.nordland|bievat|xn--bievt-0qa|bomlo|xn--bmlo-gra|batsfjord|xn--btsfjord-9za|bahcavuotna|xn--bhcavuotna-s4a|dovre|drammen|drangedal|dyroy|xn--dyry-ira|donna|xn--dnna-gra|eid|eidfjord|eidsberg|eidskog|eidsvoll|eigersund|elverum|enebakk|engerdal|etne|etnedal|evenes|evenassi|xn--eveni-0qa01ga|evje-og-hornnes|farsund|fauske|fuossko|fuoisku|fedje|fet|finnoy|xn--finny-yua|fitjar|fjaler|fjell|flakstad|flatanger|flekkefjord|flesberg|flora|fla|xn--fl-zia|folldal|forsand|fosnes|frei|frogn|froland|frosta|frana|xn--frna-woa|froya|xn--frya-hra|fusa|fyresdal|forde|xn--frde-gra|gamvik|gangaviika|xn--ggaviika-8ya47h|gaular|gausdal|gildeskal|xn--gildeskl-g0a|giske|gjemnes|gjerdrum|gjerstad|gjesdal|gjovik|xn--gjvik-wua|gloppen|gol|gran|grane|granvin|gratangen|grimstad|grong|kraanghke|xn--kranghke-b0a|grue|gulen|hadsel|halden|halsa|hamar|hamaroy|habmer|xn--hbmer-xqa|hapmir|xn--hpmir-xqa|hammerfest|hammarfeasta|xn--hmmrfeasta-s4ac|haram|hareid|harstad|hasvik|aknoluokta|xn--koluokta-7ya57h|hattfjelldal|aarborte|haugesund|hemne|hemnes|hemsedal|heroy.more-og-romsdal|xn--hery-ira.xn--mre-og-romsdal-qqb|heroy.nordland|xn--hery-ira.nordland|hitra|hjartdal|hjelmeland|hobol|xn--hobl-ira|hof|hol|hole|holmestrand|holtalen|xn--holtlen-hxa|hornindal|horten|hurdal|hurum|hvaler|hyllestad|hagebostad|xn--hgebostad-g3a|hoyanger|xn--hyanger-q1a|hoylandet|xn--hylandet-54a|ha|xn--h-2fa|ibestad|inderoy|xn--indery-fya|iveland|jevnaker|jondal|jolster|xn--jlster-bya|karasjok|karasjohka|xn--krjohka-hwab49j|karlsoy|galsa|xn--gls-elac|karmoy|xn--karmy-yua|kautokeino|guovdageaidnu|klepp|klabu|xn--klbu-woa|kongsberg|kongsvinger|kragero|xn--krager-gya|kristiansand|kristiansund|krodsherad|xn--krdsherad-m8a|kvalsund|rahkkeravju|xn--rhkkervju-01af|kvam|kvinesdal|kvinnherad|kviteseid|kvitsoy|xn--kvitsy-fya|kvafjord|xn--kvfjord-nxa|giehtavuoatna|kvanangen|xn--kvnangen-k0a|navuotna|xn--nvuotna-hwa|kafjord|xn--kfjord-iua|gaivuotna|xn--givuotna-8ya|larvik|lavangen|lavagis|loabat|xn--loabt-0qa|lebesby|davvesiida|leikanger|leirfjord|leka|leksvik|lenvik|leangaviika|xn--leagaviika-52b|lesja|levanger|lier|lierne|lillehammer|lillesand|lindesnes|lindas|xn--linds-pra|lom|loppa|lahppi|xn--lhppi-xqa|lund|lunner|luroy|xn--lury-ira|luster|lyngdal|lyngen|ivgu|lardal|lerdal|xn--lrdal-sra|lodingen|xn--ldingen-q1a|lorenskog|xn--lrenskog-54a|loten|xn--lten-gra|malvik|masoy|xn--msy-ula0h|muosat|xn--muost-0qa|mandal|marker|marnardal|masfjorden|meland|meldal|melhus|meloy|xn--mely-ira|meraker|xn--merker-kua|moareke|xn--moreke-jua|midsund|midtre-gauldal|modalen|modum|molde|moskenes|moss|mosvik|malselv|xn--mlselv-iua|malatvuopmi|xn--mlatvuopmi-s4a|namdalseid|aejrie|namsos|namsskogan|naamesjevuemie|xn--nmesjevuemie-tcba|laakesvuemie|nannestad|narvik|narviika|naustdal|nedre-eiker|nes.akershus|nes.buskerud|nesna|nesodden|nesseby|unjarga|xn--unjrga-rta|nesset|nissedal|nittedal|nord-aurdal|nord-fron|nord-odal|norddal|nordkapp|davvenjarga|xn--davvenjrga-y4a|nordre-land|nordreisa|raisa|xn--risa-5na|nore-og-uvdal|notodden|naroy|xn--nry-yla5g|notteroy|xn--nttery-byae|odda|oksnes|xn--ksnes-uua|oppdal|oppegard|xn--oppegrd-ixa|orkdal|orland|xn--rland-uua|orskog|xn--rskog-uua|orsta|xn--rsta-fra|os.hedmark|os.hordaland|osen|osteroy|xn--ostery-fya|ostre-toten|xn--stre-toten-zcb|overhalla|ovre-eiker|xn--vre-eiker-k8a|oyer|xn--yer-zna|oygarden|xn--ygarden-p1a|oystre-slidre|xn--ystre-slidre-ujb|porsanger|porsangu|xn--porsgu-sta26f|porsgrunn|radoy|xn--rady-ira|rakkestad|rana|ruovat|randaberg|rauma|rendalen|rennebu|rennesoy|xn--rennesy-v1a|rindal|ringebu|ringerike|ringsaker|rissa|risor|xn--risr-ira|roan|rollag|rygge|ralingen|xn--rlingen-mxa|rodoy|xn--rdy-0nab|romskog|xn--rmskog-bya|roros|xn--rros-gra|rost|xn--rst-0na|royken|xn--ryken-vua|royrvik|xn--ryrvik-bya|rade|xn--rde-ula|salangen|siellak|saltdal|salat|xn--slt-elab|xn--slat-5na|samnanger|sande.more-og-romsdal|sande.xn--mre-og-romsdal-qqb|sande.vestfold|sandefjord|sandnes|sandoy|xn--sandy-yua|sarpsborg|sauda|sauherad|sel|selbu|selje|seljord|sigdal|siljan|sirdal|skaun|skedsmo|ski|skien|skiptvet|skjervoy|xn--skjervy-v1a|skierva|xn--skierv-uta|skjak|xn--skjk-soa|skodje|skanland|xn--sknland-fxa|skanit|xn--sknit-yqa|smola|xn--smla-hra|snillfjord|snasa|xn--snsa-roa|snoasa|snaase|xn--snase-nra|sogndal|sokndal|sola|solund|songdalen|sortland|spydeberg|stange|stavanger|steigen|steinkjer|stjordal|xn--stjrdal-s1a|stokke|stor-elvdal|stord|stordal|storfjord|omasvuotna|strand|stranda|stryn|sula|suldal|sund|sunndal|surnadal|sveio|svelvik|sykkylven|sogne|xn--sgne-gra|somna|xn--smna-gra|sondre-land|xn--sndre-land-0cb|sor-aurdal|xn--sr-aurdal-l8a|sor-fron|xn--sr-fron-q1a|sor-odal|xn--sr-odal-q1a|sor-varanger|xn--sr-varanger-ggb|matta-varjjat|xn--mtta-vrjjat-k7af|sorfold|xn--srfold-bya|sorreisa|xn--srreisa-q1a|sorum|xn--srum-gra|tana|deatnu|time|tingvoll|tinn|tjeldsund|dielddanuorri|tjome|xn--tjme-hra|tokke|tolga|torsken|tranoy|xn--trany-yua|tromso|xn--troms-zua|tromsa|romsa|trondheim|troandin|trysil|trana|xn--trna-woa|trogstad|xn--trgstad-r1a|tvedestrand|tydal|tynset|tysfjord|divtasvuodna|divttasvuotna|tysnes|tysvar|xn--tysvr-vra|tonsberg|xn--tnsberg-q1a|ullensaker|ullensvang|ulvik|utsira|vadso|xn--vads-jra|cahcesuolo|xn--hcesuolo-7ya35b|vaksdal|valle|vang|vanylven|vardo|xn--vard-jra|varggat|xn--vrggt-xqad|vefsn|vaapste|vega|vegarshei|xn--vegrshei-c0a|vennesla|verdal|verran|vestby|vestnes|vestre-slidre|vestre-toten|vestvagoy|xn--vestvgy-ixa6o|vevelstad|vik|vikna|vindafjord|volda|voss|varoy|xn--vry-yla5g|vagan|xn--vgan-qoa|voagat|vagsoy|xn--vgsy-qoa0j|vaga|xn--vg-yiab|valer.ostfold|xn--vler-qoa.xn--stfold-9xa|valer.hedmark|xn--vler-qoa.hedmark|co|blogspot","np":"*","nr":"biz|info|gov|edu|org|net|com","nu":"merseine|mine|shacknet","nz":"ac|co|cri|geek|gen|govt|health|iwi|kiwi|maori|mil|xn--mori-qsa|net|org|parliament|school|blogspot.co","om":"co|com|edu|gov|med|museum|net|org|pro","org":"ae|us|c.cdn77|rsc.cdn77|ssl.origin.cdn77-secure|duckdns|dyndns|blogdns|blogsite|boldlygoingnowhere|dnsalias|dnsdojo|doesntexist|dontexist|doomdns|dvrdns|dynalias|endofinternet|endoftheinternet|from-me|game-host|go.dyndns|gotdns|hobby-site|home.dyndns|homedns|homeftp|homelinux|homeunix|is-a-bruinsfan|is-a-candidate|is-a-celticsfan|is-a-chef|is-a-geek|is-a-knight|is-a-linux-user|is-a-patsfan|is-a-soxfan|is-found|is-lost|is-saved|is-very-bad|is-very-evil|is-very-good|is-very-nice|is-very-sweet|isa-geek|kicks-ass|misconfused|podzone|readmyblog|selfip|sellsyourhome|servebbs|serveftp|servegame|stuff-4-sale|webhop|eu|al.eu|asso.eu|at.eu|au.eu|be.eu|bg.eu|ca.eu|cd.eu|ch.eu|cn.eu|cy.eu|cz.eu|de.eu|dk.eu|edu.eu|ee.eu|es.eu|fi.eu|fr.eu|gr.eu|hr.eu|hu.eu|ie.eu|il.eu|in.eu|int.eu|is.eu|it.eu|jp.eu|kr.eu|lt.eu|lu.eu|lv.eu|mc.eu|me.eu|mk.eu|mt.eu|my.eu|net.eu|ng.eu|nl.eu|no.eu|nz.eu|paris.eu|pl.eu|pt.eu|q-a.eu|ro.eu|ru.eu|se.eu|si.eu|sk.eu|tr.eu|uk.eu|us.eu|bmoattachments|hk|za","pa":"ac|gob|com|org|sld|edu|net|ing|abo|med|nom","pe":"edu|gob|nom|mil|org|com|net|blogspot","pf":"com|org|edu","pg":"*","ph":"com|net|org|gov|edu|ngo|mil|i","pk":"com|net|edu|org|fam|biz|web|gov|gob|gok|gon|gop|gos|info","pl":"com|net|org|aid|agro|atm|auto|biz|edu|gmina|gsm|info|mail|miasta|media|mil|nieruchomosci|nom|pc|powiat|priv|realestate|rel|sex|shop|sklep|sos|szkola|targi|tm|tourism|travel|turystyka|gov|ap.gov|ic.gov|is.gov|us.gov|kmpsp.gov|kppsp.gov|kwpsp.gov|psp.gov|wskr.gov|kwp.gov|mw.gov|ug.gov|um.gov|umig.gov|ugim.gov|upow.gov|uw.gov|starostwo.gov|pa.gov|po.gov|psse.gov|pup.gov|rzgw.gov|sa.gov|so.gov|sr.gov|wsa.gov|sko.gov|uzs.gov|wiih.gov|winb.gov|pinb.gov|wios.gov|witd.gov|wzmiuw.gov|piw.gov|wiw.gov|griw.gov|wif.gov|oum.gov|sdn.gov|zp.gov|uppo.gov|mup.gov|wuoz.gov|konsulat.gov|oirm.gov|augustow|babia-gora|bedzin|beskidy|bialowieza|bialystok|bielawa|bieszczady|boleslawiec|bydgoszcz|bytom|cieszyn|czeladz|czest|dlugoleka|elblag|elk|glogow|gniezno|gorlice|grajewo|ilawa|jaworzno|jelenia-gora|jgora|kalisz|kazimierz-dolny|karpacz|kartuzy|kaszuby|katowice|kepno|ketrzyn|klodzko|kobierzyce|kolobrzeg|konin|konskowola|kutno|lapy|lebork|legnica|lezajsk|limanowa|lomza|lowicz|lubin|lukow|malbork|malopolska|mazowsze|mazury|mielec|mielno|mragowo|naklo|nowaruda|nysa|olawa|olecko|olkusz|olsztyn|opoczno|opole|ostroda|ostroleka|ostrowiec|ostrowwlkp|pila|pisz|podhale|podlasie|polkowice|pomorze|pomorskie|prochowice|pruszkow|przeworsk|pulawy|radom|rawa-maz|rybnik|rzeszow|sanok|sejny|slask|slupsk|sosnowiec|stalowa-wola|skoczow|starachowice|stargard|suwalki|swidnica|swiebodzin|swinoujscie|szczecin|szczytno|tarnobrzeg|tgory|turek|tychy|ustka|walbrzych|warmia|warszawa|waw|wegrow|wielun|wlocl|wloclawek|wodzislaw|wolomin|wroclaw|zachpomor|zagan|zarow|zgora|zgorzelec|co|art|gliwice|krakow|poznan|wroc|zakopane|gda|gdansk|gdynia|med|sopot","pm":"","pn":"gov|co|org|edu|net","post":"","pr":"com|net|org|gov|edu|isla|pro|biz|info|name|est|prof|ac","pro":"aca|bar|cpa|jur|law|med|eng","ps":"edu|gov|sec|plo|com|org|net","pt":"net|gov|org|edu|int|publ|com|nome|blogspot","pw":"co|ne|or|ed|go|belau","py":"com|coop|edu|gov|mil|net|org","qa":"com|edu|gov|mil|name|net|org|sch|blogspot","re":"com|asso|nom|blogspot","ro":"com|org|tm|nt|nom|info|rec|arts|firm|store|www|blogspot","rs":"co|org|edu|ac|gov|in|blogspot","ru":"ac|com|edu|int|net|org|pp|adygeya|altai|amur|arkhangelsk|astrakhan|bashkiria|belgorod|bir|bryansk|buryatia|cbg|chel|chelyabinsk|chita|chukotka|chuvashia|dagestan|dudinka|e-burg|grozny|irkutsk|ivanovo|izhevsk|jar|joshkar-ola|kalmykia|kaluga|kamchatka|karelia|kazan|kchr|kemerovo|khabarovsk|khakassia|khv|kirov|koenig|komi|kostroma|krasnoyarsk|kuban|kurgan|kursk|lipetsk|magadan|mari|mari-el|marine|mordovia|msk|murmansk|nalchik|nnov|nov|novosibirsk|nsk|omsk|orenburg|oryol|palana|penza|perm|ptz|rnd|ryazan|sakhalin|samara|saratov|simbirsk|smolensk|spb|stavropol|stv|surgut|tambov|tatarstan|tom|tomsk|tsaritsyn|tsk|tula|tuva|tver|tyumen|udm|udmurtia|ulan-ude|vladikavkaz|vladimir|vladivostok|volgograd|vologda|voronezh|vrn|vyatka|yakutia|yamal|yaroslavl|yekaterinburg|yuzhno-sakhalinsk|amursk|baikal|cmw|fareast|jamal|kms|k-uralsk|kustanai|kuzbass|magnitka|mytis|nakhodka|nkz|norilsk|oskol|pyatigorsk|rubtsovsk|snz|syzran|vdonsk|zgrad|gov|mil|test|blogspot","rw":"gov|net|edu|ac|com|co|int|mil|gouv","sa":"com|net|org|gov|med|pub|edu|sch","sb":"com|edu|gov|net|org","sc":"com|gov|net|org|edu","sd":"com|net|org|edu|med|tv|gov|info","se":"a|ac|b|bd|brand|c|d|e|f|fh|fhsk|fhv|g|h|i|k|komforb|kommunalforbund|komvux|l|lanbib|m|n|naturbruksgymn|o|org|p|parti|pp|press|r|s|t|tm|u|w|x|y|z|com|blogspot","sg":"com|net|org|gov|edu|per|blogspot","sh":"com|net|gov|org|mil|*platform","si":"blogspot","sj":"","sk":"blogspot","sl":"com|net|edu|gov|org","sm":"","sn":"art|com|edu|gouv|org|perso|univ|blogspot","so":"com|net|org","sr":"","st":"co|com|consulado|edu|embaixada|gov|mil|net|org|principe|saotome|store","su":"adygeya|arkhangelsk|balashov|bashkiria|bryansk|dagestan|grozny|ivanovo|kalmykia|kaluga|karelia|khakassia|krasnodar|kurgan|lenug|mordovia|msk|murmansk|nalchik|nov|obninsk|penza|pokrovsk|sochi|spb|togliatti|troitsk|tula|tuva|vladikavkaz|vladimir|vologda","sv":"com|edu|gob|org|red","sx":"gov","sy":"edu|gov|net|mil|com|org","sz":"co|ac|org","tc":"","td":"blogspot","tel":"","tf":"","tg":"","th":"ac|co|go|in|mi|net|or","tj":"ac|biz|co|com|edu|go|gov|int|mil|name|net|nic|org|test|web","tk":"","tl":"gov","tm":"com|co|org|net|nom|gov|mil|edu","tn":"com|ens|fin|gov|ind|intl|nat|net|org|info|perso|tourism|edunet|rnrt|rns|rnu|mincom|agrinet|defense|turen","to":"com|gov|net|org|edu|mil","tp":"","tr":"com|info|biz|net|org|web|gen|tv|av|dr|bbs|name|tel|gov|bel|pol|mil|k12|edu|kep|nc|gov.nc|blogspot.com","travel":"","tt":"co|com|org|net|biz|info|pro|int|coop|jobs|mobi|travel|museum|aero|name|gov|edu","tv":"dyndns|better-than|on-the-web|worse-than","tw":"edu|gov|mil|com|net|org|idv|game|ebiz|club|xn--zf0ao64a|xn--uc0atv|xn--czrw28b|blogspot","tz":"ac|co|go|hotel|info|me|mil|mobi|ne|or|sc|tv","ua":"com|edu|gov|in|net|org|cherkassy|cherkasy|chernigov|chernihiv|chernivtsi|chernovtsy|ck|cn|cr|crimea|cv|dn|dnepropetrovsk|dnipropetrovsk|dominic|donetsk|dp|if|ivano-frankivsk|kh|kharkiv|kharkov|kherson|khmelnitskiy|khmelnytskyi|kiev|kirovograd|km|kr|krym|ks|kv|kyiv|lg|lt|lugansk|lutsk|lv|lviv|mk|mykolaiv|nikolaev|od|odesa|odessa|pl|poltava|rivne|rovno|rv|sb|sebastopol|sevastopol|sm|sumy|te|ternopil|uz|uzhgorod|vinnica|vinnytsia|vn|volyn|yalta|zaporizhzhe|zaporizhzhia|zhitomir|zhytomyr|zp|zt|biz|co|pp","ug":"co|or|ac|sc|go|ne|com|org|blogspot","uk":"ac|co|gov|ltd|me|net|nhs|org|plc|police|*sch|service.gov|blogspot.co","us":"dni|fed|isa|kids|nsn|ak|al|ar|as|az|ca|co|ct|dc|de|fl|ga|gu|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|pr|ri|sc|sd|tn|tx|ut|vi|vt|va|wa|wi|wv|wy|k12.ak|k12.al|k12.ar|k12.as|k12.az|k12.ca|k12.co|k12.ct|k12.dc|k12.de|k12.fl|k12.ga|k12.gu|k12.ia|k12.id|k12.il|k12.in|k12.ks|k12.ky|k12.la|k12.ma|k12.md|k12.me|k12.mi|k12.mn|k12.mo|k12.ms|k12.mt|k12.nc|k12.ne|k12.nh|k12.nj|k12.nm|k12.nv|k12.ny|k12.oh|k12.ok|k12.or|k12.pa|k12.pr|k12.ri|k12.sc|k12.tn|k12.tx|k12.ut|k12.vi|k12.vt|k12.va|k12.wa|k12.wi|k12.wy|cc.ak|cc.al|cc.ar|cc.as|cc.az|cc.ca|cc.co|cc.ct|cc.dc|cc.de|cc.fl|cc.ga|cc.gu|cc.hi|cc.ia|cc.id|cc.il|cc.in|cc.ks|cc.ky|cc.la|cc.ma|cc.md|cc.me|cc.mi|cc.mn|cc.mo|cc.ms|cc.mt|cc.nc|cc.nd|cc.ne|cc.nh|cc.nj|cc.nm|cc.nv|cc.ny|cc.oh|cc.ok|cc.or|cc.pa|cc.pr|cc.ri|cc.sc|cc.sd|cc.tn|cc.tx|cc.ut|cc.vi|cc.vt|cc.va|cc.wa|cc.wi|cc.wv|cc.wy|lib.ak|lib.al|lib.ar|lib.as|lib.az|lib.ca|lib.co|lib.ct|lib.dc|lib.de|lib.fl|lib.ga|lib.gu|lib.hi|lib.ia|lib.id|lib.il|lib.in|lib.ks|lib.ky|lib.la|lib.ma|lib.md|lib.me|lib.mi|lib.mn|lib.mo|lib.ms|lib.mt|lib.nc|lib.nd|lib.ne|lib.nh|lib.nj|lib.nm|lib.nv|lib.ny|lib.oh|lib.ok|lib.or|lib.pa|lib.pr|lib.ri|lib.sc|lib.sd|lib.tn|lib.tx|lib.ut|lib.vi|lib.vt|lib.va|lib.wa|lib.wi|lib.wy|pvt.k12.ma|chtr.k12.ma|paroch.k12.ma|is-by|land-4-sale|stuff-4-sale","uy":"com|edu|gub|mil|net|org|blogspot.com","uz":"co|com|net|org","va":"","vc":"com|net|org|gov|mil|edu","ve":"arts|co|com|e12|edu|firm|gob|gov|info|int|mil|net|org|rec|store|tec|web","vg":"","vi":"co|com|k12|net|org","vn":"com|net|org|edu|gov|int|ac|biz|info|name|pro|health|blogspot","vu":"com|edu|net|org","wf":"","ws":"com|net|org|gov|edu|dyndns|mypets","yt":"","xn--mgbaam7a8h":"","xn--y9a3aq":"","xn--54b7fta0cc":"","xn--90ais":"","xn--fiqs8s":"","xn--fiqz9s":"","xn--lgbbat1ad8j":"","xn--wgbh1c":"","xn--node":"","xn--qxam":"","xn--j6w193g":"","xn--h2brj9c":"","xn--mgbbh1a71e":"","xn--fpcrj9c3d":"","xn--gecrj9c":"","xn--s9brj9c":"","xn--45brj9c":"","xn--xkc2dl3a5ee0h":"","xn--mgba3a4f16a":"","xn--mgba3a4fra":"","xn--mgbtx2b":"","xn--mgbayh7gpa":"","xn--3e0b707e":"","xn--80ao21a":"","xn--fzc2c9e2c":"","xn--xkc2al3hye2a":"","xn--mgbc0a9azcg":"","xn--d1alf":"","xn--l1acc":"","xn--mix891f":"","xn--mix082f":"","xn--mgbx4cd0ab":"","xn--mgb9awbf":"","xn--mgbai9azgqp6j":"","xn--mgbai9a5eva00b":"","xn--ygbi2ammx":"","xn--90a3ac":"xn--o1ac|xn--c1avg|xn--90azh|xn--d1at|xn--o1ach|xn--80au","xn--p1ai":"","xn--wgbl6a":"","xn--mgberp4a5d4ar":"","xn--mgberp4a5d4a87g":"","xn--mgbqly7c0a67fbc":"","xn--mgbqly7cvafr":"","xn--mgbpl2fh":"","xn--yfro4i67o":"","xn--clchc0ea0b2g2a9gcd":"","xn--ogbpf8fl":"","xn--mgbtf8fl":"","xn--o3cw4h":"","xn--pgbs0dh":"","xn--kpry57d":"","xn--kprw13d":"","xn--nnx388a":"","xn--j1amh":"","xn--mgb2ddes":"","xxx":"","ye":"*","za":"ac|agrica|alt|co|edu|gov|grondar|law|mil|net|ngo|nis|nom|org|school|tm|web|blogspot.co","zm":"*","zw":"*","aaa":"","aarp":"","abarth":"","abb":"","abbott":"","abbvie":"","abc":"","able":"","abogado":"","abudhabi":"","academy":"","accenture":"","accountant":"","accountants":"","aco":"","active":"","actor":"","adac":"","ads":"","adult":"","aeg":"","aetna":"","afamilycompany":"","afl":"","africa":"","africamagic":"","agakhan":"","agency":"","aig":"","aigo":"","airbus":"","airforce":"","airtel":"","akdn":"","alfaromeo":"","alibaba":"","alipay":"","allfinanz":"","allstate":"","ally":"","alsace":"","alstom":"","americanexpress":"","americanfamily":"","amex":"","amfam":"","amica":"","amsterdam":"","analytics":"","android":"","anquan":"","anz":"","aol":"","apartments":"","app":"","apple":"","aquarelle":"","aramco":"","archi":"","army":"","arte":"","asda":"","associates":"","athleta":"","attorney":"","auction":"","audi":"","audible":"","audio":"","auspost":"","author":"","auto":"","autos":"","avianca":"","aws":"","axa":"","azure":"","baby":"","baidu":"","banamex":"","bananarepublic":"","band":"","bank":"","bar":"","barcelona":"","barclaycard":"","barclays":"","barefoot":"","bargains":"","baseball":"","basketball":"","bauhaus":"","bayern":"","bbc":"","bbt":"","bbva":"","bcg":"","bcn":"","beats":"","beer":"","bentley":"","berlin":"","best":"","bestbuy":"","bet":"","bharti":"","bible":"","bid":"","bike":"","bing":"","bingo":"","bio":"","black":"","blackfriday":"","blanco":"","blockbuster":"","blog":"","bloomberg":"","blue":"","bms":"","bmw":"","bnl":"","bnpparibas":"","boats":"","boehringer":"","bofa":"","bom":"","bond":"","boo":"","book":"","booking":"","boots":"","bosch":"","bostik":"","bot":"","boutique":"","bradesco":"","bridgestone":"","broadway":"","broker":"","brother":"","brussels":"","budapest":"","bugatti":"","build":"","builders":"","business":"","buy":"","buzz":"","bzh":"","cab":"","cafe":"","cal":"","call":"","calvinklein":"","camera":"","camp":"","cancerresearch":"","canon":"","capetown":"","capital":"","capitalone":"","car":"","caravan":"","cards":"","care":"","career":"","careers":"","cars":"","cartier":"","casa":"","case":"","caseih":"","cash":"","casino":"","catering":"","catholic":"","cba":"","cbn":"","cbre":"","cbs":"","ceb":"","center":"","ceo":"","cern":"","cfa":"","cfd":"","chanel":"","channel":"","chase":"","chat":"","cheap":"","chintai":"","chloe":"","christmas":"","chrome":"","chrysler":"","church":"","cipriani":"","circle":"","cisco":"","citadel":"","citi":"","citic":"","city":"","cityeats":"","claims":"","cleaning":"","click":"","clinic":"","clinique":"","clothing":"","cloud":"","club":"","clubmed":"","coach":"","codes":"","coffee":"","college":"","cologne":"","comcast":"","commbank":"","community":"","company":"","compare":"","computer":"","comsec":"","condos":"","construction":"","consulting":"","contact":"","contractors":"","cooking":"","cookingchannel":"","cool":"","corsica":"","country":"","coupon":"","coupons":"","courses":"","credit":"","creditcard":"","creditunion":"","cricket":"","crown":"","crs":"","cruises":"","csc":"","cuisinella":"","cymru":"","cyou":"","dabur":"","dad":"","dance":"","date":"","dating":"","datsun":"","day":"","dclk":"","dds":"","deal":"","dealer":"","deals":"","degree":"","delivery":"","dell":"","deloitte":"","delta":"","democrat":"","dental":"","dentist":"","desi":"","design":"","dev":"","dhl":"","diamonds":"","diet":"","digital":"","direct":"","directory":"","discount":"","discover":"","dish":"","diy":"","dnp":"","docs":"","dodge":"","dog":"","doha":"","domains":"","doosan":"","dot":"","download":"","drive":"","dstv":"","dtv":"","dubai":"","duck":"","dunlop":"","duns":"","dupont":"","durban":"","dvag":"","dwg":"","earth":"","eat":"","edeka":"","education":"","email":"","emerck":"","emerson":"","energy":"","engineer":"","engineering":"","enterprises":"","epost":"","epson":"","equipment":"","ericsson":"","erni":"","esq":"","estate":"","esurance":"","etisalat":"","eurovision":"","eus":"","events":"","everbank":"","exchange":"","expert":"","exposed":"","express":"","extraspace":"","fage":"","fail":"","fairwinds":"","faith":"","family":"","fan":"","fans":"","farm":"","farmers":"","fashion":"","fast":"","fedex":"","feedback":"","ferrari":"","ferrero":"","fiat":"","fidelity":"","fido":"","film":"","final":"","finance":"","financial":"","fire":"","firestone":"","firmdale":"","fish":"","fishing":"","fit":"","fitness":"","flickr":"","flights":"","flir":"","florist":"","flowers":"","flsmidth":"","fly":"","foo":"","foodnetwork":"","football":"","ford":"","forex":"","forsale":"","forum":"","foundation":"","fox":"","fresenius":"","frl":"","frogans":"","frontdoor":"","frontier":"","ftr":"","fujitsu":"","fujixerox":"","fund":"","furniture":"","futbol":"","fyi":"","gal":"","gallery":"","gallo":"","gallup":"","game":"","games":"","gap":"","garden":"","gbiz":"","gdn":"","gea":"","gent":"","genting":"","george":"","ggee":"","gift":"","gifts":"","gives":"","giving":"","glade":"","glass":"","gle":"","global":"","globo":"","gmail":"","gmo":"","gmx":"","godaddy":"","gold":"","goldpoint":"","golf":"","goo":"","goodhands":"","goodyear":"","goog":"","google":"","gop":"","got":"","gotv":"","grainger":"","graphics":"","gratis":"","green":"","gripe":"","group":"","guardian":"","gucci":"","guge":"","guide":"","guitars":"","guru":"","hamburg":"","hangout":"","haus":"","hbo":"","hdfc":"","hdfcbank":"","health":"","healthcare":"","help":"","helsinki":"","here":"","hermes":"","hgtv":"","hiphop":"","hisamitsu":"","hitachi":"","hiv":"","hkt":"","hockey":"","holdings":"","holiday":"","homedepot":"","homegoods":"","homes":"","homesense":"","honda":"","honeywell":"","horse":"","host":"","hosting":"","hot":"","hoteles":"","hotmail":"","house":"","how":"","hsbc":"","htc":"","hughes":"","hyatt":"","hyundai":"","ibm":"","icbc":"","ice":"","icu":"","ieee":"","ifm":"","iinet":"","ikano":"","imamat":"","imdb":"","immo":"","immobilien":"","industries":"","infiniti":"","ing":"","ink":"","institute":"","insurance":"","insure":"","intel":"","international":"","intuit":"","investments":"","ipiranga":"","irish":"","iselect":"","ismaili":"","ist":"","istanbul":"","itau":"","itv":"","iveco":"","iwc":"","jaguar":"","java":"","jcb":"","jcp":"","jeep":"","jetzt":"","jewelry":"","jio":"","jlc":"","jll":"","jmp":"","jnj":"","joburg":"","jot":"","joy":"","jpmorgan":"","jprs":"","juegos":"","juniper":"","kaufen":"","kddi":"","kerryhotels":"","kerrylogistics":"","kerryproperties":"","kfh":"","kia":"","kim":"","kinder":"","kindle":"","kitchen":"","kiwi":"","koeln":"","komatsu":"","kosher":"","kpmg":"","kpn":"","krd":"","kred":"","kuokgroup":"","kyknet":"","kyoto":"","lacaixa":"","ladbrokes":"","lamborghini":"","lamer":"","lancaster":"","lancia":"","lancome":"","land":"","landrover":"","lanxess":"","lasalle":"","lat":"","latino":"","latrobe":"","law":"","lawyer":"","lds":"","lease":"","leclerc":"","lefrak":"","legal":"","lego":"","lexus":"","lgbt":"","liaison":"","lidl":"","life":"","lifeinsurance":"","lifestyle":"","lighting":"","like":"","lilly":"","limited":"","limo":"","lincoln":"","linde":"","link":"","lipsy":"","live":"","living":"","lixil":"","loan":"","loans":"","locker":"","locus":"","loft":"","lol":"","london":"","lotte":"","lotto":"","love":"","lpl":"","lplfinancial":"","ltd":"","ltda":"","lundbeck":"","lupin":"","luxe":"","luxury":"","macys":"","madrid":"","maif":"","maison":"","makeup":"","man":"","management":"","mango":"","market":"","marketing":"","markets":"","marriott":"","marshalls":"","maserati":"","mattel":"","mba":"","mcd":"","mcdonalds":"","mckinsey":"","med":"","media":"","meet":"","melbourne":"","meme":"","memorial":"","men":"","menu":"","meo":"","metlife":"","miami":"","microsoft":"","mini":"","mint":"","mit":"","mitsubishi":"","mlb":"","mls":"","mma":"","mnet":"","mobily":"","moda":"","moe":"","moi":"","mom":"","monash":"","money":"","monster":"","montblanc":"","mopar":"","mormon":"","mortgage":"","moscow":"","moto":"","motorcycles":"","mov":"","movie":"","movistar":"","msd":"","mtn":"","mtpc":"","mtr":"","multichoice":"","mutual":"","mutuelle":"","mzansimagic":"","nab":"","nadex":"","nagoya":"","naspers":"","nationwide":"","natura":"","navy":"","nba":"","nec":"","netbank":"","netflix":"","network":"","neustar":"","new":"","newholland":"","news":"","next":"","nextdirect":"","nexus":"","nfl":"","ngo":"","nhk":"","nico":"","nike":"","nikon":"","ninja":"","nissan":"","nissay":"","nokia":"","northwesternmutual":"","norton":"","now":"","nowruz":"","nowtv":"","nra":"","nrw":"","ntt":"","nyc":"","obi":"","observer":"","off":"","office":"","okinawa":"","olayan":"","olayangroup":"","oldnavy":"","ollo":"","omega":"","one":"","ong":"","onl":"","online":"","onyourside":"","ooo":"","open":"","oracle":"","orange":"","organic":"","orientexpress":"","origins":"","osaka":"","otsuka":"","ott":"","ovh":"","page":"","pamperedchef":"","panasonic":"","panerai":"","paris":"","pars":"","partners":"","parts":"","party":"","passagens":"","pay":"","payu":"","pccw":"","pet":"","pfizer":"","pharmacy":"","philips":"","photo":"","photography":"","photos":"","physio":"","piaget":"","pics":"","pictet":"","pictures":"","pid":"","pin":"","ping":"","pink":"","pioneer":"","pizza":"","place":"","play":"","playstation":"","plumbing":"","plus":"","pnc":"","pohl":"","poker":"","politie":"","porn":"","pramerica":"","praxi":"","press":"","prime":"","prod":"","productions":"","prof":"","progressive":"","promo":"","properties":"","property":"","protection":"","pru":"","prudential":"","pub":"","pwc":"","qpon":"","quebec":"","quest":"","qvc":"","racing":"","raid":"","read":"","realestate":"","realtor":"","realty":"","recipes":"","red":"","redstone":"","redumbrella":"","rehab":"","reise":"","reisen":"","reit":"","reliance":"","ren":"","rent":"","rentals":"","repair":"","report":"","republican":"","rest":"","restaurant":"","review":"","reviews":"","rexroth":"","rich":"","richardli":"","ricoh":"","rightathome":"","ril":"","rio":"","rip":"","rocher":"","rocks":"","rodeo":"","rogers":"","room":"","rsvp":"","ruhr":"","run":"","rwe":"","ryukyu":"","saarland":"","safe":"","safety":"","sakura":"","sale":"","salon":"","samsclub":"","samsung":"","sandvik":"","sandvikcoromant":"","sanofi":"","sap":"","sapo":"","sarl":"","sas":"","save":"","saxo":"","sbi":"","sbs":"","sca":"","scb":"","schaeffler":"","schmidt":"","scholarships":"","school":"","schule":"","schwarz":"","science":"","scjohnson":"","scor":"","scot":"","seat":"","secure":"","security":"","seek":"","select":"","sener":"","services":"","ses":"","seven":"","sew":"","sex":"","sexy":"","sfr":"","shangrila":"","sharp":"","shaw":"","shell":"","shia":"","shiksha":"","shoes":"","shouji":"","show":"","showtime":"","shriram":"","silk":"","sina":"","singles":"","site":"","ski":"","skin":"","sky":"","skype":"","sling":"","smart":"","smile":"","sncf":"","soccer":"","social":"","softbank":"","software":"","sohu":"","solar":"","solutions":"","song":"","sony":"","soy":"","space":"","spiegel":"","spot":"","spreadbetting":"","srl":"","srt":"","stada":"","staples":"","star":"","starhub":"","statebank":"","statefarm":"","statoil":"","stc":"","stcgroup":"","stockholm":"","storage":"","store":"","studio":"","study":"","style":"","sucks":"","supersport":"","supplies":"","supply":"","support":"","surf":"","surgery":"","suzuki":"","swatch":"","swiftcover":"","swiss":"","sydney":"","symantec":"","systems":"","tab":"","taipei":"","talk":"","taobao":"","target":"","tatamotors":"","tatar":"","tattoo":"","tax":"","taxi":"","tci":"","tdk":"","team":"","tech":"","technology":"","telecity":"","telefonica":"","temasek":"","tennis":"","teva":"","thd":"","theater":"","theatre":"","theguardian":"","tiaa":"","tickets":"","tienda":"","tiffany":"","tips":"","tires":"","tirol":"","tjmaxx":"","tjx":"","tkmaxx":"","tmall":"","today":"","tokyo":"","tools":"","top":"","toray":"","toshiba":"","total":"","tours":"","town":"","toyota":"","toys":"","trade":"","trading":"","training":"","travelchannel":"","travelers":"","travelersinsurance":"","trust":"","trv":"","tube":"","tui":"","tunes":"","tushu":"","tvs":"","ubank":"","ubs":"","uconnect":"","unicom":"","university":"","uno":"","uol":"","ups":"","vacations":"","vana":"","vanguard":"","vegas":"","ventures":"","verisign":"","versicherung":"","vet":"","viajes":"","video":"","vig":"","viking":"","villas":"","vin":"","vip":"","virgin":"","visa":"","vision":"","vista":"","vistaprint":"","viva":"","vivo":"","vlaanderen":"","vodka":"","volkswagen":"","vote":"","voting":"","voto":"","voyage":"","vuelos":"","wales":"","walmart":"","walter":"","wang":"","wanggou":"","warman":"","watch":"","watches":"","weather":"","weatherchannel":"","webcam":"","weber":"","website":"","wed":"","wedding":"","weibo":"","weir":"","whoswho":"","wien":"","wiki":"","williamhill":"","win":"","windows":"","wine":"","winners":"","wme":"","wolterskluwer":"","woodside":"","work":"","works":"","world":"","wow":"","wtc":"","wtf":"","xbox":"","xerox":"","xfinity":"","xihuan":"","xin":"","xn--11b4c3d":"","xn--1ck2e1b":"","xn--1qqw23a":"","xn--30rr7y":"","xn--3bst00m":"","xn--3ds443g":"","xn--3oq18vl8pn36a":"","xn--3pxu8k":"","xn--42c2d9a":"","xn--45q11c":"","xn--4gbrim":"","xn--4gq48lf9j":"","xn--55qw42g":"","xn--55qx5d":"","xn--5su34j936bgsg":"","xn--5tzm5g":"","xn--6frz82g":"","xn--6qq986b3xl":"","xn--80adxhks":"","xn--80aqecdr1a":"","xn--80asehdb":"","xn--80aswg":"","xn--8y0a063a":"","xn--9dbq2a":"","xn--9et52u":"","xn--9krt00a":"","xn--b4w605ferd":"","xn--bck1b9a5dre4c":"","xn--c1avg":"","xn--c2br7g":"","xn--cck2b3b":"","xn--cg4bki":"","xn--czr694b":"","xn--czrs0t":"","xn--czru2d":"","xn--d1acj3b":"","xn--eckvdtc9d":"","xn--efvy88h":"","xn--estv75g":"","xn--fct429k":"","xn--fhbei":"","xn--fiq228c5hs":"","xn--fiq64b":"","xn--fjq720a":"","xn--flw351e":"","xn--fzys8d69uvgm":"","xn--g2xx48c":"","xn--gckr3f0f":"","xn--gk3at1e":"","xn--hxt814e":"","xn--i1b6b1a6a2e":"","xn--imr513n":"","xn--io0a7i":"","xn--j1aef":"","xn--jlq61u9w7b":"","xn--jvr189m":"","xn--kcrx77d1x4a":"","xn--kpu716f":"","xn--kput3i":"","xn--mgba3a3ejt":"","xn--mgba7c0bbn0a":"","xn--mgbaakc7dvf":"","xn--mgbab2bd":"","xn--mgbb9fbpob":"","xn--mgbca7dzdo":"","xn--mgbi4ecexp":"","xn--mgbt3dhd":"","xn--mk1bu44c":"","xn--mxtq1m":"","xn--ngbc5azd":"","xn--ngbe9e0a":"","xn--nqv7f":"","xn--nqv7fs00ema":"","xn--nyqy26a":"","xn--p1acf":"","xn--pbt977c":"","xn--pssy2u":"","xn--q9jyb4c":"","xn--qcka1pmc":"","xn--rhqv96g":"","xn--rovu88b":"","xn--ses554g":"","xn--t60b56a":"","xn--tckwe":"","xn--tiq49xqyj":"","xn--unup4y":"","xn--vermgensberater-ctb":"","xn--vermgensberatung-pwb":"","xn--vhquv":"","xn--vuq861b":"","xn--w4r85el8fhu5dnra":"","xn--w4rs40l":"","xn--xhq521b":"","xn--zfr164b":"","xperia":"","xyz":"","yachts":"","yahoo":"","yamaxun":"","yandex":"","yodobashi":"","yoga":"","yokohama":"","you":"","youtube":"","yun":"","zappos":"","zara":"","zero":"","zip":"","zippo":"","zone":"","zuerich":""}
},{}],6:[function(require,module,exports){
var AttachedCache, IP, U2, Url, escapeSlash, exports, ref, shExp2RegExp,
  hasProp = {}.hasOwnProperty,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

U2 = require('uglify-js');

IP = require('ip-address');

Url = require('url');

ref = require('./shexp_utils'), shExp2RegExp = ref.shExp2RegExp, escapeSlash = ref.escapeSlash;

AttachedCache = require('./utils').AttachedCache;

module.exports = exports = {
  requestFromUrl: function(url) {
    var req;
    if (typeof url === 'string') {
      url = Url.parse(url);
    }
    return req = {
      url: Url.format(url),
      host: url.hostname,
      scheme: url.protocol.replace(':', '')
    };
  },
  urlWildcard2HostWildcard: function(pattern) {
    var result;
    result = pattern.match(/^\*:\/\/((?:\w|[?*._\-])+)\/\*$/);
    return result != null ? result[1] : void 0;
  },
  tag: function(condition) {
    return exports._condCache.tag(condition);
  },
  analyze: function(condition) {
    return exports._condCache.get(condition, function() {
      return {
        analyzed: exports._handler(condition.conditionType).analyze.call(exports, condition)
      };
    });
  },
  match: function(condition, request) {
    var cache;
    cache = exports.analyze(condition);
    return exports._handler(condition.conditionType).match.call(exports, condition, request, cache);
  },
  compile: function(condition) {
    var cache, handler;
    cache = exports.analyze(condition);
    if (cache.compiled) {
      return cache.compiled;
    }
    handler = exports._handler(condition.conditionType);
    return cache.compiled = handler.compile.call(exports, condition, cache);
  },
  str: function(condition, arg) {
    var abbr, endCode, handler, part, result, str, typeStr;
    abbr = (arg != null ? arg : {
      abbr: -1
    }).abbr;
    handler = exports._handler(condition.conditionType);
    if (handler.abbrs[0].length === 0) {
      endCode = condition.pattern.charCodeAt(condition.pattern.length - 1);
      if (endCode !== exports.colonCharCode && condition.pattern.indexOf(' ') < 0) {
        return condition.pattern;
      }
    }
    str = handler.str;
    typeStr = typeof abbr === 'number' ? handler.abbrs[(handler.abbrs.length + abbr) % handler.abbrs.length] : condition.conditionType;
    result = typeStr + ':';
    part = str ? str.call(exports, condition) : condition.pattern;
    if (part) {
      result += ' ' + part;
    }
    return result;
  },
  colonCharCode: ':'.charCodeAt(0),
  fromStr: function(str) {
    var condition, conditionType, fromStr, i;
    str = str.trim();
    i = str.indexOf(' ');
    if (i < 0) {
      i = str.length;
    }
    if (str.charCodeAt(i - 1) === exports.colonCharCode) {
      conditionType = str.substr(0, i - 1);
      str = str.substr(i + 1).trim();
    } else {
      conditionType = '';
    }
    conditionType = exports.typeFromAbbr(conditionType);
    if (!conditionType) {
      return null;
    }
    condition = {
      conditionType: conditionType
    };
    fromStr = exports._handler(condition.conditionType).fromStr;
    if (fromStr) {
      return fromStr.call(exports, str, condition);
    } else {
      condition.pattern = str;
      return condition;
    }
  },
  _abbrs: null,
  typeFromAbbr: function(abbr) {
    var ab, abbrs, j, len, ref1, type;
    if (!exports._abbrs) {
      exports._abbrs = {};
      ref1 = exports._conditionTypes;
      for (type in ref1) {
        if (!hasProp.call(ref1, type)) continue;
        abbrs = ref1[type].abbrs;
        exports._abbrs[type.toUpperCase()] = type;
        for (j = 0, len = abbrs.length; j < len; j++) {
          ab = abbrs[j];
          exports._abbrs[ab.toUpperCase()] = type;
        }
      }
    }
    return exports._abbrs[abbr.toUpperCase()];
  },
  comment: function(comment, node) {
    var base;
    if (!comment) {
      return;
    }
    if (node.start == null) {
      node.start = {};
    }
    Object.defineProperty(node.start, '_comments_dumped', {
      get: function() {
        return false;
      },
      set: function() {
        return false;
      }
    });
    if ((base = node.start).comments_before == null) {
      base.comments_before = [];
    }
    node.start.comments_before.push({
      type: 'comment2',
      value: comment
    });
    return node;
  },
  safeRegex: function(expr) {
    var error;
    try {
      return new RegExp(expr);
    } catch (error) {
      return /(?!)/;
    }
  },
  regTest: function(expr, regexp) {
    if (typeof regexp === 'string') {
      regexp = regexSafe(escapeSlash(regexp));
    }
    if (typeof expr === 'string') {
      expr = new U2.AST_SymbolRef({
        name: expr
      });
    }
    return new U2.AST_Call({
      args: [expr],
      expression: new U2.AST_Dot({
        property: 'test',
        expression: new U2.AST_RegExp({
          value: regexp
        })
      })
    });
  },
  isInt: function(num) {
    return typeof num === 'number' && !isNaN(num) && parseFloat(num) === parseInt(num, 10);
  },
  between: function(val, min, max, comment) {
    var pos, str, tmpl;
    if (min === max) {
      if (typeof min === 'number') {
        min = new U2.AST_Number({
          value: min
        });
      }
      return exports.comment(comment, new U2.AST_Binary({
        left: val,
        operator: '===',
        right: new U2.AST_Number({
          value: min
        })
      }));
    }
    if (exports.isInt(min) && exports.isInt(max) && max - min < 32) {
      comment || (comment = min + " <= value && value <= " + max);
      tmpl = "0123456789abcdefghijklmnopqrstuvwxyz";
      str = max < tmpl.length ? tmpl.substr(min, max - min + 1) : tmpl.substr(0, max - min + 1);
      pos = min === 0 ? val : new U2.AST_Binary({
        left: val,
        operator: '-',
        right: new U2.AST_Number({
          value: min
        })
      });
      return exports.comment(comment, new U2.AST_Binary({
        left: new U2.AST_Call({
          expression: new U2.AST_Dot({
            expression: new U2.AST_String({
              value: str
            }),
            property: 'charCodeAt'
          }),
          args: [pos]
        }),
        operator: '>',
        right: new U2.AST_Number({
          value: 0
        })
      }));
    }
    if (typeof min === 'number') {
      min = new U2.AST_Number({
        value: min
      });
    }
    if (typeof max === 'number') {
      max = new U2.AST_Number({
        value: max
      });
    }
    return exports.comment(comment, new U2.AST_Call({
      args: [val, min, max],
      expression: new U2.AST_Function({
        argnames: [
          new U2.AST_SymbolFunarg({
            name: 'value'
          }), new U2.AST_SymbolFunarg({
            name: 'min'
          }), new U2.AST_SymbolFunarg({
            name: 'max'
          })
        ],
        body: [
          new U2.AST_Return({
            value: new U2.AST_Binary({
              left: new U2.AST_Binary({
                left: new U2.AST_SymbolRef({
                  name: 'min'
                }),
                operator: '<=',
                right: new U2.AST_SymbolRef({
                  name: 'value'
                })
              }),
              operator: '&&',
              right: new U2.AST_Binary({
                left: new U2.AST_SymbolRef({
                  name: 'value'
                }),
                operator: '<=',
                right: new U2.AST_SymbolRef({
                  name: 'max'
                })
              })
            })
          })
        ]
      })
    }));
  },
  parseIp: function(ip) {
    var addr;
    if (ip.charCodeAt(0) === '['.charCodeAt(0)) {
      ip = ip.substr(1, ip.length - 2);
    }
    addr = new IP.v4.Address(ip);
    if (!addr.isValid()) {
      addr = new IP.v6.Address(ip);
      if (!addr.isValid()) {
        return null;
      }
    }
    return addr;
  },
  normalizeIp: function(addr) {
    var ref1;
    return ((ref1 = addr.correctForm) != null ? ref1 : addr.canonicalForm).call(addr);
  },
  ipv6Max: new IP.v6.Address('::/0').endAddress().canonicalForm(),
  localHosts: ["127.0.0.1", "[::1]", "localhost"],
  _condCache: new AttachedCache(function(condition) {
    var result, tag;
    tag = exports._handler(condition.conditionType).tag;
    result = tag ? tag.apply(exports, arguments) : exports.str(condition);
    return condition.conditionType + '$' + result;
  }),
  _setProp: function(obj, prop, value) {
    if (!Object.prototype.hasOwnProperty.call(obj, prop)) {
      Object.defineProperty(obj, prop, {
        writable: true
      });
    }
    return obj[prop] = value;
  },
  _handler: function(conditionType) {
    var handler;
    if (typeof conditionType !== 'string') {
      conditionType = conditionType.conditionType;
    }
    handler = exports._conditionTypes[conditionType];
    if (handler == null) {
      throw new Error("Unknown condition type: " + conditionType);
    }
    return handler;
  },
  _conditionTypes: {
    'TrueCondition': {
      abbrs: ['True'],
      analyze: function(condition) {
        return null;
      },
      match: function() {
        return true;
      },
      compile: function(condition) {
        return new U2.AST_True;
      },
      str: function(condition) {
        return '';
      },
      fromStr: function(str, condition) {
        return condition;
      }
    },
    'FalseCondition': {
      abbrs: ['False', 'Disabled'],
      analyze: function(condition) {
        return null;
      },
      match: function() {
        return false;
      },
      compile: function(condition) {
        return new U2.AST_False;
      },
      fromStr: function(str, condition) {
        if (str.length > 0) {
          condition.pattern = str;
        }
        return condition;
      }
    },
    'UrlRegexCondition': {
      abbrs: ['UR', 'URegex', 'UrlR', 'UrlRegex'],
      analyze: function(condition) {
        return this.safeRegex(escapeSlash(condition.pattern));
      },
      match: function(condition, request, cache) {
        return cache.analyzed.test(request.url);
      },
      compile: function(condition, cache) {
        return this.regTest('url', cache.analyzed);
      }
    },
    'UrlWildcardCondition': {
      abbrs: ['U', 'UW', 'Url', 'UrlW', 'UWild', 'UWildcard', 'UrlWild', 'UrlWildcard'],
      analyze: function(condition) {
        var parts, pattern;
        parts = (function() {
          var j, len, ref1, results;
          ref1 = condition.pattern.split('|');
          results = [];
          for (j = 0, len = ref1.length; j < len; j++) {
            pattern = ref1[j];
            if (pattern) {
              results.push(shExp2RegExp(pattern, {
                trimAsterisk: true
              }));
            }
          }
          return results;
        })();
        return this.safeRegex(parts.join('|'));
      },
      match: function(condition, request, cache) {
        return cache.analyzed.test(request.url);
      },
      compile: function(condition, cache) {
        return this.regTest('url', cache.analyzed);
      }
    },
    'HostRegexCondition': {
      abbrs: ['R', 'HR', 'Regex', 'HostR', 'HRegex', 'HostRegex'],
      analyze: function(condition) {
        return this.safeRegex(escapeSlash(condition.pattern));
      },
      match: function(condition, request, cache) {
        return cache.analyzed.test(request.host);
      },
      compile: function(condition, cache) {
        return this.regTest('host', cache.analyzed);
      }
    },
    'HostWildcardCondition': {
      abbrs: ['', 'H', 'W', 'HW', 'Wild', 'Wildcard', 'Host', 'HostW', 'HWild', 'HWildcard', 'HostWild', 'HostWildcard'],
      analyze: function(condition) {
        var parts, pattern;
        parts = (function() {
          var j, len, ref1, results;
          ref1 = condition.pattern.split('|');
          results = [];
          for (j = 0, len = ref1.length; j < len; j++) {
            pattern = ref1[j];
            if (!(pattern)) {
              continue;
            }
            if (pattern.charCodeAt(0) === '.'.charCodeAt(0)) {
              pattern = '*' + pattern;
            }
            if (pattern.indexOf('**.') === 0) {
              results.push(shExp2RegExp(pattern.substring(1), {
                trimAsterisk: true
              }));
            } else if (pattern.indexOf('*.') === 0) {
              results.push(shExp2RegExp(pattern.substring(2), {
                trimAsterisk: false
              }).replace(/./, '(?:^|\\.)').replace(/\.\*\$$/, ''));
            } else {
              results.push(shExp2RegExp(pattern, {
                trimAsterisk: true
              }));
            }
          }
          return results;
        })();
        return this.safeRegex(parts.join('|'));
      },
      match: function(condition, request, cache) {
        return cache.analyzed.test(request.host);
      },
      compile: function(condition, cache) {
        return this.regTest('host', cache.analyzed);
      }
    },
    'BypassCondition': {
      abbrs: ['B', 'Bypass'],
      analyze: function(condition) {
        var addr, cache, matchPort, parts, pos, prefixLen, ref1, regexStr, scheme, server, serverIp, serverRegex;
        cache = {
          host: null,
          ip: null,
          scheme: null,
          url: null
        };
        server = condition.pattern;
        if (server === '<local>') {
          cache.host = server;
          return cache;
        }
        parts = server.split('://');
        if (parts.length > 1) {
          cache.scheme = parts[0];
          server = parts[1];
        }
        parts = server.split('/');
        if (parts.length > 1) {
          addr = this.parseIp(parts[0]);
          prefixLen = parseInt(parts[1]);
          if (addr && !isNaN(prefixLen)) {
            cache.ip = {
              conditionType: 'IpCondition',
              ip: parts[0],
              prefixLength: prefixLen
            };
            return cache;
          }
        }
        if (server.charCodeAt(server.length - 1) !== ']'.charCodeAt(0)) {
          pos = server.lastIndexOf(':');
          if (pos >= 0) {
            matchPort = server.substring(pos + 1);
            server = server.substring(0, pos);
          }
        }
        serverIp = this.parseIp(server);
        serverRegex = null;
        if (serverIp != null) {
          if (serverIp.regularExpressionString != null) {
            regexStr = serverIp.regularExpressionString(true);
            serverRegex = '\\[' + regexStr + '\\]';
          } else {
            server = this.normalizeIp(serverIp);
          }
        } else if (server.charCodeAt(0) === '.'.charCodeAt(0)) {
          server = '*' + server;
        }
        if (matchPort) {
          if (serverRegex == null) {
            serverRegex = shExp2RegExp(server);
            serverRegex = serverRegex.substring(1, serverRegex.length - 1);
          }
          scheme = (ref1 = cache.scheme) != null ? ref1 : '[^:]+';
          cache.url = this.safeRegex('^' + scheme + ':\\/\\/' + serverRegex + ':' + matchPort + '\\/');
        } else if (server !== '*') {
          if (serverRegex) {
            serverRegex = '^' + serverRegex + '$';
          } else {
            serverRegex = shExp2RegExp(server, {
              trimAsterisk: true
            });
          }
          cache.host = this.safeRegex(serverRegex);
        }
        return cache;
      },
      match: function(condition, request, cache) {
        var ref1;
        cache = cache.analyzed;
        if ((cache.scheme != null) && cache.scheme !== request.scheme) {
          return false;
        }
        if ((cache.ip != null) && !this.match(cache.ip, request)) {
          return false;
        }
        if (cache.host != null) {
          if (cache.host === '<local>') {
            return ref1 = request.host, indexOf.call(this.localHosts, ref1) >= 0;
          } else {
            if (!cache.host.test(request.host)) {
              return false;
            }
          }
        }
        if ((cache.url != null) && !cache.url.test(request.url)) {
          return false;
        }
        return true;
      },
      compile: function(condition, cache) {
        var conditions, hostEquals;
        cache = cache.analyzed;
        if (cache.url != null) {
          return this.regTest('url', cache.url);
        }
        conditions = [];
        if (cache.host === '<local>') {
          hostEquals = function(host) {
            return new U2.AST_Binary({
              left: new U2.AST_SymbolRef({
                name: 'host'
              }),
              operator: '===',
              right: new U2.AST_String({
                value: host
              })
            });
          };
          return new U2.AST_Binary({
            left: new U2.AST_Binary({
              left: hostEquals('[::1]'),
              operator: '||',
              right: hostEquals('localhost')
            }),
            operator: '||',
            right: hostEquals('127.0.0.1')
          });
        }
        if (cache.scheme != null) {
          conditions.push(new U2.AST_Binary({
            left: new U2.AST_SymbolRef({
              name: 'scheme'
            }),
            operator: '===',
            right: new U2.AST_String({
              value: cache.scheme
            })
          }));
        }
        if (cache.host != null) {
          conditions.push(this.regTest('host', cache.host));
        } else if (cache.ip != null) {
          conditions.push(this.compile(cache.ip));
        }
        switch (conditions.length) {
          case 0:
            return new U2.AST_True;
          case 1:
            return conditions[0];
          case 2:
            return new U2.AST_Binary({
              left: conditions[0],
              operator: '&&',
              right: conditions[1]
            });
        }
      }
    },
    'KeywordCondition': {
      abbrs: ['K', 'KW', 'Keyword'],
      analyze: function(condition) {
        return null;
      },
      match: function(condition, request) {
        return request.scheme === 'http' && request.url.indexOf(condition.pattern) >= 0;
      },
      compile: function(condition) {
        return new U2.AST_Binary({
          left: new U2.AST_Binary({
            left: new U2.AST_SymbolRef({
              name: 'scheme'
            }),
            operator: '===',
            right: new U2.AST_String({
              value: 'http'
            })
          }),
          operator: '&&',
          right: new U2.AST_Binary({
            left: new U2.AST_Call({
              expression: new U2.AST_Dot({
                expression: new U2.AST_SymbolRef({
                  name: 'url'
                }),
                property: 'indexOf'
              }),
              args: [
                new U2.AST_String({
                  value: condition.pattern
                })
              ]
            }),
            operator: '>=',
            right: new U2.AST_Number({
              value: 0
            })
          })
        });
      }
    },
    'IpCondition': {
      abbrs: ['Ip'],
      analyze: function(condition) {
        var addr, cache, ip, mask;
        cache = {
          addr: null,
          normalized: null
        };
        ip = condition.ip;
        if (ip.charCodeAt(0) === '['.charCodeAt(0)) {
          ip = ip.substr(1, ip.length - 2);
        }
        addr = ip + '/' + condition.prefixLength;
        cache.addr = this.parseIp(addr);
        if (cache.addr == null) {
          throw new Error("Invalid IP address " + addr);
        }
        cache.normalized = this.normalizeIp(cache.addr);
        mask = cache.addr.v4 ? new IP.v4.Address('255.255.255.255/' + cache.addr.subnetMask) : new IP.v6.Address(this.ipv6Max + '/' + cache.addr.subnetMask);
        cache.mask = this.normalizeIp(mask.startAddress());
        return cache;
      },
      match: function(condition, request, cache) {
        var addr;
        addr = this.parseIp(request.host);
        if (addr == null) {
          return false;
        }
        cache = cache.analyzed;
        if (addr.v4 !== cache.addr.v4) {
          return false;
        }
        return addr.isInSubnet(cache.addr);
      },
      compile: function(condition, cache) {
        var hostIsInNet, hostIsInNetEx, hostLooksLikeIp;
        cache = cache.analyzed;
        hostLooksLikeIp = cache.addr.v4 ? new U2.AST_Binary({
          left: new U2.AST_Sub({
            expression: new U2.AST_SymbolRef({
              name: 'host'
            }),
            property: new U2.AST_Binary({
              left: new U2.AST_Dot({
                expression: new U2.AST_SymbolRef({
                  name: 'host'
                }),
                property: 'length'
              }),
              operator: '-',
              right: new U2.AST_Number({
                value: 1
              })
            })
          }),
          operator: '>=',
          right: new U2.AST_Number({
            value: 0
          })
        }) : new U2.AST_Binary({
          left: new U2.AST_Call({
            expression: new U2.AST_Dot({
              expression: new U2.AST_SymbolRef({
                name: 'host'
              }),
              property: 'indexOf'
            }),
            args: [
              new U2.AST_String({
                value: ':'
              })
            ]
          }),
          operator: '>=',
          right: new U2.AST_Number({
            value: 0
          })
        });
        if (cache.addr.subnetMask === 0) {
          return hostLooksLikeIp;
        }
        hostIsInNet = new U2.AST_Call({
          expression: new U2.AST_SymbolRef({
            name: 'isInNet'
          }),
          args: [
            new U2.AST_SymbolRef({
              name: 'host'
            }), new U2.AST_String({
              value: cache.normalized
            }), new U2.AST_String({
              value: cache.mask
            })
          ]
        });
        if (cache.addr.v6) {
          hostIsInNetEx = new U2.AST_Call({
            expression: new U2.AST_SymbolRef({
              name: 'isInNetEx'
            }),
            args: [
              new U2.AST_SymbolRef({
                name: 'host'
              }), new U2.AST_String({
                value: cache.normalized
              }), new U2.AST_String({
                value: cache.mask
              })
            ]
          });
          hostIsInNet = new U2.AST_Conditional({
            condition: new U2.AST_Binary({
              left: new U2.AST_UnaryPrefix({
                operator: 'typeof',
                expression: new U2.AST_SymbolRef({
                  name: 'isInNetEx'
                })
              }),
              operator: '===',
              right: new U2.AST_String({
                value: 'function'
              })
            }),
            consequent: hostIsInNetEx,
            alternative: hostIsInNet
          });
        }
        return new U2.AST_Binary({
          left: hostLooksLikeIp,
          operator: '&&',
          right: hostIsInNet
        });
      },
      str: function(condition) {
        return condition.ip + '/' + condition.prefixLength;
      },
      fromStr: function(str, condition) {
        var ip, prefixLength, ref1;
        ref1 = str.split('/'), ip = ref1[0], prefixLength = ref1[1];
        condition.ip = ip;
        condition.prefixLength = parseInt(prefixLength);
        return condition;
      }
    },
    'HostLevelsCondition': {
      abbrs: ['Lv', 'Level', 'Levels', 'HL', 'HLv', 'HLevel', 'HLevels', 'HostL', 'HostLv', 'HostLevel', 'HostLevels'],
      analyze: function(condition) {
        return '.'.charCodeAt(0);
      },
      match: function(condition, request, cache) {
        var dotCharCode, dotCount, i, j, ref1;
        dotCharCode = cache.analyzed;
        dotCount = 0;
        for (i = j = 0, ref1 = request.host.length; 0 <= ref1 ? j < ref1 : j > ref1; i = 0 <= ref1 ? ++j : --j) {
          if (request.host.charCodeAt(i) === dotCharCode) {
            dotCount++;
            if (dotCount > condition.maxValue) {
              return false;
            }
          }
        }
        return dotCount >= condition.minValue;
      },
      compile: function(condition) {
        var val;
        val = new U2.AST_Dot({
          property: 'length',
          expression: new U2.AST_Call({
            args: [
              new U2.AST_String({
                value: '.'
              })
            ],
            expression: new U2.AST_Dot({
              expression: new U2.AST_SymbolRef({
                name: 'host'
              }),
              property: 'split'
            })
          })
        });
        return this.between(val, condition.minValue + 1, condition.maxValue + 1, condition.minValue + " <= hostLevels <= " + condition.maxValue);
      },
      str: function(condition) {
        return condition.minValue + '~' + condition.maxValue;
      },
      fromStr: function(str, condition) {
        var maxValue, minValue, ref1;
        ref1 = str.split('~'), minValue = ref1[0], maxValue = ref1[1];
        condition.minValue = minValue;
        condition.maxValue = maxValue;
        return condition;
      }
    },
    'WeekdayCondition': {
      abbrs: ['WD', 'Week', 'Day', 'Weekday'],
      analyze: function(condition) {
        return null;
      },
      match: function(condition, request) {
        var day;
        day = new Date().getDay();
        return condition.startDay <= day && day <= condition.endDay;
      },
      compile: function(condition) {
        var val;
        val = new U2.AST_Call({
          args: [],
          expression: new U2.AST_Dot({
            property: 'getDay',
            expression: new U2.AST_New({
              args: [],
              expression: new U2.AST_SymbolRef({
                name: 'Date'
              })
            })
          })
        });
        return this.between(val, condition.startDay, condition.endDay);
      },
      str: function(condition) {
        return condition.startDay + '~' + condition.endDay;
      },
      fromStr: function(str, condition) {
        var endDay, ref1, startDay;
        ref1 = str.split('~'), startDay = ref1[0], endDay = ref1[1];
        condition.startDay = startDay;
        condition.endDay = endDay;
        return condition;
      }
    },
    'TimeCondition': {
      abbrs: ['T', 'Time', 'Hour'],
      analyze: function(condition) {
        return null;
      },
      match: function(condition, request) {
        var hour;
        hour = new Date().getHours();
        return condition.startHour <= hour && hour <= condition.endHour;
      },
      compile: function(condition) {
        var val;
        val = new U2.AST_Call({
          args: [],
          expression: new U2.AST_Dot({
            property: 'getHours',
            expression: new U2.AST_New({
              args: [],
              expression: new U2.AST_SymbolRef({
                name: 'Date'
              })
            })
          })
        });
        return this.between(val, condition.startHour, condition.endHour);
      },
      str: function(condition) {
        return condition.startHour + '~' + condition.endHour;
      },
      fromStr: function(str, condition) {
        var endHour, ref1, startHour;
        ref1 = str.split('~'), startHour = ref1[0], endHour = ref1[1];
        condition.startHour = startHour;
        condition.endHour = endHour;
        return condition;
      }
    }
  }
};


},{"./shexp_utils":10,"./utils":11,"ip-address":undefined,"uglify-js":undefined,"url":undefined}],7:[function(require,module,exports){
var Profiles, U2;

U2 = require('uglify-js');

Profiles = require('./profiles');

module.exports = {
  ascii: function(str) {
    return str.replace(/[\u0080-\uffff]/g, function(char) {
      var _, hex, i, ref, result;
      hex = char.charCodeAt(0).toString(16);
      result = '\\u';
      for (_ = i = ref = hex.length; ref <= 4 ? i < 4 : i > 4; _ = ref <= 4 ? ++i : --i) {
        result += '0';
      }
      result += hex;
      return result;
    });
  },
  compress: function(ast) {
    var compressed_ast, compressor;
    ast.figure_out_scope();
    compressor = U2.Compressor({
      warnings: false,
      keep_fargs: true
    }, {
      if_return: false
    });
    compressed_ast = ast.transform(compressor);
    compressed_ast.figure_out_scope();
    compressed_ast.compute_char_frequency();
    compressed_ast.mangle_names();
    return compressed_ast;
  },
  script: function(options, profile, args) {
    var factory, key, name, p, profiles, refs;
    if (typeof profile === 'string') {
      profile = Profiles.byName(profile, options);
    }
    refs = Profiles.allReferenceSet(profile, options, {
      profileNotFound: args != null ? args.profileNotFound : void 0
    });
    profiles = new U2.AST_Object({
      properties: (function() {
        var results;
        results = [];
        for (key in refs) {
          name = refs[key];
          if (!(key !== '+direct')) {
            continue;
          }
          p = typeof profile === 'object' && profile.name === name ? profile : Profiles.byName(name, options);
          if (p == null) {
            p = Profiles.profileNotFound(name, args != null ? args.profileNotFound : void 0);
          }
          results.push(new U2.AST_ObjectKeyVal({
            key: key,
            value: Profiles.compile(p)
          }));
        }
        return results;
      })()
    });
    factory = new U2.AST_Function({
      argnames: [
        new U2.AST_SymbolFunarg({
          name: 'init'
        }), new U2.AST_SymbolFunarg({
          name: 'profiles'
        })
      ],
      body: [
        new U2.AST_Return({
          value: new U2.AST_Function({
            argnames: [
              new U2.AST_SymbolFunarg({
                name: 'url'
              }), new U2.AST_SymbolFunarg({
                name: 'host'
              })
            ],
            body: [
              new U2.AST_Directive({
                value: 'use strict'
              }), new U2.AST_Var({
                definitions: [
                  new U2.AST_VarDef({
                    name: new U2.AST_SymbolVar({
                      name: 'result'
                    }),
                    value: new U2.AST_SymbolRef({
                      name: 'init'
                    })
                  }), new U2.AST_VarDef({
                    name: new U2.AST_SymbolVar({
                      name: 'scheme'
                    }),
                    value: new U2.AST_Call({
                      expression: new U2.AST_Dot({
                        expression: new U2.AST_SymbolRef({
                          name: 'url'
                        }),
                        property: 'substr'
                      }),
                      args: [
                        new U2.AST_Number({
                          value: 0
                        }), new U2.AST_Call({
                          expression: new U2.AST_Dot({
                            expression: new U2.AST_SymbolRef({
                              name: 'url'
                            }),
                            property: 'indexOf'
                          }),
                          args: [
                            new U2.AST_String({
                              value: ':'
                            })
                          ]
                        })
                      ]
                    })
                  })
                ]
              }), new U2.AST_Do({
                body: new U2.AST_BlockStatement({
                  body: [
                    new U2.AST_SimpleStatement({
                      body: new U2.AST_Assign({
                        left: new U2.AST_SymbolRef({
                          name: 'result'
                        }),
                        operator: '=',
                        right: new U2.AST_Sub({
                          expression: new U2.AST_SymbolRef({
                            name: 'profiles'
                          }),
                          property: new U2.AST_SymbolRef({
                            name: 'result'
                          })
                        })
                      })
                    }), new U2.AST_If({
                      condition: new U2.AST_Binary({
                        left: new U2.AST_UnaryPrefix({
                          operator: 'typeof',
                          expression: new U2.AST_SymbolRef({
                            name: 'result'
                          })
                        }),
                        operator: '===',
                        right: new U2.AST_String({
                          value: 'function'
                        })
                      }),
                      body: new U2.AST_SimpleStatement({
                        body: new U2.AST_Assign({
                          left: new U2.AST_SymbolRef({
                            name: 'result'
                          }),
                          operator: '=',
                          right: new U2.AST_Call({
                            expression: new U2.AST_SymbolRef({
                              name: 'result'
                            }),
                            args: [
                              new U2.AST_SymbolRef({
                                name: 'url'
                              }), new U2.AST_SymbolRef({
                                name: 'host'
                              }), new U2.AST_SymbolRef({
                                name: 'scheme'
                              })
                            ]
                          })
                        })
                      })
                    })
                  ]
                }),
                condition: new U2.AST_Binary({
                  left: new U2.AST_Binary({
                    left: new U2.AST_UnaryPrefix({
                      operator: 'typeof',
                      expression: new U2.AST_SymbolRef({
                        name: 'result'
                      })
                    }),
                    operator: '!==',
                    right: new U2.AST_String({
                      value: 'string'
                    })
                  }),
                  operator: '||',
                  right: new U2.AST_Binary({
                    left: new U2.AST_Call({
                      expression: new U2.AST_Dot({
                        expression: new U2.AST_SymbolRef({
                          name: 'result'
                        }),
                        property: 'charCodeAt'
                      }),
                      args: [
                        new U2.AST_Number({
                          value: 0
                        })
                      ]
                    }),
                    operator: '===',
                    right: new U2.AST_Number({
                      value: '+'.charCodeAt(0)
                    })
                  })
                })
              }), new U2.AST_Return({
                value: new U2.AST_SymbolRef({
                  name: 'result'
                })
              })
            ]
          })
        })
      ]
    });
    return new U2.AST_Toplevel({
      body: [
        new U2.AST_Var({
          definitions: [
            new U2.AST_VarDef({
              name: new U2.AST_SymbolVar({
                name: 'FindProxyForURL'
              }),
              value: new U2.AST_Call({
                expression: factory,
                args: [Profiles.profileResult(profile.name), profiles]
              })
            })
          ]
        })
      ]
    });
  }
};


},{"./profiles":8,"uglify-js":undefined}],8:[function(require,module,exports){
var AST_Raw, AttachedCache, Conditions, Revision, RuleList, ShexpUtils, U2, exports, ref1,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

U2 = require('uglify-js');

ShexpUtils = require('./shexp_utils');

Conditions = require('./conditions');

RuleList = require('./rule_list');

ref1 = require('./utils'), AttachedCache = ref1.AttachedCache, Revision = ref1.Revision;

AST_Raw = (function(superClass) {
  extend(AST_Raw, superClass);

  function AST_Raw(raw) {
    U2.AST_SymbolRef.call(this, {
      name: raw
    });
    this.aborts = function() {
      return false;
    };
  }

  return AST_Raw;

})(U2.AST_SymbolRef);

module.exports = exports = {
  builtinProfiles: {
    '+direct': {
      name: 'direct',
      profileType: 'DirectProfile',
      color: '#aaaaaa',
      builtin: true
    },
    '+system': {
      name: 'system',
      profileType: 'SystemProfile',
      color: '#000000',
      builtin: true
    }
  },
  schemes: [
    {
      scheme: 'http',
      prop: 'proxyForHttp'
    }, {
      scheme: 'https',
      prop: 'proxyForHttps'
    }, {
      scheme: 'ftp',
      prop: 'proxyForFtp'
    }, {
      scheme: '',
      prop: 'fallbackProxy'
    }
  ],
  pacProtocols: {
    'http': 'PROXY',
    'https': 'HTTPS',
    'socks4': 'SOCKS',
    'socks5': 'SOCKS5'
  },
  formatByType: {
    'SwitchyRuleListProfile': 'Switchy',
    'AutoProxyRuleListProfile': 'AutoProxy'
  },
  ruleListFormats: ['Switchy', 'AutoProxy'],
  parseHostPort: function(str, scheme) {
    var host, port, sep;
    sep = str.lastIndexOf(':');
    if (sep < 0) {
      return;
    }
    port = parseInt(str.substr(sep + 1)) || 80;
    host = str.substr(0, sep);
    if (!host) {
      return;
    }
    return {
      scheme: scheme,
      host: host,
      port: port
    };
  },
  pacResult: function(proxy) {
    if (proxy) {
      if (proxy.scheme === 'socks5') {
        return "SOCKS5 " + proxy.host + ":" + proxy.port + "; SOCKS " + proxy.host + ":" + proxy.port;
      } else {
        return exports.pacProtocols[proxy.scheme] + " " + proxy.host + ":" + proxy.port;
      }
    } else {
      return 'DIRECT';
    }
  },
  isFileUrl: function(url) {
    return !!((url != null ? url.substr(0, 5).toUpperCase() : void 0) === 'FILE:');
  },
  nameAsKey: function(profileName) {
    if (typeof profileName !== 'string') {
      profileName = profileName.name;
    }
    return '+' + profileName;
  },
  byName: function(profileName, options) {
    var key, ref2;
    if (typeof profileName === 'string') {
      key = exports.nameAsKey(profileName);
      profileName = (ref2 = exports.builtinProfiles[key]) != null ? ref2 : options[key];
    }
    return profileName;
  },
  byKey: function(key, options) {
    var ref2;
    if (typeof key === 'string') {
      key = (ref2 = exports.builtinProfiles[key]) != null ? ref2 : options[key];
    }
    return key;
  },
  each: function(options, callback) {
    var charCodePlus, key, profile, ref2, results;
    charCodePlus = '+'.charCodeAt(0);
    for (key in options) {
      profile = options[key];
      if (key.charCodeAt(0) === charCodePlus) {
        callback(key, profile);
      }
    }
    ref2 = exports.builtinProfiles;
    results = [];
    for (key in ref2) {
      profile = ref2[key];
      if (key.charCodeAt(0) === charCodePlus) {
        results.push(callback(key, profile));
      } else {
        results.push(void 0);
      }
    }
    return results;
  },
  profileResult: function(profileName) {
    var key;
    key = exports.nameAsKey(profileName);
    if (key === '+direct') {
      key = exports.pacResult();
    }
    return new U2.AST_String({
      value: key
    });
  },
  isIncludable: function(profile) {
    var includable;
    includable = exports._handler(profile).includable;
    if (typeof includable === 'function') {
      includable = includable.call(exports, profile);
    }
    return !!includable;
  },
  isInclusive: function(profile) {
    return !!exports._handler(profile).inclusive;
  },
  updateUrl: function(profile) {
    var ref2;
    return (ref2 = exports._handler(profile).updateUrl) != null ? ref2.call(exports, profile) : void 0;
  },
  update: function(profile, data) {
    return exports._handler(profile).update.call(exports, profile, data);
  },
  tag: function(profile) {
    return exports._profileCache.tag(profile);
  },
  create: function(profile, opt_profileType) {
    var create;
    if (typeof profile === 'string') {
      profile = {
        name: profile,
        profileType: opt_profileType
      };
    } else if (opt_profileType) {
      profile.profileType = opt_profileType;
    }
    create = exports._handler(profile).create;
    if (!create) {
      return profile;
    }
    create.call(exports, profile);
    return profile;
  },
  updateRevision: function(profile, revision) {
    if (revision == null) {
      revision = Revision.fromTime();
    }
    return profile.revision = revision;
  },
  replaceRef: function(profile, fromName, toName) {
    var handler;
    if (!exports.isInclusive(profile)) {
      return false;
    }
    handler = exports._handler(profile);
    return handler.replaceRef.call(exports, profile, fromName, toName);
  },
  analyze: function(profile) {
    var analyze, cache, result;
    cache = exports._profileCache.get(profile, {});
    if (!Object.prototype.hasOwnProperty.call(cache, 'analyzed')) {
      analyze = exports._handler(profile).analyze;
      result = analyze != null ? analyze.call(exports, profile) : void 0;
      cache.analyzed = result;
    }
    return cache;
  },
  dropCache: function(profile) {
    return exports._profileCache.drop(profile);
  },
  directReferenceSet: function(profile) {
    var cache, handler;
    if (!exports.isInclusive(profile)) {
      return {};
    }
    cache = exports._profileCache.get(profile, {});
    if (cache.directReferenceSet) {
      return cache.directReferenceSet;
    }
    handler = exports._handler(profile);
    return cache.directReferenceSet = handler.directReferenceSet.call(exports, profile);
  },
  profileNotFound: function(name, action) {
    if (action == null) {
      throw new Error("Profile " + name + " does not exist!");
    }
    if (typeof action === 'function') {
      action = action(name);
    }
    if (typeof action === 'object' && action.profileType) {
      return action;
    }
    switch (action) {
      case 'ignore':
        return null;
      case 'dumb':
        return exports.create({
          name: name,
          profileType: 'VirtualProfile',
          defaultProfileName: 'direct'
        });
    }
    throw action;
  },
  allReferenceSet: function(profile, options, opt_args) {
    var has_out, key, name, o_profile, ref2, result;
    o_profile = profile;
    profile = exports.byName(profile, options);
    if (profile == null) {
      profile = typeof exports.profileNotFound === "function" ? exports.profileNotFound(o_profile, opt_args.profileNotFound) : void 0;
    }
    if (opt_args == null) {
      opt_args = {};
    }
    has_out = opt_args.out != null;
    result = opt_args.out != null ? opt_args.out : opt_args.out = {};
    if (profile) {
      result[exports.nameAsKey(profile.name)] = profile.name;
      ref2 = exports.directReferenceSet(profile);
      for (key in ref2) {
        name = ref2[key];
        exports.allReferenceSet(name, options, opt_args);
      }
    }
    if (!has_out) {
      delete opt_args.out;
    }
    return result;
  },
  referencedBySet: function(profile, options, opt_args) {
    var has_out, profileKey, result;
    profileKey = exports.nameAsKey(profile);
    if (opt_args == null) {
      opt_args = {};
    }
    has_out = opt_args.out != null;
    result = opt_args.out != null ? opt_args.out : opt_args.out = {};
    exports.each(options, function(key, prof) {
      if (exports.directReferenceSet(prof)[profileKey]) {
        result[key] = prof.name;
        return exports.referencedBySet(prof, options, opt_args);
      }
    });
    if (!has_out) {
      delete opt_args.out;
    }
    return result;
  },
  validResultProfilesFor: function(profile, options) {
    var profileKey, ref, result;
    profile = exports.byName(profile, options);
    if (!exports.isInclusive(profile)) {
      return [];
    }
    profileKey = exports.nameAsKey(profile);
    ref = exports.referencedBySet(profile, options);
    ref[profileKey] = profileKey;
    result = [];
    exports.each(options, function(key, prof) {
      if (!ref[key] && exports.isIncludable(prof)) {
        return result.push(prof);
      }
    });
    return result;
  },
  match: function(profile, request, opt_profileType) {
    var cache, match;
    if (opt_profileType == null) {
      opt_profileType = profile.profileType;
    }
    cache = exports.analyze(profile);
    match = exports._handler(opt_profileType).match;
    return match != null ? match.call(exports, profile, request, cache) : void 0;
  },
  compile: function(profile, opt_profileType) {
    var cache, handler;
    if (opt_profileType == null) {
      opt_profileType = profile.profileType;
    }
    cache = exports.analyze(profile);
    if (cache.compiled) {
      return cache.compiled;
    }
    handler = exports._handler(opt_profileType);
    return cache.compiled = handler.compile.call(exports, profile, cache);
  },
  _profileCache: new AttachedCache(function(profile) {
    return profile.revision;
  }),
  _handler: function(profileType) {
    var handler;
    if (typeof profileType !== 'string') {
      profileType = profileType.profileType;
    }
    handler = profileType;
    while (typeof handler === 'string') {
      handler = exports._profileTypes[handler];
    }
    if (handler == null) {
      throw new Error("Unknown profile type: " + profileType);
    }
    return handler;
  },
  _profileTypes: {
    'SystemProfile': {
      compile: function(profile) {
        throw new Error("SystemProfile cannot be used in PAC scripts");
      }
    },
    'DirectProfile': {
      includable: true,
      compile: function(profile) {
        return new U2.AST_String({
          value: this.pacResult()
        });
      }
    },
    'FixedProfile': {
      includable: true,
      create: function(profile) {
        return profile.bypassList != null ? profile.bypassList : profile.bypassList = [
          {
            conditionType: 'BypassCondition',
            pattern: '<local>'
          }
        ];
      },
      match: function(profile, request) {
        var cond, i, j, len, len1, ref2, ref3, s;
        if (profile.bypassList) {
          ref2 = profile.bypassList;
          for (i = 0, len = ref2.length; i < len; i++) {
            cond = ref2[i];
            if (Conditions.match(cond, request)) {
              return [this.pacResult(), cond];
            }
          }
        }
        ref3 = this.schemes;
        for (j = 0, len1 = ref3.length; j < len1; j++) {
          s = ref3[j];
          if (s.scheme === request.scheme && profile[s.prop]) {
            return [this.pacResult(profile[s.prop]), s.scheme];
          }
        }
        return [this.pacResult(profile.fallbackProxy), ''];
      },
      compile: function(profile) {
        var body, cond, condition, conditions, i, len, ref2, ret, s;
        if ((!profile.bypassList || !profile.fallbackProxy) && !profile.proxyForHttp && !profile.proxyForHttps && !profile.proxyForFtp) {
          return new U2.AST_String({
            value: this.pacResult(profile.fallbackProxy)
          });
        }
        body = [
          new U2.AST_Directive({
            value: 'use strict'
          })
        ];
        if (profile.bypassList && profile.bypassList.length) {
          conditions = null;
          ref2 = profile.bypassList;
          for (i = 0, len = ref2.length; i < len; i++) {
            cond = ref2[i];
            condition = Conditions.compile(cond);
            if (conditions != null) {
              conditions = new U2.AST_Binary({
                left: conditions,
                operator: '||',
                right: condition
              });
            } else {
              conditions = condition;
            }
          }
          body.push(new U2.AST_If({
            condition: conditions,
            body: new U2.AST_Return({
              value: new U2.AST_String({
                value: this.pacResult()
              })
            })
          }));
        }
        if (!profile.proxyForHttp && !profile.proxyForHttps && !profile.proxyForFtp) {
          body.push(new U2.AST_Return({
            value: new U2.AST_String({
              value: this.pacResult(profile.fallbackProxy)
            })
          }));
        } else {
          body.push(new U2.AST_Switch({
            expression: new U2.AST_SymbolRef({
              name: 'scheme'
            }),
            body: (function() {
              var j, len1, ref3, results;
              ref3 = this.schemes;
              results = [];
              for (j = 0, len1 = ref3.length; j < len1; j++) {
                s = ref3[j];
                if (!(!s.scheme || profile[s.prop])) {
                  continue;
                }
                ret = [
                  new U2.AST_Return({
                    value: new U2.AST_String({
                      value: this.pacResult(profile[s.prop])
                    })
                  })
                ];
                if (s.scheme) {
                  results.push(new U2.AST_Case({
                    expression: new U2.AST_String({
                      value: s.scheme
                    }),
                    body: ret
                  }));
                } else {
                  results.push(new U2.AST_Default({
                    body: ret
                  }));
                }
              }
              return results;
            }).call(this)
          }));
        }
        return new U2.AST_Function({
          argnames: [
            new U2.AST_SymbolFunarg({
              name: 'url'
            }), new U2.AST_SymbolFunarg({
              name: 'host'
            }), new U2.AST_SymbolFunarg({
              name: 'scheme'
            })
          ],
          body: body
        });
      }
    },
    'PacProfile': {
      includable: function(profile) {
        return !this.isFileUrl(profile.pacUrl);
      },
      create: function(profile) {
        return profile.pacScript != null ? profile.pacScript : profile.pacScript = 'function FindProxyForURL(url, host) {\n  return "DIRECT";\n}';
      },
      compile: function(profile) {
        return new U2.AST_Call({
          args: [new U2.AST_This],
          expression: new U2.AST_Dot({
            property: 'call',
            expression: new U2.AST_Function({
              argnames: [],
              body: [
                new AST_Raw(';\n' + profile.pacScript + '\n\n/* End of PAC */;'), new U2.AST_Return({
                  value: new U2.AST_SymbolRef({
                    name: 'FindProxyForURL'
                  })
                })
              ]
            })
          })
        });
      },
      updateUrl: function(profile) {
        if (this.isFileUrl(profile.pacUrl)) {
          return void 0;
        } else {
          return profile.pacUrl;
        }
      },
      update: function(profile, data) {
        if (profile.pacScript === data) {
          return false;
        }
        profile.pacScript = data;
        return true;
      }
    },
    'AutoDetectProfile': 'PacProfile',
    'SwitchProfile': {
      includable: true,
      inclusive: true,
      create: function(profile) {
        if (profile.defaultProfileName == null) {
          profile.defaultProfileName = 'direct';
        }
        return profile.rules != null ? profile.rules : profile.rules = [];
      },
      directReferenceSet: function(profile) {
        var i, len, ref2, refs, rule;
        refs = {};
        refs[exports.nameAsKey(profile.defaultProfileName)] = profile.defaultProfileName;
        ref2 = profile.rules;
        for (i = 0, len = ref2.length; i < len; i++) {
          rule = ref2[i];
          refs[exports.nameAsKey(rule.profileName)] = rule.profileName;
        }
        return refs;
      },
      analyze: function(profile) {
        return profile.rules;
      },
      replaceRef: function(profile, fromName, toName) {
        var changed, i, len, ref2, rule;
        changed = false;
        if (profile.defaultProfileName === fromName) {
          profile.defaultProfileName = toName;
          changed = true;
        }
        ref2 = profile.rules;
        for (i = 0, len = ref2.length; i < len; i++) {
          rule = ref2[i];
          if (rule.profileName === fromName) {
            rule.profileName = toName;
            changed = true;
          }
        }
        return changed;
      },
      match: function(profile, request, cache) {
        var i, len, ref2, rule;
        ref2 = cache.analyzed;
        for (i = 0, len = ref2.length; i < len; i++) {
          rule = ref2[i];
          if (Conditions.match(rule.condition, request)) {
            return rule;
          }
        }
        return [exports.nameAsKey(profile.defaultProfileName), null];
      },
      compile: function(profile, cache) {
        var body, i, len, rule, rules;
        rules = cache.analyzed;
        if (rules.length === 0) {
          return this.profileResult(profile.defaultProfileName);
        }
        body = [
          new U2.AST_Directive({
            value: 'use strict'
          })
        ];
        for (i = 0, len = rules.length; i < len; i++) {
          rule = rules[i];
          body.push(new U2.AST_If({
            condition: Conditions.compile(rule.condition),
            body: new U2.AST_Return({
              value: this.profileResult(rule.profileName)
            })
          }));
        }
        body.push(new U2.AST_Return({
          value: this.profileResult(profile.defaultProfileName)
        }));
        return new U2.AST_Function({
          argnames: [
            new U2.AST_SymbolFunarg({
              name: 'url'
            }), new U2.AST_SymbolFunarg({
              name: 'host'
            }), new U2.AST_SymbolFunarg({
              name: 'scheme'
            })
          ],
          body: body
        });
      }
    },
    'VirtualProfile': 'SwitchProfile',
    'RuleListProfile': {
      includable: true,
      inclusive: true,
      create: function(profile) {
        var ref2;
        if (profile.profileType == null) {
          profile.profileType = 'RuleListProfile';
        }
        if (profile.format == null) {
          profile.format = (ref2 = exports.formatByType[profile.profileType]) != null ? ref2 : 'Switchy';
        }
        if (profile.defaultProfileName == null) {
          profile.defaultProfileName = 'direct';
        }
        if (profile.matchProfileName == null) {
          profile.matchProfileName = 'direct';
        }
        return profile.ruleList != null ? profile.ruleList : profile.ruleList = '';
      },
      directReferenceSet: function(profile) {
        var i, len, name, ref2, ref3, refs;
        if (profile.ruleList != null) {
          refs = (ref2 = RuleList[profile.format]) != null ? typeof ref2.directReferenceSet === "function" ? ref2.directReferenceSet(profile) : void 0 : void 0;
          if (refs) {
            return refs;
          }
        }
        refs = {};
        ref3 = [profile.matchProfileName, profile.defaultProfileName];
        for (i = 0, len = ref3.length; i < len; i++) {
          name = ref3[i];
          refs[exports.nameAsKey(name)] = name;
        }
        return refs;
      },
      replaceRef: function(profile, fromName, toName) {
        var changed;
        changed = false;
        if (profile.defaultProfileName === fromName) {
          profile.defaultProfileName = toName;
          changed = true;
        }
        if (profile.matchProfileName === fromName) {
          profile.matchProfileName = toName;
          changed = true;
        }
        return changed;
      },
      analyze: function(profile) {
        var format, formatHandler, ref2, ref3, ruleList;
        format = (ref2 = profile.format) != null ? ref2 : exports.formatByType[profile.profileType];
        formatHandler = RuleList[format];
        if (!formatHandler) {
          throw new Error("Unsupported rule list format " + format + "!");
        }
        ruleList = ((ref3 = profile.ruleList) != null ? ref3.trim() : void 0) || '';
        if (formatHandler.preprocess != null) {
          ruleList = formatHandler.preprocess(ruleList);
        }
        return formatHandler.parse(ruleList, profile.matchProfileName, profile.defaultProfileName);
      },
      match: function(profile, request) {
        var result;
        return result = exports.match(profile, request, 'SwitchProfile');
      },
      compile: function(profile) {
        return exports.compile(profile, 'SwitchProfile');
      },
      updateUrl: function(profile) {
        return profile.sourceUrl;
      },
      update: function(profile, data) {
        var base, base1, format, formatHandler, formatName, original, ref2, result;
        data = data.trim();
        original = (ref2 = profile.format) != null ? ref2 : exports.formatByType[profile.profileType];
        profile.profileType = 'RuleListProfile';
        format = original;
        if ((typeof (base = RuleList[format]).detect === "function" ? base.detect(data) : void 0) === false) {
          format = null;
        }
        for (formatName in RuleList) {
          if (!hasProp.call(RuleList, formatName)) continue;
          result = typeof (base1 = RuleList[formatName]).detect === "function" ? base1.detect(data) : void 0;
          if (result === true || (result !== false && (format == null))) {
            profile.format = format = formatName;
          }
        }
        if (format == null) {
          format = original;
        }
        formatHandler = RuleList[format];
        if (formatHandler.preprocess != null) {
          data = formatHandler.preprocess(data);
        }
        if (profile.ruleList === data) {
          return false;
        }
        profile.ruleList = data;
        return true;
      }
    },
    'SwitchyRuleListProfile': 'RuleListProfile',
    'AutoProxyRuleListProfile': 'RuleListProfile'
  }
};


},{"./conditions":6,"./rule_list":9,"./shexp_utils":10,"./utils":11,"uglify-js":undefined}],9:[function(require,module,exports){
var Buffer, Conditions, exports, strStartsWith,
  hasProp = {}.hasOwnProperty;

Buffer = require('buffer').Buffer;

Conditions = require('./conditions');

strStartsWith = function(str, prefix) {
  return str.substr(0, prefix.length) === prefix;
};

module.exports = exports = {
  'AutoProxy': {
    magicPrefix: 'W0F1dG9Qcm94',
    detect: function(text) {
      if (strStartsWith(text, exports['AutoProxy'].magicPrefix)) {
        return true;
      } else if (strStartsWith(text, '[AutoProxy')) {
        return true;
      }
    },
    preprocess: function(text) {
      if (strStartsWith(text, exports['AutoProxy'].magicPrefix)) {
        text = new Buffer(text, 'base64').toString('utf8');
      }
      return text;
    },
    parse: function(text, matchProfileName, defaultProfileName) {
      var cond, exclusive_rules, i, len, line, list, normal_rules, profile, ref, source;
      normal_rules = [];
      exclusive_rules = [];
      ref = text.split(/\n|\r/);
      for (i = 0, len = ref.length; i < len; i++) {
        line = ref[i];
        line = line.trim();
        if (line.length === 0 || line[0] === '!' || line[0] === '[') {
          continue;
        }
        source = line;
        profile = matchProfileName;
        list = normal_rules;
        if (line[0] === '@' && line[1] === '@') {
          profile = defaultProfileName;
          list = exclusive_rules;
          line = line.substring(2);
        }
        cond = line[0] === '/' ? {
          conditionType: 'UrlRegexCondition',
          pattern: line.substring(1, line.length - 1)
        } : line[0] === '|' ? line[1] === '|' ? {
          conditionType: 'HostWildcardCondition',
          pattern: "*." + line.substring(2)
        } : {
          conditionType: 'UrlWildcardCondition',
          pattern: line.substring(1) + "*"
        } : line.indexOf('*') < 0 ? {
          conditionType: 'KeywordCondition',
          pattern: line
        } : {
          conditionType: 'UrlWildcardCondition',
          pattern: 'http://*' + line + '*'
        };
        list.push({
          condition: cond,
          profileName: profile,
          source: source
        });
      }
      return exclusive_rules.concat(normal_rules);
    }
  },
  'Switchy': {
    omegaPrefix: '[SwitchyOmega Conditions',
    specialLineStart: "[;#@!",
    detect: function(text) {
      if (strStartsWith(text, exports['Switchy'].omegaPrefix)) {
        return true;
      }
    },
    parse: function(text, matchProfileName, defaultProfileName) {
      var parser, switchy;
      switchy = exports['Switchy'];
      parser = switchy.getParser(text);
      return switchy[parser](text, matchProfileName, defaultProfileName);
    },
    directReferenceSet: function(arg) {
      var defaultProfileName, i, iSpace, len, line, matchProfileName, parser, profile, ref, refs, ruleList, switchy, text;
      ruleList = arg.ruleList, matchProfileName = arg.matchProfileName, defaultProfileName = arg.defaultProfileName;
      text = ruleList.trim();
      switchy = exports['Switchy'];
      parser = switchy.getParser(text);
      if (parser !== 'parseOmega') {
        return;
      }
      if (!/(^|\n)@with\s+results?(\r|\n|$)/i.test(text)) {
        return;
      }
      refs = {};
      ref = text.split(/\n|\r/);
      for (i = 0, len = ref.length; i < len; i++) {
        line = ref[i];
        line = line.trim();
        if (switchy.specialLineStart.indexOf(line[0]) < 0) {
          iSpace = line.lastIndexOf(' +');
          if (iSpace < 0) {
            profile = defaultProfileName || 'direct';
          } else {
            profile = line.substr(iSpace + 2).trim();
          }
          refs['+' + profile] = profile;
        }
      }
      return refs;
    },
    compose: function(arg, arg1) {
      var defaultProfileName, eol, i, len, line, ref, rule, ruleList, rules, specialLineStart, useExclusive, withResult;
      rules = arg.rules, defaultProfileName = arg.defaultProfileName;
      ref = arg1 != null ? arg1 : {}, withResult = ref.withResult, useExclusive = ref.useExclusive;
      eol = '\r\n';
      ruleList = '[SwitchyOmega Conditions]' + eol;
      if (useExclusive == null) {
        useExclusive = !withResult;
      }
      if (withResult) {
        ruleList += '@with result' + eol + eol;
      } else {
        ruleList += eol;
      }
      specialLineStart = exports['Switchy'].specialLineStart + '+';
      for (i = 0, len = rules.length; i < len; i++) {
        rule = rules[i];
        line = Conditions.str(rule.condition);
        if (useExclusive && rule.profileName === defaultProfileName) {
          line = '!' + line;
        } else {
          if (specialLineStart.indexOf(line[0]) >= 0) {
            line = ': ' + line;
          }
          if (withResult) {
            line += ' +' + rule.profileName;
          }
        }
        ruleList += line + eol;
      }
      if (withResult) {
        ruleList += eol + '* +' + defaultProfileName + eol;
      }
      return ruleList;
    },
    getParser: function(text) {
      var parser, switchy;
      switchy = exports['Switchy'];
      parser = 'parseOmega';
      if (!strStartsWith(text, switchy.omegaPrefix)) {
        if (text[0] === '#' || text.indexOf('\n#') >= 0) {
          parser = 'parseLegacy';
        }
      }
      return parser;
    },
    conditionFromLegacyWildcard: function(pattern) {
      var host;
      if (pattern[0] === '@') {
        pattern = pattern.substring(1);
      } else {
        if (pattern.indexOf('://') <= 0 && pattern[0] !== '*') {
          pattern = '*' + pattern;
        }
        if (pattern[pattern.length - 1] !== '*') {
          pattern += '*';
        }
      }
      host = Conditions.urlWildcard2HostWildcard(pattern);
      if (host) {
        return {
          conditionType: 'HostWildcardCondition',
          pattern: host
        };
      } else {
        return {
          conditionType: 'UrlWildcardCondition',
          pattern: pattern
        };
      }
    },
    parseLegacy: function(text, matchProfileName, defaultProfileName) {
      var begin, cond, exclusive_rules, i, len, line, list, normal_rules, profile, ref, section, source;
      normal_rules = [];
      exclusive_rules = [];
      begin = false;
      section = 'WILDCARD';
      ref = text.split(/\n|\r/);
      for (i = 0, len = ref.length; i < len; i++) {
        line = ref[i];
        line = line.trim();
        if (line.length === 0 || line[0] === ';') {
          continue;
        }
        if (!begin) {
          if (line.toUpperCase() === '#BEGIN') {
            begin = true;
          }
          continue;
        }
        if (line.toUpperCase() === '#END') {
          break;
        }
        if (line[0] === '[' && line[line.length - 1] === ']') {
          section = line.substring(1, line.length - 1).toUpperCase();
          continue;
        }
        source = line;
        profile = matchProfileName;
        list = normal_rules;
        if (line[0] === '!') {
          profile = defaultProfileName;
          list = exclusive_rules;
          line = line.substring(1);
        }
        cond = (function() {
          switch (section) {
            case 'WILDCARD':
              return exports['Switchy'].conditionFromLegacyWildcard(line);
            case 'REGEXP':
              return {
                conditionType: 'UrlRegexCondition',
                pattern: line
              };
            default:
              return null;
          }
        })();
        if (cond != null) {
          list.push({
            condition: cond,
            profileName: profile,
            source: source
          });
        }
      }
      return exclusive_rules.concat(normal_rules);
    },
    parseOmega: function(text, matchProfileName, defaultProfileName, args) {
      var cond, directive, error, exclusiveProfile, feature, i, iSpace, includeSource, j, len, len1, line, lno, profile, ref, ref1, rule, rules, rulesWithDefaultProfile, source, strict, withResult;
      if (args == null) {
        args = {};
      }
      strict = args.strict;
      if (strict) {
        error = function(fields) {
          var err, key, value;
          err = new Error(fields.message);
          for (key in fields) {
            if (!hasProp.call(fields, key)) continue;
            value = fields[key];
            err[key] = value;
          }
          throw err;
        };
      }
      includeSource = (ref = args.source) != null ? ref : true;
      rules = [];
      rulesWithDefaultProfile = [];
      withResult = false;
      exclusiveProfile = null;
      lno = 0;
      ref1 = text.split(/\n|\r/);
      for (i = 0, len = ref1.length; i < len; i++) {
        line = ref1[i];
        lno++;
        line = line.trim();
        if (line.length === 0) {
          continue;
        }
        switch (line[0]) {
          case '[':
            continue;
          case ';':
            continue;
          case '@':
            iSpace = line.indexOf(' ');
            if (iSpace < 0) {
              iSpace = line.length;
            }
            directive = line.substr(1, iSpace - 1);
            line = line.substr(iSpace + 1).trim();
            switch (directive.toUpperCase()) {
              case 'WITH':
                feature = line.toUpperCase();
                if (feature === 'RESULT' || feature === 'RESULTS') {
                  withResult = true;
                }
            }
            continue;
        }
        source = null;
        if (strict) {
          exclusiveProfile = null;
        }
        if (line[0] === '!') {
          profile = withResult ? null : defaultProfileName;
          source = line;
          line = line.substr(1);
        } else if (withResult) {
          iSpace = line.lastIndexOf(' +');
          if (iSpace < 0) {
            if (typeof error === "function") {
              error({
                message: "Missing result profile name: " + line,
                reason: 'missingResultProfile',
                source: line,
                sourceLineNo: lno
              });
            }
            continue;
          }
          profile = line.substr(iSpace + 2).trim();
          line = line.substr(0, iSpace).trim();
          if (line === '*') {
            exclusiveProfile = profile;
          }
        } else {
          profile = matchProfileName;
        }
        cond = Conditions.fromStr(line);
        if (!cond) {
          if (typeof error === "function") {
            error({
              message: "Invalid rule: " + line,
              reason: 'invalidRule',
              source: source != null ? source : line,
              sourceLineNo: lno
            });
          }
          continue;
        }
        rule = {
          condition: cond,
          profileName: profile,
          source: includeSource ? source != null ? source : line : void 0
        };
        rules.push(rule);
        if (!profile) {
          rulesWithDefaultProfile.push(rule);
        }
      }
      if (withResult) {
        if (!exclusiveProfile) {
          if (strict) {
            if (typeof error === "function") {
              error({
                message: "Missing default rule with catch-all '*' condition",
                reason: 'noDefaultRule'
              });
            }
          }
          exclusiveProfile = defaultProfileName || 'direct';
        }
        for (j = 0, len1 = rulesWithDefaultProfile.length; j < len1; j++) {
          rule = rulesWithDefaultProfile[j];
          rule.profileName = exclusiveProfile;
        }
      }
      return rules;
    }
  }
};


},{"./conditions":6,"buffer":undefined}],10:[function(require,module,exports){
var exports;

module.exports = exports = {
  regExpMetaChars: (function() {
    var chars, i, j, ref, set;
    chars = '\\[\^$.|?*+(){}/';
    set = {};
    for (i = j = 0, ref = chars.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      set[chars.charCodeAt(i)] = true;
    }
    return set;
  })(),
  escapeSlash: function(pattern) {
    var charCodeBackSlash, charCodeSlash, code, escaped, i, j, ref, result, start;
    charCodeSlash = 47;
    charCodeBackSlash = 92;
    escaped = false;
    start = 0;
    result = '';
    for (i = j = 0, ref = pattern.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      code = pattern.charCodeAt(i);
      if (code === charCodeSlash && !escaped) {
        result += pattern.substring(start, i);
        result += '\\';
        start = i;
      }
      escaped = code === charCodeBackSlash && !escaped;
    }
    return result += pattern.substr(start);
  },
  shExp2RegExp: function(pattern, options) {
    var charCodeAsterisk, charCodeQuestion, code, end, i, j, ref, ref1, regex, start, trimAsterisk;
    trimAsterisk = (options != null ? options.trimAsterisk : void 0) || false;
    start = 0;
    end = pattern.length;
    charCodeAsterisk = 42;
    charCodeQuestion = 63;
    if (trimAsterisk) {
      while (start < end && pattern.charCodeAt(start) === charCodeAsterisk) {
        start++;
      }
      while (start < end && pattern.charCodeAt(end - 1) === charCodeAsterisk) {
        end--;
      }
      if (end - start === 1 && pattern.charCodeAt(start) === charCodeAsterisk) {
        return '';
      }
    }
    regex = '';
    if (start === 0) {
      regex += '^';
    }
    for (i = j = ref = start, ref1 = end; ref <= ref1 ? j < ref1 : j > ref1; i = ref <= ref1 ? ++j : --j) {
      code = pattern.charCodeAt(i);
      switch (code) {
        case charCodeAsterisk:
          regex += '.*';
          break;
        case charCodeQuestion:
          regex += '.';
          break;
        default:
          if (exports.regExpMetaChars[code] >= 0) {
            regex += '\\';
          }
          regex += pattern[i];
      }
    }
    if (end === pattern.length) {
      regex += '$';
    }
    return regex;
  }
};


},{}],11:[function(require,module,exports){
var AttachedCache, Revision, Url, tld;

Revision = {
  fromTime: function(time) {
    time = time ? new Date(time) : new Date();
    return time.getTime().toString(16);
  },
  compare: function(a, b) {
    if (!a && !b) {
      return 0;
    }
    if (!a) {
      return -1;
    }
    if (!b) {
      return 1;
    }
    if (a.length > b.length) {
      return 1;
    }
    if (a.length < b.length) {
      return -1;
    }
    if (a > b) {
      return 1;
    }
    if (a < b) {
      return -1;
    }
    return 0;
  }
};

exports.Revision = Revision;

AttachedCache = (function() {
  function AttachedCache(opt_prop, tag1) {
    this.tag = tag1;
    this.prop = opt_prop;
    if (typeof this.tag === 'undefined') {
      this.tag = opt_prop;
      this.prop = '_cache';
    }
  }

  AttachedCache.prototype.get = function(obj, otherwise) {
    var cache, tag, value;
    tag = this.tag(obj);
    cache = this._getCache(obj);
    if ((cache != null) && cache.tag === tag) {
      return cache.value;
    }
    value = typeof otherwise === 'function' ? otherwise() : otherwise;
    this._setCache(obj, {
      tag: tag,
      value: value
    });
    return value;
  };

  AttachedCache.prototype.drop = function(obj) {
    if (obj[this.prop] != null) {
      return obj[this.prop] = void 0;
    }
  };

  AttachedCache.prototype._getCache = function(obj) {
    return obj[this.prop];
  };

  AttachedCache.prototype._setCache = function(obj, value) {
    if (!Object.prototype.hasOwnProperty.call(obj, this.prop)) {
      Object.defineProperty(obj, this.prop, {
        writable: true
      });
    }
    return obj[this.prop] = value;
  };

  return AttachedCache;

})();

exports.AttachedCache = AttachedCache;

tld = require('tldjs');

exports.isIp = function(domain) {
  var lastCharCode;
  if (domain.indexOf(':') > 0) {
    return true;
  }
  lastCharCode = domain.charCodeAt(domain.length - 1);
  if ((48 <= lastCharCode && lastCharCode <= 57)) {
    return true;
  }
  return false;
};

exports.getBaseDomain = function(domain) {
  var ref;
  if (exports.isIp(domain)) {
    return domain;
  }
  return (ref = tld.getDomain(domain)) != null ? ref : domain;
};

exports.wildcardForDomain = function(domain) {
  if (exports.isIp(domain)) {
    return domain;
  }
  return '*.' + exports.getBaseDomain(domain);
};

Url = require('url');

exports.wildcardForUrl = function(url) {
  var domain;
  domain = Url.parse(url).hostname;
  return exports.wildcardForDomain(domain);
};


},{"tldjs":2,"url":undefined}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJDOlxcQ0ktQ29yXFxTd2l0Y2h5T21lZ2FcXG9tZWdhLXBhY1xcaW5kZXguY29mZmVlIiwibm9kZV9tb2R1bGVzL3RsZGpzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RsZGpzL2xpYi9ydWxlLmpzIiwibm9kZV9tb2R1bGVzL3RsZGpzL2xpYi90bGQuanMiLCJub2RlX21vZHVsZXMvdGxkanMvcnVsZXMuanNvbiIsIkM6XFxDSS1Db3JcXFN3aXRjaHlPbWVnYVxcb21lZ2EtcGFjXFxzcmNcXGNvbmRpdGlvbnMuY29mZmVlIiwiQzpcXENJLUNvclxcU3dpdGNoeU9tZWdhXFxvbWVnYS1wYWNcXHNyY1xccGFjX2dlbmVyYXRvci5jb2ZmZWUiLCJDOlxcQ0ktQ29yXFxTd2l0Y2h5T21lZ2FcXG9tZWdhLXBhY1xcc3JjXFxwcm9maWxlcy5jb2ZmZWUiLCJDOlxcQ0ktQ29yXFxTd2l0Y2h5T21lZ2FcXG9tZWdhLXBhY1xcc3JjXFxydWxlX2xpc3QuY29mZmVlIiwiQzpcXENJLUNvclxcU3dpdGNoeU9tZWdhXFxvbWVnYS1wYWNcXHNyY1xcc2hleHBfdXRpbHMuY29mZmVlIiwiQzpcXENJLUNvclxcU3dpdGNoeU9tZWdhXFxvbWVnYS1wYWNcXHNyY1xcdXRpbHMuY29mZmVlIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUEsSUFBQTs7QUFBQSxNQUFNLENBQUMsT0FBUCxHQUNFO0VBQUEsVUFBQSxFQUFZLE9BQUEsQ0FBUSxrQkFBUixDQUFaO0VBQ0EsWUFBQSxFQUFjLE9BQUEsQ0FBUSxxQkFBUixDQURkO0VBRUEsUUFBQSxFQUFVLE9BQUEsQ0FBUSxnQkFBUixDQUZWO0VBR0EsUUFBQSxFQUFVLE9BQUEsQ0FBUSxpQkFBUixDQUhWO0VBSUEsVUFBQSxFQUFZLE9BQUEsQ0FBUSxtQkFBUixDQUpaOzs7QUFNRjtBQUFBLEtBQUEsV0FBQTs7RUFDRSxNQUFNLENBQUMsT0FBUSxDQUFBLElBQUEsQ0FBZixHQUF1QjtBQUR6Qjs7OztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QUFBLENBQVEsS0FBUjs7QUFDTixPQUFPLENBQUMsY0FBUixHQUF5QixTQUFDLEdBQUQ7QUFDdkIsTUFBQTtFQUFBLE1BQUEsR0FBUyxHQUFHLENBQUMsS0FBSixDQUFVLEdBQVYsQ0FBYyxDQUFDO0FBQ3hCLFNBQU8sT0FBTyxDQUFDLGlCQUFSLENBQTBCLE1BQTFCO0FBRmdCIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIm1vZHVsZS5leHBvcnRzID1cbiAgQ29uZGl0aW9uczogcmVxdWlyZSgnLi9zcmMvY29uZGl0aW9ucycpXG4gIFBhY0dlbmVyYXRvcjogcmVxdWlyZSgnLi9zcmMvcGFjX2dlbmVyYXRvcicpXG4gIFByb2ZpbGVzOiByZXF1aXJlKCcuL3NyYy9wcm9maWxlcycpXG4gIFJ1bGVMaXN0OiByZXF1aXJlKCcuL3NyYy9ydWxlX2xpc3QnKVxuICBTaGV4cFV0aWxzOiByZXF1aXJlKCcuL3NyYy9zaGV4cF91dGlscycpXG5cbmZvciBuYW1lLCB2YWx1ZSBvZiByZXF1aXJlKCcuL3NyYy91dGlscy5jb2ZmZWUnKVxuICBtb2R1bGUuZXhwb3J0c1tuYW1lXSA9IHZhbHVlXG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIHRsZCA9IHJlcXVpcmUoJy4vbGliL3RsZC5qcycpLmluaXQoKTtcbnRsZC5ydWxlcyA9IHJlcXVpcmUoJy4vcnVsZXMuanNvbicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHRsZDtcbiIsIlwidXNlIHN0cmljdFwiO1xuXG5mdW5jdGlvbiBSdWxlIChkYXRhKXtcbiAgZGF0YSA9IGRhdGEgfHwge307XG5cbiAgdGhpcy5leGNlcHRpb24gPSBkYXRhLmV4Y2VwdGlvbiB8fCBmYWxzZTtcbiAgdGhpcy5maXJzdExldmVsID0gZGF0YS5maXJzdExldmVsIHx8ICcnO1xuICB0aGlzLnNlY29uZExldmVsID0gZGF0YS5zZWNvbmRMZXZlbCB8fCBudWxsO1xuICB0aGlzLmlzSG9zdCA9IGRhdGEuaXNIb3N0IHx8IGZhbHNlO1xuICB0aGlzLnNvdXJjZSA9IGRhdGEuc291cmNlIHx8ICcnO1xuICB0aGlzLndpbGRjYXJkID0gZGF0YS53aWxkY2FyZCB8fCBmYWxzZTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBUTEQgb3IgU0xEIChTZWNvbmQgTGV2ZWwgRG9tYWluKSBwYXR0ZXJuIGZvciBhIHJ1bGVcbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblJ1bGUucHJvdG90eXBlLmdldE5vcm1hbFhsZCA9IGZ1bmN0aW9uIGdldE5vcm1hbFhsZCgpe1xuICByZXR1cm4gKHRoaXMuc2Vjb25kTGV2ZWwgPyAnLicgKyB0aGlzLnNlY29uZExldmVsIDogJycpICsgJy4nICsgdGhpcy5maXJzdExldmVsO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgcGF0dGVybiBzdWl0YWJsZSBmb3Igbm9ybWFsIHJ1bGVcbiAqIE1vc3RseSBmb3IgaW50ZXJuYWwgdXNlXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG5SdWxlLnByb3RvdHlwZS5nZXROb3JtYWxQYXR0ZXJuID0gZnVuY3Rpb24gZ2V0Tm9ybWFsUGF0dGVybigpe1xuICByZXR1cm4gKHRoaXMuc2Vjb25kTGV2ZWwgPyAnXFxcXC4nICsgdGhpcy5zZWNvbmRMZXZlbCA6ICcnKSArICdcXFxcLicgKyB0aGlzLmZpcnN0TGV2ZWw7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBwYXR0ZXJuIHN1aXRhYmxlIGZvciB3aWxkY2FyZCBydWxlXG4gKiBNb3N0bHkgZm9yIGludGVybmFsIHVzZVxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuUnVsZS5wcm90b3R5cGUuZ2V0V2lsZGNhcmRQYXR0ZXJuID0gZnVuY3Rpb24gZ2V0V2lsZGNhcmRQYXR0ZXJuKCl7XG4gIHJldHVybiAnXFxcXC5bXlxcXFwuXSsnICsgdGhpcy5nZXROb3JtYWxYbGQoKS5yZXBsYWNlKC9cXC4vZywgJ1xcXFwuJyk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBwYXR0ZXJuIHN1aXRhYmxlIGZvciBleGNlcHRpb24gcnVsZVxuICogTW9zdGx5IGZvciBpbnRlcm5hbCB1c2VcbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cblJ1bGUucHJvdG90eXBlLmdldEV4Y2VwdGlvblBhdHRlcm4gPSBmdW5jdGlvbiBnZXRFeGNlcHRpb25QYXR0ZXJuKCl7XG4gIHJldHVybiAodGhpcy5zZWNvbmRMZXZlbCB8fCAnJykgKyAnXFxcXC4nICsgdGhpcy5maXJzdExldmVsO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBiZXN0IHBhdHRlcm4gcG9zc2libGUgZm9yIGEgcnVsZVxuICogWW91IGp1c3QgaGF2ZSB0byB0ZXN0IGEgdmFsdWUgYWdhaW5zdCBpdCB0byBjaGVjayBvciBleHRyYWN0IGEgaG9zdG5hbWVcbiAqXG4gKiBAYXBpXG4gKiBAcGFyYW0ge3N0cmluZ3x1bmRlZmluZWR9IGJlZm9yZVxuICogQHBhcmFtIHtzdHJpbmd8dW5kZWZpbmVkfSBhZnRlclxuICogQHJldHVybiB7U3RyaW5nfSBBIHBhdHRlcm4gdG8gY2hhbGxlbmdlIHNvbWUgc3RyaW5nIGFnYWluc3RcbiAqL1xuUnVsZS5wcm90b3R5cGUuZ2V0UGF0dGVybiA9IGZ1bmN0aW9uIGdldFBhdHRlcm4oYmVmb3JlLCBhZnRlcil7XG4gIHZhciBwYXR0ZXJuID0gJyc7XG5cbiAgYmVmb3JlID0gKGJlZm9yZSA9PT0gdW5kZWZpbmVkKSA/ICcoJzogYmVmb3JlKycnO1xuICBhZnRlciA9IChhZnRlciA9PT0gdW5kZWZpbmVkKSA/ICcpJCc6IGFmdGVyKycnO1xuXG4gIGlmICh0aGlzLmV4Y2VwdGlvbiA9PT0gdHJ1ZSl7XG4gICAgcGF0dGVybiA9IHRoaXMuZ2V0RXhjZXB0aW9uUGF0dGVybigpO1xuICB9XG4gIGVsc2UgaWYgKHRoaXMuaXNIb3N0ID09PSB0cnVlKSB7XG4gICAgcGF0dGVybiA9IHRoaXMuZmlyc3RMZXZlbDtcbiAgfVxuICBlbHNle1xuICAgIHBhdHRlcm4gPSAnW15cXFxcLl0rJyArICh0aGlzLndpbGRjYXJkID8gdGhpcy5nZXRXaWxkY2FyZFBhdHRlcm4oKSA6IHRoaXMuZ2V0Tm9ybWFsUGF0dGVybigpKTtcbiAgfVxuXG4gIHJldHVybiBiZWZvcmUgKyBwYXR0ZXJuICsgYWZ0ZXI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFJ1bGU7XG4iLCJcInVzZSBzdHJpY3RcIjtcblxudmFyIFJ1bGUgPSByZXF1aXJlKCcuL3J1bGUuanMnKTtcbnZhciBVUkwgPSByZXF1aXJlKCd1cmwnKTtcblxuLyoqXG4gKiB0bGQgbGlicmFyeVxuICpcbiAqIFVzZWFibGUgbWV0aG9kcyBhcmUgdGhvc2UgZG9jdW1lbnRlZCB3aXRoIGFuIEBhcGkgaW4gSlNEb2NcbiAqIFNlZSBSRUFETUUubWQgZm9yIG1vcmUgZXhwbGFuYXRpb25zIG9uIGhvdyB0byB1c2UgdGhpcyBzdHVmZi5cbiAqL1xuZnVuY3Rpb24gdGxkICgpIHtcbiAgLyoganNoaW50IHZhbGlkdGhpczogdHJ1ZSAqL1xuICB0aGlzLnZhbGlkSG9zdHMgPSBbXTtcbiAgdGhpcy5ydWxlcyA9IFtdO1xufVxuXG50bGQuaW5pdCA9IGZ1bmN0aW9uIGluaXQgKCkge1xuICByZXR1cm4gbmV3IHRsZCgpO1xufTtcblxuZnVuY3Rpb24gdHJpbSh2YWx1ZSkge1xuICByZXR1cm4gU3RyaW5nKHZhbHVlKS5yZXBsYWNlKC8oXlxccyt8XFxzKyQpL2csICcnKTtcbn1cblxuLy8gQXJyYXkuc29tZSgpIHBvbHlmaWxsIGZvciBJRThcbmZ1bmN0aW9uIF9zb21lRnVuY3Rpb24odmFsdWUsIGZ1biAvKiwgdGhpc0FyZyAqLykge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwIHx8IHZhbHVlID09PSBudWxsKVxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuXG4gICAgdmFyIHQgPSBPYmplY3QodmFsdWUpO1xuICAgIHZhciBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICBpZiAodHlwZW9mIGZ1biAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuICAgIH1cblxuICAgIHZhciB0aGlzQXJnID0gYXJndW1lbnRzLmxlbmd0aCA+PSAzID8gYXJndW1lbnRzWzJdIDogdm9pZCAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAge1xuICAgICAgaWYgKGkgaW4gdCAmJiBmdW4uY2FsbCh0aGlzQXJnLCB0W2ldLCBpLCB0KSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBBcnJheS5tYXAgcG9seWZpbGwgZm9yIElFOFxuZnVuY3Rpb24gX21hcEZ1bmN0aW9uKHRoaXNWYWwsIGZ1biAvKiwgdGhpc0FyZyAqLykge1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBpZiAodGhpc1ZhbCA9PT0gdm9pZCAwIHx8IHRoaXNWYWwgPT09IG51bGwpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuXG4gIHZhciB0ID0gT2JqZWN0KHRoaXNWYWwpO1xuICB2YXIgbGVuID0gdC5sZW5ndGggPj4+IDA7XG4gIGlmICh0eXBlb2YgZnVuICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gIH1cblxuICB2YXIgcmVzID0gbmV3IEFycmF5KGxlbik7XG4gIHZhciB0aGlzQXJnID0gYXJndW1lbnRzLmxlbmd0aCA+PSAzID8gYXJndW1lbnRzWzJdIDogdm9pZCAwO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gIHtcbiAgICAvLyBOT1RFOiBBYnNvbHV0ZSBjb3JyZWN0bmVzcyB3b3VsZCBkZW1hbmQgT2JqZWN0LmRlZmluZVByb3BlcnR5XG4gICAgLy8gICAgICAgYmUgdXNlZC4gIEJ1dCB0aGlzIG1ldGhvZCBpcyBmYWlybHkgbmV3LCBhbmQgZmFpbHVyZSBpc1xuICAgIC8vICAgICAgIHBvc3NpYmxlIG9ubHkgaWYgT2JqZWN0LnByb3RvdHlwZSBvciBBcnJheS5wcm90b3R5cGVcbiAgICAvLyAgICAgICBoYXMgYSBwcm9wZXJ0eSB8aXwgKHZlcnkgdW5saWtlbHkpLCBzbyB1c2UgYSBsZXNzY29ycmVjdFxuICAgIC8vICAgICAgIGJ1dCBtb3JlIHBvcnRhYmxlIGFsdGVybmF0aXZlLlxuICAgIGlmIChpIGluIHQpXG4gICAgICByZXNbaV0gPSBmdW4uY2FsbCh0aGlzQXJnLCB0W2ldLCBpLCB0KTtcbiAgfVxuXG4gIHJldHVybiByZXM7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIGJlc3QgcnVsZSBmb3IgYSBnaXZlbiBob3N0IGJhc2VkIG9uIGNhbmRpZGF0ZXNcbiAqXG4gKiBAc3RhdGljXG4gKiBAcGFyYW0gaG9zdCB7U3RyaW5nfSBIb3N0bmFtZSB0byBjaGVjayBydWxlcyBhZ2FpbnN0XG4gKiBAcGFyYW0gcnVsZXMge0FycmF5fSBMaXN0IG9mIHJ1bGVzIHVzZWQgdG8gd29yayBvblxuICogQHJldHVybiB7T2JqZWN0fSBDYW5kaWRhdGUgb2JqZWN0LCB3aXRoIGEgbm9ybWFsIGFuZCBleGNlcHRpb24gc3RhdGVcbiAqL1xudGxkLmdldENhbmRpZGF0ZVJ1bGUgPSBmdW5jdGlvbiBnZXRDYW5kaWRhdGVSdWxlIChob3N0LCBydWxlcywgb3B0aW9ucykge1xuICB2YXIgcnVsZSA9IHsnbm9ybWFsJzogbnVsbCwgJ2V4Y2VwdGlvbic6IG51bGx9O1xuXG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHsgbGF6eTogZmFsc2UgfTtcblxuICBfc29tZUZ1bmN0aW9uKHJ1bGVzLCBmdW5jdGlvbiAocikge1xuICAgIHZhciBwYXR0ZXJuO1xuXG4gICAgLy8gc2xkIG1hdGNoaW5nIG9yIHZhbGlkSG9zdD8gZXNjYXBlIHRoZSBsb29wIGltbWVkaWF0ZWx5IChleGNlcHQgaWYgaXQncyBhbiBleGNlcHRpb24pXG4gICAgaWYgKCcuJyArIGhvc3QgPT09IHIuZ2V0Tm9ybWFsWGxkKCkpIHtcbiAgICAgIGlmIChvcHRpb25zLmxhenkgfHwgci5leGNlcHRpb24gfHwgci5pc0hvc3QpIHtcbiAgICAgICAgcnVsZS5ub3JtYWwgPSByO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBvdGhlcndpc2UgY2hlY2sgYXMgYSBjb21wbGV0ZSBob3N0XG4gICAgLy8gaWYgaXQncyBhbiBleGNlcHRpb24sIHdlIHdhbnQgdG8gbG9vcCBhIGJpdCBtb3JlIHRvIGEgbm9ybWFsIHJ1bGVcbiAgICBwYXR0ZXJuID0gJy4rJyArIHIuZ2V0Tm9ybWFsUGF0dGVybigpICsgJyQnO1xuXG4gICAgaWYgKChuZXcgUmVnRXhwKHBhdHRlcm4pKS50ZXN0KGhvc3QpKSB7XG4gICAgICBydWxlW3IuZXhjZXB0aW9uID8gJ2V4Y2VwdGlvbicgOiAnbm9ybWFsJ10gPSByO1xuICAgICAgcmV0dXJuICFyLmV4Y2VwdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0pO1xuXG4gIC8vIGZhdm91cmluZyB0aGUgZXhjZXB0aW9uIGlmIGVuY291bnRlcmVkXG4gIC8vIHByZXZpb3VzbHkgd2Ugd2VyZSBjb3B5LWFsdGVyaW5nIGEgcnVsZSwgY3JlYXRpbmcgaW5jb25zaXN0ZW50IHJlc3VsdHMgYmFzZWQgb24gcnVsZSBvcmRlciBvcmRlclxuICAvLyBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9vbmNsZXRvbS90bGQuanMvcHVsbC8zNVxuICBpZiAocnVsZS5ub3JtYWwgJiYgcnVsZS5leGNlcHRpb24pIHtcbiAgICByZXR1cm4gcnVsZS5leGNlcHRpb247XG4gIH1cblxuICByZXR1cm4gcnVsZS5ub3JtYWw7XG59O1xuXG4vKipcbiAqIFJldHJpZXZlIGEgc3Vic2V0IG9mIHJ1bGVzIGZvciBhIFRvcC1MZXZlbC1Eb21haW4gc3RyaW5nXG4gKlxuICogQHBhcmFtIHRsZCB7U3RyaW5nfSBUb3AtTGV2ZWwtRG9tYWluIHN0cmluZ1xuICogQHJldHVybiB7QXJyYXl9IFJ1bGVzIHN1YnNldFxuICovXG50bGQucHJvdG90eXBlLmdldFJ1bGVzRm9yVGxkID0gZnVuY3Rpb24gZ2V0UnVsZXNGb3JUbGQgKHRsZCwgZGVmYXVsdF9ydWxlKSB7XG4gIHZhciBleGNlcHRpb24gPSAnISc7XG4gIHZhciB3aWxkY2FyZCA9ICcqJztcbiAgdmFyIGFwcGVuZF90bGRfcnVsZSA9IHRydWU7XG4gIHZhciBydWxlcyA9IHRoaXMucnVsZXNbdGxkXTtcblxuICAvLyBBbHJlYWR5IHBhcnNlZFxuICAvLyBBcnJheS5pc0FycmF5IHBvbHlmaWxsIGZvciBJRThcbiAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChydWxlcykgID09PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgcmV0dXJuIHJ1bGVzO1xuICB9XG5cbiAgLy8gTm90aGluZyBmb3VuZCwgYXBwbHkgc29tZSBkZWZhdWx0IHZhbHVlXG4gIGlmIChydWxlcyA9PT0gdm9pZCAwKSB7XG4gICAgcmV0dXJuIGRlZmF1bHRfcnVsZSA/IFsgZGVmYXVsdF9ydWxlIF0gOiBbXTtcbiAgfVxuXG4gIC8vIFBhcnNpbmcgbmVlZGVkXG4gIHJ1bGVzID0gX21hcEZ1bmN0aW9uKHJ1bGVzLnNwbGl0KCd8JyksIGZ1bmN0aW9uIHRyYW5zZm9ybUFzUnVsZSAoc2xkKSB7XG4gICAgdmFyIGZpcnN0X2JpdCA9IHNsZFswXTtcblxuICAgIGlmIChmaXJzdF9iaXQgPT09IGV4Y2VwdGlvbiB8fCBmaXJzdF9iaXQgPT09IHdpbGRjYXJkKSB7XG4gICAgICBzbGQgPSBzbGQuc2xpY2UoMSk7XG5cbiAgICAgIGlmICghc2xkKSB7XG4gICAgICAgIGFwcGVuZF90bGRfcnVsZSA9IGZhbHNlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgUnVsZSh7XG4gICAgICBcImZpcnN0TGV2ZWxcIjogIHRsZCxcbiAgICAgIFwic2Vjb25kTGV2ZWxcIjogc2xkLFxuICAgICAgXCJleGNlcHRpb25cIjogICBmaXJzdF9iaXQgPT09IGV4Y2VwdGlvbixcbiAgICAgIFwid2lsZGNhcmRcIjogICAgZmlyc3RfYml0ID09PSB3aWxkY2FyZFxuICAgIH0pO1xuICB9KTtcblxuICAvLyBBbHdheXMgcHJlcGVuZCB0byBtYWtlIGl0IHRoZSBsYXRlc3QgcnVsZSB0byBiZSBhcHBsaWVkXG4gIGlmIChhcHBlbmRfdGxkX3J1bGUpIHtcbiAgICBydWxlcy51bnNoaWZ0KG5ldyBSdWxlKHtcbiAgICAgIFwiZmlyc3RMZXZlbFwiOiB0bGRcbiAgICB9KSk7XG4gIH1cblxuICB0aGlzLnJ1bGVzW3RsZF0gPSBydWxlcy5yZXZlcnNlKCk7XG5cbiAgcmV0dXJuIHJ1bGVzO1xufTtcblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIFRMRCBleGlzdHMgZm9yIGEgZ2l2ZW4gaG9zdFxuICpcbiAqIEBhcGlcbiAqIEBwYXJhbSB7c3RyaW5nfSBob3N0XG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG50bGQucHJvdG90eXBlLnRsZEV4aXN0cyA9IGZ1bmN0aW9uIHRsZEV4aXN0cyhob3N0KXtcbiAgdmFyIGhvc3RUbGQ7XG5cbiAgaG9zdCA9IHRsZC5jbGVhbkhvc3RWYWx1ZShob3N0KTtcblxuICAvLyBFYXN5IGNhc2UsIGl0J3MgYSBUTERcbiAgaWYgKHRoaXMucnVsZXNbaG9zdF0pe1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgLy8gUG9wcGluZyBvbmx5IHRoZSBUTEQgb2YgdGhlIGhvc3RuYW1lXG4gIGhvc3RUbGQgPSB0bGQuZXh0cmFjdFRsZEZyb21Ib3N0KGhvc3QpO1xuXG4gIHJldHVybiB0aGlzLnJ1bGVzW2hvc3RUbGRdICE9PSB1bmRlZmluZWQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIHB1YmxpYyBzdWZmaXggKGluY2x1ZGluZyBleGFjdCBtYXRjaGVzKVxuICpcbiAqIEBhcGlcbiAqIEBzaW5jZSAxLjVcbiAqIEBwYXJhbSB7c3RyaW5nfSBob3N0XG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbnRsZC5wcm90b3R5cGUuZ2V0UHVibGljU3VmZml4ID0gZnVuY3Rpb24gZ2V0UHVibGljU3VmZml4KGhvc3QpIHtcbiAgdmFyIGhvc3RUbGQsIHJ1bGVzLCBydWxlO1xuXG4gIGlmIChob3N0IGluIHRoaXMucnVsZXMpe1xuXHQgIHJldHVybiBob3N0O1xuICB9XG5cbiAgaG9zdCA9IHRsZC5jbGVhbkhvc3RWYWx1ZShob3N0KTtcbiAgaG9zdFRsZCA9IHRsZC5leHRyYWN0VGxkRnJvbUhvc3QoaG9zdCk7XG4gIHJ1bGVzID0gdGhpcy5nZXRSdWxlc0ZvclRsZChob3N0VGxkKTtcbiAgcnVsZSA9IHRsZC5nZXRDYW5kaWRhdGVSdWxlKGhvc3QsIHJ1bGVzLCB7IGxhenk6IHRydWUgfSk7XG5cbiAgaWYgKHJ1bGUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiBydWxlLmdldE5vcm1hbFhsZCgpLnNsaWNlKDEpO1xufTtcblxuLyoqXG4gKiBEZXRlY3RzIHRoZSBkb21haW4gYmFzZWQgb24gcnVsZXMgYW5kIHVwb24gYW5kIGEgaG9zdCBzdHJpbmdcbiAqXG4gKiBAYXBpXG4gKiBAcGFyYW0ge3N0cmluZ30gaG9zdFxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG50bGQucHJvdG90eXBlLmdldERvbWFpbiA9IGZ1bmN0aW9uIGdldERvbWFpbiAoaG9zdCkge1xuICB2YXIgZG9tYWluID0gbnVsbCwgaG9zdFRsZCwgcnVsZXMsIHJ1bGU7XG5cbiAgaWYgKHRoaXMuaXNWYWxpZChob3N0KSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGhvc3QgPSB0bGQuY2xlYW5Ib3N0VmFsdWUoaG9zdCk7XG4gIGhvc3RUbGQgPSB0bGQuZXh0cmFjdFRsZEZyb21Ib3N0KGhvc3QpO1xuICBydWxlcyA9IHRoaXMuZ2V0UnVsZXNGb3JUbGQoaG9zdFRsZCwgbmV3IFJ1bGUoe1wiZmlyc3RMZXZlbFwiOiBob3N0VGxkLCBcImlzSG9zdFwiOiB0aGlzLnZhbGlkSG9zdHMuaW5kZXhPZihob3N0VGxkKSAhPT0gLTF9KSk7XG4gIHJ1bGUgPSB0bGQuZ2V0Q2FuZGlkYXRlUnVsZShob3N0LCBydWxlcyk7XG5cbiAgaWYgKHJ1bGUgPT09IG51bGwpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGhvc3QucmVwbGFjZShuZXcgUmVnRXhwKHJ1bGUuZ2V0UGF0dGVybigpKSwgZnVuY3Rpb24gKG0sIGQpIHtcbiAgICBkb21haW4gPSBkO1xuICB9KTtcblxuICByZXR1cm4gZG9tYWluO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBzdWJkb21haW4gb2YgYSBob3N0IHN0cmluZ1xuICpcbiAqIEBhcGlcbiAqIEBwYXJhbSB7c3RyaW5nfSBob3N0XG4gKiBAcmV0dXJuIHtzdHJpbmd8bnVsbH0gYSBzdWJkb21haW4gc3RyaW5nIGlmIGFueSwgYmxhbmsgc3RyaW5nIGlmIHN1YmRvbWFpbiBpcyBlbXB0eSwgb3RoZXJ3aXNlIG51bGxcbiAqL1xudGxkLnByb3RvdHlwZS5nZXRTdWJkb21haW4gPSBmdW5jdGlvbiBnZXRTdWJkb21haW4oaG9zdCl7XG4gIHZhciBkb21haW4sIHIsIHN1YmRvbWFpbjtcblxuICBob3N0ID0gdGxkLmNsZWFuSG9zdFZhbHVlKGhvc3QpO1xuICBkb21haW4gPSB0aGlzLmdldERvbWFpbihob3N0KTtcblxuICAvLyBObyBkb21haW4gZm91bmQ/IEp1c3QgYWJvcnQsIGFib3J0IVxuICBpZiAoZG9tYWluID09PSBudWxsKXtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHIgPSAnXFxcXC4/JysgdGxkLmVzY2FwZVJlZ0V4cChkb21haW4pKyckJztcbiAgc3ViZG9tYWluID0gaG9zdC5yZXBsYWNlKG5ldyBSZWdFeHAociwgJ2knKSwgJycpO1xuXG4gIHJldHVybiBzdWJkb21haW47XG59O1xuXG4vKipcbiAqIENoZWNraW5nIGlmIGEgaG9zdCBzdHJpbmcgaXMgdmFsaWRcbiAqIEl0J3MgdXN1YWxseSBhIHByZWxpbWluYXJ5IGNoZWNrIGJlZm9yZSB0cnlpbmcgdG8gdXNlIGdldERvbWFpbiBvciBhbnl0aGluZyBlbHNlXG4gKlxuICogQmV3YXJlOiBpdCBkb2VzIG5vdCBjaGVjayBpZiB0aGUgVExEIGV4aXN0cy5cbiAqXG4gKiBAYXBpXG4gKiBAcGFyYW0gaG9zdCB7U3RyaW5nfVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xudGxkLnByb3RvdHlwZS5pc1ZhbGlkID0gZnVuY3Rpb24gaXNWYWxpZCAoaG9zdCkge1xuICByZXR1cm4gdHlwZW9mIGhvc3QgPT09ICdzdHJpbmcnICYmICh0aGlzLnZhbGlkSG9zdHMuaW5kZXhPZihob3N0KSAhPT0gLTEgfHwgKGhvc3QuaW5kZXhPZignLicpICE9PSAtMSAmJiBob3N0WzBdICE9PSAnLicpKTtcbn07XG5cbi8qKlxuICogVXRpbGl0eSB0byBjbGVhbnVwIHRoZSBiYXNlIGhvc3QgdmFsdWUuIEFsc28gcmVtb3ZlcyB1cmwgZnJhZ21lbnRzLlxuICpcbiAqIFdvcmtzIGZvcjpcbiAqIC0gaG9zdG5hbWVcbiAqIC0gLy9ob3N0bmFtZVxuICogLSBzY2hlbWU6Ly9ob3N0bmFtZVxuICogLSBzY2hlbWUrc2NoZW1lOi8vaG9zdG5hbWVcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmFsdWVcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuXG4vLyBzY2hlbWUgICAgICA9IEFMUEhBICooIEFMUEhBIC8gRElHSVQgLyBcIitcIiAvIFwiLVwiIC8gXCIuXCIgKVxudmFyIGhhc1ByZWZpeFJFID0gL14oKFthLXpdW2EtejAtOSsuLV0qKT86KT9cXC9cXC8vO1xudmFyIGludmFsaWRIb3N0bmFtZUNoYXJzID0gL1teQS1aYS16MC05Li1dLztcblxudGxkLmNsZWFuSG9zdFZhbHVlID0gZnVuY3Rpb24gY2xlYW5Ib3N0VmFsdWUodmFsdWUpe1xuICB2YWx1ZSA9IHRyaW0odmFsdWUpLnRvTG93ZXJDYXNlKCk7XG5cbiAgdmFyIHBhcnRzID0gVVJMLnBhcnNlKGhhc1ByZWZpeFJFLnRlc3QodmFsdWUpID8gdmFsdWUgOiAnLy8nICsgdmFsdWUsIG51bGwsIHRydWUpO1xuXG4gIGlmIChwYXJ0cy5ob3N0bmFtZSAmJiAhaW52YWxpZEhvc3RuYW1lQ2hhcnMudGVzdChwYXJ0cy5ob3N0bmFtZSkpIHsgcmV0dXJuIHBhcnRzLmhvc3RuYW1lOyB9XG4gIGlmICghaW52YWxpZEhvc3RuYW1lQ2hhcnMudGVzdCh2YWx1ZSkpIHsgcmV0dXJuIHZhbHVlOyB9XG4gIHJldHVybiAnJztcbn07XG5cbi8qKlxuICogVXRpbGl0eSB0byBleHRyYWN0IHRoZSBUTEQgZnJvbSBhIGhvc3Qgc3RyaW5nXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IGhvc3RcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xudGxkLmV4dHJhY3RUbGRGcm9tSG9zdCA9IGZ1bmN0aW9uIGV4dHJhY3RUbGRGcm9tSG9zdChob3N0KXtcbiAgcmV0dXJuIGhvc3Quc3BsaXQoJy4nKS5wb3AoKTtcbn07XG5cbi8qKlxuICogRXNjYXBlcyBSZWdFeHAgc3BlY2lmaWMgY2hhcnMuXG4gKlxuICogQHNpbmNlIDEuMy4xXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9vbmNsZXRvbS90bGQuanMvcHVsbC8zM1xuICogQHBhcmFtIHtTdHJpbmd8TWl4ZWR9IHNcbiAqIEByZXR1cm5zIHtzdHJpbmd9IEVzY2FwZWQgc3RyaW5nIGZvciBhIHNhZmUgdXNlIGluIGEgYG5ldyBSZWdFeHBgIGV4cHJlc3Npb25cbiAqL1xudGxkLmVzY2FwZVJlZ0V4cCA9IGZ1bmN0aW9uIGVzY2FwZVJlZ0V4cChzKSB7XG4gIHJldHVybiBTdHJpbmcocykucmVwbGFjZSgvKFsuKis/Xj0hOiR7fSgpfFxcW1xcXVxcL1xcXFxdKS9nLCBcIlxcXFwkMVwiKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdGxkO1xuIiwibW9kdWxlLmV4cG9ydHM9e1wiYWNcIjpcImNvbXxlZHV8Z292fG5ldHxtaWx8b3JnXCIsXCJhZFwiOlwibm9tXCIsXCJhZVwiOlwiY298bmV0fG9yZ3xzY2h8YWN8Z292fG1pbHxibG9nc3BvdFwiLFwiYWVyb1wiOlwiYWNjaWRlbnQtaW52ZXN0aWdhdGlvbnxhY2NpZGVudC1wcmV2ZW50aW9ufGFlcm9iYXRpY3xhZXJvY2x1YnxhZXJvZHJvbWV8YWdlbnRzfGFpcmNyYWZ0fGFpcmxpbmV8YWlycG9ydHxhaXItc3VydmVpbGxhbmNlfGFpcnRyYWZmaWN8YWlyLXRyYWZmaWMtY29udHJvbHxhbWJ1bGFuY2V8YW11c2VtZW50fGFzc29jaWF0aW9ufGF1dGhvcnxiYWxsb29uaW5nfGJyb2tlcnxjYWF8Y2FyZ298Y2F0ZXJpbmd8Y2VydGlmaWNhdGlvbnxjaGFtcGlvbnNoaXB8Y2hhcnRlcnxjaXZpbGF2aWF0aW9ufGNsdWJ8Y29uZmVyZW5jZXxjb25zdWx0YW50fGNvbnN1bHRpbmd8Y29udHJvbHxjb3VuY2lsfGNyZXd8ZGVzaWdufGRnY2F8ZWR1Y2F0b3J8ZW1lcmdlbmN5fGVuZ2luZXxlbmdpbmVlcnxlbnRlcnRhaW5tZW50fGVxdWlwbWVudHxleGNoYW5nZXxleHByZXNzfGZlZGVyYXRpb258ZmxpZ2h0fGZyZWlnaHR8ZnVlbHxnbGlkaW5nfGdvdmVybm1lbnR8Z3JvdW5kaGFuZGxpbmd8Z3JvdXB8aGFuZ2dsaWRpbmd8aG9tZWJ1aWx0fGluc3VyYW5jZXxqb3VybmFsfGpvdXJuYWxpc3R8bGVhc2luZ3xsb2dpc3RpY3N8bWFnYXppbmV8bWFpbnRlbmFuY2V8bWFya2V0cGxhY2V8bWVkaWF8bWljcm9saWdodHxtb2RlbGxpbmd8bmF2aWdhdGlvbnxwYXJhY2h1dGluZ3xwYXJhZ2xpZGluZ3xwYXNzZW5nZXItYXNzb2NpYXRpb258cGlsb3R8cHJlc3N8cHJvZHVjdGlvbnxyZWNyZWF0aW9ufHJlcGJvZHl8cmVzfHJlc2VhcmNofHJvdG9yY3JhZnR8c2FmZXR5fHNjaWVudGlzdHxzZXJ2aWNlc3xzaG93fHNreWRpdmluZ3xzb2Z0d2FyZXxzdHVkZW50fHRheGl8dHJhZGVyfHRyYWRpbmd8dHJhaW5lcnx1bmlvbnx3b3JraW5nZ3JvdXB8d29ya3NcIixcImFmXCI6XCJnb3Z8Y29tfG9yZ3xuZXR8ZWR1XCIsXCJhZ1wiOlwiY29tfG9yZ3xuZXR8Y298bm9tXCIsXCJhaVwiOlwib2ZmfGNvbXxuZXR8b3JnXCIsXCJhbFwiOlwiY29tfGVkdXxnb3Z8bWlsfG5ldHxvcmd8YmxvZ3Nwb3RcIixcImFtXCI6XCJibG9nc3BvdFwiLFwiYW9cIjpcImVkfGd2fG9nfGNvfHBifGl0XCIsXCJhcVwiOlwiXCIsXCJhclwiOlwiY29tfGVkdXxnb2J8Z292fGludHxtaWx8bmV0fG9yZ3x0dXJ8YmxvZ3Nwb3QuY29tXCIsXCJhcnBhXCI6XCJlMTY0fGluLWFkZHJ8aXA2fGlyaXN8dXJpfHVyblwiLFwiYXNcIjpcImdvdlwiLFwiYXNpYVwiOlwiXCIsXCJhdFwiOlwiYWN8Y298Z3Z8b3J8YmxvZ3Nwb3QuY298Yml6fGluZm98cHJpdlwiLFwiYXVcIjpcImNvbXxuZXR8b3JnfGVkdXxnb3Z8YXNufGlkfGluZm98Y29uZnxvenxhY3R8bnN3fG50fHFsZHxzYXx0YXN8dmljfHdhfGFjdC5lZHV8bnN3LmVkdXxudC5lZHV8cWxkLmVkdXxzYS5lZHV8dGFzLmVkdXx2aWMuZWR1fHdhLmVkdXxxbGQuZ292fHNhLmdvdnx0YXMuZ292fHZpYy5nb3Z8d2EuZ292fGJsb2dzcG90LmNvbVwiLFwiYXdcIjpcImNvbVwiLFwiYXhcIjpcIlwiLFwiYXpcIjpcImNvbXxuZXR8aW50fGdvdnxvcmd8ZWR1fGluZm98cHB8bWlsfG5hbWV8cHJvfGJpelwiLFwiYmFcIjpcIm9yZ3xuZXR8ZWR1fGdvdnxtaWx8dW5zYXx1bmJpfGNvfGNvbXxyc3xibG9nc3BvdFwiLFwiYmJcIjpcImJpenxjb3xjb218ZWR1fGdvdnxpbmZvfG5ldHxvcmd8c3RvcmV8dHZcIixcImJkXCI6XCIqXCIsXCJiZVwiOlwiYWN8YmxvZ3Nwb3RcIixcImJmXCI6XCJnb3ZcIixcImJnXCI6XCJhfGJ8Y3xkfGV8ZnxnfGh8aXxqfGt8bHxtfG58b3xwfHF8cnxzfHR8dXx2fHd8eHx5fHp8MHwxfDJ8M3w0fDV8Nnw3fDh8OXxibG9nc3BvdFwiLFwiYmhcIjpcImNvbXxlZHV8bmV0fG9yZ3xnb3ZcIixcImJpXCI6XCJjb3xjb218ZWR1fG9yfG9yZ1wiLFwiYml6XCI6XCJkeW5kbnN8Zm9yLWJldHRlcnxmb3ItbW9yZXxmb3Itc29tZXxmb3ItdGhlfHNlbGZpcHx3ZWJob3BcIixcImJqXCI6XCJhc3NvfGJhcnJlYXV8Z291dnxibG9nc3BvdFwiLFwiYm1cIjpcImNvbXxlZHV8Z292fG5ldHxvcmdcIixcImJuXCI6XCIqXCIsXCJib1wiOlwiY29tfGVkdXxnb3Z8Z29ifGludHxvcmd8bmV0fG1pbHx0dlwiLFwiYnJcIjpcImFkbXxhZHZ8YWdyfGFtfGFycXxhcnR8YXRvfGJ8YmlvfGJsb2d8Ym1kfGNpbXxjbmd8Y250fGNvbXxjb29wfGVjbnxlY298ZWR1fGVtcHxlbmd8ZXNwfGV0Y3xldGl8ZmFyfGZsb2d8Zm18Zm5kfGZvdHxmc3R8ZzEyfGdnZnxnb3Z8aW1ifGluZHxpbmZ8am9yfGp1c3xsZWd8bGVsfG1hdHxtZWR8bWlsfG1wfG11c3xuZXR8Km5vbXxub3R8bnRyfG9kb3xvcmd8cHBnfHByb3xwc2N8cHNpfHFzbHxyYWRpb3xyZWN8c2xnfHNydnx0YXhpfHRlb3x0bXB8dHJkfHR1cnx0dnx2ZXR8dmxvZ3x3aWtpfHpsZ3xibG9nc3BvdC5jb21cIixcImJzXCI6XCJjb218bmV0fG9yZ3xlZHV8Z292XCIsXCJidFwiOlwiY29tfGVkdXxnb3Z8bmV0fG9yZ1wiLFwiYnZcIjpcIlwiLFwiYndcIjpcImNvfG9yZ1wiLFwiYnlcIjpcImdvdnxtaWx8Y29tfG9mfGJsb2dzcG90LmNvbVwiLFwiYnpcIjpcImNvbXxuZXR8b3JnfGVkdXxnb3Z8emFcIixcImNhXCI6XCJhYnxiY3xtYnxuYnxuZnxubHxuc3xudHxudXxvbnxwZXxxY3xza3x5a3xnY3xjb3xibG9nc3BvdFwiLFwiY2F0XCI6XCJcIixcImNjXCI6XCJmdHBhY2Nlc3N8Z2FtZS1zZXJ2ZXJ8bXlwaG90b3N8c2NyYXBwaW5nXCIsXCJjZFwiOlwiZ292XCIsXCJjZlwiOlwiYmxvZ3Nwb3RcIixcImNnXCI6XCJcIixcImNoXCI6XCJibG9nc3BvdFwiLFwiY2lcIjpcIm9yZ3xvcnxjb218Y298ZWR1fGVkfGFjfG5ldHxnb3xhc3NvfHhuLS1hcm9wb3J0LWJ5YXxpbnR8cHJlc3NlfG1kfGdvdXZcIixcImNrXCI6XCIqfCF3d3dcIixcImNsXCI6XCJnb3Z8Z29ifGNvfG1pbHxibG9nc3BvdFwiLFwiY21cIjpcImNvfGNvbXxnb3Z8bmV0XCIsXCJjblwiOlwiYWN8Y29tfGVkdXxnb3Z8bmV0fG9yZ3xtaWx8eG4tLTU1cXg1ZHx4bi0taW8wYTdpfHhuLS1vZDBhbGd8YWh8Ymp8Y3F8Zmp8Z2R8Z3N8Z3p8Z3h8aGF8aGJ8aGV8aGl8aGx8aG58amx8anN8anh8bG58bm18bnh8cWh8c2N8c2R8c2h8c258c3h8dGp8eGp8eHp8eW58emp8aGt8bW98dHd8Y24tbm9ydGgtMS5jb21wdXRlLmFtYXpvbmF3c3xjb21wdXRlLmFtYXpvbmF3c3xzMy5jbi1ub3J0aC0xLmFtYXpvbmF3cy5jb21cIixcImNvXCI6XCJhcnRzfGNvbXxlZHV8ZmlybXxnb3Z8aW5mb3xpbnR8bWlsfG5ldHxub218b3JnfHJlY3x3ZWJ8YmxvZ3Nwb3QuY29tXCIsXCJjb21cIjpcImFwLW5vcnRoZWFzdC0xLmNvbXB1dGUuYW1hem9uYXdzfGFwLXNvdXRoZWFzdC0xLmNvbXB1dGUuYW1hem9uYXdzfGFwLXNvdXRoZWFzdC0yLmNvbXB1dGUuYW1hem9uYXdzfGNvbXB1dGUuYW1hem9uYXdzfGNvbXB1dGUtMS5hbWF6b25hd3N8ZXUtd2VzdC0xLmNvbXB1dGUuYW1hem9uYXdzfGV1LWNlbnRyYWwtMS5jb21wdXRlLmFtYXpvbmF3c3xzYS1lYXN0LTEuY29tcHV0ZS5hbWF6b25hd3N8dXMtZWFzdC0xLmFtYXpvbmF3c3x1cy1nb3Ytd2VzdC0xLmNvbXB1dGUuYW1hem9uYXdzfHVzLXdlc3QtMS5jb21wdXRlLmFtYXpvbmF3c3x1cy13ZXN0LTIuY29tcHV0ZS5hbWF6b25hd3N8ei0xLmNvbXB1dGUtMS5hbWF6b25hd3N8ei0yLmNvbXB1dGUtMS5hbWF6b25hd3N8ZWxhc3RpY2JlYW5zdGFsa3xlbGIuYW1hem9uYXdzfHMzLmFtYXpvbmF3c3xzMy1hcC1ub3J0aGVhc3QtMS5hbWF6b25hd3N8czMtYXAtc291dGhlYXN0LTEuYW1hem9uYXdzfHMzLWFwLXNvdXRoZWFzdC0yLmFtYXpvbmF3c3xzMy1leHRlcm5hbC0xLmFtYXpvbmF3c3xzMy1leHRlcm5hbC0yLmFtYXpvbmF3c3xzMy1maXBzLXVzLWdvdi13ZXN0LTEuYW1hem9uYXdzfHMzLWV1LWNlbnRyYWwtMS5hbWF6b25hd3N8czMtZXUtd2VzdC0xLmFtYXpvbmF3c3xzMy1zYS1lYXN0LTEuYW1hem9uYXdzfHMzLXVzLWdvdi13ZXN0LTEuYW1hem9uYXdzfHMzLXVzLXdlc3QtMS5hbWF6b25hd3N8czMtdXMtd2VzdC0yLmFtYXpvbmF3c3xzMy5ldS1jZW50cmFsLTEuYW1hem9uYXdzfGJldGFpbmFib3h8YXJ8YnJ8Y258ZGV8ZXV8Z2J8aHV8anBufGtyfG1leHxub3xxY3xydXxzYXxzZXx1a3x1c3x1eXx6YXxhZnJpY2F8Z3J8Y298Y2xvdWRjb250cm9sbGVkfGNsb3VkY29udHJvbGFwcHxkcmVhbWhvc3RlcnN8ZHluZG5zLWF0LWhvbWV8ZHluZG5zLWF0LXdvcmt8ZHluZG5zLWJsb2d8ZHluZG5zLWZyZWV8ZHluZG5zLWhvbWV8ZHluZG5zLWlwfGR5bmRucy1tYWlsfGR5bmRucy1vZmZpY2V8ZHluZG5zLXBpY3N8ZHluZG5zLXJlbW90ZXxkeW5kbnMtc2VydmVyfGR5bmRucy13ZWJ8ZHluZG5zLXdpa2l8ZHluZG5zLXdvcmt8YmxvZ2Ruc3xjZWNoaXJlfGRuc2FsaWFzfGRuc2Rvam98ZG9lc250ZXhpc3R8ZG9udGV4aXN0fGRvb21kbnN8ZHluLW8tc2F1cnxkeW5hbGlhc3xlc3QtYS1sYS1tYWlzb258ZXN0LWEtbGEtbWFzaW9ufGVzdC1sZS1wYXRyb258ZXN0LW1vbi1ibG9ndWV1cnxmcm9tLWFrfGZyb20tYWx8ZnJvbS1hcnxmcm9tLWNhfGZyb20tY3R8ZnJvbS1kY3xmcm9tLWRlfGZyb20tZmx8ZnJvbS1nYXxmcm9tLWhpfGZyb20taWF8ZnJvbS1pZHxmcm9tLWlsfGZyb20taW58ZnJvbS1rc3xmcm9tLWt5fGZyb20tbWF8ZnJvbS1tZHxmcm9tLW1pfGZyb20tbW58ZnJvbS1tb3xmcm9tLW1zfGZyb20tbXR8ZnJvbS1uY3xmcm9tLW5kfGZyb20tbmV8ZnJvbS1uaHxmcm9tLW5qfGZyb20tbm18ZnJvbS1udnxmcm9tLW9ofGZyb20tb2t8ZnJvbS1vcnxmcm9tLXBhfGZyb20tcHJ8ZnJvbS1yaXxmcm9tLXNjfGZyb20tc2R8ZnJvbS10bnxmcm9tLXR4fGZyb20tdXR8ZnJvbS12YXxmcm9tLXZ0fGZyb20td2F8ZnJvbS13aXxmcm9tLXd2fGZyb20td3l8Z2V0bXlpcHxnb3RkbnN8aG9iYnktc2l0ZXxob21lbGludXh8aG9tZXVuaXh8aWFtYWxsYW1hfGlzLWEtYW5hcmNoaXN0fGlzLWEtYmxvZ2dlcnxpcy1hLWJvb2trZWVwZXJ8aXMtYS1idWxscy1mYW58aXMtYS1jYXRlcmVyfGlzLWEtY2hlZnxpcy1hLWNvbnNlcnZhdGl2ZXxpcy1hLWNwYXxpcy1hLWN1YmljbGUtc2xhdmV8aXMtYS1kZW1vY3JhdHxpcy1hLWRlc2lnbmVyfGlzLWEtZG9jdG9yfGlzLWEtZmluYW5jaWFsYWR2aXNvcnxpcy1hLWdlZWt8aXMtYS1ncmVlbnxpcy1hLWd1cnV8aXMtYS1oYXJkLXdvcmtlcnxpcy1hLWh1bnRlcnxpcy1hLWxhbmRzY2FwZXJ8aXMtYS1sYXd5ZXJ8aXMtYS1saWJlcmFsfGlzLWEtbGliZXJ0YXJpYW58aXMtYS1sbGFtYXxpcy1hLW11c2ljaWFufGlzLWEtbmFzY2FyZmFufGlzLWEtbnVyc2V8aXMtYS1wYWludGVyfGlzLWEtcGVyc29uYWx0cmFpbmVyfGlzLWEtcGhvdG9ncmFwaGVyfGlzLWEtcGxheWVyfGlzLWEtcmVwdWJsaWNhbnxpcy1hLXJvY2tzdGFyfGlzLWEtc29jaWFsaXN0fGlzLWEtc3R1ZGVudHxpcy1hLXRlYWNoZXJ8aXMtYS10ZWNoaWV8aXMtYS10aGVyYXBpc3R8aXMtYW4tYWNjb3VudGFudHxpcy1hbi1hY3Rvcnxpcy1hbi1hY3RyZXNzfGlzLWFuLWFuYXJjaGlzdHxpcy1hbi1hcnRpc3R8aXMtYW4tZW5naW5lZXJ8aXMtYW4tZW50ZXJ0YWluZXJ8aXMtY2VydGlmaWVkfGlzLWdvbmV8aXMtaW50by1hbmltZXxpcy1pbnRvLWNhcnN8aXMtaW50by1jYXJ0b29uc3xpcy1pbnRvLWdhbWVzfGlzLWxlZXR8aXMtbm90LWNlcnRpZmllZHxpcy1zbGlja3xpcy11YmVybGVldHxpcy13aXRoLXRoZWJhbmR8aXNhLWdlZWt8aXNhLWhvY2tleW51dHxpc3NtYXJ0ZXJ0aGFueW91fGxpa2VzLXBpZXxsaWtlc2NhbmR5fG5lYXQtdXJsfHNhdmVzLXRoZS13aGFsZXN8c2VsZmlwfHNlbGxzLWZvci1sZXNzfHNlbGxzLWZvci11fHNlcnZlYmJzfHNpbXBsZS11cmx8c3BhY2UtdG8tcmVudHx0ZWFjaGVzLXlvZ2F8d3JpdGVzdGhpc2Jsb2d8ZmlyZWJhc2VhcHB8Zmx5bm5odWJ8Z2l0aHVidXNlcmNvbnRlbnR8cm98YXBwc3BvdHxibG9nc3BvdHxjb2Rlc3BvdHxnb29nbGVhcGlzfGdvb2dsZWNvZGV8cGFnZXNwZWVkbW9iaWxpemVyfHdpdGhnb29nbGV8d2l0aHlvdXR1YmV8aGVyb2t1YXBwfGhlcm9rdXNzbHw0dXxuZnNob3N0fG9wZXJhdW5pdGV8b3V0c3lzdGVtc2Nsb3VkfGdvdHBhbnRoZW9ufHFhMnxyaGNsb3VkfHNpbmFhcHB8dmlwc2luYWFwcHwxa2FwcHxoa3x5b2xhc2l0ZVwiLFwiY29vcFwiOlwiXCIsXCJjclwiOlwiYWN8Y298ZWR8Zml8Z298b3J8c2FcIixcImN1XCI6XCJjb218ZWR1fG9yZ3xuZXR8Z292fGluZlwiLFwiY3ZcIjpcImJsb2dzcG90XCIsXCJjd1wiOlwiY29tfGVkdXxuZXR8b3JnXCIsXCJjeFwiOlwiZ292fGF0aFwiLFwiY3lcIjpcImFjfGJpenxjb218ZWtsb2dlc3xnb3Z8bHRkfG5hbWV8bmV0fG9yZ3xwYXJsaWFtZW50fHByZXNzfHByb3x0bXxibG9nc3BvdC5jb21cIixcImN6XCI6XCJibG9nc3BvdFwiLFwiZGVcIjpcImNvbXxmdWV0dGVydGRhc25ldHp8aXN0ZWluZ2Vla3xpc3RtZWlufGxlYnRpbW5ldHp8bGVpdHVuZ3Nlbnx0cmFldW10Z2VyYWRlfGJsb2dzcG90XCIsXCJkalwiOlwiXCIsXCJka1wiOlwiYmxvZ3Nwb3RcIixcImRtXCI6XCJjb218bmV0fG9yZ3xlZHV8Z292XCIsXCJkb1wiOlwiYXJ0fGNvbXxlZHV8Z29ifGdvdnxtaWx8bmV0fG9yZ3xzbGR8d2ViXCIsXCJkelwiOlwiY29tfG9yZ3xuZXR8Z292fGVkdXxhc3NvfHBvbHxhcnRcIixcImVjXCI6XCJjb218aW5mb3xuZXR8ZmlufGsxMnxtZWR8cHJvfG9yZ3xlZHV8Z292fGdvYnxtaWxcIixcImVkdVwiOlwiXCIsXCJlZVwiOlwiZWR1fGdvdnxyaWlrfGxpYnxtZWR8Y29tfHByaXxhaXB8b3JnfGZpZXxibG9nc3BvdC5jb21cIixcImVnXCI6XCJjb218ZWR1fGV1bnxnb3Z8bWlsfG5hbWV8bmV0fG9yZ3xzY2l8YmxvZ3Nwb3QuY29tXCIsXCJlclwiOlwiKlwiLFwiZXNcIjpcImNvbXxub218b3JnfGdvYnxlZHV8YmxvZ3Nwb3QuY29tXCIsXCJldFwiOlwiY29tfGdvdnxvcmd8ZWR1fGJpenxuYW1lfGluZm98bmV0XCIsXCJldVwiOlwiXCIsXCJmaVwiOlwiYWxhbmR8YmxvZ3Nwb3R8aWtpXCIsXCJmalwiOlwiKlwiLFwiZmtcIjpcIipcIixcImZtXCI6XCJcIixcImZvXCI6XCJcIixcImZyXCI6XCJjb218YXNzb3xub218cHJkfHByZXNzZXx0bXxhZXJvcG9ydHxhc3NlZGljfGF2b2NhdHxhdm91ZXN8Y2NpfGNoYW1iYWdyaXxjaGlydXJnaWVucy1kZW50aXN0ZXN8ZXhwZXJ0cy1jb21wdGFibGVzfGdlb21ldHJlLWV4cGVydHxnb3V2fGdyZXRhfGh1aXNzaWVyLWp1c3RpY2V8bWVkZWNpbnxub3RhaXJlc3xwaGFybWFjaWVufHBvcnR8dmV0ZXJpbmFpcmV8YmxvZ3Nwb3RcIixcImdhXCI6XCJcIixcImdiXCI6XCJcIixcImdkXCI6XCJcIixcImdlXCI6XCJjb218ZWR1fGdvdnxvcmd8bWlsfG5ldHxwdnRcIixcImdmXCI6XCJcIixcImdnXCI6XCJjb3xuZXR8b3JnXCIsXCJnaFwiOlwiY29tfGVkdXxnb3Z8b3JnfG1pbFwiLFwiZ2lcIjpcImNvbXxsdGR8Z292fG1vZHxlZHV8b3JnXCIsXCJnbFwiOlwiY298Y29tfGVkdXxuZXR8b3JnXCIsXCJnbVwiOlwiXCIsXCJnblwiOlwiYWN8Y29tfGVkdXxnb3Z8b3JnfG5ldFwiLFwiZ292XCI6XCJcIixcImdwXCI6XCJjb218bmV0fG1vYml8ZWR1fG9yZ3xhc3NvXCIsXCJncVwiOlwiXCIsXCJnclwiOlwiY29tfGVkdXxuZXR8b3JnfGdvdnxibG9nc3BvdFwiLFwiZ3NcIjpcIlwiLFwiZ3RcIjpcImNvbXxlZHV8Z29ifGluZHxtaWx8bmV0fG9yZ1wiLFwiZ3VcIjpcIipcIixcImd3XCI6XCJcIixcImd5XCI6XCJjb3xjb218bmV0XCIsXCJoa1wiOlwiY29tfGVkdXxnb3Z8aWR2fG5ldHxvcmd8eG4tLTU1cXg1ZHx4bi0td2N2czIyZHx4bi0tbGN2cjMyZHx4bi0tbXh0cTFtfHhuLS1nbXF3NWF8eG4tLWNpcXBufHhuLS1nbXEwNTBpfHhuLS16ZjBhdnh8eG4tLWlvMGE3aXx4bi0tbWswYXhpfHhuLS1vZDBhbGd8eG4tLW9kMGFxM2J8eG4tLXRuMGFnfHhuLS11YzBhdHZ8eG4tLXVjMGF5NGF8YmxvZ3Nwb3R8bHRkfGluY1wiLFwiaG1cIjpcIlwiLFwiaG5cIjpcImNvbXxlZHV8b3JnfG5ldHxtaWx8Z29iXCIsXCJoclwiOlwiaXp8ZnJvbXxuYW1lfGNvbXxibG9nc3BvdFwiLFwiaHRcIjpcImNvbXxzaG9wfGZpcm18aW5mb3xhZHVsdHxuZXR8cHJvfG9yZ3xtZWR8YXJ0fGNvb3B8cG9sfGFzc298ZWR1fHJlbHxnb3V2fHBlcnNvXCIsXCJodVwiOlwiY298aW5mb3xvcmd8cHJpdnxzcG9ydHx0bXwyMDAwfGFncmFyfGJvbHR8Y2FzaW5vfGNpdHl8ZXJvdGljYXxlcm90aWthfGZpbG18Zm9ydW18Z2FtZXN8aG90ZWx8aW5nYXRsYW58am9nYXN6fGtvbnl2ZWxvfGxha2FzfG1lZGlhfG5ld3N8cmVrbGFtfHNleHxzaG9wfHN1bGl8c3pleHx0b3pzZGV8dXRhemFzfHZpZGVvfGJsb2dzcG90XCIsXCJpZFwiOlwiYWN8Yml6fGNvfGRlc2F8Z298bWlsfG15fG5ldHxvcnxzY2h8d2VifGJsb2dzcG90LmNvXCIsXCJpZVwiOlwiZ292fGJsb2dzcG90XCIsXCJpbFwiOlwiYWN8Y298Z292fGlkZnxrMTJ8bXVuaXxuZXR8b3JnfGJsb2dzcG90LmNvXCIsXCJpbVwiOlwiYWN8Y298Y29tfGx0ZC5jb3xuZXR8b3JnfHBsYy5jb3x0dHx0dlwiLFwiaW5cIjpcImNvfGZpcm18bmV0fG9yZ3xnZW58aW5kfG5pY3xhY3xlZHV8cmVzfGdvdnxtaWx8YmxvZ3Nwb3RcIixcImluZm9cIjpcImR5bmRuc3xiYXJyZWwtb2Yta25vd2xlZGdlfGJhcnJlbGwtb2Yta25vd2xlZGdlfGZvci1vdXJ8Z3Jva3MtdGhlfGdyb2tzLXRoaXN8aGVyZS1mb3ItbW9yZXxrbm93c2l0YWxsfHNlbGZpcHx3ZWJob3BcIixcImludFwiOlwiZXVcIixcImlvXCI6XCJjb218Z2l0aHVifG5ncm9rfG5pZHxwYW50aGVvbnxzYW5kY2F0c1wiLFwiaXFcIjpcImdvdnxlZHV8bWlsfGNvbXxvcmd8bmV0XCIsXCJpclwiOlwiYWN8Y298Z292fGlkfG5ldHxvcmd8c2NofHhuLS1tZ2JhM2E0ZjE2YXx4bi0tbWdiYTNhNGZyYVwiLFwiaXNcIjpcIm5ldHxjb218ZWR1fGdvdnxvcmd8aW50fGN1cGNha2V8YmxvZ3Nwb3RcIixcIml0XCI6XCJnb3Z8ZWR1fGFicnxhYnJ1enpvfGFvc3RhLXZhbGxleXxhb3N0YXZhbGxleXxiYXN8YmFzaWxpY2F0YXxjYWx8Y2FsYWJyaWF8Y2FtfGNhbXBhbmlhfGVtaWxpYS1yb21hZ25hfGVtaWxpYXJvbWFnbmF8ZW1yfGZyaXVsaS12LWdpdWxpYXxmcml1bGktdmUtZ2l1bGlhfGZyaXVsaS12ZWdpdWxpYXxmcml1bGktdmVuZXppYS1naXVsaWF8ZnJpdWxpLXZlbmV6aWFnaXVsaWF8ZnJpdWxpLXZnaXVsaWF8ZnJpdWxpdi1naXVsaWF8ZnJpdWxpdmUtZ2l1bGlhfGZyaXVsaXZlZ2l1bGlhfGZyaXVsaXZlbmV6aWEtZ2l1bGlhfGZyaXVsaXZlbmV6aWFnaXVsaWF8ZnJpdWxpdmdpdWxpYXxmdmd8bGF6fGxhemlvfGxpZ3xsaWd1cmlhfGxvbXxsb21iYXJkaWF8bG9tYmFyZHl8bHVjYW5pYXxtYXJ8bWFyY2hlfG1vbHxtb2xpc2V8cGllZG1vbnR8cGllbW9udGV8cG1ufHB1Z3xwdWdsaWF8c2FyfHNhcmRlZ25hfHNhcmRpbmlhfHNpY3xzaWNpbGlhfHNpY2lseXx0YWF8dG9zfHRvc2NhbmF8dHJlbnRpbm8tYS1hZGlnZXx0cmVudGluby1hYWRpZ2V8dHJlbnRpbm8tYWx0by1hZGlnZXx0cmVudGluby1hbHRvYWRpZ2V8dHJlbnRpbm8tcy10aXJvbHx0cmVudGluby1zdGlyb2x8dHJlbnRpbm8tc3VkLXRpcm9sfHRyZW50aW5vLXN1ZHRpcm9sfHRyZW50aW5vLXN1ZWQtdGlyb2x8dHJlbnRpbm8tc3VlZHRpcm9sfHRyZW50aW5vYS1hZGlnZXx0cmVudGlub2FhZGlnZXx0cmVudGlub2FsdG8tYWRpZ2V8dHJlbnRpbm9hbHRvYWRpZ2V8dHJlbnRpbm9zLXRpcm9sfHRyZW50aW5vc3Rpcm9sfHRyZW50aW5vc3VkLXRpcm9sfHRyZW50aW5vc3VkdGlyb2x8dHJlbnRpbm9zdWVkLXRpcm9sfHRyZW50aW5vc3VlZHRpcm9sfHR1c2Nhbnl8dW1ifHVtYnJpYXx2YWwtZC1hb3N0YXx2YWwtZGFvc3RhfHZhbGQtYW9zdGF8dmFsZGFvc3RhfHZhbGxlLWFvc3RhfHZhbGxlLWQtYW9zdGF8dmFsbGUtZGFvc3RhfHZhbGxlYW9zdGF8dmFsbGVkLWFvc3RhfHZhbGxlZGFvc3RhfHZhbGxlZS1hb3N0ZXx2YWxsZWVhb3N0ZXx2YW98dmRhfHZlbnx2ZW5ldG98YWd8YWdyaWdlbnRvfGFsfGFsZXNzYW5kcmlhfGFsdG8tYWRpZ2V8YWx0b2FkaWdlfGFufGFuY29uYXxhbmRyaWEtYmFybGV0dGEtdHJhbml8YW5kcmlhLXRyYW5pLWJhcmxldHRhfGFuZHJpYWJhcmxldHRhdHJhbml8YW5kcmlhdHJhbmliYXJsZXR0YXxhb3xhb3N0YXxhb3N0ZXxhcHxhcXxhcXVpbGF8YXJ8YXJlenpvfGFzY29saS1waWNlbm98YXNjb2xpcGljZW5vfGFzdGl8YXR8YXZ8YXZlbGxpbm98YmF8YmFsc2FufGJhcml8YmFybGV0dGEtdHJhbmktYW5kcmlhfGJhcmxldHRhdHJhbmlhbmRyaWF8YmVsbHVub3xiZW5ldmVudG98YmVyZ2Ftb3xiZ3xiaXxiaWVsbGF8Ymx8Ym58Ym98Ym9sb2duYXxib2x6YW5vfGJvemVufGJyfGJyZXNjaWF8YnJpbmRpc2l8YnN8YnR8Ynp8Y2F8Y2FnbGlhcml8Y2FsdGFuaXNzZXR0YXxjYW1waWRhbm8tbWVkaW98Y2FtcGlkYW5vbWVkaW98Y2FtcG9iYXNzb3xjYXJib25pYS1pZ2xlc2lhc3xjYXJib25pYWlnbGVzaWFzfGNhcnJhcmEtbWFzc2F8Y2FycmFyYW1hc3NhfGNhc2VydGF8Y2F0YW5pYXxjYXRhbnphcm98Y2J8Y2V8Y2VzZW5hLWZvcmxpfGNlc2VuYWZvcmxpfGNofGNoaWV0aXxjaXxjbHxjbnxjb3xjb21vfGNvc2VuemF8Y3J8Y3JlbW9uYXxjcm90b25lfGNzfGN0fGN1bmVvfGN6fGRlbGwtb2dsaWFzdHJhfGRlbGxvZ2xpYXN0cmF8ZW58ZW5uYXxmY3xmZXxmZXJtb3xmZXJyYXJhfGZnfGZpfGZpcmVuemV8ZmxvcmVuY2V8Zm18Zm9nZ2lhfGZvcmxpLWNlc2VuYXxmb3JsaWNlc2VuYXxmcnxmcm9zaW5vbmV8Z2V8Z2Vub2F8Z2Vub3ZhfGdvfGdvcml6aWF8Z3J8Z3Jvc3NldG98aWdsZXNpYXMtY2FyYm9uaWF8aWdsZXNpYXNjYXJib25pYXxpbXxpbXBlcmlhfGlzfGlzZXJuaWF8a3J8bGEtc3BlemlhfGxhcXVpbGF8bGFzcGV6aWF8bGF0aW5hfGxjfGxlfGxlY2NlfGxlY2NvfGxpfGxpdm9ybm98bG98bG9kaXxsdHxsdXxsdWNjYXxtYWNlcmF0YXxtYW50b3ZhfG1hc3NhLWNhcnJhcmF8bWFzc2FjYXJyYXJhfG1hdGVyYXxtYnxtY3xtZXxtZWRpby1jYW1waWRhbm98bWVkaW9jYW1waWRhbm98bWVzc2luYXxtaXxtaWxhbnxtaWxhbm98bW58bW98bW9kZW5hfG1vbnphLWJyaWFuemF8bW9uemEtZS1kZWxsYS1icmlhbnphfG1vbnphfG1vbnphYnJpYW56YXxtb256YWVicmlhbnphfG1vbnphZWRlbGxhYnJpYW56YXxtc3xtdHxuYXxuYXBsZXN8bmFwb2xpfG5vfG5vdmFyYXxudXxudW9yb3xvZ3xvZ2xpYXN0cmF8b2xiaWEtdGVtcGlvfG9sYmlhdGVtcGlvfG9yfG9yaXN0YW5vfG90fHBhfHBhZG92YXxwYWR1YXxwYWxlcm1vfHBhcm1hfHBhdmlhfHBjfHBkfHBlfHBlcnVnaWF8cGVzYXJvLXVyYmlub3xwZXNhcm91cmJpbm98cGVzY2FyYXxwZ3xwaXxwaWFjZW56YXxwaXNhfHBpc3RvaWF8cG58cG98cG9yZGVub25lfHBvdGVuemF8cHJ8cHJhdG98cHR8cHV8cHZ8cHp8cmF8cmFndXNhfHJhdmVubmF8cmN8cmV8cmVnZ2lvLWNhbGFicmlhfHJlZ2dpby1lbWlsaWF8cmVnZ2lvY2FsYWJyaWF8cmVnZ2lvZW1pbGlhfHJnfHJpfHJpZXRpfHJpbWluaXxybXxybnxyb3xyb21hfHJvbWV8cm92aWdvfHNhfHNhbGVybm98c2Fzc2FyaXxzYXZvbmF8c2l8c2llbmF8c2lyYWN1c2F8c298c29uZHJpb3xzcHxzcnxzc3xzdWVkdGlyb2x8c3Z8dGF8dGFyYW50b3x0ZXx0ZW1waW8tb2xiaWF8dGVtcGlvb2xiaWF8dGVyYW1vfHRlcm5pfHRufHRvfHRvcmlub3x0cHx0cnx0cmFuaS1hbmRyaWEtYmFybGV0dGF8dHJhbmktYmFybGV0dGEtYW5kcmlhfHRyYW5pYW5kcmlhYmFybGV0dGF8dHJhbmliYXJsZXR0YWFuZHJpYXx0cmFwYW5pfHRyZW50aW5vfHRyZW50b3x0cmV2aXNvfHRyaWVzdGV8dHN8dHVyaW58dHZ8dWR8dWRpbmV8dXJiaW5vLXBlc2Fyb3x1cmJpbm9wZXNhcm98dmF8dmFyZXNlfHZifHZjfHZlfHZlbmV6aWF8dmVuaWNlfHZlcmJhbmlhfHZlcmNlbGxpfHZlcm9uYXx2aXx2aWJvLXZhbGVudGlhfHZpYm92YWxlbnRpYXx2aWNlbnphfHZpdGVyYm98dnJ8dnN8dnR8dnZ8YmxvZ3Nwb3RcIixcImplXCI6XCJjb3xuZXR8b3JnXCIsXCJqbVwiOlwiKlwiLFwiam9cIjpcImNvbXxvcmd8bmV0fGVkdXxzY2h8Z292fG1pbHxuYW1lXCIsXCJqb2JzXCI6XCJcIixcImpwXCI6XCJhY3xhZHxjb3xlZHxnb3xncnxsZ3xuZXxvcnxhaWNoaXxha2l0YXxhb21vcml8Y2hpYmF8ZWhpbWV8ZnVrdWl8ZnVrdW9rYXxmdWt1c2hpbWF8Z2lmdXxndW5tYXxoaXJvc2hpbWF8aG9ra2FpZG98aHlvZ298aWJhcmFraXxpc2hpa2F3YXxpd2F0ZXxrYWdhd2F8a2Fnb3NoaW1hfGthbmFnYXdhfGtvY2hpfGt1bWFtb3RvfGt5b3RvfG1pZXxtaXlhZ2l8bWl5YXpha2l8bmFnYW5vfG5hZ2FzYWtpfG5hcmF8bmlpZ2F0YXxvaXRhfG9rYXlhbWF8b2tpbmF3YXxvc2FrYXxzYWdhfHNhaXRhbWF8c2hpZ2F8c2hpbWFuZXxzaGl6dW9rYXx0b2NoaWdpfHRva3VzaGltYXx0b2t5b3x0b3R0b3JpfHRveWFtYXx3YWtheWFtYXx5YW1hZ2F0YXx5YW1hZ3VjaGl8eWFtYW5hc2hpfHhuLS00cHZ4c3x4bi0tdmd1NDAyY3x4bi0tYzNzMTRtfHhuLS1mNnF4NTNhfHhuLS04cHZyNHV8eG4tLXVpc3QyMmh8eG4tLWRqcnM3MmQ2dXl8eG4tLW1rcnU0NWl8eG4tLTB0cnE3cDdubnx4bi0tOGx0cjYya3x4bi0tMm00YTE1ZXx4bi0tZWZ2bjlzfHhuLS0zMnZwMzBofHhuLS00aXQ3OTdrfHhuLS0xbHFzNzFkfHhuLS01cnRwNDljfHhuLS01anMwNDVkfHhuLS1laHF6NTZufHhuLS0xbHFzMDNufHhuLS1xcXF0MTFtfHhuLS1rYnJxN298eG4tLXBzc3UzM2x8eG4tLW50c3ExN2d8eG4tLXVpc3ozZ3x4bi0tNmJ0dzVhfHhuLS0xY3R3b3x4bi0tNm9yeDJyfHhuLS1yaHQ2MWV8eG4tLXJodDI3enx4bi0tZGp0eTRrfHhuLS1uaXQyMjVrfHhuLS1yaHQzZHx4bi0ta2x0eTV4fHhuLS1rbHR4OWF8eG4tLWtsdHA3ZHx4bi0tdXV3dTU4YXx4bi0temJ4MDI1ZHx4bi0tbnRzbzBpcXgzYXx4bi0tZWxxcTE2aHx4bi0tNGl0MTY4ZHx4bi0ta2x0Nzg3ZHx4bi0tcm55MzFofHhuLS03dDBhMjY0Y3x4bi0tNXJ0cTM0a3x4bi0tazd5bjk1ZXx4bi0tdG9yMTMxb3x4bi0tZDVxdjd6ODc2Y3wqa2F3YXNha2l8KmtpdGFreXVzaHV8KmtvYmV8Km5hZ295YXwqc2FwcG9yb3wqc2VuZGFpfCp5b2tvaGFtYXwhY2l0eS5rYXdhc2FraXwhY2l0eS5raXRha3l1c2h1fCFjaXR5LmtvYmV8IWNpdHkubmFnb3lhfCFjaXR5LnNhcHBvcm98IWNpdHkuc2VuZGFpfCFjaXR5Lnlva29oYW1hfGFpc2FpLmFpY2hpfGFtYS5haWNoaXxhbmpvLmFpY2hpfGFzdWtlLmFpY2hpfGNoaXJ5dS5haWNoaXxjaGl0YS5haWNoaXxmdXNvLmFpY2hpfGdhbWFnb3JpLmFpY2hpfGhhbmRhLmFpY2hpfGhhenUuYWljaGl8aGVraW5hbi5haWNoaXxoaWdhc2hpdXJhLmFpY2hpfGljaGlub21peWEuYWljaGl8aW5hemF3YS5haWNoaXxpbnV5YW1hLmFpY2hpfGlzc2hpa2kuYWljaGl8aXdha3VyYS5haWNoaXxrYW5pZS5haWNoaXxrYXJpeWEuYWljaGl8a2FzdWdhaS5haWNoaXxraXJhLmFpY2hpfGtpeW9zdS5haWNoaXxrb21ha2kuYWljaGl8a29uYW4uYWljaGl8a290YS5haWNoaXxtaWhhbWEuYWljaGl8bWl5b3NoaS5haWNoaXxuaXNoaW8uYWljaGl8bmlzc2hpbi5haWNoaXxvYnUuYWljaGl8b2d1Y2hpLmFpY2hpfG9oYXJ1LmFpY2hpfG9rYXpha2kuYWljaGl8b3dhcmlhc2FoaS5haWNoaXxzZXRvLmFpY2hpfHNoaWthdHN1LmFpY2hpfHNoaW5zaGlyby5haWNoaXxzaGl0YXJhLmFpY2hpfHRhaGFyYS5haWNoaXx0YWthaGFtYS5haWNoaXx0b2Jpc2hpbWEuYWljaGl8dG9laS5haWNoaXx0b2dvLmFpY2hpfHRva2FpLmFpY2hpfHRva29uYW1lLmFpY2hpfHRveW9ha2UuYWljaGl8dG95b2hhc2hpLmFpY2hpfHRveW9rYXdhLmFpY2hpfHRveW9uZS5haWNoaXx0b3lvdGEuYWljaGl8dHN1c2hpbWEuYWljaGl8eWF0b21pLmFpY2hpfGFraXRhLmFraXRhfGRhaXNlbi5ha2l0YXxmdWppc2F0by5ha2l0YXxnb2pvbWUuYWtpdGF8aGFjaGlyb2dhdGEuYWtpdGF8aGFwcG91LmFraXRhfGhpZ2FzaGluYXJ1c2UuYWtpdGF8aG9uam8uYWtpdGF8aG9uanlvLmFraXRhfGlrYXdhLmFraXRhfGthbWlrb2FuaS5ha2l0YXxrYW1pb2thLmFraXRhfGthdGFnYW1pLmFraXRhfGthenVuby5ha2l0YXxraXRhYWtpdGEuYWtpdGF8a29zYWthLmFraXRhfGt5b3dhLmFraXRhfG1pc2F0by5ha2l0YXxtaXRhbmUuYWtpdGF8bW9yaXlvc2hpLmFraXRhfG5pa2Foby5ha2l0YXxub3NoaXJvLmFraXRhfG9kYXRlLmFraXRhfG9nYS5ha2l0YXxvZ2F0YS5ha2l0YXxzZW1ib2t1LmFraXRhfHlva290ZS5ha2l0YXx5dXJpaG9uam8uYWtpdGF8YW9tb3JpLmFvbW9yaXxnb25vaGUuYW9tb3JpfGhhY2hpbm9oZS5hb21vcml8aGFzaGlrYW1pLmFvbW9yaXxoaXJhbmFpLmFvbW9yaXxoaXJvc2FraS5hb21vcml8aXRheWFuYWdpLmFvbW9yaXxrdXJvaXNoaS5hb21vcml8bWlzYXdhLmFvbW9yaXxtdXRzdS5hb21vcml8bmFrYWRvbWFyaS5hb21vcml8bm9oZWppLmFvbW9yaXxvaXJhc2UuYW9tb3JpfG93YW5pLmFvbW9yaXxyb2t1bm9oZS5hb21vcml8c2Fubm9oZS5hb21vcml8c2hpY2hpbm9oZS5hb21vcml8c2hpbmdvLmFvbW9yaXx0YWtrby5hb21vcml8dG93YWRhLmFvbW9yaXx0c3VnYXJ1LmFvbW9yaXx0c3VydXRhLmFvbW9yaXxhYmlrby5jaGliYXxhc2FoaS5jaGliYXxjaG9uYW4uY2hpYmF8Y2hvc2VpLmNoaWJhfGNob3NoaS5jaGliYXxjaHVvLmNoaWJhfGZ1bmFiYXNoaS5jaGliYXxmdXR0c3UuY2hpYmF8aGFuYW1pZ2F3YS5jaGliYXxpY2hpaGFyYS5jaGliYXxpY2hpa2F3YS5jaGliYXxpY2hpbm9taXlhLmNoaWJhfGluemFpLmNoaWJhfGlzdW1pLmNoaWJhfGthbWFnYXlhLmNoaWJhfGthbW9nYXdhLmNoaWJhfGthc2hpd2EuY2hpYmF8a2F0b3JpLmNoaWJhfGthdHN1dXJhLmNoaWJhfGtpbWl0c3UuY2hpYmF8a2lzYXJhenUuY2hpYmF8a296YWtpLmNoaWJhfGt1anVrdXJpLmNoaWJhfGt5b25hbi5jaGliYXxtYXRzdWRvLmNoaWJhfG1pZG9yaS5jaGliYXxtaWhhbWEuY2hpYmF8bWluYW1pYm9zby5jaGliYXxtb2JhcmEuY2hpYmF8bXV0c3V6YXdhLmNoaWJhfG5hZ2FyYS5jaGliYXxuYWdhcmV5YW1hLmNoaWJhfG5hcmFzaGluby5jaGliYXxuYXJpdGEuY2hpYmF8bm9kYS5jaGliYXxvYW1pc2hpcmFzYXRvLmNoaWJhfG9taWdhd2EuY2hpYmF8b25qdWt1LmNoaWJhfG90YWtpLmNoaWJhfHNha2FlLmNoaWJhfHNha3VyYS5jaGliYXxzaGltb2Z1c2EuY2hpYmF8c2hpcmFrby5jaGliYXxzaGlyb2kuY2hpYmF8c2hpc3VpLmNoaWJhfHNvZGVnYXVyYS5jaGliYXxzb3NhLmNoaWJhfHRha28uY2hpYmF8dGF0ZXlhbWEuY2hpYmF8dG9nYW5lLmNoaWJhfHRvaG5vc2hvLmNoaWJhfHRvbWlzYXRvLmNoaWJhfHVyYXlhc3UuY2hpYmF8eWFjaGltYXRhLmNoaWJhfHlhY2hpeW8uY2hpYmF8eW9rYWljaGliYS5jaGliYXx5b2tvc2hpYmFoaWthcmkuY2hpYmF8eW90c3VrYWlkby5jaGliYXxhaW5hbi5laGltZXxob25haS5laGltZXxpa2F0YS5laGltZXxpbWFiYXJpLmVoaW1lfGl5by5laGltZXxrYW1pamltYS5laGltZXxraWhva3UuZWhpbWV8a3VtYWtvZ2VuLmVoaW1lfG1hc2FraS5laGltZXxtYXRzdW5vLmVoaW1lfG1hdHN1eWFtYS5laGltZXxuYW1pa2F0YS5laGltZXxuaWloYW1hLmVoaW1lfG96dS5laGltZXxzYWlqby5laGltZXxzZWl5by5laGltZXxzaGlrb2t1Y2h1by5laGltZXx0b2JlLmVoaW1lfHRvb24uZWhpbWV8dWNoaWtvLmVoaW1lfHV3YWppbWEuZWhpbWV8eWF3YXRhaGFtYS5laGltZXxlY2hpemVuLmZ1a3VpfGVpaGVpamkuZnVrdWl8ZnVrdWkuZnVrdWl8aWtlZGEuZnVrdWl8a2F0c3V5YW1hLmZ1a3VpfG1paGFtYS5mdWt1aXxtaW5hbWllY2hpemVuLmZ1a3VpfG9iYW1hLmZ1a3VpfG9oaS5mdWt1aXxvbm8uZnVrdWl8c2FiYWUuZnVrdWl8c2FrYWkuZnVrdWl8dGFrYWhhbWEuZnVrdWl8dHN1cnVnYS5mdWt1aXx3YWthc2EuZnVrdWl8YXNoaXlhLmZ1a3Vva2F8YnV6ZW4uZnVrdW9rYXxjaGlrdWdvLmZ1a3Vva2F8Y2hpa3Voby5mdWt1b2thfGNoaWt1am8uZnVrdW9rYXxjaGlrdXNoaW5vLmZ1a3Vva2F8Y2hpa3V6ZW4uZnVrdW9rYXxjaHVvLmZ1a3Vva2F8ZGF6YWlmdS5mdWt1b2thfGZ1a3VjaGkuZnVrdW9rYXxoYWthdGEuZnVrdW9rYXxoaWdhc2hpLmZ1a3Vva2F8aGlyb2thd2EuZnVrdW9rYXxoaXNheWFtYS5mdWt1b2thfGlpenVrYS5mdWt1b2thfGluYXRzdWtpLmZ1a3Vva2F8a2Foby5mdWt1b2thfGthc3VnYS5mdWt1b2thfGthc3V5YS5mdWt1b2thfGthd2FyYS5mdWt1b2thfGtlaXNlbi5mdWt1b2thfGtvZ2EuZnVrdW9rYXxrdXJhdGUuZnVrdW9rYXxrdXJvZ2kuZnVrdW9rYXxrdXJ1bWUuZnVrdW9rYXxtaW5hbWkuZnVrdW9rYXxtaXlha28uZnVrdW9rYXxtaXlhbWEuZnVrdW9rYXxtaXlhd2FrYS5mdWt1b2thfG1penVtYWtpLmZ1a3Vva2F8bXVuYWthdGEuZnVrdW9rYXxuYWthZ2F3YS5mdWt1b2thfG5ha2FtYS5mdWt1b2thfG5pc2hpLmZ1a3Vva2F8bm9nYXRhLmZ1a3Vva2F8b2dvcmkuZnVrdW9rYXxva2FnYWtpLmZ1a3Vva2F8b2thd2EuZnVrdW9rYXxva2kuZnVrdW9rYXxvbXV0YS5mdWt1b2thfG9uZ2EuZnVrdW9rYXxvbm9qby5mdWt1b2thfG90by5mdWt1b2thfHNhaWdhd2EuZnVrdW9rYXxzYXNhZ3VyaS5mdWt1b2thfHNoaW5ndS5mdWt1b2thfHNoaW55b3NoaXRvbWkuZnVrdW9rYXxzaG9uYWkuZnVrdW9rYXxzb2VkYS5mdWt1b2thfHN1ZS5mdWt1b2thfHRhY2hpYXJhaS5mdWt1b2thfHRhZ2F3YS5mdWt1b2thfHRha2F0YS5mdWt1b2thfHRvaG8uZnVrdW9rYXx0b3lvdHN1LmZ1a3Vva2F8dHN1aWtpLmZ1a3Vva2F8dWtpaGEuZnVrdW9rYXx1bWkuZnVrdW9rYXx1c3VpLmZ1a3Vva2F8eWFtYWRhLmZ1a3Vva2F8eWFtZS5mdWt1b2thfHlhbmFnYXdhLmZ1a3Vva2F8eXVrdWhhc2hpLmZ1a3Vva2F8YWl6dWJhbmdlLmZ1a3VzaGltYXxhaXp1bWlzYXRvLmZ1a3VzaGltYXxhaXp1d2FrYW1hdHN1LmZ1a3VzaGltYXxhc2FrYXdhLmZ1a3VzaGltYXxiYW5kYWkuZnVrdXNoaW1hfGRhdGUuZnVrdXNoaW1hfGZ1a3VzaGltYS5mdWt1c2hpbWF8ZnVydWRvbm8uZnVrdXNoaW1hfGZ1dGFiYS5mdWt1c2hpbWF8aGFuYXdhLmZ1a3VzaGltYXxoaWdhc2hpLmZ1a3VzaGltYXxoaXJhdGEuZnVrdXNoaW1hfGhpcm9uby5mdWt1c2hpbWF8aWl0YXRlLmZ1a3VzaGltYXxpbmF3YXNoaXJvLmZ1a3VzaGltYXxpc2hpa2F3YS5mdWt1c2hpbWF8aXdha2kuZnVrdXNoaW1hfGl6dW1pemFraS5mdWt1c2hpbWF8a2FnYW1paXNoaS5mdWt1c2hpbWF8a2FuZXlhbWEuZnVrdXNoaW1hfGthd2FtYXRhLmZ1a3VzaGltYXxraXRha2F0YS5mdWt1c2hpbWF8a2l0YXNoaW9iYXJhLmZ1a3VzaGltYXxrb29yaS5mdWt1c2hpbWF8a29yaXlhbWEuZnVrdXNoaW1hfGt1bmltaS5mdWt1c2hpbWF8bWloYXJ1LmZ1a3VzaGltYXxtaXNoaW1hLmZ1a3VzaGltYXxuYW1pZS5mdWt1c2hpbWF8bmFuZ28uZnVrdXNoaW1hfG5pc2hpYWl6dS5mdWt1c2hpbWF8bmlzaGlnby5mdWt1c2hpbWF8b2t1bWEuZnVrdXNoaW1hfG9tb3RlZ28uZnVrdXNoaW1hfG9uby5mdWt1c2hpbWF8b3RhbWEuZnVrdXNoaW1hfHNhbWVnYXdhLmZ1a3VzaGltYXxzaGltb2dvLmZ1a3VzaGltYXxzaGlyYWthd2EuZnVrdXNoaW1hfHNob3dhLmZ1a3VzaGltYXxzb21hLmZ1a3VzaGltYXxzdWthZ2F3YS5mdWt1c2hpbWF8dGFpc2hpbi5mdWt1c2hpbWF8dGFtYWthd2EuZnVrdXNoaW1hfHRhbmFndXJhLmZ1a3VzaGltYXx0ZW5laS5mdWt1c2hpbWF8eWFidWtpLmZ1a3VzaGltYXx5YW1hdG8uZnVrdXNoaW1hfHlhbWF0c3VyaS5mdWt1c2hpbWF8eWFuYWl6dS5mdWt1c2hpbWF8eXVnYXdhLmZ1a3VzaGltYXxhbnBhY2hpLmdpZnV8ZW5hLmdpZnV8Z2lmdS5naWZ1fGdpbmFuLmdpZnV8Z29kby5naWZ1fGd1am8uZ2lmdXxoYXNoaW1hLmdpZnV8aGljaGlzby5naWZ1fGhpZGEuZ2lmdXxoaWdhc2hpc2hpcmFrYXdhLmdpZnV8aWJpZ2F3YS5naWZ1fGlrZWRhLmdpZnV8a2FrYW1pZ2FoYXJhLmdpZnV8a2FuaS5naWZ1fGthc2FoYXJhLmdpZnV8a2FzYW1hdHN1LmdpZnV8a2F3YXVlLmdpZnV8a2l0YWdhdGEuZ2lmdXxtaW5vLmdpZnV8bWlub2thbW8uZ2lmdXxtaXRha2UuZ2lmdXxtaXp1bmFtaS5naWZ1fG1vdG9zdS5naWZ1fG5ha2F0c3VnYXdhLmdpZnV8b2dha2kuZ2lmdXxzYWthaG9naS5naWZ1fHNla2kuZ2lmdXxzZWtpZ2FoYXJhLmdpZnV8c2hpcmFrYXdhLmdpZnV8dGFqaW1pLmdpZnV8dGFrYXlhbWEuZ2lmdXx0YXJ1aS5naWZ1fHRva2kuZ2lmdXx0b21pa2EuZ2lmdXx3YW5vdWNoaS5naWZ1fHlhbWFnYXRhLmdpZnV8eWFvdHN1LmdpZnV8eW9yby5naWZ1fGFubmFrYS5ndW5tYXxjaGl5b2RhLmd1bm1hfGZ1amlva2EuZ3VubWF8aGlnYXNoaWFnYXRzdW1hLmd1bm1hfGlzZXNha2kuZ3VubWF8aXRha3VyYS5ndW5tYXxrYW5uYS5ndW5tYXxrYW5yYS5ndW5tYXxrYXRhc2hpbmEuZ3VubWF8a2F3YWJhLmd1bm1hfGtpcnl1Lmd1bm1hfGt1c2F0c3UuZ3VubWF8bWFlYmFzaGkuZ3VubWF8bWVpd2EuZ3VubWF8bWlkb3JpLmd1bm1hfG1pbmFrYW1pLmd1bm1hfG5hZ2Fub2hhcmEuZ3VubWF8bmFrYW5vam8uZ3VubWF8bmFubW9rdS5ndW5tYXxudW1hdGEuZ3VubWF8b2l6dW1pLmd1bm1hfG9yYS5ndW5tYXxvdGEuZ3VubWF8c2hpYnVrYXdhLmd1bm1hfHNoaW1vbml0YS5ndW5tYXxzaGludG8uZ3VubWF8c2hvd2EuZ3VubWF8dGFrYXNha2kuZ3VubWF8dGFrYXlhbWEuZ3VubWF8dGFtYW11cmEuZ3VubWF8dGF0ZWJheWFzaGkuZ3VubWF8dG9taW9rYS5ndW5tYXx0c3VraXlvbm8uZ3VubWF8dHN1bWFnb2kuZ3VubWF8dWVuby5ndW5tYXx5b3NoaW9rYS5ndW5tYXxhc2FtaW5hbWkuaGlyb3NoaW1hfGRhaXdhLmhpcm9zaGltYXxldGFqaW1hLmhpcm9zaGltYXxmdWNodS5oaXJvc2hpbWF8ZnVrdXlhbWEuaGlyb3NoaW1hfGhhdHN1a2FpY2hpLmhpcm9zaGltYXxoaWdhc2hpaGlyb3NoaW1hLmhpcm9zaGltYXxob25nby5oaXJvc2hpbWF8amluc2VraWtvZ2VuLmhpcm9zaGltYXxrYWl0YS5oaXJvc2hpbWF8a3VpLmhpcm9zaGltYXxrdW1hbm8uaGlyb3NoaW1hfGt1cmUuaGlyb3NoaW1hfG1paGFyYS5oaXJvc2hpbWF8bWl5b3NoaS5oaXJvc2hpbWF8bmFrYS5oaXJvc2hpbWF8b25vbWljaGkuaGlyb3NoaW1hfG9zYWtpa2FtaWppbWEuaGlyb3NoaW1hfG90YWtlLmhpcm9zaGltYXxzYWthLmhpcm9zaGltYXxzZXJhLmhpcm9zaGltYXxzZXJhbmlzaGkuaGlyb3NoaW1hfHNoaW5pY2hpLmhpcm9zaGltYXxzaG9iYXJhLmhpcm9zaGltYXx0YWtlaGFyYS5oaXJvc2hpbWF8YWJhc2hpcmkuaG9ra2FpZG98YWJpcmEuaG9ra2FpZG98YWliZXRzdS5ob2trYWlkb3xha2FiaXJhLmhva2thaWRvfGFra2VzaGkuaG9ra2FpZG98YXNhaGlrYXdhLmhva2thaWRvfGFzaGliZXRzdS5ob2trYWlkb3xhc2hvcm8uaG9ra2FpZG98YXNzYWJ1Lmhva2thaWRvfGF0c3VtYS5ob2trYWlkb3xiaWJhaS5ob2trYWlkb3xiaWVpLmhva2thaWRvfGJpZnVrYS5ob2trYWlkb3xiaWhvcm8uaG9ra2FpZG98YmlyYXRvcmkuaG9ra2FpZG98Y2hpcHB1YmV0c3UuaG9ra2FpZG98Y2hpdG9zZS5ob2trYWlkb3xkYXRlLmhva2thaWRvfGViZXRzdS5ob2trYWlkb3xlbWJldHN1Lmhva2thaWRvfGVuaXdhLmhva2thaWRvfGVyaW1vLmhva2thaWRvfGVzYW4uaG9ra2FpZG98ZXNhc2hpLmhva2thaWRvfGZ1a2FnYXdhLmhva2thaWRvfGZ1a3VzaGltYS5ob2trYWlkb3xmdXJhbm8uaG9ra2FpZG98ZnVydWJpcmEuaG9ra2FpZG98aGFib3JvLmhva2thaWRvfGhha29kYXRlLmhva2thaWRvfGhhbWF0b25iZXRzdS5ob2trYWlkb3xoaWRha2EuaG9ra2FpZG98aGlnYXNoaWthZ3VyYS5ob2trYWlkb3xoaWdhc2hpa2F3YS5ob2trYWlkb3xoaXJvby5ob2trYWlkb3xob2t1cnl1Lmhva2thaWRvfGhva3V0by5ob2trYWlkb3xob25iZXRzdS5ob2trYWlkb3xob3Jva2FuYWkuaG9ra2FpZG98aG9yb25vYmUuaG9ra2FpZG98aWtlZGEuaG9ra2FpZG98aW1ha2FuZS5ob2trYWlkb3xpc2hpa2FyaS5ob2trYWlkb3xpd2FtaXphd2EuaG9ra2FpZG98aXdhbmFpLmhva2thaWRvfGthbWlmdXJhbm8uaG9ra2FpZG98a2FtaWthd2EuaG9ra2FpZG98a2FtaXNoaWhvcm8uaG9ra2FpZG98a2FtaXN1bmFnYXdhLmhva2thaWRvfGthbW9lbmFpLmhva2thaWRvfGtheWFiZS5ob2trYWlkb3xrZW1idWNoaS5ob2trYWlkb3xraWtvbmFpLmhva2thaWRvfGtpbW9iZXRzdS5ob2trYWlkb3xraXRhaGlyb3NoaW1hLmhva2thaWRvfGtpdGFtaS5ob2trYWlkb3xraXlvc2F0by5ob2trYWlkb3xrb3NoaW1penUuaG9ra2FpZG98a3VubmVwcHUuaG9ra2FpZG98a3VyaXlhbWEuaG9ra2FpZG98a3Vyb21hdHN1bmFpLmhva2thaWRvfGt1c2hpcm8uaG9ra2FpZG98a3V0Y2hhbi5ob2trYWlkb3xreW93YS5ob2trYWlkb3xtYXNoaWtlLmhva2thaWRvfG1hdHN1bWFlLmhva2thaWRvfG1pa2FzYS5ob2trYWlkb3xtaW5hbWlmdXJhbm8uaG9ra2FpZG98bW9tYmV0c3UuaG9ra2FpZG98bW9zZXVzaGkuaG9ra2FpZG98bXVrYXdhLmhva2thaWRvfG11cm9yYW4uaG9ra2FpZG98bmFpZS5ob2trYWlkb3xuYWthZ2F3YS5ob2trYWlkb3xuYWthc2F0c3VuYWkuaG9ra2FpZG98bmFrYXRvbWJldHN1Lmhva2thaWRvfG5hbmFlLmhva2thaWRvfG5hbnBvcm8uaG9ra2FpZG98bmF5b3JvLmhva2thaWRvfG5lbXVyby5ob2trYWlkb3xuaWlrYXBwdS5ob2trYWlkb3xuaWtpLmhva2thaWRvfG5pc2hpb2tvcHBlLmhva2thaWRvfG5vYm9yaWJldHN1Lmhva2thaWRvfG51bWF0YS5ob2trYWlkb3xvYmloaXJvLmhva2thaWRvfG9iaXJhLmhva2thaWRvfG9rZXRvLmhva2thaWRvfG9rb3BwZS5ob2trYWlkb3xvdGFydS5ob2trYWlkb3xvdG9iZS5ob2trYWlkb3xvdG9mdWtlLmhva2thaWRvfG90b2luZXBwdS5ob2trYWlkb3xvdW11Lmhva2thaWRvfG96b3JhLmhva2thaWRvfHBpcHB1Lmhva2thaWRvfHJhbmtvc2hpLmhva2thaWRvfHJlYnVuLmhva2thaWRvfHJpa3ViZXRzdS5ob2trYWlkb3xyaXNoaXJpLmhva2thaWRvfHJpc2hpcmlmdWppLmhva2thaWRvfHNhcm9tYS5ob2trYWlkb3xzYXJ1ZnV0c3UuaG9ra2FpZG98c2hha290YW4uaG9ra2FpZG98c2hhcmkuaG9ra2FpZG98c2hpYmVjaGEuaG9ra2FpZG98c2hpYmV0c3UuaG9ra2FpZG98c2hpa2FiZS5ob2trYWlkb3xzaGlrYW9pLmhva2thaWRvfHNoaW1hbWFraS5ob2trYWlkb3xzaGltaXp1Lmhva2thaWRvfHNoaW1va2F3YS5ob2trYWlkb3xzaGluc2hpbm90c3UuaG9ra2FpZG98c2hpbnRva3UuaG9ra2FpZG98c2hpcmFudWthLmhva2thaWRvfHNoaXJhb2kuaG9ra2FpZG98c2hpcml1Y2hpLmhva2thaWRvfHNvYmV0c3UuaG9ra2FpZG98c3VuYWdhd2EuaG9ra2FpZG98dGFpa2kuaG9ra2FpZG98dGFrYXN1Lmhva2thaWRvfHRha2lrYXdhLmhva2thaWRvfHRha2lub3VlLmhva2thaWRvfHRlc2hpa2FnYS5ob2trYWlkb3x0b2JldHN1Lmhva2thaWRvfHRvaG1hLmhva2thaWRvfHRvbWFrb21haS5ob2trYWlkb3x0b21hcmkuaG9ra2FpZG98dG95YS5ob2trYWlkb3x0b3lha28uaG9ra2FpZG98dG95b3RvbWkuaG9ra2FpZG98dG95b3VyYS5ob2trYWlkb3x0c3ViZXRzdS5ob2trYWlkb3x0c3VraWdhdGEuaG9ra2FpZG98dXJha2F3YS5ob2trYWlkb3x1cmF1c3UuaG9ra2FpZG98dXJ5dS5ob2trYWlkb3x1dGFzaGluYWkuaG9ra2FpZG98d2Fra2FuYWkuaG9ra2FpZG98d2Fzc2FtdS5ob2trYWlkb3x5YWt1bW8uaG9ra2FpZG98eW9pY2hpLmhva2thaWRvfGFpb2kuaHlvZ298YWthc2hpLmh5b2dvfGFrby5oeW9nb3xhbWFnYXNha2kuaHlvZ298YW9nYWtpLmh5b2dvfGFzYWdvLmh5b2dvfGFzaGl5YS5oeW9nb3xhd2FqaS5oeW9nb3xmdWt1c2FraS5oeW9nb3xnb3NoaWtpLmh5b2dvfGhhcmltYS5oeW9nb3xoaW1lamkuaHlvZ298aWNoaWthd2EuaHlvZ298aW5hZ2F3YS5oeW9nb3xpdGFtaS5oeW9nb3xrYWtvZ2F3YS5oeW9nb3xrYW1pZ29yaS5oeW9nb3xrYW1pa2F3YS5oeW9nb3xrYXNhaS5oeW9nb3xrYXN1Z2EuaHlvZ298a2F3YW5pc2hpLmh5b2dvfG1pa2kuaHlvZ298bWluYW1pYXdhamkuaHlvZ298bmlzaGlub21peWEuaHlvZ298bmlzaGl3YWtpLmh5b2dvfG9uby5oeW9nb3xzYW5kYS5oeW9nb3xzYW5uYW4uaHlvZ298c2FzYXlhbWEuaHlvZ298c2F5by5oeW9nb3xzaGluZ3UuaHlvZ298c2hpbm9uc2VuLmh5b2dvfHNoaXNvLmh5b2dvfHN1bW90by5oeW9nb3x0YWlzaGkuaHlvZ298dGFrYS5oeW9nb3x0YWthcmF6dWthLmh5b2dvfHRha2FzYWdvLmh5b2dvfHRha2luby5oeW9nb3x0YW1iYS5oeW9nb3x0YXRzdW5vLmh5b2dvfHRveW9va2EuaHlvZ298eWFidS5oeW9nb3x5YXNoaXJvLmh5b2dvfHlva2EuaHlvZ298eW9rYXdhLmh5b2dvfGFtaS5pYmFyYWtpfGFzYWhpLmliYXJha2l8YmFuZG8uaWJhcmFraXxjaGlrdXNlaS5pYmFyYWtpfGRhaWdvLmliYXJha2l8ZnVqaXNoaXJvLmliYXJha2l8aGl0YWNoaS5pYmFyYWtpfGhpdGFjaGluYWthLmliYXJha2l8aGl0YWNoaW9taXlhLmliYXJha2l8aGl0YWNoaW90YS5pYmFyYWtpfGliYXJha2kuaWJhcmFraXxpbmEuaWJhcmFraXxpbmFzaGlraS5pYmFyYWtpfGl0YWtvLmliYXJha2l8aXdhbWEuaWJhcmFraXxqb3NvLmliYXJha2l8a2FtaXN1LmliYXJha2l8a2FzYW1hLmliYXJha2l8a2FzaGltYS5pYmFyYWtpfGthc3VtaWdhdXJhLmliYXJha2l8a29nYS5pYmFyYWtpfG1paG8uaWJhcmFraXxtaXRvLmliYXJha2l8bW9yaXlhLmliYXJha2l8bmFrYS5pYmFyYWtpfG5hbWVnYXRhLmliYXJha2l8b2FyYWkuaWJhcmFraXxvZ2F3YS5pYmFyYWtpfG9taXRhbWEuaWJhcmFraXxyeXVnYXNha2kuaWJhcmFraXxzYWthaS5pYmFyYWtpfHNha3VyYWdhd2EuaWJhcmFraXxzaGltb2RhdGUuaWJhcmFraXxzaGltb3RzdW1hLmliYXJha2l8c2hpcm9zYXRvLmliYXJha2l8c293YS5pYmFyYWtpfHN1aWZ1LmliYXJha2l8dGFrYWhhZ2kuaWJhcmFraXx0YW1hdHN1a3VyaS5pYmFyYWtpfHRva2FpLmliYXJha2l8dG9tb2JlLmliYXJha2l8dG9uZS5pYmFyYWtpfHRvcmlkZS5pYmFyYWtpfHRzdWNoaXVyYS5pYmFyYWtpfHRzdWt1YmEuaWJhcmFraXx1Y2hpaGFyYS5pYmFyYWtpfHVzaGlrdS5pYmFyYWtpfHlhY2hpeW8uaWJhcmFraXx5YW1hZ2F0YS5pYmFyYWtpfHlhd2FyYS5pYmFyYWtpfHl1a2kuaWJhcmFraXxhbmFtaXp1LmlzaGlrYXdhfGhha3VpLmlzaGlrYXdhfGhha3VzYW4uaXNoaWthd2F8a2FnYS5pc2hpa2F3YXxrYWhva3UuaXNoaWthd2F8a2FuYXphd2EuaXNoaWthd2F8a2F3YWtpdGEuaXNoaWthd2F8a29tYXRzdS5pc2hpa2F3YXxuYWthbm90by5pc2hpa2F3YXxuYW5hby5pc2hpa2F3YXxub21pLmlzaGlrYXdhfG5vbm9pY2hpLmlzaGlrYXdhfG5vdG8uaXNoaWthd2F8c2hpa2EuaXNoaWthd2F8c3V6dS5pc2hpa2F3YXx0c3ViYXRhLmlzaGlrYXdhfHRzdXJ1Z2kuaXNoaWthd2F8dWNoaW5hZGEuaXNoaWthd2F8d2FqaW1hLmlzaGlrYXdhfGZ1ZGFpLml3YXRlfGZ1amlzYXdhLml3YXRlfGhhbmFtYWtpLml3YXRlfGhpcmFpenVtaS5pd2F0ZXxoaXJvbm8uaXdhdGV8aWNoaW5vaGUuaXdhdGV8aWNoaW5vc2VraS5pd2F0ZXxpd2FpenVtaS5pd2F0ZXxpd2F0ZS5pd2F0ZXxqb2JvamkuaXdhdGV8a2FtYWlzaGkuaXdhdGV8a2FuZWdhc2FraS5pd2F0ZXxrYXJ1bWFpLml3YXRlfGthd2FpLml3YXRlfGtpdGFrYW1pLml3YXRlfGt1amkuaXdhdGV8a3Vub2hlLml3YXRlfGt1enVtYWtpLml3YXRlfG1peWFrby5pd2F0ZXxtaXp1c2F3YS5pd2F0ZXxtb3Jpb2thLml3YXRlfG5pbm9oZS5pd2F0ZXxub2RhLml3YXRlfG9mdW5hdG8uaXdhdGV8b3NodS5pd2F0ZXxvdHN1Y2hpLml3YXRlfHJpa3V6ZW50YWthdGEuaXdhdGV8c2hpd2EuaXdhdGV8c2hpenVrdWlzaGkuaXdhdGV8c3VtaXRhLml3YXRlfHRhbm9oYXRhLml3YXRlfHRvbm8uaXdhdGV8eWFoYWJhLml3YXRlfHlhbWFkYS5pd2F0ZXxheWFnYXdhLmthZ2F3YXxoaWdhc2hpa2FnYXdhLmthZ2F3YXxrYW5vbmppLmthZ2F3YXxrb3RvaGlyYS5rYWdhd2F8bWFubm8ua2FnYXdhfG1hcnVnYW1lLmthZ2F3YXxtaXRveW8ua2FnYXdhfG5hb3NoaW1hLmthZ2F3YXxzYW51a2kua2FnYXdhfHRhZG90c3Uua2FnYXdhfHRha2FtYXRzdS5rYWdhd2F8dG9ub3Noby5rYWdhd2F8dWNoaW5vbWkua2FnYXdhfHV0YXp1LmthZ2F3YXx6ZW50c3VqaS5rYWdhd2F8YWt1bmUua2Fnb3NoaW1hfGFtYW1pLmthZ29zaGltYXxoaW9raS5rYWdvc2hpbWF8aXNhLmthZ29zaGltYXxpc2VuLmthZ29zaGltYXxpenVtaS5rYWdvc2hpbWF8a2Fnb3NoaW1hLmthZ29zaGltYXxrYW5veWEua2Fnb3NoaW1hfGthd2FuYWJlLmthZ29zaGltYXxraW5rby5rYWdvc2hpbWF8a291eWFtYS5rYWdvc2hpbWF8bWFrdXJhemFraS5rYWdvc2hpbWF8bWF0c3Vtb3RvLmthZ29zaGltYXxtaW5hbWl0YW5lLmthZ29zaGltYXxuYWthdGFuZS5rYWdvc2hpbWF8bmlzaGlub29tb3RlLmthZ29zaGltYXxzYXRzdW1hc2VuZGFpLmthZ29zaGltYXxzb28ua2Fnb3NoaW1hfHRhcnVtaXp1LmthZ29zaGltYXx5dXN1aS5rYWdvc2hpbWF8YWlrYXdhLmthbmFnYXdhfGF0c3VnaS5rYW5hZ2F3YXxheWFzZS5rYW5hZ2F3YXxjaGlnYXNha2kua2FuYWdhd2F8ZWJpbmEua2FuYWdhd2F8ZnVqaXNhd2Eua2FuYWdhd2F8aGFkYW5vLmthbmFnYXdhfGhha29uZS5rYW5hZ2F3YXxoaXJhdHN1a2Eua2FuYWdhd2F8aXNlaGFyYS5rYW5hZ2F3YXxrYWlzZWkua2FuYWdhd2F8a2FtYWt1cmEua2FuYWdhd2F8a2l5b2thd2Eua2FuYWdhd2F8bWF0c3VkYS5rYW5hZ2F3YXxtaW5hbWlhc2hpZ2FyYS5rYW5hZ2F3YXxtaXVyYS5rYW5hZ2F3YXxuYWthaS5rYW5hZ2F3YXxuaW5vbWl5YS5rYW5hZ2F3YXxvZGF3YXJhLmthbmFnYXdhfG9pLmthbmFnYXdhfG9pc28ua2FuYWdhd2F8c2FnYW1paGFyYS5rYW5hZ2F3YXxzYW11a2F3YS5rYW5hZ2F3YXx0c3VrdWkua2FuYWdhd2F8eWFtYWtpdGEua2FuYWdhd2F8eWFtYXRvLmthbmFnYXdhfHlva29zdWthLmthbmFnYXdhfHl1Z2F3YXJhLmthbmFnYXdhfHphbWEua2FuYWdhd2F8enVzaGkua2FuYWdhd2F8YWtpLmtvY2hpfGdlaXNlaS5rb2NoaXxoaWRha2Eua29jaGl8aGlnYXNoaXRzdW5vLmtvY2hpfGluby5rb2NoaXxrYWdhbWkua29jaGl8a2FtaS5rb2NoaXxraXRhZ2F3YS5rb2NoaXxrb2NoaS5rb2NoaXxtaWhhcmEua29jaGl8bW90b3lhbWEua29jaGl8bXVyb3RvLmtvY2hpfG5haGFyaS5rb2NoaXxuYWthbXVyYS5rb2NoaXxuYW5rb2t1LmtvY2hpfG5pc2hpdG9zYS5rb2NoaXxuaXlvZG9nYXdhLmtvY2hpfG9jaGkua29jaGl8b2thd2Eua29jaGl8b3RveW8ua29jaGl8b3RzdWtpLmtvY2hpfHNha2F3YS5rb2NoaXxzdWt1bW8ua29jaGl8c3VzYWtpLmtvY2hpfHRvc2Eua29jaGl8dG9zYXNoaW1penUua29jaGl8dG95by5rb2NoaXx0c3Vuby5rb2NoaXx1bWFqaS5rb2NoaXx5YXN1ZGEua29jaGl8eXVzdWhhcmEua29jaGl8YW1ha3VzYS5rdW1hbW90b3xhcmFvLmt1bWFtb3RvfGFzby5rdW1hbW90b3xjaG95by5rdW1hbW90b3xneW9rdXRvLmt1bWFtb3RvfGhpdG95b3NoaS5rdW1hbW90b3xrYW1pYW1ha3VzYS5rdW1hbW90b3xrYXNoaW1hLmt1bWFtb3RvfGtpa3VjaGkua3VtYW1vdG98a29zYS5rdW1hbW90b3xrdW1hbW90by5rdW1hbW90b3xtYXNoaWtpLmt1bWFtb3RvfG1pZnVuZS5rdW1hbW90b3xtaW5hbWF0YS5rdW1hbW90b3xtaW5hbWlvZ3VuaS5rdW1hbW90b3xuYWdhc3Uua3VtYW1vdG98bmlzaGloYXJhLmt1bWFtb3RvfG9ndW5pLmt1bWFtb3RvfG96dS5rdW1hbW90b3xzdW1vdG8ua3VtYW1vdG98dGFrYW1vcmkua3VtYW1vdG98dWtpLmt1bWFtb3RvfHV0by5rdW1hbW90b3x5YW1hZ2Eua3VtYW1vdG98eWFtYXRvLmt1bWFtb3RvfHlhdHN1c2hpcm8ua3VtYW1vdG98YXlhYmUua3lvdG98ZnVrdWNoaXlhbWEua3lvdG98aGlnYXNoaXlhbWEua3lvdG98aWRlLmt5b3RvfGluZS5reW90b3xqb3lvLmt5b3RvfGthbWVva2Eua3lvdG98a2Ftby5reW90b3xraXRhLmt5b3RvfGtpenUua3lvdG98a3VtaXlhbWEua3lvdG98a3lvdGFtYmEua3lvdG98a3lvdGFuYWJlLmt5b3RvfGt5b3RhbmdvLmt5b3RvfG1haXp1cnUua3lvdG98bWluYW1pLmt5b3RvfG1pbmFtaXlhbWFzaGlyby5reW90b3xtaXlhenUua3lvdG98bXVrby5reW90b3xuYWdhb2tha3lvLmt5b3RvfG5ha2FneW8ua3lvdG98bmFudGFuLmt5b3RvfG95YW1hemFraS5reW90b3xzYWt5by5reW90b3xzZWlrYS5reW90b3x0YW5hYmUua3lvdG98dWppLmt5b3RvfHVqaXRhd2FyYS5reW90b3x3YXp1a2Eua3lvdG98eWFtYXNoaW5hLmt5b3RvfHlhd2F0YS5reW90b3xhc2FoaS5taWV8aW5hYmUubWllfGlzZS5taWV8a2FtZXlhbWEubWllfGthd2Fnb2UubWllfGtpaG8ubWllfGtpc29zYWtpLm1pZXxraXdhLm1pZXxrb21vbm8ubWllfGt1bWFuby5taWV8a3V3YW5hLm1pZXxtYXRzdXNha2EubWllfG1laXdhLm1pZXxtaWhhbWEubWllfG1pbmFtaWlzZS5taWV8bWlzdWdpLm1pZXxtaXlhbWEubWllfG5hYmFyaS5taWV8c2hpbWEubWllfHN1enVrYS5taWV8dGFkby5taWV8dGFpa2kubWllfHRha2kubWllfHRhbWFraS5taWV8dG9iYS5taWV8dHN1Lm1pZXx1ZG9uby5taWV8dXJlc2hpbm8ubWllfHdhdGFyYWkubWllfHlva2thaWNoaS5taWV8ZnVydWthd2EubWl5YWdpfGhpZ2FzaGltYXRzdXNoaW1hLm1peWFnaXxpc2hpbm9tYWtpLm1peWFnaXxpd2FudW1hLm1peWFnaXxrYWt1ZGEubWl5YWdpfGthbWkubWl5YWdpfGthd2FzYWtpLm1peWFnaXxrZXNlbm51bWEubWl5YWdpfG1hcnVtb3JpLm1peWFnaXxtYXRzdXNoaW1hLm1peWFnaXxtaW5hbWlzYW5yaWt1Lm1peWFnaXxtaXNhdG8ubWl5YWdpfG11cmF0YS5taXlhZ2l8bmF0b3JpLm1peWFnaXxvZ2F3YXJhLm1peWFnaXxvaGlyYS5taXlhZ2l8b25hZ2F3YS5taXlhZ2l8b3Nha2kubWl5YWdpfHJpZnUubWl5YWdpfHNlbWluZS5taXlhZ2l8c2hpYmF0YS5taXlhZ2l8c2hpY2hpa2FzaHVrdS5taXlhZ2l8c2hpa2FtYS5taXlhZ2l8c2hpb2dhbWEubWl5YWdpfHNoaXJvaXNoaS5taXlhZ2l8dGFnYWpvLm1peWFnaXx0YWl3YS5taXlhZ2l8dG9tZS5taXlhZ2l8dG9taXlhLm1peWFnaXx3YWt1eWEubWl5YWdpfHdhdGFyaS5taXlhZ2l8eWFtYW1vdG8ubWl5YWdpfHphby5taXlhZ2l8YXlhLm1peWF6YWtpfGViaW5vLm1peWF6YWtpfGdva2FzZS5taXlhemFraXxoeXVnYS5taXlhemFraXxrYWRvZ2F3YS5taXlhemFraXxrYXdhbWluYW1pLm1peWF6YWtpfGtpam8ubWl5YXpha2l8a2l0YWdhd2EubWl5YXpha2l8a2l0YWthdGEubWl5YXpha2l8a2l0YXVyYS5taXlhemFraXxrb2JheWFzaGkubWl5YXpha2l8a3VuaXRvbWkubWl5YXpha2l8a3VzaGltYS5taXlhemFraXxtaW1hdGEubWl5YXpha2l8bWl5YWtvbm9qby5taXlhemFraXxtaXlhemFraS5taXlhemFraXxtb3JvdHN1a2EubWl5YXpha2l8bmljaGluYW4ubWl5YXpha2l8bmlzaGltZXJhLm1peWF6YWtpfG5vYmVva2EubWl5YXpha2l8c2FpdG8ubWl5YXpha2l8c2hpaWJhLm1peWF6YWtpfHNoaW50b21pLm1peWF6YWtpfHRha2FoYXJ1Lm1peWF6YWtpfHRha2FuYWJlLm1peWF6YWtpfHRha2F6YWtpLm1peWF6YWtpfHRzdW5vLm1peWF6YWtpfGFjaGkubmFnYW5vfGFnZW1hdHN1Lm5hZ2Fub3xhbmFuLm5hZ2Fub3xhb2tpLm5hZ2Fub3xhc2FoaS5uYWdhbm98YXp1bWluby5uYWdhbm98Y2hpa3Vob2t1Lm5hZ2Fub3xjaGlrdW1hLm5hZ2Fub3xjaGluby5uYWdhbm98ZnVqaW1pLm5hZ2Fub3xoYWt1YmEubmFnYW5vfGhhcmEubmFnYW5vfGhpcmF5YS5uYWdhbm98aWlkYS5uYWdhbm98aWlqaW1hLm5hZ2Fub3xpaXlhbWEubmFnYW5vfGlpenVuYS5uYWdhbm98aWtlZGEubmFnYW5vfGlrdXNha2EubmFnYW5vfGluYS5uYWdhbm98a2FydWl6YXdhLm5hZ2Fub3xrYXdha2FtaS5uYWdhbm98a2lzby5uYWdhbm98a2lzb2Z1a3VzaGltYS5uYWdhbm98a2l0YWFpa2kubmFnYW5vfGtvbWFnYW5lLm5hZ2Fub3xrb21vcm8ubmFnYW5vfG1hdHN1a2F3YS5uYWdhbm98bWF0c3Vtb3RvLm5hZ2Fub3xtaWFzYS5uYWdhbm98bWluYW1pYWlraS5uYWdhbm98bWluYW1pbWFraS5uYWdhbm98bWluYW1pbWlub3dhLm5hZ2Fub3xtaW5vd2EubmFnYW5vfG1peWFkYS5uYWdhbm98bWl5b3RhLm5hZ2Fub3xtb2NoaXp1a2kubmFnYW5vfG5hZ2Fuby5uYWdhbm98bmFnYXdhLm5hZ2Fub3xuYWdpc28ubmFnYW5vfG5ha2FnYXdhLm5hZ2Fub3xuYWthbm8ubmFnYW5vfG5vemF3YW9uc2VuLm5hZ2Fub3xvYnVzZS5uYWdhbm98b2dhd2EubmFnYW5vfG9rYXlhLm5hZ2Fub3xvbWFjaGkubmFnYW5vfG9taS5uYWdhbm98b29rdXdhLm5hZ2Fub3xvb3NoaWthLm5hZ2Fub3xvdGFraS5uYWdhbm98b3RhcmkubmFnYW5vfHNha2FlLm5hZ2Fub3xzYWtha2kubmFnYW5vfHNha3UubmFnYW5vfHNha3Voby5uYWdhbm98c2hpbW9zdXdhLm5hZ2Fub3xzaGluYW5vbWFjaGkubmFnYW5vfHNoaW9qaXJpLm5hZ2Fub3xzdXdhLm5hZ2Fub3xzdXpha2EubmFnYW5vfHRha2FnaS5uYWdhbm98dGFrYW1vcmkubmFnYW5vfHRha2F5YW1hLm5hZ2Fub3x0YXRlc2hpbmEubmFnYW5vfHRhdHN1bm8ubmFnYW5vfHRvZ2FrdXNoaS5uYWdhbm98dG9ndXJhLm5hZ2Fub3x0b21pLm5hZ2Fub3x1ZWRhLm5hZ2Fub3x3YWRhLm5hZ2Fub3x5YW1hZ2F0YS5uYWdhbm98eWFtYW5vdWNoaS5uYWdhbm98eWFzYWthLm5hZ2Fub3x5YXN1b2thLm5hZ2Fub3xjaGlqaXdhLm5hZ2FzYWtpfGZ1dHN1Lm5hZ2FzYWtpfGdvdG8ubmFnYXNha2l8aGFzYW1pLm5hZ2FzYWtpfGhpcmFkby5uYWdhc2FraXxpa2kubmFnYXNha2l8aXNhaGF5YS5uYWdhc2FraXxrYXdhdGFuYS5uYWdhc2FraXxrdWNoaW5vdHN1Lm5hZ2FzYWtpfG1hdHN1dXJhLm5hZ2FzYWtpfG5hZ2FzYWtpLm5hZ2FzYWtpfG9iYW1hLm5hZ2FzYWtpfG9tdXJhLm5hZ2FzYWtpfG9zZXRvLm5hZ2FzYWtpfHNhaWthaS5uYWdhc2FraXxzYXNlYm8ubmFnYXNha2l8c2VpaGkubmFnYXNha2l8c2hpbWFiYXJhLm5hZ2FzYWtpfHNoaW5rYW1pZ290by5uYWdhc2FraXx0b2dpdHN1Lm5hZ2FzYWtpfHRzdXNoaW1hLm5hZ2FzYWtpfHVuemVuLm5hZ2FzYWtpfGFuZG8ubmFyYXxnb3NlLm5hcmF8aGVndXJpLm5hcmF8aGlnYXNoaXlvc2hpbm8ubmFyYXxpa2FydWdhLm5hcmF8aWtvbWEubmFyYXxrYW1pa2l0YXlhbWEubmFyYXxrYW5tYWtpLm5hcmF8a2FzaGliYS5uYXJhfGthc2hpaGFyYS5uYXJhfGthdHN1cmFnaS5uYXJhfGthd2FpLm5hcmF8a2F3YWthbWkubmFyYXxrYXdhbmlzaGkubmFyYXxrb3J5by5uYXJhfGt1cm90YWtpLm5hcmF8bWl0c3VlLm5hcmF8bWl5YWtlLm5hcmF8bmFyYS5uYXJhfG5vc2VnYXdhLm5hcmF8b2ppLm5hcmF8b3VkYS5uYXJhfG95b2RvLm5hcmF8c2FrdXJhaS5uYXJhfHNhbmdvLm5hcmF8c2hpbW9pY2hpLm5hcmF8c2hpbW9raXRheWFtYS5uYXJhfHNoaW5qby5uYXJhfHNvbmkubmFyYXx0YWthdG9yaS5uYXJhfHRhd2FyYW1vdG8ubmFyYXx0ZW5rYXdhLm5hcmF8dGVucmkubmFyYXx1ZGEubmFyYXx5YW1hdG9rb3JpeWFtYS5uYXJhfHlhbWF0b3Rha2FkYS5uYXJhfHlhbWF6b2UubmFyYXx5b3NoaW5vLm5hcmF8YWdhLm5paWdhdGF8YWdhbm8ubmlpZ2F0YXxnb3Nlbi5uaWlnYXRhfGl0b2lnYXdhLm5paWdhdGF8aXp1bW96YWtpLm5paWdhdGF8am9ldHN1Lm5paWdhdGF8a2Ftby5uaWlnYXRhfGthcml3YS5uaWlnYXRhfGthc2hpd2F6YWtpLm5paWdhdGF8bWluYW1pdW9udW1hLm5paWdhdGF8bWl0c3VrZS5uaWlnYXRhfG11aWthLm5paWdhdGF8bXVyYWthbWkubmlpZ2F0YXxteW9rby5uaWlnYXRhfG5hZ2Fva2EubmlpZ2F0YXxuaWlnYXRhLm5paWdhdGF8b2ppeWEubmlpZ2F0YXxvbWkubmlpZ2F0YXxzYWRvLm5paWdhdGF8c2Fuam8ubmlpZ2F0YXxzZWlyby5uaWlnYXRhfHNlaXJvdS5uaWlnYXRhfHNla2lrYXdhLm5paWdhdGF8c2hpYmF0YS5uaWlnYXRhfHRhZ2FtaS5uaWlnYXRhfHRhaW5haS5uaWlnYXRhfHRvY2hpby5uaWlnYXRhfHRva2FtYWNoaS5uaWlnYXRhfHRzdWJhbWUubmlpZ2F0YXx0c3VuYW4ubmlpZ2F0YXx1b251bWEubmlpZ2F0YXx5YWhpa28ubmlpZ2F0YXx5b2l0YS5uaWlnYXRhfHl1emF3YS5uaWlnYXRhfGJlcHB1Lm9pdGF8YnVuZ29vbm8ub2l0YXxidW5nb3Rha2FkYS5vaXRhfGhhc2FtYS5vaXRhfGhpamkub2l0YXxoaW1lc2hpbWEub2l0YXxoaXRhLm9pdGF8a2FtaXRzdWUub2l0YXxrb2tvbm9lLm9pdGF8a3VqdS5vaXRhfGt1bmlzYWtpLm9pdGF8a3VzdS5vaXRhfG9pdGEub2l0YXxzYWlraS5vaXRhfHRha2V0YS5vaXRhfHRzdWt1bWkub2l0YXx1c2Eub2l0YXx1c3VraS5vaXRhfHl1ZnUub2l0YXxha2Fpd2Eub2theWFtYXxhc2FrdWNoaS5va2F5YW1hfGJpemVuLm9rYXlhbWF8aGF5YXNoaW1hLm9rYXlhbWF8aWJhcmEub2theWFtYXxrYWdhbWluby5va2F5YW1hfGthc2Fva2Eub2theWFtYXxraWJpY2h1by5va2F5YW1hfGt1bWVuYW4ub2theWFtYXxrdXJhc2hpa2kub2theWFtYXxtYW5pd2Eub2theWFtYXxtaXNha2kub2theWFtYXxuYWdpLm9rYXlhbWF8bmlpbWkub2theWFtYXxuaXNoaWF3YWt1cmEub2theWFtYXxva2F5YW1hLm9rYXlhbWF8c2F0b3Noby5va2F5YW1hfHNldG91Y2hpLm9rYXlhbWF8c2hpbmpvLm9rYXlhbWF8c2hvby5va2F5YW1hfHNvamEub2theWFtYXx0YWthaGFzaGkub2theWFtYXx0YW1hbm8ub2theWFtYXx0c3V5YW1hLm9rYXlhbWF8d2FrZS5va2F5YW1hfHlha2FnZS5va2F5YW1hfGFndW5pLm9raW5hd2F8Z2lub3dhbi5va2luYXdhfGdpbm96YS5va2luYXdhfGd1c2hpa2FtaS5va2luYXdhfGhhZWJhcnUub2tpbmF3YXxoaWdhc2hpLm9raW5hd2F8aGlyYXJhLm9raW5hd2F8aWhleWEub2tpbmF3YXxpc2hpZ2FraS5va2luYXdhfGlzaGlrYXdhLm9raW5hd2F8aXRvbWFuLm9raW5hd2F8aXplbmEub2tpbmF3YXxrYWRlbmEub2tpbmF3YXxraW4ub2tpbmF3YXxraXRhZGFpdG8ub2tpbmF3YXxraXRhbmFrYWd1c3VrdS5va2luYXdhfGt1bWVqaW1hLm9raW5hd2F8a3VuaWdhbWkub2tpbmF3YXxtaW5hbWlkYWl0by5va2luYXdhfG1vdG9idS5va2luYXdhfG5hZ28ub2tpbmF3YXxuYWhhLm9raW5hd2F8bmFrYWd1c3VrdS5va2luYXdhfG5ha2lqaW4ub2tpbmF3YXxuYW5qby5va2luYXdhfG5pc2hpaGFyYS5va2luYXdhfG9naW1pLm9raW5hd2F8b2tpbmF3YS5va2luYXdhfG9ubmEub2tpbmF3YXxzaGltb2ppLm9raW5hd2F8dGFrZXRvbWkub2tpbmF3YXx0YXJhbWEub2tpbmF3YXx0b2thc2hpa2kub2tpbmF3YXx0b21pZ3VzdWt1Lm9raW5hd2F8dG9uYWtpLm9raW5hd2F8dXJhc29lLm9raW5hd2F8dXJ1bWEub2tpbmF3YXx5YWVzZS5va2luYXdhfHlvbWl0YW4ub2tpbmF3YXx5b25hYmFydS5va2luYXdhfHlvbmFndW5pLm9raW5hd2F8emFtYW1pLm9raW5hd2F8YWJlbm8ub3Nha2F8Y2hpaGF5YWFrYXNha2Eub3Nha2F8Y2h1by5vc2FrYXxkYWl0by5vc2FrYXxmdWppaWRlcmEub3Nha2F8aGFiaWtpbm8ub3Nha2F8aGFubmFuLm9zYWthfGhpZ2FzaGlvc2FrYS5vc2FrYXxoaWdhc2hpc3VtaXlvc2hpLm9zYWthfGhpZ2FzaGl5b2RvZ2F3YS5vc2FrYXxoaXJha2F0YS5vc2FrYXxpYmFyYWtpLm9zYWthfGlrZWRhLm9zYWthfGl6dW1pLm9zYWthfGl6dW1pb3RzdS5vc2FrYXxpenVtaXNhbm8ub3Nha2F8a2Fkb21hLm9zYWthfGthaXp1a2Eub3Nha2F8a2FuYW4ub3Nha2F8a2FzaGl3YXJhLm9zYWthfGthdGFuby5vc2FrYXxrYXdhY2hpbmFnYW5vLm9zYWthfGtpc2hpd2FkYS5vc2FrYXxraXRhLm9zYWthfGt1bWF0b3JpLm9zYWthfG1hdHN1YmFyYS5vc2FrYXxtaW5hdG8ub3Nha2F8bWlub2gub3Nha2F8bWlzYWtpLm9zYWthfG1vcmlndWNoaS5vc2FrYXxuZXlhZ2F3YS5vc2FrYXxuaXNoaS5vc2FrYXxub3NlLm9zYWthfG9zYWthc2F5YW1hLm9zYWthfHNha2FpLm9zYWthfHNheWFtYS5vc2FrYXxzZW5uYW4ub3Nha2F8c2V0dHN1Lm9zYWthfHNoaWpvbmF3YXRlLm9zYWthfHNoaW1hbW90by5vc2FrYXxzdWl0YS5vc2FrYXx0YWRhb2thLm9zYWthfHRhaXNoaS5vc2FrYXx0YWppcmkub3Nha2F8dGFrYWlzaGkub3Nha2F8dGFrYXRzdWtpLm9zYWthfHRvbmRhYmF5YXNoaS5vc2FrYXx0b3lvbmFrYS5vc2FrYXx0b3lvbm8ub3Nha2F8eWFvLm9zYWthfGFyaWFrZS5zYWdhfGFyaXRhLnNhZ2F8ZnVrdWRvbWkuc2FnYXxnZW5rYWkuc2FnYXxoYW1hdGFtYS5zYWdhfGhpemVuLnNhZ2F8aW1hcmkuc2FnYXxrYW1pbWluZS5zYWdhfGthbnpha2kuc2FnYXxrYXJhdHN1LnNhZ2F8a2FzaGltYS5zYWdhfGtpdGFnYXRhLnNhZ2F8a2l0YWhhdGEuc2FnYXxraXlhbWEuc2FnYXxrb3Vob2t1LnNhZ2F8a3l1cmFnaS5zYWdhfG5pc2hpYXJpdGEuc2FnYXxvZ2kuc2FnYXxvbWFjaGkuc2FnYXxvdWNoaS5zYWdhfHNhZ2Euc2FnYXxzaGlyb2lzaGkuc2FnYXx0YWt1LnNhZ2F8dGFyYS5zYWdhfHRvc3Uuc2FnYXx5b3NoaW5vZ2FyaS5zYWdhfGFyYWthd2Euc2FpdGFtYXxhc2FrYS5zYWl0YW1hfGNoaWNoaWJ1LnNhaXRhbWF8ZnVqaW1pLnNhaXRhbWF8ZnVqaW1pbm8uc2FpdGFtYXxmdWtheWEuc2FpdGFtYXxoYW5uby5zYWl0YW1hfGhhbnl1LnNhaXRhbWF8aGFzdWRhLnNhaXRhbWF8aGF0b2dheWEuc2FpdGFtYXxoYXRveWFtYS5zYWl0YW1hfGhpZGFrYS5zYWl0YW1hfGhpZ2FzaGljaGljaGlidS5zYWl0YW1hfGhpZ2FzaGltYXRzdXlhbWEuc2FpdGFtYXxob25qby5zYWl0YW1hfGluYS5zYWl0YW1hfGlydW1hLnNhaXRhbWF8aXdhdHN1a2kuc2FpdGFtYXxrYW1paXp1bWkuc2FpdGFtYXxrYW1pa2F3YS5zYWl0YW1hfGthbWlzYXRvLnNhaXRhbWF8a2FzdWthYmUuc2FpdGFtYXxrYXdhZ29lLnNhaXRhbWF8a2F3YWd1Y2hpLnNhaXRhbWF8a2F3YWppbWEuc2FpdGFtYXxrYXpvLnNhaXRhbWF8a2l0YW1vdG8uc2FpdGFtYXxrb3NoaWdheWEuc2FpdGFtYXxrb3Vub3N1LnNhaXRhbWF8a3VraS5zYWl0YW1hfGt1bWFnYXlhLnNhaXRhbWF8bWF0c3VidXNoaS5zYWl0YW1hfG1pbmFuby5zYWl0YW1hfG1pc2F0by5zYWl0YW1hfG1peWFzaGlyby5zYWl0YW1hfG1peW9zaGkuc2FpdGFtYXxtb3JveWFtYS5zYWl0YW1hfG5hZ2F0b3JvLnNhaXRhbWF8bmFtZWdhd2Euc2FpdGFtYXxuaWl6YS5zYWl0YW1hfG9nYW5vLnNhaXRhbWF8b2dhd2Euc2FpdGFtYXxvZ29zZS5zYWl0YW1hfG9rZWdhd2Euc2FpdGFtYXxvbWl5YS5zYWl0YW1hfG90YWtpLnNhaXRhbWF8cmFuemFuLnNhaXRhbWF8cnlva2FtaS5zYWl0YW1hfHNhaXRhbWEuc2FpdGFtYXxzYWthZG8uc2FpdGFtYXxzYXR0ZS5zYWl0YW1hfHNheWFtYS5zYWl0YW1hfHNoaWtpLnNhaXRhbWF8c2hpcmFva2Euc2FpdGFtYXxzb2thLnNhaXRhbWF8c3VnaXRvLnNhaXRhbWF8dG9kYS5zYWl0YW1hfHRva2lnYXdhLnNhaXRhbWF8dG9rb3JvemF3YS5zYWl0YW1hfHRzdXJ1Z2FzaGltYS5zYWl0YW1hfHVyYXdhLnNhaXRhbWF8d2FyYWJpLnNhaXRhbWF8eWFzaGlvLnNhaXRhbWF8eW9rb3plLnNhaXRhbWF8eW9uby5zYWl0YW1hfHlvcmlpLnNhaXRhbWF8eW9zaGlkYS5zYWl0YW1hfHlvc2hpa2F3YS5zYWl0YW1hfHlvc2hpbWkuc2FpdGFtYXxhaXNoby5zaGlnYXxnYW1vLnNoaWdhfGhpZ2FzaGlvbWkuc2hpZ2F8aGlrb25lLnNoaWdhfGtva2Euc2hpZ2F8a29uYW4uc2hpZ2F8a29zZWkuc2hpZ2F8a290by5zaGlnYXxrdXNhdHN1LnNoaWdhfG1haWJhcmEuc2hpZ2F8bW9yaXlhbWEuc2hpZ2F8bmFnYWhhbWEuc2hpZ2F8bmlzaGlhemFpLnNoaWdhfG5vdG9nYXdhLnNoaWdhfG9taWhhY2hpbWFuLnNoaWdhfG90c3Uuc2hpZ2F8cml0dG8uc2hpZ2F8cnl1b2guc2hpZ2F8dGFrYXNoaW1hLnNoaWdhfHRha2F0c3VraS5zaGlnYXx0b3JhaGltZS5zaGlnYXx0b3lvc2F0by5zaGlnYXx5YXN1LnNoaWdhfGFrYWdpLnNoaW1hbmV8YW1hLnNoaW1hbmV8Z290c3Uuc2hpbWFuZXxoYW1hZGEuc2hpbWFuZXxoaWdhc2hpaXp1bW8uc2hpbWFuZXxoaWthd2Euc2hpbWFuZXxoaWtpbWkuc2hpbWFuZXxpenVtby5zaGltYW5lfGtha2lub2tpLnNoaW1hbmV8bWFzdWRhLnNoaW1hbmV8bWF0c3VlLnNoaW1hbmV8bWlzYXRvLnNoaW1hbmV8bmlzaGlub3NoaW1hLnNoaW1hbmV8b2hkYS5zaGltYW5lfG9raW5vc2hpbWEuc2hpbWFuZXxva3VpenVtby5zaGltYW5lfHNoaW1hbmUuc2hpbWFuZXx0YW1heXUuc2hpbWFuZXx0c3V3YW5vLnNoaW1hbmV8dW5uYW4uc2hpbWFuZXx5YWt1bW8uc2hpbWFuZXx5YXN1Z2kuc2hpbWFuZXx5YXRzdWthLnNoaW1hbmV8YXJhaS5zaGl6dW9rYXxhdGFtaS5zaGl6dW9rYXxmdWppLnNoaXp1b2thfGZ1amllZGEuc2hpenVva2F8ZnVqaWthd2Euc2hpenVva2F8ZnVqaW5vbWl5YS5zaGl6dW9rYXxmdWt1cm9pLnNoaXp1b2thfGdvdGVtYmEuc2hpenVva2F8aGFpYmFyYS5zaGl6dW9rYXxoYW1hbWF0c3Uuc2hpenVva2F8aGlnYXNoaWl6dS5zaGl6dW9rYXxpdG8uc2hpenVva2F8aXdhdGEuc2hpenVva2F8aXp1LnNoaXp1b2thfGl6dW5va3VuaS5zaGl6dW9rYXxrYWtlZ2F3YS5zaGl6dW9rYXxrYW5uYW1pLnNoaXp1b2thfGthd2FuZWhvbi5zaGl6dW9rYXxrYXdhenUuc2hpenVva2F8a2lrdWdhd2Euc2hpenVva2F8a29zYWkuc2hpenVva2F8bWFraW5vaGFyYS5zaGl6dW9rYXxtYXRzdXpha2kuc2hpenVva2F8bWluYW1paXp1LnNoaXp1b2thfG1pc2hpbWEuc2hpenVva2F8bW9yaW1hY2hpLnNoaXp1b2thfG5pc2hpaXp1LnNoaXp1b2thfG51bWF6dS5zaGl6dW9rYXxvbWFlemFraS5zaGl6dW9rYXxzaGltYWRhLnNoaXp1b2thfHNoaW1penUuc2hpenVva2F8c2hpbW9kYS5zaGl6dW9rYXxzaGl6dW9rYS5zaGl6dW9rYXxzdXNvbm8uc2hpenVva2F8eWFpenUuc2hpenVva2F8eW9zaGlkYS5zaGl6dW9rYXxhc2hpa2FnYS50b2NoaWdpfGJhdG8udG9jaGlnaXxoYWdhLnRvY2hpZ2l8aWNoaWthaS50b2NoaWdpfGl3YWZ1bmUudG9jaGlnaXxrYW1pbm9rYXdhLnRvY2hpZ2l8a2FudW1hLnRvY2hpZ2l8a2FyYXN1eWFtYS50b2NoaWdpfGt1cm9pc28udG9jaGlnaXxtYXNoaWtvLnRvY2hpZ2l8bWlidS50b2NoaWdpfG1va2EudG9jaGlnaXxtb3RlZ2kudG9jaGlnaXxuYXN1LnRvY2hpZ2l8bmFzdXNoaW9iYXJhLnRvY2hpZ2l8bmlra28udG9jaGlnaXxuaXNoaWthdGEudG9jaGlnaXxub2dpLnRvY2hpZ2l8b2hpcmEudG9jaGlnaXxvaHRhd2FyYS50b2NoaWdpfG95YW1hLnRvY2hpZ2l8c2FrdXJhLnRvY2hpZ2l8c2Fuby50b2NoaWdpfHNoaW1vdHN1a2UudG9jaGlnaXxzaGlveWEudG9jaGlnaXx0YWthbmV6YXdhLnRvY2hpZ2l8dG9jaGlnaS50b2NoaWdpfHRzdWdhLnRvY2hpZ2l8dWppaWUudG9jaGlnaXx1dHN1bm9taXlhLnRvY2hpZ2l8eWFpdGEudG9jaGlnaXxhaXp1bWkudG9rdXNoaW1hfGFuYW4udG9rdXNoaW1hfGljaGliYS50b2t1c2hpbWF8aXRhbm8udG9rdXNoaW1hfGthaW5hbi50b2t1c2hpbWF8a29tYXRzdXNoaW1hLnRva3VzaGltYXxtYXRzdXNoaWdlLnRva3VzaGltYXxtaW1hLnRva3VzaGltYXxtaW5hbWkudG9rdXNoaW1hfG1peW9zaGkudG9rdXNoaW1hfG11Z2kudG9rdXNoaW1hfG5ha2FnYXdhLnRva3VzaGltYXxuYXJ1dG8udG9rdXNoaW1hfHNhbmFnb2NoaS50b2t1c2hpbWF8c2hpc2hpa3VpLnRva3VzaGltYXx0b2t1c2hpbWEudG9rdXNoaW1hfHdhamlraS50b2t1c2hpbWF8YWRhY2hpLnRva3lvfGFraXJ1bm8udG9reW98YWtpc2hpbWEudG9reW98YW9nYXNoaW1hLnRva3lvfGFyYWthd2EudG9reW98YnVua3lvLnRva3lvfGNoaXlvZGEudG9reW98Y2hvZnUudG9reW98Y2h1by50b2t5b3xlZG9nYXdhLnRva3lvfGZ1Y2h1LnRva3lvfGZ1c3NhLnRva3lvfGhhY2hpam8udG9reW98aGFjaGlvamkudG9reW98aGFtdXJhLnRva3lvfGhpZ2FzaGlrdXJ1bWUudG9reW98aGlnYXNoaW11cmF5YW1hLnRva3lvfGhpZ2FzaGl5YW1hdG8udG9reW98aGluby50b2t5b3xoaW5vZGUudG9reW98aGlub2hhcmEudG9reW98aW5hZ2kudG9reW98aXRhYmFzaGkudG9reW98a2F0c3VzaGlrYS50b2t5b3xraXRhLnRva3lvfGtpeW9zZS50b2t5b3xrb2RhaXJhLnRva3lvfGtvZ2FuZWkudG9reW98a29rdWJ1bmppLnRva3lvfGtvbWFlLnRva3lvfGtvdG8udG9reW98a291enVzaGltYS50b2t5b3xrdW5pdGFjaGkudG9reW98bWFjaGlkYS50b2t5b3xtZWd1cm8udG9reW98bWluYXRvLnRva3lvfG1pdGFrYS50b2t5b3xtaXp1aG8udG9reW98bXVzYXNoaW11cmF5YW1hLnRva3lvfG11c2FzaGluby50b2t5b3xuYWthbm8udG9reW98bmVyaW1hLnRva3lvfG9nYXNhd2FyYS50b2t5b3xva3V0YW1hLnRva3lvfG9tZS50b2t5b3xvc2hpbWEudG9reW98b3RhLnRva3lvfHNldGFnYXlhLnRva3lvfHNoaWJ1eWEudG9reW98c2hpbmFnYXdhLnRva3lvfHNoaW5qdWt1LnRva3lvfHN1Z2luYW1pLnRva3lvfHN1bWlkYS50b2t5b3x0YWNoaWthd2EudG9reW98dGFpdG8udG9reW98dGFtYS50b2t5b3x0b3NoaW1hLnRva3lvfGNoaXp1LnRvdHRvcml8aGluby50b3R0b3JpfGthd2FoYXJhLnRvdHRvcml8a29nZS50b3R0b3JpfGtvdG91cmEudG90dG9yaXxtaXNhc2EudG90dG9yaXxuYW5idS50b3R0b3JpfG5pY2hpbmFuLnRvdHRvcml8c2FrYWltaW5hdG8udG90dG9yaXx0b3R0b3JpLnRvdHRvcml8d2FrYXNhLnRvdHRvcml8eWF6dS50b3R0b3JpfHlvbmFnby50b3R0b3JpfGFzYWhpLnRveWFtYXxmdWNodS50b3lhbWF8ZnVrdW1pdHN1LnRveWFtYXxmdW5haGFzaGkudG95YW1hfGhpbWkudG95YW1hfGltaXp1LnRveWFtYXxpbmFtaS50b3lhbWF8am9oYW5hLnRveWFtYXxrYW1paWNoaS50b3lhbWF8a3Vyb2JlLnRveWFtYXxuYWthbmlpa2F3YS50b3lhbWF8bmFtZXJpa2F3YS50b3lhbWF8bmFudG8udG95YW1hfG55dXplbi50b3lhbWF8b3lhYmUudG95YW1hfHRhaXJhLnRveWFtYXx0YWthb2thLnRveWFtYXx0YXRleWFtYS50b3lhbWF8dG9nYS50b3lhbWF8dG9uYW1pLnRveWFtYXx0b3lhbWEudG95YW1hfHVuYXp1a2kudG95YW1hfHVvenUudG95YW1hfHlhbWFkYS50b3lhbWF8YXJpZGEud2FrYXlhbWF8YXJpZGFnYXdhLndha2F5YW1hfGdvYm8ud2FrYXlhbWF8aGFzaGltb3RvLndha2F5YW1hfGhpZGFrYS53YWtheWFtYXxoaXJvZ2F3YS53YWtheWFtYXxpbmFtaS53YWtheWFtYXxpd2FkZS53YWtheWFtYXxrYWluYW4ud2FrYXlhbWF8a2FtaXRvbmRhLndha2F5YW1hfGthdHN1cmFnaS53YWtheWFtYXxraW1pbm8ud2FrYXlhbWF8a2lub2thd2Eud2FrYXlhbWF8a2l0YXlhbWEud2FrYXlhbWF8a295YS53YWtheWFtYXxrb3phLndha2F5YW1hfGtvemFnYXdhLndha2F5YW1hfGt1ZG95YW1hLndha2F5YW1hfGt1c2hpbW90by53YWtheWFtYXxtaWhhbWEud2FrYXlhbWF8bWlzYXRvLndha2F5YW1hfG5hY2hpa2F0c3V1cmEud2FrYXlhbWF8c2hpbmd1Lndha2F5YW1hfHNoaXJhaGFtYS53YWtheWFtYXx0YWlqaS53YWtheWFtYXx0YW5hYmUud2FrYXlhbWF8d2FrYXlhbWEud2FrYXlhbWF8eXVhc2Eud2FrYXlhbWF8eXVyYS53YWtheWFtYXxhc2FoaS55YW1hZ2F0YXxmdW5hZ2F0YS55YW1hZ2F0YXxoaWdhc2hpbmUueWFtYWdhdGF8aWlkZS55YW1hZ2F0YXxrYWhva3UueWFtYWdhdGF8a2FtaW5veWFtYS55YW1hZ2F0YXxrYW5leWFtYS55YW1hZ2F0YXxrYXdhbmlzaGkueWFtYWdhdGF8bWFtdXJvZ2F3YS55YW1hZ2F0YXxtaWthd2EueWFtYWdhdGF8bXVyYXlhbWEueWFtYWdhdGF8bmFnYWkueWFtYWdhdGF8bmFrYXlhbWEueWFtYWdhdGF8bmFueW8ueWFtYWdhdGF8bmlzaGlrYXdhLnlhbWFnYXRhfG9iYW5hemF3YS55YW1hZ2F0YXxvZS55YW1hZ2F0YXxvZ3VuaS55YW1hZ2F0YXxvaGt1cmEueWFtYWdhdGF8b2lzaGlkYS55YW1hZ2F0YXxzYWdhZS55YW1hZ2F0YXxzYWthdGEueWFtYWdhdGF8c2FrZWdhd2EueWFtYWdhdGF8c2hpbmpvLnlhbWFnYXRhfHNoaXJhdGFrYS55YW1hZ2F0YXxzaG9uYWkueWFtYWdhdGF8dGFrYWhhdGEueWFtYWdhdGF8dGVuZG8ueWFtYWdhdGF8dG96YXdhLnlhbWFnYXRhfHRzdXJ1b2thLnlhbWFnYXRhfHlhbWFnYXRhLnlhbWFnYXRhfHlhbWFub2JlLnlhbWFnYXRhfHlvbmV6YXdhLnlhbWFnYXRhfHl1emEueWFtYWdhdGF8YWJ1LnlhbWFndWNoaXxoYWdpLnlhbWFndWNoaXxoaWthcmkueWFtYWd1Y2hpfGhvZnUueWFtYWd1Y2hpfGl3YWt1bmkueWFtYWd1Y2hpfGt1ZGFtYXRzdS55YW1hZ3VjaGl8bWl0b3UueWFtYWd1Y2hpfG5hZ2F0by55YW1hZ3VjaGl8b3NoaW1hLnlhbWFndWNoaXxzaGltb25vc2VraS55YW1hZ3VjaGl8c2h1bmFuLnlhbWFndWNoaXx0YWJ1c2UueWFtYWd1Y2hpfHRva3V5YW1hLnlhbWFndWNoaXx0b3lvdGEueWFtYWd1Y2hpfHViZS55YW1hZ3VjaGl8eXV1LnlhbWFndWNoaXxjaHVvLnlhbWFuYXNoaXxkb3NoaS55YW1hbmFzaGl8ZnVlZnVraS55YW1hbmFzaGl8ZnVqaWthd2EueWFtYW5hc2hpfGZ1amlrYXdhZ3VjaGlrby55YW1hbmFzaGl8ZnVqaXlvc2hpZGEueWFtYW5hc2hpfGhheWFrYXdhLnlhbWFuYXNoaXxob2t1dG8ueWFtYW5hc2hpfGljaGlrYXdhbWlzYXRvLnlhbWFuYXNoaXxrYWkueWFtYW5hc2hpfGtvZnUueWFtYW5hc2hpfGtvc2h1LnlhbWFuYXNoaXxrb3N1Z2UueWFtYW5hc2hpfG1pbmFtaS1hbHBzLnlhbWFuYXNoaXxtaW5vYnUueWFtYW5hc2hpfG5ha2FtaWNoaS55YW1hbmFzaGl8bmFuYnUueWFtYW5hc2hpfG5hcnVzYXdhLnlhbWFuYXNoaXxuaXJhc2FraS55YW1hbmFzaGl8bmlzaGlrYXRzdXJhLnlhbWFuYXNoaXxvc2hpbm8ueWFtYW5hc2hpfG90c3VraS55YW1hbmFzaGl8c2hvd2EueWFtYW5hc2hpfHRhYmF5YW1hLnlhbWFuYXNoaXx0c3VydS55YW1hbmFzaGl8dWVub2hhcmEueWFtYW5hc2hpfHlhbWFuYWtha28ueWFtYW5hc2hpfHlhbWFuYXNoaS55YW1hbmFzaGl8YmxvZ3Nwb3RcIixcImtlXCI6XCIqfGJsb2dzcG90LmNvXCIsXCJrZ1wiOlwib3JnfG5ldHxjb218ZWR1fGdvdnxtaWxcIixcImtoXCI6XCIqXCIsXCJraVwiOlwiZWR1fGJpenxuZXR8b3JnfGdvdnxpbmZvfGNvbVwiLFwia21cIjpcIm9yZ3xub218Z292fHByZHx0bXxlZHV8bWlsfGFzc3xjb218Y29vcHxhc3NvfHByZXNzZXxtZWRlY2lufG5vdGFpcmVzfHBoYXJtYWNpZW5zfHZldGVyaW5haXJlfGdvdXZcIixcImtuXCI6XCJuZXR8b3JnfGVkdXxnb3ZcIixcImtwXCI6XCJjb218ZWR1fGdvdnxvcmd8cmVwfHRyYVwiLFwia3JcIjpcImFjfGNvfGVzfGdvfGhzfGtnfG1pbHxtc3xuZXxvcnxwZXxyZXxzY3xidXNhbnxjaHVuZ2J1a3xjaHVuZ25hbXxkYWVndXxkYWVqZW9ufGdhbmd3b258Z3dhbmdqdXxneWVvbmdidWt8Z3llb25nZ2l8Z3llb25nbmFtfGluY2hlb258amVqdXxqZW9uYnVrfGplb25uYW18c2VvdWx8dWxzYW58YmxvZ3Nwb3RcIixcImt3XCI6XCIqXCIsXCJreVwiOlwiZWR1fGdvdnxjb218b3JnfG5ldFwiLFwia3pcIjpcIm9yZ3xlZHV8bmV0fGdvdnxtaWx8Y29tXCIsXCJsYVwiOlwiaW50fG5ldHxpbmZvfGVkdXxnb3Z8cGVyfGNvbXxvcmd8Y1wiLFwibGJcIjpcImNvbXxlZHV8Z292fG5ldHxvcmdcIixcImxjXCI6XCJjb218bmV0fGNvfG9yZ3xlZHV8Z292XCIsXCJsaVwiOlwiYmxvZ3Nwb3RcIixcImxrXCI6XCJnb3Z8c2NofG5ldHxpbnR8Y29tfG9yZ3xlZHV8bmdvfHNvY3x3ZWJ8bHRkfGFzc258Z3JwfGhvdGVsfGFjXCIsXCJsclwiOlwiY29tfGVkdXxnb3Z8b3JnfG5ldFwiLFwibHNcIjpcImNvfG9yZ1wiLFwibHRcIjpcImdvdnxibG9nc3BvdFwiLFwibHVcIjpcImJsb2dzcG90XCIsXCJsdlwiOlwiY29tfGVkdXxnb3Z8b3JnfG1pbHxpZHxuZXR8YXNufGNvbmZcIixcImx5XCI6XCJjb218bmV0fGdvdnxwbGN8ZWR1fHNjaHxtZWR8b3JnfGlkXCIsXCJtYVwiOlwiY298bmV0fGdvdnxvcmd8YWN8cHJlc3NcIixcIm1jXCI6XCJ0bXxhc3NvXCIsXCJtZFwiOlwiYmxvZ3Nwb3RcIixcIm1lXCI6XCJjb3xuZXR8b3JnfGVkdXxhY3xnb3Z8aXRzfHByaXZcIixcIm1nXCI6XCJvcmd8bm9tfGdvdnxwcmR8dG18ZWR1fG1pbHxjb218Y29cIixcIm1oXCI6XCJcIixcIm1pbFwiOlwiXCIsXCJta1wiOlwiY29tfG9yZ3xuZXR8ZWR1fGdvdnxpbmZ8bmFtZXxibG9nc3BvdFwiLFwibWxcIjpcImNvbXxlZHV8Z291dnxnb3Z8bmV0fG9yZ3xwcmVzc2VcIixcIm1tXCI6XCIqXCIsXCJtblwiOlwiZ292fGVkdXxvcmd8bnljXCIsXCJtb1wiOlwiY29tfG5ldHxvcmd8ZWR1fGdvdlwiLFwibW9iaVwiOlwiXCIsXCJtcFwiOlwiXCIsXCJtcVwiOlwiXCIsXCJtclwiOlwiZ292fGJsb2dzcG90XCIsXCJtc1wiOlwiY29tfGVkdXxnb3Z8bmV0fG9yZ1wiLFwibXRcIjpcImNvbXxlZHV8bmV0fG9yZ3xibG9nc3BvdC5jb21cIixcIm11XCI6XCJjb218bmV0fG9yZ3xnb3Z8YWN8Y298b3JcIixcIm11c2V1bVwiOlwiYWNhZGVteXxhZ3JpY3VsdHVyZXxhaXJ8YWlyZ3VhcmR8YWxhYmFtYXxhbGFza2F8YW1iZXJ8YW1idWxhbmNlfGFtZXJpY2FufGFtZXJpY2FuYXxhbWVyaWNhbmFudGlxdWVzfGFtZXJpY2FuYXJ0fGFtc3RlcmRhbXxhbmR8YW5uZWZyYW5rfGFudGhyb3xhbnRocm9wb2xvZ3l8YW50aXF1ZXN8YXF1YXJpdW18YXJib3JldHVtfGFyY2hhZW9sb2dpY2FsfGFyY2hhZW9sb2d5fGFyY2hpdGVjdHVyZXxhcnR8YXJ0YW5kZGVzaWdufGFydGNlbnRlcnxhcnRkZWNvfGFydGVkdWNhdGlvbnxhcnRnYWxsZXJ5fGFydHN8YXJ0c2FuZGNyYWZ0c3xhc21hdGFydHxhc3Nhc3NpbmF0aW9ufGFzc2lzaXxhc3NvY2lhdGlvbnxhc3Ryb25vbXl8YXRsYW50YXxhdXN0aW58YXVzdHJhbGlhfGF1dG9tb3RpdmV8YXZpYXRpb258YXhpc3xiYWRham96fGJhZ2hkYWR8YmFobnxiYWxlfGJhbHRpbW9yZXxiYXJjZWxvbmF8YmFzZWJhbGx8YmFzZWx8YmF0aHN8YmF1ZXJufGJlYXV4YXJ0c3xiZWVsZGVuZ2VsdWlkfGJlbGxldnVlfGJlcmdiYXV8YmVya2VsZXl8YmVybGlufGJlcm58YmlibGV8YmlsYmFvfGJpbGx8YmlyZGFydHxiaXJ0aHBsYWNlfGJvbm58Ym9zdG9ufGJvdGFuaWNhbHxib3RhbmljYWxnYXJkZW58Ym90YW5pY2dhcmRlbnxib3Rhbnl8YnJhbmR5d2luZXZhbGxleXxicmFzaWx8YnJpc3RvbHxicml0aXNofGJyaXRpc2hjb2x1bWJpYXxicm9hZGNhc3R8YnJ1bmVsfGJydXNzZWx8YnJ1c3NlbHN8YnJ1eGVsbGVzfGJ1aWxkaW5nfGJ1cmdob2Z8YnVzfGJ1c2hleXxjYWRhcXVlc3xjYWxpZm9ybmlhfGNhbWJyaWRnZXxjYW58Y2FuYWRhfGNhcGVicmV0b258Y2FycmllcnxjYXJ0b29uYXJ0fGNhc2FkZWxhbW9uZWRhfGNhc3RsZXxjYXN0cmVzfGNlbHRpY3xjZW50ZXJ8Y2hhdHRhbm9vZ2F8Y2hlbHRlbmhhbXxjaGVzYXBlYWtlYmF5fGNoaWNhZ298Y2hpbGRyZW58Y2hpbGRyZW5zfGNoaWxkcmVuc2dhcmRlbnxjaGlyb3ByYWN0aWN8Y2hvY29sYXRlfGNocmlzdGlhbnNidXJnfGNpbmNpbm5hdGl8Y2luZW1hfGNpcmN1c3xjaXZpbGlzYXRpb258Y2l2aWxpemF0aW9ufGNpdmlsd2FyfGNsaW50b258Y2xvY2t8Y29hbHxjb2FzdGFsZGVmZW5jZXxjb2R5fGNvbGR3YXJ8Y29sbGVjdGlvbnxjb2xvbmlhbHdpbGxpYW1zYnVyZ3xjb2xvcmFkb3BsYXRlYXV8Y29sdW1iaWF8Y29sdW1idXN8Y29tbXVuaWNhdGlvbnxjb21tdW5pY2F0aW9uc3xjb21tdW5pdHl8Y29tcHV0ZXJ8Y29tcHV0ZXJoaXN0b3J5fHhuLS1jb211bmljYWVzLXY2YTJvfGNvbnRlbXBvcmFyeXxjb250ZW1wb3JhcnlhcnR8Y29udmVudHxjb3BlbmhhZ2VufGNvcnBvcmF0aW9ufHhuLS1jb3JyZWlvcy1lLXRlbGVjb211bmljYWVzLWdoYzI5YXxjb3J2ZXR0ZXxjb3N0dW1lfGNvdW50cnllc3RhdGV8Y291bnR5fGNyYWZ0c3xjcmFuYnJvb2t8Y3JlYXRpb258Y3VsdHVyYWx8Y3VsdHVyYWxjZW50ZXJ8Y3VsdHVyZXxjeWJlcnxjeW1ydXxkYWxpfGRhbGxhc3xkYXRhYmFzZXxkZHJ8ZGVjb3JhdGl2ZWFydHN8ZGVsYXdhcmV8ZGVsbWVuaG9yc3R8ZGVubWFya3xkZXBvdHxkZXNpZ258ZGV0cm9pdHxkaW5vc2F1cnxkaXNjb3Zlcnl8ZG9sbHN8ZG9ub3N0aWF8ZHVyaGFtfGVhc3RhZnJpY2F8ZWFzdGNvYXN0fGVkdWNhdGlvbnxlZHVjYXRpb25hbHxlZ3lwdGlhbnxlaXNlbmJhaG58ZWxidXJnfGVsdmVuZHJlbGx8ZW1icm9pZGVyeXxlbmN5Y2xvcGVkaWN8ZW5nbGFuZHxlbnRvbW9sb2d5fGVudmlyb25tZW50fGVudmlyb25tZW50YWxjb25zZXJ2YXRpb258ZXBpbGVwc3l8ZXNzZXh8ZXN0YXRlfGV0aG5vbG9neXxleGV0ZXJ8ZXhoaWJpdGlvbnxmYW1pbHl8ZmFybXxmYXJtZXF1aXBtZW50fGZhcm1lcnN8ZmFybXN0ZWFkfGZpZWxkfGZpZ3VlcmVzfGZpbGF0ZWxpYXxmaWxtfGZpbmVhcnR8ZmluZWFydHN8ZmlubGFuZHxmbGFuZGVyc3xmbG9yaWRhfGZvcmNlfGZvcnRtaXNzb3VsYXxmb3J0d29ydGh8Zm91bmRhdGlvbnxmcmFuY2Fpc2V8ZnJhbmtmdXJ0fGZyYW56aXNrYW5lcnxmcmVlbWFzb25yeXxmcmVpYnVyZ3xmcmlib3VyZ3xmcm9nfGZ1bmRhY2lvfGZ1cm5pdHVyZXxnYWxsZXJ5fGdhcmRlbnxnYXRld2F5fGdlZWx2aW5ja3xnZW1vbG9naWNhbHxnZW9sb2d5fGdlb3JnaWF8Z2llc3NlbnxnbGFzfGdsYXNzfGdvcmdlfGdyYW5kcmFwaWRzfGdyYXp8Z3Vlcm5zZXl8aGFsbG9mZmFtZXxoYW1idXJnfGhhbmRzb258aGFydmVzdGNlbGVicmF0aW9ufGhhd2FpaXxoZWFsdGh8aGVpbWF0dW5kdWhyZW58aGVsbGFzfGhlbHNpbmtpfGhlbWJ5Z2RzZm9yYnVuZHxoZXJpdGFnZXxoaXN0b2lyZXxoaXN0b3JpY2FsfGhpc3RvcmljYWxzb2NpZXR5fGhpc3RvcmljaG91c2VzfGhpc3RvcmlzY2h8aGlzdG9yaXNjaGVzfGhpc3Rvcnl8aGlzdG9yeW9mc2NpZW5jZXxob3JvbG9neXxob3VzZXxodW1hbml0aWVzfGlsbHVzdHJhdGlvbnxpbWFnZWFuZHNvdW5kfGluZGlhbnxpbmRpYW5hfGluZGlhbmFwb2xpc3xpbmRpYW5tYXJrZXR8aW50ZWxsaWdlbmNlfGludGVyYWN0aXZlfGlyYXF8aXJvbnxpc2xlb2ZtYW58amFtaXNvbnxqZWZmZXJzb258amVydXNhbGVtfGpld2Vscnl8amV3aXNofGpld2lzaGFydHxqZmt8am91cm5hbGlzbXxqdWRhaWNhfGp1ZHlnYXJsYW5kfGp1ZWRpc2NoZXN8anVpZnxrYXJhdGV8a2FyaWthdHVyfGtpZHN8a29lYmVuaGF2bnxrb2VsbnxrdW5zdHxrdW5zdHNhbW1sdW5nfGt1bnN0dW5kZGVzaWdufGxhYm9yfGxhYm91cnxsYWpvbGxhfGxhbmNhc2hpcmV8bGFuZGVzfGxhbnN8eG4tLWxucy1xbGF8bGFyc3NvbnxsZXdpc21pbGxlcnxsaW5jb2xufGxpbnp8bGl2aW5nfGxpdmluZ2hpc3Rvcnl8bG9jYWxoaXN0b3J5fGxvbmRvbnxsb3NhbmdlbGVzfGxvdXZyZXxsb3lhbGlzdHxsdWNlcm5lfGx1eGVtYm91cmd8bHV6ZXJufG1hZHxtYWRyaWR8bWFsbG9yY2F8bWFuY2hlc3RlcnxtYW5zaW9ufG1hbnNpb25zfG1hbnh8bWFyYnVyZ3xtYXJpdGltZXxtYXJpdGltb3xtYXJ5bGFuZHxtYXJ5bGh1cnN0fG1lZGlhfG1lZGljYWx8bWVkaXppbmhpc3RvcmlzY2hlc3xtZWVyZXN8bWVtb3JpYWx8bWVzYXZlcmRlfG1pY2hpZ2FufG1pZGF0bGFudGljfG1pbGl0YXJ5fG1pbGx8bWluZXJzfG1pbmluZ3xtaW5uZXNvdGF8bWlzc2lsZXxtaXNzb3VsYXxtb2Rlcm58bW9tYXxtb25leXxtb25tb3V0aHxtb250aWNlbGxvfG1vbnRyZWFsfG1vc2Nvd3xtb3RvcmN5Y2xlfG11ZW5jaGVufG11ZW5zdGVyfG11bGhvdXNlfG11bmNpZXxtdXNlZXR8bXVzZXVtY2VudGVyfG11c2V1bXZlcmVuaWdpbmd8bXVzaWN8bmF0aW9uYWx8bmF0aW9uYWxmaXJlYXJtc3xuYXRpb25hbGhlcml0YWdlfG5hdGl2ZWFtZXJpY2FufG5hdHVyYWxoaXN0b3J5fG5hdHVyYWxoaXN0b3J5bXVzZXVtfG5hdHVyYWxzY2llbmNlc3xuYXR1cmV8bmF0dXJoaXN0b3Jpc2NoZXN8bmF0dXVyd2V0ZW5zY2hhcHBlbnxuYXVtYnVyZ3xuYXZhbHxuZWJyYXNrYXxuZXVlc3xuZXdoYW1wc2hpcmV8bmV3amVyc2V5fG5ld21leGljb3xuZXdwb3J0fG5ld3NwYXBlcnxuZXd5b3JrfG5pZXBjZXxub3Jmb2xrfG5vcnRofG5yd3xudWVybmJlcmd8bnVyZW1iZXJnfG55Y3xueW55fG9jZWFub2dyYXBoaWN8b2NlYW5vZ3JhcGhpcXVlfG9tYWhhfG9ubGluZXxvbnRhcmlvfG9wZW5haXJ8b3JlZ29ufG9yZWdvbnRyYWlsfG90YWdvfG94Zm9yZHxwYWNpZmljfHBhZGVyYm9ybnxwYWxhY2V8cGFsZW98cGFsbXNwcmluZ3N8cGFuYW1hfHBhcmlzfHBhc2FkZW5hfHBoYXJtYWN5fHBoaWxhZGVscGhpYXxwaGlsYWRlbHBoaWFhcmVhfHBoaWxhdGVseXxwaG9lbml4fHBob3RvZ3JhcGh5fHBpbG90c3xwaXR0c2J1cmdofHBsYW5ldGFyaXVtfHBsYW50YXRpb258cGxhbnRzfHBsYXphfHBvcnRhbHxwb3J0bGFuZHxwb3J0bGxpZ2F0fHBvc3RzLWFuZC10ZWxlY29tbXVuaWNhdGlvbnN8cHJlc2VydmF0aW9ufHByZXNpZGlvfHByZXNzfHByb2plY3R8cHVibGljfHB1Ym9sfHF1ZWJlY3xyYWlscm9hZHxyYWlsd2F5fHJlc2VhcmNofHJlc2lzdGFuY2V8cmlvZGVqYW5laXJvfHJvY2hlc3Rlcnxyb2NrYXJ0fHJvbWF8cnVzc2lhfHNhaW50bG91aXN8c2FsZW18c2FsdmFkb3JkYWxpfHNhbHpidXJnfHNhbmRpZWdvfHNhbmZyYW5jaXNjb3xzYW50YWJhcmJhcmF8c2FudGFjcnV6fHNhbnRhZmV8c2Fza2F0Y2hld2FufHNhdHh8c2F2YW5uYWhnYXxzY2hsZXNpc2NoZXN8c2Nob2VuYnJ1bm58c2Nob2tvbGFkZW58c2Nob29sfHNjaHdlaXp8c2NpZW5jZXxzY2llbmNlYW5kaGlzdG9yeXxzY2llbmNlYW5kaW5kdXN0cnl8c2NpZW5jZWNlbnRlcnxzY2llbmNlY2VudGVyc3xzY2llbmNlLWZpY3Rpb258c2NpZW5jZWhpc3Rvcnl8c2NpZW5jZXN8c2NpZW5jZXNuYXR1cmVsbGVzfHNjb3RsYW5kfHNlYXBvcnR8c2V0dGxlbWVudHxzZXR0bGVyc3xzaGVsbHxzaGVyYnJvb2tlfHNpYmVuaWt8c2lsa3xza2l8c2tvbGV8c29jaWV0eXxzb2xvZ25lfHNvdW5kYW5kdmlzaW9ufHNvdXRoY2Fyb2xpbmF8c291dGh3ZXN0fHNwYWNlfHNweXxzcXVhcmV8c3RhZHR8c3RhbGJhbnN8c3Rhcm5iZXJnfHN0YXRlfHN0YXRlb2ZkZWxhd2FyZXxzdGF0aW9ufHN0ZWFtfHN0ZWllcm1hcmt8c3Rqb2hufHN0b2NraG9sbXxzdHBldGVyc2J1cmd8c3R1dHRnYXJ0fHN1aXNzZXxzdXJnZW9uc2hhbGx8c3VycmV5fHN2aXp6ZXJhfHN3ZWRlbnxzeWRuZXl8dGFua3x0Y218dGVjaG5vbG9neXx0ZWxla29tbXVuaWthdGlvbnx0ZWxldmlzaW9ufHRleGFzfHRleHRpbGV8dGhlYXRlcnx0aW1lfHRpbWVrZWVwaW5nfHRvcG9sb2d5fHRvcmlub3x0b3VjaHx0b3dufHRyYW5zcG9ydHx0cmVlfHRyb2xsZXl8dHJ1c3R8dHJ1c3RlZXx1aHJlbnx1bG18dW5kZXJzZWF8dW5pdmVyc2l0eXx1c2F8dXNhbnRpcXVlc3x1c2FydHN8dXNjb3VudHJ5ZXN0YXRlfHVzY3VsdHVyZXx1c2RlY29yYXRpdmVhcnRzfHVzZ2FyZGVufHVzaGlzdG9yeXx1c2h1YWlhfHVzbGl2aW5naGlzdG9yeXx1dGFofHV2aWN8dmFsbGV5fHZhbnRhYXx2ZXJzYWlsbGVzfHZpa2luZ3x2aWxsYWdlfHZpcmdpbmlhfHZpcnR1YWx8dmlydHVlbHx2bGFhbmRlcmVufHZvbGtlbmt1bmRlfHdhbGVzfHdhbGxvbmllfHdhcnx3YXNoaW5ndG9uZGN8d2F0Y2hhbmRjbG9ja3x3YXRjaC1hbmQtY2xvY2t8d2VzdGVybnx3ZXN0ZmFsZW58d2hhbGluZ3x3aWxkbGlmZXx3aWxsaWFtc2J1cmd8d2luZG1pbGx8d29ya3Nob3B8eW9ya3x5b3Jrc2hpcmV8eW9zZW1pdGV8eW91dGh8em9vbG9naWNhbHx6b29sb2d5fHhuLS05ZGJoYmxnNmRpfHhuLS1oMWFlZ2hcIixcIm12XCI6XCJhZXJvfGJpenxjb218Y29vcHxlZHV8Z292fGluZm98aW50fG1pbHxtdXNldW18bmFtZXxuZXR8b3JnfHByb1wiLFwibXdcIjpcImFjfGJpenxjb3xjb218Y29vcHxlZHV8Z292fGludHxtdXNldW18bmV0fG9yZ1wiLFwibXhcIjpcImNvbXxvcmd8Z29ifGVkdXxuZXR8YmxvZ3Nwb3RcIixcIm15XCI6XCJjb218bmV0fG9yZ3xnb3Z8ZWR1fG1pbHxuYW1lfGJsb2dzcG90XCIsXCJtelwiOlwiKnwhdGVsZWRhdGFcIixcIm5hXCI6XCJpbmZvfHByb3xuYW1lfHNjaG9vbHxvcnxkcnx1c3xteHxjYXxpbnxjY3x0dnx3c3xtb2JpfGNvfGNvbXxvcmdcIixcIm5hbWVcIjpcImZvcmdvdC5oZXJ8Zm9yZ290Lmhpc1wiLFwibmNcIjpcImFzc29cIixcIm5lXCI6XCJcIixcIm5ldFwiOlwiY2xvdWRmcm9udHxnYnxodXxqcHxzZXx1a3xpbnxjZG43Ny1zc2x8ci5jZG43N3xhdC1iYW5kLWNhbXB8YmxvZ2Ruc3xicm9rZS1pdHxidXlzaG91c2VzfGRuc2FsaWFzfGRuc2Rvam98ZG9lcy1pdHxkb250ZXhpc3R8ZHluYWxpYXN8ZHluYXRob21lfGVuZG9maW50ZXJuZXR8ZnJvbS1henxmcm9tLWNvfGZyb20tbGF8ZnJvbS1ueXxnZXRzLWl0fGhhbS1yYWRpby1vcHxob21lZnRwfGhvbWVpcHxob21lbGludXh8aG9tZXVuaXh8aW4tdGhlLWJhbmR8aXMtYS1jaGVmfGlzLWEtZ2Vla3xpc2EtZ2Vla3xraWNrcy1hc3N8b2ZmaWNlLW9uLXRoZXxwb2R6b25lfHNjcmFwcGVyLXNpdGV8c2VsZmlwfHNlbGxzLWl0fHNlcnZlYmJzfHNlcnZlZnRwfHRocnVoZXJlfHdlYmhvcHxhLnNzbC5mYXN0bHl8Yi5zc2wuZmFzdGx5fGdsb2JhbC5zc2wuZmFzdGx5fGEucHJvZC5mYXN0bHl8Z2xvYmFsLnByb2QuZmFzdGx5fGF6dXJld2Vic2l0ZXN8YXp1cmUtbW9iaWxlfGNsb3VkYXBwfHphXCIsXCJuZlwiOlwiY29tfG5ldHxwZXJ8cmVjfHdlYnxhcnRzfGZpcm18aW5mb3xvdGhlcnxzdG9yZVwiLFwibmdcIjpcImNvbXxlZHV8bmFtZXxuZXR8b3JnfHNjaHxnb3Z8bWlsfG1vYml8YmxvZ3Nwb3QuY29tXCIsXCJuaVwiOlwiKlwiLFwibmxcIjpcImJ2fGNvfGJsb2dzcG90XCIsXCJub1wiOlwiZmhzfHZnc3xmeWxrZXNiaWJsfGZvbGtlYmlibHxtdXNldW18aWRyZXR0fHByaXZ8bWlsfHN0YXR8ZGVwfGtvbW11bmV8aGVyYWR8YWF8YWh8YnV8Zm18aGx8aG18amFuLW1heWVufG1yfG5sfG50fG9mfG9sfG9zbG98cmx8c2Z8c3R8c3ZhbGJhcmR8dG18dHJ8dmF8dmZ8Z3MuYWF8Z3MuYWh8Z3MuYnV8Z3MuZm18Z3MuaGx8Z3MuaG18Z3MuamFuLW1heWVufGdzLm1yfGdzLm5sfGdzLm50fGdzLm9mfGdzLm9sfGdzLm9zbG98Z3Mucmx8Z3Muc2Z8Z3Muc3R8Z3Muc3ZhbGJhcmR8Z3MudG18Z3MudHJ8Z3MudmF8Z3MudmZ8YWtyZWhhbW58eG4tLWtyZWhhbW4tZHhhfGFsZ2FyZHx4bi0tbGdyZC1wb2FjfGFybmF8YnJ1bXVuZGRhbHxicnluZXxicm9ubm95c3VuZHx4bi0tYnJubnlzdW5kLW04YWN8ZHJvYmFrfHhuLS1kcmJhay13dWF8ZWdlcnN1bmR8ZmV0c3VuZHxmbG9yb3x4bi0tZmxvci1qcmF8ZnJlZHJpa3N0YWR8aG9ra3N1bmR8aG9uZWZvc3N8eG4tLWhuZWZvc3MtcTFhfGplc3NoZWltfGpvcnBlbGFuZHx4bi0tanJwZWxhbmQtNTRhfGtpcmtlbmVzfGtvcGVydmlrfGtyb2tzdGFkZWx2YXxsYW5nZXZhZ3x4bi0tbGFuZ2V2Zy1qeGF8bGVpcnZpa3xtam9uZGFsZW58eG4tLW1qbmRhbGVuLTY0YXxtby1pLXJhbmF8bW9zam9lbnx4bi0tbW9zamVuLWV5YXxuZXNvZGR0YW5nZW58b3JrYW5nZXJ8b3NveXJvfHhuLS1vc3lyby13dWF8cmFob2x0fHhuLS1yaG9sdC1tcmF8c2FuZG5lc3Nqb2VufHhuLS1zYW5kbmVzc2plbi1vZ2J8c2tlZHNtb2tvcnNldHxzbGF0dHVtfHNwamVsa2F2aWt8c3RhdGhlbGxlfHN0YXZlcm58c3Rqb3JkYWxzaGFsc2VufHhuLS1zdGpyZGFsc2hhbHNlbi1zcWJ8dGFuYW5nZXJ8dHJhbmJ5fHZvc3NldmFuZ2VufGFmam9yZHx4bi0tZmpvcmQtbHJhfGFnZGVuZXN8YWx8eG4tLWwtMWZhfGFsZXN1bmR8eG4tLWxlc3VuZC1odWF8YWxzdGFoYXVnfGFsdGF8eG4tLWx0LWxpYWN8YWxhaGVhZGp1fHhuLS1sYWhlYWRqdS03eWF8YWx2ZGFsfGFtbGl8eG4tLW1saS10bGF8YW1vdHx4bi0tbW90LXRsYXxhbmRlYnV8YW5kb3l8eG4tLWFuZHktaXJhfGFuZGFzdW9sb3xhcmRhbHx4bi0tcmRhbC1wb2F8YXJlbWFya3xhcmVuZGFsfHhuLS1zLTFmYXxhc2VyYWx8eG4tLXNlcmFsLWxyYXxhc2tlcnxhc2tpbXxhc2t2b2xsfGFza295fHhuLS1hc2t5LWlyYXxhc25lc3x4bi0tc25lcy1wb2F8YXVkbmVkYWxufGF1a3JhfGF1cmV8YXVybGFuZHxhdXJza29nLWhvbGFuZHx4bi0tYXVyc2tvZy1obGFuZC1qbmJ8YXVzdGV2b2xsfGF1c3RyaGVpbXxhdmVyb3l8eG4tLWF2ZXJ5LXl1YXxiYWxlc3RyYW5kfGJhbGxhbmdlbnxiYWxhdHx4bi0tYmx0LWVsYWJ8YmFsc2Zqb3JkfGJhaGNjYXZ1b3RuYXx4bi0tYmhjY2F2dW90bmEtazdhfGJhbWJsZXxiYXJkdXxiZWFyZHV8YmVpYXJufGJhamRkYXJ8eG4tLWJqZGRhci1wdGF8YmFpZGFyfHhuLS1iaWRyLTVuYWN8YmVyZ3xiZXJnZW58YmVybGV2YWd8eG4tLWJlcmxldmctanhhfGJlYXJhbHZhaGtpfHhuLS1iZWFyYWx2aGtpLXk0YXxiaW5kYWx8Ymlya2VuZXN8YmphcmtveXx4bi0tYmphcmt5LWZ5YXxiamVya3JlaW18Ymp1Z258Ym9kb3x4bi0tYm9kLTJuYXxiYWRhZGRqYXx4bi0tYmRkZGotbXJhYmR8YnVkZWpqdXxib2tufGJyZW1hbmdlcnxicm9ubm95fHhuLS1icm5ueS13dWFjfGJ5Z2xhbmR8YnlrbGV8YmFydW18eG4tLWJydW0tdm9hfGJvLnRlbGVtYXJrfHhuLS1iLTVnYS50ZWxlbWFya3xiby5ub3JkbGFuZHx4bi0tYi01Z2Eubm9yZGxhbmR8YmlldmF0fHhuLS1iaWV2dC0wcWF8Ym9tbG98eG4tLWJtbG8tZ3JhfGJhdHNmam9yZHx4bi0tYnRzZmpvcmQtOXphfGJhaGNhdnVvdG5hfHhuLS1iaGNhdnVvdG5hLXM0YXxkb3ZyZXxkcmFtbWVufGRyYW5nZWRhbHxkeXJveXx4bi0tZHlyeS1pcmF8ZG9ubmF8eG4tLWRubmEtZ3JhfGVpZHxlaWRmam9yZHxlaWRzYmVyZ3xlaWRza29nfGVpZHN2b2xsfGVpZ2Vyc3VuZHxlbHZlcnVtfGVuZWJha2t8ZW5nZXJkYWx8ZXRuZXxldG5lZGFsfGV2ZW5lc3xldmVuYXNzaXx4bi0tZXZlbmktMHFhMDFnYXxldmplLW9nLWhvcm5uZXN8ZmFyc3VuZHxmYXVza2V8ZnVvc3Nrb3xmdW9pc2t1fGZlZGplfGZldHxmaW5ub3l8eG4tLWZpbm55LXl1YXxmaXRqYXJ8ZmphbGVyfGZqZWxsfGZsYWtzdGFkfGZsYXRhbmdlcnxmbGVra2Vmam9yZHxmbGVzYmVyZ3xmbG9yYXxmbGF8eG4tLWZsLXppYXxmb2xsZGFsfGZvcnNhbmR8Zm9zbmVzfGZyZWl8ZnJvZ258ZnJvbGFuZHxmcm9zdGF8ZnJhbmF8eG4tLWZybmEtd29hfGZyb3lhfHhuLS1mcnlhLWhyYXxmdXNhfGZ5cmVzZGFsfGZvcmRlfHhuLS1mcmRlLWdyYXxnYW12aWt8Z2FuZ2F2aWlrYXx4bi0tZ2dhdmlpa2EtOHlhNDdofGdhdWxhcnxnYXVzZGFsfGdpbGRlc2thbHx4bi0tZ2lsZGVza2wtZzBhfGdpc2tlfGdqZW1uZXN8Z2plcmRydW18Z2plcnN0YWR8Z2plc2RhbHxnam92aWt8eG4tLWdqdmlrLXd1YXxnbG9wcGVufGdvbHxncmFufGdyYW5lfGdyYW52aW58Z3JhdGFuZ2VufGdyaW1zdGFkfGdyb25nfGtyYWFuZ2hrZXx4bi0ta3Jhbmdoa2UtYjBhfGdydWV8Z3VsZW58aGFkc2VsfGhhbGRlbnxoYWxzYXxoYW1hcnxoYW1hcm95fGhhYm1lcnx4bi0taGJtZXIteHFhfGhhcG1pcnx4bi0taHBtaXIteHFhfGhhbW1lcmZlc3R8aGFtbWFyZmVhc3RhfHhuLS1obW1yZmVhc3RhLXM0YWN8aGFyYW18aGFyZWlkfGhhcnN0YWR8aGFzdmlrfGFrbm9sdW9rdGF8eG4tLWtvbHVva3RhLTd5YTU3aHxoYXR0ZmplbGxkYWx8YWFyYm9ydGV8aGF1Z2VzdW5kfGhlbW5lfGhlbW5lc3xoZW1zZWRhbHxoZXJveS5tb3JlLW9nLXJvbXNkYWx8eG4tLWhlcnktaXJhLnhuLS1tcmUtb2ctcm9tc2RhbC1xcWJ8aGVyb3kubm9yZGxhbmR8eG4tLWhlcnktaXJhLm5vcmRsYW5kfGhpdHJhfGhqYXJ0ZGFsfGhqZWxtZWxhbmR8aG9ib2x8eG4tLWhvYmwtaXJhfGhvZnxob2x8aG9sZXxob2xtZXN0cmFuZHxob2x0YWxlbnx4bi0taG9sdGxlbi1oeGF8aG9ybmluZGFsfGhvcnRlbnxodXJkYWx8aHVydW18aHZhbGVyfGh5bGxlc3RhZHxoYWdlYm9zdGFkfHhuLS1oZ2Vib3N0YWQtZzNhfGhveWFuZ2VyfHhuLS1oeWFuZ2VyLXExYXxob3lsYW5kZXR8eG4tLWh5bGFuZGV0LTU0YXxoYXx4bi0taC0yZmF8aWJlc3RhZHxpbmRlcm95fHhuLS1pbmRlcnktZnlhfGl2ZWxhbmR8amV2bmFrZXJ8am9uZGFsfGpvbHN0ZXJ8eG4tLWpsc3Rlci1ieWF8a2FyYXNqb2t8a2FyYXNqb2hrYXx4bi0ta3Jqb2hrYS1od2FiNDlqfGthcmxzb3l8Z2Fsc2F8eG4tLWdscy1lbGFjfGthcm1veXx4bi0ta2FybXkteXVhfGthdXRva2Vpbm98Z3VvdmRhZ2VhaWRudXxrbGVwcHxrbGFidXx4bi0ta2xidS13b2F8a29uZ3NiZXJnfGtvbmdzdmluZ2VyfGtyYWdlcm98eG4tLWtyYWdlci1neWF8a3Jpc3RpYW5zYW5kfGtyaXN0aWFuc3VuZHxrcm9kc2hlcmFkfHhuLS1rcmRzaGVyYWQtbThhfGt2YWxzdW5kfHJhaGtrZXJhdmp1fHhuLS1yaGtrZXJ2anUtMDFhZnxrdmFtfGt2aW5lc2RhbHxrdmlubmhlcmFkfGt2aXRlc2VpZHxrdml0c295fHhuLS1rdml0c3ktZnlhfGt2YWZqb3JkfHhuLS1rdmZqb3JkLW54YXxnaWVodGF2dW9hdG5hfGt2YW5hbmdlbnx4bi0ta3ZuYW5nZW4tazBhfG5hdnVvdG5hfHhuLS1udnVvdG5hLWh3YXxrYWZqb3JkfHhuLS1rZmpvcmQtaXVhfGdhaXZ1b3RuYXx4bi0tZ2l2dW90bmEtOHlhfGxhcnZpa3xsYXZhbmdlbnxsYXZhZ2lzfGxvYWJhdHx4bi0tbG9hYnQtMHFhfGxlYmVzYnl8ZGF2dmVzaWlkYXxsZWlrYW5nZXJ8bGVpcmZqb3JkfGxla2F8bGVrc3Zpa3xsZW52aWt8bGVhbmdhdmlpa2F8eG4tLWxlYWdhdmlpa2EtNTJifGxlc2phfGxldmFuZ2VyfGxpZXJ8bGllcm5lfGxpbGxlaGFtbWVyfGxpbGxlc2FuZHxsaW5kZXNuZXN8bGluZGFzfHhuLS1saW5kcy1wcmF8bG9tfGxvcHBhfGxhaHBwaXx4bi0tbGhwcGkteHFhfGx1bmR8bHVubmVyfGx1cm95fHhuLS1sdXJ5LWlyYXxsdXN0ZXJ8bHluZ2RhbHxseW5nZW58aXZndXxsYXJkYWx8bGVyZGFsfHhuLS1scmRhbC1zcmF8bG9kaW5nZW58eG4tLWxkaW5nZW4tcTFhfGxvcmVuc2tvZ3x4bi0tbHJlbnNrb2ctNTRhfGxvdGVufHhuLS1sdGVuLWdyYXxtYWx2aWt8bWFzb3l8eG4tLW1zeS11bGEwaHxtdW9zYXR8eG4tLW11b3N0LTBxYXxtYW5kYWx8bWFya2VyfG1hcm5hcmRhbHxtYXNmam9yZGVufG1lbGFuZHxtZWxkYWx8bWVsaHVzfG1lbG95fHhuLS1tZWx5LWlyYXxtZXJha2VyfHhuLS1tZXJrZXIta3VhfG1vYXJla2V8eG4tLW1vcmVrZS1qdWF8bWlkc3VuZHxtaWR0cmUtZ2F1bGRhbHxtb2RhbGVufG1vZHVtfG1vbGRlfG1vc2tlbmVzfG1vc3N8bW9zdmlrfG1hbHNlbHZ8eG4tLW1sc2Vsdi1pdWF8bWFsYXR2dW9wbWl8eG4tLW1sYXR2dW9wbWktczRhfG5hbWRhbHNlaWR8YWVqcmllfG5hbXNvc3xuYW1zc2tvZ2FufG5hYW1lc2pldnVlbWllfHhuLS1ubWVzamV2dWVtaWUtdGNiYXxsYWFrZXN2dWVtaWV8bmFubmVzdGFkfG5hcnZpa3xuYXJ2aWlrYXxuYXVzdGRhbHxuZWRyZS1laWtlcnxuZXMuYWtlcnNodXN8bmVzLmJ1c2tlcnVkfG5lc25hfG5lc29kZGVufG5lc3NlYnl8dW5qYXJnYXx4bi0tdW5qcmdhLXJ0YXxuZXNzZXR8bmlzc2VkYWx8bml0dGVkYWx8bm9yZC1hdXJkYWx8bm9yZC1mcm9ufG5vcmQtb2RhbHxub3JkZGFsfG5vcmRrYXBwfGRhdnZlbmphcmdhfHhuLS1kYXZ2ZW5qcmdhLXk0YXxub3JkcmUtbGFuZHxub3JkcmVpc2F8cmFpc2F8eG4tLXJpc2EtNW5hfG5vcmUtb2ctdXZkYWx8bm90b2RkZW58bmFyb3l8eG4tLW5yeS15bGE1Z3xub3R0ZXJveXx4bi0tbnR0ZXJ5LWJ5YWV8b2RkYXxva3NuZXN8eG4tLWtzbmVzLXV1YXxvcHBkYWx8b3BwZWdhcmR8eG4tLW9wcGVncmQtaXhhfG9ya2RhbHxvcmxhbmR8eG4tLXJsYW5kLXV1YXxvcnNrb2d8eG4tLXJza29nLXV1YXxvcnN0YXx4bi0tcnN0YS1mcmF8b3MuaGVkbWFya3xvcy5ob3JkYWxhbmR8b3Nlbnxvc3Rlcm95fHhuLS1vc3RlcnktZnlhfG9zdHJlLXRvdGVufHhuLS1zdHJlLXRvdGVuLXpjYnxvdmVyaGFsbGF8b3ZyZS1laWtlcnx4bi0tdnJlLWVpa2VyLWs4YXxveWVyfHhuLS15ZXItem5hfG95Z2FyZGVufHhuLS15Z2FyZGVuLXAxYXxveXN0cmUtc2xpZHJlfHhuLS15c3RyZS1zbGlkcmUtdWpifHBvcnNhbmdlcnxwb3JzYW5ndXx4bi0tcG9yc2d1LXN0YTI2Znxwb3JzZ3J1bm58cmFkb3l8eG4tLXJhZHktaXJhfHJha2tlc3RhZHxyYW5hfHJ1b3ZhdHxyYW5kYWJlcmd8cmF1bWF8cmVuZGFsZW58cmVubmVidXxyZW5uZXNveXx4bi0tcmVubmVzeS12MWF8cmluZGFsfHJpbmdlYnV8cmluZ2VyaWtlfHJpbmdzYWtlcnxyaXNzYXxyaXNvcnx4bi0tcmlzci1pcmF8cm9hbnxyb2xsYWd8cnlnZ2V8cmFsaW5nZW58eG4tLXJsaW5nZW4tbXhhfHJvZG95fHhuLS1yZHktMG5hYnxyb21za29nfHhuLS1ybXNrb2ctYnlhfHJvcm9zfHhuLS1ycm9zLWdyYXxyb3N0fHhuLS1yc3QtMG5hfHJveWtlbnx4bi0tcnlrZW4tdnVhfHJveXJ2aWt8eG4tLXJ5cnZpay1ieWF8cmFkZXx4bi0tcmRlLXVsYXxzYWxhbmdlbnxzaWVsbGFrfHNhbHRkYWx8c2FsYXR8eG4tLXNsdC1lbGFifHhuLS1zbGF0LTVuYXxzYW1uYW5nZXJ8c2FuZGUubW9yZS1vZy1yb21zZGFsfHNhbmRlLnhuLS1tcmUtb2ctcm9tc2RhbC1xcWJ8c2FuZGUudmVzdGZvbGR8c2FuZGVmam9yZHxzYW5kbmVzfHNhbmRveXx4bi0tc2FuZHkteXVhfHNhcnBzYm9yZ3xzYXVkYXxzYXVoZXJhZHxzZWx8c2VsYnV8c2VsamV8c2Vsam9yZHxzaWdkYWx8c2lsamFufHNpcmRhbHxza2F1bnxza2Vkc21vfHNraXxza2llbnxza2lwdHZldHxza2plcnZveXx4bi0tc2tqZXJ2eS12MWF8c2tpZXJ2YXx4bi0tc2tpZXJ2LXV0YXxza2pha3x4bi0tc2tqay1zb2F8c2tvZGplfHNrYW5sYW5kfHhuLS1za25sYW5kLWZ4YXxza2FuaXR8eG4tLXNrbml0LXlxYXxzbW9sYXx4bi0tc21sYS1ocmF8c25pbGxmam9yZHxzbmFzYXx4bi0tc25zYS1yb2F8c25vYXNhfHNuYWFzZXx4bi0tc25hc2UtbnJhfHNvZ25kYWx8c29rbmRhbHxzb2xhfHNvbHVuZHxzb25nZGFsZW58c29ydGxhbmR8c3B5ZGViZXJnfHN0YW5nZXxzdGF2YW5nZXJ8c3RlaWdlbnxzdGVpbmtqZXJ8c3Rqb3JkYWx8eG4tLXN0anJkYWwtczFhfHN0b2trZXxzdG9yLWVsdmRhbHxzdG9yZHxzdG9yZGFsfHN0b3Jmam9yZHxvbWFzdnVvdG5hfHN0cmFuZHxzdHJhbmRhfHN0cnlufHN1bGF8c3VsZGFsfHN1bmR8c3VubmRhbHxzdXJuYWRhbHxzdmVpb3xzdmVsdmlrfHN5a2t5bHZlbnxzb2duZXx4bi0tc2duZS1ncmF8c29tbmF8eG4tLXNtbmEtZ3JhfHNvbmRyZS1sYW5kfHhuLS1zbmRyZS1sYW5kLTBjYnxzb3ItYXVyZGFsfHhuLS1zci1hdXJkYWwtbDhhfHNvci1mcm9ufHhuLS1zci1mcm9uLXExYXxzb3Itb2RhbHx4bi0tc3Itb2RhbC1xMWF8c29yLXZhcmFuZ2VyfHhuLS1zci12YXJhbmdlci1nZ2J8bWF0dGEtdmFyamphdHx4bi0tbXR0YS12cmpqYXQtazdhZnxzb3Jmb2xkfHhuLS1zcmZvbGQtYnlhfHNvcnJlaXNhfHhuLS1zcnJlaXNhLXExYXxzb3J1bXx4bi0tc3J1bS1ncmF8dGFuYXxkZWF0bnV8dGltZXx0aW5ndm9sbHx0aW5ufHRqZWxkc3VuZHxkaWVsZGRhbnVvcnJpfHRqb21lfHhuLS10am1lLWhyYXx0b2trZXx0b2xnYXx0b3Jza2VufHRyYW5veXx4bi0tdHJhbnkteXVhfHRyb21zb3x4bi0tdHJvbXMtenVhfHRyb21zYXxyb21zYXx0cm9uZGhlaW18dHJvYW5kaW58dHJ5c2lsfHRyYW5hfHhuLS10cm5hLXdvYXx0cm9nc3RhZHx4bi0tdHJnc3RhZC1yMWF8dHZlZGVzdHJhbmR8dHlkYWx8dHluc2V0fHR5c2Zqb3JkfGRpdnRhc3Z1b2RuYXxkaXZ0dGFzdnVvdG5hfHR5c25lc3x0eXN2YXJ8eG4tLXR5c3ZyLXZyYXx0b25zYmVyZ3x4bi0tdG5zYmVyZy1xMWF8dWxsZW5zYWtlcnx1bGxlbnN2YW5nfHVsdmlrfHV0c2lyYXx2YWRzb3x4bi0tdmFkcy1qcmF8Y2FoY2VzdW9sb3x4bi0taGNlc3VvbG8tN3lhMzVifHZha3NkYWx8dmFsbGV8dmFuZ3x2YW55bHZlbnx2YXJkb3x4bi0tdmFyZC1qcmF8dmFyZ2dhdHx4bi0tdnJnZ3QteHFhZHx2ZWZzbnx2YWFwc3RlfHZlZ2F8dmVnYXJzaGVpfHhuLS12ZWdyc2hlaS1jMGF8dmVubmVzbGF8dmVyZGFsfHZlcnJhbnx2ZXN0Ynl8dmVzdG5lc3x2ZXN0cmUtc2xpZHJlfHZlc3RyZS10b3Rlbnx2ZXN0dmFnb3l8eG4tLXZlc3R2Z3ktaXhhNm98dmV2ZWxzdGFkfHZpa3x2aWtuYXx2aW5kYWZqb3JkfHZvbGRhfHZvc3N8dmFyb3l8eG4tLXZyeS15bGE1Z3x2YWdhbnx4bi0tdmdhbi1xb2F8dm9hZ2F0fHZhZ3NveXx4bi0tdmdzeS1xb2Ewanx2YWdhfHhuLS12Zy15aWFifHZhbGVyLm9zdGZvbGR8eG4tLXZsZXItcW9hLnhuLS1zdGZvbGQtOXhhfHZhbGVyLmhlZG1hcmt8eG4tLXZsZXItcW9hLmhlZG1hcmt8Y298YmxvZ3Nwb3RcIixcIm5wXCI6XCIqXCIsXCJuclwiOlwiYml6fGluZm98Z292fGVkdXxvcmd8bmV0fGNvbVwiLFwibnVcIjpcIm1lcnNlaW5lfG1pbmV8c2hhY2tuZXRcIixcIm56XCI6XCJhY3xjb3xjcml8Z2Vla3xnZW58Z292dHxoZWFsdGh8aXdpfGtpd2l8bWFvcml8bWlsfHhuLS1tb3JpLXFzYXxuZXR8b3JnfHBhcmxpYW1lbnR8c2Nob29sfGJsb2dzcG90LmNvXCIsXCJvbVwiOlwiY298Y29tfGVkdXxnb3Z8bWVkfG11c2V1bXxuZXR8b3JnfHByb1wiLFwib3JnXCI6XCJhZXx1c3xjLmNkbjc3fHJzYy5jZG43N3xzc2wub3JpZ2luLmNkbjc3LXNlY3VyZXxkdWNrZG5zfGR5bmRuc3xibG9nZG5zfGJsb2dzaXRlfGJvbGRseWdvaW5nbm93aGVyZXxkbnNhbGlhc3xkbnNkb2pvfGRvZXNudGV4aXN0fGRvbnRleGlzdHxkb29tZG5zfGR2cmRuc3xkeW5hbGlhc3xlbmRvZmludGVybmV0fGVuZG9mdGhlaW50ZXJuZXR8ZnJvbS1tZXxnYW1lLWhvc3R8Z28uZHluZG5zfGdvdGRuc3xob2JieS1zaXRlfGhvbWUuZHluZG5zfGhvbWVkbnN8aG9tZWZ0cHxob21lbGludXh8aG9tZXVuaXh8aXMtYS1icnVpbnNmYW58aXMtYS1jYW5kaWRhdGV8aXMtYS1jZWx0aWNzZmFufGlzLWEtY2hlZnxpcy1hLWdlZWt8aXMtYS1rbmlnaHR8aXMtYS1saW51eC11c2VyfGlzLWEtcGF0c2Zhbnxpcy1hLXNveGZhbnxpcy1mb3VuZHxpcy1sb3N0fGlzLXNhdmVkfGlzLXZlcnktYmFkfGlzLXZlcnktZXZpbHxpcy12ZXJ5LWdvb2R8aXMtdmVyeS1uaWNlfGlzLXZlcnktc3dlZXR8aXNhLWdlZWt8a2lja3MtYXNzfG1pc2NvbmZ1c2VkfHBvZHpvbmV8cmVhZG15YmxvZ3xzZWxmaXB8c2VsbHN5b3VyaG9tZXxzZXJ2ZWJic3xzZXJ2ZWZ0cHxzZXJ2ZWdhbWV8c3R1ZmYtNC1zYWxlfHdlYmhvcHxldXxhbC5ldXxhc3NvLmV1fGF0LmV1fGF1LmV1fGJlLmV1fGJnLmV1fGNhLmV1fGNkLmV1fGNoLmV1fGNuLmV1fGN5LmV1fGN6LmV1fGRlLmV1fGRrLmV1fGVkdS5ldXxlZS5ldXxlcy5ldXxmaS5ldXxmci5ldXxnci5ldXxoci5ldXxodS5ldXxpZS5ldXxpbC5ldXxpbi5ldXxpbnQuZXV8aXMuZXV8aXQuZXV8anAuZXV8a3IuZXV8bHQuZXV8bHUuZXV8bHYuZXV8bWMuZXV8bWUuZXV8bWsuZXV8bXQuZXV8bXkuZXV8bmV0LmV1fG5nLmV1fG5sLmV1fG5vLmV1fG56LmV1fHBhcmlzLmV1fHBsLmV1fHB0LmV1fHEtYS5ldXxyby5ldXxydS5ldXxzZS5ldXxzaS5ldXxzay5ldXx0ci5ldXx1ay5ldXx1cy5ldXxibW9hdHRhY2htZW50c3xoa3x6YVwiLFwicGFcIjpcImFjfGdvYnxjb218b3JnfHNsZHxlZHV8bmV0fGluZ3xhYm98bWVkfG5vbVwiLFwicGVcIjpcImVkdXxnb2J8bm9tfG1pbHxvcmd8Y29tfG5ldHxibG9nc3BvdFwiLFwicGZcIjpcImNvbXxvcmd8ZWR1XCIsXCJwZ1wiOlwiKlwiLFwicGhcIjpcImNvbXxuZXR8b3JnfGdvdnxlZHV8bmdvfG1pbHxpXCIsXCJwa1wiOlwiY29tfG5ldHxlZHV8b3JnfGZhbXxiaXp8d2VifGdvdnxnb2J8Z29rfGdvbnxnb3B8Z29zfGluZm9cIixcInBsXCI6XCJjb218bmV0fG9yZ3xhaWR8YWdyb3xhdG18YXV0b3xiaXp8ZWR1fGdtaW5hfGdzbXxpbmZvfG1haWx8bWlhc3RhfG1lZGlhfG1pbHxuaWVydWNob21vc2NpfG5vbXxwY3xwb3dpYXR8cHJpdnxyZWFsZXN0YXRlfHJlbHxzZXh8c2hvcHxza2xlcHxzb3N8c3prb2xhfHRhcmdpfHRtfHRvdXJpc218dHJhdmVsfHR1cnlzdHlrYXxnb3Z8YXAuZ292fGljLmdvdnxpcy5nb3Z8dXMuZ292fGttcHNwLmdvdnxrcHBzcC5nb3Z8a3dwc3AuZ292fHBzcC5nb3Z8d3Nrci5nb3Z8a3dwLmdvdnxtdy5nb3Z8dWcuZ292fHVtLmdvdnx1bWlnLmdvdnx1Z2ltLmdvdnx1cG93Lmdvdnx1dy5nb3Z8c3Rhcm9zdHdvLmdvdnxwYS5nb3Z8cG8uZ292fHBzc2UuZ292fHB1cC5nb3Z8cnpndy5nb3Z8c2EuZ292fHNvLmdvdnxzci5nb3Z8d3NhLmdvdnxza28uZ292fHV6cy5nb3Z8d2lpaC5nb3Z8d2luYi5nb3Z8cGluYi5nb3Z8d2lvcy5nb3Z8d2l0ZC5nb3Z8d3ptaXV3LmdvdnxwaXcuZ292fHdpdy5nb3Z8Z3Jpdy5nb3Z8d2lmLmdvdnxvdW0uZ292fHNkbi5nb3Z8enAuZ292fHVwcG8uZ292fG11cC5nb3Z8d3Vvei5nb3Z8a29uc3VsYXQuZ292fG9pcm0uZ292fGF1Z3VzdG93fGJhYmlhLWdvcmF8YmVkemlufGJlc2tpZHl8YmlhbG93aWV6YXxiaWFseXN0b2t8YmllbGF3YXxiaWVzemN6YWR5fGJvbGVzbGF3aWVjfGJ5ZGdvc3pjenxieXRvbXxjaWVzenlufGN6ZWxhZHp8Y3plc3R8ZGx1Z29sZWthfGVsYmxhZ3xlbGt8Z2xvZ293fGduaWV6bm98Z29ybGljZXxncmFqZXdvfGlsYXdhfGphd29yem5vfGplbGVuaWEtZ29yYXxqZ29yYXxrYWxpc3p8a2F6aW1pZXJ6LWRvbG55fGthcnBhY3p8a2FydHV6eXxrYXN6dWJ5fGthdG93aWNlfGtlcG5vfGtldHJ6eW58a2xvZHprb3xrb2JpZXJ6eWNlfGtvbG9icnplZ3xrb25pbnxrb25za293b2xhfGt1dG5vfGxhcHl8bGVib3JrfGxlZ25pY2F8bGV6YWpza3xsaW1hbm93YXxsb216YXxsb3dpY3p8bHViaW58bHVrb3d8bWFsYm9ya3xtYWxvcG9sc2thfG1hem93c3plfG1henVyeXxtaWVsZWN8bWllbG5vfG1yYWdvd298bmFrbG98bm93YXJ1ZGF8bnlzYXxvbGF3YXxvbGVja298b2xrdXN6fG9sc3p0eW58b3BvY3pub3xvcG9sZXxvc3Ryb2RhfG9zdHJvbGVrYXxvc3Ryb3dpZWN8b3N0cm93d2xrcHxwaWxhfHBpc3p8cG9kaGFsZXxwb2RsYXNpZXxwb2xrb3dpY2V8cG9tb3J6ZXxwb21vcnNraWV8cHJvY2hvd2ljZXxwcnVzemtvd3xwcnpld29yc2t8cHVsYXd5fHJhZG9tfHJhd2EtbWF6fHJ5Ym5pa3xyemVzem93fHNhbm9rfHNlam55fHNsYXNrfHNsdXBza3xzb3Nub3dpZWN8c3RhbG93YS13b2xhfHNrb2N6b3d8c3RhcmFjaG93aWNlfHN0YXJnYXJkfHN1d2Fsa2l8c3dpZG5pY2F8c3dpZWJvZHppbnxzd2lub3Vqc2NpZXxzemN6ZWNpbnxzemN6eXRub3x0YXJub2JyemVnfHRnb3J5fHR1cmVrfHR5Y2h5fHVzdGthfHdhbGJyenljaHx3YXJtaWF8d2Fyc3phd2F8d2F3fHdlZ3Jvd3x3aWVsdW58d2xvY2x8d2xvY2xhd2VrfHdvZHppc2xhd3x3b2xvbWlufHdyb2NsYXd8emFjaHBvbW9yfHphZ2FufHphcm93fHpnb3JhfHpnb3J6ZWxlY3xjb3xhcnR8Z2xpd2ljZXxrcmFrb3d8cG96bmFufHdyb2N8emFrb3BhbmV8Z2RhfGdkYW5za3xnZHluaWF8bWVkfHNvcG90XCIsXCJwbVwiOlwiXCIsXCJwblwiOlwiZ292fGNvfG9yZ3xlZHV8bmV0XCIsXCJwb3N0XCI6XCJcIixcInByXCI6XCJjb218bmV0fG9yZ3xnb3Z8ZWR1fGlzbGF8cHJvfGJpenxpbmZvfG5hbWV8ZXN0fHByb2Z8YWNcIixcInByb1wiOlwiYWNhfGJhcnxjcGF8anVyfGxhd3xtZWR8ZW5nXCIsXCJwc1wiOlwiZWR1fGdvdnxzZWN8cGxvfGNvbXxvcmd8bmV0XCIsXCJwdFwiOlwibmV0fGdvdnxvcmd8ZWR1fGludHxwdWJsfGNvbXxub21lfGJsb2dzcG90XCIsXCJwd1wiOlwiY298bmV8b3J8ZWR8Z298YmVsYXVcIixcInB5XCI6XCJjb218Y29vcHxlZHV8Z292fG1pbHxuZXR8b3JnXCIsXCJxYVwiOlwiY29tfGVkdXxnb3Z8bWlsfG5hbWV8bmV0fG9yZ3xzY2h8YmxvZ3Nwb3RcIixcInJlXCI6XCJjb218YXNzb3xub218YmxvZ3Nwb3RcIixcInJvXCI6XCJjb218b3JnfHRtfG50fG5vbXxpbmZvfHJlY3xhcnRzfGZpcm18c3RvcmV8d3d3fGJsb2dzcG90XCIsXCJyc1wiOlwiY298b3JnfGVkdXxhY3xnb3Z8aW58YmxvZ3Nwb3RcIixcInJ1XCI6XCJhY3xjb218ZWR1fGludHxuZXR8b3JnfHBwfGFkeWdleWF8YWx0YWl8YW11cnxhcmtoYW5nZWxza3xhc3RyYWtoYW58YmFzaGtpcmlhfGJlbGdvcm9kfGJpcnxicnlhbnNrfGJ1cnlhdGlhfGNiZ3xjaGVsfGNoZWx5YWJpbnNrfGNoaXRhfGNodWtvdGthfGNodXZhc2hpYXxkYWdlc3RhbnxkdWRpbmthfGUtYnVyZ3xncm96bnl8aXJrdXRza3xpdmFub3ZvfGl6aGV2c2t8amFyfGpvc2hrYXItb2xhfGthbG15a2lhfGthbHVnYXxrYW1jaGF0a2F8a2FyZWxpYXxrYXphbnxrY2hyfGtlbWVyb3ZvfGtoYWJhcm92c2t8a2hha2Fzc2lhfGtodnxraXJvdnxrb2VuaWd8a29taXxrb3N0cm9tYXxrcmFzbm95YXJza3xrdWJhbnxrdXJnYW58a3Vyc2t8bGlwZXRza3xtYWdhZGFufG1hcml8bWFyaS1lbHxtYXJpbmV8bW9yZG92aWF8bXNrfG11cm1hbnNrfG5hbGNoaWt8bm5vdnxub3Z8bm92b3NpYmlyc2t8bnNrfG9tc2t8b3JlbmJ1cmd8b3J5b2x8cGFsYW5hfHBlbnphfHBlcm18cHR6fHJuZHxyeWF6YW58c2FraGFsaW58c2FtYXJhfHNhcmF0b3Z8c2ltYmlyc2t8c21vbGVuc2t8c3BifHN0YXZyb3BvbHxzdHZ8c3VyZ3V0fHRhbWJvdnx0YXRhcnN0YW58dG9tfHRvbXNrfHRzYXJpdHN5bnx0c2t8dHVsYXx0dXZhfHR2ZXJ8dHl1bWVufHVkbXx1ZG11cnRpYXx1bGFuLXVkZXx2bGFkaWthdmthenx2bGFkaW1pcnx2bGFkaXZvc3Rva3x2b2xnb2dyYWR8dm9sb2dkYXx2b3JvbmV6aHx2cm58dnlhdGthfHlha3V0aWF8eWFtYWx8eWFyb3NsYXZsfHlla2F0ZXJpbmJ1cmd8eXV6aG5vLXNha2hhbGluc2t8YW11cnNrfGJhaWthbHxjbXd8ZmFyZWFzdHxqYW1hbHxrbXN8ay11cmFsc2t8a3VzdGFuYWl8a3V6YmFzc3xtYWduaXRrYXxteXRpc3xuYWtob2RrYXxua3p8bm9yaWxza3xvc2tvbHxweWF0aWdvcnNrfHJ1YnRzb3Zza3xzbnp8c3l6cmFufHZkb25za3x6Z3JhZHxnb3Z8bWlsfHRlc3R8YmxvZ3Nwb3RcIixcInJ3XCI6XCJnb3Z8bmV0fGVkdXxhY3xjb218Y298aW50fG1pbHxnb3V2XCIsXCJzYVwiOlwiY29tfG5ldHxvcmd8Z292fG1lZHxwdWJ8ZWR1fHNjaFwiLFwic2JcIjpcImNvbXxlZHV8Z292fG5ldHxvcmdcIixcInNjXCI6XCJjb218Z292fG5ldHxvcmd8ZWR1XCIsXCJzZFwiOlwiY29tfG5ldHxvcmd8ZWR1fG1lZHx0dnxnb3Z8aW5mb1wiLFwic2VcIjpcImF8YWN8YnxiZHxicmFuZHxjfGR8ZXxmfGZofGZoc2t8Zmh2fGd8aHxpfGt8a29tZm9yYnxrb21tdW5hbGZvcmJ1bmR8a29tdnV4fGx8bGFuYmlifG18bnxuYXR1cmJydWtzZ3ltbnxvfG9yZ3xwfHBhcnRpfHBwfHByZXNzfHJ8c3x0fHRtfHV8d3x4fHl8enxjb218YmxvZ3Nwb3RcIixcInNnXCI6XCJjb218bmV0fG9yZ3xnb3Z8ZWR1fHBlcnxibG9nc3BvdFwiLFwic2hcIjpcImNvbXxuZXR8Z292fG9yZ3xtaWx8KnBsYXRmb3JtXCIsXCJzaVwiOlwiYmxvZ3Nwb3RcIixcInNqXCI6XCJcIixcInNrXCI6XCJibG9nc3BvdFwiLFwic2xcIjpcImNvbXxuZXR8ZWR1fGdvdnxvcmdcIixcInNtXCI6XCJcIixcInNuXCI6XCJhcnR8Y29tfGVkdXxnb3V2fG9yZ3xwZXJzb3x1bml2fGJsb2dzcG90XCIsXCJzb1wiOlwiY29tfG5ldHxvcmdcIixcInNyXCI6XCJcIixcInN0XCI6XCJjb3xjb218Y29uc3VsYWRvfGVkdXxlbWJhaXhhZGF8Z292fG1pbHxuZXR8b3JnfHByaW5jaXBlfHNhb3RvbWV8c3RvcmVcIixcInN1XCI6XCJhZHlnZXlhfGFya2hhbmdlbHNrfGJhbGFzaG92fGJhc2hraXJpYXxicnlhbnNrfGRhZ2VzdGFufGdyb3pueXxpdmFub3ZvfGthbG15a2lhfGthbHVnYXxrYXJlbGlhfGtoYWthc3NpYXxrcmFzbm9kYXJ8a3VyZ2FufGxlbnVnfG1vcmRvdmlhfG1za3xtdXJtYW5za3xuYWxjaGlrfG5vdnxvYm5pbnNrfHBlbnphfHBva3JvdnNrfHNvY2hpfHNwYnx0b2dsaWF0dGl8dHJvaXRza3x0dWxhfHR1dmF8dmxhZGlrYXZrYXp8dmxhZGltaXJ8dm9sb2dkYVwiLFwic3ZcIjpcImNvbXxlZHV8Z29ifG9yZ3xyZWRcIixcInN4XCI6XCJnb3ZcIixcInN5XCI6XCJlZHV8Z292fG5ldHxtaWx8Y29tfG9yZ1wiLFwic3pcIjpcImNvfGFjfG9yZ1wiLFwidGNcIjpcIlwiLFwidGRcIjpcImJsb2dzcG90XCIsXCJ0ZWxcIjpcIlwiLFwidGZcIjpcIlwiLFwidGdcIjpcIlwiLFwidGhcIjpcImFjfGNvfGdvfGlufG1pfG5ldHxvclwiLFwidGpcIjpcImFjfGJpenxjb3xjb218ZWR1fGdvfGdvdnxpbnR8bWlsfG5hbWV8bmV0fG5pY3xvcmd8dGVzdHx3ZWJcIixcInRrXCI6XCJcIixcInRsXCI6XCJnb3ZcIixcInRtXCI6XCJjb218Y298b3JnfG5ldHxub218Z292fG1pbHxlZHVcIixcInRuXCI6XCJjb218ZW5zfGZpbnxnb3Z8aW5kfGludGx8bmF0fG5ldHxvcmd8aW5mb3xwZXJzb3x0b3VyaXNtfGVkdW5ldHxybnJ0fHJuc3xybnV8bWluY29tfGFncmluZXR8ZGVmZW5zZXx0dXJlblwiLFwidG9cIjpcImNvbXxnb3Z8bmV0fG9yZ3xlZHV8bWlsXCIsXCJ0cFwiOlwiXCIsXCJ0clwiOlwiY29tfGluZm98Yml6fG5ldHxvcmd8d2VifGdlbnx0dnxhdnxkcnxiYnN8bmFtZXx0ZWx8Z292fGJlbHxwb2x8bWlsfGsxMnxlZHV8a2VwfG5jfGdvdi5uY3xibG9nc3BvdC5jb21cIixcInRyYXZlbFwiOlwiXCIsXCJ0dFwiOlwiY298Y29tfG9yZ3xuZXR8Yml6fGluZm98cHJvfGludHxjb29wfGpvYnN8bW9iaXx0cmF2ZWx8bXVzZXVtfGFlcm98bmFtZXxnb3Z8ZWR1XCIsXCJ0dlwiOlwiZHluZG5zfGJldHRlci10aGFufG9uLXRoZS13ZWJ8d29yc2UtdGhhblwiLFwidHdcIjpcImVkdXxnb3Z8bWlsfGNvbXxuZXR8b3JnfGlkdnxnYW1lfGViaXp8Y2x1Ynx4bi0temYwYW82NGF8eG4tLXVjMGF0dnx4bi0tY3pydzI4YnxibG9nc3BvdFwiLFwidHpcIjpcImFjfGNvfGdvfGhvdGVsfGluZm98bWV8bWlsfG1vYml8bmV8b3J8c2N8dHZcIixcInVhXCI6XCJjb218ZWR1fGdvdnxpbnxuZXR8b3JnfGNoZXJrYXNzeXxjaGVya2FzeXxjaGVybmlnb3Z8Y2hlcm5paGl2fGNoZXJuaXZ0c2l8Y2hlcm5vdnRzeXxja3xjbnxjcnxjcmltZWF8Y3Z8ZG58ZG5lcHJvcGV0cm92c2t8ZG5pcHJvcGV0cm92c2t8ZG9taW5pY3xkb25ldHNrfGRwfGlmfGl2YW5vLWZyYW5raXZza3xraHxraGFya2l2fGtoYXJrb3Z8a2hlcnNvbnxraG1lbG5pdHNraXl8a2htZWxueXRza3lpfGtpZXZ8a2lyb3ZvZ3JhZHxrbXxrcnxrcnltfGtzfGt2fGt5aXZ8bGd8bHR8bHVnYW5za3xsdXRza3xsdnxsdml2fG1rfG15a29sYWl2fG5pa29sYWV2fG9kfG9kZXNhfG9kZXNzYXxwbHxwb2x0YXZhfHJpdm5lfHJvdm5vfHJ2fHNifHNlYmFzdG9wb2x8c2V2YXN0b3BvbHxzbXxzdW15fHRlfHRlcm5vcGlsfHV6fHV6aGdvcm9kfHZpbm5pY2F8dmlubnl0c2lhfHZufHZvbHlufHlhbHRhfHphcG9yaXpoemhlfHphcG9yaXpoemhpYXx6aGl0b21pcnx6aHl0b215cnx6cHx6dHxiaXp8Y298cHBcIixcInVnXCI6XCJjb3xvcnxhY3xzY3xnb3xuZXxjb218b3JnfGJsb2dzcG90XCIsXCJ1a1wiOlwiYWN8Y298Z292fGx0ZHxtZXxuZXR8bmhzfG9yZ3xwbGN8cG9saWNlfCpzY2h8c2VydmljZS5nb3Z8YmxvZ3Nwb3QuY29cIixcInVzXCI6XCJkbml8ZmVkfGlzYXxraWRzfG5zbnxha3xhbHxhcnxhc3xhenxjYXxjb3xjdHxkY3xkZXxmbHxnYXxndXxoaXxpYXxpZHxpbHxpbnxrc3xreXxsYXxtYXxtZHxtZXxtaXxtbnxtb3xtc3xtdHxuY3xuZHxuZXxuaHxuanxubXxudnxueXxvaHxva3xvcnxwYXxwcnxyaXxzY3xzZHx0bnx0eHx1dHx2aXx2dHx2YXx3YXx3aXx3dnx3eXxrMTIuYWt8azEyLmFsfGsxMi5hcnxrMTIuYXN8azEyLmF6fGsxMi5jYXxrMTIuY298azEyLmN0fGsxMi5kY3xrMTIuZGV8azEyLmZsfGsxMi5nYXxrMTIuZ3V8azEyLmlhfGsxMi5pZHxrMTIuaWx8azEyLmlufGsxMi5rc3xrMTIua3l8azEyLmxhfGsxMi5tYXxrMTIubWR8azEyLm1lfGsxMi5taXxrMTIubW58azEyLm1vfGsxMi5tc3xrMTIubXR8azEyLm5jfGsxMi5uZXxrMTIubmh8azEyLm5qfGsxMi5ubXxrMTIubnZ8azEyLm55fGsxMi5vaHxrMTIub2t8azEyLm9yfGsxMi5wYXxrMTIucHJ8azEyLnJpfGsxMi5zY3xrMTIudG58azEyLnR4fGsxMi51dHxrMTIudml8azEyLnZ0fGsxMi52YXxrMTIud2F8azEyLndpfGsxMi53eXxjYy5ha3xjYy5hbHxjYy5hcnxjYy5hc3xjYy5henxjYy5jYXxjYy5jb3xjYy5jdHxjYy5kY3xjYy5kZXxjYy5mbHxjYy5nYXxjYy5ndXxjYy5oaXxjYy5pYXxjYy5pZHxjYy5pbHxjYy5pbnxjYy5rc3xjYy5reXxjYy5sYXxjYy5tYXxjYy5tZHxjYy5tZXxjYy5taXxjYy5tbnxjYy5tb3xjYy5tc3xjYy5tdHxjYy5uY3xjYy5uZHxjYy5uZXxjYy5uaHxjYy5uanxjYy5ubXxjYy5udnxjYy5ueXxjYy5vaHxjYy5va3xjYy5vcnxjYy5wYXxjYy5wcnxjYy5yaXxjYy5zY3xjYy5zZHxjYy50bnxjYy50eHxjYy51dHxjYy52aXxjYy52dHxjYy52YXxjYy53YXxjYy53aXxjYy53dnxjYy53eXxsaWIuYWt8bGliLmFsfGxpYi5hcnxsaWIuYXN8bGliLmF6fGxpYi5jYXxsaWIuY298bGliLmN0fGxpYi5kY3xsaWIuZGV8bGliLmZsfGxpYi5nYXxsaWIuZ3V8bGliLmhpfGxpYi5pYXxsaWIuaWR8bGliLmlsfGxpYi5pbnxsaWIua3N8bGliLmt5fGxpYi5sYXxsaWIubWF8bGliLm1kfGxpYi5tZXxsaWIubWl8bGliLm1ufGxpYi5tb3xsaWIubXN8bGliLm10fGxpYi5uY3xsaWIubmR8bGliLm5lfGxpYi5uaHxsaWIubmp8bGliLm5tfGxpYi5udnxsaWIubnl8bGliLm9ofGxpYi5va3xsaWIub3J8bGliLnBhfGxpYi5wcnxsaWIucml8bGliLnNjfGxpYi5zZHxsaWIudG58bGliLnR4fGxpYi51dHxsaWIudml8bGliLnZ0fGxpYi52YXxsaWIud2F8bGliLndpfGxpYi53eXxwdnQuazEyLm1hfGNodHIuazEyLm1hfHBhcm9jaC5rMTIubWF8aXMtYnl8bGFuZC00LXNhbGV8c3R1ZmYtNC1zYWxlXCIsXCJ1eVwiOlwiY29tfGVkdXxndWJ8bWlsfG5ldHxvcmd8YmxvZ3Nwb3QuY29tXCIsXCJ1elwiOlwiY298Y29tfG5ldHxvcmdcIixcInZhXCI6XCJcIixcInZjXCI6XCJjb218bmV0fG9yZ3xnb3Z8bWlsfGVkdVwiLFwidmVcIjpcImFydHN8Y298Y29tfGUxMnxlZHV8ZmlybXxnb2J8Z292fGluZm98aW50fG1pbHxuZXR8b3JnfHJlY3xzdG9yZXx0ZWN8d2ViXCIsXCJ2Z1wiOlwiXCIsXCJ2aVwiOlwiY298Y29tfGsxMnxuZXR8b3JnXCIsXCJ2blwiOlwiY29tfG5ldHxvcmd8ZWR1fGdvdnxpbnR8YWN8Yml6fGluZm98bmFtZXxwcm98aGVhbHRofGJsb2dzcG90XCIsXCJ2dVwiOlwiY29tfGVkdXxuZXR8b3JnXCIsXCJ3ZlwiOlwiXCIsXCJ3c1wiOlwiY29tfG5ldHxvcmd8Z292fGVkdXxkeW5kbnN8bXlwZXRzXCIsXCJ5dFwiOlwiXCIsXCJ4bi0tbWdiYWFtN2E4aFwiOlwiXCIsXCJ4bi0teTlhM2FxXCI6XCJcIixcInhuLS01NGI3ZnRhMGNjXCI6XCJcIixcInhuLS05MGFpc1wiOlwiXCIsXCJ4bi0tZmlxczhzXCI6XCJcIixcInhuLS1maXF6OXNcIjpcIlwiLFwieG4tLWxnYmJhdDFhZDhqXCI6XCJcIixcInhuLS13Z2JoMWNcIjpcIlwiLFwieG4tLW5vZGVcIjpcIlwiLFwieG4tLXF4YW1cIjpcIlwiLFwieG4tLWo2dzE5M2dcIjpcIlwiLFwieG4tLWgyYnJqOWNcIjpcIlwiLFwieG4tLW1nYmJoMWE3MWVcIjpcIlwiLFwieG4tLWZwY3JqOWMzZFwiOlwiXCIsXCJ4bi0tZ2Vjcmo5Y1wiOlwiXCIsXCJ4bi0tczlicmo5Y1wiOlwiXCIsXCJ4bi0tNDVicmo5Y1wiOlwiXCIsXCJ4bi0teGtjMmRsM2E1ZWUwaFwiOlwiXCIsXCJ4bi0tbWdiYTNhNGYxNmFcIjpcIlwiLFwieG4tLW1nYmEzYTRmcmFcIjpcIlwiLFwieG4tLW1nYnR4MmJcIjpcIlwiLFwieG4tLW1nYmF5aDdncGFcIjpcIlwiLFwieG4tLTNlMGI3MDdlXCI6XCJcIixcInhuLS04MGFvMjFhXCI6XCJcIixcInhuLS1memMyYzllMmNcIjpcIlwiLFwieG4tLXhrYzJhbDNoeWUyYVwiOlwiXCIsXCJ4bi0tbWdiYzBhOWF6Y2dcIjpcIlwiLFwieG4tLWQxYWxmXCI6XCJcIixcInhuLS1sMWFjY1wiOlwiXCIsXCJ4bi0tbWl4ODkxZlwiOlwiXCIsXCJ4bi0tbWl4MDgyZlwiOlwiXCIsXCJ4bi0tbWdieDRjZDBhYlwiOlwiXCIsXCJ4bi0tbWdiOWF3YmZcIjpcIlwiLFwieG4tLW1nYmFpOWF6Z3FwNmpcIjpcIlwiLFwieG4tLW1nYmFpOWE1ZXZhMDBiXCI6XCJcIixcInhuLS15Z2JpMmFtbXhcIjpcIlwiLFwieG4tLTkwYTNhY1wiOlwieG4tLW8xYWN8eG4tLWMxYXZnfHhuLS05MGF6aHx4bi0tZDFhdHx4bi0tbzFhY2h8eG4tLTgwYXVcIixcInhuLS1wMWFpXCI6XCJcIixcInhuLS13Z2JsNmFcIjpcIlwiLFwieG4tLW1nYmVycDRhNWQ0YXJcIjpcIlwiLFwieG4tLW1nYmVycDRhNWQ0YTg3Z1wiOlwiXCIsXCJ4bi0tbWdicWx5N2MwYTY3ZmJjXCI6XCJcIixcInhuLS1tZ2JxbHk3Y3ZhZnJcIjpcIlwiLFwieG4tLW1nYnBsMmZoXCI6XCJcIixcInhuLS15ZnJvNGk2N29cIjpcIlwiLFwieG4tLWNsY2hjMGVhMGIyZzJhOWdjZFwiOlwiXCIsXCJ4bi0tb2dicGY4ZmxcIjpcIlwiLFwieG4tLW1nYnRmOGZsXCI6XCJcIixcInhuLS1vM2N3NGhcIjpcIlwiLFwieG4tLXBnYnMwZGhcIjpcIlwiLFwieG4tLWtwcnk1N2RcIjpcIlwiLFwieG4tLWtwcncxM2RcIjpcIlwiLFwieG4tLW5ueDM4OGFcIjpcIlwiLFwieG4tLWoxYW1oXCI6XCJcIixcInhuLS1tZ2IyZGRlc1wiOlwiXCIsXCJ4eHhcIjpcIlwiLFwieWVcIjpcIipcIixcInphXCI6XCJhY3xhZ3JpY2F8YWx0fGNvfGVkdXxnb3Z8Z3JvbmRhcnxsYXd8bWlsfG5ldHxuZ298bmlzfG5vbXxvcmd8c2Nob29sfHRtfHdlYnxibG9nc3BvdC5jb1wiLFwiem1cIjpcIipcIixcInp3XCI6XCIqXCIsXCJhYWFcIjpcIlwiLFwiYWFycFwiOlwiXCIsXCJhYmFydGhcIjpcIlwiLFwiYWJiXCI6XCJcIixcImFiYm90dFwiOlwiXCIsXCJhYmJ2aWVcIjpcIlwiLFwiYWJjXCI6XCJcIixcImFibGVcIjpcIlwiLFwiYWJvZ2Fkb1wiOlwiXCIsXCJhYnVkaGFiaVwiOlwiXCIsXCJhY2FkZW15XCI6XCJcIixcImFjY2VudHVyZVwiOlwiXCIsXCJhY2NvdW50YW50XCI6XCJcIixcImFjY291bnRhbnRzXCI6XCJcIixcImFjb1wiOlwiXCIsXCJhY3RpdmVcIjpcIlwiLFwiYWN0b3JcIjpcIlwiLFwiYWRhY1wiOlwiXCIsXCJhZHNcIjpcIlwiLFwiYWR1bHRcIjpcIlwiLFwiYWVnXCI6XCJcIixcImFldG5hXCI6XCJcIixcImFmYW1pbHljb21wYW55XCI6XCJcIixcImFmbFwiOlwiXCIsXCJhZnJpY2FcIjpcIlwiLFwiYWZyaWNhbWFnaWNcIjpcIlwiLFwiYWdha2hhblwiOlwiXCIsXCJhZ2VuY3lcIjpcIlwiLFwiYWlnXCI6XCJcIixcImFpZ29cIjpcIlwiLFwiYWlyYnVzXCI6XCJcIixcImFpcmZvcmNlXCI6XCJcIixcImFpcnRlbFwiOlwiXCIsXCJha2RuXCI6XCJcIixcImFsZmFyb21lb1wiOlwiXCIsXCJhbGliYWJhXCI6XCJcIixcImFsaXBheVwiOlwiXCIsXCJhbGxmaW5hbnpcIjpcIlwiLFwiYWxsc3RhdGVcIjpcIlwiLFwiYWxseVwiOlwiXCIsXCJhbHNhY2VcIjpcIlwiLFwiYWxzdG9tXCI6XCJcIixcImFtZXJpY2FuZXhwcmVzc1wiOlwiXCIsXCJhbWVyaWNhbmZhbWlseVwiOlwiXCIsXCJhbWV4XCI6XCJcIixcImFtZmFtXCI6XCJcIixcImFtaWNhXCI6XCJcIixcImFtc3RlcmRhbVwiOlwiXCIsXCJhbmFseXRpY3NcIjpcIlwiLFwiYW5kcm9pZFwiOlwiXCIsXCJhbnF1YW5cIjpcIlwiLFwiYW56XCI6XCJcIixcImFvbFwiOlwiXCIsXCJhcGFydG1lbnRzXCI6XCJcIixcImFwcFwiOlwiXCIsXCJhcHBsZVwiOlwiXCIsXCJhcXVhcmVsbGVcIjpcIlwiLFwiYXJhbWNvXCI6XCJcIixcImFyY2hpXCI6XCJcIixcImFybXlcIjpcIlwiLFwiYXJ0ZVwiOlwiXCIsXCJhc2RhXCI6XCJcIixcImFzc29jaWF0ZXNcIjpcIlwiLFwiYXRobGV0YVwiOlwiXCIsXCJhdHRvcm5leVwiOlwiXCIsXCJhdWN0aW9uXCI6XCJcIixcImF1ZGlcIjpcIlwiLFwiYXVkaWJsZVwiOlwiXCIsXCJhdWRpb1wiOlwiXCIsXCJhdXNwb3N0XCI6XCJcIixcImF1dGhvclwiOlwiXCIsXCJhdXRvXCI6XCJcIixcImF1dG9zXCI6XCJcIixcImF2aWFuY2FcIjpcIlwiLFwiYXdzXCI6XCJcIixcImF4YVwiOlwiXCIsXCJhenVyZVwiOlwiXCIsXCJiYWJ5XCI6XCJcIixcImJhaWR1XCI6XCJcIixcImJhbmFtZXhcIjpcIlwiLFwiYmFuYW5hcmVwdWJsaWNcIjpcIlwiLFwiYmFuZFwiOlwiXCIsXCJiYW5rXCI6XCJcIixcImJhclwiOlwiXCIsXCJiYXJjZWxvbmFcIjpcIlwiLFwiYmFyY2xheWNhcmRcIjpcIlwiLFwiYmFyY2xheXNcIjpcIlwiLFwiYmFyZWZvb3RcIjpcIlwiLFwiYmFyZ2FpbnNcIjpcIlwiLFwiYmFzZWJhbGxcIjpcIlwiLFwiYmFza2V0YmFsbFwiOlwiXCIsXCJiYXVoYXVzXCI6XCJcIixcImJheWVyblwiOlwiXCIsXCJiYmNcIjpcIlwiLFwiYmJ0XCI6XCJcIixcImJidmFcIjpcIlwiLFwiYmNnXCI6XCJcIixcImJjblwiOlwiXCIsXCJiZWF0c1wiOlwiXCIsXCJiZWVyXCI6XCJcIixcImJlbnRsZXlcIjpcIlwiLFwiYmVybGluXCI6XCJcIixcImJlc3RcIjpcIlwiLFwiYmVzdGJ1eVwiOlwiXCIsXCJiZXRcIjpcIlwiLFwiYmhhcnRpXCI6XCJcIixcImJpYmxlXCI6XCJcIixcImJpZFwiOlwiXCIsXCJiaWtlXCI6XCJcIixcImJpbmdcIjpcIlwiLFwiYmluZ29cIjpcIlwiLFwiYmlvXCI6XCJcIixcImJsYWNrXCI6XCJcIixcImJsYWNrZnJpZGF5XCI6XCJcIixcImJsYW5jb1wiOlwiXCIsXCJibG9ja2J1c3RlclwiOlwiXCIsXCJibG9nXCI6XCJcIixcImJsb29tYmVyZ1wiOlwiXCIsXCJibHVlXCI6XCJcIixcImJtc1wiOlwiXCIsXCJibXdcIjpcIlwiLFwiYm5sXCI6XCJcIixcImJucHBhcmliYXNcIjpcIlwiLFwiYm9hdHNcIjpcIlwiLFwiYm9laHJpbmdlclwiOlwiXCIsXCJib2ZhXCI6XCJcIixcImJvbVwiOlwiXCIsXCJib25kXCI6XCJcIixcImJvb1wiOlwiXCIsXCJib29rXCI6XCJcIixcImJvb2tpbmdcIjpcIlwiLFwiYm9vdHNcIjpcIlwiLFwiYm9zY2hcIjpcIlwiLFwiYm9zdGlrXCI6XCJcIixcImJvdFwiOlwiXCIsXCJib3V0aXF1ZVwiOlwiXCIsXCJicmFkZXNjb1wiOlwiXCIsXCJicmlkZ2VzdG9uZVwiOlwiXCIsXCJicm9hZHdheVwiOlwiXCIsXCJicm9rZXJcIjpcIlwiLFwiYnJvdGhlclwiOlwiXCIsXCJicnVzc2Vsc1wiOlwiXCIsXCJidWRhcGVzdFwiOlwiXCIsXCJidWdhdHRpXCI6XCJcIixcImJ1aWxkXCI6XCJcIixcImJ1aWxkZXJzXCI6XCJcIixcImJ1c2luZXNzXCI6XCJcIixcImJ1eVwiOlwiXCIsXCJidXp6XCI6XCJcIixcImJ6aFwiOlwiXCIsXCJjYWJcIjpcIlwiLFwiY2FmZVwiOlwiXCIsXCJjYWxcIjpcIlwiLFwiY2FsbFwiOlwiXCIsXCJjYWx2aW5rbGVpblwiOlwiXCIsXCJjYW1lcmFcIjpcIlwiLFwiY2FtcFwiOlwiXCIsXCJjYW5jZXJyZXNlYXJjaFwiOlwiXCIsXCJjYW5vblwiOlwiXCIsXCJjYXBldG93blwiOlwiXCIsXCJjYXBpdGFsXCI6XCJcIixcImNhcGl0YWxvbmVcIjpcIlwiLFwiY2FyXCI6XCJcIixcImNhcmF2YW5cIjpcIlwiLFwiY2FyZHNcIjpcIlwiLFwiY2FyZVwiOlwiXCIsXCJjYXJlZXJcIjpcIlwiLFwiY2FyZWVyc1wiOlwiXCIsXCJjYXJzXCI6XCJcIixcImNhcnRpZXJcIjpcIlwiLFwiY2FzYVwiOlwiXCIsXCJjYXNlXCI6XCJcIixcImNhc2VpaFwiOlwiXCIsXCJjYXNoXCI6XCJcIixcImNhc2lub1wiOlwiXCIsXCJjYXRlcmluZ1wiOlwiXCIsXCJjYXRob2xpY1wiOlwiXCIsXCJjYmFcIjpcIlwiLFwiY2JuXCI6XCJcIixcImNicmVcIjpcIlwiLFwiY2JzXCI6XCJcIixcImNlYlwiOlwiXCIsXCJjZW50ZXJcIjpcIlwiLFwiY2VvXCI6XCJcIixcImNlcm5cIjpcIlwiLFwiY2ZhXCI6XCJcIixcImNmZFwiOlwiXCIsXCJjaGFuZWxcIjpcIlwiLFwiY2hhbm5lbFwiOlwiXCIsXCJjaGFzZVwiOlwiXCIsXCJjaGF0XCI6XCJcIixcImNoZWFwXCI6XCJcIixcImNoaW50YWlcIjpcIlwiLFwiY2hsb2VcIjpcIlwiLFwiY2hyaXN0bWFzXCI6XCJcIixcImNocm9tZVwiOlwiXCIsXCJjaHJ5c2xlclwiOlwiXCIsXCJjaHVyY2hcIjpcIlwiLFwiY2lwcmlhbmlcIjpcIlwiLFwiY2lyY2xlXCI6XCJcIixcImNpc2NvXCI6XCJcIixcImNpdGFkZWxcIjpcIlwiLFwiY2l0aVwiOlwiXCIsXCJjaXRpY1wiOlwiXCIsXCJjaXR5XCI6XCJcIixcImNpdHllYXRzXCI6XCJcIixcImNsYWltc1wiOlwiXCIsXCJjbGVhbmluZ1wiOlwiXCIsXCJjbGlja1wiOlwiXCIsXCJjbGluaWNcIjpcIlwiLFwiY2xpbmlxdWVcIjpcIlwiLFwiY2xvdGhpbmdcIjpcIlwiLFwiY2xvdWRcIjpcIlwiLFwiY2x1YlwiOlwiXCIsXCJjbHVibWVkXCI6XCJcIixcImNvYWNoXCI6XCJcIixcImNvZGVzXCI6XCJcIixcImNvZmZlZVwiOlwiXCIsXCJjb2xsZWdlXCI6XCJcIixcImNvbG9nbmVcIjpcIlwiLFwiY29tY2FzdFwiOlwiXCIsXCJjb21tYmFua1wiOlwiXCIsXCJjb21tdW5pdHlcIjpcIlwiLFwiY29tcGFueVwiOlwiXCIsXCJjb21wYXJlXCI6XCJcIixcImNvbXB1dGVyXCI6XCJcIixcImNvbXNlY1wiOlwiXCIsXCJjb25kb3NcIjpcIlwiLFwiY29uc3RydWN0aW9uXCI6XCJcIixcImNvbnN1bHRpbmdcIjpcIlwiLFwiY29udGFjdFwiOlwiXCIsXCJjb250cmFjdG9yc1wiOlwiXCIsXCJjb29raW5nXCI6XCJcIixcImNvb2tpbmdjaGFubmVsXCI6XCJcIixcImNvb2xcIjpcIlwiLFwiY29yc2ljYVwiOlwiXCIsXCJjb3VudHJ5XCI6XCJcIixcImNvdXBvblwiOlwiXCIsXCJjb3Vwb25zXCI6XCJcIixcImNvdXJzZXNcIjpcIlwiLFwiY3JlZGl0XCI6XCJcIixcImNyZWRpdGNhcmRcIjpcIlwiLFwiY3JlZGl0dW5pb25cIjpcIlwiLFwiY3JpY2tldFwiOlwiXCIsXCJjcm93blwiOlwiXCIsXCJjcnNcIjpcIlwiLFwiY3J1aXNlc1wiOlwiXCIsXCJjc2NcIjpcIlwiLFwiY3Vpc2luZWxsYVwiOlwiXCIsXCJjeW1ydVwiOlwiXCIsXCJjeW91XCI6XCJcIixcImRhYnVyXCI6XCJcIixcImRhZFwiOlwiXCIsXCJkYW5jZVwiOlwiXCIsXCJkYXRlXCI6XCJcIixcImRhdGluZ1wiOlwiXCIsXCJkYXRzdW5cIjpcIlwiLFwiZGF5XCI6XCJcIixcImRjbGtcIjpcIlwiLFwiZGRzXCI6XCJcIixcImRlYWxcIjpcIlwiLFwiZGVhbGVyXCI6XCJcIixcImRlYWxzXCI6XCJcIixcImRlZ3JlZVwiOlwiXCIsXCJkZWxpdmVyeVwiOlwiXCIsXCJkZWxsXCI6XCJcIixcImRlbG9pdHRlXCI6XCJcIixcImRlbHRhXCI6XCJcIixcImRlbW9jcmF0XCI6XCJcIixcImRlbnRhbFwiOlwiXCIsXCJkZW50aXN0XCI6XCJcIixcImRlc2lcIjpcIlwiLFwiZGVzaWduXCI6XCJcIixcImRldlwiOlwiXCIsXCJkaGxcIjpcIlwiLFwiZGlhbW9uZHNcIjpcIlwiLFwiZGlldFwiOlwiXCIsXCJkaWdpdGFsXCI6XCJcIixcImRpcmVjdFwiOlwiXCIsXCJkaXJlY3RvcnlcIjpcIlwiLFwiZGlzY291bnRcIjpcIlwiLFwiZGlzY292ZXJcIjpcIlwiLFwiZGlzaFwiOlwiXCIsXCJkaXlcIjpcIlwiLFwiZG5wXCI6XCJcIixcImRvY3NcIjpcIlwiLFwiZG9kZ2VcIjpcIlwiLFwiZG9nXCI6XCJcIixcImRvaGFcIjpcIlwiLFwiZG9tYWluc1wiOlwiXCIsXCJkb29zYW5cIjpcIlwiLFwiZG90XCI6XCJcIixcImRvd25sb2FkXCI6XCJcIixcImRyaXZlXCI6XCJcIixcImRzdHZcIjpcIlwiLFwiZHR2XCI6XCJcIixcImR1YmFpXCI6XCJcIixcImR1Y2tcIjpcIlwiLFwiZHVubG9wXCI6XCJcIixcImR1bnNcIjpcIlwiLFwiZHVwb250XCI6XCJcIixcImR1cmJhblwiOlwiXCIsXCJkdmFnXCI6XCJcIixcImR3Z1wiOlwiXCIsXCJlYXJ0aFwiOlwiXCIsXCJlYXRcIjpcIlwiLFwiZWRla2FcIjpcIlwiLFwiZWR1Y2F0aW9uXCI6XCJcIixcImVtYWlsXCI6XCJcIixcImVtZXJja1wiOlwiXCIsXCJlbWVyc29uXCI6XCJcIixcImVuZXJneVwiOlwiXCIsXCJlbmdpbmVlclwiOlwiXCIsXCJlbmdpbmVlcmluZ1wiOlwiXCIsXCJlbnRlcnByaXNlc1wiOlwiXCIsXCJlcG9zdFwiOlwiXCIsXCJlcHNvblwiOlwiXCIsXCJlcXVpcG1lbnRcIjpcIlwiLFwiZXJpY3Nzb25cIjpcIlwiLFwiZXJuaVwiOlwiXCIsXCJlc3FcIjpcIlwiLFwiZXN0YXRlXCI6XCJcIixcImVzdXJhbmNlXCI6XCJcIixcImV0aXNhbGF0XCI6XCJcIixcImV1cm92aXNpb25cIjpcIlwiLFwiZXVzXCI6XCJcIixcImV2ZW50c1wiOlwiXCIsXCJldmVyYmFua1wiOlwiXCIsXCJleGNoYW5nZVwiOlwiXCIsXCJleHBlcnRcIjpcIlwiLFwiZXhwb3NlZFwiOlwiXCIsXCJleHByZXNzXCI6XCJcIixcImV4dHJhc3BhY2VcIjpcIlwiLFwiZmFnZVwiOlwiXCIsXCJmYWlsXCI6XCJcIixcImZhaXJ3aW5kc1wiOlwiXCIsXCJmYWl0aFwiOlwiXCIsXCJmYW1pbHlcIjpcIlwiLFwiZmFuXCI6XCJcIixcImZhbnNcIjpcIlwiLFwiZmFybVwiOlwiXCIsXCJmYXJtZXJzXCI6XCJcIixcImZhc2hpb25cIjpcIlwiLFwiZmFzdFwiOlwiXCIsXCJmZWRleFwiOlwiXCIsXCJmZWVkYmFja1wiOlwiXCIsXCJmZXJyYXJpXCI6XCJcIixcImZlcnJlcm9cIjpcIlwiLFwiZmlhdFwiOlwiXCIsXCJmaWRlbGl0eVwiOlwiXCIsXCJmaWRvXCI6XCJcIixcImZpbG1cIjpcIlwiLFwiZmluYWxcIjpcIlwiLFwiZmluYW5jZVwiOlwiXCIsXCJmaW5hbmNpYWxcIjpcIlwiLFwiZmlyZVwiOlwiXCIsXCJmaXJlc3RvbmVcIjpcIlwiLFwiZmlybWRhbGVcIjpcIlwiLFwiZmlzaFwiOlwiXCIsXCJmaXNoaW5nXCI6XCJcIixcImZpdFwiOlwiXCIsXCJmaXRuZXNzXCI6XCJcIixcImZsaWNrclwiOlwiXCIsXCJmbGlnaHRzXCI6XCJcIixcImZsaXJcIjpcIlwiLFwiZmxvcmlzdFwiOlwiXCIsXCJmbG93ZXJzXCI6XCJcIixcImZsc21pZHRoXCI6XCJcIixcImZseVwiOlwiXCIsXCJmb29cIjpcIlwiLFwiZm9vZG5ldHdvcmtcIjpcIlwiLFwiZm9vdGJhbGxcIjpcIlwiLFwiZm9yZFwiOlwiXCIsXCJmb3JleFwiOlwiXCIsXCJmb3JzYWxlXCI6XCJcIixcImZvcnVtXCI6XCJcIixcImZvdW5kYXRpb25cIjpcIlwiLFwiZm94XCI6XCJcIixcImZyZXNlbml1c1wiOlwiXCIsXCJmcmxcIjpcIlwiLFwiZnJvZ2Fuc1wiOlwiXCIsXCJmcm9udGRvb3JcIjpcIlwiLFwiZnJvbnRpZXJcIjpcIlwiLFwiZnRyXCI6XCJcIixcImZ1aml0c3VcIjpcIlwiLFwiZnVqaXhlcm94XCI6XCJcIixcImZ1bmRcIjpcIlwiLFwiZnVybml0dXJlXCI6XCJcIixcImZ1dGJvbFwiOlwiXCIsXCJmeWlcIjpcIlwiLFwiZ2FsXCI6XCJcIixcImdhbGxlcnlcIjpcIlwiLFwiZ2FsbG9cIjpcIlwiLFwiZ2FsbHVwXCI6XCJcIixcImdhbWVcIjpcIlwiLFwiZ2FtZXNcIjpcIlwiLFwiZ2FwXCI6XCJcIixcImdhcmRlblwiOlwiXCIsXCJnYml6XCI6XCJcIixcImdkblwiOlwiXCIsXCJnZWFcIjpcIlwiLFwiZ2VudFwiOlwiXCIsXCJnZW50aW5nXCI6XCJcIixcImdlb3JnZVwiOlwiXCIsXCJnZ2VlXCI6XCJcIixcImdpZnRcIjpcIlwiLFwiZ2lmdHNcIjpcIlwiLFwiZ2l2ZXNcIjpcIlwiLFwiZ2l2aW5nXCI6XCJcIixcImdsYWRlXCI6XCJcIixcImdsYXNzXCI6XCJcIixcImdsZVwiOlwiXCIsXCJnbG9iYWxcIjpcIlwiLFwiZ2xvYm9cIjpcIlwiLFwiZ21haWxcIjpcIlwiLFwiZ21vXCI6XCJcIixcImdteFwiOlwiXCIsXCJnb2RhZGR5XCI6XCJcIixcImdvbGRcIjpcIlwiLFwiZ29sZHBvaW50XCI6XCJcIixcImdvbGZcIjpcIlwiLFwiZ29vXCI6XCJcIixcImdvb2RoYW5kc1wiOlwiXCIsXCJnb29keWVhclwiOlwiXCIsXCJnb29nXCI6XCJcIixcImdvb2dsZVwiOlwiXCIsXCJnb3BcIjpcIlwiLFwiZ290XCI6XCJcIixcImdvdHZcIjpcIlwiLFwiZ3JhaW5nZXJcIjpcIlwiLFwiZ3JhcGhpY3NcIjpcIlwiLFwiZ3JhdGlzXCI6XCJcIixcImdyZWVuXCI6XCJcIixcImdyaXBlXCI6XCJcIixcImdyb3VwXCI6XCJcIixcImd1YXJkaWFuXCI6XCJcIixcImd1Y2NpXCI6XCJcIixcImd1Z2VcIjpcIlwiLFwiZ3VpZGVcIjpcIlwiLFwiZ3VpdGFyc1wiOlwiXCIsXCJndXJ1XCI6XCJcIixcImhhbWJ1cmdcIjpcIlwiLFwiaGFuZ291dFwiOlwiXCIsXCJoYXVzXCI6XCJcIixcImhib1wiOlwiXCIsXCJoZGZjXCI6XCJcIixcImhkZmNiYW5rXCI6XCJcIixcImhlYWx0aFwiOlwiXCIsXCJoZWFsdGhjYXJlXCI6XCJcIixcImhlbHBcIjpcIlwiLFwiaGVsc2lua2lcIjpcIlwiLFwiaGVyZVwiOlwiXCIsXCJoZXJtZXNcIjpcIlwiLFwiaGd0dlwiOlwiXCIsXCJoaXBob3BcIjpcIlwiLFwiaGlzYW1pdHN1XCI6XCJcIixcImhpdGFjaGlcIjpcIlwiLFwiaGl2XCI6XCJcIixcImhrdFwiOlwiXCIsXCJob2NrZXlcIjpcIlwiLFwiaG9sZGluZ3NcIjpcIlwiLFwiaG9saWRheVwiOlwiXCIsXCJob21lZGVwb3RcIjpcIlwiLFwiaG9tZWdvb2RzXCI6XCJcIixcImhvbWVzXCI6XCJcIixcImhvbWVzZW5zZVwiOlwiXCIsXCJob25kYVwiOlwiXCIsXCJob25leXdlbGxcIjpcIlwiLFwiaG9yc2VcIjpcIlwiLFwiaG9zdFwiOlwiXCIsXCJob3N0aW5nXCI6XCJcIixcImhvdFwiOlwiXCIsXCJob3RlbGVzXCI6XCJcIixcImhvdG1haWxcIjpcIlwiLFwiaG91c2VcIjpcIlwiLFwiaG93XCI6XCJcIixcImhzYmNcIjpcIlwiLFwiaHRjXCI6XCJcIixcImh1Z2hlc1wiOlwiXCIsXCJoeWF0dFwiOlwiXCIsXCJoeXVuZGFpXCI6XCJcIixcImlibVwiOlwiXCIsXCJpY2JjXCI6XCJcIixcImljZVwiOlwiXCIsXCJpY3VcIjpcIlwiLFwiaWVlZVwiOlwiXCIsXCJpZm1cIjpcIlwiLFwiaWluZXRcIjpcIlwiLFwiaWthbm9cIjpcIlwiLFwiaW1hbWF0XCI6XCJcIixcImltZGJcIjpcIlwiLFwiaW1tb1wiOlwiXCIsXCJpbW1vYmlsaWVuXCI6XCJcIixcImluZHVzdHJpZXNcIjpcIlwiLFwiaW5maW5pdGlcIjpcIlwiLFwiaW5nXCI6XCJcIixcImlua1wiOlwiXCIsXCJpbnN0aXR1dGVcIjpcIlwiLFwiaW5zdXJhbmNlXCI6XCJcIixcImluc3VyZVwiOlwiXCIsXCJpbnRlbFwiOlwiXCIsXCJpbnRlcm5hdGlvbmFsXCI6XCJcIixcImludHVpdFwiOlwiXCIsXCJpbnZlc3RtZW50c1wiOlwiXCIsXCJpcGlyYW5nYVwiOlwiXCIsXCJpcmlzaFwiOlwiXCIsXCJpc2VsZWN0XCI6XCJcIixcImlzbWFpbGlcIjpcIlwiLFwiaXN0XCI6XCJcIixcImlzdGFuYnVsXCI6XCJcIixcIml0YXVcIjpcIlwiLFwiaXR2XCI6XCJcIixcIml2ZWNvXCI6XCJcIixcIml3Y1wiOlwiXCIsXCJqYWd1YXJcIjpcIlwiLFwiamF2YVwiOlwiXCIsXCJqY2JcIjpcIlwiLFwiamNwXCI6XCJcIixcImplZXBcIjpcIlwiLFwiamV0enRcIjpcIlwiLFwiamV3ZWxyeVwiOlwiXCIsXCJqaW9cIjpcIlwiLFwiamxjXCI6XCJcIixcImpsbFwiOlwiXCIsXCJqbXBcIjpcIlwiLFwiam5qXCI6XCJcIixcImpvYnVyZ1wiOlwiXCIsXCJqb3RcIjpcIlwiLFwiam95XCI6XCJcIixcImpwbW9yZ2FuXCI6XCJcIixcImpwcnNcIjpcIlwiLFwianVlZ29zXCI6XCJcIixcImp1bmlwZXJcIjpcIlwiLFwia2F1ZmVuXCI6XCJcIixcImtkZGlcIjpcIlwiLFwia2Vycnlob3RlbHNcIjpcIlwiLFwia2Vycnlsb2dpc3RpY3NcIjpcIlwiLFwia2Vycnlwcm9wZXJ0aWVzXCI6XCJcIixcImtmaFwiOlwiXCIsXCJraWFcIjpcIlwiLFwia2ltXCI6XCJcIixcImtpbmRlclwiOlwiXCIsXCJraW5kbGVcIjpcIlwiLFwia2l0Y2hlblwiOlwiXCIsXCJraXdpXCI6XCJcIixcImtvZWxuXCI6XCJcIixcImtvbWF0c3VcIjpcIlwiLFwia29zaGVyXCI6XCJcIixcImtwbWdcIjpcIlwiLFwia3BuXCI6XCJcIixcImtyZFwiOlwiXCIsXCJrcmVkXCI6XCJcIixcImt1b2tncm91cFwiOlwiXCIsXCJreWtuZXRcIjpcIlwiLFwia3lvdG9cIjpcIlwiLFwibGFjYWl4YVwiOlwiXCIsXCJsYWRicm9rZXNcIjpcIlwiLFwibGFtYm9yZ2hpbmlcIjpcIlwiLFwibGFtZXJcIjpcIlwiLFwibGFuY2FzdGVyXCI6XCJcIixcImxhbmNpYVwiOlwiXCIsXCJsYW5jb21lXCI6XCJcIixcImxhbmRcIjpcIlwiLFwibGFuZHJvdmVyXCI6XCJcIixcImxhbnhlc3NcIjpcIlwiLFwibGFzYWxsZVwiOlwiXCIsXCJsYXRcIjpcIlwiLFwibGF0aW5vXCI6XCJcIixcImxhdHJvYmVcIjpcIlwiLFwibGF3XCI6XCJcIixcImxhd3llclwiOlwiXCIsXCJsZHNcIjpcIlwiLFwibGVhc2VcIjpcIlwiLFwibGVjbGVyY1wiOlwiXCIsXCJsZWZyYWtcIjpcIlwiLFwibGVnYWxcIjpcIlwiLFwibGVnb1wiOlwiXCIsXCJsZXh1c1wiOlwiXCIsXCJsZ2J0XCI6XCJcIixcImxpYWlzb25cIjpcIlwiLFwibGlkbFwiOlwiXCIsXCJsaWZlXCI6XCJcIixcImxpZmVpbnN1cmFuY2VcIjpcIlwiLFwibGlmZXN0eWxlXCI6XCJcIixcImxpZ2h0aW5nXCI6XCJcIixcImxpa2VcIjpcIlwiLFwibGlsbHlcIjpcIlwiLFwibGltaXRlZFwiOlwiXCIsXCJsaW1vXCI6XCJcIixcImxpbmNvbG5cIjpcIlwiLFwibGluZGVcIjpcIlwiLFwibGlua1wiOlwiXCIsXCJsaXBzeVwiOlwiXCIsXCJsaXZlXCI6XCJcIixcImxpdmluZ1wiOlwiXCIsXCJsaXhpbFwiOlwiXCIsXCJsb2FuXCI6XCJcIixcImxvYW5zXCI6XCJcIixcImxvY2tlclwiOlwiXCIsXCJsb2N1c1wiOlwiXCIsXCJsb2Z0XCI6XCJcIixcImxvbFwiOlwiXCIsXCJsb25kb25cIjpcIlwiLFwibG90dGVcIjpcIlwiLFwibG90dG9cIjpcIlwiLFwibG92ZVwiOlwiXCIsXCJscGxcIjpcIlwiLFwibHBsZmluYW5jaWFsXCI6XCJcIixcImx0ZFwiOlwiXCIsXCJsdGRhXCI6XCJcIixcImx1bmRiZWNrXCI6XCJcIixcImx1cGluXCI6XCJcIixcImx1eGVcIjpcIlwiLFwibHV4dXJ5XCI6XCJcIixcIm1hY3lzXCI6XCJcIixcIm1hZHJpZFwiOlwiXCIsXCJtYWlmXCI6XCJcIixcIm1haXNvblwiOlwiXCIsXCJtYWtldXBcIjpcIlwiLFwibWFuXCI6XCJcIixcIm1hbmFnZW1lbnRcIjpcIlwiLFwibWFuZ29cIjpcIlwiLFwibWFya2V0XCI6XCJcIixcIm1hcmtldGluZ1wiOlwiXCIsXCJtYXJrZXRzXCI6XCJcIixcIm1hcnJpb3R0XCI6XCJcIixcIm1hcnNoYWxsc1wiOlwiXCIsXCJtYXNlcmF0aVwiOlwiXCIsXCJtYXR0ZWxcIjpcIlwiLFwibWJhXCI6XCJcIixcIm1jZFwiOlwiXCIsXCJtY2RvbmFsZHNcIjpcIlwiLFwibWNraW5zZXlcIjpcIlwiLFwibWVkXCI6XCJcIixcIm1lZGlhXCI6XCJcIixcIm1lZXRcIjpcIlwiLFwibWVsYm91cm5lXCI6XCJcIixcIm1lbWVcIjpcIlwiLFwibWVtb3JpYWxcIjpcIlwiLFwibWVuXCI6XCJcIixcIm1lbnVcIjpcIlwiLFwibWVvXCI6XCJcIixcIm1ldGxpZmVcIjpcIlwiLFwibWlhbWlcIjpcIlwiLFwibWljcm9zb2Z0XCI6XCJcIixcIm1pbmlcIjpcIlwiLFwibWludFwiOlwiXCIsXCJtaXRcIjpcIlwiLFwibWl0c3ViaXNoaVwiOlwiXCIsXCJtbGJcIjpcIlwiLFwibWxzXCI6XCJcIixcIm1tYVwiOlwiXCIsXCJtbmV0XCI6XCJcIixcIm1vYmlseVwiOlwiXCIsXCJtb2RhXCI6XCJcIixcIm1vZVwiOlwiXCIsXCJtb2lcIjpcIlwiLFwibW9tXCI6XCJcIixcIm1vbmFzaFwiOlwiXCIsXCJtb25leVwiOlwiXCIsXCJtb25zdGVyXCI6XCJcIixcIm1vbnRibGFuY1wiOlwiXCIsXCJtb3BhclwiOlwiXCIsXCJtb3Jtb25cIjpcIlwiLFwibW9ydGdhZ2VcIjpcIlwiLFwibW9zY293XCI6XCJcIixcIm1vdG9cIjpcIlwiLFwibW90b3JjeWNsZXNcIjpcIlwiLFwibW92XCI6XCJcIixcIm1vdmllXCI6XCJcIixcIm1vdmlzdGFyXCI6XCJcIixcIm1zZFwiOlwiXCIsXCJtdG5cIjpcIlwiLFwibXRwY1wiOlwiXCIsXCJtdHJcIjpcIlwiLFwibXVsdGljaG9pY2VcIjpcIlwiLFwibXV0dWFsXCI6XCJcIixcIm11dHVlbGxlXCI6XCJcIixcIm16YW5zaW1hZ2ljXCI6XCJcIixcIm5hYlwiOlwiXCIsXCJuYWRleFwiOlwiXCIsXCJuYWdveWFcIjpcIlwiLFwibmFzcGVyc1wiOlwiXCIsXCJuYXRpb253aWRlXCI6XCJcIixcIm5hdHVyYVwiOlwiXCIsXCJuYXZ5XCI6XCJcIixcIm5iYVwiOlwiXCIsXCJuZWNcIjpcIlwiLFwibmV0YmFua1wiOlwiXCIsXCJuZXRmbGl4XCI6XCJcIixcIm5ldHdvcmtcIjpcIlwiLFwibmV1c3RhclwiOlwiXCIsXCJuZXdcIjpcIlwiLFwibmV3aG9sbGFuZFwiOlwiXCIsXCJuZXdzXCI6XCJcIixcIm5leHRcIjpcIlwiLFwibmV4dGRpcmVjdFwiOlwiXCIsXCJuZXh1c1wiOlwiXCIsXCJuZmxcIjpcIlwiLFwibmdvXCI6XCJcIixcIm5oa1wiOlwiXCIsXCJuaWNvXCI6XCJcIixcIm5pa2VcIjpcIlwiLFwibmlrb25cIjpcIlwiLFwibmluamFcIjpcIlwiLFwibmlzc2FuXCI6XCJcIixcIm5pc3NheVwiOlwiXCIsXCJub2tpYVwiOlwiXCIsXCJub3J0aHdlc3Rlcm5tdXR1YWxcIjpcIlwiLFwibm9ydG9uXCI6XCJcIixcIm5vd1wiOlwiXCIsXCJub3dydXpcIjpcIlwiLFwibm93dHZcIjpcIlwiLFwibnJhXCI6XCJcIixcIm5yd1wiOlwiXCIsXCJudHRcIjpcIlwiLFwibnljXCI6XCJcIixcIm9iaVwiOlwiXCIsXCJvYnNlcnZlclwiOlwiXCIsXCJvZmZcIjpcIlwiLFwib2ZmaWNlXCI6XCJcIixcIm9raW5hd2FcIjpcIlwiLFwib2xheWFuXCI6XCJcIixcIm9sYXlhbmdyb3VwXCI6XCJcIixcIm9sZG5hdnlcIjpcIlwiLFwib2xsb1wiOlwiXCIsXCJvbWVnYVwiOlwiXCIsXCJvbmVcIjpcIlwiLFwib25nXCI6XCJcIixcIm9ubFwiOlwiXCIsXCJvbmxpbmVcIjpcIlwiLFwib255b3Vyc2lkZVwiOlwiXCIsXCJvb29cIjpcIlwiLFwib3BlblwiOlwiXCIsXCJvcmFjbGVcIjpcIlwiLFwib3JhbmdlXCI6XCJcIixcIm9yZ2FuaWNcIjpcIlwiLFwib3JpZW50ZXhwcmVzc1wiOlwiXCIsXCJvcmlnaW5zXCI6XCJcIixcIm9zYWthXCI6XCJcIixcIm90c3VrYVwiOlwiXCIsXCJvdHRcIjpcIlwiLFwib3ZoXCI6XCJcIixcInBhZ2VcIjpcIlwiLFwicGFtcGVyZWRjaGVmXCI6XCJcIixcInBhbmFzb25pY1wiOlwiXCIsXCJwYW5lcmFpXCI6XCJcIixcInBhcmlzXCI6XCJcIixcInBhcnNcIjpcIlwiLFwicGFydG5lcnNcIjpcIlwiLFwicGFydHNcIjpcIlwiLFwicGFydHlcIjpcIlwiLFwicGFzc2FnZW5zXCI6XCJcIixcInBheVwiOlwiXCIsXCJwYXl1XCI6XCJcIixcInBjY3dcIjpcIlwiLFwicGV0XCI6XCJcIixcInBmaXplclwiOlwiXCIsXCJwaGFybWFjeVwiOlwiXCIsXCJwaGlsaXBzXCI6XCJcIixcInBob3RvXCI6XCJcIixcInBob3RvZ3JhcGh5XCI6XCJcIixcInBob3Rvc1wiOlwiXCIsXCJwaHlzaW9cIjpcIlwiLFwicGlhZ2V0XCI6XCJcIixcInBpY3NcIjpcIlwiLFwicGljdGV0XCI6XCJcIixcInBpY3R1cmVzXCI6XCJcIixcInBpZFwiOlwiXCIsXCJwaW5cIjpcIlwiLFwicGluZ1wiOlwiXCIsXCJwaW5rXCI6XCJcIixcInBpb25lZXJcIjpcIlwiLFwicGl6emFcIjpcIlwiLFwicGxhY2VcIjpcIlwiLFwicGxheVwiOlwiXCIsXCJwbGF5c3RhdGlvblwiOlwiXCIsXCJwbHVtYmluZ1wiOlwiXCIsXCJwbHVzXCI6XCJcIixcInBuY1wiOlwiXCIsXCJwb2hsXCI6XCJcIixcInBva2VyXCI6XCJcIixcInBvbGl0aWVcIjpcIlwiLFwicG9yblwiOlwiXCIsXCJwcmFtZXJpY2FcIjpcIlwiLFwicHJheGlcIjpcIlwiLFwicHJlc3NcIjpcIlwiLFwicHJpbWVcIjpcIlwiLFwicHJvZFwiOlwiXCIsXCJwcm9kdWN0aW9uc1wiOlwiXCIsXCJwcm9mXCI6XCJcIixcInByb2dyZXNzaXZlXCI6XCJcIixcInByb21vXCI6XCJcIixcInByb3BlcnRpZXNcIjpcIlwiLFwicHJvcGVydHlcIjpcIlwiLFwicHJvdGVjdGlvblwiOlwiXCIsXCJwcnVcIjpcIlwiLFwicHJ1ZGVudGlhbFwiOlwiXCIsXCJwdWJcIjpcIlwiLFwicHdjXCI6XCJcIixcInFwb25cIjpcIlwiLFwicXVlYmVjXCI6XCJcIixcInF1ZXN0XCI6XCJcIixcInF2Y1wiOlwiXCIsXCJyYWNpbmdcIjpcIlwiLFwicmFpZFwiOlwiXCIsXCJyZWFkXCI6XCJcIixcInJlYWxlc3RhdGVcIjpcIlwiLFwicmVhbHRvclwiOlwiXCIsXCJyZWFsdHlcIjpcIlwiLFwicmVjaXBlc1wiOlwiXCIsXCJyZWRcIjpcIlwiLFwicmVkc3RvbmVcIjpcIlwiLFwicmVkdW1icmVsbGFcIjpcIlwiLFwicmVoYWJcIjpcIlwiLFwicmVpc2VcIjpcIlwiLFwicmVpc2VuXCI6XCJcIixcInJlaXRcIjpcIlwiLFwicmVsaWFuY2VcIjpcIlwiLFwicmVuXCI6XCJcIixcInJlbnRcIjpcIlwiLFwicmVudGFsc1wiOlwiXCIsXCJyZXBhaXJcIjpcIlwiLFwicmVwb3J0XCI6XCJcIixcInJlcHVibGljYW5cIjpcIlwiLFwicmVzdFwiOlwiXCIsXCJyZXN0YXVyYW50XCI6XCJcIixcInJldmlld1wiOlwiXCIsXCJyZXZpZXdzXCI6XCJcIixcInJleHJvdGhcIjpcIlwiLFwicmljaFwiOlwiXCIsXCJyaWNoYXJkbGlcIjpcIlwiLFwicmljb2hcIjpcIlwiLFwicmlnaHRhdGhvbWVcIjpcIlwiLFwicmlsXCI6XCJcIixcInJpb1wiOlwiXCIsXCJyaXBcIjpcIlwiLFwicm9jaGVyXCI6XCJcIixcInJvY2tzXCI6XCJcIixcInJvZGVvXCI6XCJcIixcInJvZ2Vyc1wiOlwiXCIsXCJyb29tXCI6XCJcIixcInJzdnBcIjpcIlwiLFwicnVoclwiOlwiXCIsXCJydW5cIjpcIlwiLFwicndlXCI6XCJcIixcInJ5dWt5dVwiOlwiXCIsXCJzYWFybGFuZFwiOlwiXCIsXCJzYWZlXCI6XCJcIixcInNhZmV0eVwiOlwiXCIsXCJzYWt1cmFcIjpcIlwiLFwic2FsZVwiOlwiXCIsXCJzYWxvblwiOlwiXCIsXCJzYW1zY2x1YlwiOlwiXCIsXCJzYW1zdW5nXCI6XCJcIixcInNhbmR2aWtcIjpcIlwiLFwic2FuZHZpa2Nvcm9tYW50XCI6XCJcIixcInNhbm9maVwiOlwiXCIsXCJzYXBcIjpcIlwiLFwic2Fwb1wiOlwiXCIsXCJzYXJsXCI6XCJcIixcInNhc1wiOlwiXCIsXCJzYXZlXCI6XCJcIixcInNheG9cIjpcIlwiLFwic2JpXCI6XCJcIixcInNic1wiOlwiXCIsXCJzY2FcIjpcIlwiLFwic2NiXCI6XCJcIixcInNjaGFlZmZsZXJcIjpcIlwiLFwic2NobWlkdFwiOlwiXCIsXCJzY2hvbGFyc2hpcHNcIjpcIlwiLFwic2Nob29sXCI6XCJcIixcInNjaHVsZVwiOlwiXCIsXCJzY2h3YXJ6XCI6XCJcIixcInNjaWVuY2VcIjpcIlwiLFwic2Nqb2huc29uXCI6XCJcIixcInNjb3JcIjpcIlwiLFwic2NvdFwiOlwiXCIsXCJzZWF0XCI6XCJcIixcInNlY3VyZVwiOlwiXCIsXCJzZWN1cml0eVwiOlwiXCIsXCJzZWVrXCI6XCJcIixcInNlbGVjdFwiOlwiXCIsXCJzZW5lclwiOlwiXCIsXCJzZXJ2aWNlc1wiOlwiXCIsXCJzZXNcIjpcIlwiLFwic2V2ZW5cIjpcIlwiLFwic2V3XCI6XCJcIixcInNleFwiOlwiXCIsXCJzZXh5XCI6XCJcIixcInNmclwiOlwiXCIsXCJzaGFuZ3JpbGFcIjpcIlwiLFwic2hhcnBcIjpcIlwiLFwic2hhd1wiOlwiXCIsXCJzaGVsbFwiOlwiXCIsXCJzaGlhXCI6XCJcIixcInNoaWtzaGFcIjpcIlwiLFwic2hvZXNcIjpcIlwiLFwic2hvdWppXCI6XCJcIixcInNob3dcIjpcIlwiLFwic2hvd3RpbWVcIjpcIlwiLFwic2hyaXJhbVwiOlwiXCIsXCJzaWxrXCI6XCJcIixcInNpbmFcIjpcIlwiLFwic2luZ2xlc1wiOlwiXCIsXCJzaXRlXCI6XCJcIixcInNraVwiOlwiXCIsXCJza2luXCI6XCJcIixcInNreVwiOlwiXCIsXCJza3lwZVwiOlwiXCIsXCJzbGluZ1wiOlwiXCIsXCJzbWFydFwiOlwiXCIsXCJzbWlsZVwiOlwiXCIsXCJzbmNmXCI6XCJcIixcInNvY2NlclwiOlwiXCIsXCJzb2NpYWxcIjpcIlwiLFwic29mdGJhbmtcIjpcIlwiLFwic29mdHdhcmVcIjpcIlwiLFwic29odVwiOlwiXCIsXCJzb2xhclwiOlwiXCIsXCJzb2x1dGlvbnNcIjpcIlwiLFwic29uZ1wiOlwiXCIsXCJzb255XCI6XCJcIixcInNveVwiOlwiXCIsXCJzcGFjZVwiOlwiXCIsXCJzcGllZ2VsXCI6XCJcIixcInNwb3RcIjpcIlwiLFwic3ByZWFkYmV0dGluZ1wiOlwiXCIsXCJzcmxcIjpcIlwiLFwic3J0XCI6XCJcIixcInN0YWRhXCI6XCJcIixcInN0YXBsZXNcIjpcIlwiLFwic3RhclwiOlwiXCIsXCJzdGFyaHViXCI6XCJcIixcInN0YXRlYmFua1wiOlwiXCIsXCJzdGF0ZWZhcm1cIjpcIlwiLFwic3RhdG9pbFwiOlwiXCIsXCJzdGNcIjpcIlwiLFwic3RjZ3JvdXBcIjpcIlwiLFwic3RvY2tob2xtXCI6XCJcIixcInN0b3JhZ2VcIjpcIlwiLFwic3RvcmVcIjpcIlwiLFwic3R1ZGlvXCI6XCJcIixcInN0dWR5XCI6XCJcIixcInN0eWxlXCI6XCJcIixcInN1Y2tzXCI6XCJcIixcInN1cGVyc3BvcnRcIjpcIlwiLFwic3VwcGxpZXNcIjpcIlwiLFwic3VwcGx5XCI6XCJcIixcInN1cHBvcnRcIjpcIlwiLFwic3VyZlwiOlwiXCIsXCJzdXJnZXJ5XCI6XCJcIixcInN1enVraVwiOlwiXCIsXCJzd2F0Y2hcIjpcIlwiLFwic3dpZnRjb3ZlclwiOlwiXCIsXCJzd2lzc1wiOlwiXCIsXCJzeWRuZXlcIjpcIlwiLFwic3ltYW50ZWNcIjpcIlwiLFwic3lzdGVtc1wiOlwiXCIsXCJ0YWJcIjpcIlwiLFwidGFpcGVpXCI6XCJcIixcInRhbGtcIjpcIlwiLFwidGFvYmFvXCI6XCJcIixcInRhcmdldFwiOlwiXCIsXCJ0YXRhbW90b3JzXCI6XCJcIixcInRhdGFyXCI6XCJcIixcInRhdHRvb1wiOlwiXCIsXCJ0YXhcIjpcIlwiLFwidGF4aVwiOlwiXCIsXCJ0Y2lcIjpcIlwiLFwidGRrXCI6XCJcIixcInRlYW1cIjpcIlwiLFwidGVjaFwiOlwiXCIsXCJ0ZWNobm9sb2d5XCI6XCJcIixcInRlbGVjaXR5XCI6XCJcIixcInRlbGVmb25pY2FcIjpcIlwiLFwidGVtYXNla1wiOlwiXCIsXCJ0ZW5uaXNcIjpcIlwiLFwidGV2YVwiOlwiXCIsXCJ0aGRcIjpcIlwiLFwidGhlYXRlclwiOlwiXCIsXCJ0aGVhdHJlXCI6XCJcIixcInRoZWd1YXJkaWFuXCI6XCJcIixcInRpYWFcIjpcIlwiLFwidGlja2V0c1wiOlwiXCIsXCJ0aWVuZGFcIjpcIlwiLFwidGlmZmFueVwiOlwiXCIsXCJ0aXBzXCI6XCJcIixcInRpcmVzXCI6XCJcIixcInRpcm9sXCI6XCJcIixcInRqbWF4eFwiOlwiXCIsXCJ0anhcIjpcIlwiLFwidGttYXh4XCI6XCJcIixcInRtYWxsXCI6XCJcIixcInRvZGF5XCI6XCJcIixcInRva3lvXCI6XCJcIixcInRvb2xzXCI6XCJcIixcInRvcFwiOlwiXCIsXCJ0b3JheVwiOlwiXCIsXCJ0b3NoaWJhXCI6XCJcIixcInRvdGFsXCI6XCJcIixcInRvdXJzXCI6XCJcIixcInRvd25cIjpcIlwiLFwidG95b3RhXCI6XCJcIixcInRveXNcIjpcIlwiLFwidHJhZGVcIjpcIlwiLFwidHJhZGluZ1wiOlwiXCIsXCJ0cmFpbmluZ1wiOlwiXCIsXCJ0cmF2ZWxjaGFubmVsXCI6XCJcIixcInRyYXZlbGVyc1wiOlwiXCIsXCJ0cmF2ZWxlcnNpbnN1cmFuY2VcIjpcIlwiLFwidHJ1c3RcIjpcIlwiLFwidHJ2XCI6XCJcIixcInR1YmVcIjpcIlwiLFwidHVpXCI6XCJcIixcInR1bmVzXCI6XCJcIixcInR1c2h1XCI6XCJcIixcInR2c1wiOlwiXCIsXCJ1YmFua1wiOlwiXCIsXCJ1YnNcIjpcIlwiLFwidWNvbm5lY3RcIjpcIlwiLFwidW5pY29tXCI6XCJcIixcInVuaXZlcnNpdHlcIjpcIlwiLFwidW5vXCI6XCJcIixcInVvbFwiOlwiXCIsXCJ1cHNcIjpcIlwiLFwidmFjYXRpb25zXCI6XCJcIixcInZhbmFcIjpcIlwiLFwidmFuZ3VhcmRcIjpcIlwiLFwidmVnYXNcIjpcIlwiLFwidmVudHVyZXNcIjpcIlwiLFwidmVyaXNpZ25cIjpcIlwiLFwidmVyc2ljaGVydW5nXCI6XCJcIixcInZldFwiOlwiXCIsXCJ2aWFqZXNcIjpcIlwiLFwidmlkZW9cIjpcIlwiLFwidmlnXCI6XCJcIixcInZpa2luZ1wiOlwiXCIsXCJ2aWxsYXNcIjpcIlwiLFwidmluXCI6XCJcIixcInZpcFwiOlwiXCIsXCJ2aXJnaW5cIjpcIlwiLFwidmlzYVwiOlwiXCIsXCJ2aXNpb25cIjpcIlwiLFwidmlzdGFcIjpcIlwiLFwidmlzdGFwcmludFwiOlwiXCIsXCJ2aXZhXCI6XCJcIixcInZpdm9cIjpcIlwiLFwidmxhYW5kZXJlblwiOlwiXCIsXCJ2b2RrYVwiOlwiXCIsXCJ2b2xrc3dhZ2VuXCI6XCJcIixcInZvdGVcIjpcIlwiLFwidm90aW5nXCI6XCJcIixcInZvdG9cIjpcIlwiLFwidm95YWdlXCI6XCJcIixcInZ1ZWxvc1wiOlwiXCIsXCJ3YWxlc1wiOlwiXCIsXCJ3YWxtYXJ0XCI6XCJcIixcIndhbHRlclwiOlwiXCIsXCJ3YW5nXCI6XCJcIixcIndhbmdnb3VcIjpcIlwiLFwid2FybWFuXCI6XCJcIixcIndhdGNoXCI6XCJcIixcIndhdGNoZXNcIjpcIlwiLFwid2VhdGhlclwiOlwiXCIsXCJ3ZWF0aGVyY2hhbm5lbFwiOlwiXCIsXCJ3ZWJjYW1cIjpcIlwiLFwid2ViZXJcIjpcIlwiLFwid2Vic2l0ZVwiOlwiXCIsXCJ3ZWRcIjpcIlwiLFwid2VkZGluZ1wiOlwiXCIsXCJ3ZWlib1wiOlwiXCIsXCJ3ZWlyXCI6XCJcIixcIndob3N3aG9cIjpcIlwiLFwid2llblwiOlwiXCIsXCJ3aWtpXCI6XCJcIixcIndpbGxpYW1oaWxsXCI6XCJcIixcIndpblwiOlwiXCIsXCJ3aW5kb3dzXCI6XCJcIixcIndpbmVcIjpcIlwiLFwid2lubmVyc1wiOlwiXCIsXCJ3bWVcIjpcIlwiLFwid29sdGVyc2tsdXdlclwiOlwiXCIsXCJ3b29kc2lkZVwiOlwiXCIsXCJ3b3JrXCI6XCJcIixcIndvcmtzXCI6XCJcIixcIndvcmxkXCI6XCJcIixcIndvd1wiOlwiXCIsXCJ3dGNcIjpcIlwiLFwid3RmXCI6XCJcIixcInhib3hcIjpcIlwiLFwieGVyb3hcIjpcIlwiLFwieGZpbml0eVwiOlwiXCIsXCJ4aWh1YW5cIjpcIlwiLFwieGluXCI6XCJcIixcInhuLS0xMWI0YzNkXCI6XCJcIixcInhuLS0xY2syZTFiXCI6XCJcIixcInhuLS0xcXF3MjNhXCI6XCJcIixcInhuLS0zMHJyN3lcIjpcIlwiLFwieG4tLTNic3QwMG1cIjpcIlwiLFwieG4tLTNkczQ0M2dcIjpcIlwiLFwieG4tLTNvcTE4dmw4cG4zNmFcIjpcIlwiLFwieG4tLTNweHU4a1wiOlwiXCIsXCJ4bi0tNDJjMmQ5YVwiOlwiXCIsXCJ4bi0tNDVxMTFjXCI6XCJcIixcInhuLS00Z2JyaW1cIjpcIlwiLFwieG4tLTRncTQ4bGY5alwiOlwiXCIsXCJ4bi0tNTVxdzQyZ1wiOlwiXCIsXCJ4bi0tNTVxeDVkXCI6XCJcIixcInhuLS01c3UzNGo5MzZiZ3NnXCI6XCJcIixcInhuLS01dHptNWdcIjpcIlwiLFwieG4tLTZmcno4MmdcIjpcIlwiLFwieG4tLTZxcTk4NmIzeGxcIjpcIlwiLFwieG4tLTgwYWR4aGtzXCI6XCJcIixcInhuLS04MGFxZWNkcjFhXCI6XCJcIixcInhuLS04MGFzZWhkYlwiOlwiXCIsXCJ4bi0tODBhc3dnXCI6XCJcIixcInhuLS04eTBhMDYzYVwiOlwiXCIsXCJ4bi0tOWRicTJhXCI6XCJcIixcInhuLS05ZXQ1MnVcIjpcIlwiLFwieG4tLTlrcnQwMGFcIjpcIlwiLFwieG4tLWI0dzYwNWZlcmRcIjpcIlwiLFwieG4tLWJjazFiOWE1ZHJlNGNcIjpcIlwiLFwieG4tLWMxYXZnXCI6XCJcIixcInhuLS1jMmJyN2dcIjpcIlwiLFwieG4tLWNjazJiM2JcIjpcIlwiLFwieG4tLWNnNGJraVwiOlwiXCIsXCJ4bi0tY3pyNjk0YlwiOlwiXCIsXCJ4bi0tY3pyczB0XCI6XCJcIixcInhuLS1jenJ1MmRcIjpcIlwiLFwieG4tLWQxYWNqM2JcIjpcIlwiLFwieG4tLWVja3ZkdGM5ZFwiOlwiXCIsXCJ4bi0tZWZ2eTg4aFwiOlwiXCIsXCJ4bi0tZXN0djc1Z1wiOlwiXCIsXCJ4bi0tZmN0NDI5a1wiOlwiXCIsXCJ4bi0tZmhiZWlcIjpcIlwiLFwieG4tLWZpcTIyOGM1aHNcIjpcIlwiLFwieG4tLWZpcTY0YlwiOlwiXCIsXCJ4bi0tZmpxNzIwYVwiOlwiXCIsXCJ4bi0tZmx3MzUxZVwiOlwiXCIsXCJ4bi0tZnp5czhkNjl1dmdtXCI6XCJcIixcInhuLS1nMnh4NDhjXCI6XCJcIixcInhuLS1nY2tyM2YwZlwiOlwiXCIsXCJ4bi0tZ2szYXQxZVwiOlwiXCIsXCJ4bi0taHh0ODE0ZVwiOlwiXCIsXCJ4bi0taTFiNmIxYTZhMmVcIjpcIlwiLFwieG4tLWltcjUxM25cIjpcIlwiLFwieG4tLWlvMGE3aVwiOlwiXCIsXCJ4bi0tajFhZWZcIjpcIlwiLFwieG4tLWpscTYxdTl3N2JcIjpcIlwiLFwieG4tLWp2cjE4OW1cIjpcIlwiLFwieG4tLWtjcng3N2QxeDRhXCI6XCJcIixcInhuLS1rcHU3MTZmXCI6XCJcIixcInhuLS1rcHV0M2lcIjpcIlwiLFwieG4tLW1nYmEzYTNlanRcIjpcIlwiLFwieG4tLW1nYmE3YzBiYm4wYVwiOlwiXCIsXCJ4bi0tbWdiYWFrYzdkdmZcIjpcIlwiLFwieG4tLW1nYmFiMmJkXCI6XCJcIixcInhuLS1tZ2JiOWZicG9iXCI6XCJcIixcInhuLS1tZ2JjYTdkemRvXCI6XCJcIixcInhuLS1tZ2JpNGVjZXhwXCI6XCJcIixcInhuLS1tZ2J0M2RoZFwiOlwiXCIsXCJ4bi0tbWsxYnU0NGNcIjpcIlwiLFwieG4tLW14dHExbVwiOlwiXCIsXCJ4bi0tbmdiYzVhemRcIjpcIlwiLFwieG4tLW5nYmU5ZTBhXCI6XCJcIixcInhuLS1ucXY3ZlwiOlwiXCIsXCJ4bi0tbnF2N2ZzMDBlbWFcIjpcIlwiLFwieG4tLW55cXkyNmFcIjpcIlwiLFwieG4tLXAxYWNmXCI6XCJcIixcInhuLS1wYnQ5NzdjXCI6XCJcIixcInhuLS1wc3N5MnVcIjpcIlwiLFwieG4tLXE5anliNGNcIjpcIlwiLFwieG4tLXFja2ExcG1jXCI6XCJcIixcInhuLS1yaHF2OTZnXCI6XCJcIixcInhuLS1yb3Z1ODhiXCI6XCJcIixcInhuLS1zZXM1NTRnXCI6XCJcIixcInhuLS10NjBiNTZhXCI6XCJcIixcInhuLS10Y2t3ZVwiOlwiXCIsXCJ4bi0tdGlxNDl4cXlqXCI6XCJcIixcInhuLS11bnVwNHlcIjpcIlwiLFwieG4tLXZlcm1nZW5zYmVyYXRlci1jdGJcIjpcIlwiLFwieG4tLXZlcm1nZW5zYmVyYXR1bmctcHdiXCI6XCJcIixcInhuLS12aHF1dlwiOlwiXCIsXCJ4bi0tdnVxODYxYlwiOlwiXCIsXCJ4bi0tdzRyODVlbDhmaHU1ZG5yYVwiOlwiXCIsXCJ4bi0tdzRyczQwbFwiOlwiXCIsXCJ4bi0teGhxNTIxYlwiOlwiXCIsXCJ4bi0temZyMTY0YlwiOlwiXCIsXCJ4cGVyaWFcIjpcIlwiLFwieHl6XCI6XCJcIixcInlhY2h0c1wiOlwiXCIsXCJ5YWhvb1wiOlwiXCIsXCJ5YW1heHVuXCI6XCJcIixcInlhbmRleFwiOlwiXCIsXCJ5b2RvYmFzaGlcIjpcIlwiLFwieW9nYVwiOlwiXCIsXCJ5b2tvaGFtYVwiOlwiXCIsXCJ5b3VcIjpcIlwiLFwieW91dHViZVwiOlwiXCIsXCJ5dW5cIjpcIlwiLFwiemFwcG9zXCI6XCJcIixcInphcmFcIjpcIlwiLFwiemVyb1wiOlwiXCIsXCJ6aXBcIjpcIlwiLFwiemlwcG9cIjpcIlwiLFwiem9uZVwiOlwiXCIsXCJ6dWVyaWNoXCI6XCJcIn0iLCJVMiA9IHJlcXVpcmUgJ3VnbGlmeS1qcydcbklQID0gcmVxdWlyZSAnaXAtYWRkcmVzcydcblVybCA9IHJlcXVpcmUgJ3VybCdcbntzaEV4cDJSZWdFeHAsIGVzY2FwZVNsYXNofSA9IHJlcXVpcmUgJy4vc2hleHBfdXRpbHMnXG57QXR0YWNoZWRDYWNoZX0gPSByZXF1aXJlICcuL3V0aWxzJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPVxuICByZXF1ZXN0RnJvbVVybDogKHVybCkgLT5cbiAgICBpZiB0eXBlb2YgdXJsID09ICdzdHJpbmcnXG4gICAgICB1cmwgPSBVcmwucGFyc2UgdXJsXG4gICAgcmVxID1cbiAgICAgIHVybDogVXJsLmZvcm1hdCh1cmwpXG4gICAgICBob3N0OiB1cmwuaG9zdG5hbWVcbiAgICAgIHNjaGVtZTogdXJsLnByb3RvY29sLnJlcGxhY2UoJzonLCAnJylcblxuICB1cmxXaWxkY2FyZDJIb3N0V2lsZGNhcmQ6IChwYXR0ZXJuKSAtPlxuICAgIHJlc3VsdCA9IHBhdHRlcm4ubWF0Y2ggLy8vXG4gICAgICBeXFwqOlxcL1xcLyAjIEJlZ2lucyB3aXRoICo6Ly9cbiAgICAgICgoPzpcXHd8Wz8qLl9cXC1dKSspICMgVGhlIGhvc3QgcGFydCBmb2xsb3dzLlxuICAgICAgXFwvXFwqJCAjIEFuZCBlbmRzIHdpdGggLypcbiAgICAvLy9cbiAgICByZXN1bHQ/WzFdXG4gIHRhZzogKGNvbmRpdGlvbikgLT4gZXhwb3J0cy5fY29uZENhY2hlLnRhZyhjb25kaXRpb24pXG4gIGFuYWx5emU6IChjb25kaXRpb24pIC0+IGV4cG9ydHMuX2NvbmRDYWNoZS5nZXQgY29uZGl0aW9uLCAtPiB7XG4gICAgYW5hbHl6ZWQ6IGV4cG9ydHMuX2hhbmRsZXIoY29uZGl0aW9uLmNvbmRpdGlvblR5cGUpLmFuYWx5emUuY2FsbChcbiAgICAgIGV4cG9ydHMsIGNvbmRpdGlvbilcbiAgfVxuICBtYXRjaDogKGNvbmRpdGlvbiwgcmVxdWVzdCkgLT5cbiAgICBjYWNoZSA9IGV4cG9ydHMuYW5hbHl6ZShjb25kaXRpb24pXG4gICAgZXhwb3J0cy5faGFuZGxlcihjb25kaXRpb24uY29uZGl0aW9uVHlwZSkubWF0Y2guY2FsbChleHBvcnRzLCBjb25kaXRpb24sXG4gICAgICByZXF1ZXN0LCBjYWNoZSlcbiAgY29tcGlsZTogKGNvbmRpdGlvbikgLT5cbiAgICBjYWNoZSA9IGV4cG9ydHMuYW5hbHl6ZShjb25kaXRpb24pXG4gICAgcmV0dXJuIGNhY2hlLmNvbXBpbGVkIGlmIGNhY2hlLmNvbXBpbGVkXG4gICAgaGFuZGxlciA9IGV4cG9ydHMuX2hhbmRsZXIoY29uZGl0aW9uLmNvbmRpdGlvblR5cGUpXG4gICAgY2FjaGUuY29tcGlsZWQgPSBoYW5kbGVyLmNvbXBpbGUuY2FsbChleHBvcnRzLCBjb25kaXRpb24sIGNhY2hlKVxuICBzdHI6IChjb25kaXRpb24sIHthYmJyfSA9IHthYmJyOiAtMX0pIC0+XG4gICAgaGFuZGxlciA9IGV4cG9ydHMuX2hhbmRsZXIoY29uZGl0aW9uLmNvbmRpdGlvblR5cGUpXG4gICAgaWYgaGFuZGxlci5hYmJyc1swXS5sZW5ndGggPT0gMFxuICAgICAgZW5kQ29kZSA9IGNvbmRpdGlvbi5wYXR0ZXJuLmNoYXJDb2RlQXQoY29uZGl0aW9uLnBhdHRlcm4ubGVuZ3RoIC0gMSlcbiAgICAgIGlmIGVuZENvZGUgIT0gZXhwb3J0cy5jb2xvbkNoYXJDb2RlIGFuZCBjb25kaXRpb24ucGF0dGVybi5pbmRleE9mKCcgJykgPCAwXG4gICAgICAgIHJldHVybiBjb25kaXRpb24ucGF0dGVyblxuICAgIHN0ciA9IGhhbmRsZXIuc3RyXG4gICAgdHlwZVN0ciA9XG4gICAgICBpZiB0eXBlb2YgYWJiciA9PSAnbnVtYmVyJ1xuICAgICAgICBoYW5kbGVyLmFiYnJzWyhoYW5kbGVyLmFiYnJzLmxlbmd0aCArIGFiYnIpICUgaGFuZGxlci5hYmJycy5sZW5ndGhdXG4gICAgICBlbHNlXG4gICAgICAgIGNvbmRpdGlvbi5jb25kaXRpb25UeXBlXG4gICAgcmVzdWx0ID0gdHlwZVN0ciArICc6J1xuICAgIHBhcnQgPSBpZiBzdHIgdGhlbiBzdHIuY2FsbChleHBvcnRzLCBjb25kaXRpb24pIGVsc2UgY29uZGl0aW9uLnBhdHRlcm5cbiAgICByZXN1bHQgKz0gJyAnICsgcGFydCBpZiBwYXJ0XG4gICAgcmV0dXJuIHJlc3VsdFxuXG4gIGNvbG9uQ2hhckNvZGU6ICc6Jy5jaGFyQ29kZUF0KDApXG4gIGZyb21TdHI6IChzdHIpIC0+XG4gICAgc3RyID0gc3RyLnRyaW0oKVxuICAgIGkgPSBzdHIuaW5kZXhPZignICcpXG4gICAgaSA9IHN0ci5sZW5ndGggaWYgaSA8IDBcbiAgICBpZiBzdHIuY2hhckNvZGVBdChpIC0gMSkgPT0gZXhwb3J0cy5jb2xvbkNoYXJDb2RlXG4gICAgICBjb25kaXRpb25UeXBlID0gc3RyLnN1YnN0cigwLCBpIC0gMSlcbiAgICAgIHN0ciA9IHN0ci5zdWJzdHIoaSArIDEpLnRyaW0oKVxuICAgIGVsc2VcbiAgICAgIGNvbmRpdGlvblR5cGUgPSAnJ1xuXG4gICAgY29uZGl0aW9uVHlwZSA9IGV4cG9ydHMudHlwZUZyb21BYmJyKGNvbmRpdGlvblR5cGUpXG4gICAgcmV0dXJuIG51bGwgdW5sZXNzIGNvbmRpdGlvblR5cGVcbiAgICBjb25kaXRpb24gPSB7Y29uZGl0aW9uVHlwZTogY29uZGl0aW9uVHlwZX1cbiAgICBmcm9tU3RyID0gZXhwb3J0cy5faGFuZGxlcihjb25kaXRpb24uY29uZGl0aW9uVHlwZSkuZnJvbVN0clxuICAgIGlmIGZyb21TdHJcbiAgICAgIHJldHVybiBmcm9tU3RyLmNhbGwoZXhwb3J0cywgc3RyLCBjb25kaXRpb24pXG4gICAgZWxzZVxuICAgICAgY29uZGl0aW9uLnBhdHRlcm4gPSBzdHJcbiAgICAgIHJldHVybiBjb25kaXRpb25cblxuICBfYWJicnM6IG51bGxcbiAgdHlwZUZyb21BYmJyOiAoYWJicikgLT5cbiAgICBpZiBub3QgZXhwb3J0cy5fYWJicnNcbiAgICAgIGV4cG9ydHMuX2FiYnJzID0ge31cbiAgICAgIGZvciBvd24gdHlwZSwge2FiYnJzfSBvZiBleHBvcnRzLl9jb25kaXRpb25UeXBlc1xuICAgICAgICBleHBvcnRzLl9hYmJyc1t0eXBlLnRvVXBwZXJDYXNlKCldID0gdHlwZVxuICAgICAgICBmb3IgYWIgaW4gYWJicnNcbiAgICAgICAgICBleHBvcnRzLl9hYmJyc1thYi50b1VwcGVyQ2FzZSgpXSA9IHR5cGVcblxuICAgIHJldHVybiBleHBvcnRzLl9hYmJyc1thYmJyLnRvVXBwZXJDYXNlKCldXG5cbiAgY29tbWVudDogKGNvbW1lbnQsIG5vZGUpIC0+XG4gICAgcmV0dXJuIHVubGVzcyBjb21tZW50XG4gICAgbm9kZS5zdGFydCA/PSB7fVxuICAgICMgVGhpcyBoYWNrIGlzIG5lZWRlZCB0byBhbGxvdyBkdW1waW5nIGNvbW1lbnRzIGluIHJlcGVhdGVkIHByaW50IGNhbGwuXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5IG5vZGUuc3RhcnQsICdfY29tbWVudHNfZHVtcGVkJyxcbiAgICAgIGdldDogLT4gZmFsc2VcbiAgICAgIHNldDogLT4gZmFsc2VcbiAgICBub2RlLnN0YXJ0LmNvbW1lbnRzX2JlZm9yZSA/PSBbXVxuICAgIG5vZGUuc3RhcnQuY29tbWVudHNfYmVmb3JlLnB1c2gge3R5cGU6ICdjb21tZW50MicsIHZhbHVlOiBjb21tZW50fVxuICAgIG5vZGVcblxuICBzYWZlUmVnZXg6IChleHByKSAtPlxuICAgIHRyeVxuICAgICAgbmV3IFJlZ0V4cChleHByKVxuICAgIGNhdGNoXG4gICAgICAjIEludmFsaWQgcmVnZXhwISBGYWxsIGJhY2sgdG8gYSByZWdleHAgdGhhdCBkb2VzIG5vdCBtYXRjaCBhbnl0aGluZy5cbiAgICAgIC8oPyEpL1xuXG4gIHJlZ1Rlc3Q6IChleHByLCByZWdleHApIC0+XG4gICAgaWYgdHlwZW9mIHJlZ2V4cCA9PSAnc3RyaW5nJ1xuICAgICAgIyBFc2NhcGUgKHVuZXNjYXBlZCkgZm9yd2FyZCBzbGFzaCBmb3IgdXNlIGluIHJlZ2V4IGxpdGVyYWxzLlxuICAgICAgcmVnZXhwID0gcmVnZXhTYWZlIGVzY2FwZVNsYXNoIHJlZ2V4cFxuICAgIGlmIHR5cGVvZiBleHByID09ICdzdHJpbmcnXG4gICAgICBleHByID0gbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogZXhwclxuICAgIG5ldyBVMi5BU1RfQ2FsbFxuICAgICAgYXJnczogW2V4cHJdXG4gICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX0RvdChcbiAgICAgICAgcHJvcGVydHk6ICd0ZXN0J1xuICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1JlZ0V4cCB2YWx1ZTogcmVnZXhwXG4gICAgICApXG4gIGlzSW50OiAobnVtKSAtPlxuICAgICh0eXBlb2YgbnVtID09ICdudW1iZXInIGFuZCAhaXNOYU4obnVtKSBhbmRcbiAgICAgIHBhcnNlRmxvYXQobnVtKSA9PSBwYXJzZUludChudW0sIDEwKSlcbiAgYmV0d2VlbjogKHZhbCwgbWluLCBtYXgsIGNvbW1lbnQpIC0+XG4gICAgaWYgbWluID09IG1heFxuICAgICAgaWYgdHlwZW9mIG1pbiA9PSAnbnVtYmVyJ1xuICAgICAgICBtaW4gPSBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogbWluXG4gICAgICByZXR1cm4gZXhwb3J0cy5jb21tZW50IGNvbW1lbnQsIG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICBsZWZ0OiB2YWxcbiAgICAgICAgb3BlcmF0b3I6ICc9PT0nXG4gICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogbWluXG4gICAgICApXG4gICAgaWYgZXhwb3J0cy5pc0ludChtaW4pIGFuZCBleHBvcnRzLmlzSW50KG1heCkgYW5kIG1heCAtIG1pbiA8IDMyXG4gICAgICBjb21tZW50IHx8PSBcIiN7bWlufSA8PSB2YWx1ZSAmJiB2YWx1ZSA8PSAje21heH1cIlxuICAgICAgdG1wbCA9IFwiMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6XCJcbiAgICAgIHN0ciA9XG4gICAgICAgIGlmIG1heCA8IHRtcGwubGVuZ3RoXG4gICAgICAgICAgdG1wbC5zdWJzdHIobWluLCBtYXggLSBtaW4gKyAxKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgdG1wbC5zdWJzdHIoMCwgbWF4IC0gbWluICsgMSlcbiAgICAgIHBvcyA9IGlmIG1pbiA9PSAwIHRoZW4gdmFsIGVsc2VcbiAgICAgICAgbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgbGVmdDogdmFsXG4gICAgICAgICAgb3BlcmF0b3I6ICctJ1xuICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogbWluXG4gICAgICAgIClcbiAgICAgIHJldHVybiBleHBvcnRzLmNvbW1lbnQgY29tbWVudCwgbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX0RvdChcbiAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfU3RyaW5nIHZhbHVlOiBzdHJcbiAgICAgICAgICAgIHByb3BlcnR5OiAnY2hhckNvZGVBdCdcbiAgICAgICAgICApXG4gICAgICAgICAgYXJnczogW3Bvc11cbiAgICAgICAgKVxuICAgICAgICBvcGVyYXRvcjogJz4nXG4gICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogMFxuICAgICAgKVxuICAgIGlmIHR5cGVvZiBtaW4gPT0gJ251bWJlcidcbiAgICAgIG1pbiA9IG5ldyBVMi5BU1RfTnVtYmVyIHZhbHVlOiBtaW5cbiAgICBpZiB0eXBlb2YgbWF4ID09ICdudW1iZXInXG4gICAgICBtYXggPSBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogbWF4XG4gICAgZXhwb3J0cy5jb21tZW50IGNvbW1lbnQsIG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgIGFyZ3M6IFt2YWwsIG1pbiwgbWF4XVxuICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9GdW5jdGlvbiAoXG4gICAgICAgIGFyZ25hbWVzOiBbXG4gICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ3ZhbHVlJ1xuICAgICAgICAgIG5ldyBVMi5BU1RfU3ltYm9sRnVuYXJnIG5hbWU6ICdtaW4nXG4gICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ21heCdcbiAgICAgICAgXVxuICAgICAgICBib2R5OiBbXG4gICAgICAgICAgbmV3IFUyLkFTVF9SZXR1cm4gdmFsdWU6IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdtaW4nXG4gICAgICAgICAgICAgIG9wZXJhdG9yOiAnPD0nXG4gICAgICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAndmFsdWUnXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBvcGVyYXRvcjogJyYmJ1xuICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAndmFsdWUnXG4gICAgICAgICAgICAgIG9wZXJhdG9yOiAnPD0nXG4gICAgICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnbWF4J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgXVxuICAgICAgKVxuICAgIClcblxuICBwYXJzZUlwOiAoaXApIC0+XG4gICAgaWYgaXAuY2hhckNvZGVBdCgwKSA9PSAnWycuY2hhckNvZGVBdCgwKVxuICAgICAgaXAgPSBpcC5zdWJzdHIgMSwgaXAubGVuZ3RoIC0gMlxuICAgIGFkZHIgPSBuZXcgSVAudjQuQWRkcmVzcyhpcClcbiAgICBpZiBub3QgYWRkci5pc1ZhbGlkKClcbiAgICAgIGFkZHIgPSBuZXcgSVAudjYuQWRkcmVzcyhpcClcbiAgICAgIGlmIG5vdCBhZGRyLmlzVmFsaWQoKVxuICAgICAgICByZXR1cm4gbnVsbFxuICAgIHJldHVybiBhZGRyXG4gIG5vcm1hbGl6ZUlwOiAoYWRkcikgLT5cbiAgICByZXR1cm4gKGFkZHIuY29ycmVjdEZvcm0gPyBhZGRyLmNhbm9uaWNhbEZvcm0pLmNhbGwoYWRkcilcbiAgaXB2Nk1heDogbmV3IElQLnY2LkFkZHJlc3MoJzo6LzAnKS5lbmRBZGRyZXNzKCkuY2Fub25pY2FsRm9ybSgpXG5cbiAgbG9jYWxIb3N0czogW1wiMTI3LjAuMC4xXCIsIFwiWzo6MV1cIiwgXCJsb2NhbGhvc3RcIl1cblxuICBfY29uZENhY2hlOiBuZXcgQXR0YWNoZWRDYWNoZSAoY29uZGl0aW9uKSAtPlxuICAgIHRhZyA9IGV4cG9ydHMuX2hhbmRsZXIoY29uZGl0aW9uLmNvbmRpdGlvblR5cGUpLnRhZ1xuICAgIHJlc3VsdCA9XG4gICAgICBpZiB0YWcgdGhlbiB0YWcuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSBlbHNlIGV4cG9ydHMuc3RyKGNvbmRpdGlvbilcblxuICAgIGNvbmRpdGlvbi5jb25kaXRpb25UeXBlICsgJyQnICsgcmVzdWx0XG5cbiAgX3NldFByb3A6IChvYmosIHByb3AsIHZhbHVlKSAtPlxuICAgIGlmIG5vdCBPYmplY3Q6Omhhc093blByb3BlcnR5LmNhbGwgb2JqLCBwcm9wXG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkgb2JqLCBwcm9wLCB3cml0YWJsZTogdHJ1ZVxuICAgIG9ialtwcm9wXSA9IHZhbHVlXG5cbiAgX2hhbmRsZXI6IChjb25kaXRpb25UeXBlKSAtPlxuICAgIGlmIHR5cGVvZiBjb25kaXRpb25UeXBlICE9ICdzdHJpbmcnXG4gICAgICBjb25kaXRpb25UeXBlID0gY29uZGl0aW9uVHlwZS5jb25kaXRpb25UeXBlXG4gICAgaGFuZGxlciA9IGV4cG9ydHMuX2NvbmRpdGlvblR5cGVzW2NvbmRpdGlvblR5cGVdXG5cbiAgICBpZiBub3QgaGFuZGxlcj9cbiAgICAgIHRocm93IG5ldyBFcnJvciBcIlVua25vd24gY29uZGl0aW9uIHR5cGU6ICN7Y29uZGl0aW9uVHlwZX1cIlxuICAgIHJldHVybiBoYW5kbGVyXG5cbiAgX2NvbmRpdGlvblR5cGVzOlxuICAgICMgVGhlc2UgZnVuY3Rpb25zIGFyZSAuY2FsbCgpLWVkIHdpdGggYHRoaXNgIHNldCB0byBtb2R1bGUuZXhwb3J0cy5cbiAgICAjIGNvZmZlZWxpbnQ6IGRpc2FibGU9bWlzc2luZ19mYXRfYXJyb3dzXG4gICAgJ1RydWVDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnVHJ1ZSddXG4gICAgICBhbmFseXplOiAoY29uZGl0aW9uKSAtPiBudWxsXG4gICAgICBtYXRjaDogLT4gdHJ1ZVxuICAgICAgY29tcGlsZTogKGNvbmRpdGlvbikgLT4gbmV3IFUyLkFTVF9UcnVlXG4gICAgICBzdHI6IChjb25kaXRpb24pIC0+ICcnXG4gICAgICBmcm9tU3RyOiAoc3RyLCBjb25kaXRpb24pIC0+IGNvbmRpdGlvblxuXG4gICAgJ0ZhbHNlQ29uZGl0aW9uJzpcbiAgICAgIGFiYnJzOiBbJ0ZhbHNlJywgJ0Rpc2FibGVkJ11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IG51bGxcbiAgICAgIG1hdGNoOiAtPiBmYWxzZVxuICAgICAgY29tcGlsZTogKGNvbmRpdGlvbikgLT4gbmV3IFUyLkFTVF9GYWxzZVxuICAgICAgZnJvbVN0cjogKHN0ciwgY29uZGl0aW9uKSAtPlxuICAgICAgICBpZiBzdHIubGVuZ3RoID4gMFxuICAgICAgICAgIGNvbmRpdGlvbi5wYXR0ZXJuID0gc3RyXG4gICAgICAgIGNvbmRpdGlvblxuXG4gICAgJ1VybFJlZ2V4Q29uZGl0aW9uJzpcbiAgICAgIGFiYnJzOiBbJ1VSJywgJ1VSZWdleCcsICdVcmxSJywgJ1VybFJlZ2V4J11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IEBzYWZlUmVnZXggZXNjYXBlU2xhc2ggY29uZGl0aW9uLnBhdHRlcm5cbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0LCBjYWNoZSkgLT5cbiAgICAgICAgcmV0dXJuIGNhY2hlLmFuYWx5emVkLnRlc3QocmVxdWVzdC51cmwpXG4gICAgICBjb21waWxlOiAoY29uZGl0aW9uLCBjYWNoZSkgLT5cbiAgICAgICAgQHJlZ1Rlc3QgJ3VybCcsIGNhY2hlLmFuYWx5emVkXG5cbiAgICAnVXJsV2lsZGNhcmRDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnVScsICdVVycsICdVcmwnLCAnVXJsVycsICdVV2lsZCcsICdVV2lsZGNhcmQnLCAnVXJsV2lsZCcsXG4gICAgICAgICAgICAgICdVcmxXaWxkY2FyZCddXG4gICAgICBhbmFseXplOiAoY29uZGl0aW9uKSAtPlxuICAgICAgICBwYXJ0cyA9IGZvciBwYXR0ZXJuIGluIGNvbmRpdGlvbi5wYXR0ZXJuLnNwbGl0KCd8Jykgd2hlbiBwYXR0ZXJuXG4gICAgICAgICAgc2hFeHAyUmVnRXhwIHBhdHRlcm4sIHRyaW1Bc3RlcmlzazogdHJ1ZVxuICAgICAgICBAc2FmZVJlZ2V4IHBhcnRzLmpvaW4oJ3wnKVxuICAgICAgbWF0Y2g6IChjb25kaXRpb24sIHJlcXVlc3QsIGNhY2hlKSAtPlxuICAgICAgICByZXR1cm4gY2FjaGUuYW5hbHl6ZWQudGVzdChyZXF1ZXN0LnVybClcbiAgICAgIGNvbXBpbGU6IChjb25kaXRpb24sIGNhY2hlKSAtPlxuICAgICAgICBAcmVnVGVzdCAndXJsJywgY2FjaGUuYW5hbHl6ZWRcblxuICAgICdIb3N0UmVnZXhDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnUicsICdIUicsICdSZWdleCcsICdIb3N0UicsICdIUmVnZXgnLCAnSG9zdFJlZ2V4J11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IEBzYWZlUmVnZXggZXNjYXBlU2xhc2ggY29uZGl0aW9uLnBhdHRlcm5cbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0LCBjYWNoZSkgLT5cbiAgICAgICAgcmV0dXJuIGNhY2hlLmFuYWx5emVkLnRlc3QocmVxdWVzdC5ob3N0KVxuICAgICAgY29tcGlsZTogKGNvbmRpdGlvbiwgY2FjaGUpIC0+XG4gICAgICAgIEByZWdUZXN0ICdob3N0JywgY2FjaGUuYW5hbHl6ZWRcblxuICAgICdIb3N0V2lsZGNhcmRDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnJywgJ0gnLCAnVycsICdIVycsICdXaWxkJywgJ1dpbGRjYXJkJywgJ0hvc3QnLCAnSG9zdFcnLCAnSFdpbGQnLFxuICAgICAgICAgICAgICAnSFdpbGRjYXJkJywgJ0hvc3RXaWxkJywgJ0hvc3RXaWxkY2FyZCddXG4gICAgICBhbmFseXplOiAoY29uZGl0aW9uKSAtPlxuICAgICAgICBwYXJ0cyA9IGZvciBwYXR0ZXJuIGluIGNvbmRpdGlvbi5wYXR0ZXJuLnNwbGl0KCd8Jykgd2hlbiBwYXR0ZXJuXG4gICAgICAgICAgIyBHZXQgdGhlIG1hZ2ljYWwgcmVnZXggb2YgdGhpcyBwYXR0ZXJuLiBTZWVcbiAgICAgICAgICAjIGh0dHBzOi8vZ2l0aHViLmNvbS9GZWxpc0NhdHVzL1N3aXRjaHlPbWVnYS93aWtpL0hvc3Qtd2lsZGNhcmQtY29uZGl0aW9uXG4gICAgICAgICAgIyBmb3IgdGhlIG1hZ2ljLlxuICAgICAgICAgIGlmIHBhdHRlcm4uY2hhckNvZGVBdCgwKSA9PSAnLicuY2hhckNvZGVBdCgwKVxuICAgICAgICAgICAgcGF0dGVybiA9ICcqJyArIHBhdHRlcm5cblxuICAgICAgICAgIGlmIHBhdHRlcm4uaW5kZXhPZignKiouJykgPT0gMFxuICAgICAgICAgICAgc2hFeHAyUmVnRXhwIHBhdHRlcm4uc3Vic3RyaW5nKDEpLCB0cmltQXN0ZXJpc2s6IHRydWVcbiAgICAgICAgICBlbHNlIGlmIHBhdHRlcm4uaW5kZXhPZignKi4nKSA9PSAwXG4gICAgICAgICAgICBzaEV4cDJSZWdFeHAocGF0dGVybi5zdWJzdHJpbmcoMiksIHRyaW1Bc3RlcmlzazogZmFsc2UpXG4gICAgICAgICAgICAgIC5yZXBsYWNlKC8uLywgJyg/Ol58XFxcXC4pJykucmVwbGFjZSgvXFwuXFwqXFwkJC8sICcnKVxuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHNoRXhwMlJlZ0V4cCBwYXR0ZXJuLCB0cmltQXN0ZXJpc2s6IHRydWVcbiAgICAgICAgQHNhZmVSZWdleCBwYXJ0cy5qb2luKCd8JylcbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0LCBjYWNoZSkgLT5cbiAgICAgICAgcmV0dXJuIGNhY2hlLmFuYWx5emVkLnRlc3QocmVxdWVzdC5ob3N0KVxuICAgICAgY29tcGlsZTogKGNvbmRpdGlvbiwgY2FjaGUpIC0+XG4gICAgICAgIEByZWdUZXN0ICdob3N0JywgY2FjaGUuYW5hbHl6ZWRcblxuICAgICdCeXBhc3NDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnQicsICdCeXBhc3MnXVxuICAgICAgYW5hbHl6ZTogKGNvbmRpdGlvbikgLT5cbiAgICAgICAgIyBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIuY2hyb21lLmNvbS9leHRlbnNpb25zL3Byb3h5I2J5cGFzc19saXN0XG4gICAgICAgIGNhY2hlID1cbiAgICAgICAgICBob3N0OiBudWxsXG4gICAgICAgICAgaXA6IG51bGxcbiAgICAgICAgICBzY2hlbWU6IG51bGxcbiAgICAgICAgICB1cmw6IG51bGxcbiAgICAgICAgc2VydmVyID0gY29uZGl0aW9uLnBhdHRlcm5cbiAgICAgICAgaWYgc2VydmVyID09ICc8bG9jYWw+J1xuICAgICAgICAgIGNhY2hlLmhvc3QgPSBzZXJ2ZXJcbiAgICAgICAgICByZXR1cm4gY2FjaGVcbiAgICAgICAgcGFydHMgPSBzZXJ2ZXIuc3BsaXQgJzovLydcbiAgICAgICAgaWYgcGFydHMubGVuZ3RoID4gMVxuICAgICAgICAgIGNhY2hlLnNjaGVtZSA9IHBhcnRzWzBdXG4gICAgICAgICAgc2VydmVyID0gcGFydHNbMV1cblxuICAgICAgICBwYXJ0cyA9IHNlcnZlci5zcGxpdCAnLydcbiAgICAgICAgaWYgcGFydHMubGVuZ3RoID4gMVxuICAgICAgICAgIGFkZHIgPSBAcGFyc2VJcCBwYXJ0c1swXVxuICAgICAgICAgIHByZWZpeExlbiA9IHBhcnNlSW50KHBhcnRzWzFdKVxuICAgICAgICAgIGlmIGFkZHIgYW5kIG5vdCBpc05hTihwcmVmaXhMZW4pXG4gICAgICAgICAgICBjYWNoZS5pcCA9XG4gICAgICAgICAgICAgIGNvbmRpdGlvblR5cGU6ICdJcENvbmRpdGlvbidcbiAgICAgICAgICAgICAgaXA6IHBhcnRzWzBdXG4gICAgICAgICAgICAgIHByZWZpeExlbmd0aDogcHJlZml4TGVuXG4gICAgICAgICAgICByZXR1cm4gY2FjaGVcbiAgICAgICAgaWYgc2VydmVyLmNoYXJDb2RlQXQoc2VydmVyLmxlbmd0aCAtIDEpICE9ICddJy5jaGFyQ29kZUF0KDApXG4gICAgICAgICAgcG9zID0gc2VydmVyLmxhc3RJbmRleE9mKCc6JylcbiAgICAgICAgICBpZiBwb3MgPj0gMFxuICAgICAgICAgICAgbWF0Y2hQb3J0ID0gc2VydmVyLnN1YnN0cmluZyhwb3MgKyAxKVxuICAgICAgICAgICAgc2VydmVyID0gc2VydmVyLnN1YnN0cmluZygwLCBwb3MpXG4gICAgICAgIHNlcnZlcklwID0gQHBhcnNlSXAgc2VydmVyXG4gICAgICAgIHNlcnZlclJlZ2V4ID0gbnVsbFxuICAgICAgICBpZiBzZXJ2ZXJJcD9cbiAgICAgICAgICBpZiBzZXJ2ZXJJcC5yZWd1bGFyRXhwcmVzc2lvblN0cmluZz9cbiAgICAgICAgICAgIHJlZ2V4U3RyID0gc2VydmVySXAucmVndWxhckV4cHJlc3Npb25TdHJpbmcodHJ1ZSlcbiAgICAgICAgICAgIHNlcnZlclJlZ2V4ID0gJ1xcXFxbJyArIHJlZ2V4U3RyICsgJ1xcXFxdJ1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHNlcnZlciA9IEBub3JtYWxpemVJcCBzZXJ2ZXJJcFxuICAgICAgICBlbHNlIGlmIHNlcnZlci5jaGFyQ29kZUF0KDApID09ICcuJy5jaGFyQ29kZUF0KDApXG4gICAgICAgICAgc2VydmVyID0gJyonICsgc2VydmVyXG4gICAgICAgIGlmIG1hdGNoUG9ydFxuICAgICAgICAgIGlmIG5vdCBzZXJ2ZXJSZWdleD9cbiAgICAgICAgICAgIHNlcnZlclJlZ2V4ID0gc2hFeHAyUmVnRXhwKHNlcnZlcilcbiAgICAgICAgICAgIHNlcnZlclJlZ2V4ID0gc2VydmVyUmVnZXguc3Vic3RyaW5nKDEsIHNlcnZlclJlZ2V4Lmxlbmd0aCAtIDEpXG4gICAgICAgICAgc2NoZW1lID0gY2FjaGUuc2NoZW1lID8gJ1teOl0rJ1xuICAgICAgICAgIGNhY2hlLnVybCA9IEBzYWZlUmVnZXgoJ14nICsgc2NoZW1lICsgJzpcXFxcL1xcXFwvJyArIHNlcnZlclJlZ2V4ICtcbiAgICAgICAgICAgICc6JyArIG1hdGNoUG9ydCArICdcXFxcLycpXG4gICAgICAgIGVsc2UgaWYgc2VydmVyICE9ICcqJ1xuICAgICAgICAgIGlmIHNlcnZlclJlZ2V4XG4gICAgICAgICAgICBzZXJ2ZXJSZWdleCA9ICdeJyArIHNlcnZlclJlZ2V4ICsgJyQnXG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgc2VydmVyUmVnZXggPSBzaEV4cDJSZWdFeHAgc2VydmVyLCB0cmltQXN0ZXJpc2s6IHRydWVcbiAgICAgICAgICBjYWNoZS5ob3N0ID0gQHNhZmVSZWdleChzZXJ2ZXJSZWdleClcbiAgICAgICAgcmV0dXJuIGNhY2hlXG4gICAgICBtYXRjaDogKGNvbmRpdGlvbiwgcmVxdWVzdCwgY2FjaGUpIC0+XG4gICAgICAgIGNhY2hlID0gY2FjaGUuYW5hbHl6ZWRcbiAgICAgICAgcmV0dXJuIGZhbHNlIGlmIGNhY2hlLnNjaGVtZT8gYW5kIGNhY2hlLnNjaGVtZSAhPSByZXF1ZXN0LnNjaGVtZVxuICAgICAgICByZXR1cm4gZmFsc2UgaWYgY2FjaGUuaXA/IGFuZCBub3QgQG1hdGNoIGNhY2hlLmlwLCByZXF1ZXN0XG4gICAgICAgIGlmIGNhY2hlLmhvc3Q/XG4gICAgICAgICAgaWYgY2FjaGUuaG9zdCA9PSAnPGxvY2FsPidcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0Lmhvc3QgaW4gQGxvY2FsSG9zdHNcbiAgICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gZmFsc2UgaWYgbm90IGNhY2hlLmhvc3QudGVzdChyZXF1ZXN0Lmhvc3QpXG4gICAgICAgIHJldHVybiBmYWxzZSBpZiBjYWNoZS51cmw/IGFuZCAhY2FjaGUudXJsLnRlc3QocmVxdWVzdC51cmwpXG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICBjb21waWxlOiAoY29uZGl0aW9uLCBjYWNoZSkgLT5cbiAgICAgICAgY2FjaGUgPSBjYWNoZS5hbmFseXplZFxuICAgICAgICBpZiBjYWNoZS51cmw/XG4gICAgICAgICAgcmV0dXJuIEByZWdUZXN0ICd1cmwnLCBjYWNoZS51cmxcbiAgICAgICAgY29uZGl0aW9ucyA9IFtdXG4gICAgICAgIGlmIGNhY2hlLmhvc3QgPT0gJzxsb2NhbD4nXG4gICAgICAgICAgaG9zdEVxdWFscyA9IChob3N0KSAtPiBuZXcgVTIuQVNUX0JpbmFyeShcbiAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdob3N0J1xuICAgICAgICAgICAgb3BlcmF0b3I6ICc9PT0nXG4gICAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IGhvc3RcbiAgICAgICAgICApXG4gICAgICAgICAgcmV0dXJuIG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgICAgIGxlZnQ6IGhvc3RFcXVhbHMgJ1s6OjFdJ1xuICAgICAgICAgICAgICBvcGVyYXRvcjogJ3x8J1xuICAgICAgICAgICAgICByaWdodDogaG9zdEVxdWFscyAnbG9jYWxob3N0J1xuICAgICAgICAgICAgKVxuICAgICAgICAgICAgb3BlcmF0b3I6ICd8fCdcbiAgICAgICAgICAgIHJpZ2h0OiBob3N0RXF1YWxzICcxMjcuMC4wLjEnXG4gICAgICAgICAgKVxuICAgICAgICBpZiBjYWNoZS5zY2hlbWU/XG4gICAgICAgICAgY29uZGl0aW9ucy5wdXNoIG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ3NjaGVtZSdcbiAgICAgICAgICAgIG9wZXJhdG9yOiAnPT09J1xuICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfU3RyaW5nIHZhbHVlOiBjYWNoZS5zY2hlbWVcbiAgICAgICAgICApXG4gICAgICAgIGlmIGNhY2hlLmhvc3Q/XG4gICAgICAgICAgY29uZGl0aW9ucy5wdXNoIEByZWdUZXN0ICdob3N0JywgY2FjaGUuaG9zdFxuICAgICAgICBlbHNlIGlmIGNhY2hlLmlwP1xuICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCBAY29tcGlsZSBjYWNoZS5pcFxuICAgICAgICBzd2l0Y2ggY29uZGl0aW9ucy5sZW5ndGhcbiAgICAgICAgICB3aGVuIDAgdGhlbiBuZXcgVTIuQVNUX1RydWVcbiAgICAgICAgICB3aGVuIDEgdGhlbiBjb25kaXRpb25zWzBdXG4gICAgICAgICAgd2hlbiAyIHRoZW4gbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgICBsZWZ0OiBjb25kaXRpb25zWzBdXG4gICAgICAgICAgICBvcGVyYXRvcjogJyYmJ1xuICAgICAgICAgICAgcmlnaHQ6IGNvbmRpdGlvbnNbMV1cbiAgICAgICAgICApXG4gICAgJ0tleXdvcmRDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnSycsICdLVycsICdLZXl3b3JkJ11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IG51bGxcbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0KSAtPlxuICAgICAgICByZXF1ZXN0LnNjaGVtZSA9PSAnaHR0cCcgYW5kIHJlcXVlc3QudXJsLmluZGV4T2YoY29uZGl0aW9uLnBhdHRlcm4pID49IDBcbiAgICAgIGNvbXBpbGU6IChjb25kaXRpb24pIC0+XG4gICAgICAgIG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ3NjaGVtZSdcbiAgICAgICAgICAgIG9wZXJhdG9yOiAnPT09J1xuICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfU3RyaW5nIHZhbHVlOiAnaHR0cCdcbiAgICAgICAgICApXG4gICAgICAgICAgb3BlcmF0b3I6ICcmJidcbiAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX0NhbGwoXG4gICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICd1cmwnXG4gICAgICAgICAgICAgICAgcHJvcGVydHk6ICdpbmRleE9mJ1xuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIGFyZ3M6IFtuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogY29uZGl0aW9uLnBhdHRlcm5dXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBvcGVyYXRvcjogJz49J1xuICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfTnVtYmVyIHZhbHVlOiAwXG4gICAgICAgICAgKVxuICAgICAgICApXG5cbiAgICAnSXBDb25kaXRpb24nOlxuICAgICAgYWJicnM6IFsnSXAnXVxuICAgICAgYW5hbHl6ZTogKGNvbmRpdGlvbikgLT5cbiAgICAgICAgY2FjaGUgPVxuICAgICAgICAgIGFkZHI6IG51bGxcbiAgICAgICAgICBub3JtYWxpemVkOiBudWxsXG4gICAgICAgIGlwID0gY29uZGl0aW9uLmlwXG4gICAgICAgIGlmIGlwLmNoYXJDb2RlQXQoMCkgPT0gJ1snLmNoYXJDb2RlQXQoMClcbiAgICAgICAgICBpcCA9IGlwLnN1YnN0ciAxLCBpcC5sZW5ndGggLSAyXG4gICAgICAgIGFkZHIgPSBpcCArICcvJyArIGNvbmRpdGlvbi5wcmVmaXhMZW5ndGhcbiAgICAgICAgY2FjaGUuYWRkciA9IEBwYXJzZUlwIGFkZHJcbiAgICAgICAgaWYgbm90IGNhY2hlLmFkZHI/XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yIFwiSW52YWxpZCBJUCBhZGRyZXNzICN7YWRkcn1cIlxuICAgICAgICBjYWNoZS5ub3JtYWxpemVkID0gQG5vcm1hbGl6ZUlwIGNhY2hlLmFkZHJcbiAgICAgICAgbWFzayA9IGlmIGNhY2hlLmFkZHIudjRcbiAgICAgICAgICBuZXcgSVAudjQuQWRkcmVzcygnMjU1LjI1NS4yNTUuMjU1LycgKyBjYWNoZS5hZGRyLnN1Ym5ldE1hc2spXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBuZXcgSVAudjYuQWRkcmVzcyhAaXB2Nk1heCArICcvJyArIGNhY2hlLmFkZHIuc3VibmV0TWFzaylcbiAgICAgICAgY2FjaGUubWFzayA9IEBub3JtYWxpemVJcCBtYXNrLnN0YXJ0QWRkcmVzcygpXG4gICAgICAgIGNhY2hlXG4gICAgICBtYXRjaDogKGNvbmRpdGlvbiwgcmVxdWVzdCwgY2FjaGUpIC0+XG4gICAgICAgIGFkZHIgPSBAcGFyc2VJcCByZXF1ZXN0Lmhvc3RcbiAgICAgICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBhZGRyP1xuICAgICAgICBjYWNoZSA9IGNhY2hlLmFuYWx5emVkXG4gICAgICAgIHJldHVybiBmYWxzZSBpZiBhZGRyLnY0ICE9IGNhY2hlLmFkZHIudjRcbiAgICAgICAgcmV0dXJuIGFkZHIuaXNJblN1Ym5ldCBjYWNoZS5hZGRyXG4gICAgICBjb21waWxlOiAoY29uZGl0aW9uLCBjYWNoZSkgLT5cbiAgICAgICAgY2FjaGUgPSBjYWNoZS5hbmFseXplZFxuICAgICAgICAjIFdlIHdhbnQgdG8gbWFrZSBzdXJlIHRoYXQgaG9zdCBpcyBub3QgYSBkb21haW4gbmFtZSBiZWZvcmUgd2UgcGFzcyBpdFxuICAgICAgICAjIHRvIGlzSW5OZXQuIE90aGVyd2lzZSBhbiBleHBlbnNpdmUgZG5zIGxvb2t1cCBtaWdodCBiZSB0cmlnZ2VyZWQuXG4gICAgICAgIGhvc3RMb29rc0xpa2VJcCA9XG4gICAgICAgICAgaWYgY2FjaGUuYWRkci52NFxuICAgICAgICAgICAgIyBGb3IgcGVyZm9ybWFuY2UgcmVhc29ucywgd2UganVzdCBjaGVjayB0aGUgbGFzdCBjaGFyYWN0ZXIgb2YgaG9zdC5cbiAgICAgICAgICAgICMgSWYgaXQncyBhIGRpZ2l0LCB3ZSBhc3N1bWUgdGhhdCBob3N0IGlzIHZhbGlkIElQdjQgYWRkcmVzcy5cbiAgICAgICAgICAgIG5ldyBVMi5BU1RfQmluYXJ5XG4gICAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfU3ViXG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2hvc3QnXG4gICAgICAgICAgICAgICAgcHJvcGVydHk6IG5ldyBVMi5BU1RfQmluYXJ5XG4gICAgICAgICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX0RvdChcbiAgICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2hvc3QnXG4gICAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiAnbGVuZ3RoJ1xuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICctJ1xuICAgICAgICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfTnVtYmVyIHZhbHVlOiAxXG4gICAgICAgICAgICAgIG9wZXJhdG9yOiAnPj0nXG4gICAgICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogMFxuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICMgTGlrZXdpc2UsIHdlIGFzc3VtZSB0aGF0IGhvc3QgaXMgdmFsaWQgSVB2NiBpZiBpdCBjb250YWlucyBjb2xvbnMuXG4gICAgICAgICAgICBuZXcgVTIuQVNUX0JpbmFyeShcbiAgICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9DYWxsKFxuICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2hvc3QnXG4gICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogJ2luZGV4T2YnXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgIGFyZ3M6IFtuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogJzonXVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIG9wZXJhdG9yOiAnPj0nXG4gICAgICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogMFxuICAgICAgICAgICAgKVxuICAgICAgICBpZiBjYWNoZS5hZGRyLnN1Ym5ldE1hc2sgPT0gMFxuICAgICAgICAgICMgMC4wLjAuMC8wIChtYXRjaGVzIGFsbCBJUHY0IGxpdGVyYWxzKSwgb3IgOjovMCAoYWxsIElQdjYgbGl0ZXJhbHMpLlxuICAgICAgICAgICMgVXNlIGhvc3RMb29rc0xpa2VJcCBpbnN0ZWFkIG9mIGlzSW5OZXQgZm9yIGJldHRlciBlZmZpY2llbmN5IGFuZFxuICAgICAgICAgICMgYnJvd3NlciBzdXBwb3J0LlxuICAgICAgICAgIHJldHVybiBob3N0TG9va3NMaWtlSXBcbiAgICAgICAgaG9zdElzSW5OZXQgPSBuZXcgVTIuQVNUX0NhbGwoXG4gICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2lzSW5OZXQnXG4gICAgICAgICAgYXJnczogW1xuICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2hvc3QnXG4gICAgICAgICAgICBuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogY2FjaGUubm9ybWFsaXplZFxuICAgICAgICAgICAgbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IGNhY2hlLm1hc2tcbiAgICAgICAgICBdXG4gICAgICAgIClcbiAgICAgICAgaWYgY2FjaGUuYWRkci52NlxuICAgICAgICAgIGhvc3RJc0luTmV0RXggPSBuZXcgVTIuQVNUX0NhbGwoXG4gICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnaXNJbk5ldEV4J1xuICAgICAgICAgICAgYXJnczogW1xuICAgICAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnaG9zdCdcbiAgICAgICAgICAgICAgbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IGNhY2hlLm5vcm1hbGl6ZWRcbiAgICAgICAgICAgICAgbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IGNhY2hlLm1hc2tcbiAgICAgICAgICAgIF1cbiAgICAgICAgICApXG4gICAgICAgICAgIyBVc2UgaXNJbk5ldEV4IGlmIHBvc3NpYmxlLlxuICAgICAgICAgIGhvc3RJc0luTmV0ID0gbmV3IFUyLkFTVF9Db25kaXRpb25hbChcbiAgICAgICAgICAgIGNvbmRpdGlvbjogbmV3IFUyLkFTVF9CaW5hcnkoXG4gICAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfVW5hcnlQcmVmaXgoXG4gICAgICAgICAgICAgICAgb3BlcmF0b3I6ICd0eXBlb2YnXG4gICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ2lzSW5OZXRFeCdcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICBvcGVyYXRvcjogJz09PSdcbiAgICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfU3RyaW5nIHZhbHVlOiAnZnVuY3Rpb24nXG4gICAgICAgICAgICApXG4gICAgICAgICAgICBjb25zZXF1ZW50OiBob3N0SXNJbk5ldEV4XG4gICAgICAgICAgICBhbHRlcm5hdGl2ZTogaG9zdElzSW5OZXRcbiAgICAgICAgICApXG4gICAgICAgIHJldHVybiBuZXcgVTIuQVNUX0JpbmFyeShcbiAgICAgICAgICBsZWZ0OiBob3N0TG9va3NMaWtlSXBcbiAgICAgICAgICBvcGVyYXRvcjogJyYmJ1xuICAgICAgICAgIHJpZ2h0OiBob3N0SXNJbk5ldFxuICAgICAgICApXG4gICAgICBzdHI6IChjb25kaXRpb24pIC0+IGNvbmRpdGlvbi5pcCArICcvJyArIGNvbmRpdGlvbi5wcmVmaXhMZW5ndGhcbiAgICAgIGZyb21TdHI6IChzdHIsIGNvbmRpdGlvbikgLT5cbiAgICAgICAgW2lwLCBwcmVmaXhMZW5ndGhdID0gc3RyLnNwbGl0KCcvJylcbiAgICAgICAgY29uZGl0aW9uLmlwID0gaXBcbiAgICAgICAgY29uZGl0aW9uLnByZWZpeExlbmd0aCA9IHBhcnNlSW50KHByZWZpeExlbmd0aClcbiAgICAgICAgY29uZGl0aW9uXG5cbiAgICAnSG9zdExldmVsc0NvbmRpdGlvbic6XG4gICAgICBhYmJyczogWydMdicsICdMZXZlbCcsICdMZXZlbHMnLCAnSEwnLCAnSEx2JywgJ0hMZXZlbCcsICdITGV2ZWxzJyxcbiAgICAgICAgICAgICAgJ0hvc3RMJywgJ0hvc3RMdicsICdIb3N0TGV2ZWwnLCAnSG9zdExldmVscyddXG4gICAgICBhbmFseXplOiAoY29uZGl0aW9uKSAtPiAnLicuY2hhckNvZGVBdCAwXG4gICAgICBtYXRjaDogKGNvbmRpdGlvbiwgcmVxdWVzdCwgY2FjaGUpIC0+XG4gICAgICAgIGRvdENoYXJDb2RlID0gY2FjaGUuYW5hbHl6ZWRcbiAgICAgICAgZG90Q291bnQgPSAwXG4gICAgICAgIGZvciBpIGluIFswLi4ucmVxdWVzdC5ob3N0Lmxlbmd0aF1cbiAgICAgICAgICBpZiByZXF1ZXN0Lmhvc3QuY2hhckNvZGVBdChpKSA9PSBkb3RDaGFyQ29kZVxuICAgICAgICAgICAgZG90Q291bnQrK1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlIGlmIGRvdENvdW50ID4gY29uZGl0aW9uLm1heFZhbHVlXG4gICAgICAgIHJldHVybiBkb3RDb3VudCA+PSBjb25kaXRpb24ubWluVmFsdWVcbiAgICAgIGNvbXBpbGU6IChjb25kaXRpb24pIC0+XG4gICAgICAgIHZhbCA9IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgIHByb3BlcnR5OiAnbGVuZ3RoJ1xuICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgICAgICAgIGFyZ3M6IFtuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogJy4nXVxuICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9Eb3QoXG4gICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdob3N0J1xuICAgICAgICAgICAgICBwcm9wZXJ0eTogJ3NwbGl0J1xuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgICBAYmV0d2Vlbih2YWwsIGNvbmRpdGlvbi5taW5WYWx1ZSArIDEsIGNvbmRpdGlvbi5tYXhWYWx1ZSArIDEsXG4gICAgICAgICAgXCIje2NvbmRpdGlvbi5taW5WYWx1ZX0gPD0gaG9zdExldmVscyA8PSAje2NvbmRpdGlvbi5tYXhWYWx1ZX1cIilcbiAgICAgIHN0cjogKGNvbmRpdGlvbikgLT4gY29uZGl0aW9uLm1pblZhbHVlICsgJ34nICsgY29uZGl0aW9uLm1heFZhbHVlXG4gICAgICBmcm9tU3RyOiAoc3RyLCBjb25kaXRpb24pIC0+XG4gICAgICAgIFttaW5WYWx1ZSwgbWF4VmFsdWVdID0gc3RyLnNwbGl0KCd+JylcbiAgICAgICAgY29uZGl0aW9uLm1pblZhbHVlID0gbWluVmFsdWVcbiAgICAgICAgY29uZGl0aW9uLm1heFZhbHVlID0gbWF4VmFsdWVcbiAgICAgICAgY29uZGl0aW9uXG5cbiAgICAnV2Vla2RheUNvbmRpdGlvbic6XG4gICAgICBhYmJyczogWydXRCcsICdXZWVrJywgJ0RheScsICdXZWVrZGF5J11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IG51bGxcbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0KSAtPlxuICAgICAgICBkYXkgPSBuZXcgRGF0ZSgpLmdldERheSgpXG4gICAgICAgIHJldHVybiBjb25kaXRpb24uc3RhcnREYXkgPD0gZGF5IGFuZCBkYXkgPD0gY29uZGl0aW9uLmVuZERheVxuICAgICAgY29tcGlsZTogKGNvbmRpdGlvbikgLT5cbiAgICAgICAgdmFsID0gbmV3IFUyLkFTVF9DYWxsKFxuICAgICAgICAgIGFyZ3M6IFtdXG4gICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9Eb3QoXG4gICAgICAgICAgICBwcm9wZXJ0eTogJ2dldERheSdcbiAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfTmV3KFxuICAgICAgICAgICAgICBhcmdzOiBbXVxuICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnRGF0ZSdcbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgIClcbiAgICAgICAgQGJldHdlZW4gdmFsLCBjb25kaXRpb24uc3RhcnREYXksIGNvbmRpdGlvbi5lbmREYXlcbiAgICAgIHN0cjogKGNvbmRpdGlvbikgLT4gY29uZGl0aW9uLnN0YXJ0RGF5ICsgJ34nICsgY29uZGl0aW9uLmVuZERheVxuICAgICAgZnJvbVN0cjogKHN0ciwgY29uZGl0aW9uKSAtPlxuICAgICAgICBbc3RhcnREYXksIGVuZERheV0gPSBzdHIuc3BsaXQoJ34nKVxuICAgICAgICBjb25kaXRpb24uc3RhcnREYXkgPSBzdGFydERheVxuICAgICAgICBjb25kaXRpb24uZW5kRGF5ID0gZW5kRGF5XG4gICAgICAgIGNvbmRpdGlvblxuICAgICdUaW1lQ29uZGl0aW9uJzpcbiAgICAgIGFiYnJzOiBbJ1QnLCAnVGltZScsICdIb3VyJ11cbiAgICAgIGFuYWx5emU6IChjb25kaXRpb24pIC0+IG51bGxcbiAgICAgIG1hdGNoOiAoY29uZGl0aW9uLCByZXF1ZXN0KSAtPlxuICAgICAgICBob3VyID0gbmV3IERhdGUoKS5nZXRIb3VycygpXG4gICAgICAgIHJldHVybiBjb25kaXRpb24uc3RhcnRIb3VyIDw9IGhvdXIgYW5kIGhvdXIgPD0gY29uZGl0aW9uLmVuZEhvdXJcbiAgICAgIGNvbXBpbGU6IChjb25kaXRpb24pIC0+XG4gICAgICAgIHZhbCA9IG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgICAgICBhcmdzOiBbXVxuICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgICAgcHJvcGVydHk6ICdnZXRIb3VycydcbiAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfTmV3KFxuICAgICAgICAgICAgICBhcmdzOiBbXVxuICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnRGF0ZSdcbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgIClcbiAgICAgICAgQGJldHdlZW4gdmFsLCBjb25kaXRpb24uc3RhcnRIb3VyLCBjb25kaXRpb24uZW5kSG91clxuICAgICAgc3RyOiAoY29uZGl0aW9uKSAtPiBjb25kaXRpb24uc3RhcnRIb3VyICsgJ34nICsgY29uZGl0aW9uLmVuZEhvdXJcbiAgICAgIGZyb21TdHI6IChzdHIsIGNvbmRpdGlvbikgLT5cbiAgICAgICAgW3N0YXJ0SG91ciwgZW5kSG91cl0gPSBzdHIuc3BsaXQoJ34nKVxuICAgICAgICBjb25kaXRpb24uc3RhcnRIb3VyID0gc3RhcnRIb3VyXG4gICAgICAgIGNvbmRpdGlvbi5lbmRIb3VyID0gZW5kSG91clxuICAgICAgICBjb25kaXRpb25cbiAgICAjIGNvZmZlZWxpbnQ6IGVuYWJsZT1taXNzaW5nX2ZhdF9hcnJvd3NcbiIsIlUyID0gcmVxdWlyZSAndWdsaWZ5LWpzJ1xuUHJvZmlsZXMgPSByZXF1aXJlICcuL3Byb2ZpbGVzJ1xuXG4jIFBhY0dlbmVyYXRvciBpcyB1c2VkIGxpa2UgYSBzaW5nbGV0b24gY2xhc3MgaW5zdGFuY2UuXG4jIGNvZmZlZWxpbnQ6IGRpc2FibGU9bWlzc2luZ19mYXRfYXJyb3dzXG5tb2R1bGUuZXhwb3J0cyA9XG4gIGFzY2lpOiAoc3RyKSAtPlxuICAgIHN0ci5yZXBsYWNlIC9bXFx1MDA4MC1cXHVmZmZmXS9nLCAoY2hhcikgLT5cbiAgICAgIGhleCA9IGNoYXIuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNilcbiAgICAgIHJlc3VsdCA9ICdcXFxcdSdcbiAgICAgIHJlc3VsdCArPSAnMCcgZm9yIF8gaW4gW2hleC5sZW5ndGguLi40XVxuICAgICAgcmVzdWx0ICs9IGhleFxuICAgICAgcmV0dXJuIHJlc3VsdFxuXG4gIGNvbXByZXNzOiAoYXN0KSAtPlxuICAgIGFzdC5maWd1cmVfb3V0X3Njb3BlKClcbiAgICBjb21wcmVzc29yID0gVTIuQ29tcHJlc3Nvcih3YXJuaW5nczogZmFsc2UsIGtlZXBfZmFyZ3M6IHRydWUsXG4gICAgICBpZl9yZXR1cm46IGZhbHNlKVxuICAgIGNvbXByZXNzZWRfYXN0ID0gYXN0LnRyYW5zZm9ybShjb21wcmVzc29yKVxuICAgIGNvbXByZXNzZWRfYXN0LmZpZ3VyZV9vdXRfc2NvcGUoKVxuICAgIGNvbXByZXNzZWRfYXN0LmNvbXB1dGVfY2hhcl9mcmVxdWVuY3koKVxuICAgIGNvbXByZXNzZWRfYXN0Lm1hbmdsZV9uYW1lcygpXG4gICAgY29tcHJlc3NlZF9hc3RcblxuICBzY3JpcHQ6IChvcHRpb25zLCBwcm9maWxlLCBhcmdzKSAtPlxuICAgIGlmIHR5cGVvZiBwcm9maWxlID09ICdzdHJpbmcnXG4gICAgICBwcm9maWxlID0gUHJvZmlsZXMuYnlOYW1lKHByb2ZpbGUsIG9wdGlvbnMpXG4gICAgcmVmcyA9IFByb2ZpbGVzLmFsbFJlZmVyZW5jZVNldChwcm9maWxlLCBvcHRpb25zLFxuICAgICAgcHJvZmlsZU5vdEZvdW5kOiBhcmdzPy5wcm9maWxlTm90Rm91bmQpXG5cbiAgICBwcm9maWxlcyA9IG5ldyBVMi5BU1RfT2JqZWN0IHByb3BlcnRpZXM6XG4gICAgICBmb3Iga2V5LCBuYW1lIG9mIHJlZnMgd2hlbiBrZXkgIT0gJytkaXJlY3QnXG4gICAgICAgIHAgPSBpZiB0eXBlb2YgcHJvZmlsZSA9PSAnb2JqZWN0JyBhbmQgcHJvZmlsZS5uYW1lID09IG5hbWVcbiAgICAgICAgICBwcm9maWxlXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBQcm9maWxlcy5ieU5hbWUobmFtZSwgb3B0aW9ucylcbiAgICAgICAgaWYgbm90IHA/XG4gICAgICAgICAgcCA9IFByb2ZpbGVzLnByb2ZpbGVOb3RGb3VuZChuYW1lLCBhcmdzPy5wcm9maWxlTm90Rm91bmQpXG4gICAgICAgIG5ldyBVMi5BU1RfT2JqZWN0S2V5VmFsKGtleToga2V5LCB2YWx1ZTogUHJvZmlsZXMuY29tcGlsZShwKSlcblxuICAgIGZhY3RvcnkgPSBuZXcgVTIuQVNUX0Z1bmN0aW9uKFxuICAgICAgYXJnbmFtZXM6IFtcbiAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ2luaXQnXG4gICAgICAgIG5ldyBVMi5BU1RfU3ltYm9sRnVuYXJnIG5hbWU6ICdwcm9maWxlcydcbiAgICAgIF1cbiAgICAgIGJvZHk6IFtuZXcgVTIuQVNUX1JldHVybiB2YWx1ZTogbmV3IFUyLkFTVF9GdW5jdGlvbihcbiAgICAgICAgYXJnbmFtZXM6IFtcbiAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbEZ1bmFyZyBuYW1lOiAndXJsJ1xuICAgICAgICAgIG5ldyBVMi5BU1RfU3ltYm9sRnVuYXJnIG5hbWU6ICdob3N0J1xuICAgICAgICBdXG4gICAgICAgIGJvZHk6IFtcbiAgICAgICAgICBuZXcgVTIuQVNUX0RpcmVjdGl2ZSB2YWx1ZTogJ3VzZSBzdHJpY3QnXG4gICAgICAgICAgbmV3IFUyLkFTVF9WYXIgZGVmaW5pdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBVMi5BU1RfVmFyRGVmIG5hbWU6IG5ldyBVMi5BU1RfU3ltYm9sVmFyKG5hbWU6ICdyZXN1bHQnKSwgdmFsdWU6XG4gICAgICAgICAgICAgIG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdpbml0J1xuICAgICAgICAgICAgbmV3IFUyLkFTVF9WYXJEZWYgbmFtZTogbmV3IFUyLkFTVF9TeW1ib2xWYXIobmFtZTogJ3NjaGVtZScpLCB2YWx1ZTpcbiAgICAgICAgICAgICAgbmV3IFUyLkFTVF9DYWxsKFxuICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgICAgICAgICAgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ3VybCdcbiAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiAnc3Vic3RyJ1xuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBhcmdzOiBbXG4gICAgICAgICAgICAgICAgICBuZXcgVTIuQVNUX051bWJlciB2YWx1ZTogMFxuICAgICAgICAgICAgICAgICAgbmV3IFUyLkFTVF9DYWxsKFxuICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX0RvdChcbiAgICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAndXJsJ1xuICAgICAgICAgICAgICAgICAgICAgIHByb3BlcnR5OiAnaW5kZXhPZidcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICBhcmdzOiBbbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6ICc6J11cbiAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICBdXG4gICAgICAgICAgbmV3IFUyLkFTVF9EbyhcbiAgICAgICAgICAgIGJvZHk6IG5ldyBVMi5BU1RfQmxvY2tTdGF0ZW1lbnQgYm9keTogW1xuICAgICAgICAgICAgICBuZXcgVTIuQVNUX1NpbXBsZVN0YXRlbWVudCBib2R5OiBuZXcgVTIuQVNUX0Fzc2lnbihcbiAgICAgICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAncmVzdWx0J1xuICAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnPSdcbiAgICAgICAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9TdWIoXG4gICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAncHJvZmlsZXMnXG4gICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ3Jlc3VsdCdcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgbmV3IFUyLkFTVF9JZihcbiAgICAgICAgICAgICAgICBjb25kaXRpb246IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgICAgICAgbGVmdDogbmV3IFUyLkFTVF9VbmFyeVByZWZpeChcbiAgICAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICd0eXBlb2YnXG4gICAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdyZXN1bHQnXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICBvcGVyYXRvcjogJz09PSdcbiAgICAgICAgICAgICAgICAgIHJpZ2h0OiBuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBib2R5OiBuZXcgVTIuQVNUX1NpbXBsZVN0YXRlbWVudCBib2R5OiBuZXcgVTIuQVNUX0Fzc2lnbihcbiAgICAgICAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdyZXN1bHQnXG4gICAgICAgICAgICAgICAgICBvcGVyYXRvcjogJz0nXG4gICAgICAgICAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9DYWxsKFxuICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAncmVzdWx0J1xuICAgICAgICAgICAgICAgICAgICBhcmdzOiBbXG4gICAgICAgICAgICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ3VybCdcbiAgICAgICAgICAgICAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnaG9zdCdcbiAgICAgICAgICAgICAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnc2NoZW1lJ1xuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBjb25kaXRpb246IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX0JpbmFyeShcbiAgICAgICAgICAgICAgICBsZWZ0OiBuZXcgVTIuQVNUX1VuYXJ5UHJlZml4KFxuICAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICd0eXBlb2YnXG4gICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAncmVzdWx0J1xuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBvcGVyYXRvcjogJyE9PSdcbiAgICAgICAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6ICdzdHJpbmcnXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgb3BlcmF0b3I6ICd8fCdcbiAgICAgICAgICAgICAgcmlnaHQ6IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgICAgIGxlZnQ6IG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfRG90KFxuICAgICAgICAgICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAncmVzdWx0J1xuICAgICAgICAgICAgICAgICAgICBwcm9wZXJ0eTogJ2NoYXJDb2RlQXQnXG4gICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICBhcmdzOiBbbmV3IFUyLkFTVF9OdW1iZXIodmFsdWU6IDApXVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICBvcGVyYXRvcjogJz09PSdcbiAgICAgICAgICAgICAgICByaWdodDogbmV3IFUyLkFTVF9OdW1iZXIgdmFsdWU6ICcrJy5jaGFyQ29kZUF0KDApXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICApXG4gICAgICAgICAgbmV3IFUyLkFTVF9SZXR1cm4gdmFsdWU6IG5ldyBVMi5BU1RfU3ltYm9sUmVmIG5hbWU6ICdyZXN1bHQnXG4gICAgICAgIF1cbiAgICAgICldXG4gICAgKVxuICAgIG5ldyBVMi5BU1RfVG9wbGV2ZWwgYm9keTogW25ldyBVMi5BU1RfVmFyIGRlZmluaXRpb25zOiBbXG4gICAgICBuZXcgVTIuQVNUX1ZhckRlZihcbiAgICAgICAgbmFtZTogbmV3IFUyLkFTVF9TeW1ib2xWYXIgbmFtZTogJ0ZpbmRQcm94eUZvclVSTCdcbiAgICAgICAgdmFsdWU6IG5ldyBVMi5BU1RfQ2FsbChcbiAgICAgICAgICBleHByZXNzaW9uOiBmYWN0b3J5XG4gICAgICAgICAgYXJnczogW1xuICAgICAgICAgICAgUHJvZmlsZXMucHJvZmlsZVJlc3VsdCBwcm9maWxlLm5hbWVcbiAgICAgICAgICAgIHByb2ZpbGVzXG4gICAgICAgICAgXVxuICAgICAgICApXG4gICAgICApXG4gICAgXV1cbiAgIyBjb2ZmZWVsaW50OiBlbmFibGU9bWlzc2luZ19mYXRfYXJyb3dzXG4iLCJVMiA9IHJlcXVpcmUgJ3VnbGlmeS1qcydcblNoZXhwVXRpbHMgPSByZXF1aXJlICcuL3NoZXhwX3V0aWxzJ1xuQ29uZGl0aW9ucyA9IHJlcXVpcmUgJy4vY29uZGl0aW9ucydcblJ1bGVMaXN0ID0gcmVxdWlyZSAnLi9ydWxlX2xpc3QnXG57QXR0YWNoZWRDYWNoZSwgUmV2aXNpb259ID0gcmVxdWlyZSAnLi91dGlscydcblxuIyBjb2ZmZWVsaW50OiBkaXNhYmxlPWNhbWVsX2Nhc2VfY2xhc3Nlc1xuY2xhc3MgQVNUX1JhdyBleHRlbmRzIFUyLkFTVF9TeW1ib2xSZWZcbiAgIyBjb2ZmZWVsaW50OiBlbmFibGU9Y2FtZWxfY2FzZV9jbGFzc2VzXG4gIGNvbnN0cnVjdG9yOiAocmF3KSAtPlxuICAgIFUyLkFTVF9TeW1ib2xSZWYuY2FsbCh0aGlzLCBuYW1lOiByYXcpXG4gICAgQGFib3J0cyA9IC0+IGZhbHNlXG5cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9XG4gIGJ1aWx0aW5Qcm9maWxlczpcbiAgICAnK2RpcmVjdCc6XG4gICAgICBuYW1lOiAnZGlyZWN0J1xuICAgICAgcHJvZmlsZVR5cGU6ICdEaXJlY3RQcm9maWxlJ1xuICAgICAgY29sb3I6ICcjYWFhYWFhJ1xuICAgICAgYnVpbHRpbjogdHJ1ZVxuICAgICcrc3lzdGVtJzpcbiAgICAgIG5hbWU6ICdzeXN0ZW0nXG4gICAgICBwcm9maWxlVHlwZTogJ1N5c3RlbVByb2ZpbGUnXG4gICAgICBjb2xvcjogJyMwMDAwMDAnXG4gICAgICBidWlsdGluOiB0cnVlXG5cbiAgc2NoZW1lczogW1xuICAgIHtzY2hlbWU6ICdodHRwJywgcHJvcDogJ3Byb3h5Rm9ySHR0cCd9XG4gICAge3NjaGVtZTogJ2h0dHBzJywgcHJvcDogJ3Byb3h5Rm9ySHR0cHMnfVxuICAgIHtzY2hlbWU6ICdmdHAnLCBwcm9wOiAncHJveHlGb3JGdHAnfVxuICAgIHtzY2hlbWU6ICcnLCBwcm9wOiAnZmFsbGJhY2tQcm94eSd9XG4gIF1cblxuICBwYWNQcm90b2NvbHM6IHtcbiAgICAnaHR0cCc6ICdQUk9YWSdcbiAgICAnaHR0cHMnOiAnSFRUUFMnXG4gICAgJ3NvY2tzNCc6ICdTT0NLUydcbiAgICAnc29ja3M1JzogJ1NPQ0tTNSdcbiAgfVxuXG4gIGZvcm1hdEJ5VHlwZToge1xuICAgICdTd2l0Y2h5UnVsZUxpc3RQcm9maWxlJzogJ1N3aXRjaHknXG4gICAgJ0F1dG9Qcm94eVJ1bGVMaXN0UHJvZmlsZSc6ICdBdXRvUHJveHknXG4gIH1cblxuICBydWxlTGlzdEZvcm1hdHM6IFtcbiAgICAnU3dpdGNoeSdcbiAgICAnQXV0b1Byb3h5J1xuICBdXG5cbiAgcGFyc2VIb3N0UG9ydDogKHN0ciwgc2NoZW1lKSAtPlxuICAgIHNlcCA9IHN0ci5sYXN0SW5kZXhPZignOicpXG4gICAgcmV0dXJuIGlmIHNlcCA8IDBcbiAgICBwb3J0ID0gcGFyc2VJbnQoc3RyLnN1YnN0cihzZXAgKyAxKSkgfHwgODBcbiAgICBob3N0ID0gc3RyLnN1YnN0cigwLCBzZXApXG4gICAgcmV0dXJuIHVubGVzcyBob3N0XG4gICAgcmV0dXJuIHtcbiAgICAgIHNjaGVtZTogc2NoZW1lXG4gICAgICBob3N0OiBob3N0XG4gICAgICBwb3J0OiBwb3J0XG4gICAgfVxuXG4gIHBhY1Jlc3VsdDogKHByb3h5KSAtPlxuICAgIGlmIHByb3h5XG4gICAgICBpZiBwcm94eS5zY2hlbWUgPT0gJ3NvY2tzNSdcbiAgICAgICAgXCJTT0NLUzUgI3twcm94eS5ob3N0fToje3Byb3h5LnBvcnR9OyBTT0NLUyAje3Byb3h5Lmhvc3R9OiN7cHJveHkucG9ydH1cIlxuICAgICAgZWxzZVxuICAgICAgICBcIiN7ZXhwb3J0cy5wYWNQcm90b2NvbHNbcHJveHkuc2NoZW1lXX0gI3twcm94eS5ob3N0fToje3Byb3h5LnBvcnR9XCJcbiAgICBlbHNlXG4gICAgICAnRElSRUNUJ1xuXG4gIGlzRmlsZVVybDogKHVybCkgLT4gISEodXJsPy5zdWJzdHIoMCwgNSkudG9VcHBlckNhc2UoKSA9PSAnRklMRTonKVxuXG4gIG5hbWVBc0tleTogKHByb2ZpbGVOYW1lKSAtPlxuICAgIGlmIHR5cGVvZiBwcm9maWxlTmFtZSAhPSAnc3RyaW5nJ1xuICAgICAgcHJvZmlsZU5hbWUgPSBwcm9maWxlTmFtZS5uYW1lXG4gICAgJysnICsgcHJvZmlsZU5hbWVcbiAgYnlOYW1lOiAocHJvZmlsZU5hbWUsIG9wdGlvbnMpIC0+XG4gICAgaWYgdHlwZW9mIHByb2ZpbGVOYW1lID09ICdzdHJpbmcnXG4gICAgICBrZXkgPSBleHBvcnRzLm5hbWVBc0tleShwcm9maWxlTmFtZSlcbiAgICAgIHByb2ZpbGVOYW1lID0gZXhwb3J0cy5idWlsdGluUHJvZmlsZXNba2V5XSA/IG9wdGlvbnNba2V5XVxuICAgIHByb2ZpbGVOYW1lXG4gIGJ5S2V5OiAoa2V5LCBvcHRpb25zKSAtPlxuICAgIGlmIHR5cGVvZiBrZXkgPT0gJ3N0cmluZydcbiAgICAgIGtleSA9IGV4cG9ydHMuYnVpbHRpblByb2ZpbGVzW2tleV0gPyBvcHRpb25zW2tleV1cbiAgICBrZXlcblxuICBlYWNoOiAob3B0aW9ucywgY2FsbGJhY2spIC0+XG4gICAgY2hhckNvZGVQbHVzID0gJysnLmNoYXJDb2RlQXQoMClcbiAgICBmb3Iga2V5LCBwcm9maWxlIG9mIG9wdGlvbnMgd2hlbiBrZXkuY2hhckNvZGVBdCgwKSA9PSBjaGFyQ29kZVBsdXNcbiAgICAgIGNhbGxiYWNrKGtleSwgcHJvZmlsZSlcbiAgICBmb3Iga2V5LCBwcm9maWxlIG9mIGV4cG9ydHMuYnVpbHRpblByb2ZpbGVzXG4gICAgICBpZiBrZXkuY2hhckNvZGVBdCgwKSA9PSBjaGFyQ29kZVBsdXNcbiAgICAgICAgY2FsbGJhY2soa2V5LCBwcm9maWxlKVxuXG4gIHByb2ZpbGVSZXN1bHQ6IChwcm9maWxlTmFtZSkgLT5cbiAgICBrZXkgPSBleHBvcnRzLm5hbWVBc0tleShwcm9maWxlTmFtZSlcbiAgICBpZiBrZXkgPT0gJytkaXJlY3QnXG4gICAgICBrZXkgPSBleHBvcnRzLnBhY1Jlc3VsdCgpXG4gICAgbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IGtleVxuXG4gIGlzSW5jbHVkYWJsZTogKHByb2ZpbGUpIC0+XG4gICAgaW5jbHVkYWJsZSA9IGV4cG9ydHMuX2hhbmRsZXIocHJvZmlsZSkuaW5jbHVkYWJsZVxuICAgIGlmIHR5cGVvZiBpbmNsdWRhYmxlID09ICdmdW5jdGlvbidcbiAgICAgIGluY2x1ZGFibGUgPSBpbmNsdWRhYmxlLmNhbGwoZXhwb3J0cywgcHJvZmlsZSlcbiAgICAhIWluY2x1ZGFibGVcbiAgaXNJbmNsdXNpdmU6IChwcm9maWxlKSAtPiAhIWV4cG9ydHMuX2hhbmRsZXIocHJvZmlsZSkuaW5jbHVzaXZlXG5cbiAgdXBkYXRlVXJsOiAocHJvZmlsZSkgLT5cbiAgICBleHBvcnRzLl9oYW5kbGVyKHByb2ZpbGUpLnVwZGF0ZVVybD8uY2FsbChleHBvcnRzLCBwcm9maWxlKVxuICB1cGRhdGU6IChwcm9maWxlLCBkYXRhKSAtPlxuICAgIGV4cG9ydHMuX2hhbmRsZXIocHJvZmlsZSkudXBkYXRlLmNhbGwoZXhwb3J0cywgcHJvZmlsZSwgZGF0YSlcblxuICB0YWc6IChwcm9maWxlKSAtPiBleHBvcnRzLl9wcm9maWxlQ2FjaGUudGFnKHByb2ZpbGUpXG4gIGNyZWF0ZTogKHByb2ZpbGUsIG9wdF9wcm9maWxlVHlwZSkgLT5cbiAgICBpZiB0eXBlb2YgcHJvZmlsZSA9PSAnc3RyaW5nJ1xuICAgICAgcHJvZmlsZSA9XG4gICAgICAgIG5hbWU6IHByb2ZpbGVcbiAgICAgICAgcHJvZmlsZVR5cGU6IG9wdF9wcm9maWxlVHlwZVxuICAgIGVsc2UgaWYgb3B0X3Byb2ZpbGVUeXBlXG4gICAgICBwcm9maWxlLnByb2ZpbGVUeXBlID0gb3B0X3Byb2ZpbGVUeXBlXG4gICAgY3JlYXRlID0gZXhwb3J0cy5faGFuZGxlcihwcm9maWxlKS5jcmVhdGVcbiAgICByZXR1cm4gcHJvZmlsZSB1bmxlc3MgY3JlYXRlXG4gICAgY3JlYXRlLmNhbGwoZXhwb3J0cywgcHJvZmlsZSlcbiAgICBwcm9maWxlXG4gIHVwZGF0ZVJldmlzaW9uOiAocHJvZmlsZSwgcmV2aXNpb24pIC0+XG4gICAgcmV2aXNpb24gPz0gUmV2aXNpb24uZnJvbVRpbWUoKVxuICAgIHByb2ZpbGUucmV2aXNpb24gPSByZXZpc2lvblxuICByZXBsYWNlUmVmOiAocHJvZmlsZSwgZnJvbU5hbWUsIHRvTmFtZSkgLT5cbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IGV4cG9ydHMuaXNJbmNsdXNpdmUocHJvZmlsZSlcbiAgICBoYW5kbGVyID0gZXhwb3J0cy5faGFuZGxlcihwcm9maWxlKVxuICAgIGhhbmRsZXIucmVwbGFjZVJlZi5jYWxsKGV4cG9ydHMsIHByb2ZpbGUsIGZyb21OYW1lLCB0b05hbWUpXG4gIGFuYWx5emU6IChwcm9maWxlKSAtPlxuICAgIGNhY2hlID0gZXhwb3J0cy5fcHJvZmlsZUNhY2hlLmdldCBwcm9maWxlLCB7fVxuICAgIGlmIG5vdCBPYmplY3Q6Omhhc093blByb3BlcnR5LmNhbGwoY2FjaGUsICdhbmFseXplZCcpXG4gICAgICBhbmFseXplID0gZXhwb3J0cy5faGFuZGxlcihwcm9maWxlKS5hbmFseXplXG4gICAgICByZXN1bHQgPSBhbmFseXplPy5jYWxsKGV4cG9ydHMsIHByb2ZpbGUpXG4gICAgICBjYWNoZS5hbmFseXplZCA9IHJlc3VsdFxuICAgIHJldHVybiBjYWNoZVxuICBkcm9wQ2FjaGU6IChwcm9maWxlKSAtPlxuICAgIGV4cG9ydHMuX3Byb2ZpbGVDYWNoZS5kcm9wIHByb2ZpbGVcbiAgZGlyZWN0UmVmZXJlbmNlU2V0OiAocHJvZmlsZSkgLT5cbiAgICByZXR1cm4ge30gaWYgbm90IGV4cG9ydHMuaXNJbmNsdXNpdmUocHJvZmlsZSlcbiAgICBjYWNoZSA9IGV4cG9ydHMuX3Byb2ZpbGVDYWNoZS5nZXQgcHJvZmlsZSwge31cbiAgICByZXR1cm4gY2FjaGUuZGlyZWN0UmVmZXJlbmNlU2V0IGlmIGNhY2hlLmRpcmVjdFJlZmVyZW5jZVNldFxuICAgIGhhbmRsZXIgPSBleHBvcnRzLl9oYW5kbGVyKHByb2ZpbGUpXG4gICAgY2FjaGUuZGlyZWN0UmVmZXJlbmNlU2V0ID0gaGFuZGxlci5kaXJlY3RSZWZlcmVuY2VTZXQuY2FsbChleHBvcnRzLCBwcm9maWxlKVxuICBcbiAgcHJvZmlsZU5vdEZvdW5kOiAobmFtZSwgYWN0aW9uKSAtPlxuICAgIGlmIG5vdCBhY3Rpb24/XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQcm9maWxlICN7bmFtZX0gZG9lcyBub3QgZXhpc3QhXCIpXG4gICAgaWYgdHlwZW9mIGFjdGlvbiA9PSAnZnVuY3Rpb24nXG4gICAgICBhY3Rpb24gPSBhY3Rpb24obmFtZSlcbiAgICBpZiB0eXBlb2YgYWN0aW9uID09ICdvYmplY3QnIGFuZCBhY3Rpb24ucHJvZmlsZVR5cGVcbiAgICAgIHJldHVybiBhY3Rpb25cbiAgICBzd2l0Y2ggYWN0aW9uXG4gICAgICB3aGVuICdpZ25vcmUnXG4gICAgICAgIHJldHVybiBudWxsXG4gICAgICB3aGVuICdkdW1iJ1xuICAgICAgICByZXR1cm4gZXhwb3J0cy5jcmVhdGUoe1xuICAgICAgICAgIG5hbWU6IG5hbWVcbiAgICAgICAgICBwcm9maWxlVHlwZTogJ1ZpcnR1YWxQcm9maWxlJ1xuICAgICAgICAgIGRlZmF1bHRQcm9maWxlTmFtZTogJ2RpcmVjdCdcbiAgICAgICAgfSlcbiAgICB0aHJvdyBhY3Rpb25cblxuICBhbGxSZWZlcmVuY2VTZXQ6IChwcm9maWxlLCBvcHRpb25zLCBvcHRfYXJncykgLT5cbiAgICBvX3Byb2ZpbGUgPSBwcm9maWxlXG4gICAgcHJvZmlsZSA9IGV4cG9ydHMuYnlOYW1lKHByb2ZpbGUsIG9wdGlvbnMpXG4gICAgcHJvZmlsZSA/PSBleHBvcnRzLnByb2ZpbGVOb3RGb3VuZD8ob19wcm9maWxlLCBvcHRfYXJncy5wcm9maWxlTm90Rm91bmQpXG4gICAgb3B0X2FyZ3MgPz0ge31cbiAgICBoYXNfb3V0ID0gb3B0X2FyZ3Mub3V0P1xuICAgIHJlc3VsdCA9IG9wdF9hcmdzLm91dCA/PSB7fVxuICAgIGlmIHByb2ZpbGVcbiAgICAgIHJlc3VsdFtleHBvcnRzLm5hbWVBc0tleShwcm9maWxlLm5hbWUpXSA9IHByb2ZpbGUubmFtZVxuICAgICAgZm9yIGtleSwgbmFtZSBvZiBleHBvcnRzLmRpcmVjdFJlZmVyZW5jZVNldChwcm9maWxlKVxuICAgICAgICBleHBvcnRzLmFsbFJlZmVyZW5jZVNldChuYW1lLCBvcHRpb25zLCBvcHRfYXJncylcbiAgICBkZWxldGUgb3B0X2FyZ3Mub3V0IGlmIG5vdCBoYXNfb3V0XG4gICAgcmVzdWx0XG4gIHJlZmVyZW5jZWRCeVNldDogKHByb2ZpbGUsIG9wdGlvbnMsIG9wdF9hcmdzKSAtPlxuICAgIHByb2ZpbGVLZXkgPSBleHBvcnRzLm5hbWVBc0tleShwcm9maWxlKVxuICAgIG9wdF9hcmdzID89IHt9XG4gICAgaGFzX291dCA9IG9wdF9hcmdzLm91dD9cbiAgICByZXN1bHQgPSBvcHRfYXJncy5vdXQgPz0ge31cbiAgICBleHBvcnRzLmVhY2ggb3B0aW9ucywgKGtleSwgcHJvZikgLT5cbiAgICAgIGlmIGV4cG9ydHMuZGlyZWN0UmVmZXJlbmNlU2V0KHByb2YpW3Byb2ZpbGVLZXldXG4gICAgICAgIHJlc3VsdFtrZXldID0gcHJvZi5uYW1lXG4gICAgICAgIGV4cG9ydHMucmVmZXJlbmNlZEJ5U2V0KHByb2YsIG9wdGlvbnMsIG9wdF9hcmdzKVxuICAgIGRlbGV0ZSBvcHRfYXJncy5vdXQgaWYgbm90IGhhc19vdXRcbiAgICByZXN1bHRcbiAgdmFsaWRSZXN1bHRQcm9maWxlc0ZvcjogKHByb2ZpbGUsIG9wdGlvbnMpIC0+XG4gICAgcHJvZmlsZSA9IGV4cG9ydHMuYnlOYW1lKHByb2ZpbGUsIG9wdGlvbnMpXG4gICAgcmV0dXJuIFtdIGlmIG5vdCBleHBvcnRzLmlzSW5jbHVzaXZlKHByb2ZpbGUpXG4gICAgcHJvZmlsZUtleSA9IGV4cG9ydHMubmFtZUFzS2V5KHByb2ZpbGUpXG4gICAgcmVmID0gZXhwb3J0cy5yZWZlcmVuY2VkQnlTZXQocHJvZmlsZSwgb3B0aW9ucylcbiAgICByZWZbcHJvZmlsZUtleV0gPSBwcm9maWxlS2V5XG4gICAgcmVzdWx0ID0gW11cbiAgICBleHBvcnRzLmVhY2ggb3B0aW9ucywgKGtleSwgcHJvZikgLT5cbiAgICAgIGlmIG5vdCByZWZba2V5XSBhbmQgZXhwb3J0cy5pc0luY2x1ZGFibGUocHJvZilcbiAgICAgICAgcmVzdWx0LnB1c2gocHJvZilcbiAgICByZXN1bHRcbiAgbWF0Y2g6IChwcm9maWxlLCByZXF1ZXN0LCBvcHRfcHJvZmlsZVR5cGUpIC0+XG4gICAgb3B0X3Byb2ZpbGVUeXBlID89IHByb2ZpbGUucHJvZmlsZVR5cGVcbiAgICBjYWNoZSA9IGV4cG9ydHMuYW5hbHl6ZShwcm9maWxlKVxuICAgIG1hdGNoID0gZXhwb3J0cy5faGFuZGxlcihvcHRfcHJvZmlsZVR5cGUpLm1hdGNoXG4gICAgbWF0Y2g/LmNhbGwoZXhwb3J0cywgcHJvZmlsZSwgcmVxdWVzdCwgY2FjaGUpXG4gIGNvbXBpbGU6IChwcm9maWxlLCBvcHRfcHJvZmlsZVR5cGUpIC0+XG4gICAgb3B0X3Byb2ZpbGVUeXBlID89IHByb2ZpbGUucHJvZmlsZVR5cGVcbiAgICBjYWNoZSA9IGV4cG9ydHMuYW5hbHl6ZShwcm9maWxlKVxuICAgIHJldHVybiBjYWNoZS5jb21waWxlZCBpZiBjYWNoZS5jb21waWxlZFxuICAgIGhhbmRsZXIgPSBleHBvcnRzLl9oYW5kbGVyKG9wdF9wcm9maWxlVHlwZSlcbiAgICBjYWNoZS5jb21waWxlZCA9IGhhbmRsZXIuY29tcGlsZS5jYWxsKGV4cG9ydHMsIHByb2ZpbGUsIGNhY2hlKVxuXG4gIF9wcm9maWxlQ2FjaGU6IG5ldyBBdHRhY2hlZENhY2hlIChwcm9maWxlKSAtPiBwcm9maWxlLnJldmlzaW9uXG5cbiAgX2hhbmRsZXI6IChwcm9maWxlVHlwZSkgLT5cbiAgICBpZiB0eXBlb2YgcHJvZmlsZVR5cGUgIT0gJ3N0cmluZydcbiAgICAgIHByb2ZpbGVUeXBlID0gcHJvZmlsZVR5cGUucHJvZmlsZVR5cGVcblxuICAgIGhhbmRsZXIgPSBwcm9maWxlVHlwZVxuICAgIHdoaWxlIHR5cGVvZiBoYW5kbGVyID09ICdzdHJpbmcnXG4gICAgICBoYW5kbGVyID0gZXhwb3J0cy5fcHJvZmlsZVR5cGVzW2hhbmRsZXJdXG4gICAgaWYgbm90IGhhbmRsZXI/XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgXCJVbmtub3duIHByb2ZpbGUgdHlwZTogI3twcm9maWxlVHlwZX1cIlxuICAgIHJldHVybiBoYW5kbGVyXG5cbiAgX3Byb2ZpbGVUeXBlczpcbiAgICAjIFRoZXNlIGZ1bmN0aW9ucyBhcmUgLmNhbGwoKS1lZCB3aXRoIGB0aGlzYCBzZXQgdG8gbW9kdWxlLmV4cG9ydHMuXG4gICAgIyBjb2ZmZWVsaW50OiBkaXNhYmxlPW1pc3NpbmdfZmF0X2Fycm93c1xuICAgICdTeXN0ZW1Qcm9maWxlJzpcbiAgICAgIGNvbXBpbGU6IChwcm9maWxlKSAtPlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJTeXN0ZW1Qcm9maWxlIGNhbm5vdCBiZSB1c2VkIGluIFBBQyBzY3JpcHRzXCJcbiAgICAnRGlyZWN0UHJvZmlsZSc6XG4gICAgICBpbmNsdWRhYmxlOiB0cnVlXG4gICAgICBjb21waWxlOiAocHJvZmlsZSkgLT5cbiAgICAgICAgcmV0dXJuIG5ldyBVMi5BU1RfU3RyaW5nKHZhbHVlOiBAcGFjUmVzdWx0KCkpXG4gICAgJ0ZpeGVkUHJvZmlsZSc6XG4gICAgICBpbmNsdWRhYmxlOiB0cnVlXG4gICAgICBjcmVhdGU6IChwcm9maWxlKSAtPlxuICAgICAgICBwcm9maWxlLmJ5cGFzc0xpc3QgPz0gW3tcbiAgICAgICAgICBjb25kaXRpb25UeXBlOiAnQnlwYXNzQ29uZGl0aW9uJ1xuICAgICAgICAgIHBhdHRlcm46ICc8bG9jYWw+J1xuICAgICAgICB9XVxuICAgICAgbWF0Y2g6IChwcm9maWxlLCByZXF1ZXN0KSAtPlxuICAgICAgICBpZiBwcm9maWxlLmJ5cGFzc0xpc3RcbiAgICAgICAgICBmb3IgY29uZCBpbiBwcm9maWxlLmJ5cGFzc0xpc3RcbiAgICAgICAgICAgIGlmIENvbmRpdGlvbnMubWF0Y2goY29uZCwgcmVxdWVzdClcbiAgICAgICAgICAgICAgcmV0dXJuIFtAcGFjUmVzdWx0KCksIGNvbmRdXG4gICAgICAgIGZvciBzIGluIEBzY2hlbWVzIHdoZW4gcy5zY2hlbWUgPT0gcmVxdWVzdC5zY2hlbWUgYW5kIHByb2ZpbGVbcy5wcm9wXVxuICAgICAgICAgIHJldHVybiBbQHBhY1Jlc3VsdChwcm9maWxlW3MucHJvcF0pLCBzLnNjaGVtZV1cbiAgICAgICAgcmV0dXJuIFtAcGFjUmVzdWx0KHByb2ZpbGUuZmFsbGJhY2tQcm94eSksICcnXVxuICAgICAgY29tcGlsZTogKHByb2ZpbGUpIC0+XG4gICAgICAgIGlmICgobm90IHByb2ZpbGUuYnlwYXNzTGlzdCBvciBub3QgcHJvZmlsZS5mYWxsYmFja1Byb3h5KSBhbmRcbiAgICAgICAgICAgIG5vdCBwcm9maWxlLnByb3h5Rm9ySHR0cCBhbmQgbm90IHByb2ZpbGUucHJveHlGb3JIdHRwcyBhbmRcbiAgICAgICAgICAgIG5vdCBwcm9maWxlLnByb3h5Rm9yRnRwKVxuICAgICAgICAgIHJldHVybiBuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTpcbiAgICAgICAgICAgIEBwYWNSZXN1bHQgcHJvZmlsZS5mYWxsYmFja1Byb3h5XG4gICAgICAgIGJvZHkgPSBbXG4gICAgICAgICAgbmV3IFUyLkFTVF9EaXJlY3RpdmUgdmFsdWU6ICd1c2Ugc3RyaWN0J1xuICAgICAgICBdXG4gICAgICAgIGlmIHByb2ZpbGUuYnlwYXNzTGlzdCBhbmQgcHJvZmlsZS5ieXBhc3NMaXN0Lmxlbmd0aFxuICAgICAgICAgIGNvbmRpdGlvbnMgPSBudWxsXG4gICAgICAgICAgZm9yIGNvbmQgaW4gcHJvZmlsZS5ieXBhc3NMaXN0XG4gICAgICAgICAgICBjb25kaXRpb24gPSBDb25kaXRpb25zLmNvbXBpbGUgY29uZFxuICAgICAgICAgICAgaWYgY29uZGl0aW9ucz9cbiAgICAgICAgICAgICAgY29uZGl0aW9ucyA9IG5ldyBVMi5BU1RfQmluYXJ5KFxuICAgICAgICAgICAgICAgIGxlZnQ6IGNvbmRpdGlvbnNcbiAgICAgICAgICAgICAgICBvcGVyYXRvcjogJ3x8J1xuICAgICAgICAgICAgICAgIHJpZ2h0OiBjb25kaXRpb25cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICBjb25kaXRpb25zID0gY29uZGl0aW9uXG4gICAgICAgICAgYm9keS5wdXNoIG5ldyBVMi5BU1RfSWYoXG4gICAgICAgICAgICBjb25kaXRpb246IGNvbmRpdGlvbnNcbiAgICAgICAgICAgIGJvZHk6IG5ldyBVMi5BU1RfUmV0dXJuIHZhbHVlOiBuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogQHBhY1Jlc3VsdCgpXG4gICAgICAgICAgKVxuICAgICAgICBpZiAobm90IHByb2ZpbGUucHJveHlGb3JIdHRwIGFuZCBub3QgcHJvZmlsZS5wcm94eUZvckh0dHBzIGFuZFxuICAgICAgICAgICAgbm90IHByb2ZpbGUucHJveHlGb3JGdHApXG4gICAgICAgICAgYm9keS5wdXNoIG5ldyBVMi5BU1RfUmV0dXJuIHZhbHVlOlxuICAgICAgICAgICAgbmV3IFUyLkFTVF9TdHJpbmcgdmFsdWU6IEBwYWNSZXN1bHQgcHJvZmlsZS5mYWxsYmFja1Byb3h5XG4gICAgICAgIGVsc2VcbiAgICAgICAgICBib2R5LnB1c2ggbmV3IFUyLkFTVF9Td2l0Y2goXG4gICAgICAgICAgICBleHByZXNzaW9uOiBuZXcgVTIuQVNUX1N5bWJvbFJlZiBuYW1lOiAnc2NoZW1lJ1xuICAgICAgICAgICAgYm9keTogZm9yIHMgaW4gQHNjaGVtZXMgd2hlbiBub3Qgcy5zY2hlbWUgb3IgcHJvZmlsZVtzLnByb3BdXG4gICAgICAgICAgICAgIHJldCA9IFtuZXcgVTIuQVNUX1JldHVybiB2YWx1ZTpcbiAgICAgICAgICAgICAgICBuZXcgVTIuQVNUX1N0cmluZyB2YWx1ZTogQHBhY1Jlc3VsdCBwcm9maWxlW3MucHJvcF1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICBpZiBzLnNjaGVtZVxuICAgICAgICAgICAgICAgIG5ldyBVMi5BU1RfQ2FzZShcbiAgICAgICAgICAgICAgICAgIGV4cHJlc3Npb246IG5ldyBVMi5BU1RfU3RyaW5nIHZhbHVlOiBzLnNjaGVtZVxuICAgICAgICAgICAgICAgICAgYm9keTogcmV0XG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbmV3IFUyLkFTVF9EZWZhdWx0IGJvZHk6IHJldFxuICAgICAgICAgIClcbiAgICAgICAgbmV3IFUyLkFTVF9GdW5jdGlvbihcbiAgICAgICAgICBhcmduYW1lczogW1xuICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ3VybCdcbiAgICAgICAgICAgIG5ldyBVMi5BU1RfU3ltYm9sRnVuYXJnIG5hbWU6ICdob3N0J1xuICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ3NjaGVtZSdcbiAgICAgICAgICBdXG4gICAgICAgICAgYm9keTogYm9keVxuICAgICAgICApXG4gICAgJ1BhY1Byb2ZpbGUnOlxuICAgICAgaW5jbHVkYWJsZTogKHByb2ZpbGUpIC0+ICFAaXNGaWxlVXJsKHByb2ZpbGUucGFjVXJsKVxuICAgICAgY3JlYXRlOiAocHJvZmlsZSkgLT5cbiAgICAgICAgcHJvZmlsZS5wYWNTY3JpcHQgPz0gJycnXG4gICAgICAgICAgZnVuY3Rpb24gRmluZFByb3h5Rm9yVVJMKHVybCwgaG9zdCkge1xuICAgICAgICAgICAgcmV0dXJuIFwiRElSRUNUXCI7XG4gICAgICAgICAgfVxuICAgICAgICAnJydcbiAgICAgIGNvbXBpbGU6IChwcm9maWxlKSAtPlxuICAgICAgICBuZXcgVTIuQVNUX0NhbGwgYXJnczogW25ldyBVMi5BU1RfVGhpc10sIGV4cHJlc3Npb246XG4gICAgICAgICAgbmV3IFUyLkFTVF9Eb3QgcHJvcGVydHk6ICdjYWxsJywgZXhwcmVzc2lvbjogbmV3IFUyLkFTVF9GdW5jdGlvbihcbiAgICAgICAgICAgIGFyZ25hbWVzOiBbXVxuICAgICAgICAgICAgYm9keTogW1xuICAgICAgICAgICAgICAjIGh0dHBzOi8vZ2l0aHViLmNvbS9GZWxpc0NhdHVzL1N3aXRjaHlPbWVnYS9pc3N1ZXMvMzkwXG4gICAgICAgICAgICAgICMgMS4gQWRkIFxcbiBhZnRlciBQQUMgdG8gdGVybWluYXRlIGxpbmUgY29tbWVudCBpbiBQQUMgKC8vIC4uLilcbiAgICAgICAgICAgICAgIyAyLiBBZGQgYW5vdGhlciBcXG4gd2l0aCBrbm93bGVkZ2UgdGhhdCB0aGUgZmlyc3QgY2FuIGJlIGVzY2FwZWRcbiAgICAgICAgICAgICAgIyAgICBieSB0cmFpbGluZyBiYWNrc2xhc2ggaW4gUEFDLiAoLy8gLi4uIFxcKVxuICAgICAgICAgICAgICAjIDMuIEFkZCBhIG11bHRpbGluZS1jb21tZW50IGJsb2NrIC8qIC4uLiAqLyB0byB0ZXJtaW5hdGUgYW55XG4gICAgICAgICAgICAgICMgICAgcG90ZW50aWFsIHVuY2xvc2VkIG11bHRpbGluZS1jb21tZW50IGJsb2NrLiAoLyogLi4uKVxuICAgICAgICAgICAgICAjIDQuIEFuZCBmaW5hbGx5LCBhIHNlbWljb2xvbiB0byB0ZXJtaW5hdGUgdGhlIGZpbmFsIHN0YXRlbWVudC5cbiAgICAgICAgICAgICAgIyBXYWl0IGEgbW9tZW50LiBEbyB3ZSByZWFsbHkgbmVlZCB0byBnbyB0aGlzIGZhcj8gSSBkb24ndCBrbm93LlxuXG4gICAgICAgICAgICAgICMgVE9ETyhjYXR1cyk6IFJlbW92ZSB0aGUgaGFjayBuZWVkZWQgdG8gaW5zZXJ0IHJhdyBjb2RlLlxuICAgICAgICAgICAgICBuZXcgQVNUX1JhdyAnO1xcbicgKyBwcm9maWxlLnBhY1NjcmlwdCArICdcXG5cXG4vKiBFbmQgb2YgUEFDICovOydcbiAgICAgICAgICAgICAgbmV3IFUyLkFTVF9SZXR1cm4gdmFsdWU6XG4gICAgICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xSZWYgbmFtZTogJ0ZpbmRQcm94eUZvclVSTCdcbiAgICAgICAgICAgIF1cbiAgICAgICAgICApXG4gICAgICB1cGRhdGVVcmw6IChwcm9maWxlKSAtPlxuICAgICAgICBpZiBAaXNGaWxlVXJsKHByb2ZpbGUucGFjVXJsKVxuICAgICAgICAgIHVuZGVmaW5lZFxuICAgICAgICBlbHNlXG4gICAgICAgICAgcHJvZmlsZS5wYWNVcmxcbiAgICAgIHVwZGF0ZTogKHByb2ZpbGUsIGRhdGEpIC0+XG4gICAgICAgIHJldHVybiBmYWxzZSBpZiBwcm9maWxlLnBhY1NjcmlwdCA9PSBkYXRhXG4gICAgICAgIHByb2ZpbGUucGFjU2NyaXB0ID0gZGF0YVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICdBdXRvRGV0ZWN0UHJvZmlsZSc6ICdQYWNQcm9maWxlJ1xuICAgICdTd2l0Y2hQcm9maWxlJzpcbiAgICAgIGluY2x1ZGFibGU6IHRydWVcbiAgICAgIGluY2x1c2l2ZTogdHJ1ZVxuICAgICAgY3JlYXRlOiAocHJvZmlsZSkgLT5cbiAgICAgICAgcHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWUgPz0gJ2RpcmVjdCdcbiAgICAgICAgcHJvZmlsZS5ydWxlcyA/PSBbXVxuICAgICAgZGlyZWN0UmVmZXJlbmNlU2V0OiAocHJvZmlsZSkgLT5cbiAgICAgICAgcmVmcyA9IHt9XG4gICAgICAgIHJlZnNbZXhwb3J0cy5uYW1lQXNLZXkocHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWUpXSA9XG4gICAgICAgICAgcHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWVcbiAgICAgICAgZm9yIHJ1bGUgaW4gcHJvZmlsZS5ydWxlc1xuICAgICAgICAgIHJlZnNbZXhwb3J0cy5uYW1lQXNLZXkocnVsZS5wcm9maWxlTmFtZSldID0gcnVsZS5wcm9maWxlTmFtZVxuICAgICAgICByZWZzXG4gICAgICBhbmFseXplOiAocHJvZmlsZSkgLT4gcHJvZmlsZS5ydWxlc1xuICAgICAgcmVwbGFjZVJlZjogKHByb2ZpbGUsIGZyb21OYW1lLCB0b05hbWUpIC0+XG4gICAgICAgIGNoYW5nZWQgPSBmYWxzZVxuICAgICAgICBpZiBwcm9maWxlLmRlZmF1bHRQcm9maWxlTmFtZSA9PSBmcm9tTmFtZVxuICAgICAgICAgIHByb2ZpbGUuZGVmYXVsdFByb2ZpbGVOYW1lID0gdG9OYW1lXG4gICAgICAgICAgY2hhbmdlZCA9IHRydWVcbiAgICAgICAgZm9yIHJ1bGUgaW4gcHJvZmlsZS5ydWxlc1xuICAgICAgICAgIGlmIHJ1bGUucHJvZmlsZU5hbWUgPT0gZnJvbU5hbWVcbiAgICAgICAgICAgIHJ1bGUucHJvZmlsZU5hbWUgPSB0b05hbWVcbiAgICAgICAgICAgIGNoYW5nZWQgPSB0cnVlXG4gICAgICAgIHJldHVybiBjaGFuZ2VkXG4gICAgICBtYXRjaDogKHByb2ZpbGUsIHJlcXVlc3QsIGNhY2hlKSAtPlxuICAgICAgICBmb3IgcnVsZSBpbiBjYWNoZS5hbmFseXplZFxuICAgICAgICAgIGlmIENvbmRpdGlvbnMubWF0Y2gocnVsZS5jb25kaXRpb24sIHJlcXVlc3QpXG4gICAgICAgICAgICByZXR1cm4gcnVsZVxuICAgICAgICByZXR1cm4gW2V4cG9ydHMubmFtZUFzS2V5KHByb2ZpbGUuZGVmYXVsdFByb2ZpbGVOYW1lKSwgbnVsbF1cbiAgICAgIGNvbXBpbGU6IChwcm9maWxlLCBjYWNoZSkgLT5cbiAgICAgICAgcnVsZXMgPSBjYWNoZS5hbmFseXplZFxuICAgICAgICBpZiBydWxlcy5sZW5ndGggPT0gMFxuICAgICAgICAgIHJldHVybiBAcHJvZmlsZVJlc3VsdCBwcm9maWxlLmRlZmF1bHRQcm9maWxlTmFtZVxuICAgICAgICBib2R5ID0gW1xuICAgICAgICAgIG5ldyBVMi5BU1RfRGlyZWN0aXZlIHZhbHVlOiAndXNlIHN0cmljdCdcbiAgICAgICAgXVxuICAgICAgICBmb3IgcnVsZSBpbiBydWxlc1xuICAgICAgICAgIGJvZHkucHVzaCBuZXcgVTIuQVNUX0lmXG4gICAgICAgICAgICBjb25kaXRpb246IENvbmRpdGlvbnMuY29tcGlsZSBydWxlLmNvbmRpdGlvblxuICAgICAgICAgICAgYm9keTogbmV3IFUyLkFTVF9SZXR1cm4gdmFsdWU6XG4gICAgICAgICAgICAgIEBwcm9maWxlUmVzdWx0KHJ1bGUucHJvZmlsZU5hbWUpXG4gICAgICAgIGJvZHkucHVzaCBuZXcgVTIuQVNUX1JldHVybiB2YWx1ZTpcbiAgICAgICAgICBAcHJvZmlsZVJlc3VsdCBwcm9maWxlLmRlZmF1bHRQcm9maWxlTmFtZVxuICAgICAgICBuZXcgVTIuQVNUX0Z1bmN0aW9uKFxuICAgICAgICAgIGFyZ25hbWVzOiBbXG4gICAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbEZ1bmFyZyBuYW1lOiAndXJsJ1xuICAgICAgICAgICAgbmV3IFUyLkFTVF9TeW1ib2xGdW5hcmcgbmFtZTogJ2hvc3QnXG4gICAgICAgICAgICBuZXcgVTIuQVNUX1N5bWJvbEZ1bmFyZyBuYW1lOiAnc2NoZW1lJ1xuICAgICAgICAgIF1cbiAgICAgICAgICBib2R5OiBib2R5XG4gICAgICAgIClcbiAgICAnVmlydHVhbFByb2ZpbGUnOiAnU3dpdGNoUHJvZmlsZSdcbiAgICAnUnVsZUxpc3RQcm9maWxlJzpcbiAgICAgIGluY2x1ZGFibGU6IHRydWVcbiAgICAgIGluY2x1c2l2ZTogdHJ1ZVxuICAgICAgY3JlYXRlOiAocHJvZmlsZSkgLT5cbiAgICAgICAgcHJvZmlsZS5wcm9maWxlVHlwZSA/PSAnUnVsZUxpc3RQcm9maWxlJ1xuICAgICAgICBwcm9maWxlLmZvcm1hdCA/PSBleHBvcnRzLmZvcm1hdEJ5VHlwZVtwcm9maWxlLnByb2ZpbGVUeXBlXSA/ICAnU3dpdGNoeSdcbiAgICAgICAgcHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWUgPz0gJ2RpcmVjdCdcbiAgICAgICAgcHJvZmlsZS5tYXRjaFByb2ZpbGVOYW1lID89ICdkaXJlY3QnXG4gICAgICAgIHByb2ZpbGUucnVsZUxpc3QgPz0gJydcbiAgICAgIGRpcmVjdFJlZmVyZW5jZVNldDogKHByb2ZpbGUpIC0+XG4gICAgICAgIGlmIHByb2ZpbGUucnVsZUxpc3Q/XG4gICAgICAgICAgcmVmcyA9IFJ1bGVMaXN0W3Byb2ZpbGUuZm9ybWF0XT8uZGlyZWN0UmVmZXJlbmNlU2V0Pyhwcm9maWxlKVxuICAgICAgICAgIHJldHVybiByZWZzIGlmIHJlZnNcbiAgICAgICAgcmVmcyA9IHt9XG4gICAgICAgIGZvciBuYW1lIGluIFtwcm9maWxlLm1hdGNoUHJvZmlsZU5hbWUsIHByb2ZpbGUuZGVmYXVsdFByb2ZpbGVOYW1lXVxuICAgICAgICAgIHJlZnNbZXhwb3J0cy5uYW1lQXNLZXkobmFtZSldID0gbmFtZVxuICAgICAgICByZWZzXG4gICAgICByZXBsYWNlUmVmOiAocHJvZmlsZSwgZnJvbU5hbWUsIHRvTmFtZSkgLT5cbiAgICAgICAgY2hhbmdlZCA9IGZhbHNlXG4gICAgICAgIGlmIHByb2ZpbGUuZGVmYXVsdFByb2ZpbGVOYW1lID09IGZyb21OYW1lXG4gICAgICAgICAgcHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWUgPSB0b05hbWVcbiAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZVxuICAgICAgICBpZiBwcm9maWxlLm1hdGNoUHJvZmlsZU5hbWUgPT0gZnJvbU5hbWVcbiAgICAgICAgICBwcm9maWxlLm1hdGNoUHJvZmlsZU5hbWUgPSB0b05hbWVcbiAgICAgICAgICBjaGFuZ2VkID0gdHJ1ZVxuICAgICAgICByZXR1cm4gY2hhbmdlZFxuICAgICAgYW5hbHl6ZTogKHByb2ZpbGUpIC0+XG4gICAgICAgIGZvcm1hdCA9IHByb2ZpbGUuZm9ybWF0ID8gZXhwb3J0cy5mb3JtYXRCeVR5cGVbcHJvZmlsZS5wcm9maWxlVHlwZV1cbiAgICAgICAgZm9ybWF0SGFuZGxlciA9IFJ1bGVMaXN0W2Zvcm1hdF1cbiAgICAgICAgaWYgbm90IGZvcm1hdEhhbmRsZXJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IgXCJVbnN1cHBvcnRlZCBydWxlIGxpc3QgZm9ybWF0ICN7Zm9ybWF0fSFcIlxuICAgICAgICBydWxlTGlzdCA9IHByb2ZpbGUucnVsZUxpc3Q/LnRyaW0oKSB8fCAnJ1xuICAgICAgICBpZiBmb3JtYXRIYW5kbGVyLnByZXByb2Nlc3M/XG4gICAgICAgICAgcnVsZUxpc3QgPSBmb3JtYXRIYW5kbGVyLnByZXByb2Nlc3MocnVsZUxpc3QpXG4gICAgICAgIHJldHVybiBmb3JtYXRIYW5kbGVyLnBhcnNlKHJ1bGVMaXN0LCBwcm9maWxlLm1hdGNoUHJvZmlsZU5hbWUsXG4gICAgICAgICAgcHJvZmlsZS5kZWZhdWx0UHJvZmlsZU5hbWUpXG4gICAgICBtYXRjaDogKHByb2ZpbGUsIHJlcXVlc3QpIC0+XG4gICAgICAgIHJlc3VsdCA9IGV4cG9ydHMubWF0Y2gocHJvZmlsZSwgcmVxdWVzdCwgJ1N3aXRjaFByb2ZpbGUnKVxuICAgICAgY29tcGlsZTogKHByb2ZpbGUpIC0+XG4gICAgICAgIGV4cG9ydHMuY29tcGlsZShwcm9maWxlLCAnU3dpdGNoUHJvZmlsZScpXG4gICAgICB1cGRhdGVVcmw6IChwcm9maWxlKSAtPiBwcm9maWxlLnNvdXJjZVVybFxuICAgICAgdXBkYXRlOiAocHJvZmlsZSwgZGF0YSkgLT5cbiAgICAgICAgZGF0YSA9IGRhdGEudHJpbSgpXG4gICAgICAgIG9yaWdpbmFsID0gcHJvZmlsZS5mb3JtYXQgPyBleHBvcnRzLmZvcm1hdEJ5VHlwZVtwcm9maWxlLnByb2ZpbGVUeXBlXVxuICAgICAgICBwcm9maWxlLnByb2ZpbGVUeXBlID0gJ1J1bGVMaXN0UHJvZmlsZSdcbiAgICAgICAgZm9ybWF0ID0gb3JpZ2luYWxcbiAgICAgICAgaWYgUnVsZUxpc3RbZm9ybWF0XS5kZXRlY3Q/KGRhdGEpID09IGZhbHNlXG4gICAgICAgICAgIyBXcm9uZyBkYXRhIGZvciB0aGUgY3VycmVudCBmb3JtYXQuXG4gICAgICAgICAgZm9ybWF0ID0gbnVsbFxuICAgICAgICBmb3Igb3duIGZvcm1hdE5hbWUgb2YgUnVsZUxpc3RcbiAgICAgICAgICByZXN1bHQgPSBSdWxlTGlzdFtmb3JtYXROYW1lXS5kZXRlY3Q/KGRhdGEpXG4gICAgICAgICAgaWYgcmVzdWx0ID09IHRydWUgb3IgKHJlc3VsdCAhPSBmYWxzZSBhbmQgbm90IGZvcm1hdD8pXG4gICAgICAgICAgICBwcm9maWxlLmZvcm1hdCA9IGZvcm1hdCA9IGZvcm1hdE5hbWVcbiAgICAgICAgZm9ybWF0ID89IG9yaWdpbmFsXG4gICAgICAgIGZvcm1hdEhhbmRsZXIgPSBSdWxlTGlzdFtmb3JtYXRdXG4gICAgICAgIGlmIGZvcm1hdEhhbmRsZXIucHJlcHJvY2Vzcz9cbiAgICAgICAgICBkYXRhID0gZm9ybWF0SGFuZGxlci5wcmVwcm9jZXNzKGRhdGEpXG4gICAgICAgIHJldHVybiBmYWxzZSBpZiBwcm9maWxlLnJ1bGVMaXN0ID09IGRhdGFcbiAgICAgICAgcHJvZmlsZS5ydWxlTGlzdCA9IGRhdGFcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAnU3dpdGNoeVJ1bGVMaXN0UHJvZmlsZSc6ICdSdWxlTGlzdFByb2ZpbGUnXG4gICAgJ0F1dG9Qcm94eVJ1bGVMaXN0UHJvZmlsZSc6ICdSdWxlTGlzdFByb2ZpbGUnXG4gICAgIyBjb2ZmZWVsaW50OiBlbmFibGU9bWlzc2luZ19mYXRfYXJyb3dzXG4iLCJCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXJcbkNvbmRpdGlvbnMgPSByZXF1aXJlKCcuL2NvbmRpdGlvbnMnKVxuXG5zdHJTdGFydHNXaXRoID0gKHN0ciwgcHJlZml4KSAtPlxuICBzdHIuc3Vic3RyKDAsIHByZWZpeC5sZW5ndGgpID09IHByZWZpeFxuXG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPVxuICAnQXV0b1Byb3h5JzpcbiAgICBtYWdpY1ByZWZpeDogJ1cwRjFkRzlRY205NCcgIyBEZXRlY3QgYmFzZS02NCBlbmNvZGVkIFwiW0F1dG9Qcm94eVwiLlxuICAgIGRldGVjdDogKHRleHQpIC0+XG4gICAgICBpZiBzdHJTdGFydHNXaXRoKHRleHQsIGV4cG9ydHNbJ0F1dG9Qcm94eSddLm1hZ2ljUHJlZml4KVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgZWxzZSBpZiBzdHJTdGFydHNXaXRoKHRleHQsICdbQXV0b1Byb3h5JylcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIHJldHVyblxuICAgIHByZXByb2Nlc3M6ICh0ZXh0KSAtPlxuICAgICAgaWYgc3RyU3RhcnRzV2l0aCh0ZXh0LCBleHBvcnRzWydBdXRvUHJveHknXS5tYWdpY1ByZWZpeClcbiAgICAgICAgdGV4dCA9IG5ldyBCdWZmZXIodGV4dCwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGY4JylcbiAgICAgIHJldHVybiB0ZXh0XG4gICAgcGFyc2U6ICh0ZXh0LCBtYXRjaFByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUpIC0+XG4gICAgICBub3JtYWxfcnVsZXMgPSBbXVxuICAgICAgZXhjbHVzaXZlX3J1bGVzID0gW11cbiAgICAgIGZvciBsaW5lIGluIHRleHQuc3BsaXQoL1xcbnxcXHIvKVxuICAgICAgICBsaW5lID0gbGluZS50cmltKClcbiAgICAgICAgY29udGludWUgaWYgbGluZS5sZW5ndGggPT0gMCB8fCBsaW5lWzBdID09ICchJyB8fCBsaW5lWzBdID09ICdbJ1xuICAgICAgICBzb3VyY2UgPSBsaW5lXG4gICAgICAgIHByb2ZpbGUgPSBtYXRjaFByb2ZpbGVOYW1lXG4gICAgICAgIGxpc3QgPSBub3JtYWxfcnVsZXNcbiAgICAgICAgaWYgbGluZVswXSA9PSAnQCcgYW5kIGxpbmVbMV0gPT0gJ0AnXG4gICAgICAgICAgcHJvZmlsZSA9IGRlZmF1bHRQcm9maWxlTmFtZVxuICAgICAgICAgIGxpc3QgPSBleGNsdXNpdmVfcnVsZXNcbiAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoMilcbiAgICAgICAgY29uZCA9XG4gICAgICAgICAgaWYgbGluZVswXSA9PSAnLydcbiAgICAgICAgICAgIGNvbmRpdGlvblR5cGU6ICdVcmxSZWdleENvbmRpdGlvbidcbiAgICAgICAgICAgIHBhdHRlcm46IGxpbmUuc3Vic3RyaW5nKDEsIGxpbmUubGVuZ3RoIC0gMSlcbiAgICAgICAgICBlbHNlIGlmIGxpbmVbMF0gPT0gJ3wnXG4gICAgICAgICAgICBpZiBsaW5lWzFdID09ICd8J1xuICAgICAgICAgICAgICBjb25kaXRpb25UeXBlOiAnSG9zdFdpbGRjYXJkQ29uZGl0aW9uJ1xuICAgICAgICAgICAgICBwYXR0ZXJuOiBcIiouXCIgKyBsaW5lLnN1YnN0cmluZygyKVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICBjb25kaXRpb25UeXBlOiAnVXJsV2lsZGNhcmRDb25kaXRpb24nXG4gICAgICAgICAgICAgIHBhdHRlcm46IGxpbmUuc3Vic3RyaW5nKDEpICsgXCIqXCJcbiAgICAgICAgICBlbHNlIGlmIGxpbmUuaW5kZXhPZignKicpIDwgMFxuICAgICAgICAgICAgY29uZGl0aW9uVHlwZTogJ0tleXdvcmRDb25kaXRpb24nXG4gICAgICAgICAgICBwYXR0ZXJuOiBsaW5lXG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgY29uZGl0aW9uVHlwZTogJ1VybFdpbGRjYXJkQ29uZGl0aW9uJ1xuICAgICAgICAgICAgcGF0dGVybjogJ2h0dHA6Ly8qJyArIGxpbmUgKyAnKidcbiAgICAgICAgbGlzdC5wdXNoKHtjb25kaXRpb246IGNvbmQsIHByb2ZpbGVOYW1lOiBwcm9maWxlLCBzb3VyY2U6IHNvdXJjZX0pXG4gICAgICAjIEV4Y2x1c2l2ZSBydWxlcyBoYXZlIGhpZ2hlciBwcmlvcml0eSwgc28gdGhleSBjb21lIGZpcnN0LlxuICAgICAgcmV0dXJuIGV4Y2x1c2l2ZV9ydWxlcy5jb25jYXQgbm9ybWFsX3J1bGVzXG5cbiAgJ1N3aXRjaHknOlxuICAgIG9tZWdhUHJlZml4OiAnW1N3aXRjaHlPbWVnYSBDb25kaXRpb25zJ1xuICAgIHNwZWNpYWxMaW5lU3RhcnQ6IFwiWzsjQCFcIlxuXG4gICAgZGV0ZWN0OiAodGV4dCkgLT5cbiAgICAgIGlmIHN0clN0YXJ0c1dpdGgodGV4dCwgZXhwb3J0c1snU3dpdGNoeSddLm9tZWdhUHJlZml4KVxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgcmV0dXJuXG5cbiAgICBwYXJzZTogKHRleHQsIG1hdGNoUHJvZmlsZU5hbWUsIGRlZmF1bHRQcm9maWxlTmFtZSkgLT5cbiAgICAgIHN3aXRjaHkgPSBleHBvcnRzWydTd2l0Y2h5J11cbiAgICAgIHBhcnNlciA9IHN3aXRjaHkuZ2V0UGFyc2VyKHRleHQpXG4gICAgICByZXR1cm4gc3dpdGNoeVtwYXJzZXJdKHRleHQsIG1hdGNoUHJvZmlsZU5hbWUsIGRlZmF1bHRQcm9maWxlTmFtZSlcblxuICAgIGRpcmVjdFJlZmVyZW5jZVNldDogKHtydWxlTGlzdCwgbWF0Y2hQcm9maWxlTmFtZSwgZGVmYXVsdFByb2ZpbGVOYW1lfSkgLT5cbiAgICAgIHRleHQgPSBydWxlTGlzdC50cmltKClcbiAgICAgIHN3aXRjaHkgPSBleHBvcnRzWydTd2l0Y2h5J11cbiAgICAgIHBhcnNlciA9IHN3aXRjaHkuZ2V0UGFyc2VyKHRleHQpXG4gICAgICByZXR1cm4gdW5sZXNzIHBhcnNlciA9PSAncGFyc2VPbWVnYSdcbiAgICAgIHJldHVybiB1bmxlc3MgLyhefFxcbilAd2l0aFxccytyZXN1bHRzPyhcXHJ8XFxufCQpL2kudGVzdCh0ZXh0KVxuICAgICAgcmVmcyA9IHt9XG4gICAgICBmb3IgbGluZSBpbiB0ZXh0LnNwbGl0KC9cXG58XFxyLylcbiAgICAgICAgbGluZSA9IGxpbmUudHJpbSgpXG4gICAgICAgIGlmIHN3aXRjaHkuc3BlY2lhbExpbmVTdGFydC5pbmRleE9mKGxpbmVbMF0pIDwgMFxuICAgICAgICAgIGlTcGFjZSA9IGxpbmUubGFzdEluZGV4T2YoJyArJylcbiAgICAgICAgICBpZiBpU3BhY2UgPCAwXG4gICAgICAgICAgICBwcm9maWxlID0gZGVmYXVsdFByb2ZpbGVOYW1lIHx8ICdkaXJlY3QnXG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgcHJvZmlsZSA9IGxpbmUuc3Vic3RyKGlTcGFjZSArIDIpLnRyaW0oKVxuICAgICAgICAgIHJlZnNbJysnICsgcHJvZmlsZV0gPSBwcm9maWxlXG4gICAgICByZWZzXG5cbiAgICAjIEZvciB0aGUgb21lZ2EgcnVsZSBsaXN0IGZvcm1hdCwgcGxlYXNlIHNlZSB0aGUgZm9sbG93aW5nIHdpa2kgcGFnZTpcbiAgICAjIGh0dHBzOi8vZ2l0aHViLmNvbS9GZWxpc0NhdHVzL1N3aXRjaHlPbWVnYS93aWtpL1N3aXRjaHlPbWVnYS1jb25kaXRpb25zLWZvcm1hdFxuICAgIGNvbXBvc2U6ICh7cnVsZXMsIGRlZmF1bHRQcm9maWxlTmFtZX0sIHt3aXRoUmVzdWx0LCB1c2VFeGNsdXNpdmV9ID0ge30pIC0+XG4gICAgICBlb2wgPSAnXFxyXFxuJ1xuICAgICAgcnVsZUxpc3QgPSAnW1N3aXRjaHlPbWVnYSBDb25kaXRpb25zXScgKyBlb2xcbiAgICAgIHVzZUV4Y2x1c2l2ZSA/PSBub3Qgd2l0aFJlc3VsdFxuICAgICAgaWYgd2l0aFJlc3VsdFxuICAgICAgICBydWxlTGlzdCArPSAnQHdpdGggcmVzdWx0JyArIGVvbCArIGVvbFxuICAgICAgZWxzZVxuICAgICAgICBydWxlTGlzdCArPSBlb2xcbiAgICAgIHNwZWNpYWxMaW5lU3RhcnQgPSBleHBvcnRzWydTd2l0Y2h5J10uc3BlY2lhbExpbmVTdGFydCArICcrJ1xuICAgICAgZm9yIHJ1bGUgaW4gcnVsZXNcbiAgICAgICAgbGluZSA9IENvbmRpdGlvbnMuc3RyKHJ1bGUuY29uZGl0aW9uKVxuICAgICAgICBpZiB1c2VFeGNsdXNpdmUgYW5kIHJ1bGUucHJvZmlsZU5hbWUgPT0gZGVmYXVsdFByb2ZpbGVOYW1lXG4gICAgICAgICAgbGluZSA9ICchJyArIGxpbmVcbiAgICAgICAgZWxzZVxuICAgICAgICAgIGlmIHNwZWNpYWxMaW5lU3RhcnQuaW5kZXhPZihsaW5lWzBdKSA+PSAwXG4gICAgICAgICAgICBsaW5lID0gJzogJyArIGxpbmVcbiAgICAgICAgICBpZiB3aXRoUmVzdWx0XG4gICAgICAgICAgICAjIFRPRE8oY2F0dXMpOiBXaGF0IGlmIHJ1bGUucHJvZmlsZU5hbWUgY29udGFpbnMgJyArJyBvciBuZXcgbGluZXM/XG4gICAgICAgICAgICBsaW5lICs9ICcgKycgKyBydWxlLnByb2ZpbGVOYW1lXG4gICAgICAgIHJ1bGVMaXN0ICs9IGxpbmUgKyBlb2xcbiAgICAgIGlmIHdpdGhSZXN1bHRcbiAgICAgICAgIyBUT0RPKGNhdHVzKTogQWxzbyBzcGVjaWFsIGNoYXJzIGFuZCBzZXF1ZW5jZXMgaW4gZGVmYXVsdFByb2ZpbGVOYW1lLlxuICAgICAgICBydWxlTGlzdCArPSBlb2wgKyAnKiArJyArIGRlZmF1bHRQcm9maWxlTmFtZSArIGVvbFxuICAgICAgcmV0dXJuIHJ1bGVMaXN0XG5cbiAgICBnZXRQYXJzZXI6ICh0ZXh0KSAtPlxuICAgICAgc3dpdGNoeSA9IGV4cG9ydHNbJ1N3aXRjaHknXVxuICAgICAgcGFyc2VyID0gJ3BhcnNlT21lZ2EnXG4gICAgICBpZiBub3Qgc3RyU3RhcnRzV2l0aCh0ZXh0LCBzd2l0Y2h5Lm9tZWdhUHJlZml4KVxuICAgICAgICBpZiB0ZXh0WzBdID09ICcjJyBvciB0ZXh0LmluZGV4T2YoJ1xcbiMnKSA+PSAwXG4gICAgICAgICAgcGFyc2VyID0gJ3BhcnNlTGVnYWN5J1xuICAgICAgcmV0dXJuIHBhcnNlclxuXG4gICAgY29uZGl0aW9uRnJvbUxlZ2FjeVdpbGRjYXJkOiAocGF0dGVybikgLT5cbiAgICAgIGlmIHBhdHRlcm5bMF0gPT0gJ0AnXG4gICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnN1YnN0cmluZygxKVxuICAgICAgZWxzZVxuICAgICAgICBpZiBwYXR0ZXJuLmluZGV4T2YoJzovLycpIDw9IDAgYW5kIHBhdHRlcm5bMF0gIT0gJyonXG4gICAgICAgICAgcGF0dGVybiA9ICcqJyArIHBhdHRlcm5cbiAgICAgICAgaWYgcGF0dGVybltwYXR0ZXJuLmxlbmd0aCAtIDFdICE9ICcqJ1xuICAgICAgICAgIHBhdHRlcm4gKz0gJyonXG5cbiAgICAgIGhvc3QgPSBDb25kaXRpb25zLnVybFdpbGRjYXJkMkhvc3RXaWxkY2FyZChwYXR0ZXJuKVxuICAgICAgaWYgaG9zdFxuICAgICAgICBjb25kaXRpb25UeXBlOiAnSG9zdFdpbGRjYXJkQ29uZGl0aW9uJ1xuICAgICAgICBwYXR0ZXJuOiBob3N0XG4gICAgICBlbHNlXG4gICAgICAgIGNvbmRpdGlvblR5cGU6ICdVcmxXaWxkY2FyZENvbmRpdGlvbidcbiAgICAgICAgcGF0dGVybjogcGF0dGVyblxuXG4gICAgcGFyc2VMZWdhY3k6ICh0ZXh0LCBtYXRjaFByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUpIC0+XG4gICAgICBub3JtYWxfcnVsZXMgPSBbXVxuICAgICAgZXhjbHVzaXZlX3J1bGVzID0gW11cbiAgICAgIGJlZ2luID0gZmFsc2VcbiAgICAgIHNlY3Rpb24gPSAnV0lMRENBUkQnXG4gICAgICBmb3IgbGluZSBpbiB0ZXh0LnNwbGl0KC9cXG58XFxyLylcbiAgICAgICAgbGluZSA9IGxpbmUudHJpbSgpXG4gICAgICAgIGNvbnRpbnVlIGlmIGxpbmUubGVuZ3RoID09IDAgfHwgbGluZVswXSA9PSAnOydcbiAgICAgICAgaWYgbm90IGJlZ2luXG4gICAgICAgICAgaWYgbGluZS50b1VwcGVyQ2FzZSgpID09ICcjQkVHSU4nXG4gICAgICAgICAgICBiZWdpbiA9IHRydWVcbiAgICAgICAgICBjb250aW51ZVxuICAgICAgICBpZiBsaW5lLnRvVXBwZXJDYXNlKCkgPT0gJyNFTkQnXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgaWYgbGluZVswXSA9PSAnWycgYW5kIGxpbmVbbGluZS5sZW5ndGggLSAxXSA9PSAnXSdcbiAgICAgICAgICBzZWN0aW9uID0gbGluZS5zdWJzdHJpbmcoMSwgbGluZS5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpXG4gICAgICAgICAgY29udGludWVcbiAgICAgICAgc291cmNlID0gbGluZVxuICAgICAgICBwcm9maWxlID0gbWF0Y2hQcm9maWxlTmFtZVxuICAgICAgICBsaXN0ID0gbm9ybWFsX3J1bGVzXG4gICAgICAgIGlmIGxpbmVbMF0gPT0gJyEnXG4gICAgICAgICAgcHJvZmlsZSA9IGRlZmF1bHRQcm9maWxlTmFtZVxuICAgICAgICAgIGxpc3QgPSBleGNsdXNpdmVfcnVsZXNcbiAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoMSlcbiAgICAgICAgY29uZCA9IHN3aXRjaCBzZWN0aW9uXG4gICAgICAgICAgd2hlbiAnV0lMRENBUkQnXG4gICAgICAgICAgICBleHBvcnRzWydTd2l0Y2h5J10uY29uZGl0aW9uRnJvbUxlZ2FjeVdpbGRjYXJkKGxpbmUpXG4gICAgICAgICAgd2hlbiAnUkVHRVhQJ1xuICAgICAgICAgICAgY29uZGl0aW9uVHlwZTogJ1VybFJlZ2V4Q29uZGl0aW9uJ1xuICAgICAgICAgICAgcGF0dGVybjogbGluZVxuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIG51bGxcbiAgICAgICAgaWYgY29uZD9cbiAgICAgICAgICBsaXN0LnB1c2goe2NvbmRpdGlvbjogY29uZCwgcHJvZmlsZU5hbWU6IHByb2ZpbGUsIHNvdXJjZTogc291cmNlfSlcbiAgICAgICMgRXhjbHVzaXZlIHJ1bGVzIGhhdmUgaGlnaGVyIHByaW9yaXR5LCBzbyB0aGV5IGNvbWUgZmlyc3QuXG4gICAgICByZXR1cm4gZXhjbHVzaXZlX3J1bGVzLmNvbmNhdCBub3JtYWxfcnVsZXNcblxuICAgIHBhcnNlT21lZ2E6ICh0ZXh0LCBtYXRjaFByb2ZpbGVOYW1lLCBkZWZhdWx0UHJvZmlsZU5hbWUsIGFyZ3MgPSB7fSkgLT5cbiAgICAgIHtzdHJpY3R9ID0gYXJnc1xuICAgICAgaWYgc3RyaWN0XG4gICAgICAgIGVycm9yID0gKGZpZWxkcykgLT5cbiAgICAgICAgICBlcnIgPSBuZXcgRXJyb3IoZmllbGRzLm1lc3NhZ2UpXG4gICAgICAgICAgZm9yIG93biBrZXksIHZhbHVlIG9mIGZpZWxkc1xuICAgICAgICAgICAgZXJyW2tleV0gPSB2YWx1ZVxuICAgICAgICAgIHRocm93IGVyclxuICAgICAgaW5jbHVkZVNvdXJjZSA9IGFyZ3Muc291cmNlID8gdHJ1ZVxuICAgICAgcnVsZXMgPSBbXVxuICAgICAgcnVsZXNXaXRoRGVmYXVsdFByb2ZpbGUgPSBbXVxuICAgICAgd2l0aFJlc3VsdCA9IGZhbHNlXG4gICAgICBleGNsdXNpdmVQcm9maWxlID0gbnVsbFxuICAgICAgbG5vID0gMFxuICAgICAgZm9yIGxpbmUgaW4gdGV4dC5zcGxpdCgvXFxufFxcci8pXG4gICAgICAgIGxubysrXG4gICAgICAgIGxpbmUgPSBsaW5lLnRyaW0oKVxuICAgICAgICBjb250aW51ZSBpZiBsaW5lLmxlbmd0aCA9PSAwXG4gICAgICAgIHN3aXRjaCBsaW5lWzBdXG4gICAgICAgICAgd2hlbiAnWycgIyBIZWFkZXIgbGluZTogSWdub3JlLlxuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICB3aGVuICc7JyAjIENvbW1lbnQgbGluZTogSWdub3JlLlxuICAgICAgICAgICAgY29udGludWVcbiAgICAgICAgICB3aGVuICdAJyAjIERpcmVjdGl2ZSBsaW5lOlxuICAgICAgICAgICAgaVNwYWNlID0gbGluZS5pbmRleE9mKCcgJylcbiAgICAgICAgICAgIGlTcGFjZSA9IGxpbmUubGVuZ3RoIGlmIGlTcGFjZSA8IDBcbiAgICAgICAgICAgIGRpcmVjdGl2ZSA9IGxpbmUuc3Vic3RyKDEsIGlTcGFjZSAtIDEpXG4gICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHIoaVNwYWNlICsgMSkudHJpbSgpXG4gICAgICAgICAgICBzd2l0Y2ggZGlyZWN0aXZlLnRvVXBwZXJDYXNlKClcbiAgICAgICAgICAgICAgd2hlbiAnV0lUSCdcbiAgICAgICAgICAgICAgICBmZWF0dXJlID0gbGluZS50b1VwcGVyQ2FzZSgpXG4gICAgICAgICAgICAgICAgaWYgZmVhdHVyZSA9PSAnUkVTVUxUJyBvciBmZWF0dXJlID09ICdSRVNVTFRTJ1xuICAgICAgICAgICAgICAgICAgd2l0aFJlc3VsdCA9IHRydWVcbiAgICAgICAgICAgIGNvbnRpbnVlXG5cbiAgICAgICAgc291cmNlID0gbnVsbFxuICAgICAgICBleGNsdXNpdmVQcm9maWxlID0gbnVsbCBpZiBzdHJpY3RcbiAgICAgICAgaWYgbGluZVswXSA9PSAnISdcbiAgICAgICAgICBwcm9maWxlID0gaWYgd2l0aFJlc3VsdCB0aGVuIG51bGwgZWxzZSBkZWZhdWx0UHJvZmlsZU5hbWVcbiAgICAgICAgICBzb3VyY2UgPSBsaW5lXG4gICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyKDEpXG4gICAgICAgIGVsc2UgaWYgd2l0aFJlc3VsdFxuICAgICAgICAgIGlTcGFjZSA9IGxpbmUubGFzdEluZGV4T2YoJyArJylcbiAgICAgICAgICBpZiBpU3BhY2UgPCAwXG4gICAgICAgICAgICBlcnJvcj8oe1xuICAgICAgICAgICAgICBtZXNzYWdlOiBcIk1pc3NpbmcgcmVzdWx0IHByb2ZpbGUgbmFtZTogXCIgKyBsaW5lXG4gICAgICAgICAgICAgIHJlYXNvbjogJ21pc3NpbmdSZXN1bHRQcm9maWxlJ1xuICAgICAgICAgICAgICBzb3VyY2U6IGxpbmVcbiAgICAgICAgICAgICAgc291cmNlTGluZU5vOiBsbm9cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBjb250aW51ZVxuICAgICAgICAgIHByb2ZpbGUgPSBsaW5lLnN1YnN0cihpU3BhY2UgKyAyKS50cmltKClcbiAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHIoMCwgaVNwYWNlKS50cmltKClcbiAgICAgICAgICBleGNsdXNpdmVQcm9maWxlID0gcHJvZmlsZSBpZiBsaW5lID09ICcqJ1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcHJvZmlsZSA9IG1hdGNoUHJvZmlsZU5hbWVcblxuICAgICAgICBjb25kID0gQ29uZGl0aW9ucy5mcm9tU3RyKGxpbmUpXG4gICAgICAgIGlmIG5vdCBjb25kXG4gICAgICAgICAgZXJyb3I/KHtcbiAgICAgICAgICAgIG1lc3NhZ2U6IFwiSW52YWxpZCBydWxlOiBcIiArIGxpbmVcbiAgICAgICAgICAgIHJlYXNvbjogJ2ludmFsaWRSdWxlJ1xuICAgICAgICAgICAgc291cmNlOiBzb3VyY2UgPyBsaW5lXG4gICAgICAgICAgICBzb3VyY2VMaW5lTm86IGxub1xuICAgICAgICAgIH0pXG4gICAgICAgICAgY29udGludWVcblxuICAgICAgICBydWxlID1cbiAgICAgICAgICBjb25kaXRpb246IGNvbmRcbiAgICAgICAgICBwcm9maWxlTmFtZTogcHJvZmlsZVxuICAgICAgICAgIHNvdXJjZTogaWYgaW5jbHVkZVNvdXJjZSB0aGVuIHNvdXJjZSA/IGxpbmVcbiAgICAgICAgcnVsZXMucHVzaChydWxlKVxuICAgICAgICBpZiBub3QgcHJvZmlsZVxuICAgICAgICAgIHJ1bGVzV2l0aERlZmF1bHRQcm9maWxlLnB1c2gocnVsZSlcblxuICAgICAgaWYgd2l0aFJlc3VsdFxuICAgICAgICBpZiBub3QgZXhjbHVzaXZlUHJvZmlsZVxuICAgICAgICAgIGlmIHN0cmljdFxuICAgICAgICAgICAgZXJyb3I/KHtcbiAgICAgICAgICAgICAgbWVzc2FnZTogXCJNaXNzaW5nIGRlZmF1bHQgcnVsZSB3aXRoIGNhdGNoLWFsbCAnKicgY29uZGl0aW9uXCJcbiAgICAgICAgICAgICAgcmVhc29uOiAnbm9EZWZhdWx0UnVsZSdcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgZXhjbHVzaXZlUHJvZmlsZSA9IGRlZmF1bHRQcm9maWxlTmFtZSB8fCAnZGlyZWN0J1xuICAgICAgICBmb3IgcnVsZSBpbiBydWxlc1dpdGhEZWZhdWx0UHJvZmlsZVxuICAgICAgICAgIHJ1bGUucHJvZmlsZU5hbWUgPSBleGNsdXNpdmVQcm9maWxlXG4gICAgICByZXR1cm4gcnVsZXNcbiIsIm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9XG4gIHJlZ0V4cE1ldGFDaGFyczogZG8gLT5cbiAgICBjaGFycyA9ICcnJ1xcXFxbXFxeJC58PyorKCl7fS8nJydcbiAgICBzZXQgPSB7fVxuICAgIGZvciBpIGluIFswLi4uY2hhcnMubGVuZ3RoXVxuICAgICAgc2V0W2NoYXJzLmNoYXJDb2RlQXQoaSldID0gdHJ1ZVxuICAgIHNldFxuICBlc2NhcGVTbGFzaDogKHBhdHRlcm4pIC0+XG4gICAgY2hhckNvZGVTbGFzaCA9IDQ3ICMgL1xuICAgIGNoYXJDb2RlQmFja1NsYXNoID0gOTIgIyBcXFxuICAgIGVzY2FwZWQgPSBmYWxzZVxuICAgIHN0YXJ0ID0gMFxuICAgIHJlc3VsdCA9ICcnXG4gICAgZm9yIGkgaW4gWzAuLi5wYXR0ZXJuLmxlbmd0aF1cbiAgICAgIGNvZGUgPSBwYXR0ZXJuLmNoYXJDb2RlQXQoaSlcbiAgICAgIGlmIGNvZGUgPT0gY2hhckNvZGVTbGFzaCBhbmQgbm90IGVzY2FwZWRcbiAgICAgICAgcmVzdWx0ICs9IHBhdHRlcm4uc3Vic3RyaW5nIHN0YXJ0LCBpXG4gICAgICAgIHJlc3VsdCArPSAnXFxcXCdcbiAgICAgICAgc3RhcnQgPSBpXG4gICAgICBlc2NhcGVkID0gKGNvZGUgPT0gY2hhckNvZGVCYWNrU2xhc2ggYW5kIG5vdCBlc2NhcGVkKVxuICAgIHJlc3VsdCArPSBwYXR0ZXJuLnN1YnN0ciBzdGFydFxuICBzaEV4cDJSZWdFeHA6IChwYXR0ZXJuLCBvcHRpb25zKSAtPlxuICAgIHRyaW1Bc3RlcmlzayA9IG9wdGlvbnM/LnRyaW1Bc3RlcmlzayB8fCBmYWxzZVxuICAgIHN0YXJ0ID0gMFxuICAgIGVuZCA9IHBhdHRlcm4ubGVuZ3RoXG4gICAgY2hhckNvZGVBc3RlcmlzayA9IDQyICMgJyonXG4gICAgY2hhckNvZGVRdWVzdGlvbiA9IDYzICMgJz8nXG4gICAgaWYgdHJpbUFzdGVyaXNrXG4gICAgICB3aGlsZSBzdGFydCA8IGVuZCAmJiBwYXR0ZXJuLmNoYXJDb2RlQXQoc3RhcnQpID09IGNoYXJDb2RlQXN0ZXJpc2tcbiAgICAgICAgc3RhcnQrK1xuICAgICAgd2hpbGUgc3RhcnQgPCBlbmQgJiYgcGF0dGVybi5jaGFyQ29kZUF0KGVuZCAtIDEpID09IGNoYXJDb2RlQXN0ZXJpc2tcbiAgICAgICAgZW5kLS1cbiAgICAgIGlmIGVuZCAtIHN0YXJ0ID09IDEgJiYgcGF0dGVybi5jaGFyQ29kZUF0KHN0YXJ0KSA9PSBjaGFyQ29kZUFzdGVyaXNrXG4gICAgICAgIHJldHVybiAnJ1xuICAgIHJlZ2V4ID0gJydcbiAgICBpZiBzdGFydCA9PSAwXG4gICAgICByZWdleCArPSAnXidcbiAgICBmb3IgaSBpbiBbc3RhcnQuLi5lbmRdXG4gICAgICBjb2RlID0gcGF0dGVybi5jaGFyQ29kZUF0KGkpXG4gICAgICBzd2l0Y2ggY29kZVxuICAgICAgICB3aGVuIGNoYXJDb2RlQXN0ZXJpc2sgdGhlbiByZWdleCArPSAnLionXG4gICAgICAgIHdoZW4gY2hhckNvZGVRdWVzdGlvbiB0aGVuIHJlZ2V4ICs9ICcuJ1xuICAgICAgICBlbHNlXG4gICAgICAgICAgaWYgZXhwb3J0cy5yZWdFeHBNZXRhQ2hhcnNbY29kZV0gPj0gMFxuICAgICAgICAgICAgcmVnZXggKz0gJ1xcXFwnXG4gICAgICAgICAgcmVnZXggKz0gcGF0dGVybltpXVxuXG4gICAgaWYgZW5kID09IHBhdHRlcm4ubGVuZ3RoXG4gICAgICByZWdleCArPSAnJCdcblxuICAgIHJldHVybiByZWdleFxuIiwiUmV2aXNpb24gPVxuICBmcm9tVGltZTogKHRpbWUpIC0+XG4gICAgdGltZSA9IGlmIHRpbWUgdGhlbiBuZXcgRGF0ZSh0aW1lKSBlbHNlIG5ldyBEYXRlKClcbiAgICByZXR1cm4gdGltZS5nZXRUaW1lKCkudG9TdHJpbmcoMTYpXG4gIGNvbXBhcmU6IChhLCBiKSAtPlxuICAgIHJldHVybiAwIGlmIG5vdCBhIGFuZCBub3QgYlxuICAgIHJldHVybiAtMSBpZiBub3QgYVxuICAgIHJldHVybiAxIGlmIG5vdCBiXG4gICAgcmV0dXJuIDEgaWYgYS5sZW5ndGggPiBiLmxlbmd0aFxuICAgIHJldHVybiAtMSBpZiBhLmxlbmd0aCA8IGIubGVuZ3RoXG4gICAgcmV0dXJuIDEgaWYgYSA+IGJcbiAgICByZXR1cm4gLTEgaWYgYSA8IGJcbiAgICByZXR1cm4gMFxuXG5leHBvcnRzLlJldmlzaW9uID0gUmV2aXNpb25cblxuY2xhc3MgQXR0YWNoZWRDYWNoZVxuICBjb25zdHJ1Y3RvcjogKG9wdF9wcm9wLCBAdGFnKSAtPlxuICAgIEBwcm9wID0gb3B0X3Byb3BcbiAgICBpZiB0eXBlb2YgQHRhZyA9PSAndW5kZWZpbmVkJ1xuICAgICAgQHRhZyA9IG9wdF9wcm9wXG4gICAgICBAcHJvcCA9ICdfY2FjaGUnXG4gIGdldDogKG9iaiwgb3RoZXJ3aXNlKSAtPlxuICAgIHRhZyA9IEB0YWcob2JqKVxuICAgIGNhY2hlID0gQF9nZXRDYWNoZShvYmopXG4gICAgaWYgY2FjaGU/IGFuZCBjYWNoZS50YWcgPT0gdGFnXG4gICAgICByZXR1cm4gY2FjaGUudmFsdWVcbiAgICB2YWx1ZSA9IGlmIHR5cGVvZiBvdGhlcndpc2UgPT0gJ2Z1bmN0aW9uJyB0aGVuIG90aGVyd2lzZSgpIGVsc2Ugb3RoZXJ3aXNlXG4gICAgQF9zZXRDYWNoZShvYmosIHt0YWc6IHRhZywgdmFsdWU6IHZhbHVlfSlcbiAgICByZXR1cm4gdmFsdWVcbiAgZHJvcDogKG9iaikgLT5cbiAgICBpZiBvYmpbQHByb3BdP1xuICAgICAgb2JqW0Bwcm9wXSA9IHVuZGVmaW5lZFxuICBfZ2V0Q2FjaGU6IChvYmopIC0+IG9ialtAcHJvcF1cbiAgX3NldENhY2hlOiAob2JqLCB2YWx1ZSkgLT5cbiAgICBpZiBub3QgT2JqZWN0OjpoYXNPd25Qcm9wZXJ0eS5jYWxsIG9iaiwgQHByb3BcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSBvYmosIEBwcm9wLCB3cml0YWJsZTogdHJ1ZVxuICAgIG9ialtAcHJvcF0gPSB2YWx1ZVxuXG5leHBvcnRzLkF0dGFjaGVkQ2FjaGUgPSBBdHRhY2hlZENhY2hlXG5cbnRsZCA9IHJlcXVpcmUoJ3RsZGpzJylcblxuZXhwb3J0cy5pc0lwID0gKGRvbWFpbikgLT5cbiAgcmV0dXJuIHRydWUgaWYgZG9tYWluLmluZGV4T2YoJzonKSA+IDAgIyBJUHY2XG4gIGxhc3RDaGFyQ29kZSA9IGRvbWFpbi5jaGFyQ29kZUF0KGRvbWFpbi5sZW5ndGggLSAxKVxuICByZXR1cm4gdHJ1ZSBpZiA0OCA8PSBsYXN0Q2hhckNvZGUgPD0gNTcgIyBJUCBhZGRyZXNzIGVuZGluZyB3aXRoIG51bWJlci5cbiAgcmV0dXJuIGZhbHNlXG5cbmV4cG9ydHMuZ2V0QmFzZURvbWFpbiA9IChkb21haW4pIC0+XG4gIHJldHVybiBkb21haW4gaWYgZXhwb3J0cy5pc0lwKGRvbWFpbilcbiAgcmV0dXJuIHRsZC5nZXREb21haW4oZG9tYWluKSA/IGRvbWFpblxuXG5leHBvcnRzLndpbGRjYXJkRm9yRG9tYWluID0gKGRvbWFpbikgLT5cbiAgcmV0dXJuIGRvbWFpbiBpZiBleHBvcnRzLmlzSXAoZG9tYWluKVxuICByZXR1cm4gJyouJyArIGV4cG9ydHMuZ2V0QmFzZURvbWFpbihkb21haW4pXG5cblVybCA9IHJlcXVpcmUoJ3VybCcpXG5leHBvcnRzLndpbGRjYXJkRm9yVXJsID0gKHVybCkgLT5cbiAgZG9tYWluID0gVXJsLnBhcnNlKHVybCkuaG9zdG5hbWVcbiAgcmV0dXJuIGV4cG9ydHMud2lsZGNhcmRGb3JEb21haW4oZG9tYWluKVxuIl19
