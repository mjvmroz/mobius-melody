// This code will make you cry. It was written in a mad 
// dash during Music Hack Day Boston 2012, and has
// quite a bit of hackage of the bad kind in it.

// Array[A].flatMap(A => Array[B]): Array[B]

Array.prototype.flatten = function() {
    this.reduce((a, e) => {
        return a.concat(e);
    })
};

var remixer;
var player;
var driver;
var track;
var W = 900, H = 680;
var paper;

// configs for chances to branch
var defaultMinRandomBranchChance = .18
var defaultMaxRandomBranchChance = .5

var defaultRandomBranchChanceDelta =.018;
var minRandomBranchChanceDelta =.000;
var maxRandomBranchChanceDelta =.200;

var highlightColor = "#0000ff";
var jumpHighlightColor = "#00ff22";
var selectColor = "#ff0000";
var uploadingAllowed = true;
var debugMode = true;
var fastMode = false;

var shifted = false;
var controlled = false;

var minTileWidth = 10;
var maxTileWidth = 90;
var growthPerPlay = 10;
var curGrowFactor = 1;


var jukeboxData = {
    infiniteMode:true,      // if true, allow branching
    maxBranches : 4,        // max branches allowed per beat
    maxBranchThreshold :80, // max allowed distance threshold

    computedThreshold: 0,   // computed best threshold
    currentThreshold: 0,    // current in-use max threshold
    addLastEdge: true,      // if true, optimize by adding a good last edge
    justBackwards: false,   // if true, only add backward branches
    justLongBranches: false,// if true, only add long branches
    removeSequentialBranches: false,// if true, remove consecutive branches of the same distance

    deletedEdgeCount: 0,    // number of edges that have been deleted

    lastBranchPoint : 0,    // last beat with a good branch
    longestReach : 0,       // longest looping secstion

    beatsPlayed:0,          // total number of beats played
    totalBeats : 0,         // total number of beats in the song
    branchCount: 0,         // total number of active branches

    selectedTile : null,    // current selected tile
    selectedCurve : null,   // current selected branch

    tiles: [],              // all of the tiles
    allEdges: [],           // all of the edges
    deletedEdges: [],       // edges that should be deleted

    minRandomBranchChance: 0,
    maxRandomBranchChance: 0,
    randomBranchChanceDelta: 0,
    curRandomBranchChance : 0,
    lastThreshold : 0,
};


// From Crockford, Douglas (2008-12-17). JavaScript: The Good Parts (Kindle Locations 734-736). Yahoo Press.

if (typeof Object.create !== 'function') { 
    Object.create = function (o) { 
        var F = function () {};
        F.prototype = o; 
        return new F(); 
    }; 
}


function info(s) {
    $("#info").text(s);
}


function error(s) {
    if (s.length == 0) {
        $("#error").hide();
    } else {
        $("#error").text(s);
        $("#error").show();
    }
}

function setDisplayMode(playMode) {
    if (playMode) {
        $("#song-div").hide();
        $("#select-track").hide();
        $("#running").show();
        $(".rotate").hide();
    } else {
        listPopularTracks();
        $("#song-div").show();
        $("#select-track").show();
        $("#running").hide();
        $(".rotate").show();
    } 
    info("");
}

function hideAll() {
    $("#song-div").hide();
    $("#select-track").hide();
    $("#running").hide();
    $(".rotate").hide();
}


function stop() {
    player.stop();
    player = remixer.getPlayer();
}

function createTiles(qtype) {
    return createTileCircle(qtype, 250);
}

function createTileCircle(qtype, radius) {
    var start = now();
    var y_padding = 90;
    var x_padding = 200;
    var maxWidth = 90;
    var tiles = [];
    var qlist = track.analysis[qtype];
    var n = qlist.length;
    var R = radius;
    var alpha = Math.PI * 2 / n;
    var perimeter = 2 * n * R * Math.sin(alpha/2);
    var a = perimeter / n;
    var width = a * 20;
    var angleOffset = - Math.PI / 2;
    // var angleOffset = 0;

    if (width > maxWidth) {
        width = maxWidth;
    }

    width = minTileWidth;

    paper.clear();

    var angle = angleOffset;
    for (var i = 0; i < qlist.length; i++) {
        var tile = createNewTile(i, qlist[i], a, width);
        var y = y_padding + R + R  * Math.sin(angle);
        var x = x_padding + R + R * Math.cos(angle);
        tile.move(x, y);
        tile.rotate(angle);
        tiles.push(tile);
        angle += alpha;
    }

    // now connect every tile to its neighbors

    // a horrible hack until I figure out 
    // geometry
    var roffset = width / 2;
    var yoffset = width * .52;
    var xoffset = width * 1;
    var center = ' S 450 350 '
    var branchCount = 0;
    R -= roffset;
    for (var i = 0; i < tiles.length; i++) {
        var startAngle = alpha * i + angleOffset;
        var tile = tiles[i];
        var y1 = y_padding + R + R * Math.sin(startAngle) + yoffset;
        var x1 = x_padding + R + R * Math.cos(startAngle) + xoffset;


        for (var j = 0; j < tile.q.neighbors.length; j++) {
            var destAngle = alpha * tile.q.neighbors[j].dest.which + angleOffset;
            var y2 = y_padding + R + R * Math.sin(destAngle) + yoffset;
            var x2 = x_padding + R + R * Math.cos(destAngle) + xoffset;

            var path = 'M' + x1 + ' ' + y1 + center + x2 + ' ' + y2;
            var curve = paper.path(path);
            curve.edge = tile.q.neighbors[j];
            addCurveClickHandler(curve);
            highlightCurve(curve, false, false);
            tile.q.neighbors[j].curve = curve;
            branchCount ++;
        }
    }
    jukeboxData.branchCount = branchCount;
    return tiles;
}

function addCurveClickHandler(curve) {
    curve.click( 
        function() {
            if (jukeboxData.selectedCurve) {
                highlightCurve(jukeboxData.selectedCurve, false, false);
            }
            selectCurve(curve, true);
            jukeboxData.selectedCurve = curve;
        });

    curve.mouseover(
        function() {
            highlightCurve(curve, true, false);
        }
    );

    curve.mouseout (
        function() {
            if (curve != jukeboxData.selectedCurve) {
                highlightCurve(curve, false, false);
            }
        }
    );
}

function highlightCurve(curve, enable, jump) {
    if (curve) {
        if (enable) {
            var color = jump ? jumpHighlightColor : highlightColor;
            curve.attr('stroke-width', 4);
            curve.attr('stroke', color);
            curve.attr('stroke-opacity', 1.0);
            curve.toFront();
        } else {
            if (curve.edge) {
                curve.attr('stroke-width', 3);
                curve.attr('stroke', curve.edge.src.tile.quantumColor);
                curve.attr('stroke-opacity', .7);
            }
        }
    }
}

function selectCurve(curve) {
    curve.attr('stroke-width', 6);
    curve.attr('stroke', selectColor);
    curve.attr('stroke-opacity', 1.0);
    curve.toFront();
}


