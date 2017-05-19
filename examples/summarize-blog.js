'use strict';

var fs = require('fs');

var path = require('path');
var summarize = require('../index');

var text = fs.readFileSync(path.resolve(__dirname, '..', 'data',
  'wiki-hp.txt'), 'utf-8');

var summary = summarize(text);
console.log(summary);
console.log('FULL TEXT LENGTH: %s char', text.length);
console.log('SUMMARY LENGTH: %s char', summary.length);
var sigDig = 2;
var compression = Math.round(
  (text.length - summary.length) / text.length * Math.pow(10, sigDig + 2)
) / Math.pow(10, sigDig);
console.log('Compression: %d%', compression);
