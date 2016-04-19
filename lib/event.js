'use strict'

const Promise = require('bluebird')
const md5File = require('md5-file')

const eventLog = (event, path) => {
  console.log(event, path)
}

const addDirHandler = function (path) {}

const unlinkDirHandler = function (path) {}

const addHandler = function (path) {
  const hash = md5File(path)
  console.log(hash)
}

const unlinkHandler = function (path) {}

const changeHandler = function (path) {}

const eventHandler = {
  'addDir': addDirHandler,
  'unlinkDir': unlinkDirHandler,
  'add': addHandler,
  'unlink': unlinkHandler,
  'change': changeHandler
}

exports.eventHandler = eventHandler
exports.eventLog = eventLog
