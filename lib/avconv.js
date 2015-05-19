"use strict";

var spawn    = require('child_process').spawn,
    util     = require('util'),

    AvStream = require('./avstream'),
    utils = require('./utils');

module.exports = function avconv(params) {
    var stream = new AvStream(),
        // todo: use a queue to deal with the spawn EMFILE exception
        // see http://www.runtime-era.com/2012/10/quick-and-dirty-nodejs-exec-limit-queue.html
        // currently I have added a dirty workaround on the server by increasing
        // the file max descriptor with 'sudo sysctl -w fs.file-max=100000'
        avconv = spawn('avconv', params || []);

    // General avconv output is always written into stderr
    if (avconv.stderr) {

        avconv.stderr.setEncoding('utf8');

        var output = '',
            duration,
            time,
            progress;

        avconv.stderr.on('data', function(data) {

            time = null;

            // Keep the output so that we can parse stuff anytime,
            // i.E. duration or meta data
            output += data;

            if (!duration) {
                duration = utils.findDuration(output);
            } else {
                time = utils.findTime(data);
            }

            if (duration && time) {
                progress = time / duration;

                if (progress > 1) {
                    progress = 1; // Fix floating point error
                }

                // Tell the world that progress is made
                stream.emit('progress', progress);
            }

            // Emit conversion information as messages
            stream.emit('message', data);
        });
    }

    // When avconv outputs anything to stdout, it's probably converted data
    if (avconv.stdout) {
        avconv.stdout.on('data', function(data) {
            stream.push(data)
        });
    }

    // Pipe the stream to avconv standard input
    if (avconv.stdin) {

        // Reduce overhead when receiving a pipe
        stream.on('pipe', function(source) {

            // Unpipe the source (input) stream from AvStream
            source.unpipe(stream);

            // And pipe it to avconv's stdin instead
            source.pipe(avconv.stdin);
        });

        // When data is written to AvStream, send it to avconv's stdin
        stream.on('inputData', function(data) {
            avconv.stdin.write(data);
        });
    }

    avconv.on('error', function(data) {
        stream.emit('error', data);
    });

    // New stdio api introduced the exit event not waiting for open pipes
    var eventType = avconv.stdio ? 'close' : 'exit';

    avconv.on(eventType, function(exitCode, signal) {
        stream.end();
        stream.emit('exit', exitCode, signal, utils.parseMetaData(output));
    });

    stream.kill = function() {
        avconv.kill();
    };

    return stream;
};
