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
    var retblob
    var pattern = [0xFF, 0xD8, 0xFF, 0xE1];
    var nOff = Math.floor(i_u8aDepth.length / 2);
    var dptsdr = patternsearch(i_u8aDepth, pattern, nOff);
    var dptjpg = null;
    if (dptsdr > 0) {
        dptjpg = i_u8aDepth.subarray(dptsdr, i_u8aDepth.length);
        pattern = [0x64, 0x65, 0x70, 0x74, 0x68];
        var dptcheck = patternsearch(dptjpg, pattern, 0);
        if (dptcheck == 0) dptjpg = null;
        else {
            retblob = new Blob([dptjpg], {
                type: 'application\/jpeg'
            });
        }
    }
    if (dptjpg == null) {
        // Pixel 2 depth extraction
        // Search for 'GDepth:Data="'
        pattern = [0x47, 0x44, 0x65, 0x70, 0x74, 0x68, 0x3a, 0x44, 0x61, 0x74, 0x61, 0x3d, 0x22];
        var dptsdr = patternsearch(i_u8aDepth, pattern, 0);
        if (dptsdr != 0) {
            dptsdr += pattern.length;
            var end = dptsdr;
            // Iterate through and find end quote
            while (++end < i_u8aDepth.length && i_u8aDepth[end] != 0x22) { }
            console.log("found pixel 2 depth data of size: " + (end - dptsdr) + " bytes")
            // Strip XMP headers (about every 64 bytes?)
            var bytebuf = i_u8aDepth.slice(dptsdr, end)
            findstr = [0xff, 0xe1, 0xff, 0xb4]
            var decoder = new TextDecoder()
            var base64_bytes = ""
            var ind = patternsearch(bytebuf, findstr, 0)
            var prev_ind = 0
            while (ind != 0) {
                base64_bytes += decoder.decode(bytebuf.slice(prev_ind, ind))
                console.log("found XMP header, appending slice from: " + prev_ind + " to: " + ind)
                // XMP header is 79 bytes
                prev_ind = ind + 79
                ind = patternsearch(bytebuf, findstr, prev_ind)
            }
            console.log("found XMP header, appending slice from: " + prev_ind + " to: " + ind)
            base64_bytes += decoder.decode(bytebuf.slice(prev_ind, end))
            retblob = base64toBlob(base64_bytes, "image/jpeg")
        }
    }
    return retblob;
}
