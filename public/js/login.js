'use strict'

var Promise = require('bluebird')
var getMac = Promise.promisifyAll(require('getmac'))
var moment = require('moment')
var gui = require('nw.gui')
var mkdirp = require('mkdirp')
var config = require('./config')
var _ = require('lodash')
const exec = require('child_process').exec
const nodePath = require('path')
const fs = require('fs')

// var mkBoxDir = require('../lib/basic').mkdir
var hosts = {
  metadata: 'http://localhost:3001/',
  data: 'http://localhost:3002/'
}

var app = angular.module('dpApp', ['ngFileUpload'])
app.controller('loginCtrl', ['$scope', '$http', '$rootScope', 'Upload', function ($scope, $http, $rootScope, Upload) {
  $scope.login = {
    email: 'kerkerball@gmail.com',
    password: '123456'
  }
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
  
  var makeLocalTree = function(root, hashes, node) {
    alert(node.checkSum);
    alert(hashes.hash);
    // node.checkSum = hashes.hash;
    
    _.each(hashes.files, function(f, key) {
      let path = root + '/' + key;
      let stats = fs.statSync(path);

      if (stats.isDirectory()) {
        let search = _.findIndex(node, {name: key, type: 'folder', checkSum: f});
        if(search >= 0) {
          node.node[search].checkSum = f.hash
        }
        else {
          node.node.push({
            //expect flat
            name: key, type: 'folder', checkSum: f.hash, node: []
          })
          alert(JSON.stringify(hashes))
          node.node[node.node.length-1] = (makeLocalTree(path, hashes.files[key], node.node[node.node.length-1]))
        }
      }
      if (stats.isFile()) {
        let search = _.findIndex(node, {name: key, type: 'file', checkSum: f});
        if(search >= 0) {
          
          node.node[search].checkSum = f
        }
        else {
          alert(JSON.stringify(node))
          node.node.push({
            //expect flat
            name: key, type: 'file', checkSum: f
          })
        }
      }   
    })

    return node;
  }
  
  var updateLocalDb = function(path, hash) {
    var localdb = JSON.parse(fs.readFileSync(`${config.box.path}/.dtree.json`))

    var nodeIndex = _.findIndex(localdb.node[0].node, {
      name: nodePath.basename(path),
      type: 'file',
      checkSum: hash
    })
    if(nodeIndex < 0) {
      localdb.node[0].node.push({
        name: nodePath.basename(path),
        checkSum: hash,
        type: 'file'
      })
    }

    fs.writeFileSync(`${config.box.path}/.dtree.json`, JSON.stringify(localdb))
  }

  var updateLocalDb_delete = function(path) {
    var localdb = JSON.parse(fs.readFileSync(`${config.box.path}/.dtree.json`))
    var index = _.findIndex(localdb.node[0].node, {
      name: nodePath.basename(path),
      type: 'file'
    })
    if(index >= 0) {
     localdb.node[0].node.splice(index, 1);
    }

    fs.writeFileSync(`${config.box.path}/.dtree.json`, JSON.stringify(localdb))
  }

  var calFolderCheckSum = function(node) {

    var crypto = require('crypto');
    var hash = crypto.createHash('md5');

    node = _.sortBy(node, 'names');

    node.forEach(function(n, idx) {

      if(n.type == 'folder') {
        hash.update(n.checkSum)
      } else if(n.type == 'file') {
        hash.update(n.checkSum)
      }

    })

    return hash.digest('hex');
  }

  // expect flat
  var makeServerTree = function(files) {

    let nodes = [{
      name: 'Dripbox',
      type: 'folder',
      checkSum: 'd41d8cd98f00b204e9800998ecf8427e',
      node:[]
    }];

    try {
      files.forEach(function(f, idx) {
        let obj = {
          name: f.name,
          type: f.type,
          checkSum: f.version.checkSum
        }

        nodes[0].node.push(obj)
      })

      nodes[0].checkSum = calFolderCheckSum(nodes[0].node)
    } catch(e) {
      alert(e)
    } finally {
      return nodes;
    }

  }

//expect flat first 
  var compareServerNLocal = function(server, local) {
    alert('server' + JSON.stringify(server))
    alert('local' + JSON.stringify(local))
    try {
      //sort first
      if(server.length && local.length) {
        server = _.sortBy(server, 'name')
        local = _.sortBy(local, 'name')
      }

      let conflict = {
        server: [],
        local: []
      };
      //server search first: find obj that server has but local not
      server.forEach(function(s, sid){
        let searchIdx = _.findIndex(local, {
          name: server.name
        })

        if (searchIdx >= 0) {
          if(s.checkSum !== local[searchIdx].checkSum){
            if(s.type == 'file') {
              conflict.server.push(s)
            }
          }
        }
        else {
           if(s.type == 'file') {
          conflict.server.push(s)
        }
        }

      })

      return conflict;
    } catch(e) {
      alert(e)
    }
    
  }

  var checkDevice = function (MAC) {
    // create dripbox anyway
    mkdirp.sync(config.box.path);
    
    // update the localdb to the newest local
    
    // if new comer
    if (!fs.existsSync(`${config.box.path}/.dtree.json`)) {
      let info = {
         email: $scope.login.email, 
         node: [{
          name: 'Dripbox',
          type: 'folder',
          checkSum: 'd41d8cd98f00b204e9800998ecf8427e',
          node:[]
         }] 
      }
      fs.writeFileSync(`${config.box.path}/.dtree.json`, JSON.stringify(info))
    }


    // build the local tree (the folder can be built too!)
    try{
      var dirsum = require('dirsum');
      dirsum.digest(`${config.box.path}/`, 'md5', ['.dtree.json', '.DS_Store'], function(err, hashes) {
        if (err) throw err;
        var localdb = JSON.parse(fs.readFileSync(`${config.box.path}/.dtree.json`))
        if(localdb.node[0].checkSum !== hashes.hash) {
          localdb.node[0] = (makeLocalTree( config.box.path, hashes , localdb.node[0]))
        }

        localdb.node[0].checkSum = hashes.hash;
        fs.writeFileSync(`${config.box.path}/.dtree.json`, JSON.stringify(localdb));
      });
    } catch(e) {
      alert(JSON.stringify(e))
    }

    // pull the user tree from server
    
    new Promise(function(resolve, reject) {
      $http({
        method: 'GET',
        url: hosts.metadata + 'api/file'
      }).success(function (data) {
        resolve(data)
      }).error(function (data) {
        reject()
      })
    }).then(function(data){
      $scope.files = data;


      // alert(JSON.stringify(data));
      var localdb = JSON.parse(fs.readFileSync(`${config.box.path}/.dtree.json`)).node
      var serverdb = makeServerTree(data);

      alert(JSON.stringify(serverdb));

      let conflict = compareServerNLocal(serverdb, localdb);
      alert(JSON.stringify(conflict));

    })
    
    
    // start the watcher
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

      const fs = require('fs')
      const Promise = require('bluebird')
      const chokidar = require('chokidar')
      const md5File = require('md5-file')
      const watcher = chokidar.watch(config.box.path, {ignored: config.box.ignored, ignoreInitial: true})
      
      const eventLog = (event, path) => {
        console.log(event, path)
      }

      const addDirHandler = function (path) {}

      const unlinkDirHandler = function (path) {}

      const addHandler = function (path) {
        const hash = md5File(path)

        var localdb = JSON.parse(fs.readFileSync(`${config.box.path}/.dtree.json`))

        var data = _.find(localdb.node[0].node, {name: nodePath.basename(path)})
        if(data) {
          // alert(JSON.stringify(data))
        }

        if(!data || data.checkSum !== hash) {
          $http({
            method: 'POST',
            url: hosts.metadata + 'api/file',
            data: {
              name: nodePath.basename(path),
              checkSum: hash
            }
          }).success(function (data) {
            try{
              updateLocalDb(path, hash)

            } catch(e) {
              alert(e)
            }
            dataEngine.emit('upload', data, path)

            
          }).error(function (data) {
            if(data.error == 1202) {
              try{
                updateLocalDb(path, hash)
                
              } catch(e) {
                alert(e)
              }
            }
          })
        } 
      }

      const unlinkHandler = function (path) {
        const nodePath = require('path')

        $http({
          method: 'POST',
          url: hosts.metadata + 'api/file/delete',
          data: {
            name: nodePath.basename(path)
          }
        }).success(function (data) {
          updateLocalDb_delete(path)
          getFiles()
        }).error(function (data) {
          alert(data.message)
        })

      }

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

      watcher.on('ready', Promise.coroutine(function *(){
        
      }))

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
        email: $scope.login.email,
        checkSum: data.checkSum
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
      url: hosts.metadata + 'api/logout'
    }).success(function (data) {
      $scope.message = ''
      $rootScope.user = {}
      $rootScope.isLogin = false
    }).error(function (data) {
      $scope.message = data.message
    })
  }
}])


app.controller('registerCtrl', ['$scope', '$http', '$rootScope', function ($scope, $http, $rootScope) {
  $scope.registerData = {};
  $scope.pressRegisterButton = function() {
    $http({
      method: 'POST', 
      url: hosts.metadata + 'api/register',
      data: $scope.registerData
    }).success(function(data) {
      $scope.message = '註冊成功'
      window.location = 'index.html'
    }).error(function(data) {
      $scope.message = data.message || 'error'
    })
  }

}])