function extractTitle(url) {
    var lastSlash = url.lastIndexOf('/');
    if (lastSlash >= 0 && lastSlash < url.length - 1) {
        var res =  url.substring(lastSlash + 1, url.length - 4);
        return res;
    } else {
        return url;
    }
}

function getTitle(title, artist, url) {
    if (title == undefined || title.length == 0 || title === '(unknown title)' || title == 'undefined') {
        if (url) {
            title = extractTitle(url);
        } else {
            title = null;
        }
    } else {
        if (artist !== '(unknown artist)') {
            title = title + ' by ' + artist;
        } 
    }
    return title;
}


function trackReady(t) {
    t.fixedTitle = getTitle(t.title, t.artist, t.info.url);
    document.title = 'Infinite Jukebox for ' + t.fixedTitle;
    $("#song-title").text(t.fixedTitle);
    jukeboxData.minLongBranch = track.analysis.beats.length / 5;
}


function readyToPlay(t) {
    setDisplayMode(true);
    driver = Driver(player);
    info("ready!");
    normalizeColor();
    trackReady(t);
    drawVisualization();
}

function drawVisualization() {
    if (track) {
        if (jukeboxData.currentThreshold == 0) {
            dynamicCalculateNearestNeighbors('beats');
        } else {
            calculateNearestNeighbors('beats', jukeboxData.currentThreshold);
        }
        createTilePanel('beats');
    }
}

function gotTheAnalysis(profile) {
    var status = get_status(profile);
    if (status == 'complete') {
        info("Loading track ...");
        remixer.remixTrack(profile.response.track, function(state, t, percent) {
            track = t;
            if (isNaN(percent)) {
                percent = 0;
            }
            if (state == 1) {
                info("Calculating pathways through the song ...");
                setTimeout( function() { readyToPlay(t); }, 10);
            } else if (state == 0) {
                if (percent >= 99) {
                    info("Calculating pathways through the song ...");
                } else {
                    if (percent > 0) {
                        info( percent  + "% of track loaded ");
                    } else {
                        info( "Loading the track ");
                    }
                }
            } else {
                info('Trouble  ' + t.status);
                setDisplayMode(false);
            }
        });
    } else if (status == 'error') {
        info("Sorry, couldn't analyze that track");
        setDisplayMode(false);
    }
}


function listSong(r) {
    var title = getTitle(r.title, r.artist, null);
    var item = null;
    if (title) {
        var item = $('<li>').append(title);

        item.attr('class', 'song-link');
        item.click(function() {
                showPlotPage(r.id);
            });
    } 
    return item;
}

function listSongAsAnchor(r) {
    var title = getTitle(r.title, r.artist, r.url);
    var item = $('<li>').html('<a href="index.html?trid=' + r.id + '">' + title + '</a>');
    return item;
}

function listTracks(active, tracks) {
    $('#song-div').show();
    $('#song-list').empty();
    $('.sel-list').removeClass('activated');
    $(active).addClass('activated');
    for (var i = 0; i < tracks.length; i++) {
        var s = tracks[i];
        var item = listSong(s);
        if (item) {
            $('#song-list').append(listSong(s));
        }
    }
}

function listPopularTracks() {
    listTracks('#popular-list', songs);
}

function listRecentTracks() {
    $.getJSON('recent_tracks', { count : 30}, function(data) {
        listTracks('#recent-list', data);
    });
}

function listTopUploadedTracks() {
    listTracks('#upload-list',  topUploadedSongs);
}

function analyzeAudio(audio, tag, callback) {
    var url = 'qanalyze'
    $.getJSON(url, { url:audio, tag:tag}, function(data) {
        if (data.status === 'done' || data.status === 'error') {
            callback(data);
        } else {
            info(data.status + ' - ready in about ' + data.estimated_wait + ' secs. ');
            setTimeout(function() { analyzeAudio(audio, tag, callback); }, 5000);
        } 
    });
}

// first see if it is in in S3 bucket, and if not, get the analysis from
// the labs server

function noCache() {
    return { "noCache" : now() }
}

function fetchAnalysis(trid) {
    var url = 'data/' + trid + '.json';
    info('Fetching the analysis');
    $.getJSON(url, function(data) { gotTheAnalysis(data); } )
        .error( function() { 
            info("Sorry, can't find info for that track");
        });
}

function get_status(data) {
    if (data.response.status.code == 0) {
        return data.response.track.status;
    } else {
        return 'error';
    }
}


function fetchSignature() {
    var url = 'policy'
    $.getJSON(url, {}, function(data) {
        policy = data.policy;
        signature = data.signature;
        $('#f-policy').val(data.policy);
        $('#f-signature').val(data.signature);
        $('#f-key').val(data.key);
    });
}


function calculateDim(numTiles, totalWidth, totalHeight) {
    var area = totalWidth * totalHeight;
    var tArea = area / (1.2 * numTiles);
    var dim = Math.floor(Math.sqrt(tArea));
    return dim;
}


var timbreWeight = 1, pitchWeight = 10, 
    loudStartWeight = 1, loudMaxWeight = 1, 
    durationWeight = 100, confidenceWeight = 1;

function get_seg_distances(seg1, seg2) {
    var timbre = seg_distance(seg1, seg2, 'timbre', true);
    var pitch = seg_distance(seg1, seg2, 'pitches');
    var sloudStart = Math.abs(seg1.loudness_start - seg2.loudness_start);
    var sloudMax = Math.abs(seg1.loudness_max - seg2.loudness_max);
    var duration = Math.abs(seg1.duration - seg2.duration);
    var confidence = Math.abs(seg1.confidence - seg2.confidence);
    var distance = timbre * timbreWeight + pitch * pitchWeight + 
        sloudStart * loudStartWeight + sloudMax * loudMaxWeight + 
        duration * durationWeight + confidence * confidenceWeight;
    return distance;
}

function dynamicCalculateNearestNeighbors(type) {
    var count = 0;
    var targetBranchCount =  track.analysis[type].length / 6;

    precalculateNearestNeighbors(type, jukeboxData.maxBranches, jukeboxData.maxBranchThreshold);

    for (var threshold = 10; threshold < jukeboxData.maxBranchThreshold; threshold += 5) {
        count = collectNearestNeighbors(type, threshold);
        if (count >= targetBranchCount) {
            break;
        }
    }
    jukeboxData.currentThreshold = jukeboxData.computedThreshold = threshold;
    postProcessNearestNeighbors(type);
    return count;
}

function postProcessNearestNeighbors(type) {
    removeDeletedEdges();

    if (jukeboxData.addLastEdge) {
        if (longestBackwardBranch(type) < 50) {
            insertBestBackwardBranch(type, jukeboxData.currentThreshold, 65);
        } else {
            insertBestBackwardBranch(type, jukeboxData.currentThreshold, 55);
        }
    }
    calculateReachability(type);
    jukeboxData.lastBranchPoint = findBestLastBeat(type);
    filterOutBadBranches(type, jukeboxData.lastBranchPoint);
    if (jukeboxData.removeSequentialBranches) {
        filterOutSequentialBranches(type);
    }
    setTunedURL();
}

