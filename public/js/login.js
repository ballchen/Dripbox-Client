'use strict'

var Promise = require('bluebird')
var getMac = Promise.promisifyAll(require('getmac'))
var moment = require('moment')
var gui = require('nw.gui')
var mkdirp = require('mkdirp')
var config = require('./config')
var queue = require('./lib/queue').queue
var _ = require('lodash')
const exec = require('child_process').exec
const nodePath = require('path')
const fs = require('fs')
const md5File = require('md5-file')

// var mkBoxDir = require('../lib/basic').mkdir
var hosts = config.hosts

var app = angular.module('dpApp', ['ngFileUpload'])
app.controller('loginCtrl', ['$scope', '$http', '$rootScope', 'Upload', function ($scope, $http, $rootScope, Upload) {
  $scope.login = {
    email: 'kerkerball@gmail.com',
    password: '123456'
  }
  $scope.message = ''
  $scope.macAddress = null
  $scope.dataUploading = false

  // polling request
  var polling = function() {
    try {
      $http({
        method: 'GET',
        url: hosts.metadata + 'api/polling',
        timeout: 120000
      }).success(function (data) {
        alert(JSON.stringify(data));
        analyze(data)
        polling()

      }).error(function (data) {
        alert(JSON.stringify(data));
        polling()

      }) 
    } catch(e) {
      alert(e.stack)
    }
    
  } 

  var analyze = function(data) {
    if(data.action == 'create') {
      //download the file
      let data = {
        name: data.name,
        root: `${config.box.path}`,
        checkSum: data.checkSum
      }

      queue.create('sync_download', data).save()
      
    }

    else if(data.action == 'delete') {
      queue.create('sync_unlink', data).save()
    }
  }
    
  queue.process('upload', function (job, done) {

    try {
      let data = job.data
      const path = `${data.root}/${data.name}`
      let hash = md5File(path)
      $http({
        method: 'POST',
        url: hosts.metadata + 'api/file',
        data: {
          name: nodePath.basename(path),
          checkSum: hash
        }
      }).success(function(data) {
        let node = data.node.ops[0];
        node.version = data.version.ops[0];
        $scope.files.push(data.node.ops[0]);
        updateLocalDb(path, hash)
        dataEngine.emit('upload', data, path)
        done()
      }).error(function(data) {
        done(data)
      })
    } catch(e) {
      done(e)
    } finally {
      done()
    }
    

  })

  queue.process('download', function(job, done) {
    dataEngine.emit('download', job.data.name)
    done()
  })

   queue.process('sync_download', function(job, done) {
    updateLocalDb(`${job.data.root}/${job.data.name}`, job.data.name)
    dataEngine.emit('download', job.data.name)
    done()
  })


  queue.process('sync_unlink', function(job, done) {
    try{
      let data = job.data
      let path = `${config.box.path}/${data.file.name}`
      fs.unlinkSync(path)
      updateLocalDb_delete(path)
      getFiles()
      
    }
    catch(e) {
      done(e)
    } finally {
      done()
    }
    
  })

  queue.process('delete', function(job, done) {
    let path = job.data
    $http({
      method: 'POST',
      url: hosts.metadata + 'api/file/delete',
      data: {
        name: nodePath.basename(path)
      }
    }).success(function (data) {
      updateLocalDb_delete(path)
      getFiles()
      done()
    }).error(function (data) {
      // alert(data.message)
      done(data)
    })

  })

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

  dataEngine.on('download', function(file) {

    const request = require('request')
    let path = `${config.box.path}/${file}`;
    var streamFile = fs.createWriteStream(path);
    streamFile.on('finish', function(){
      getFiles()
    })

    request.post({url: hosts.data + 'api/download', form: {file: file}}).pipe(streamFile)
  })

  // data engine -- end
  
  var makeLocalTree = function(root, hashes, node) {
    _.each(hashes.files, function(f, key) {
      let path = root + '/' + key;
      let stats = fs.statSync(path);

      if (stats.isDirectory()) {
        let search = _.findIndex(node.node, {name: key, type: 'folder', checkSum: f});
        if(search >= 0) {
          node.node[search].checkSum = f.hash
        }
        else {
          node.node.push({
            //expect flat
            name: key, type: 'folder', checkSum: f.hash, node: []
          })
          // alert(JSON.stringify(hashes))
          node.node[node.node.length-1] = (makeLocalTree(path, hashes.files[key], node.node[node.node.length-1]))
        }
      }
      if (stats.isFile()) {
        let search = _.findIndex(node.node, {name: key, type: 'file', checkSum: f});
        if(search >= 0) {
          
          node.node[search].checkSum = f
        }
        else {
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
          checkSum: f.version.checkSum,
          uploaded: f.version.uploaded
        }

        nodes[0].node.push(obj)
      })

      nodes[0].checkSum = calFolderCheckSum(nodes[0].node)
    } catch(e) {
      alert(e.stack)
    } finally {
      return nodes;
    }

  }

  var findServer = function(server, local) {
    let server_conflict = [];
    server.forEach(function(s, sid){
      let searchIdx = _.findIndex(local, {
        name: s.name
      })

      if (searchIdx >= 0) {
        if(s.checkSum !== local[searchIdx].checkSum){
          if(s.type == 'file') {
            server_conflict.push(s)
          } 
          else if(s.type == 'folder') {
            server_conflict = server_conflict.concat(findServer(s.node, local[searchIdx].node));
          }
        }
      }
      else {
         if(s.type == 'file') {
          server_conflict.push(s)
        }
      }
    })

    return server_conflict;
  }

  var findUnUpdated = function(server, local) {
    let server_conflict = [];
    server.forEach(function(s, sid){
      let searchIdx = _.findIndex(local, {
        name: s.name
      })

      if (searchIdx >= 0) {
        if(s.checkSum !== local[searchIdx].checkSum){
          if(s.type == 'file') {
            
          } 
          else if(s.type == 'folder') {
            // server_conflict = server_conflict.concat(findServer(s.node, local[searchIdx].node));
          }
        }
        else if(s.checkSum == local[searchIdx].checkSum) {
          if(s.type == 'file' && s.uploaded == false) {
            server_conflict.push(s)
          } else if(s.type == 'folder') {
            server_conflict = server_conflict.concat(findUnUpdated(s.node, local[searchIdx].node));
          }
        }
      }
    })

    return server_conflict;
  }

//expect flat first 
  var compareServerNLocal = function(server, local) {
    let conflict = {
        server: [],
        local: [],
        unuploaded: [],
      };
    try {
      //sort first
      if(server.length && local.length) {
        server = _.sortBy(server, 'name')
        local = _.sortBy(local, 'name')
      }

      
      //server search first: find obj that server has but local not
      conflict.server = findServer(server, local);
      conflict.local = findServer(local, server);
      conflict.unuploaded = findUnUpdated(server, local);

      return conflict;
    } catch(e) {
      alert(e.stack)
    }
    
  }

  var createJob = function(tree, root, method) {
    tree.forEach(function(f, fid) {
      if(f.type == 'file') {
        let data = {
          name: f.name,
          root: root,
          checkSum: f.checkSum
        }
        queue.create(method, data).save()
      }

      if(f.type == 'folder') {
        mkdirp.sync(`${root}/${f.name}`)
        createJob(tree.node, `${root}/${f.name}`, method)
      }

    })
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
        var localdb = {
          email: $scope.login.email, 
          node: [{
            name: 'Dripbox',
            type: 'folder',
            checkSum: 'd41d8cd98f00b204e9800998ecf8427e',
            node:[]
          }] 
        }
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

      let conflict = compareServerNLocal(serverdb, localdb);
      // alert(JSON.stringify(conflict));

      //if server conflict -> download
      createJob(conflict.server, `${config.box.path}`, 'download')

      //if local conflict -> upload      
      createJob(conflict.local, `${config.box.path}`, 'upload')

      // then find the unuploaded file
      // find

    })

    //poll
    polling()

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

     

      const chokidar = require('chokidar')
      const watcher = chokidar.watch(config.box.path, {ignored: config.box.ignored, ignoreInitial: true})
      
      const eventLog = (event, path) => {
        console.log(event, path)
      }

      const addDirHandler = function (path) {}

      const unlinkDirHandler = function (path) {}

      const addHandler = function (path) {
        let hash = md5File(path)
         let data = {
          name: nodePath.basename(path),
          root: `${config.box.path}`,
          checkSum: hash
        }
        queue.create('upload', data).save()
      }

      const unlinkHandler = function (path) {
        queue.create('delete', path).save()
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
