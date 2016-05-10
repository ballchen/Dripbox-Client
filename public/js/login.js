'use strict'

var Promise = require('bluebird')
var getMac = Promise.promisifyAll(require('getmac'))
var moment = require('moment')
var gui = require('nw.gui')
var mkdirp = require('mkdirp')
var config = require('./config')
const exec = require('child_process').exec

// var mkBoxDir = require('../lib/basic').mkdir
var hosts = {
  metadata: 'http://localhost:3001/',
  data: 'http://localhost:3002/'
}

var app = angular.module('dpApp', ['ngFileUpload'])
app.controller('loginCtrl', ['$scope', '$http', '$rootScope', 'Upload', function ($scope, $http, $rootScope, Upload) {
  $scope.login = {}
  $scope.message = ''
  $scope.macAddress = null
  $scope.dataUploading = false

  var getFiles = function () {
    $http({
      method: 'GET',
      url: hosts.metadata + 'api/file'
    }).success(function (data) {
      $scope.files = data
    }).error(function (data) {})
  }

  // data engine -- start
  const EventEmitter = require('events')
  const util = require('util')

  function MyEmitter () {
    EventEmitter.call(this)
  }
  util.inherits(MyEmitter, EventEmitter)

  const dataEngine = new MyEmitter()
  dataEngine.on('upload', function (detail, path) {
    $scope.dataUploading = true

    const fs = require('fs')
    const request = require('request')

    var formData = {
      detail: JSON.stringify(detail),
      file: fs.createReadStream(path)
    }

    request.post({url: hosts.data + 'api/upload', formData: formData}, function optionalCallback (err, httpResponse, body) {
      if (err) {
        return alert('upload failed:', JSON.stringify(err))
      }
      dataEngine.emit('upload-end', body)
    })
  })

  dataEngine.on('upload-end', function(body) {
    $scope.dataUploading = false
    getFiles()
  })

  // data engine -- end

  var checkDevice = function (MAC) {
    // if new, make the dripbox dir and get the user's checksum
    // if old, check checksum
    $http({
      method: 'POST',
      url: hosts.metadata + 'api/me/check_device',
      data: {
        macAddress: MAC
      }
    }).success(function (data) {
      if (data.isNewDevice) {
        $scope.macAddress = ''
      } else {
        $scope.macAddress = ''
      }

      mkdirp(config.box.path, function (err) {
        const fs = require('fs')
        const Promise = require('bluebird')
        const chokidar = require('chokidar')
        const md5File = require('md5-file')
        const watcher = chokidar.watch(config.box.path, {ignored: config.box.ignored})

        const eventLog = (event, path) => {
          console.log(event, path)
        }

        const addDirHandler = function (path) {}

        const unlinkDirHandler = function (path) {}

        const addHandler = function (path) {
          const hash = md5File(path)
          const nodePath = require('path')

          $http({
            method: 'POST',
            url: hosts.metadata + 'api/file',
            data: {
              name: nodePath.basename(path),
              checkSum: hash
            }
          }).success(function (data) {
            dataEngine.emit('upload', data, path)
          // alert(JSON.stringify(data))
          }).error(function (data) {
            // alert(data.message)
          })

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

        watcher.on('all', Promise.coroutine(function *(event, path) {
          eventLog(event, path)
          try {
            eventHandler[event](path)
          } catch(e) {
            console.log(e)
          }
        }))

      })
    })
  }



  var setEmptyCheckSum = function () {
    $http({
      method: 'POST',
      url: hosts.metadata + 'me/checksum',
      data: {
        checkSum: ''
      }
    }).success(function (data) {}).error(function (data) {})
  }

  $scope.pressLoginButton = function () {
    $http({
      method: 'POST',
      url: hosts.metadata + 'api/login',
      data: $scope.login
    }).success(function (data) {
      $scope.message = 'success'
      $rootScope.user = {
        email: $scope.login.email
      }
      $rootScope.isLogin = true
      getMac.getMac(function (err, macAddress) {
        if (err)  throw err
        checkDevice(macAddress)
        getFiles()
      })
    }).error(function (data) {
      $scope.message = data.message
    })
  }

  $scope.pressLogoutButton = function () {
    $http({
      method: 'POST',
      url: 'http://localhost:3001/api/logout'
    }).success(function (data) {
      $scope.message = ''
      $rootScope.user = {}
      $rootScope.isLogin = false
    }).error(function (data) {
      $scope.message = data.message
    })
  }
}])
