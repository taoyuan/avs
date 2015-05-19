"use strict";

var spawn    = require('child_process').spawn,
    util     = require('util'),

    AvStream = require('./avstream'),
    utils = require('./utils');

module.exports = function avprobe(params) {
    var stream = new AvStream(),
    // todo: use a queue to deal with the spawn EMFILE exception
    // see http://www.runtime-era.com/2012/10/quick-and-dirty-nodejs-exec-limit-queue.html
    // currently I have added a dirty workaround on the server by increasing
    // the file max descriptor with 'sudo sysctl -w fs.file-max=100000'
        avprobe = spawn('avprobe', params || []);

    // General avprobe output is always written into stderr
    if (avprobe.stderr) {

        avprobe.stderr.setEncoding('utf8');

        var output = '',
            duration,
            time,
            progress;

        avprobe.stderr.on('data', function(data) {

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

    // When avprobe outputs anything to stdout, it's probably converted data
    if (avprobe.stdout) {
        avprobe.stdout.on('data', function(data) {
            stream.push(data);
        });

        avprobe.stdout.on('error', function(err) {
            // Ignore EPIPE error
            if (err.code === 'EPIPE') return;
            stream.emit('error', err);
        });

    }

    // Pipe the stream to avprobe standard input
    if (avprobe.stdin) {

        avprobe.stdin.on('error', function(err) {
            // Ignore EPIPE error
            if (err.code === 'EPIPE') return;
            stream.emit('error', err);
        });

        // Reduce overhead when receiving a pipe
        stream.on('pipe', function(source) {

            // Unpipe the source (input) stream from AvStream
            source.unpipe(stream);

            // And pipe it to avprobe's stdin instead
            source.pipe(avprobe.stdin);
        });

        // When data is written to AvStream, send it to avprobe's stdin
        stream.on('inputData', function(data) {
            avprobe.stdin.write(data);
        });
    }

    avprobe.on('error', function(data) {
        stream.emit('error', data);
    });

    // New stdio api introduced the exit event not waiting for open pipes
    var eventType = avprobe.stdio ? 'close' : 'exit';

    avprobe.on(eventType, function(exitCode, signal) {
        console.log('exit');
        stream.end();
        stream.emit('exit', exitCode, signal, utils.parseMetaData(output));
    });

    stream.kill = function() {
        avprobe.kill();
    };

    return stream;
};