function removeDeletedEdges() {
    for (var i = 0; i < jukeboxData.deletedEdges.length; i++) {
        var edgeID = jukeboxData.deletedEdges[i];
        if (edgeID in jukeboxData.allEdges) {
            var edge = jukeboxData.allEdges[edgeID];
            deleteEdge(edge);
        }
    }
    jukeboxData.deletedEdges = [];
}

function getAllDeletedEdgeIDs() {
    var results = [];
    for (var i = 0; i < jukeboxData.allEdges.length; i++) {
        var edge = jukeboxData.allEdges[i];
        if (edge.deleted) {
            results.push(edge.id);
        }
    }
    return results;
}

function getDeletedEdgeString() {
    var ids = getAllDeletedEdgeIDs();
    if (ids.length > 0) {
        return '&d=' + ids.join(',');
    } else {
        return "";
    }
}


function calculateNearestNeighbors(type, threshold) {
    precalculateNearestNeighbors(type, jukeboxData.maxBranches, jukeboxData.maxBranchThreshold);
    count = collectNearestNeighbors(type, threshold);
    postProcessNearestNeighbors(type, threshold);
    return count;
}


function resetTuning() {
    undeleteAllEdges();

    jukeboxData.addLastEdge = true;
    jukeboxData.justBackwards = false;
    jukeboxData.justLongBranches = false;
    jukeboxData.removeSequentialBranches = false;
    jukeboxData.currentThreshold = jukeboxData.computedThreshold;
    jukeboxData.minRandomBranchChance = defaultMinRandomBranchChance;
    jukeboxData.maxRandomBranchChance = defaultMaxRandomBranchChance;
    jukeboxData.randomBranchChanceDelta = defaultRandomBranchChanceDelta,

    jukeboxData.minRandomBranchChance = defaultMinRandomBranchChance;
    jukeboxData.maxRandomBranchChance = defaultMaxRandomBranchChance;
    jukeboxData.randomBranchChanceDelta = defaultRandomBranchChanceDelta;

    drawVisualization();
}


function undeleteAllEdges() {
    jukeboxData.allEdges.forEach(e => e.deleted = false);
}


function setTunedURL() {
    if (track) {
        var edges = getDeletedEdgeString();
        var addBranchParams = false;
        var lb = '';

        if (!jukeboxData.addLastEdge) {
            lb='&lb=0';
        }

        var p = '?trid=' + track.id + edges + lb;

        if (jukeboxData.justBackwards) {
            p += '&jb=1'
        }

        if (jukeboxData.justLongBranches) {
            p += '&lg=1'
        }

        if (jukeboxData.removeSequentialBranches) {
            p += '&sq=0'
        }

        if (jukeboxData.currentThreshold != jukeboxData.computedThreshold) {
            p +=  '&thresh=' + jukeboxData.currentThreshold;
        } 

        if (jukeboxData.minRandomBranchChance != defaultMinRandomBranchChance) {
            addBranchParams = true;
        }
        if (jukeboxData.maxRandomBranchChance != defaultMaxRandomBranchChance) {
            addBranchParams = true;
        }

        if (jukeboxData.randomBranchChanceDelta != defaultRandomBranchChanceDelta) {
            addBranchParams = true;
        }

        if (addBranchParams) {
            p += '&bp=' + [   
            Math.round(map_value_to_percent(jukeboxData.minRandomBranchChance, 0,1)),
            Math.round(map_value_to_percent(jukeboxData.maxRandomBranchChance, 0, 1)),
            Math.round(map_value_to_percent(jukeboxData.randomBranchChanceDelta, 
                                                minRandomBranchChanceDelta, maxRandomBranchChanceDelta))].join(',')
        }
        history.replaceState({}, document.title, p);
    }
}


function now() {
    return new Date().getTime();
}


// we want to find the best, long backwards branch
// and ensure that it is included in the graph to
// avoid short branching songs like:
// http://labs.echonest.com/Uploader/index.html?trid=TRVHPII13AFF43D495

function longestBackwardBranch(type) {
    var longest = 0
    var quanta = track.analysis[type];
    for (var i = 0; i < quanta.length; i++) {
        var q = quanta[i];
        for (var j = 0; j < q.neighbors.length; j++) {
            var neighbor = q.neighbors[j];
            var which = neighbor.dest.which;
            var delta = i - which;
            if (delta > longest) {
                longest = delta;
            }
        }
    }
    var lbb =  longest * 100 / quanta.length;
    return lbb;
}

function insertBestBackwardBranch(type, threshold, maxThreshold) {
    // var branches = track
    //     .analysis[type]
    //     .map((q, i) => q
    //         .all_neighbors
    //         .filter(n => !n.deleted
    //             && i - n.dest.which > 0 
    //             && n.distance < maxThreshold))
    //     .flatten()
    //     .sort((a, b) => a[0] - b[0])
    //     .reverse();
    
    // var best = branches[0];
    // var bestQ = best[3];
    // var bestNeighbor = best[4];
    // var bestThreshold = bestNeighbor.distance;
    // if (bestThreshold > threshold) {
    //     bestQ.neighbors.push(bestNeighbor);
    //     // console.log('added bbb from', bestQ.which, 'to', bestNeighbor.dest.which, 'thresh', bestThreshold);
    // }

    var found = false;
    var branches = [];
    var quanta = track.analysis[type];

    for (var i = 0; i < quanta.length; i++) {
        var q = quanta[i];
        for (var j = 0; j < q.all_neighbors.length; j++) {
            var neighbor = q.all_neighbors[j];

            if (neighbor.deleted) {
                continue;
            }

            var which = neighbor.dest.which;
            var thresh = neighbor.distance;
            var delta = i - which;
            if (delta > 0  &&  thresh < maxThreshold) {
                var percent = delta * 100 / quanta.length;
                var edge = [percent, i, which, q, neighbor]
                branches.push(edge);
            }
        }
    }

    if (branches.length === 0) {
        return;
    }

    branches.sort( 
        function(a,b) {
            return a[0] - b[0];
        }
    )
    branches.reverse();
    var best = branches[0];
    var bestQ = best[3];
    var bestNeighbor = best[4];
    var bestThreshold = bestNeighbor.distance;
    if (bestThreshold > threshold) {
        bestQ.neighbors.push(bestNeighbor);
        // console.log('added bbb from', bestQ.which, 'to', bestNeighbor.dest.which, 'thresh', bestThreshold);
    }
}

