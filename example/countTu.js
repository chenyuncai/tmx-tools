var tmxTool = require('../index.js')
var path = require('path')

var srcFilePath = path.normalize(path.join(__dirname, './test.tmx'))
console.log(srcFilePath)
tmxTool.countTU({ srcFilePath }).then(function (res) {
    console.log(res)
})

