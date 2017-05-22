var tmxTool = require('../index.js')
var path = require('path')

var srcFilePath = path.normalize(path.join(__dirname, './test.tmx'))
var tgtDir = path.normalize(path.join(__dirname, 'dest/'))

console.log(tgtDir)

tmxTool.split({ 
    srcFilePath,
    savePath: tgtDir,
    mode: 1,
    fileTuSize: 2
}).then(function (res) {
    console.log(res)
})

