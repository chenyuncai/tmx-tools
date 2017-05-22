let fs = require('fs')
let path = require('path')
let sax = require("sax")
const Q = require('q');

let instruction = {}
let tmxTagInfo = {}
let headerInfo = {}
let bodyInfo = {}

var xmlInstructionStr = '' // xml info
var tmxXmlStr = '' // tmx info
var headerXmlStr = '' // headerInfo 
var bodyXmlStr = '' // body info

let tmpTU = {};

let chunkSize = 1000; // 每片文件读取大小，读取越小，解析速度越快（原因是因为截取tu时的substring函数，性能瓶颈）
let deleteCharCount = 0;
let slice = [];

/**
 * options
 *  srcFilePath
 *  savePath
 *  mode
 *      1: 按tu条目分割
 *      2: 按要求的文件个数分割
 *  fileTuSize: default 2000
 *  fileNum
 * 
 *  Example:
 *  require('this module').split({
 *      srcFilePath: 'mySrcFile',
 *      savePath: 'myTgtPath',
 *      mode: 1,
 *      fileTuSize: 1000, (required if mode is 1)
 *      fileNum: 10 (required if mode is 2)
 *  })
 */
module.exports.split = function (options) {
    var deferred = Q.defer();
    var returnRes = {
        fileCount: 0,
        time: 0,
        msg: null
    }

    // TODO 检查参数
    if (!fs.existsSync(options.srcFilePath)) {
        returnRes.msg = '文件不存在'
        deferred.resolve(returnRes);
        return deferred.promise;
    }

    var start = new Date().getTime()
    let splitOptions = {
        srcFilePath: options.srcFilePath,
        currentFileIndex: 1,
        currentFileName: path.basename(options.srcFilePath),
        savePath: options.savePath,
        mode: options.mode || 1,
        fileTuSize: options.fileTuSize || 2000,
        currentFileTuSize: 0,

        fileNum: options.fileNum || 10,
        currentFileSize: 0,
        splitEachFileSize: 0
    }

    // 确保所选文件夹存在
    try {
        fs.mkdirSync(splitOptions.savePath)    
    } catch (error) {}

    // 创建解析器，设置处理逻辑
    var saxStream = sax.createStream(true, {})
    saxStream.on("error", function (e) {
        this._parser.error = null
        this._parser.resume()
    })
    saxStream.on("opentag", function (node) {
        var tagName = node.name
        var t = this;
        switch (tagName) {
            case 'tmx': tmxTagInfo = node; break;
            case 'header': headerInfo = node; break;
            case 'body': bodyDeal(node); break;
            case 'tu': tuStart(node); break;
        }
    })

    saxStream.on('closetag', function (tagName) {
        switch (tagName) {
            case 'tu': tuEnd(); break;
            case 'tmx': tmxEnd(); break;
        }
    })

    /**
     * xml 文件第一行命名空间等信息
     */
    saxStream.on('processinginstruction', function (introNode) {
        instruction = introNode
    })

    function bodyDeal (bodyNode) {
        /**
         * 当检测到body时，就开始准备两个文件
         * 1. tu 之前的数据信息，包括 xml, tmx, header and body
         * 2. 结尾的数据信息
         *      </body>
         *  </tmx>
         */

        xmlInstructionStr = '<?' + instruction.name + ' ' + instruction.body + '?>';
        tmxXmlStr = _generXmlFromNode(tmxTagInfo)
        headerXmlStr = _generXmlFromNode(headerInfo, 1)
        bodyXmlStr = _generXmlFromNode(bodyNode, 1)
        if(splitOptions.mode == 2) { // 如果是按文件个数存储，则需要计算每个文件
            var srcFileSize = fs.statSync(splitOptions.srcFilePath).size
            splitOptions.splitEachFileSize = Math.ceil(srcFileSize/splitOptions.fileNum)
        }
    }

    function tuStart(node) {
        tmpTU.segStart = saxStream._parser.startTagPosition
    }

    function tuEnd () {
        tmpTU.segEnd = saxStream._parser.position
        /**
         * 需要判断当前的首尾位置，是否在已读的且只存储的缓存字符串范围之内
         * 由于sax解析源是输入文件流，所以尾标签位置一定在范围内
         * 只需检查已去除的文字数量少于标签起点位置
         */
        var tuXmlStr = ''
        if (tmpTU.segStart >= deleteCharCount) {
            tuXmlStr = getIntent(2) + slice.join('').substring(tmpTU.segStart - 1 - deleteCharCount, tmpTU.segEnd - deleteCharCount)
        } else {
            // 应该报警，提醒错误，调高slice缓存片数量阀值
            console.log('')
        }

        // 计算应该存储到哪一个文件
        var destUrl = '';
        var needHeader = false;
        if (splitOptions.mode == 1) { // 按tu条目分割
            if (splitOptions.currentFileTuSize >= splitOptions.fileTuSize ) {
                splitOptions.currentFileTuSize = 0
                splitOptions.currentFileIndex = splitOptions.currentFileIndex + 1
            }
            needHeader = splitOptions.currentFileTuSize == 0
            splitOptions.currentFileTuSize = splitOptions.currentFileTuSize + 1
        } else if(splitOptions.mode == 2){ // 按文件个数分割
            // 如果当前文件大小已经超出平均每个文件大小，且不是最后一个文件，则准备写入到下一个文件，所以最后一个文件的size可能不是准确值
            if (splitOptions.currentFileSize >= splitOptions.splitEachFileSize && splitOptions.currentFileIndex <= splitOptions.fileNum) {
                splitOptions.currentFileSize = 0;
                splitOptions.currentFileIndex = splitOptions.currentFileIndex + 1
            }
            needHeader = splitOptions.currentFileSize == 0
        }
        destUrl = path.normalize(path.join(splitOptions.savePath, splitOptions.currentFileIndex + '-' +splitOptions.currentFileName))
        if(needHeader){
            returnRes.fileCount++;
            writeToFile(destUrl, xmlInstructionStr, true) // this is the first time to write conent into the file
            writeToFile(destUrl, tmxXmlStr)
            writeToFile(destUrl, headerXmlStr)
            writeToFile(destUrl, bodyXmlStr)
        }
        writeToFile(destUrl, tuXmlStr)

        if(splitOptions.mode == 2) {
            splitOptions.currentFileSize = fs.statSync(destUrl).size;
        }
    }

    function tmxEnd () {
        for (var i = 1; i <= splitOptions.currentFileIndex; i++) {
        var destUrl = path.normalize(path.join(splitOptions.savePath, i + '-' + splitOptions.currentFileName))
        writeToFile(destUrl, getIntent(1) + '</body>')
        writeToFile(destUrl, '</tmx>')
        }
        var end = new Date().getTime()
        returnRes.time = (end - start)/1000 + 's';
        deferred.resolve(returnRes);
    }

    /**
     * 速度与准确度平衡
     */
    if (!(options.level && !isNaN(options.level) && options.level >= 1 && options.level <= 10)) {
        options.level = 5;
    }
    chunkSize = { 1: 3000, 2: 2800, 3: 2600, 4: 2400, 5: 2000, 6: 1600, 7: 1400, 8: 1200, 9: 1000, 10: 800}[options.level]

    /**
     * 开始读取文件，并以流的形式读取到sax解析器
     */
    fs.createReadStream(splitOptions.srcFilePath, {
        highWaterMark: chunkSize,
        encoding: 'UTF-8'
    })
    .on('data', function(chunk) {
        // 会只保留两块分片备份数据
        if(slice.length > 3) {
            var deletedStr = slice.shift();
            deleteCharCount += deletedStr.length
        }
        slice.push(chunk)
    })
    .pipe(saxStream)

    /**
     * 待完善
     * 1. 文件编码问题: 统一将源文件转码成UTF-8处理
     * 2. 按tu条目数分割，直接解析，条目数达到要求后写入下一个文件
     * 3. 按文件个数分割，先计算总文件大小，然后计算平均每个文件应该存储多少字节，
     *    在写入每条tu时先检查当前文件打size，如果达到要求则写入下一个文件，
     *    如果是最后一个文件，则还是写入当前文件
     */

    return deferred.promise;
}

