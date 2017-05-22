# tmx-tools

This is an exact tools about dealing with tmx files with sax parser
We can use this package to count the tu num of a tmx file
And also split a tmx file into files accroding to your configuraton

## Install

```
npm install tmx-tools
```

## How to use

The only thing we need to do is requiring or importing it and send some required options

You can check on the example folder to look the details


```
var path = require('path')
var tmxTools = require('tmx-tools')

// try to use absolute file urls, because the parser don't know the relative uri when the folder level changed
var srcFilePath = path.normalize(path.join(__dirname, 'your file path'))
tmxTools.countTU({ srcFilePath }).then(function (res) {
    console.log(res)
})

```

## LICENSE

MIT