function calculateReachability(type) {
    var maxIter = 1000;
    var iter = 0;
    var quanta = track.analysis[type];

    for (var qi = 0; qi < quanta.length; qi++)  {
        var q = quanta[qi];
        q.reach = quanta.length - q.which;
    }

    for (iter = 0; iter < maxIter; iter++) {
        var changeCount = 0;
        for (qi = 0; qi < quanta.length; qi++)  {
            var q = quanta[qi];
            var changed = false;

            for (var i = 0; i < q.neighbors.length; i++) {
                var q2 = q.neighbors[i].dest;
                if (q2.reach > q.reach) {
                    q.reach = q2.reach;
                    changed = true;
                }
            }

            if (qi < quanta.length -1) {
                var q2 = quanta[qi +1];
                if (q2.reach > q.reach) {
                    q.reach = q2.reach;
                    changed = true;
                }
            }

            if (changed) {
                changeCount++;
                for (var j = 0; j < q.which; j++) {
                    var q2 = quanta[j];
                    if (q2.reach < q.reach) {
                        q2.reach = q.reach;
                    }
                }
            }
        }
        if (changeCount == 0) {
            break;
        }
    }

    if (false) {
        for (var qi = 0; qi < quanta.length; qi++)  {
            var q = quanta[qi];
            console.log(q.which, q.reach, Math.round(q.reach * 100 / quanta.length));
        }
    }
    // console.log('reachability map converged after ' + iter + ' iterations. total ' + quanta.length);
}


function map_percent_to_range(percent, min, max) {
    percent = clamp(percent, 0, 100);
    return (max - min) * percent / 100. + min;
}

function map_value_to_percent(value, min, max) {
    value = clamp(value, min, max);
    return 100 * (value - min) / (max - min);
}

function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
}


function findBestLastBeat(type) {
    var reachThreshold = 50;
    var quanta = track.analysis[type];
    var longest = 0;
    var longestReach = 0;
    for (var i = quanta.length -1; i >=0; i--) {
        var q = quanta[i];
        //var reach = q.reach * 100 / quanta.length;
        var distanceToEnd = quanta.length - i;

        // if q is the last quanta, then we can never go past it
        // which limits our reach

        var reach = (q.reach  - distanceToEnd) * 100 / quanta.length;

        if (reach > longestReach && q.neighbors.length > 0) {
            longestReach = reach;
            longest = i;
            if (reach >= reachThreshold) {
                break;
            }
        }
    }
    // console.log('NBest last beat is', longest, 'reach', longestReach, reach);

    jukeboxData.totalBeats = quanta.length;
    jukeboxData.longestReach = longestReach;
    return longest
}

function filterOutBadBranches(type, lastIndex) {
    var quanta = track.analysis[type];
    for (var i = 0; i < lastIndex; i++) {
        var q = quanta[i];
        var newList = [];
        for (var j = 0; j < q.neighbors.length; j++) {
            var neighbor = q.neighbors[j];
            if (neighbor.dest.which < lastIndex) {
                newList.push(neighbor);
            } else {
                 // console.log('filtered out arc from', q.which, 'to', neighbor.dest.which);
            }
        }
        q.neighbors = newList;
    }
}

function hasSequentialBranch(q, neighbor) {
    if (q.which ===  jukeboxData.lastBranchPoint) {
        return false;
    }

    var qp = q.prev;
    if (qp) {
        var distance = q.which - neighbor.dest.which;
        for (var i = 0; i < qp.neighbors.length; i++) {
            var odistance = qp.which - qp.neighbors[i].dest.which;
            if (distance == odistance) {
                return true;
            }
        }
    } 
    return false;
}

function filterOutSequentialBranches(type) {
    var quanta = track.analysis[type];
    for (var i = quanta.length - 1; i >= 1; i--) {
        var q = quanta[i];
        var newList = [];

        for (var j = 0; j < q.neighbors.length; j++) {
            var neighbor = q.neighbors[j];
            if (hasSequentialBranch(q, neighbor)) {
                // skip it
            } else {
                newList.push(neighbor);
            }
        }
        q.neighbors = newList;
    }
}

function calculateNearestNeighborsForQuantum(type, maxNeighbors, maxThreshold, q1) {
    var edges = [];
    var id = 0;
    for (var i = 0; i < track.analysis[type].length; i++) {

        if (i === q1.which) {
            continue;
        }

        var q2 = track.analysis[type][i];
        var sum = 0;
        for (var j = 0; j < q1.overlappingSegments.length; j++) {
            var seg1 = q1.overlappingSegments[j];
            var distance = 100;
            if (j < q2.overlappingSegments.length) {
                var seg2 = q2.overlappingSegments[j];
                // some segments can overlap many quantums,
                // we don't want this self segue, so give them a
                // high distance
                if (seg1.which === seg2.which) {
                    distance = 100
                } else {
                    distance = get_seg_distances(seg1, seg2);
                }
            } 
            sum += distance;
        }
        var pdistance = q1.indexInParent == q2.indexInParent ? 0 : 100;
        var totalDistance = sum / q1.overlappingSegments.length + pdistance;
        if (totalDistance < maxThreshold) {
            var edge = { 
                id : id,
                src : q1,
                dest : q2,
                distance : totalDistance,
                curve : null,
                deleted: false
            };
            edges.push( edge );
            id++;
        }
    }

    edges.sort( 
        function(a,b) {
            a.distance - b.distance
        }
    );

    q1.all_neighbors = [];
    for (i = 0; i < maxNeighbors && i < edges.length; i++) {
        var edge = edges[i];
        q1.all_neighbors.push(edge);

        edge.id = jukeboxData.allEdges.length;
        jukeboxData.allEdges.push(edge);
    }
}


function precalculateNearestNeighbors(type, maxNeighbors, maxThreshold) {
    // skip if this is already done 
    if ('all_neighbors' in track.analysis[type][0]) {
        return;
    }
    jukeboxData.allEdges = [];
    for (var qi = 0; qi < track.analysis[type].length; qi++)  {
        var q1 = track.analysis[type][qi];
        calculateNearestNeighborsForQuantum(type, maxNeighbors, maxThreshold, q1);
    }
}

/*
    Beware. Here be side-effects.
*/
function collectNearestNeighbors(type, maxThreshold) {
    return track
        .analysis[type]
        .map(q => {
            var ns = extractNearestNeighbors(q, maxThreshold);
            q.neighbors = ns; // Gotta sort this shit out somehow ;_;
            return ns;
        })
        .filter(ns => ns.length)
        .length;
}


function extractNearestNeighbors(q, maxThreshold) {
    return q.all_neighbors.filter((n) => !n.deleted
        && !(jukeboxData.justBackwards && n.dest.which > q.which)
        && !(jukeboxData.justLongBranches && Math.abs(n.dest.which - q.which) < jukeboxData.minLongBranch)
        && n.distance <= maxThreshold);
}

function seg_distance(seg1, seg2, field, weighted) {
    return (weighted
        ? weighted_euclidean_distance
        : euclidean_distance)(seg1[field], seg2[field]);
}

function calcBranchInfo(type) {
    var histogram = {}
    var total = 0;
    for (var qi = 0; qi < track.analysis[type].length; qi++)  {
        var q = track.analysis[type][qi];
        for (var i = 0; i < q.neighbors.length; i++) {
            var neighbor = q.neighbors[i];
            var distance = neighbor.distance;
            var bucket = Math.round(distance / 10);
            if (! (bucket in histogram)) {
                histogram[bucket] = 0;
            }
            histogram[bucket] +=1;
            total += 1;
        }
    }
    console.log(histogram);
    console.log('total branches', total);
}


