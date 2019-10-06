
const bintypes = {
    ARRAYBUFFER: 'arraybuffer',
    BLOB: 'blob'
}

class Req {
    constructor(url, bintype, timeout, socketRetryTimeout, resCallback, openCallback, logdivId='', debugMode=false) {
        this.inited = false;
        this.reqs = [];
        this.reps = [];
        this.timeoutMsecs = timeout * 1000;
        this.socketRetryTimeout = socketRetryTimeout * 1000;
        this.retryTimeout = 0;
        this.resCallback = resCallback;
        this.openCallback = openCallback;
        this.logdiv = logdivId;
        this.debug = debugMode;
        this.requestID = this.getRequestID();
        this.log("Initial request ID (should be 32 bit random with MSB=1): " + this.requestID);
        this.openConnection(url, bintype);
    }

    openConnection(url, bintype) {
        this.log("Opening socket at " + url);
        this.ws = new WebSocket(url, ['rep.sp.nanomsg.org']);
        this.ws.parent = this;
        this.ws.binaryType = bintype;
        this.ws.onmessage = this.wsOnmsg;
        this.ws.onopen = this.wsOnopen;
        this.ws.onerror = this.wsOnerr;
        this.ws.onclose = this.wsOnclose;
        clearTimeout(this.retryTimeout);
        this.retryTimeout = 0;
    }

    closeConnection()
    {
        this.log("Shutting down connection.");
        this.ws.close();
    }

    /* ws functions */
    wsOnmsg(event) {
        this.parent.processMsg(event.data);
    }
    wsOnerr(event) {
        this.parent.err("Socket error");
        this.parent.errorHandler(event);
    }
    wsOnclose(event) {
        this.parent.err("Socket closed");
        this.parent.errorHandler(event);
    }
    wsOnopen(event) {
        this.parent.inited = true;
        this.parent.info("Successfully opened socket");
	    this.parent.openCallback();
    }
    errorHandler(event) {
        this.parent.err("Error handler");
        this.parent.inited = false;
        // This is unimplemented, but it should try to reopen the socket with a timeout

        // TODO : fix this
        // if (this.retryTimeout == 0) {
        //     console.log(this);
        //     err("Retrying in " + this.socket_retry_timeout_msec + "ms...");
        //     this.retryTimeout = setTimeout(() => {
        //         req_reset(this);
        //     }, this.socket_retry_timeout_msec);
        // }
    
    }

    /* msg */
    sendMsg(data) {

        var reqObj = {
            payload: data,
            parent: this,
            id: this.requestID++,
            send: function () {
                // resend the same request once we hit timeout (if this value is too low, it may fail with large buffers)
                //
                if (!this.parent.inited) {
                    this.parent.err("tried to send with websocket closed");
                    return;
                }
                this.timeout = setTimeout(reqObj.send.bind(this), this.parent.timeoutMsecs);
                this.parent.log("attempting to send " + this.payload.byteLength + " bytes, request ID: " + this.id);
                // prepend NNG req header
                // format: https://github.com/nanomsg/nanomsg/blob/master/rfc/sp-request-reply-01.txt#L658
                var tmp = new Uint8Array(this.payload.byteLength + 4);
                var view = new DataView(tmp.buffer);
                view.setUint32(0, this.id);
                tmp.set(new Uint8Array(this.payload), 4);
                this.parent.ws.send(tmp.buffer);
            }
        };
        this.reqs.push(reqObj);
        reqObj.send();
    }

    processMsg(data) {
        if (data.byteLength < 4) {
            this.err("message too short");
            return;
        }
        var view = new DataView(data);
        var replyID = view.getUint32(0);
        if (replyID < 0x80000000) {
            this.err("bad nng header");
            return;
        }
        var i = 0;
        var found = false;
        for (i = 0; i < this.reqs.length; i++) {
            if (this.reqs[i].id == replyID) {
                found = true;
                break;
            }
        }
        if (!found) {
            this.err("got reply that doesn't match known request!");
        } else {
            // this.reqs[i] has been answered, don't resend it
            clearTimeout(this.reqs[i].timeout);
            // delete it from the buffer
            this.reqs.splice(i, 1);
            // save the reply to the reply buffer (need a way to return this asynchronously)
            var rep = {
                id: replyID,
                payload: data.slice(4)
            }
            this.log("got reply size: " + rep.payload.byteLength + ", matches ID " + rep.id);
            this.reps.push(rep);
            this.resCallback();
        }
    }


    /* logging functions */
    log(s) {
        if (this.debug) {
            document.getElementById(this.logdiv).innerHTML += ("<pre>" + s + "</pre>");
            console.log(s);
        }
    }
    err(s) {
        if (this.debug) {
            document.getElementById(this.logdiv).innerHTML += ("<pre style='color:#ff0000'>" + s + "</pre>");
            console.log(s);
        }
    }

    info(s) {
        if (this.debug) {
            document.getElementById(this.logdiv).innerHTML += ("<pre style='color:#0000ff'>" + s + "</pre>");
            console.log(s);
        }
    }

    /* helper functions */
    getRequestID() {
        return Math.floor(this.prng() * (0x7fffffff)) + 0x80000000;
    }

    prng() {
        if (this.rng == undefined) {
            this.log("Creating new RNG...");
            this.rng = generateRng();
        }
        return this.rng();
    }
}



function generateRng() {
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
    }
    function xoshiro128ss(a, b, c, d) {
        return (() => {
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
        })
    };
    var state = Date.now();
    var seed = xmur3(state.toString());
    return xoshiro128ss(seed(), seed(), seed(), seed());
}


