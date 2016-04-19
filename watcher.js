'use strict'

const fs = require('fs')
const Promise = require('bluebird')
const chokidar = require('chokidar')
const config = require('./config')
const eventHandler = require('./lib/event').eventHandler
const eventLog = require('./lib/event').eventLog

const watcher = chokidar.watch(config.box.path, {ignored: config.box.ignored})

watcher.on('all', Promise.coroutine(function *(event, path) {
  eventLog(event, path)
  try {
    eventHandler[event](path)
  } catch(e) {
    console.log(e)
  }
}))

module.exports = watcher
