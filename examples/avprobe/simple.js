var fs = require('fs');
var avs = require('../../');

var params = ['pipe:0'];

var stream = avs.avprobe(params);

//stream.on('error', function(data) {
//    console.log(data);
//});

stream.on('message', function(data) {
    console.log(data);
});

stream.on('exit', function(code, signal, meta) {
    console.log(JSON.stringify(meta));
});

fs.createReadStream('music.aac').pipe(stream);