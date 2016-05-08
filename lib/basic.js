'use strict'

const mkdirp = require('mkdirp')
const config = require('../config')

exports.createBox = function (cb) {
  mkdirp(config.box.path, function (err) {
    if (err) cb(err)
    else cb(null, 'success')
  })
}