function euclidean_distance(v1, v2) {
    var sum = 0;

    for (var i = 0; i < v1.length; i++) {
        var delta = v2[i] - v1[i];
        sum += delta * delta;
    }
    return Math.sqrt(sum);
}

function weighted_euclidean_distance(v1, v2) {
    var sum = 0;

    //for (var i = 0; i < 4; i++) {
    for (var i = 0; i < v1.length; i++) {
        var delta = v2[i] - v1[i];
        //var weight = 1.0 / ( i + 1.0);
        var weight = 1.0;
        sum += delta * delta * weight;
    }
    return Math.sqrt(sum);
}

function redrawTiles() {
    _.each(jukeboxData.tiles, function(tile) {
       var newWidth = Math.round( (minTileWidth + tile.playCount * growthPerPlay) * curGrowFactor);
       if (newWidth < 1) {
            newWidth = 1;
       }
       tile.rect.attr('width', newWidth);
    });
}

var tilePrototype = {
    normalColor:"#5f9",

    move: function(x,y)  {
        this.rect.attr( { x:x, y:y});
        if (this.label) {
            this.label.attr( { x:x + 2, y: y + 8});
        }
    },

    rotate: function(angle)  {
        var dangle = 360 * (angle / (Math.PI * 2));
        this.rect.transform('r' +  dangle);
    },

    play:function(force) {
        if (force || shifted) {
            this.playStyle(true);
            player.play(0, this.q);
        } else if (controlled) {
            this.queueStyle();
            player.queue(this.q);
        } else {
            this.selectStyle();
        }
        if (force) {
            info("Selected tile " + this.q.which);
            jukeboxData.selectedTile = this;
        }
    },



    selectStyle: function() {
        this.rect.attr("fill", "#C9a");
    },

    queueStyle: function() {
        this.rect.attr("fill", "#aFF");
    },

    pauseStyle: function() {
        this.rect.attr("fill", "#F8F");
    },

    playStyle: function(didJump) {
       if (!this.isPlaying) {
           this.isPlaying = true;
           if (!this.isScaled) {
               this.isScaled = true;
               this.rect.attr('width', maxTileWidth);
           }
           this.rect.toFront();
           this.rect.attr("fill", highlightColor);
           highlightCurves(this, true, didJump);
        }
    },


    normal: function() {
       this.rect.attr("fill", this.normalColor);
       if (this.isScaled) {
           this.isScaled = false;
           //this.rect.scale(1/1.5, 1/1.5);
           var newWidth = Math.round( (minTileWidth + this.playCount * growthPerPlay) * curGrowFactor);
           if (newWidth < 1) {
                newWidth = 1;
           }
           if (newWidth > 90) {
                curGrowFactor /= 2;
                redrawTiles();
           } else {
               this.rect.attr('width', newWidth);
           }
       }
       highlightCurves(this, false, false);
       this.isPlaying = false;
    },

    init:function() {
        var that = this;

        this.rect.mouseover( function(event) {
            that.playStyle(false);
            if (debugMode) {
                if (that.q.which > jukeboxData.lastBranchPoint) {
                    $("#beats").text( that.q.which + ' ' + that.q.reach  +  '*');
                } else {
                    var qlength = track.analysis.beats.length;
                    var distanceToEnd = qlength  - that.q.which;
                    $("#beats").text( that.q.which + ' ' + that.q.reach  
                        +  ' ' + Math.floor((that.q.reach - distanceToEnd) * 100 / qlength));
                }
            }
            event.preventDefault();
        });

        this.rect.mouseout( function(event) {
            that.normal();
            event.preventDefault();
        });

        this.rect.mousedown(function(event) { 
            event.preventDefault();
            driver.setNextTile(that);
            if (!driver.isRunning()) {
                driver.start();
            } 
            if (controlled) {
                driver.setIncr(0);
            }
        });
    }
}

function highlightCurves(tile, enable, didJump) {
    for (var i = 0; i < tile.q.neighbors.length; i++) {
        var curve = tile.q.neighbors[i].curve;
        highlightCurve(curve, enable, didJump);
        if (driver.isRunning()) {
            break; // just highlight the first one
        }
    }
}

function getQuantumColor(q) {
    if (isSegment(q)) {
        return getSegmentColor(q);
    } else {
        q = getQuantumSegment(q);
        if (q != null) {
            return getSegmentColor(q);
        } else {
            return "#000";
        }
    }
}

function getQuantumSegment(q) {
    return q.oseg;
}


function isSegment(q) {
    return 'timbre' in q;
}

function getBranchColor(q) {
    if (q.neighbors.length == 0) {
        return to_rgb(0, 0, 0);
    } else {
        var red = q.neighbors.length / jukeboxData.maxBranches;
        var color = to_rgb(red, 0, (1. - red));
        return color;
    }
}

function createNewTile(which, q, height, width) {
    var padding = 0;
    var tile = Object.create(tilePrototype);
    tile.which = which;
    tile.width = width;
    tile.height =  height;
    tile.branchColor = getBranchColor(q);
    tile.quantumColor = getQuantumColor(q);
    tile.normalColor = tile.quantumColor;
    tile.isPlaying = false;
    tile.isScaled = false;
    tile.playCount = 0;

    tile.rect = paper.rect(0, 0, tile.width, tile.height);
    tile.rect.attr("stroke", tile.normalColor);
    tile.rect.attr('stroke-width', 0);
    tile.q = q;
    tile.init();
    q.tile = tile;
    tile.normal();
    return tile;
}


function createTilePanel(which) {
    removeAllTiles();
    jukeboxData.tiles = createTiles(which);
}

function normalizeColor() {
    cmin = [100,100,100];
    cmax = [-100,-100,-100];

    var qlist = track.analysis.segments;
    for (var i = 0; i < qlist.length; i++) {
        for (var j = 0; j < 3; j++) {
            var t = qlist[i].timbre[j + 1];

            if (t < cmin[j]) {
                cmin[j] = t;
            }
            if (t > cmax[j]) {
                cmax[j] = t;
            }
        }
    }
}

function getSegmentColor(seg) {
    var results = []
    for (var i = 0; i < 3; i++) {
        var t = seg.timbre[i + 1];
        var norm = (t - cmin[i]) / (cmax[i] - cmin[i]);
        results[i] = norm * 255;
        results[i] = norm;
    }
    return to_rgb(results[1], results[2], results[0]);
    //return to_rgb(results[0], results[1], results[2]);
}

function convert(value) { 
    var integer = Math.round(value);
    var str = Number(integer).toString(16); 
    return str.length == 1 ? "0" + str : str; 
};

function to_rgb(r, g, b) { 
    return "#" + convert(r * 255) + convert(g * 255) + convert(b * 255); 
}

function removeAllTiles() {
    for (var i =0; i < jukeboxData.tiles.length; i++) {
        jukeboxData.tiles[i].rect.remove();
    }
    jukeboxData.tiles = [];
}

