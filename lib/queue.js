'use strict'

const kue = require('kue')
const fs = require('fs')
const config = require('../config')

let j = require('request').jar()
let request = require('request').defaults({jar:j})

const md5File = require('md5-file')
const nodePath = require('path')
let queue = kue.createQueue()

const hosts = config.hosts



queue.process('download', function(job, done) {
  let data = job.data
  alert('download');
  done()
})
exports.queue = queue;
exports.request = request;