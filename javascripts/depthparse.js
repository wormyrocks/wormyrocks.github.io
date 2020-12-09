function patternsearch(U8ABuf, U8APat, nOffset) {
    var nCur = nOffset;
    var result = 0;
    while (nCur <= U8ABuf.length - U8APat.length) {
        var add = 0;
        var mat = 1;
        for (var i = 0; i < U8APat.length; i++) {
            if (U8APat[0] == U8ABuf[nCur + i]) {
                add = i;
            }
            if (U8APat[i] != U8ABuf[nCur + i]) {
                mat = 0;
            }
            if (add != 0 && mat == 0) {
                break;
            }
        }
        if (mat == 1) {
            result = nCur;
            break;
        }
        if (add == 0) {
            add = U8APat.length;
        }
        nCur += add;
    }
    return result;
}
function base64toBlob(base64Data, contentType) {
    contentType = contentType || '';
    var sliceSize = 1024;
    var byteCharacters = atob(base64Data);
    var bytesLength = byteCharacters.length;
    var slicesCount = Math.ceil(bytesLength / sliceSize);
    var byteArrays = new Array(slicesCount);
    for (var sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
        var begin = sliceIndex * sliceSize;
        var end = Math.min(begin + sliceSize, bytesLength);

        var bytes = new Array(end - begin);
        for (var offset = begin, i = 0; offset < end; ++i, ++offset) {
            bytes[i] = byteCharacters[offset].charCodeAt(0);
        }
        byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    return new Blob(byteArrays, { type: contentType });
}

function depthtojpg(i_u8aDepth) {
    var blobs=[]
    var dptsdr = 0;
    var dptsdr2 = 0;
    var dptjpg=null;

    while(true){
	    dptsdr = patternsearch(i_u8aDepth, [0xff,0xd8,0xff], dptsdr+1);
	    dptsdr2 = patternsearch(i_u8aDepth, [0xff,0xd9], dptsdr+1);
	    if (dptsdr > 0) {
		    console.log("found header  at 0x"+dptsdr.toString(16)+" ("+dptsdr+")");
		    console.log("found trailer at 0x"+dptsdr2.toString(16)+" ("+dptsdr2+")");
		    dptjpg = i_u8aDepth.subarray(dptsdr, i_u8aDepth.length);
		    console.log("created depth image of size "+(dptsdr2-dptsdr)+" bytes.");
		    retblob = new Blob([dptjpg], { type: 'application\/jpeg' });
		    blobs.push(retblob);
	    } else { break; }
    }

        // Pixel 2 depth extraction
        // Search for 'GDepth:Data="'
        pattern = [0x47, 0x44, 0x65, 0x70, 0x74, 0x68, 0x3a, 0x44, 0x61, 0x74, 0x61, 0x3d, 0x22];
        var dptsdr = patternsearch(i_u8aDepth, pattern, 0);
while (true){
        if (dptsdr != 0) {
            dptsdr += pattern.length;
            var end = dptsdr;
            // Iterate through and find end quote
            while (++end < i_u8aDepth.length && i_u8aDepth[end] != 0x22) { }
            console.log("found GDepth data of size: " + (end - dptsdr) + " bytes")
            // Strip XMP headers (about every 64 bytes?)
            var bytebuf = i_u8aDepth.slice(dptsdr, end)
            findstr = [0x68, 0x74, 0x74, 0x70, 0x3a, 0x2f, 0x2f, 0x6e, 0x73, 0x2e, 0x61, 0x64, 0x6f, 0x62, 0x65, 0x2e, 0x63, 0x6f, 0x6d, 0x2f]
            var decoder = new TextDecoder()
            var base64_bytes = ""
            var ind = patternsearch(bytebuf, findstr, 0) - 4
            var prev_ind = 0
            while (ind != -4) {
                base64_bytes += decoder.decode(bytebuf.slice(prev_ind, ind))
                console.log("found XMP header, appending slice from: " + prev_ind + " to: " + ind)
                // XMP header is 79 bytes
                prev_ind = ind + 79
                ind = patternsearch(bytebuf, findstr, prev_ind) - 4
            }
            console.log("found XMP header, appending slice from: " + prev_ind + " to: " + end)
            base64_bytes += decoder.decode(bytebuf.slice(prev_ind, end))
	    //retblob = new Blob([base64_bytes],{type:"application/octet-stream"}); // dump raw
            blobs.push(base64toBlob(base64_bytes, "image/jpeg"))
        } else { break;}
}
    return blobs;
}