function deleteEdge(edge) {
    if (!edge.deleted) {
        jukeboxData.deletedEdgeCount++;
        edge.deleted = true;
        if (edge.curve) {
            edge.curve.remove();
            edge.curve = null;
        }
        for (var j = 0; j < edge.src.neighbors.length; j++) {
            var otherEdge = edge.src.neighbors[j];
            if (edge == otherEdge) {
                edge.src.neighbors.splice(j, 1);
                break;
            }
        }
    }
}

function keydown(evt) {
    if ( ! $("#running").is(":visible")) {
        return;
    }

    if (evt.which == 39) {  // right arrow
        var inc = driver.getIncr();
        driver.setIncr(inc + 1);
        evt.preventDefault();
    }

    if (evt.which == 8 || evt.which == 46) {     // backspace / delete
        evt.preventDefault();
        if (jukeboxData.selectedCurve) {
            deleteEdge(jukeboxData.selectedCurve.edge);
            jukeboxData.selectedCurve = null;
            drawVisualization();
        }
    }

    if (evt.which == 37) {  // left arrow
        evt.preventDefault();
        var inc = driver.getIncr();
        driver.setIncr(inc - 1);
    }

    if (evt.which == 38 ) {  // up arrow
        driver.setIncr(1);
        evt.preventDefault();
    }

    if (evt.which == 40  ) {  // down arrow
        driver.setIncr(0);
        evt.preventDefault();
    }


    if (evt.which == 17) {
        controlled = true;
    }

    if (evt.which == 72) {
        jukeboxData.infiniteMode = !jukeboxData.infiniteMode;
        if (jukeboxData.infiniteMode) {
            info("Infinite Mode enabled");
        } else {
            info("Bringing it on home");
        }
    }

    if (evt.which == 16) {
        shifted = true;
    }

    if (evt.which == 32) {
        evt.preventDefault();
        if (driver.isRunning()) {
            driver.stop();
        } else {
            driver.start();
        }
    }

}

function isDigit(key) {
    return key >= 48 && key <= 57;
}

function keyup(evt) {
    if (evt.which == 17) {
        controlled = false;
    }
    if (evt.which == 16) {
        shifted = false;
    }
}

function searchForTrack() {
    console.log("search for a track");
    var q = $("#search-text").val();
    console.log(q);

    if (q.length > 0) {
        var url = 'search'
        $.getJSON(url, { q:q, results:30}, function(data) {
            console.log(data);
            for (var i = 0; i < data.length; i++) {
                data[i].id = data[i].trid;
            }
            listTracks('#search-list', data);
        });
    }
}


function init() {
    window.oncontextmenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    };

    document.ondblclick = function DoubleClick(event) {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }

    $(document).keydown(keydown);
    $(document).keyup(keyup);

    paper = Raphael("tiles", W, H);

    $("#error").hide();


    $("#load").click(
        function() {
            if (!uploadingAllowed) {
                alert("Sorry, uploading is temporarily disabled, while we are under heavy load");
            } else {
                location.href = "loader.html";
            }
        }
    );

    $("#go").click(
        function() {
            if (driver.isRunning()) {
                driver.stop();
            } else {
                driver.start();
            }
        }
    );

    $("#search").click(searchForTrack);
    $("#search-text").keyup(function(e) {
        if (e.keyCode == 13) {
            searchForTrack();
        }
    });

    $("#new").click(
        function() {
            if (driver) {
                driver.stop();
            }
            setDisplayMode(false);
            listPopularTracks();
        }
    );

    $("#tune").click(
        function() {
            var controls = $("#controls");
            controls.dialog('open');
        }
    );

    $("#controls").attr("visibility", "visible");
    $("#controls").dialog(
        {
            autoOpen: false,
            title: "Fine tune your endless song",
            width: 350,
            position: [4,4],
            resizable:false,
        }
    );

    $("#reset-edges").click(
        function() {
            resetTuning();
        }
    );

    $("#last-branch").change(
        function(event) {
            if (event.originalEvent) {
                jukeboxData.addLastEdge = $('#last-branch').is(':checked');
                drawVisualization();
            }
        }
    );

    $("#reverse-branch").change(
        function(event) {
            if (event.originalEvent) {
                jukeboxData.justBackwards = $('#reverse-branch').is(':checked');
                drawVisualization();
            }
        }
    );

    $("#long-branch").change(
        function(event) {
            if (event.originalEvent) {
                jukeboxData.justLongBranches = $('#long-branch').is(':checked');
                drawVisualization();
            }
        }
    );

    $("#sequential-branch").change(
        function(event) {
            if (event.originalEvent) {
                jukeboxData.removeSequentialBranches = $('#sequential-branch').is(':checked');
                drawVisualization();
            }
        }
    );

    $( "#threshold-slider" ).slider( {
            max: 80, 
            min: 2, 
            step: 1, 
            value:30,
            change: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.currentThreshold = ui.value;
                    drawVisualization();
                }
            },

            slide: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.currentThreshold = ui.value;
                }
            }

        }
    );

    $( "#probability-slider" ).slider( {
            max: 100, 
            min: 0, 
            range:true,
            step: 1, 
            values:[ 
                 Math.round(defaultMinRandomBranchChance * 100),
                Math.round(defaultMaxRandomBranchChance * 100)
            ],
            change: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.minRandomBranchChance = ui.values[0] / 100.;
                    jukeboxData.maxRandomBranchChance = ui.values[1] / 100.;
                    setTunedURL();
                }
            },

            slide: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.minRandomBranchChance = ui.values[0] / 100.;
                    jukeboxData.maxRandomBranchChance = ui.values[1] / 100.;
                }
            }
        }
    );

    $( "#probability-ramp-slider" ).slider( {
            max: 100, 
            min: 0, 
            step: 2, 
            value:30,
            change: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.randomBranchChanceDelta =
                        map_percent_to_range(ui.value, minRandomBranchChanceDelta, maxRandomBranchChanceDelta)
                    setTunedURL();
                }
            },

            slide: function(event, ui) {
                if (event.originalEvent) {
                    jukeboxData.randomBranchChanceDelta =
                        map_percent_to_range(ui.value, minRandomBranchChanceDelta, maxRandomBranchChanceDelta)
                }
            }
        }
    );

    watch(jukeboxData, 'addLastEdge', 
        function() {
            $("#last-branch").attr('checked', jukeboxData.addLastEdge);
            setTunedURL();
        }
    );

    watch(jukeboxData, 'justBackwards', 
        function() {
            $("#reverse-branch").attr('checked', jukeboxData.justBackwards);
            setTunedURL();
        }
    );

    watch(jukeboxData, 'justLongBranches', 
        function() {
            $("#long-branch").attr('checked', jukeboxData.justLongBranches);
            setTunedURL();
        }
    );

    watch(jukeboxData, 'removeSequentialBranches', 
        function() {
            $("#sequential-branch").attr('checked', jukeboxData.removeSequentialBranches);
            setTunedURL();
        }
    );

    watch(jukeboxData, 'currentThreshold', 
        function() {
            $("#threshold").text(jukeboxData.currentThreshold);
            $("#threshold-slider").slider("value", jukeboxData.currentThreshold);
        }
    );

    watch(jukeboxData, 'lastThreshold', 
        function() {
            $("#last-threshold").text(Math.round(jukeboxData.lastThreshold));
        }
    );

    watch(jukeboxData, 'minRandomBranchChance', 
        function() {
            $("#min-prob").text(Math.round(jukeboxData.minRandomBranchChance * 100));
            $("#probability-slider").slider("values", 
                [jukeboxData.minRandomBranchChance * 100, jukeboxData.maxRandomBranchChance * 100]);
            jukeboxData.curRandomBranchChance = clamp(jukeboxData.curRandomBranchChance, 
                        jukeboxData.minRandomBranchChance, jukeboxData.maxRandomBranchChance);
        }
    );

    watch(jukeboxData, 'maxRandomBranchChance', 
        function() {
            $("#max-prob").text(Math.round(jukeboxData.maxRandomBranchChance * 100));
            $("#probability-slider").slider("values", 
                [jukeboxData.minRandomBranchChance * 100, jukeboxData.maxRandomBranchChance * 100]);
            jukeboxData.curRandomBranchChance = clamp(jukeboxData.curRandomBranchChance, 
                        jukeboxData.minRandomBranchChance, jukeboxData.maxRandomBranchChance);
        }
    );

    watch(jukeboxData, 'curRandomBranchChance', 
        function() {
            $("#branch-chance").text(Math.round(jukeboxData.curRandomBranchChance * 100));
        }
    );

    watch(jukeboxData, 'randomBranchChanceDelta', 
        function() {
            var val = Math.round(map_value_to_percent(jukeboxData.randomBranchChanceDelta, 
                    minRandomBranchChanceDelta, maxRandomBranchChanceDelta));
            $("#ramp-speed").text(val);
            $("#probabiltiy-ramp-slider").slider("value", val);
        }
    );

    watch(jukeboxData, 'totalBeats',
        function() {
            $("#total-beats").text(jukeboxData.totalBeats);
        }
    );

    watch(jukeboxData, 'branchCount',
        function() {
            $("#branch-count").text(jukeboxData.branchCount);
        }
    );

    watch(jukeboxData, 'deletedEdgeCount',
        function() {
            $("#deleted-branches").text(jukeboxData.deletedEdgeCount);
        }
    );

    watch(jukeboxData, 'longestReach',
        function() {
            $("#loop-length-percent").text(Math.round(jukeboxData.longestReach));
            var loopBeats = Math.round(jukeboxData.longestReach * jukeboxData.totalBeats / 100);
            $("#loop-length-beats").text(Math.round(loopBeats));
            $("#total-beats").text(jukeboxData.totalBeats);
        }
    );

    $("#popular-list").click(listPopularTracks);
    $("#recent-list").click(listRecentTracks);
    $("#upload-list").click(listTopUploadedTracks);


    jukeboxData.minRandomBranchChance = defaultMinRandomBranchChance;
    jukeboxData.maxRandomBranchChance = defaultMaxRandomBranchChance;
    jukeboxData.randomBranchChanceDelta = defaultRandomBranchChanceDelta;


    var context = getAudioContext();
    if (context == null) {
        error("Sorry, this app needs advanced web audio. Your browser doesn't"
            + " support it. Try the latest version of Chrome or Safari");

        hideAll();

    } else {
        remixer = createJRemixer(context, $);
        player = remixer.getPlayer();
        processParams();
    }
}

