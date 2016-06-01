'use strict'

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers
const _ = require('lodash')

const env = process.env.NODE_ENV || 'development';

const config = {
  timezone: process.env.SERVER_TIMEZONE || 'UTC',
  box: {
    path: process.env.BOX_PATH || './Dripbox'
  }
}

// Load config file
try {
  _.merge(config, require('./development'))
} catch (err) {
  alert(err.stack)
}

module.exports = config
// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
