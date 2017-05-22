var tmxTool = require('../index.js')
var path = require('path')

var srcFilePath = path.normalize(path.join(__dirname, './test.tmx'))
var tgtDir = path.normalize(path.join(__dirname, 'dest2/'))

console.log(tgtDir)

tmxTool.split({ 
    srcFilePath,
    savePath: tgtDir,
    mode: 2,
    fileNum: 3
}).then(function (res) {
    console.log(res)
})

