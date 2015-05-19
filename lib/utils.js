exports.toMilliSeconds = toMilliSeconds;
function toMilliSeconds(time) {
    var d = time.split(/[:.]/),
        ms = 0;

    if (d.length === 4) {
        ms += parseInt(d[0], 10) * 3600 * 1000;
        ms += parseInt(d[1], 10) * 60 * 1000;
        ms += parseInt(d[2], 10) * 1000;
        ms += parseInt(d[3], 10) * 10;
    } else {
        ms += parseInt(d[0], 10) * 1000;
        ms += parseInt(d[1], 10);
    }

    return ms;
}

exports.findDuration = findDuration;
function findDuration(data) {
    var result = /duration: (\d+:\d+:\d+.\d+)/i.exec(data),
        duration;

    if (result && result[1]) {
        duration = toMilliSeconds(result[1]);
    }

    return duration;
}

exports.findTime = findTime;
function findTime(data) {
    var time;

    if (data.substring(0, 5) === 'frame') {
        var result = /time=(\d+.\d+)/i.exec(data);

        if (result && result[1]) {
            time = toMilliSeconds(result[1]);
        }
    }

    return time;
}

var
    VIDEO_META = {CODEC: 0, FORMAT: 1, RESOLUTION: 2, BITRATE: 3, FPS: 4},
    AUDIO_META = {CODEC: 0, SAMPLERATE: 1, SPATIALIZATION: 2, SAMPLEFORMAT: 3, BITRATE: 4};

exports.parseMetaData = parseMetaData;
function parseMetaData(output) {
    var
        meta = {input: {}, output: {}},
        streamIndex,
        streamData,
        metaType,
        metaData,
        tmp;

    function getInteger(v) {
        return parseInt(v, 10)
    }

    function getChannelCount(v) {
        if (v == "mono") return 1;
        if (v == "stereo") return 2;
        if (v.indexOf('.') != -1) {
            return v.split('.').map(getInteger)
                .reduce(function (a, b) {
                    return a + b
                });
        }
        return v;
    }

    // process lines
    output.split("\n").forEach(function (dataLine) {
        // get metadata type
        if (/^Input/i.test(dataLine))
            metaType = "input";
        else if (/^Output/i.test(dataLine))
            metaType = "output";
        else if (/^Stream mapping/i.test(dataLine))
            metaType = null;

        if (!metaType) return;
        metaData = meta[metaType];

        // is io meta data
        if (/^\s*Duration/.test(dataLine)) {
            dataLine
                .split(',')
                .map(function (d) {
                    return d.split(/:\s/)
                })
                .forEach(function (kv) {
                    metaData[kv[0].toLowerCase().trim()] = kv[1]
                });
            if (metaData.duration)
                metaData.duration = toMilliSeconds(metaData.duration);
            if (metaData.bitrate)
                metaData.bitrate = getInteger(metaData.bitrate);
            if (metaData.start)
                metaData.start = parseFloat(metaData.start);
        } else if (/^\s*Stream #/.test(dataLine)) { // is stream meta data
            // resolve stream indices
            tmp = dataLine.match(/#(\d+)\.(\d+)/);
            if (!tmp) return;
            streamIndex = tmp.slice(1).map(getInteger);

            // get or create stream structure
            if (!metaData.stream) metaData.stream = [];
            streamData = metaData.stream[streamIndex[0]] || (metaData.stream[streamIndex[0]] = []);
            streamData = streamData[streamIndex[1]] || (streamData[streamIndex[1]] = {});

            // get stream type
            tmp = dataLine.match(/video|audio/i);
            if (!tmp) return;
            streamData.type = tmp[0].toLowerCase();

            // prepare stream data
            tmp = dataLine.replace(/.*?(Video|Audio):/i, '').split(", ").map(function (v) {
                return v.replace(/[\[\(][^\]\)]*[\]\)]?/, '')
                    .trim().replace(/ [\w\/]+$/, '').trim();
            });

            // parse stream data
            if (streamData.type == "video") {
                streamData.codec = tmp[VIDEO_META.CODEC];
                streamData.format = tmp[VIDEO_META.FORMAT];
                streamData.resolution = tmp[VIDEO_META.RESOLUTION].split("x").map(getInteger);
                streamData.bitrate = getInteger(tmp[VIDEO_META.BITRATE + (metaType == "output" ? 1 : 0)]);
                if (metaType == "input")
                    streamData.fps = parseFloat(tmp[VIDEO_META.FPS]);
            } else if (streamData.type == "audio") {
                streamData.codec = tmp[AUDIO_META.CODEC];
                streamData.samplerate = getInteger(tmp[AUDIO_META.SAMPLERATE]);
                streamData.channels = getChannelCount(tmp[AUDIO_META.SPATIALIZATION]);
                streamData.sampleformat = tmp[AUDIO_META.SAMPLEFORMAT];
                streamData.bitrate = getInteger(tmp[AUDIO_META.BITRATE]);
            }
        }
    });
    return meta;
}
