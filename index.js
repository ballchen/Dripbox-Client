'use strict'

const watcher = require('./watcher')
const config = require('./config')

watcher.on('ready', () => console.log(`Watching ${config.box.path}`))