function getAudioContext() {
    var context = null;
    if (typeof AudioContext !== "undefined") {
        context = new AudioContext();
    } else if (typeof webkitAudioContext !== "undefined") {
        context = new webkitAudioContext();
    } 
    return context;
}

function Driver(player) {
    var curTile = null;
    var curOp = null;
    var incr = 1;
    var nextTile = null;
    var bounceSeed = null;
    var bounceCount = 0;
    var nextTime = 0;
    var lateCounter = 0;
    var lateLimit = 4;

    var beatDiv = $("#beats");
    // var playcountDiv = $("#playcount");
    var timeDiv = $("#time");

    function next() {
        if (curTile == null || curTile == undefined) {
            return jukeboxData.tiles[0];
        } else {
            var nextIndex;
            if (shifted) {
                if (bounceSeed === null) {
                    bounceSeed = curTile;
                    bounceCount = 0;
                }
                if (bounceCount++ % 2 === 1) {
                    return selectNextNeighbor(bounceSeed);
                } else {
                    return bounceSeed;
                }
            } if (controlled) {
                return curTile;
            } else {
                if (bounceSeed != null) {
                    var nextTile = bounceSeed;
                    bounceSeed = null;
                    return nextTile;
                } else {
                    nextIndex = curTile.which + incr
                }
            }

            if (nextIndex < 0) {
                return jukeboxData.tiles[0];
            } else if  (nextIndex >= jukeboxData.tiles.length) {
                curOp = null;
                player.stop();
            } else {
                return selectRandomNextTile(jukeboxData.tiles[nextIndex]);
            }
        }
    }

    function selectRandomNextTile(seed) {
        if (seed.q.neighbors.length == 0) {
            return seed;
        } else if (shouldRandomBranch(seed.q)) {
            var next = seed.q.neighbors.shift();
            jukeboxData.lastThreshold = next.distance;
            seed.q.neighbors.push(next);
            var tile = next.dest.tile;
            return tile;
        } else {
            return seed;
        }
    }

    function selectRandomNextTileNew(seed) {
        if (seed.q.neighbors.length == 0) {
            return seed;
        } else if (shouldRandomBranch(seed.q)) {
            var start = window.performance.now();
            var tc = findLeastPlayedNeighbor(seed, 5);
            var tile = tc[0];
            var score = tc[1];
            var delta = window.performance.now() - start;
            //console.log('lhd ', seed.which, tile.which, score, delta);
            return tile;
        } else {
            return seed;
        }
    }

    /**
     * we look for the path to the tile that will bring
     * us to the least played tile in the future (we look
     * at lookAhead beats into the future
     */
    function findLeastPlayedNeighbor(seed, lookAhead) {
        var nextTiles = [];

        if (seed.q.which != jukeboxData.lastBranchPoint) {
            nextTiles.push(seed);
        }
        seed.q.neighbors.forEach(   
            function(edge, which) {
                var tile = edge.dest.tile;
                nextTiles.push(tile);
            }
        );

        nextTiles = _.shuffle(nextTiles);

        if (lookAhead == 0) {
            var minTile = null;
            nextTiles.forEach(function(tile) {
                if (minTile == null || tile.playCount < minTile.playCount) {
                    minTile = tile;
                }
            });
            return [minTile, minTile.playCount];
        } else {
            var minTile = null;
            nextTiles.forEach(function(tile) {
                var futureTile = findLeastPlayedNeighbor(tile, lookAhead - 1);
                if (minTile == null || futureTile[1] <  minTile[1]) {
                    minTile = futureTile;
                }
            });
            return minTile;
        }
    }

    function selectNextNeighbor(seed) {
        if (seed.q.neighbors.length == 0) {
            return seed;
        } else {
            var next = seed.q.neighbors.shift();
            seed.q.neighbors.push(next);
            var tile = next.dest.tile;
            return tile;
        } 
    }

    function shouldRandomBranch(q) {
        if (jukeboxData.infiniteMode) {
            if (q.which == jukeboxData.lastBranchPoint) {
                return true;
            }

            // return true; // TEST, remove

            jukeboxData.curRandomBranchChance += jukeboxData.randomBranchChanceDelta;
            if (jukeboxData.curRandomBranchChance > jukeboxData.maxRandomBranchChance) {
                jukeboxData.curRandomBranchChance = jukeboxData.maxRandomBranchChance;
            }
            var shouldBranch = Math.random() < jukeboxData.curRandomBranchChance;
            if (shouldBranch) {
                jukeboxData.curRandomBranchChance = jukeboxData.minRandomBranchChance;
            }
            return shouldBranch;
        } else {
            return false;
        }
    }

    function updateStats() {
        beatDiv.text(jukeboxData.beatsPlayed);
        timeDiv.text(secondsToTime((now() - startTime) / 1000.));
    }


    function process() {
        if (curTile !== null && curTile !== undefined) {
            curTile.normal();
        }

        if (curOp) {
            var lastTile = curTile;
            if (nextTile != null) {
                curTile = nextTile;
                nextTile = null;
            } else {
                curTile = curOp();
            }

            if (curTile) {
                var ctime = player.curTime();
                // if we are consistently late we should shutdown
                if (ctime > nextTime) {
                    lateCounter++;
                    if (lateCounter++ > lateLimit && windowHidden()) {
                        info("Sorry, can't play music properly in the background");
                        interface.stop();
                        return;
                    }
                } else {    
                    lateCounter = 0;
                }

                nextTime = player.play(nextTime, curTile.q);

                if (fastMode) {
                     nextTime = 0; // set to zero for speedup sim mode
                }
                curTile.playCount += 1;

                var delta = nextTime - ctime;
                setTimeout( function () { process(); }, 1000 * delta  - 10);

                var didJump = false;
                if (lastTile && lastTile.which != curTile.which - 1) {
                    didJump = true;
                }

                curTile.playStyle(didJump);
                jukeboxData.beatsPlayed += 1;
                updateStats();
            }
        } else {
            if (curTile != null) {
                curTile.normal();
            }
        }
    }

    function resetPlayCounts() {
        jukeboxData.tiles.forEach(t => t.playCount = 0);
        curGrowFactor = 1;
        redrawTiles();
    }

    var startTime = 0;
    var interface = {
        start: function() {
            jukeboxData.beatsPlayed = 0;
            nextTime = 0;
            bounceSeed = null;
            jukeboxData.infiniteMode = true;
            jukeboxData.curRandomBranchChance = jukeboxData.minRandomBranchChance;
            lateCounter = 0;
            curOp = next;
            startTime = now();
            $("#go").text('Stop');
            error("");
            info("");
            resetPlayCounts();
            process();
        },

        stop: function() {
            var delta = now() - startTime;
            $("#go").text('Play');
            if (curTile) {
                curTile.normal();
                curTile = null;
            }
            curOp = null;
            bounceSeed = null;
            incr = 1;
            player.stop();
        },

        isRunning: function() {
            return curOp !== null;
        },

        getIncr: function() {
            return incr;
        },

        getCurTile : function() {
            return curTile;
        },

        setIncr: function(inc) {
            incr = inc;
        }, 

        setNextTile: function(tile) {
            nextTile = tile;
        },
    }
    return interface;
}

