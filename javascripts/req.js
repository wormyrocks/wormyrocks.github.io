// global helper stuff
function str2ab(str, encoding) {
    var enc = new TextEncoder(encoding);
    return enc.encode(str).buffer;
}

function ab2str(buf, encoding) {
    var enc = new TextDecoder(encoding);
    return enc.decode(buf);
}

const bintypes = {
    ARRAYBUFFER: 'arraybuffer',
    BLOB: 'blob'
}

function err(s) {
    document.getElementById('logdiv').innerHTML += ("<pre style='color:#ff0000'>" + s + "</pre>");
    console.log(s);
}

function log(s) {
    document.getElementById('logdiv').innerHTML += ("<pre>" + s + "</pre>");
    console.log(s);
}

function info(s) {
    document.getElementById('logdiv').innerHTML += ("<pre style='color:#0000ff'>" + s + "</pre>");
    console.log(s);
}

function ws_onmsg(event) {
    this.parent.process_message(event.data);
}

function ws_onerr(event) {
    err("Socket error");
    this.parent.handle_err(event);
}

function ws_onclose(event) {
    err("Socket closed");
    this.parent.handle_err(event);
}

function ws_onopen(event) {
    this.parent.inited = true;
    log("Successfully opened socket");
}

function req_Open(url, bintype) {
    log("Opening socket at " + url);
    this.ws = new WebSocket(url, ['rep.sp.nanomsg.org']);
    this.ws.parent = this;
    this.ws.binaryType = bintype;
    this.ws.onmessage = this.onmsg;
    this.ws.onopen = this.onopen;
    this.ws.onerror = this.onerr;
    this.ws.onclose = this.onclose;
    clearTimeout(this.retryTimeout);
    this.retryTimeout = 0;
};

function prng() {
    if (this.rng == undefined) {
        log("Creating new RNG...");
        // https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript/47593316#47593316
        function xmur3(str) {
            for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
                h = Math.imul(h ^ str.charCodeAt(i), 3432918353),
                h = h << 13 | h >>> 19;
            return function () {
                h = Math.imul(h ^ h >>> 16, 2246822507);
                h = Math.imul(h ^ h >>> 13, 3266489909);
                return (h ^= h >>> 16) >>> 0;
            }
        };

        function xoshiro128ss(a, b, c, d) {
            return function () {
                var t = b << 9,
                    r = a * 5;
                r = (r << 7 | r >>> 25) * 9;
                c ^= a;
                d ^= b;
                b ^= c;
                a ^= d;
                c ^= t;
                d = d << 11 | d >>> 21;
                return (r >>> 0) / 4294967296;
            }
        };
        var state = Date.now();
        var seed = xmur3(state.toString());
        this.rng = xoshiro128ss(seed(), seed(), seed(), seed());
    }
    return this.rng();
}

function getRequestID() {
    return Math.floor(prng() * (0x7fffffff)) + 0x80000000;
}

function req_Process(data) {
    if (data.byteLength < 4) {
        err("message too short");
        return;
    }
    view = new DataView(data);
    replyID = view.getUint32(0);
    if (replyID < 0x80000000) {
        err("bad nng header");
        return;
    }
    var i = 0;
    var found = false;
    for (; i < this.reqs.length; i++) {
        if (this.reqs[i].id == replyID) {
            found = true;
            break;
        }
    }
    if (!found) {
        err("got reply that doesn't match known request!");
    } else {
        // this.reqs[i] has been answered, don't resend it
        clearTimeout(this.reqs[i].timeout);
        // delete it from the buffer
        this.reqs.splice(i, 1);
        // save the reply to the reply buffer (need a way to return this asynchronously)
        var rep = {
            id: replyID,
            payload: new Uint8Array(data, 4, data.byteLength - 4),
        }
        log("got reply size: " + rep.payload.byteLength + ", matches ID " + rep.id);
        this.reps.push(rep);
        this.responseCallback();
    }
}

function req_handleErr(event) {
    this.inited = false;
    // TODO : fix this
    // if (this.retryTimeout == 0) {
    //     console.log(this);
    //     err("Retrying in " + this.socket_retry_timeout_msec + "ms...");
    //     this.retryTimeout = setTimeout(() => {
    //         req_reset(this);
    //     }, this.socket_retry_timeout_msec);
    // }
}

function req_Send(data) {
    var req = {
        payload: data,
        parent: this,
        id: this.requestID++,
        send: function () {
            // resend the same request once we hit timeout (if this value is too low, it may fail with large buffers)
            if (!this.parent.inited) {
                err("tried to send with websocket closed");
                return;
            }
            this.timeout = setTimeout(req.send.bind(this), this.parent.timeout_msec);
            log("attempting to send " + this.payload.byteLength + " bytes, request ID: " + this.id);
            // prepend NNG req header
            // format: https://github.com/nanomsg/nanomsg/blob/master/rfc/sp-request-reply-01.txt#L658
            var tmp = new Uint8Array(this.payload.byteLength + 4);
            view = new DataView(tmp.buffer);
            view.setUint32(0, this.id);
            tmp.set(new Uint8Array(this.payload), 4);
            this.parent.ws.send(tmp.buffer);
        },
    };
    req.send();
    this.reqs.push(req);
}

//req0_sock_init
function Req(url, bintype, timeout_sec, socket_retry_timeout_sec, response_callback) {
    var reqobj = {
        requestID: 0,
        inited: false,
        reqs: [],
        reps: [],
        timeout_msec: timeout_sec * 1000,
        socket_retry_timeout_msec: socket_retry_timeout_sec * 1000,

        //native functions
        onmsg: ws_onmsg,
        onclose: ws_onclose,
        onerr: ws_onerr,
        onopen: ws_onopen,

        //stuff for retry
        retryTimeout: 0,
        args: arguments,

        //functions
        send: req_Send,
        process_message: req_Process, // TODO: async socket receive
        handle_err: req_handleErr,
        open: req_Open,
        getRequestId: getRequestID,
        responseCallback: response_callback
    }
    reqobj.requestID = reqobj.getRequestId();
    log("Initial request ID (should be 32 bit random with MSB=1): " + reqobj.requestID);
    reqobj.open(url, bintype);
    // TODO: wait until socket is open with no errors
    return reqobj;
}

function req_reset(r) {
    log("Retry");
    // TODO: figure out what to do with the req/rep buffers when the object gets reset
    r = new Req(...r.args);
}