/**
 * options
 *  srcFilePath: tmx源文件路劲
 */
module.exports.countTU = function (options) {
    var deferred = Q.defer();
    var returnRes = {
        count: 0,
        time: 0,
        msg: null
    }
    console.log(__dirname)
    if (!fs.existsSync(options.srcFilePath)) {
        returnRes.msg = '文件不存在'
        deferred.resolve(returnRes);
        return deferred.promise;
    }
    var start = new Date().getTime()
    var saxStream = sax.createStream(true, {})
    saxStream.on("error", function (e) {
        this._parser.error = null
        this._parser.resume()
    })

    saxStream.on('closetag', function (tagName) {
        switch (tagName) {
            case 'tu': tuEnd(); break;
            case 'tmx': tmxEnd(); break;
        }
    })

    function tuEnd () {
        returnRes.count++;
    }

    function tmxEnd () {
        var end = new Date().getTime()
        returnRes.time = (end - start)/1000 + 's';
        deferred.resolve(returnRes);
    }

    fs.createReadStream(options.srcFilePath, { encoding: 'UTF-8'})
    .pipe(saxStream)

    return deferred.promise;
}


/**
 * 解析一个节点的名称，属性，并生成xml字符串
 */

function _generXmlFromNode (node, level) {
    var intentStr = getIntent(level)
    var xmlStr = []
    xmlStr.push(intentStr + '<' + node.name)
    for (var key in node.attributes) {
        xmlStr.push(key + '="' + node.attributes[key] + '"')
    }
    if (node.isSelfClosing) {
        xmlStr.push('/>')
    } else {
        xmlStr.push('>')
    }
    return xmlStr.join(' ')
}

// 获取缩进
function getIntent(level) {
    var intentStr = ''
    if (level && !isNaN(level)) {
        for (var i = 0; i < level; i++) {
            intentStr += '\t'
        }
    }
    return intentStr;
}

// 写入内容到文件
function writeToFile(url, content, directWrite) {
    if (directWrite) {
        fs.writeFileSync(url, content + '\r\n')
    } else {
        fs.appendFileSync(url, content + '\r\n')
    }
}