function secondsToTime(secs) {
    secs = Math.floor(secs);
    var hours = Math.floor(secs / 3600);
    secs -= hours * 3600;
    var mins = Math.floor(secs/60);
    secs -= mins * 60;

    if (hours < 10) {
        hours = '0' + hours;
    }
    if (mins < 10) {
        mins = '0' + mins;
    }
    if (secs < 10) {
        secs = '0' + secs;
    }
    return hours + ":" + mins + ":" + secs
}

function windowHidden() {
    return document.webkitHidden;
}

function processParams() {
    var params = {};
    var q = document.URL.split('?')[1];
    if(q != undefined){
        q = q.split('&');
        for(var i = 0; i < q.length; i++){
            var pv = q[i].split('=');
            var p = pv[0];
            var v = pv[1];
            params[p] = v;
        }
    }

    if ('trid' in params) {
        var trid = params['trid'];
        var thresh = 0;
        if ('thresh' in params) {
            jukeboxData.currentThreshold = parseInt(params['thresh']);
        }
        if ('d' in params) {
            var df = params['d'].split(',');
            for (var i = 0; i < df.length; i++) {
                var id = parseInt(df[i]);
                jukeboxData.deletedEdges.push(id);
            }
        }
        if ('lb' in params) {
            if (params['lb'] == '0') {
                jukeboxData.addLastEdge = true;
            }
        }

        if ('jb' in params) {
            if (params['jb'] == '1') {
                jukeboxData.justBackwards = true;
            }
        }

        if ('lg' in params) {
            if (params['lg'] == '1') {
                jukeboxData.justLongBranches = true;
            }
        }

        if ('sq' in params) {
            if (params['sq'] == '0') {
                jukeboxData.removeSequentialBranches = true;
            }
        }

        if ('bp' in params) {
            var bp = params['bp'];
            var fields = bp.split(',');
            if (fields.length === 3) {
                var minRange = parseInt(fields[0]);
                var maxRange = parseInt(fields[1]);
                var delta = parseInt(fields[2]);

                jukeboxData.minRandomBranchChance = map_percent_to_range(minRange, 0, 1);
                jukeboxData.maxRandomBranchChance = map_percent_to_range(maxRange, 0, 1);
                jukeboxData.randomBranchChanceDelta = 
                    map_percent_to_range(delta, minRandomBranchChanceDelta, maxRandomBranchChanceDelta);

            }
        }
        setDisplayMode(true);
        fetchAnalysis(trid);
    } else if ('key' in params) {
        var url = 'http://' + params['bucket'] + '/' + urldecode(params['key']);
        info("analyzing audio");
        setDisplayMode(true);
        $("#select-track").hide();
        analyzeAudio(url, 'tag', 
            function(data) {
                if (data.status === 'done') {
                    showPlotPage(data.trid);
                } else {
                    info("Trouble analyzing that track " + data.message);
                }
            }
        );
    }
    else {
        setDisplayMode(false);
    }
}

function showPlotPage(trid) {
    var url = location.protocol + "//" + 
                location.host + location.pathname + "?trid=" + trid;
    location.href = url;
}

function urldecode(str) {
   return decodeURIComponent((str+'').replace(/\+/g, '%20'));
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function isTuned(url) {
    return url.indexOf('&') > 0;
}


window.onload = init;