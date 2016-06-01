var dirsum = require('dirsum')
dirsum.digest('Dripbox/', 'md5', ['.dtree.json', '.DS_Store'], function(err, hashes) {
  console.log(hashes)
})